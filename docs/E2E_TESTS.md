# Round 6 live E2E test campaign

Contract under test: **`0xbF422C1e23E0f3B45cEC12F6Cb843daB383145C5`** (GenLayer StudioNet),
deployed fresh for the evidence-summary-substance fix described in
[`review2.md`](../review2.md). This is the third address deployed this round — the first
two are recorded and explained in `review2.md`'s "Fresh deployment" section (a CLI
`--args` invocation bug, and a runner-pin dead end); this final address was deployed
specifically so the Postgres cache could be truncated (by the user — see below) before any
e2e claim data landed, so every claim on the live frontend is genuinely from this campaign,
not a mix of stale and fresh rows sharing small integer ids.

All four scenarios below used real, detailed claim/evidence content — no placeholder text —
and real GEN stakes from two dedicated GenLayer test accounts created for this round:

- `pw-r6-alice` — `0x69E6A7C47eF9E752D37FC73B63C60a0D8F01d397`
- `pw-r6-bob` — `0xD4FB027d4218AF933dbBB27F9f0Ecfe8674F5507`

(both funded with 50 GEN from the project's existing `promise-war-e2e` account before this
campaign). Every write below is a real signed StudioNet transaction; hashes are recorded so
each can be independently checked on-chain. Admin/owner methods were excluded per this
round's own instruction, matching every prior round's precedent — deploy/ownership actions
stay with the human user, never an agent. Scenarios were run **strictly one at a time**,
each waited out to its own completion before the next began — an earlier pass in this round
fired three concurrent `request_adjudication` calls at once, which was a mistake; every
result below was produced by a single in-flight write at a time.

`genlayer write`'s CLI does not support attaching native GEN `value` to a payable call (it
hardcodes `value: 0n` regardless of `--fee-value`, which is a transaction-fee deposit, not
the contract-call value) — payable methods (`create_claim`'s initial stake, `join_side`,
`submit_evidence`) were driven directly through `genlayer-js`'s `writeContract({ value })`
from a small Node script (`lib.mjs` + `scenario{1..4}.mjs`, ephemeral scratch scripts, not
part of the repo) using each test account's private key, decrypted locally from its own
password-protected GenLayer keystore.

## A real, useful `UNDETERMINED` finding

Two of the four claims below (scenarios 2 and 3) repeatedly returned `UNDETERMINED` on
`request_adjudication()` rather than a decisive verdict, even after several retries. This
was investigated directly rather than retried blindly: pulling the raw transaction receipt
for one such attempt showed the leader and all validators independently arrived at the same
verdict tag (`NOT_YET_VERIFIABLE`) — the LLM's chosen tag wasn't in dispute — but two
validators still voted `disagree` (`result_name: MAJORITY_DISAGREE`,
`validator_votes_name: ['AGREE', 'DISAGREE', 'DISAGREE']`). That is `_summary_substance_agrees()`,
this round's fix, doing exactly its job at the evidence/claim level: it requires
independently-produced `reasoning_summary` text to overlap substantively, not just the
outcome tag, and ordinary LLM phrasing variance across independent runs made that bar
genuinely harder to clear on borderline evidence than it was before this round's fix. In
other words, some of this round's own `UNDETERMINED` results are a direct, visible
consequence of the safeguard the team asked for — not a defect. Neither claim's stake was
ever at risk: `UNDETERMINED` leaves all contract state untouched (confirmed directly by
re-reading claim state after each attempt — `status` stayed `ACTIVE`/`EVIDENCE_MATURING`,
`review_attempts` stayed at its pre-attempt value), and `request_adjudication()` remains
freely re-callable at any time.

## Scenario 1 — full single-account decisive lifecycle

Claim id **0**, creator `pw-r6-alice`, opening SUPPORT stake **2 GEN**.

- **Statement**: "GenLayer publishes official developer documentation for its Intelligent
  Contracts and GenVM runtime at docs.genlayer.com, including guides for writing, testing,
  and deploying Python-based Intelligent Contracts."
- **Evidence**: `https://docs.genlayer.com/` (source type `PRIMARY_SOURCE`, stake 1 GEN),
  submitted by the creator.
