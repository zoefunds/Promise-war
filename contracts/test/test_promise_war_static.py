"""Static safety checks that do not require a running GenVM/StudioNet
instance — `from genlayer import *` at the top of the contract can only be
resolved inside GenVM's sandboxed runtime, not via pip, so these tests
parse the contract's AST rather than importing and executing it. This
mirrors the pattern used by promise-to-proof-registry's own test suite
(the contract this one explicitly builds on).

Run with: pytest contracts/test/test_promise_war_static.py
"""

import ast
from pathlib import Path

CONTRACT = Path(__file__).parents[1] / "promise_war_contract.py"
SOURCE = CONTRACT.read_text()
TREE = ast.parse(SOURCE)


def _contract_class() -> ast.ClassDef:
    classes = [n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == "PromiseWar"]
    assert len(classes) == 1, "Exactly one Intelligent Contract class is required"
    return classes[0]


def _public_methods() -> list[ast.FunctionDef]:
    contract = _contract_class()
    methods = []
    for node in contract.body:
        if not isinstance(node, ast.FunctionDef):
            continue
        decorators = [ast.unparse(d) for d in node.decorator_list]
        if any(d.startswith("gl.public.") for d in decorators):
            methods.append(node)
    return methods


def test_source_parses_and_has_one_contract_class():
    assert _contract_class().name == "PromiseWar"


def test_every_gen_transfer_uses_the_single_payout_chokepoint():
    # The audit's "single transfer choke point" finding — verify it holds,
    # don't just assert it in a docstring.
    assert SOURCE.count("emit_transfer(") == 1
    assert "def _send_gen(" in SOURCE


def test_all_public_methods_have_primitive_schema_types():
    # Matches what get_contract_schema() actually returned when checked
    # against the live deployment: every method uses str/bool/int/None or
    # the storage-layer u256 alias — never a dataclass, dict, or list.
    allowed = {"str", "bool", "int", "None", "u256"}
    public_methods = []
    for node in _public_methods():
        public_methods.append(node.name)
        for arg in node.args.args[1:]:
            assert ast.unparse(arg.annotation) in allowed, f"{node.name}.{arg.arg} is not schema-safe"
        ret = ast.unparse(node.returns) if node.returns else "None"
        assert ret in allowed, f"{node.name} return type {ret!r} is not schema-safe"
    for expected in ("create_claim", "submit_evidence", "request_adjudication", "settle_claim_sides", "withdraw"):
        assert expected in public_methods


def test_persistent_collections_are_genvm_safe():
    contract = _contract_class()
    annotations = {
        node.target.id: ast.unparse(node.annotation)
        for node in contract.body
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
    }
    for name, ann in annotations.items():
        if "TreeMap" in ann or "DynArray" in ann:
            assert "dict" not in ann and "list" not in ann and "Dict" not in ann and "List" not in ann, (
                f"{name}: {ann} is not a GenVM-safe storage type"
            )


def test_collection_fields_are_left_to_genvm_zero_initialization():
    # Explicitly assigning a fresh TreeMap()/DynArray() in __init__ has
    # been a known GenVM footgun in the reference contracts this project
    # builds on ("TreeMap <- TreeMap" rejection) — verify __init__ never
    # does it for any TreeMap/DynArray-typed field.
    contract = _contract_class()
    init = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "__init__")
    init_source = ast.unparse(init)
    assert "= TreeMap(" not in init_source
    assert "= TreeMap[" not in init_source
    assert "= DynArray(" not in init_source
    assert "= DynArray[" not in init_source


# ---- Regression tests for the audit's 5 blocking findings -------------------


def test_settle_claim_evidence_no_longer_sends_pool_share_to_treasury_twice():
    # Blocker #2: the aggregate slash split now lives entirely in
    # settle_claim_evidence(); claim_evidence_payout() must never touch
    # accrued_treasury_wei at all (that was the double-credit bug).
    contract = _contract_class()
    payout_fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "claim_evidence_payout")
    assert "accrued_treasury_wei" not in ast.unparse(payout_fn)

    settle_fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "settle_claim_evidence")
    settle_src = ast.unparse(settle_fn)
    assert "evidence_slash_pool_wei" in settle_src
    assert "accrued_treasury_wei" in settle_src


