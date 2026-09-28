# Testing

## Contract — static + property tests

`from genlayer import *` (the top of `promise_war_contract.py`) can only be resolved inside
GenVM's sandboxed runtime — it isn't a pip-installable package, so the contract can't be
`import`ed and executed directly outside GenVM for a normal unit-test run. Both test files
below work around this deliberately rather than skip testing:

```bash
pip install pytest "genvm-linter==0.11.0"
python3 -m pytest contracts/test/ -v
genvm-lint check contracts/promise_war_contract.py
```

- **`test_promise_war_static.py`** (18 tests) — parses the contract's AST and asserts on
  structure directly: exactly one contract class, every public method's parameter/return
  types are schema-safe primitives (`str`/`bool`/`int`/`None`/`u256` — never a dataclass,
  dict, or list), every `TreeMap`/`DynArray`-typed storage field is left to GenVM's own
  zero-initialization (never assigned a fresh empty collection in `__init__`, a known GenVM
  footgun), exactly one `emit_transfer(` call exists in the whole file (the single money
  choke point), plus a dedicated regression test for every fix from all four audit rounds
  (dust accounting present, slash pool no longer double-credited to treasury,
  `NOT_YET_VERIFIABLE` reopening, HTTPS/host blocklist, cancel_claim's third-party guard,
  the terminal-verdict gate on `settle_claim_evidence`, the timelock's presence + replay
  protection, the economic-snapshot fields, the zero-staker recipient invariant, and the
  validator-agreed substantive-summary requirement).
- **`test_settlement_math_properties.py`** (7 tests) — a faithful pure-Python mirror of
  the two settlement algorithms (`claim_side_payout`'s dust-absorption loop,
  `settle_claim_evidence`'s aggregate slash split), property-tested against 500 randomized
  trials each for: payout conservation (sum of payouts equals the pool exactly, for
  arbitrary staker counts/amounts/claim order), order-independence of the *total* (individual
  shares ARE order-dependent by design — whoever claims last absorbs the remainder — but the
  total never varies), slash conservation (treasury + pool == total slash, exactly), and a
  direct model of the reopen/settle sequencing bug showing the exact amount the old
  (pre-fix) sequencing would have silently lost.

This is explicitly a mirror of the algorithm, not an execution of the real contract — it
verifies the *math* is conservation-safe under adversarial inputs. Real-contract behavioral
coverage instead comes from the manual live test campaigns described below.

## Contract — live verification (manual, not yet CI-gated)

Every audit-fix round in this project's history was verified against the actual deployed
contract on StudioNet with real transactions from real (test) funded accounts — not just
locally. The full transaction-by-transaction logs live in `MEMORY.md`; in summary, these
tests have covered:

- **Every read view** — `get_version`, `get_categories`, `is_paused`, `get_claim_count`,
  `get_platform_stats`, `get_claims_page`, `get_claim`, `get_claim_evidence`,
  `get_reputation`, `get_withdrawable_balance`, `get_pending_admin_action`, and more —
  against both empty and populated contract state.
- **Full happy-path lifecycle**: create a claim with a real opening stake → a second
  account joins the opposite side → evidence submitted with real, verifiable URLs
  (`docs.genlayer.com` pages) → real GenLayer web-fetch + LLM adjudication → `FULFILLED`
  verdict with a genuine, detailed LLM-authored rationale → full settlement chain (sides,
  evidence, side payout, evidence payout, withdraw) → balances and reputation checked
  before/after every step.
- **Genuine multi-staker dust distribution**: two distinct funded accounts staked
  deliberately non-round wei amounts (e.g. `3.333333333333333333` / `6.666666666666666667`
  GEN) on the same side; payouts summed to the distributable pool to the exact wei.
- **Cross-address SUPPORT vs. CHALLENGE**: one account backed SUPPORT with strong
  on-point evidence, a second backed CHALLENGE with deliberately weak evidence; the winner
  was paid, the loser's `withdraw()` correctly reverted with `"no withdrawable balance"`
  rather than silently no-opping, and reputation updated precisely on both sides.
- **`NOT_YET_VERIFIABLE` reopening**: a claim's first adjudication pass (weak evidence)
  returned `NOT_YET_VERIFIABLE`; the evidence deadline was observed extending forward by
  exactly the 6-hour cooldown in the same transaction; a second `submit_evidence()` call
  into the reopened window succeeded (this exact call would have reverted before the fix).
- **Adversarial input rejection** — every one of these was tested directly against the
  live contract and confirmed to revert cleanly (no VM crash, no undetermined consensus
  result): staking/evidence submission after a deadline has passed, `cancel_claim` after a
  third party joined, `settle_claim_evidence` on a `NOT_YET_VERIFIABLE` claim,
  non-owner calls to every admin function, plaintext `http://` evidence URLs, `localhost` /
  `169.254.169.254` / `10.0.0.0/8` evidence hosts, and a repeat claim on an
  already-consumed payout.
- **Economic snapshot verification**: a freshly created claim's
  `protocol_fee_bps_snapshot` / `slash_treasury_share_bps_snapshot` /
  `slash_pool_share_bps_snapshot` were read back directly and confirmed to match the
  global config at creation time.

The current focused run is `25 passed`. The live adjudication run returned
`NOT_YET_VERIFIABLE` for two irrelevant sources, demonstrating that weak evidence does not
force a decisive settlement. The live cancellation/refund and evidence-supersession runs
also completed with finalized transactions. Every observed revert was a clean, deterministic
`[EXPECTED]` `UserError`.

**Not yet built**: automating the above as a CI-gated suite. This needs either a funded
StudioNet test-wallet secret available to CI, or a localnet GenVM node running inside the
CI runner — real new infrastructure, tracked as an open item in `docs/SECURITY.md`.

## Frontend / backend

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm build
cd apps/api && pnpm exec prisma generate --schema ../../database/schema.prisma && pnpm exec tsc --noEmit && pnpm build
```

Both are typechecked and built as part of CI (`.github/workflows/ci.yml`) on every push and
pull request. There is no frontend/backend unit test suite beyond typechecking + a
successful production build at this time — the project's test investment has gone
primarily into the contract, per the audit's own priority ordering (economic correctness
first).

## CI

`.github/workflows/ci.yml` runs three jobs on every push/PR: `contract` (syntax check,
pytest, `genvm-lint` — required, not optional), `web` (typecheck + `next build`), `api`
(prisma generate + typecheck).