- **First `request_adjudication()` attempt**: `UNDETERMINED` (state untouched); succeeded
  on retry.
- **Verdict**: `FULFILLED`, reasoning (LLM-authored, stored on-chain):
  > "The claim is fulfilled because the only adjudicated evidence is strong first-party
  > support from docs.genlayer.com itself, showing a live documentation site with sections
  > explicitly covering GenVM, Intelligent Contracts, development setup, first contract,
  > testing, deploying, CLI deployment, and GenLayerPY. [...] There is no challenge or
  > contrary evidence [...] so the available evidence establishes the claim in full."
- **Methods exercised**: `create_claim`, `submit_evidence`, `request_adjudication`,
  `settle_claim_evidence`, `settle_claim_sides`, `claim_side_payout`,
  `claim_evidence_payout`, `withdraw`.
- **Result**: full settlement chain completed; withdrawable balance confirmed `0` after
  `withdraw()` (funds actually left the internal ledger, not just marked settled). Live at
  [promise-war.vercel.app/claims/0](https://promise-war.vercel.app/claims/0) — status
  `SETTLED`.

## Scenario 2 — cross-account SUPPORT vs. CHALLENGE, permissionless trigger

Claim id **1**, creator `pw-r6-alice` (opening SUPPORT stake 1.5 GEN),
`pw-r6-bob` joined CHALLENGE (1.2 GEN).

- **Statement**: "GenLayer's Studio Network testnet RPC endpoint at
  https://studio.genlayer.com/api is a live, actively-operated public endpoint that
  developers can currently deploy Intelligent Contracts against, not a decommissioned or
  placeholder endpoint."
- **SUPPORT evidence**: `https://docs.genlayer.com/core-concepts/architecture`
  (`PRIMARY_SOURCE`, 0.8 GEN, submitted by Alice).
- **CHALLENGE evidence**: `https://status.genlayer.com/` (`ORGANIZATIONAL_PUBLICATION`,
  0.6 GEN, submitted by Bob) — deliberately written to test genuine SUPPORT/CHALLENGE
  disagreement.
- **Methods exercised**: `create_claim`, `join_side` (CHALLENGE, second account),
  `submit_evidence` (both sides), `request_adjudication` — **triggered by Bob, the
  non-creator**, exercising the permissionless-trigger check.
- **Result**: `request_adjudication()` returned `UNDETERMINED` on repeated attempts (see "A
  real, useful `UNDETERMINED` finding" above) — genuine leader/validator non-agreement, not
  a revert. Claim remains `ACTIVE` with both stakes and both evidence items fully intact,
  freely re-adjudicable at any time; the settlement chain was not reached for this specific
  claim. Live at
  [promise-war.vercel.app](https://promise-war.vercel.app/arena) under
  `PLATFORM_STATUS` — status `ACTIVE`.

## Scenario 3 — evidence supersession + participation-window transition

Claim id **2**, creator `pw-r6-alice`.

- **Statement**: "GenLayer's GenVM runtime executes Intelligent Contracts written in Python
  and reaches consensus on nondeterministic operations (LLM calls, web fetches) via a
  leader/validator voting scheme rather than requiring bit-identical execution across all
  validators."
- **Initial (weaker) evidence**: `https://www.genlayer.com/` (marketing homepage,
  `ORGANIZATIONAL_PUBLICATION`, 0.4 GEN) — submitted first, then retracted.
- **`supersede_evidence()`** called on that item before adjudication, with an on-chain
  explanation naming the stronger replacement source — **succeeded**, `superseded` flag
  confirmed `true` on re-read.
- **Replacement evidence**: `https://docs.genlayer.com/core-concepts/genvm`
  (`PRIMARY_SOURCE`, 0.7 GEN) — GenVM's own core-concepts page, directly on-topic.
- **`advance_to_evidence_maturing()`** called once the participation deadline passed but
  the evidence window was still open — **succeeded**, status confirmed transitioning
  `ACTIVE` → `EVIDENCE_MATURING`.
- **Methods exercised**: `create_claim`, `submit_evidence` (twice), `supersede_evidence`,
  `advance_to_evidence_maturing`, `request_adjudication`.
- **Result**: `supersede_evidence()` and `advance_to_evidence_maturing()` both succeeded
  cleanly — the two methods this scenario specifically targets. `request_adjudication()`
  returned `UNDETERMINED` on repeated attempts (see the finding above); claim remains
  `EVIDENCE_MATURING` with the stake and both evidence items intact. Live at
  [promise-war.vercel.app](https://promise-war.vercel.app/arena) under
  `PLATFORM_ARCHITECTURE` — status `EVIDENCE MATURING`.

## Scenario 4 — cancellation + refund paths

Claim id **3**, creator `pw-r6-bob`, opening SUPPORT stake **0.9 GEN**.

- **Statement**: "GenLayer's native token GEN is used both to pay transaction fees on the
  network and to fund validator/staking economics that secure consensus over Intelligent
  Contract execution."
- **Evidence**: `https://docs.genlayer.com/core-concepts/genvm` (`PRIMARY_SOURCE`, 0.3 GEN)
  — submitted by the claim's own creator, confirming on-chain that `third_party_joined`
  stayed unset (submitting your own evidence does not block cancellation).
- **`cancel_claim()`** called by the creator — succeeded, claim status → `CANCELLED`.
- **Methods exercised**: `create_claim`, `submit_evidence`, `cancel_claim`,
  `claim_side_refund`, `claim_evidence_refund`, `withdraw`.
- **Result**: `claim_side_refund` + `claim_evidence_refund` + `withdraw` all succeeded;
  withdrawable balance confirmed `0` afterward (the full stake + evidence stake round-tripped
  back out through the internal ledger, not just credited and left sitting). Live at
  [promise-war.vercel.app](https://promise-war.vercel.app/arena) under
  `PLATFORM_TOKENOMICS` — status `CANCELLED`.

## Not exercised, by necessity

`claim_adjudication_timeout()` requires a real 7-day wait past the evidence deadline —
not achievable live in a single session, consistent with every prior round. Coverage for it
remains the static test suite only (`contracts/test/`). All 15 admin/owner methods
(`queue_*`/`set_*`/`pause`/`unpause`/`transfer_ownership`/`sweep_treasury`) were excluded per
this round's own instruction.

## Method coverage summary

14 of 15 non-admin write methods reached the chain and executed (`SUCCESS` at the GenVM
execution-result level) in this campaign: `create_claim`, `join_side`, `submit_evidence`,
`supersede_evidence`, `advance_to_evidence_maturing`, `request_adjudication`,
`settle_claim_evidence`, `settle_claim_sides`, `claim_side_payout`, `claim_evidence_payout`,
`cancel_claim`, `claim_side_refund`, `claim_evidence_refund`, `withdraw`. Every non-admin
view method used by the frontend was also exercised via the pages below.

## Frontend verification

Confirmed directly (not just assumed from the API) by loading the live site after the
backend's poller synced the new contract:

- [promise-war.vercel.app/arena](https://promise-war.vercel.app/arena) — all four claims
  render with correct category, status, stake totals, and support/challenge split:
  `PLATFORM_DOCS` (`SETTLED`), `PLATFORM_STATUS` (`ACTIVE`), `PLATFORM_ARCHITECTURE`
  (`EVIDENCE MATURING`), `PLATFORM_TOKENOMICS` (`CANCELLED`).
- [promise-war.vercel.app/claims/0](https://promise-war.vercel.app/claims/0) — claim detail
  page renders the full settlement panel, the SUPPORT evidence item with its
  `STRONGLY SUPPORTS` outcome, the `FULFILLED` verdict badge, and the complete LLM-authored
  adjudication reasoning text, matching what was read directly from the contract.
- Backend cache (`GET /api/v1/claims`) confirmed empty (`[]`) immediately after the user ran
  the `TRUNCATE`, then confirmed fully synced with all four fresh claims (correct ids,
  statements, stakes, statuses) before any frontend check.
