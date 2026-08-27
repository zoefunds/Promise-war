# PROMISE WAR — Project Memory

This file is the persistent project brain. Read it before making architectural
decisions; update it whenever a decision changes.

## What this project is

PROMISE WAR — "Two sides. One claim. Bring proof." An onchain evidence-battle
arena on GenLayer. Someone locks GEN behind a verifiable real-world claim.
Players stake GEN on SUPPORT or CHALLENGE and back their side with priced,
individually-adjudicated evidence. GenLayer's own web-fetch + LLM consensus
renders an independent verdict. The contract settles GEN to the winning side
and rewards the strongest evidence.

## Confirmed architecture decisions (from Discovery questionnaire)

- **Backend data store:** PostgreSQL, direct (not Docker) — Postgres runs as
  its own always-on Fly.io machine, API connects via `DATABASE_URL`.
- **Backend host:** Fly.io. `fly.toml` sets `min_machines_running = 1` and
  `auto_stop_machines = false` — this is the literal mechanism satisfying the
  "backend must be on 24/7, must never die" requirement.
- **Auth:** Wallet-based (Sign-In-With-Ethereum style: nonce + signature, no
  custodial key storage). No email/password, no social OAuth (explicitly
  declined by the user — "no need for social auth"). "Socials through
  connection, not typed usernames" therefore does NOT apply — there is no
  social layer in v1.
- **StudioNet:** User has a funded wallet and intends to go live with real GEN
  stakes immediately. Contract address must never be invented — wait for the
  user to deploy and provide it (see [[deployment-contract-address]]).
- **Claim creation:** Permissionless but stake-gated. No reputation gate on
  who may create a claim.
- **Adjudication trigger:** Manual, permissionless — `request_adjudication()`
  may be called by any address once the evidence deadline passes (GenVM has
  no native scheduler).
- **Frontend deploy:** Vercel, default subdomain (no custom domain yet).
- **Frontend framework:** Next.js + Tailwind (matches the Tailwind-based HTML
  prototypes supplied as design references).

## Reference repos this project explicitly builds on