def test_claim_side_payout_has_dust_accounting_and_winning_side_bonus():
    # Blocker #1 (dust) + Blocker #2 (pool redistribution), both land in
    # claim_side_payout().
    contract = _contract_class()
    fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "claim_side_payout")
    src = ast.unparse(fn)
    assert "side_claimed_stake_wei" in src and "side_distributed_wei" in src, "dust-absorption ledger missing"
    assert "evidence_slash_pool_wei" in src, "winning-side bonus pool not read"


def test_submit_evidence_accepts_not_yet_verifiable_claims():
    # Blocker #3: a NOT_YET_VERIFIABLE claim must be re-openable for new
    # evidence, not just described as such in a docstring.
    contract = _contract_class()
    fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "submit_evidence")
    src = ast.unparse(fn)
    assert "STATUS_NOT_YET_VERIFIABLE" in src


def test_request_adjudication_extends_evidence_deadline_on_not_yet_verifiable():
    # The other half of blocker #3 — reopening evidence submission is
    # pointless if the deadline that just passed isn't pushed forward.
    contract = _contract_class()
    fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "request_adjudication")
    src = ast.unparse(fn)
    assert "claim.evidence_deadline_ts = " in src


def test_normalize_url_enforces_https_and_blocks_private_hosts():
    # Blocker #4: HTTPS-only plus a literal SSRF-target blocklist.
    assert 'u.startswith("https://")' in SOURCE
    assert "_BLOCKED_URL_HOSTS" in SOURCE
    assert "169.254.169.254" in SOURCE  # cloud metadata endpoint


def test_cancel_claim_gates_on_any_third_party_participation():
    # Blocker #5: must reject once ANY other address has staked either
    # side or submitted evidence — not just once CHALLENGE/evidence exist,
    # which missed a second SUPPORT staker.
    contract = _contract_class()
    fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "cancel_claim")
    src = ast.unparse(fn)
    assert "third_party_joined" in src

    apply_stake_fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "_apply_side_stake")
    assert "third_party_joined = True" in ast.unparse(apply_stake_fn)

    submit_evidence_fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "submit_evidence")
    assert "third_party_joined = True" in ast.unparse(submit_evidence_fn)


def test_settle_claim_evidence_rejects_not_yet_verifiable():
    # Second-round audit finding: settle_claim_evidence() must be
    # unreachable while a claim is NOT_YET_VERIFIABLE, since that status is
    # explicitly reopenable — evidence submitted after a "final" settlement
    # would have its slash permanently unaccounted for. Only a decisive
    # verdict or CLAIM_INVALID is actually terminal for this purpose.
    contract = _contract_class()
    fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "settle_claim_evidence")
    src = ast.unparse(fn)
    assert "DECISIVE_VERDICTS" in src
    assert "VERDICT_CLAIM_INVALID" in src
    # The guard must appear as a _require call, not merely be referenced in
    # a comment/docstring — check it's inside an actual assert-like call.
    require_calls = [ast.unparse(n) for n in ast.walk(fn) if isinstance(n, ast.Call) and ast.unparse(n.func) == "_require"]
    assert any("DECISIVE_VERDICTS" in c and "VERDICT_CLAIM_INVALID" in c for c in require_calls), (
        "settle_claim_evidence must _require() a terminal verdict before proceeding"
    )


