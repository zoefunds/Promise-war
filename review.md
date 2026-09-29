# Security Fix Review

Updated: 2026-09-29

This review records the fixes requested by the team, the implementation that is now live,
and the evidence used to verify it. It supersedes the 2026-09-28 revision, which the team
correctly rejected as incomplete: it closed the claim-level summary gap but left the
evidence-level one open, and its regression tests only checked source structure instead of
exercising the actual code paths. The active deployment is the GenLayer StudioNet contract
at `0xeE22D6623d86eFc23b1BFaDBDeB57ddF34076902` (redeploy pending for this revision — see
"Current production wiring").

## Scope of the requested fixes

The review covered two settlement risks:

1. A decisive verdict could identify a winning side whose eligible staker total was zero.
   Any GEN assigned to that side, including the evidence slash bonus, needed a safe
   recipient or recovery path.
2. A leader-authored final summary could influence settlement without independent evidence
   retrieval or substantive agreement from validators. **The 2026-09-28 fix only enforced
   this at the claim-verdict level.** `_evidence_outcomes_agree()` — the validator for each
   individual evidence item — still compared only the outcome-derived payout, slash-tier,
   reward-eligibility, and flagging buckets between leader and validator, never the
   `reasoning_summary` text itself. That unverified, leader-only evidence summary is then
   stored verbatim and fed into the claim-level verdict prompt as ground truth ("already
   adjudicated evidence"), so a leader could pair a plausible outcome tag with a fabricated
   or manipulated summary and have it flow, unchecked, into final settlement — even though
   the claim-level check on top of it was itself sound. `_evidence_outcomes_agree()` now
   also calls `_summary_substance_agrees()` on both summaries before agreeing, closing this.

The requested tests were also redone as real execution, not source-structure checks: a
positive winning pool with zero eligible stakers is now actually settled and paid out
against a live `PromiseWar` instance, and an unverified/fabricated evidence summary is now
proven — by calling `_evidence_outcomes_agree()` directly with matching outcomes but
divergent summaries — unable to reach agreement. See "Regression coverage" below for how.

## Recipient safety implementation

`_winning_side(verdict)` centralizes the mapping from decisive verdicts to SUPPORT or
CHALLENGE. The settlement code then computes the eligible amount for that side before
assigning any pool:

```python
winning_total = support_total if winning_side == SIDE_SUPPORT else challenge_total
```

When the verdict is decisive and `winning_total == 0`:

- `settle_claim_sides()` routes the complete distributable side pool to the only eligible
  side when exactly one side has stakers, and waives the protocol fee for that recovery
  route.
- `claim_side_payout()` applies the same routing rule when the payout is claimed, so the
  read-time payout path cannot disagree with settlement bookkeeping.
- `settle_claim_evidence()` does not create an evidence bonus for an ineligible side. The
  slash pool is routed to the treasury and the claim pool is cleared.
- A claim with no eligible side recipient cannot strand a positive pool in a winning-side
  ledger entry.

The existing zero-ledger-then-transfer payout chokepoint remains `_send_gen()`, and the
contract still uses a single `emit_transfer()` call site.

## Verdict integrity implementation

Two independent layers now require substantive, independently-produced agreement before a
leader's reasoning can influence anything economic:

- `_claim_verdicts_agree()` requires more than matching verdict labels or economic buckets.
  Before validator data can agree with the leader result, `_summary_substance_agrees()`
  checks that both summaries are substantive and share meaningful claim-specific content.
  Short, empty, or generic leader text cannot satisfy this condition.
- `_evidence_outcomes_agree()` — the per-evidence-item validator, one level below the claim
  verdict — now runs the same `_summary_substance_agrees()` check on the leader's and
  validator's `reasoning_summary` for that evidence item, in addition to its existing
  outcome/slash/reward/flag bucket comparisons. This is the piece the previous revision
  missed: the claim-level check only protects the final verdict summary; without this,
  the individual evidence summaries feeding that verdict were still leader-only.

The adjudication flow still independently fetches each submitted evidence URL through
GenLayer web rendering. Submitted page content and submitter summaries remain untrusted
data in the adjudication prompt. A leader-only summary — at either the evidence level or
the claim level — can no longer determine a final claim verdict or unlock settlement.

## Regression coverage

The focused local suite passes with **32 tests** across three files:

- `contracts/test/test_promise_war_static.py` — AST/source-structure checks, including the
  new `test_evidence_level_validator_also_checks_summary_substance`, which additionally
  asserts `_evidence_outcomes_agree()` actually *calls* `self._summary_substance_agrees(...)`
  (not merely mentions the name anywhere in the function).
- `contracts/test/test_settlement_math_properties.py` — property tests over a pure-Python
  mirror of the payout/slash math (conservation, ordering-independence, reopen/settle
  sequencing).
- **`contracts/test/test_contract_execution.py` (new)** — real execution against actual
  `PromiseWar` methods, addressing the review's core complaint that the prior tests "check
  source structure rather than exercising" the behavior. It installs a minimal `genlayer`
  stub (`contracts/test/_genlayer_stub.py` — real `TreeMap`/`Address`/`u256`-style types,
  identity decorators, no network/LLM access) so the actual contract module imports and
  runs outside GenVM, then:
  - `test_settle_claim_sides_routes_positive_pool_to_the_only_staked_side` builds a claim
    with a **positive** SUPPORT pool (1,000 wei) and a **zero-staker** CHALLENGE side under
    a `NOT_FULFILLED` verdict, calls the real `settle_claim_sides()` and `claim_side_payout()`,
    and asserts the fee is waived and the sole real staker receives the *entire* pool.
  - `test_settle_claim_evidence_recovers_slash_pool_to_treasury_when_winner_has_no_stakers`
    does the equivalent for the evidence-slash bonus pool.
  - `test_evidence_validator_rejects_matching_outcome_with_fabricated_summary` calls
    `_evidence_outcomes_agree()` directly with identical outcome tags but a validator
    summary describing unrelated content, and asserts it returns `False` — proving an
    unverified/fabricated evidence summary cannot reach agreement even when the economic
    outcome tag matches.
  - `test_evidence_validator_accepts_matching_outcome_with_substantively_agreeing_summary`
    is the corresponding positive case, so the new check is shown to accept genuine
    independent agreement, not just reject everything.
  - `test_evidence_validator_still_rejects_on_outcome_bucket_mismatch_regardless_of_summary`
    confirms the pre-existing outcome-bucket check still applies independently of the new
    summary check.

The checked-in contract also compiles successfully with `python3 -m py_compile`.

## Live deployment verification (as of the 2026-09-28 deployment)

The deployed contract source at `0xeE22D6623d86eFc23b1BFaDBDeB57ddF34076902` was fetched from
StudioNet and checked for the recipient-safety pieces and the claim-level summary check:

- `_winning_side`
- `winning_total == 0` guards in settlement and payout paths
- evidence-pool fallback when no eligible winning-side staker exists
- `_summary_substance_agrees`
- validator summary agreement before final verdict acceptance (claim level only)

**This deployment predates the evidence-level fix in this revision** — its
`_evidence_outcomes_agree()` does not yet call `_summary_substance_agrees()`. The
claim-creation/staking/evidence/adjudication/cancellation/withdrawal write-path exercise
described below is still valid evidence that the contract's mechanics work end to end, but
it does not demonstrate the evidence-level fix, which only exists in the checked-in source
as of this revision and needs a redeploy before it protects real funds.

The live adjudication scenario used two detailed evidence submissions from independent public
URLs. Both were independently classified as `MATERIALLY_IRRELEVANT`, and the claim ended as
`NOT_YET_VERIFIABLE`. This is the expected safe result: unsupported evidence did not produce a
decisive settlement.

The live test transactions also exercised the deployment's write paths for claim creation,
side staking, evidence submission, evidence supersession, adjudication, cancellation/refund,
and withdrawal. The withdrawal transaction finalized as:

`0x1d9c772e462bcdb65b427f19bfa77f752092f9b35e10618c87979213d240ad5d`

The zero-staker decisive payout branch was not forced through a live claim because that would
require manufacturing a terminal state specifically to bypass the normal eligibility rules.
It is now covered by real execution in `test_contract_execution.py` (see above) rather than
only by source-structure checks.

## Current production wiring

- Frontend: <https://promise-war.vercel.app>
- Backend: <https://promise-war-api-george.fly.dev>
- Database: `promise-war-db-george`
- Contract: `0xeE22D6623d86eFc23b1BFaDBDeB57ddF34076902` — **pending redeploy** to pick up
  the evidence-level `_summary_substance_agrees()` check in this revision. Until redeployed,
  the live contract still has the gap described above.

The previous contract's engagement cache was cleared before live testing. The backend and
frontend use the current contract address, and the frontend successfully displays the live
claim and adjudication state.

