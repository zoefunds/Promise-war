# Security Fix Review

Updated: 2026-09-28

This review records the fixes requested by the team, the implementation that is now live,
and the evidence used to verify it. The active deployment is the GenLayer StudioNet contract
at `0xeE22D6623d86eFc23b1BFaDBDeB57ddF34076902`.

## Scope of the requested fixes

The review covered two settlement risks:

1. A decisive verdict could identify a winning side whose eligible staker total was zero.
   Any GEN assigned to that side, including the evidence slash bonus, needed a safe
   recipient or recovery path.
2. A leader-authored final summary could influence settlement without independent evidence
   retrieval or substantive agreement from validators.

The requested tests were also added: a positive winning pool with zero eligible stakers,
and rejection of an unverified leader-authored summary as a settlement authority.

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

`_claim_verdicts_agree()` now requires more than matching verdict labels or economic buckets.
Before validator data can agree with the leader result, `_summary_substance_agrees()` checks
that both summaries are substantive and share meaningful claim-specific content. Short,
empty, or generic leader text cannot satisfy this condition.

The adjudication flow still independently fetches each submitted evidence URL through
GenLayer web rendering. Submitted page content and submitter summaries remain untrusted
data in the adjudication prompt. A leader-only summary therefore cannot determine a final
claim verdict or unlock settlement.

## Regression coverage

The focused local suite passes with **25 tests**:

- `test_decisive_settlement_recovers_when_winning_pool_has_zero_stakers` checks the positive
  pool / zero eligible winner case.
- `test_final_verdict_requires_validator_agreed_summary_substance` checks that matching or
  leader-authored labels do not bypass substantive validator agreement.
- Static checks confirm the zero-staker guards exist in side settlement, side payout, and
  evidence settlement.
- Static checks confirm the terminal-verdict gate prevents evidence settlement while a claim
  remains `NOT_YET_VERIFIABLE`.
- Property tests cover payout conservation, slash conservation, claimant ordering, and the
  reopen/settle sequencing failure mode.

The checked-in contract also compiles successfully with `python3 -m py_compile`.

## Live deployment verification

The deployed contract source was fetched from StudioNet and checked for:

- `_winning_side`
- `winning_total == 0` guards in settlement and payout paths
- evidence-pool fallback when no eligible winning-side staker exists
- `_summary_substance_agrees`
- validator summary agreement before final verdict acceptance

The live adjudication scenario used two detailed evidence submissions from independent public
URLs. Both were independently classified as `MATERIALLY_IRRELEVANT`, and the claim ended as
`NOT_YET_VERIFIABLE`. This is the expected safe result: unsupported evidence did not produce a
decisive settlement.

The live test transactions also exercised the new deployment's write paths for claim creation,
side staking, evidence submission, evidence supersession, adjudication, cancellation/refund,
and withdrawal. The withdrawal transaction finalized as:

`0x1d9c772e462bcdb65b427f19bfa77f752092f9b35e10618c87979213d240ad5d`

The zero-staker decisive payout branch was not forced through a live claim because that would
require manufacturing a terminal state specifically to bypass the normal eligibility rules.
It is covered directly by the regression test and verified in the deployed source.

## Current production wiring

- Frontend: <https://promise-war.vercel.app>
- Backend: <https://promise-war-api-george.fly.dev>
- Database: `promise-war-db-george`
- Contract: `0xeE22D6623d86eFc23b1BFaDBDeB57ddF34076902`

The previous contract's engagement cache was cleared before live testing. The backend and
frontend use the current contract address, and the frontend successfully displays the live
claim and adjudication state.