def test_admin_actions_are_timelocked_not_instant():
    # "Owner controls should move to multisig/timelock before substantial
    # value is entrusted" (2nd re-audit). A timelock (fixed 48h delay,
    # queue-then-execute) was added; a full multisig was explicitly
    # deferred pending the user's own signer-address decision — verify the
    # timelock half landed for every sensitive admin action.
    contract = _contract_class()
    timelocked = [
        "set_protocol_fee_bps",
        "set_slash_shares_bps",
        "set_min_stakes",
        "set_treasury_address",
        "transfer_ownership",
        "pause",
        "unpause",
    ]
    method_names = {n.name for n in contract.body if isinstance(n, ast.FunctionDef)}
    for name in timelocked:
        assert f"queue_{name}" in method_names, f"queue_{name}() is missing — {name} is not timelocked"
        execute_fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == name)
        assert "_consume_admin_action(" in ast.unparse(execute_fn), f"{name}() does not consume a queued timelock action"

    queue_fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "queue_pause")
    assert "_queue_admin_action(" in ast.unparse(queue_fn)

    # sweep_treasury() is deliberately NOT timelocked (see its docstring /
    # the constant's comment) — assert that choice explicitly rather than
    # silently allowing scope creep to add a delay there later without
    # updating this test.
    sweep_fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "sweep_treasury")
    assert "_consume_admin_action(" not in ast.unparse(sweep_fn)


def test_admin_timelock_delay_is_a_fixed_constant_not_owner_settable():
    # A timelock whose own delay the owner can shorten isn't a real
    # timelock — verify ADMIN_TIMELOCK_DELAY_SECONDS is a module-level
    # constant, never assigned to `self.` anywhere (i.e. never exposed as
    # mutable contract state).
    assert "ADMIN_TIMELOCK_DELAY_SECONDS = 48 * 60 * 60" in SOURCE
    assert "self.admin_timelock_delay_seconds" not in SOURCE.lower()


def test_consume_admin_action_cannot_be_replayed():
    # Regression test for a bug caught and fixed during implementation:
    # the first draft of _consume_admin_action zeroed the pending-action
    # timestamp to mark it used, but 0 also passed the "now >= executable_at"
    # check on every subsequent call (any timestamp is >= 0), making a
    # consumed action replayable forever. Verify the fix — an explicit
    # `> 0` check — is present.
    contract = _contract_class()
    fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "_consume_admin_action")
    src = ast.unparse(fn)
    assert "int(executable_at) > 0" in src, "consumed/never-queued actions must be distinguishable — replay risk otherwise"


def test_economic_parameters_are_snapshotted_per_claim_not_read_live():
    # Round-4 audit finding: a claim's settlement was reading the LIVE
    # global self.protocol_fee_bps / self.slash_treasury_share_bps, so a
    # timelocked-but-eventually-executed config change could still apply
    # retroactively to funds already staked in an unresolved claim (the
    # timelock protects against instant changes, not retroactive ones).
    # Fixed by snapshotting all three economic parameters onto the Claim
    # itself at create_claim() time and settling exclusively from that
    # snapshot everywhere.
    contract = _contract_class()
    create_claim_fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "create_claim")
    create_src = ast.unparse(create_claim_fn)
    assert "protocol_fee_bps_snapshot=u32(int(self.protocol_fee_bps))" in create_src
    assert "slash_treasury_share_bps_snapshot=u32(int(self.slash_treasury_share_bps))" in create_src
    assert "slash_pool_share_bps_snapshot=u32(int(self.slash_pool_share_bps))" in create_src

    # The three settlement functions that used to read live global state
    # must now read exclusively from the claim's own snapshot fields.
    for fn_name in ("settle_claim_sides", "claim_side_payout", "settle_claim_evidence"):
        fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == fn_name)
        src = ast.unparse(fn)
        assert "self.protocol_fee_bps)" not in src, f"{fn_name} still reads the live global fee — must use the snapshot"
        assert "self.slash_treasury_share_bps)" not in src, f"{fn_name} still reads the live global slash share — must use the snapshot"


def test_claim_dict_exposes_settlement_flags_for_frontend_ground_truth():
    # Not one of the 5 blockers, but closes the gap that forced the
    # frontend's SettlementPanel to render every action optimistically —
    # the JSON view now tells callers what's actually already settled.
    contract = _contract_class()
    fn = next(n for n in contract.body if isinstance(n, ast.FunctionDef) and n.name == "_claim_dict")
    src = ast.unparse(fn)
    assert "side_payouts_settled" in src
    assert "evidence_payouts_settled" in src
    assert "evidence_slash_pool_wei" in src
