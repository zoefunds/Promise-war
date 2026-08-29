# The Intelligent Contract

`contracts/promise_war_contract.py` — 2,188 lines, 45 public methods (15 views, 30 writes),
deployed on GenLayer StudioNet at `0x49e8B5E7A64F62623e2364Af491228820147fd25`.

## Claim lifecycle (state machine)

```
ACTIVE ──────────────────────► EVIDENCE_MATURING ──┐
  │ (side stakes + evidence     (participation      │
  │  both open)                 deadline passed,     │
  │                             evidence still open) │
  │                                                   ▼
  │                                        READY FOR REVIEW
  │                                        (evidence deadline
  │                                         passed too)
  │                                                   │
  │                              request_adjudication()
  │                                                   │
  │                    ┌──────────────────────────────┤
  │                    ▼                              ▼
  │          NOT_YET_VERIFIABLE                  ADJUDICATED
  │          (nonterminal — evidence    settle_claim_sides() +
  │           window REOPENS, can        settle_claim_evidence()
  │           retry after 6h cooldown)             │
  │                    │                            ▼
  │                    └──────────────────►      SETTLED
  │                                          (terminal)
  │
  ├── cancel_claim() ──► CANCELLED (terminal, only before any
  │                       third party stakes/submits evidence)
  │
  └── claim_adjudication_timeout() ──► EXPIRED_TIMEOUT (terminal,
        only if nobody adjudicates within 7 days of the evidence
        deadline — every stake becomes fully refundable)
```

`NOT_YET_VERIFIABLE` is the deliberate safety valve: if evidence is too thin or genuinely
contradictory, the contract does not force a premature payout. Each retry pushes
`evidence_deadline_ts` forward by `REVIEW_RETRY_COOLDOWN_SECONDS` (6 hours), so new evidence
can genuinely be submitted before the next attempt — verified live: a claim that first
returned `NOT_YET_VERIFIABLE` had its deadline extend by exactly 6 hours in the same
transaction, and a subsequent `submit_evidence()` call into that window succeeded.

## Final verdicts

| Verdict | Meaning | Side payout |
|---|---|---|
| `FULFILLED` | Claim fully established | 100% of pool to SUPPORT |
| `MATERIALLY_FULFILLED` | Core of the claim established, minor detail unclear | 85% to SUPPORT / 15% to CHALLENGE |
| `PARTIALLY_FULFILLED` | Meaningful but incomplete progress | 55% to SUPPORT / 45% to CHALLENGE |
| `NOT_FULFILLED` | Claim contradicted by evidence | 100% of pool to CHALLENGE |
| `NOT_YET_VERIFIABLE` | Insufficient/contradictory evidence | nonterminal, no payout |
| `CLAIM_INVALID` | Claim itself isn't factually adjudicable | full refund to everyone, no winner |

## Evidence outcome tiers

Each evidence item is independently classified into one of ten tiers by the same
web-fetch + LLM consensus, from `STRONGLY_SUPPORTS` (0% slash, reward-eligible) down to
`MALICIOUSLY_MANIPULATED` (100% slash, flagged, reputation penalty regardless of which side
it was submitted for). The full list and slash percentages are in
`OUTCOME_SLASH_BPS` at the top of the contract file.

## The value-transfer path

Every real GEN movement in the contract goes through exactly one function,
`_send_gen()`, wrapping the standard EVM-interface `emit_transfer` call — verified by a
static test (`test_every_gen_transfer_uses_the_single_payout_chokepoint`) that literally
counts `emit_transfer(` occurrences in the source and asserts it's 1.

Escrow paths in:
- `create_claim(...)` `[payable]` — creator's opening stake, placed on SUPPORT
- `join_side(...)` `[payable]` — any address stakes SUPPORT or CHALLENGE
- `submit_evidence(...)` `[payable]` — evidence stake

Escrow paths out (all zero-ledger-then-transfer, verified live with real multi-account
settlements):
- `claim_side_payout(claim_id, side)` — pulls a staker's share of the settled pool. Handles
  the floor-division remainder by tracking cumulative claimed stake and cumulative
  distributed wei per (claim, side): whichever claimant's payout brings the cumulative
  claimed stake up to the side's full total receives whatever remains of the pool instead
  of another floored slice — proven with a 500-trial randomized property test
  (`test_payout_conservation_holds_for_arbitrary_stakers_and_ordering`) and live on-chain
  with two real stakers at genuinely non-round wei amounts (payouts summed to the
  distributable pool exactly).
- `claim_evidence_payout(evidence_id)` — pulls a submitter's post-slash principal.
- `withdraw()` — the only place a *credited internal balance* becomes a real GEN transfer.
  Stakers/submitters are credited via `_credit_balance()` first (so an unbounded number of
  claimants never forces an unbounded loop of external calls inside one settlement
  transaction), then pull their balance out themselves.