- `~/source-stake` (Veritine, scored 560 pts) — dataclass+TreeMap storage,
  tolerance-banded nondet consensus, ERR_EXPECTED/ERR_EXTERNAL/ERR_TRANSIENT/
  ERR_LLM error classification, monorepo shape (apps/web, apps/api,
  packages/*, database/, fly.toml with `min_machines_running=1`).
- `~/Witness-Weaver` (Witness-Weave, scored 480 pts) — per-item + aggregate
  consensus split, documented wide-but-deliberate tolerance bands.
- `~/promise-to-proof-registry` — the escrow discipline PROMISE WAR's
  contract is built around: JSON-string ledger fields, zero-then-transfer
  before every `_send_gen()` call, every public view returns a scalar or a
  JSON string (never a raw dataclass) specifically to avoid a Studio/indexer
  "could not load contract schema" failure.

## Contract status

`contracts/promise_war_contract.py` — **complete**, 1,899 lines, syntax
validated locally (`python3 -c "import ast; ast.parse(...)"`). Not yet
deployed. See [[contract-design-notes]] for the escrow/consensus design
rationale (duplicated as a large docstring-style header comment in the file
itself — do not let the two drift apart if the contract is edited).

Key properties an editor must preserve:
- Single emission point `_send_gen()` — never call the `_Recipient` EVM
  interface stub anywhere else.
- Every payout path: read ledger -> zero ledger -> save state -> transfer.
  Never reorder this.
- `request_adjudication()` is permissionless and callable by anyone after
  `evidence_deadline_ts`. `claim_adjudication_timeout()` is the stuck/
  abandoned recovery exit after `ADJUDICATION_TIMEOUT_SECONDS` (7 days).
- Consensus tolerance bands (`EVIDENCE_SLASH_TOLERANCE_BPS`,
  `_claim_verdicts_agree`'s bucket comparison) are deliberately wide — do not
  tighten them without understanding this directly trades off against
  UNDETERMINED/leader-rotation risk, which the user explicitly said to avoid.

## Deployment — contract address

User-provided deployed address: `0xcbb558b52682d902203d12F94Bd5D0eFC452E581`
(41 hex chars after `0x` — one longer than a standard 40-char EVM address;
flagged to the user to double-check for a copy/paste typo, not yet
confirmed). Stored in `apps/web/.env.local`
(`NEXT_PUBLIC_CONTRACT_ADDRESS`) — still needs to be added to `apps/api/.env`
(`CONTRACT_ADDRESS`) once `apps/api` exists. Never hardcode it into source
files; never commit `.env.local` / `.env`.

## Open / in-progress work (update as these land)

- [x] `apps/web` scaffold — Next.js 14 (App Router) + Tailwind, "Obsidian
  Verdict" tokens ported into `tailwind.config.ts`. Pages built so far:
  landing (`app/page.tsx`), arena/discovery (`app/arena/page.tsx`), claim
  detail (`app/claims/[id]/page.tsx`), submit evidence
  (`app/claims/[id]/submit-evidence/page.tsx`), create claim
  (`app/claims/new/page.tsx`), profile stub (`app/profile/page.tsx`).
  Wallet connect via `wagmi` (injected connector only — no WalletConnect
  project id configured yet). Logo/favicon: `components/Logo.tsx` /
  `public/favicon.svg` (shield + gavel-strike glyph, cyan on obsidian).
- [x] **GenLayer SDK wired.** Verified `genlayer-js@1.1.8` (confirmed via
  `npm view genlayer-js version` and docs.genlayer.com/api-references/
  genlayer-js) — added as a real dependency in `apps/web/package.json`.
  - `lib/genlayer-client.ts` — read-only client (`createClient({ chain:
    studionet })`, no wallet needed), used from server components
    (arena + claim detail pages). Every helper calls `readContract` then
    `JSON.parse`s the result, matching the contract's JSON-string view
    convention.
  - `lib/genlayer-browser-client.ts` — wallet-connected write client
    (`"use client"`), built per-call from the connected address +
    `window.ethereum`, `client.connect("studionet")` then `writeContract`
    then `waitForTransactionReceipt(..., status: FINALIZED)`. Wired into
    the create-claim and submit-evidence forms in place of the old stub.
  - [x] **Resolved:** `create_claim` / `submit_evidence` return values are
    decoded from the finalized receipt's
    `consensus_data.leader_receipt[0].result` field — confirmed by
    `npm pack genlayer-js@1.1.8` and inspecting its shipped `.d.ts`
    (`writeContract` itself only resolves to the tx hash; the decoded
    execution result lives on the receipt, via `extractLeaderResult()` in
    `genlayer-browser-client.ts`). Create-claim now redirects to
    `/claims/{realId}` (falls back to `/arena` only if the receipt shape
    ever changes and decoding comes back `null`).
  - [x] **Resolved:** claim-detail page's Join Support/Challenge buttons now
    use `components/JoinSideButton.tsx` (client component, inline stake-
    amount input, calls `joinSide()` from `genlayer-browser-client.ts`,
    `router.refresh()`s the server component on success).
  - StudioNet chain id/RPC in `lib/wagmi-config.ts` are still placeholder
    env defaults (`61999` / `studio.genlayer.com/api`) for the wagmi wallet
    connector only — `genlayer-js`'s own `studionet` chain export is what
    actually drives contract reads/writes and needs no manual RPC config.
- [ ] Still to build: leaderboard, notifications, settings, "My Staked
  Claims" / "Evidence Vault" / "Adjudication" pages (linked from
  `components/SideNav.tsx` but not yet implemented), explicit
  loading/empty/error UI states beyond the basic ones already in
  arena/claim-detail, mobile nav (SideNav is `hidden lg:flex` only).
- [x] `apps/api` scaffold — Node/Express + Prisma + Postgres.
  - Wallet auth: `src/auth/siwe.ts` (nonce issued per wallet, signed message
    verified with viem's `verifyMessage`, nonce deleted on success so it
    can't be replayed) + `src/middleware/session.ts` (JWT in an httpOnly
    cookie, 7-day TTL). Routes: `POST /api/v1/auth/nonce`,
    `POST /api/v1/auth/verify`, `POST /api/v1/auth/logout`,
    `GET /api/v1/auth/me`.
  - `src/genlayer.ts` — server-side read-only client, same verified
    `genlayer-js@1.1.8` pattern as `apps/web/lib/genlayer-client.ts`.
  - `src/sync/poller.ts` — the only writer of the Postgres cache; pages
    through `get_claims_page` / `get_claim_evidence` / `get_activity` on a
    `setInterval` (default 30s, `SYNC_INTERVAL_MS`) inside the same
    always-on process, upserting into `Claim`/`Evidence`/`ActivityEvent`.
    Never overlaps a slow poll with the next tick (`running` guard).
  - `src/routes/claims.ts` — discovery/search reads the cache (fast), never
    the contract directly. `src/routes/notifications.ts` — stub CRUD over
    the `Notification` table; nothing populates it yet (see gap below).
  - `src/routes/health.ts` — `GET /api/v1/health`, matches `fly.toml`'s
    health check path exactly.
- [x] `database/schema.prisma` — off-chain cache schema: `User`,
  `AuthNonce`, `Claim`, `Evidence`, `ActivityEvent`, `Notification`. Every
  field mirrors a contract view's JSON output 1:1; nothing here tracks a
  balance the contract doesn't also track.
- [ ] **Open gap:** nothing currently *writes* to the `Notification` table —
  the poller detects state changes (new evidence, verdict reached, claim
  settled) but doesn't yet diff against the previous sync to generate
  notification rows. Needs a "what changed since last poll" comparison
  added to `syncOnce()` in `src/sync/poller.ts`.
- [ ] **Unverified:** Prisma's generated-client resolution across the pnpm
  workspace (`database/schema.prisma` has no explicit `generator.output`,
  so it resolves relative to wherever `pnpm generate` is actually run from
  — a known monorepo rough edge). Run `pnpm --filter @promise-war/api
  prisma:generate` locally and confirm `@prisma/client` imports resolve
  before trusting the Docker build.
- [x] **Deployed and live.** `promise-war-api.fly.dev` — 2 machines in
  `iad`, both passing health checks, `min_machines_running=1` /
  `auto_stop_machines=false` confirmed in `fly status`.
  - Postgres: `promise-war-db` (unmanaged Fly Postgres, shared-cpu-1x/1GB,
    `iad`), attached to `promise-war-api` — attach auto-set the
    `DATABASE_URL` secret with a dedicated `promise_war_api` DB role.
  - Secrets set: `DATABASE_URL` (from attach), `SESSION_JWT_SECRET`
    (random 32-byte hex, generated at deploy time — not recorded anywhere,
    rotate via `fly secrets set` if ever needed), `CONTRACT_ADDRESS`,
    `SYNC_INTERVAL_MS=30000`, `CORS_ORIGINS=http://localhost:3000` (**must
    be updated to the real Vercel URL once `apps/web` is deployed** — right
    now only localhost is allowed to call the API with credentials).
  - Schema applied via `prisma db push` (no migration history yet — this
    was a fresh baseline, not an incremental migration; once the schema
    needs to change, switch to `prisma migrate dev` locally +
    `prisma migrate deploy` in CI/deploy rather than `db push` again).
  - **Real bug found and fixed along the way:** `prisma generate` fails
    inside a pnpm workspace when the schema's own directory (`database/`)
    has no `package.json` — it tries to self-heal by shelling out to
    `pnpm add prisma@... -D --silent`, which fails non-interactively. Fixed
    with a root `.npmrc` (`shamefully-hoist=true`) — this must ship in the
    Docker build context (`apps/api/Dockerfile`'s `deps` stage COPYs it
    before `pnpm install`) or the container build fails the same way.
  - Also added `apt-get install openssl` to both Docker stages — Prisma's
    query engine needs libssl and `node:20-slim` doesn't ship it.
  - `apps/api` had to become an ESM package (`"type": "module"` +
    `moduleResolution: "NodeNext"` + explicit `.js` extensions on every
    relative import) because `genlayer-js` ships ESM-only.
  - Verified end-to-end locally before deploying: `pnpm install` →
    `prisma generate` → `tsc --noEmit` → `pnpm build` → booted
    `dist/index.js` against a fake DB and confirmed a clean `503` (not a
    crash) — this is why the real deploy worked on the first real attempt.
- [x] **Deployed and live.** `apps/web` is on Vercel:
  https://promise-war.vercel.app (project `promise-war`, scope
  `adebiyi2002gmailcoms-projects`). Production env vars set:
  `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_STUDIONET_CHAIN_ID`,
  `NEXT_PUBLIC_STUDIONET_RPC_URL`, `NEXT_PUBLIC_API_BASE_URL` (pointing at
  the live Fly API). `apps/api`'s `CORS_ORIGINS` secret was updated from
  `localhost:3000` to this real URL and redeployed with zero downtime
  (rolling update across both machines) — cross-origin cookie-based auth
  between the two now actually works, not just in theory.
  - **Real type bugs fixed before deploying** (same class of bug as the API
    build, not previously caught because `tsc --noEmit` hadn't been run on
    `apps/web` yet): `genlayer-js`'s `writeContract` per-call `account`
    param expects a full viem `Account` object, not a plain address string
    — removed the redundant per-call `account` (the client already has one
    from `createClient`). Also typed every contract-call's `args` array as
    `CalldataEncodable[]` instead of `unknown[]` in both
    `lib/genlayer-client.ts` and `lib/genlayer-browser-client.ts`.
  - Verified with a real `next build` locally (7 pages, arena/landing/
    profile/create-claim statically prerendered, claim-detail +
    submit-evidence server-rendered on demand) before running
    `vercel deploy --prod`.
- [ ] Wire `NEXT_PUBLIC_CONTRACT_ADDRESS` / `CONTRACT_ADDRESS` once the user
  provides the deployed address (see above — blocked on user action).

## Contract verification against the live deployment (2026-08-26)

Ran a real read-test script (genlayer-js@1.1.8) against
`0xcbb558b52682d902203d12F94Bd5D0eFC452E581` on StudioNet — confirmed the
address is actually 40 hex chars (an earlier flag in this file was a
counting error, now corrected), `getContractSchema()` returns the full
30-method schema cleanly (no "could not load contract schema" error), and
all read views (`get_version`, `is_paused`, `get_categories`,
`get_claim_count`, `get_platform_stats`, `get_claims_page`,
`get_claim_evidence`, `get_activity`, `get_reputation`,
`get_withdrawable_balance`) return clean, correctly-typed results.
`get_claim(0)` correctly rejects (no claim exists yet) — a clean
deterministic rejection, not an undetermined/consensus error.

**Write-path testing — complete, two full scenarios run against the live
deployment.** (First test account, `0xcb196f7B67A15C56eA1F358729f23B7f4C81353F`,
was accidentally left with an unrecoverable private key — a real mistake,
noted so it isn't repeated: `createAccount()` with no args returns an
account whose serialized JSON does NOT expose the private key; must use
`generatePrivateKey()` from `viem/accounts` first, then
`createAccount(privateKey)`, and persist the key immediately. New test
account `0xc5aC16b67a163BDA8493aA4A12A7f73624a14f9a`, key saved to
`/tmp/gltest/test-account.json` — ephemeral scratch, not part of the repo.)

**Scenario 1 — claim id 3** (`get_withdrawable...` full lifecycle with weak
evidence): create_claim (100 GEN opening SUPPORT stake) → join_side
CHALLENGE (50 GEN) → submit_evidence SUPPORT (docs.genlayer.com homepage,
5 GEN) → submit_evidence CHALLENGE (example.com placeholder, 5 GEN) →
request_adjudication. Real GenVM web-fetch + LLM correctly classified BOTH
evidence items as `MATERIALLY_IRRELEVANT` (neither source actually
addressed the claim) with a 50% slash each, and correctly rendered
`NOT_YET_VERIFIABLE` for the claim overall — the safe nonterminal path,
exactly as designed. `settle_claim_sides`/`claim_side_payout` were then
attempted anyway (a bug in the *test script*, not the contract) and were
cleanly rejected with `[EXPECTED] claim verdict is not decisive — cannot
settle sides` (status `"rollback"`, not a VM crash) — confirming the
contract's guard rails work. `settle_claim_evidence` +
`claim_evidence_payout` succeeded independently (evidence settlement isn't
gated on a decisive verdict), correctly paying out 50% of each 5 GEN
evidence stake after the slash. `withdraw` correctly zeroed the balance.

**Scenario 2 — claim id 4** (full happy-path settlement): create_claim
(20 GEN opening SUPPORT stake, statement designed to be unambiguously
true) → submit_evidence SUPPORT (same docs.genlayer.com URL, framed
on-point this time) → request_adjudication. Verdict: `FULFILLED`, with a
detailed, well-reasoned justification. Then the full settlement chain all
succeeded: `settle_claim_sides` → `settle_claim_evidence` →
`claim_side_payout` (SUPPORT) → `claim_evidence_payout` → `withdraw` (one
real GEN transfer). `get_withdrawable_balance` correctly `0` after.
`get_reputation` correctly shows `wins: 1, evidence_rewards: 1, score: 23`
(15 win points + 8 evidence-reward points). Finally, called
`claim_side_payout` a **second** time on the same claim/side as a
double-spend guard test — cleanly reverted with
`[EXPECTED] this stake has already been claimed`, confirming the
zero-then-transfer discipline actually prevents a double payout in
practice, not just in the code's intent.

**Net result: zero GenVM crashes, zero undetermined/leader-rotation
consensus failures, across every write path tested** (side stakes,
evidence stakes, real web-fetch, real LLM adjudication with two different
genuinely-reasoned verdicts, decisive settlement, nonterminal handling,
guard-rail rejections, double-spend prevention). Every "ERROR" that
appeared was a correct, intentional `[EXPECTED]` UserError rejection —
never a VM crash or a bad consensus result.

Both test claims (ids 3 and 4) are real, permanent onchain state and are
already visible end-to-end: synced into the Postgres cache by the live
poller and confirmed rendering on `promise-war.vercel.app/arena`,
`/claims/4`, and `/vault`.

## Frontend/backend integration audit (2026-08-26)

Found and fixed a real gap: `apps/web`'s arena and claim-detail pages were
reading directly from the contract on every server-render
(`lib/genlayer-client.ts`), never touching the Postgres cache
`apps/api`'s poller builds — defeating the entire purpose of having a
backend. Fixed: both pages now call `lib/api-client.ts` (hits
`NEXT_PUBLIC_API_BASE_URL`, i.e. the Fly API) first, falling back to a
direct contract read only if the API is unreachable or hasn't synced yet.
This is what "frontend calls the contract, backend polls contract to
frontend" actually means end to end now — not just in the architecture
doc.

Also closed the notification-diffing gap flagged earlier:
`apps/api/src/sync/poller.ts` now compares each claim's previous vs. new
`status` and each evidence row's previous vs. new `adjudicated` flag on
every poll tick, and creates real `Notification` rows (claim status
changes -> notify the creator; evidence adjudicated -> notify the
submitter, with a distinct message when flagged as maliciously
manipulated). Wired all the way to the frontend: `lib/auth-client.ts` (SIWE
sign-in against `apps/api`) + `components/NotificationsPanel.tsx`, shown on
`/profile`. Found and fixed a real bug along the way: the session cookie
was `SameSite=Lax`, which silently drops cross-origin cookies — Vercel and
Fly are different origins in production. Fixed to `SameSite=None; Secure`
in production (`apps/api/src/middleware/session.ts`), `Lax` still used in
local dev (both on localhost, no HTTPS needed).

Added two new backend endpoints to support pages that were previously
404ing (see below): `GET /api/v1/evidence` (global evidence feed) and
`GET /api/v1/my-activity?address=0x...` (claims a wallet has touched,
reconstructed from the activity log since the contract has no enumerable
"list all stakers" view).

## Wallet connect + missing pages fix (2026-08-26)

User reported "wallet connect has issues" and "most pages are 404". Both
were real bugs:

- **Wallet connect:** the app only offered wagmi's bare `injected()`
  connector — MetaMask-or-nothing, no mobile support, no polished modal.
  Replaced with **Reown AppKit** (project id `684530160ef98fd51cd4588f4347a9fd`,
  provided by the user — public by design, not a secret) via
  `@reown/appkit` + `@reown/appkit-adapter-wagmi`. Required bumping `wagmi`
  2.12→**3.7.6**, `viem` 2.21→**2.55.19**, and `typescript` 5.6→**5.9.3** in
  `apps/web` to satisfy AppKit's peer requirements (all verified with a
  real `pnpm install` — no peer-dependency warnings remain).
  `lib/wagmi-config.ts` now builds the StudioNet network with
  `@reown/appkit/networks`' own `defineChain` (not viem's — AppKit needs
  the CaipNetwork shape: `chainNamespace` + `caipNetworkId`).
  `app/providers.tsx` calls `createAppKit(...)` once at module scope;
  `components/ConnectWalletButton.tsx` now opens the AppKit modal via
  `useAppKit()` instead of wagmi's raw `connect()`.
  - **Build fallout, fixed:** AppKit's wagmi adapter pulls in Coinbase's
    "Base Account" connector by default, which pulls in
    `@coinbase/cdp-sdk`'s x402 payment-protocol client — many `@x402/*`
    submodules, none installed (optional peers we don't use). Cut off at
    the root via `resolve.alias` in `next.config.mjs`
    (`@base-org/account: false`, `@coinbase/cdp-sdk: false`), plus the
    pre-existing `pino-pretty`/`lokijs`/`encoding` externals for
    WalletConnect's logger.
- **404s:** `components/Navbar.tsx` and `components/SideNav.tsx` and
  `components/Footer.tsx` linked to `/intel`, `/laws`, `/vault`, `/staked`,
  `/adjudication`, `/privacy` — none of these pages existed. Built all six:
  - `/vault` — global evidence feed (new `GET /api/v1/evidence` endpoint).
  - `/staked` — "My Staked Claims", wallet-gated, backed by the new
    `GET /api/v1/my-activity` endpoint.
  - `/adjudication` — lists claims past their evidence deadline with a
    `components/RequestAdjudicationButton.tsx` that calls
    `request_adjudication()` directly (permissionless, no GEN required,
    only gas) and decodes the real verdict from the finalized receipt.
  - `/intel` — a plain investigation-strategy guide (static content).
  - `/laws` — the actual contract rules (verdict payout bps, evidence
    slash tiers, timeout window, protocol fee), written to match
    `contracts/promise_war_contract.py`'s real constants, not marketing
    copy.
  - `/privacy` — honest, minimal description of what the off-chain backend
    actually stores (wallet address on sign-in, cached public onchain
    data) — no fabricated legal boilerplate.

**Not yet redeployed** — verifying `next build` succeeds locally with all
of the above before pushing to Vercel and Fly again (last full deploy was
before this round of fixes).

## Treasury, deadline-staking bug, and full-lifecycle audit (2026-08-26)

**Treasury balance:** `accrued_treasury_wei = 5,400,000,000,000,000,000` = **5.4 GEN**
(verified exactly: 0.4 GEN protocol fee from claim #4's settlement + 5.0 GEN
from claim #3's two 50%-slashed evidence stakes going entirely to the
treasury under the current slash-split implementation — see the note
below). **Not swept** — `sweep_treasury()` is owner-only and the owner is
the deployer's own wallet, never an agent test account; the user must call
it themselves. Added `sweepTreasury()` to
`lib/genlayer-browser-client.ts` for a future admin UI, but there is no
admin page yet (see Open items).

**"Deadline passed but staking still allowed" — root cause found and
fixed.** Verified directly against the contract (not assumed): calling
`join_side` on a claim whose participation deadline had passed, and whose
cached `status` was still `ACTIVE` (nobody had ever called
`advance_to_evidence_maturing()`), was cleanly rejected by the contract
with `[EXPECTED] participation deadline has passed`. **The contract was
never the problem.** The bug was entirely in the frontend: `JoinSideButton`
and the submit-evidence form rendered as fully active with no client-side
deadline check, and worse, the Adjudication page's eligibility filter
(`ELIGIBLE_STATUSES = [EVIDENCE_MATURING, READY_FOR_REVIEW,
NOT_YET_VERIFIABLE]`) silently excluded plain `ACTIVE` claims entirely —
so a claim stuck in ACTIVE past its deadline was neither blocked from
staking in the UI NOR reachable from the one page that could fix it.
Fixed:
- `lib/format.ts` — added `isPast(unixTs)`, the shared client-side deadline
  check every gating decision below now uses instead of trusting cached
  `status`.
- `components/JoinSideButton.tsx` — takes a `disabledReason` prop; the
  claim-detail page now computes `participationOpen` from the real
  timestamp and renders a disabled explanation instead of a live button
  once it's false.
- `app/claims/[id]/submit-evidence/page.tsx` — now fetches the claim on
  mount and disables Sign & Submit (with a visible banner) once
  `evidenceWindowOpen` is false.
- `app/adjudication/page.tsx` — eligibility filter fixed to
  `["ACTIVE", "EVIDENCE_MATURING", "NOT_YET_VERIFIABLE"].includes(status) &&
  isPast(evidence_deadline_ts)`, matching `request_adjudication()`'s own
  check exactly instead of an incomplete status whitelist.

**Second, more serious bug found during the same audit pass and fixed:**
`writeAndWait()` in `genlayer-browser-client.ts` never checked whether a
transaction actually reverted — `waitForTransactionReceipt` resolves
normally (does not throw) for a rejected call; the revert shows up as
`consensus_data.leader_receipt[0].result.status === "rollback"` on an
otherwise-normal receipt. Without this check, **every write in the
frontend silently treated a cleanly-rejected transaction as a success** —
e.g. staking after a deadline would show no error and the UI would
optimistically refresh as if it worked. Fixed: `writeAndWait` now inspects
`result.status` and throws with the real revert message if it's
`"rollback"`, so every calling component's existing try/catch (which
already expected failures) now actually fires. Also fixed a related
decoding bug: a string-typed return value's `payload.readable` includes
literal surrounding quote characters (`"\"FULFILLED\""`), unlike an int
return (`"3"`, no quotes) — `extractLeaderResult` now `JSON.parse`s the
readable payload uniformly instead of using it raw.

**Third gap found: no UI ever exposed settlement, payout, or withdrawal.**
`settle_claim_sides`, `settle_claim_evidence`, `claim_side_payout`,
`claim_evidence_payout`, `withdraw`, `cancel_claim`,
`claim_adjudication_timeout`, `claim_side_refund`, and
`claim_evidence_refund` existed only in test scripts — a real user winning
a claim through the deployed frontend had no way to actually collect their
GEN. Built:
- `components/SettlementPanel.tsx` — on the claim-detail page, shows
  Settle Sides / Settle Evidence once a verdict exists, per-side payout
  claim buttons once decisive, refund buttons once
  cancelled/expired/invalid, a timeout-recovery button once
  `evidence_deadline_ts + 7 days` has passed, and a cancel button for the
  creator while still eligible. Every button is optimistic — it doesn't try
  to track onchain settlement flags the contract doesn't expose via any
  view — and relies on the contract's own clean rejection ("already been
  claimed", "already settled") if clicked redundantly.
- `components/EvidencePayoutButton.tsx` — per evidence item, visible only
  to its own submitter, claims payout or refund.
- `components/WithdrawBalanceButton.tsx` — added to `/profile`, reads
  `get_withdrawable_balance` live and lets the user pull their credited
  balance out as a real GEN transfer.

**Full lifecycle audit — 5 regression tests run against the live
contract, all PASS:** deadline-expired staking rejected; deadline-expired
evidence submission rejected; `request_adjudication` now correctly usable
on a stale-ACTIVE claim (validates the Adjudication page fix);
double-settling an already-settled claim rejected; cancelling a claim that
already has evidence/challenge stake rejected. Every rejection was a clean
`[EXPECTED]` UserError — no VM crash, no undetermined consensus result.

**Noted for later, not yet acted on:**
- StudioNet's public RPC enforces a **30 requests/minute** rate limit (hit
  once during audit read-testing). `apps/api`'s sync poller
  (`SYNC_INTERVAL_MS=30000`) makes 3 calls per claim per tick
  (`get_claims_page` + `get_claim_evidence` + `get_activity`) — fine at 5
  claims, but will need batching or a longer interval once claim count
  grows enough to approach 30 calls per 30s window.
- The slash-split design (`slash_treasury_share_bps` /
  `slash_pool_share_bps`) currently sends the *entire* slashed amount to
  the treasury in `claim_evidence_payout` (both shares are credited to
  `accrued_treasury_wei` — see the comment in
  `contracts/promise_war_contract.py` acknowledging "no live per-staker
  redistribution channel"). This matches the deployed contract's actual
  behavior (confirmed by the exact 5.4 GEN treasury total) — not a bug,
  but worth knowing the `slash_pool_share_bps` config knob doesn't
  currently do what its name implies.
- [x] **Admin UI built** — `app/admin/page.tsx` (unlinked from nav
  deliberately; contract-enforced access, not link-based obscurity).
  Exposes sweep_treasury, pause/unpause, set_protocol_fee_bps,
  set_slash_shares_bps, set_min_stakes, set_treasury_address (with a
  confirm dialog since it's irreversible from the page). Since there is
  still no `get_owner()` view on the deployed contract, the page cannot
  hide itself from a non-owner wallet — every action is optimistic and
  simply surfaces the contract's own `[EXPECTED] only the owner may call
  this` rejection. Live at `promise-war.vercel.app/admin`.

## Third-party audit response (2026-08-26) — score 2,520/4,000

User pasted a full external audit report. Fixed everything in scope for an
agent to fix; two items are explicitly out of scope and documented below
rather than silently skipped.

### All 5 blocking findings — fixed in `contracts/promise_war_contract.py`

1. **Payout dust stranded** — `claim_side_payout()`'s
   `pool_amount * stake_amount // side_total` floors per claimant with no
   ledger tracking the shortfall. Fixed with two new TreeMaps
   (`side_claimed_stake_wei`, `side_distributed_wei`) tracking cumulative
   claimed stake and cumulative distributed wei per (claim, side); the
   claimant whose payout brings cumulative claimed stake up to the side's
   full total receives whatever remains of `pool_amount` instead of
   another floored slice — guarantees full distribution, zero stranded
   remainder, independent of claim order.
2. **Slash split not implemented** (both treasury_share AND pool_share
   were credited to `accrued_treasury_wei` — winning side got nothing) —
   fixed with a real redesign: `settle_claim_evidence()` now iterates
   every adjudicated evidence item ONCE, aggregates the treasury share
   (credited immediately) and pool share (stored in the new
   `Claim.evidence_slash_pool_wei` field) across the whole claim.
   `claim_side_payout()` adds this pool to the winning side's distributable
   amount before running the (now dust-free) per-staker split.
   `claim_evidence_payout()` was simplified to touch only the submitter's
   own principal — it no longer touches `accrued_treasury_wei` at all
   (that per-evidence credit was the double-credit bug). New ordering
   constraint: a decisive verdict now requires
   `evidence_payouts_settled` before any `claim_side_payout()` call, so
   the pool total is final before anyone claims from it.
3. **NOT_YET_VERIFIABLE couldn't actually accept new evidence** —
   `submit_evidence()` now accepts `STATUS_NOT_YET_VERIFIABLE`, and
   `request_adjudication()` extends `evidence_deadline_ts` forward to
   `now + REVIEW_RETRY_COOLDOWN_SECONDS` (6h) every time it lands on
   NOT_YET_VERIFIABLE — the reopening is now real, not just documented.
4. **URL fetching had no source controls** — `_normalize_url()` now
   requires `https://` (rejects plaintext `http://`) and rejects a literal
   blocklist of loopback/private/link-local/cloud-metadata hosts
   (`169.254.169.254` etc.). Documented honestly in `_fetch_evidence_text`'s
   docstring what this does NOT solve: DNS-resolution-time SSRF and
   redirect-chain behavior happen inside GenVM's own
   `gl.nondet.web.render`/`.get` implementation, outside what this
   contract's Python can inspect.
5. **Creator cancellation could freeze a third party's stake** —
   `cancel_claim()`'s old check (`challenge_stake==0 and
   evidence_count==0`) missed a second address joining SUPPORT. Replaced
   with a new `Claim.third_party_joined` flag, set the moment any address
   other than the creator stakes a side or submits evidence (in
   `_apply_side_stake` and `submit_evidence`), and required false in
   `cancel_claim()`.

Also exposed `side_payouts_settled`, `evidence_payouts_settled`, and
`evidence_slash_pool_wei` in `_claim_dict()`'s JSON output — the frontend's
`SettlementPanel` no longer has to render every settlement action
optimistically; it now reflects ground truth once the cache picks these
fields up from a redeployed contract.

### Non-blocker fixes

- **Poller activity pagination** (`apps/api/src/sync/poller.ts`) — was
  hardcoded to `get_activity(claimId, 0, 100)`, silently losing any event
  beyond the 100th on an active claim. Rewrote as `syncActivity()`, which
  pages backward until it hits an already-cached event or a 20-page safety
  cap (2000 events/claim/tick).
- **API input validation** (`apps/api/src/routes/claims.ts`) — replaced
  raw `Number(req.query.x)` parsing with zod schemas (`pageQuery`,
  `idParam`, `addressQuery`) returning a clean 400 with field-level errors
  instead of NaN/negative values silently reaching Prisma or throwing an
  unhandled 500.
- **`/laws` page updated** to describe the corrected economics accurately
  (dust-free distribution, winning-side pool redistribution, HTTPS-only +
  host blocklist, the real cancellation gate) — this doubles as the
  audit's recommendation #6 ("public economic rules page").
- **Static test suite added**: `contracts/test/test_promise_war_static.py`
  (12 tests, AST-based like `promise-to-proof-registry`'s own suite, since
  `from genlayer import *` can't be imported outside GenVM to unit-test by
  execution) — regression-tests every one of the 5 fixes above plus the
  general safety invariants (single `emit_transfer` chokepoint, GenVM-safe
  storage types, schema-safe method signatures). All 12 pass.
  `genvm-lint check` also passes cleanly (0 errors).
- **CI workflow added**: `.github/workflows/ci.yml` — contract
  (py_compile + pytest static tests + genvm-lint if present on the
  runner), frontend (tsc + build), backend (prisma generate + tsc).
  **Inert until a git repo exists and gets pushed to GitHub** — this
  project has no `.git` yet.

### Explicitly out of scope, not implemented

- **Multisig/timelock for owner controls** — the audit's item #7. This
  needs an actual infrastructure decision (a Safe deployment? a
  from-scratch timelock contract? which signers?) that only the user can
  make, not something to implement unilaterally. `/admin` remains a
  single-EOA-owner page for now.
- **Full adversarial/property/fuzz test suite against a live StudioNet
  instance** — genuinely substantial additional work (the audit's own
  path-to-4000 item #2). The static test suite above covers structural
  regressions; live-consensus behavior is instead covered by the real
  write-path test campaign already run against the deployed contract (see
  the "Contract verification" and "Full lifecycle audit" sections above) —
  not the same thing as CI-gated adversarial fuzzing, and the audit is
  right that this gap remains.
- **Redirect-chain / content-type / response-size policy on evidence
  fetches** — as documented directly in `_fetch_evidence_text()`'s
  docstring, this lives inside GenVM's own nondet fetch implementation,
  not in application code this repo controls.

### Redeployment required

**None of the contract fixes are live** — the deployed contract at
`0xcbb558b52682d902203d12F94Bd5D0eFC452E581` is immutable; only a fresh
deployment (a new address) picks up the fixed source. Per the standing
constraint in this file, the user deploys, never the agent. Frontend/API
were redeployed with the new field-mapping code regardless — it degrades
gracefully against the still-old live contract (missing new fields read as
`undefined`/falsy, e.g. `side_payouts_settled` defaults to "not yet
settled" until a new contract is live) — so nothing broke by shipping
ahead of the redeploy. Once a new address exists, it needs to be re-wired
into `apps/web/.env.local` (Vercel) and `apps/api`'s `CONTRACT_ADDRESS`
secret (Fly), same as the original deployment.

## Redeployed contract + comprehensive live test campaign (2026-08-26)

**New deployed address: `0x88023605B47E3F1d144C7e47dB0CEe36e2e860c6`** —
carries every audit fix from the previous section. Wired into
`apps/web/.env.local`, Vercel (`NEXT_PUBLIC_CONTRACT_ADDRESS`), and Fly
(`CONTRACT_ADDRESS` secret). Old contract's cached claims were truncated
from Postgres for a clean slate (`TRUNCATE ... RESTART IDENTITY CASCADE`).
`getContractSchema()` verified loading cleanly (37 methods, no "could not
load contract schema" error) before wiring it in anywhere.

**Every regression test re-run against the live redeployed contract, with
real two-account multi-party scenarios this time — all PASS:**

- **Blocker #1 (dust) — mathematically proven, not just asserted.** Two
  distinct accounts staked deliberately non-round amounts
  (3.333333333333333333 / 6.666666666666666667 GEN) on the same side of a
  claim that reached FULFILLED. Payouts: 3266666666666666666 wei +
  6533333333333333334 wei = **9800000000000000000 wei exactly**, matching
  the distributable pool to the wei. Zero stranded dust, proven by direct
  balance-delta arithmetic before/after each claim, not by inspection of
  the code.
- **Blocker #2 (slash pool) — real cross-address settlement.** Claim with
  A on SUPPORT (strong, on-point evidence) and B on CHALLENGE (deliberately
  weak evidence) reached FULFILLED. A's `claim_side_payout` paid out
  correctly; B's paid out zero and B's subsequent `withdraw()` correctly
  reverted with `no withdrawable balance` (clean rejection, not a silent
  no-op). Reputation tracked precisely across the whole test campaign: A
  ended at `wins:3, evidence_rewards:1, score:53`; B ended at
  `wins:1, losses:1, score:10` — every number traces to a specific real
  settlement across multiple claims.
- **Blocker #3 (NOT_YET_VERIFIABLE reopening) — confirmed on-chain.** First
  adjudication pass (deliberately weak evidence) returned
  NOT_YET_VERIFIABLE; `evidence_deadline_ts` was observed extending forward
  by exactly `REVIEW_RETRY_COOLDOWN_SECONDS` (6h) in the same transaction.
  A second `submit_evidence` call into that reopened window succeeded —
  before the fix this would have reverted with "evidence deadline has
  passed".
- **Blocker #4 (URL controls) — every case tested, all rejected
  correctly:** plaintext `http://` (`must start with https://`),
  `https://localhost/...` (`must have a valid public hostname`),
  `https://169.254.169.254/...` cloud metadata (`host is not allowed`),
  `https://10.0.0.5/...` private range (`host is not allowed`).
- **Blocker #5 (cancel_claim third-party guard) — confirmed on-chain.**
  Creator A created a claim with no opening stake; third party B joined
  SUPPORT; A's `cancel_claim` call correctly reverted with
  `cannot cancel once another participant has joined` — the exact scenario
  the old check missed.
- **Admin access control** — `pause`, `sweep_treasury`,
  `set_protocol_fee_bps`, `set_slash_shares_bps`, `transfer_ownership` all
  correctly rejected the non-owner test account with
  `only the owner may call this`. `is_paused` confirmed still `false`
  throughout (no accidental pause took effect).
- **Double-claim guards** — a second `claim_side_payout` call on an
  already-claimed stake correctly reverted with
  `this stake has already been claimed`.
- **Permissionless adjudication** — `request_adjudication` triggered
  successfully by a non-creator address (B), confirming the permissionless
  design works for any caller, not just the claim creator.

Every single write across ~35 transactions came back `execution_result:
SUCCESS` (or a clean `[EXPECTED]` rejection where one was correctly
expected) — **zero GenVM crashes, zero undetermined/leader-rotation
consensus failures**, across real staking, real multi-party settlement,
real web-fetch, real LLM adjudication, and deliberate adversarial inputs.

All test claims are real, permanent onchain state, already synced into
the Postgres cache and confirmed rendering live on the frontend (arena,
claim detail pages, evidence vault, activity/notification feeds) — not
placeholder data, and not something that needs separate verification.

### Real operational finding: StudioNet's public RPC rate limit

`apps/api`'s sync poller started failing every tick with
`Rate limit exceeded: 500 requests per hour` partway through this test
campaign — **not a bug in the fix, but the volume of the test campaign
itself** (dozens of transactions × multiple reads each, across ~35
minutes) exhausting StudioNet's shared public-gateway quota, compounded by
both Fly machines independently polling every 30s (double the request
rate for no benefit, since they're redundant, not sharded). This directly
confirms a scalability concern flagged speculatively in this file after
the very first live test (`SYNC_INTERVAL_MS=30000 ... will need batching
or a longer interval once claim count grows`) — now empirically observed
in production with just 9 claims.

**Mitigation applied:** `SYNC_INTERVAL_MS` bumped from 30000 → 180000 (3
min) via `fly secrets set`. This reduces steady-state load going forward
but does not retroactively clear the already-exhausted hourly quota — the
poller will resume normal operation once StudioNet's rolling 1-hour window
clears on its own. The Postgres cache may show stale data for claims 7/8
until then; the onchain state itself (verified directly via
`get_claim`/`get_claim_evidence` throughout this test campaign) is
correct and was never at risk — this is purely a caching-layer staleness
window, not a data-correctness issue.

**Not yet fixed, flagged for a future pass:** the poller has no
rate-limit-aware backoff (a 429/`Rate limit exceeded` response should back
off exponentially rather than retry on the next fixed tick) and both Fly
machines run fully independent, redundant poll loops rather than one
leader instance — worth addressing before claim volume grows further in
real usage (as opposed to this test campaign's artificial burst).

## Second-round audit response — score 3,420/4,000 (2026-08-26)

User pasted a re-audit confirming all 5 original blockers fixed and finding
one new one: `settle_claim_evidence()` only required a non-empty verdict,
so it could run while a claim was `NOT_YET_VERIFIABLE` — a status
explicitly designed to be reopenable. Sequence: settle evidence early →
claim reopens → new evidence arrives → gets adjudicated and slashed later →
that slash can never be added to the already-finalized
`evidence_slash_pool_wei`, silently unaccounted for.

**Fixed** in `contracts/promise_war_contract.py`'s `settle_claim_evidence()`:
added `_require(claim.verdict in DECISIVE_VERDICTS or claim.verdict ==
VERDICT_CLAIM_INVALID, ...)` — only a truly terminal verdict can trigger
settlement now; `NOT_YET_VERIFIABLE` is rejected outright. Simplified the
now-unreachable "no winning side" fallback branch inside the function
(dead code once the guard above holds). Frontend's
`components/SettlementPanel.tsx` updated to match — no longer shows a
"Settle Evidence" button for a `NOT_YET_VERIFIABLE` claim, shows an
explanatory note instead.

**Contract redeployment still needed** for this specific fix to take
effect onchain (the currently-deployed `0x88023605...` still has the old,
narrower window — real risk only materializes for a claim that reaches
NOT_YET_VERIFIABLE, gets settled, then genuinely reopens and gets slashed
evidence on a later pass; low likelihood in practice so far, but a real
gap until redeployed).

**Other items from the re-audit:**
- **Poller "still only reads 100 events"** — checked; this was already
  fixed in the previous round (`syncActivity()` pages backward through
  the full log). The re-audit's snapshot appears stale on this specific
  point; no further change needed, verified by re-reading the current
  `apps/api/src/sync/poller.ts`.
- **CI's genvm-lint step was optional** — fixed. It turns out
  `genvm-lint` IS a real pip package (`genvm-linter==0.11.0`, confirmed via
  `pip show`) — the earlier assumption that it needed a separate CLI/
  devtools install was wrong. CI now does `pip install genvm-linter==0.11.0`
  and runs `genvm-lint check` unconditionally (fails the build on any lint
  error), not best-effort.
- **README was stale** — rewritten to reflect reality: contract deployed
  and live, `apps/web` and `apps/api` both built and deployed (not
  "not yet scaffolded"), links to the live URLs, corrected local-dev
  commands (there was never a `pnpm dev:web`/`dev:api` root script; the
  correct invocation is `pnpm --filter @promise-war/web dev` etc.).
- **Added property/conservation tests** for the audit's explicit ask
  ("adversarial tests for arbitrary claimant ordering, reopen/settle
  sequencing, slash conservation, payout conservation") —
  `contracts/test/test_settlement_math_properties.py`: a faithful
  pure-Python mirror of the two settlement algorithms (claim_side_payout's
  dust-absorption loop, settle_claim_evidence's aggregate slash split),
  property-tested against 500 randomized trials each for payout
  conservation (sum of payouts == pool, exactly, for arbitrary stake
  counts/amounts/claim order), order-independence of the total (individual
  shares ARE order-dependent by design — whoever claims last absorbs the
  remainder — but the total never varies), slash conservation
  (treasury+pool == total slash, exactly), and a direct model of the
  reopen/settle sequencing bug showing the exact amount the old sequencing
  would have lost. This is explicitly a mirror of the algorithm, not an
  execution of the real contract (still can't `import genlayer` outside
  GenVM) — real-contract behavioral coverage instead comes from the live
  multi-account test campaign already run against the deployed contract.
  19 tests total in `contracts/test/`, all pass.
- **DNS rebinding / redirect-following SSRF gap** — correctly noted as
  still open by the audit; already documented as a known, unclosed
  limitation in `_fetch_evidence_text()`'s docstring and the `/laws` page.
  No further contract-layer fix is possible here (lives inside GenVM's own
  fetch implementation) — restated for clarity, not re-"fixed".

## Third-round audit response — score 3,760/4,000 (2026-08-26)

User confirmed the round-2 fix is correct ("I found no remaining critical
economic or lifecycle defect in the re-audited scope") and asked for the
remaining softer items. Fixed what was in scope for an agent to fix
unilaterally; asked before the one item that genuinely needed a user
decision.

**Owner controls → timelock.** Asked the user: full multisig needs them to
name signer addresses (their decision, not mine); a timelock needs no
extra input and is real protection on its own. They chose timelock-only
for now. Implemented as an internal queue-then-execute pattern INSIDE
`promise_war_contract.py` itself — deliberately not a separate Timelock
contract calling into PromiseWar via cross-IC calls, since I could not
verify GenVM's IC-to-IC call syntax against current docs and didn't want
to guess at an unverified API for something this security-sensitive (the
`gl.get_contract_at(...)` mechanism is referenced only in a comment
elsewhere in this file, never actually exercised). Every sensitive admin
action (`pause`, `unpause`, `set_protocol_fee_bps`, `set_slash_shares_bps`,
`set_min_stakes`, `set_treasury_address`, `transfer_ownership`) now has a
paired `queue_<action>()` that records `now + ADMIN_TIMELOCK_DELAY_SECONDS`
(fixed 48h constant, deliberately not owner-settable — a timelock that can
shorten its own delay isn't one) and the original method now requires that
exact queued action to exist and be past its delay before executing.
`sweep_treasury()` stays instant and undelayed on purpose (documented in
its own comment: it can only move funds to `treasury_address`, and
changing THAT address is itself timelocked, so the destination is already
protected). New view: `get_pending_admin_action(action_key) -> int` for
frontend transparency (returns 0 if never queued or already executed).

**Real bug caught during implementation, before it shipped:** the first
draft of `_consume_admin_action` zeroed the pending timestamp to mark an
action "used", but 0 also satisfies `now >= executable_at` on every
subsequent call — meaning a consumed action would have stayed replayable
forever. Fixed with an explicit `> 0` liveness check distinguishing
"never queued" / "already consumed" from "queued and ready". Added
`test_consume_admin_action_cannot_be_replayed` specifically so this
class of bug can't regress silently.

Frontend: `components/../app/admin/page.tsx` rewritten around a generic
`TimelockedAction` component — shows "Queue" while nothing's pending, a
live countdown while queued-but-not-ready, "Execute" once the delay has
elapsed. `lib/genlayer-browser-client.ts` gained matching `queue_*`
wrapper functions for all 7 actions.

**genvm-lint / test suite after the timelock addition:** 45 methods (was
37), lint still clean, 22/22 static tests pass (added 3 new: timelock
presence on every listed action + sweep_treasury's deliberate exemption,
the delay being a true constant, and the replay-bug regression above).

**Multisig — explicitly deferred, not silently dropped.** Noted in this
file as open: layering an N-of-M multisig as the timelock queue's own
`owner` (rather than a single EOA) is the natural next step once the user
names signers and a threshold.

**Other items, not independently actionable:**
- **DNS rebinding / redirect SSRF** — audit correctly reconfirmed this
  stays open; already documented as an acknowledged, layer-inappropriate
  limitation (lives inside GenVM's own fetch implementation). No new
  action.
- **CI-gated StudioNet integration tests** — genuinely substantial new
  infrastructure (funded test-wallet secrets in CI, or a localnet GenVM
  node in the runner). Not built this round given the scope; the
  structural static suite + the extensive live multi-account test
  campaigns already run directly against both deployed contracts (see the
  sections above) are the current substitute — documented as a real gap
  versus true CI-gated coverage, same as the audit says.
- **External smart-contract/economic review before production capital** —
  outside what an agent can perform; the user's own next step when ready
  for real stakes.

### Real operational finding #2: StudioNet's *daily* RPC quota (5000/day)

The combined weight of two full multi-account test campaigns (round 2 +
round 3) exhausted not just the hourly quota (fixed last round) but the
**daily** one — `Rate limit exceeded: 5000 requests per day` started
appearing in the poller logs on the round-3 redeployment, worse than
before because it doesn't clear until the next day. Root-caused precisely
this time (not just mitigated): **both Fly machines were independently
running a full poll loop on the same interval**, silently doubling
StudioNet RPC usage for zero benefit (identical writes to the same shared
Postgres). Fixed properly in `apps/api/src/sync/poller.ts`:
- **Postgres advisory lock** (`pg_try_advisory_lock`) — only one machine's
  poller actually executes per tick; the other finds the lock held and
  skips cleanly (no wasted RPC calls, no error). Auto-releases if that
  machine's connection drops, so a restart can't cause a permanent
  lockout.
- **Real rate-limit backoff** — `isRateLimitError()` detects both the
  hourly and daily message formats; on a hit, the poller skips all ticks
  for an exponentially growing window (capped at 30 min) instead of
  retrying every fixed interval and guaranteeing another rejection, which
  is exactly what turned one rate-limited moment into a sustained,
  self-inflicted outage during round-2 testing.

This won't retroactively clear the already-exhausted daily quota — the
cache may show stale/incomplete data for a while after this session ends,
same caveat as last round. The onchain state itself (verified directly via
the live test campaign's own reads, not the cache) was never at risk.

## Fourth-round audit response — score en route to 3,950/4,000 (2026-08-26)

New high-priority finding, confirmed correct on inspection: settlement
(`settle_claim_sides`, `claim_side_payout`, `settle_claim_evidence`) was
reading the LIVE global `self.protocol_fee_bps` /
`self.slash_treasury_share_bps` at settlement time, not a value fixed when
the claim was created. The round-3 timelock protects against an *instant*
config change but does nothing to stop an *eventual* one (after its 48h
delay elapses) from applying retroactively to GEN already staked into an
unresolved claim — stakers generally have no exit path once staked, so
"48 hours notice" isn't the same as "your original terms are preserved".

**Fixed** by snapshotting `protocol_fee_bps_snapshot`,
`slash_treasury_share_bps_snapshot`, `slash_pool_share_bps_snapshot` onto
each `Claim` at `create_claim()` time; every settlement path now reads
exclusively from the claim's own snapshot, never `self.protocol_fee_bps`
etc. directly. A future timelocked fee/slash-share change therefore only
ever affects claims created after it executes — exactly the "1. Snapshot
claim economics" item from the audit's own remediation list. Exposed the
three snapshot fields in `_claim_dict()`'s JSON output too, so the
frontend/anyone auditing a specific claim can see exactly what terms it
settled under. Added `test_economic_parameters_are_snapshotted_per_claim_not_read_live`
(23 tests total now, all pass; `genvm-lint` still clean at 45 methods).

**Live-deployment caveat, matching the audit's own note:** this fix is in
source only — `0xcb65245d853F3E702c9961CF8Bd7562387c2bF64` (the contract
carrying the round-3 timelock) predates it and needs yet another
redeployment before this specific protection is live. Waiting on the user
to deploy and provide the next address, per the standing rule in this file
(the agent never deploys or invents an address).

**Not re-addressed this round** (per the audit's own "route to 4,000"
list, items 3–5 — genuinely require either a user decision or scope this
session hasn't undertaken):
- CI-gated StudioNet lifecycle tests (still static/mirrored math + the
  live manual test campaigns, not true CI-gated integration coverage).
- N-of-M multisig as the timelock's owner — still blocked on the user
  naming signers/threshold, same as round 3.
- Redirect/DNS-rebinding fetch risk — still an acknowledged,
  layer-inappropriate limitation, unchanged from prior rounds.

## Known user feedback / preferences

- User wants a genuinely production-scale contract (1000+ lines) that is not
  "too strict" — i.e. tolerance bands must be wide enough that ordinary
  LLM/web variance never triggers unnecessary leader rotation or an
  UNDETERMINED consensus result. This directly shaped
  `_evidence_outcomes_agree` and `_claim_verdicts_agree` in the contract.
- User is deploying the contract themselves — Claude must never deploy or
  invent a contract address.
