# Security

## Threat model and mitigations

| Threat | Mitigation |
|---|---|
| Reentrancy / double-spend on payout | Every payout path zeroes its ledger field, persists state, *then* transfers — verified by a static test that every real transfer goes through the single `_send_gen()` choke point, and live by deliberately calling `claim_side_payout()` a second time on an already-claimed stake (cleanly reverts: `"this stake has already been claimed"`) |
| Payout dust silently stranded | Cumulative-claimed-stake tracking makes the last claimant absorb the exact remainder — 500-trial randomized property test + live verification with real non-round wei amounts (payouts summed to the distributable pool exactly) |
| Prompt injection via malicious evidence content | The adjudication prompt explicitly instructs the model that fetched content and submitter summaries are untrusted data, never instructions to follow |
| SSRF via evidence URL | `https://`-only + a literal blocklist of loopback/private-range/cloud-metadata hosts — **deliberately partial**, see below |
| Retroactive economic changes to already-staked claims | Fee/slash-share parameters are snapshotted onto each `Claim` at creation and settlement reads only from the snapshot, never live global config |
| Instant, unilateral admin action against a live escrow | Every sensitive admin action requires a 48-hour queue-then-execute timelock; `sweep_treasury()` alone stays instant because its only destination (`treasury_address`) is itself timelocked |
| A queued admin action executed twice (replay) | Caught during implementation before shipping: consuming an action zeroes its timestamp, and an explicit `> 0` liveness check distinguishes "never queued" from "already consumed" — a naive zero-to-mark-used approach would have made 0 satisfy "now >= 0" forever, making the action replayable. Covered by a dedicated regression test |
| A claim reopened via `NOT_YET_VERIFIABLE`, settled, then reopened again losing new evidence's slash accounting | `settle_claim_evidence()` now requires a terminal verdict (decisive or `CLAIM_INVALID`) — rejects outright while `NOT_YET_VERIFIABLE`, live-verified |
| GEN permanently stuck (nobody ever adjudicates) | `claim_adjudication_timeout()` — after 7 days past the evidence deadline, any address can flip the claim to a fully-refundable terminal state |
| Creator cancels a claim out from under a participant | `cancel_claim()` requires `third_party_joined == False`, set the moment *any* address other than the creator stakes a side or submits evidence — closes a gap where the original check (challenge stake / evidence count) missed a second SUPPORT staker |
| Sybil / spam claim creation | Permissionless but stake-gated — no reputation requirement, but every claim requires a real GEN stake and every evidence submission requires its own stake, priced to discourage spam without gatekeeping who can participate |

## Deliberately partial: SSRF via DNS rebinding / redirects

`_normalize_url()` rejects the URL forms it can catch deterministically at submission time:
plaintext `http://`, and literal loopback/private-range/cloud-metadata hostnames. It cannot
catch a public-looking hostname that resolves to a private IP at fetch time, or a redirect
chain that lands somewhere different from the submitted URL — both are properties of
GenVM's own `gl.nondet.web.render`/`.get` implementation, which this contract's Python never
executes or intercepts. This is stated explicitly in the contract's own docstrings and on
the `/laws` page rather than left implicit or oversold as "solved."

## Wallet auth (backend session, not the contract)

`apps/api` uses a SIWE-style flow: a random nonce is issued per wallet address, embedded in
a plain-text message, signed by the wallet, and verified with `viem`'s `verifyMessage`
against the exact message issued. The nonce is deleted immediately on successful
verification, so a captured signature can never be replayed. The resulting session is an
httpOnly JWT cookie — `SameSite=None; Secure` in production (Vercel and Fly are different
origins; `SameSite=Lax` would silently drop the cookie cross-site, which was a real bug
caught during development), `SameSite=Lax` in local dev (same-origin, no HTTPS needed).

This session only gates the backend's notification feed — it has no bearing on contract
authorization, which is entirely wallet-signature-based per transaction.

## Input validation

`apps/api`'s routes use `zod` schemas for every query parameter and route param
(`pageQuery`, `idParam`, `addressQuery` in `routes/claims.ts`) — a malformed value (`NaN`,
negative, out-of-range, non-address string) gets a clean `400` with field-level errors
instead of reaching Prisma raw or falling through to a generic `500`.

## Known limitations / not yet done

- **Single-EOA owner, not a multisig.** The 48-hour timelock protects against instant
  unilateral action, but the queue/execute calls themselves are still gated by one private
  key. Moving to an N-of-M multisig as the timelock's own controlling address is the
  planned next step, pending the owner naming signer addresses and a threshold.
- **No CI-gated live-contract integration tests.** The 25 tests in `contracts/test/` are
  static (AST-based) and property-based (pure-Python mirrors of the settlement math,
  randomized). Real-transaction coverage exists — extensively, across four audit rounds,
  with real multi-account settlements — but as manually-run test campaigns logged in
  `MEMORY.md`, not as an automated CI gate. Building genuine CI-gated coverage needs either
  a funded StudioNet test-wallet secret in CI or a localnet GenVM node in the runner.
- **No external professional audit.** Everything in this document reflects iterative
  adversarial review during development, not a formal third-party smart-contract security
  audit. Recommended before any meaningful production capital is at stake.

## Reporting a concern

This is a testnet/StudioNet project without a formal disclosure process yet. If you find a
genuine issue, open a GitHub issue on this repository.