- `claim_side_refund(...)` / `claim_evidence_refund(...)` — full-principal refund paths for
  `CANCELLED` / `EXPIRED_TIMEOUT` / `CLAIM_INVALID` terminal states.
- `sweep_treasury()` — owner-only, moves the accrued protocol-fee + slash-treasury balance
  to `treasury_address`.

## Slashed-evidence redistribution

`settle_claim_evidence()` runs once per claim (only after a terminal verdict — see below),
iterating every adjudicated evidence item to compute the claim-wide slash split: a
configurable share (default 15%) goes to the protocol treasury immediately; the remaining
share (default 85%) is summed into `evidence_slash_pool_wei` and paid out to the **winning
side's** stakers via `claim_side_payout()`, on top of their own share of the combined stake
pool. Verified live: two evidence items were slashed under a claim that reached
`NOT_YET_VERIFIABLE` — the slash correctly fell back to the treasury (no winning side
exists in that case); a separate claim reaching `FULFILLED` correctly routed its slash pool
to the SUPPORT side's stakers.

`settle_claim_evidence()` deliberately **cannot run while the claim is `NOT_YET_VERIFIABLE`**
— that status is explicitly reopenable for new evidence, and settling early would
permanently lock in `evidence_payouts_settled = True` before a later evidence batch's slash
could ever be added to the pool. This was a real finding from a third-party audit,
fixed and verified live (`settle_claim_evidence()` on a `NOT_YET_VERIFIABLE` claim now
cleanly reverts with `"claim verdict is not terminal — cannot settle evidence while
NOT_YET_VERIFIABLE remains reopenable"`).

## Economic parameters are snapshotted per claim, not read live

Every `Claim` stores `protocol_fee_bps_snapshot`, `slash_treasury_share_bps_snapshot`, and
`slash_pool_share_bps_snapshot` — captured once, at `create_claim()` time, from the
then-current global config. `settle_claim_sides()`, `claim_side_payout()`, and
`settle_claim_evidence()` read **exclusively** from these snapshot fields, never from the
live `self.protocol_fee_bps` / `self.slash_treasury_share_bps`. This closes a real finding:
without it, an owner could queue a fee increase, wait out the timelock, and have it apply
retroactively to funds already staked in claims created under the old terms — the timelock's
notice period protects against *instant* changes, but does nothing on its own to preserve
the terms a staker actually staked under. A global config change now only ever affects
claims *created after* it takes effect.

## Admin — timelocked, single-EOA owner (multisig not yet wired in)

Every sensitive admin action is queue-then-execute with a fixed 48-hour delay
(`ADMIN_TIMELOCK_DELAY_SECONDS`, deliberately not owner-settable — a timelock that can
shorten its own delay isn't one):

| Action | Queue | Execute |
|---|---|---|
| Pause/unpause the platform | `queue_pause()` / `queue_unpause()` | `pause()` / `unpause()` |
| Protocol fee | `queue_set_protocol_fee_bps(bps)` | `set_protocol_fee_bps(bps)` |
| Slash treasury/pool split | `queue_set_slash_shares_bps(t, p)` | `set_slash_shares_bps(t, p)` |
| Platform-wide min stakes | `queue_set_min_stakes(side, evidence)` | `set_min_stakes(side, evidence)` |
| Treasury address | `queue_set_treasury_address(addr)` | `set_treasury_address(addr)` |
| Ownership | `queue_transfer_ownership(addr)` | `transfer_ownership(addr)` |

`get_pending_admin_action(action_key)` returns the unix timestamp an action becomes
executable at (0 if never queued or already executed) — the frontend's `/admin` page uses
this for a live countdown. `sweep_treasury()` is deliberately **not** timelocked: it can
only move funds to `treasury_address`, and changing that address IS timelocked, so the
destination is already protected.

The contract has no `get_owner()` view — the frontend cannot hide the admin panel from a
non-owner wallet, and relies on the contract's own `[EXPECTED] only the owner may call
this` rejection.

## Source integrity on evidence URLs

`_normalize_url()` requires `https://` (rejects plaintext `http://`) and rejects a literal
blocklist of loopback/private-range/cloud-metadata hosts (`localhost`, `127.0.0.1`,
`10.0.0.0/8`, `169.254.169.254`, etc.). This is a deliberately **partial** defense, stated
plainly rather than oversold: DNS-resolution-time SSRF (a public-looking hostname that
resolves to a private IP) and redirect-following behavior are properties of GenVM's own
`gl.nondet.web.render`/`.get` implementation, not something this contract's Python executes
or can intercept.

## Full method reference

Run `genvm-lint check contracts/promise_war_contract.py --json` for the exact,
machine-verified list of every method's name, parameter types, return type, and
`payable`/`readonly` flags — this is the ground truth the frontend's ABI expectations are
checked against, not this document. As of the current deployment: 45 methods (15 read-only
views, 30 writes), constructor takes 3 params (`treasury_address`, `min_side_stake_wei`,
`min_evidence_stake_wei`).
