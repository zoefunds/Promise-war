# Architecture

## System overview

```
                    ┌─────────────────────────┐
                    │   GenLayer StudioNet     │
                    │  PromiseWar Intelligent  │
                    │       Contract           │
                    │  (source of truth for    │
                    │   money + verdicts)      │
                    └───────────┬──────────────┘
                     reads/writes│
              ┌──────────────────┴───────────────────┐
              │                                       │
    ┌─────────▼─────────┐                  ┌──────────▼──────────┐
    │   apps/web         │  reads (fast)    │   apps/api           │
    │   Next.js frontend  │◄─────────────────│   Express + Prisma   │
    │   (Vercel)          │   cache reads    │   (Fly.io, 24/7)      │
    │                     │                  │                       │
    │  - writes go        │                  │  background poller:   │
    │    DIRECT to chain  │                  │  reads contract on a  │
    │    (wallet-signed)  │                  │  timer, upserts into  │
    └─────────────────────┘                  │  Postgres             │
                                              └──────────┬────────────┘
                                                          │
                                              ┌───────────▼───────────┐
                                              │   Postgres (Fly)       │
                                              │   off-chain CACHE only │
                                              └────────────────────────┘
```

## Onchain vs. offchain — what lives where and why

**Onchain (the contract) is the only source of truth for:**
- Every claim's terms, stakes, evidence, verdict, and settlement state
- All money — stakes, payouts, slashes, treasury balance
- Reputation
- Admin config (protocol fee, slash shares, min stakes, treasury address, pause state) and
  the pending-timelock queue for changing any of it

**Postgres (the cache) exists purely for speed and search, and is disposable:**
- A poller (`apps/api/src/sync/poller.ts`) reads every claim/evidence/activity event from
  the contract on an interval and upserts it into Postgres. It is the *only* writer of the
  cache tables — API routes never write to them directly.
- If the cache were wiped entirely (it has been, multiple times, during this project's own
  audit-fix-redeploy cycles), the poller rebuilds it from scratch from the contract with no
  data loss, because nothing economically meaningful is ever stored only in Postgres.
- The frontend reads the cache for anything that just needs to be fast and searchable
  (claim listings, the evidence vault, "my staked claims", notifications) and falls back to
  a direct contract read if the API is unreachable or hasn't caught up yet (e.g.
  immediately after a `create_claim` transaction, before the next poll tick).

**Every write always goes directly to the contract, wallet-signed, never through the
backend.** `apps/api` cannot move money or change contract state — it has no private key
and no write path to the contract at all. This is deliberate: the backend being temporarily
unavailable, rate-limited, or wiped can never block a user from staking, submitting
evidence, or withdrawing funds.

## Two GenLayer client roles in the frontend (`apps/web/lib/`)

- **`genlayer-client.ts`** — read-only, server-safe (`createClient({ chain: studionet })`,
  no wallet). Used from Next.js server components (arena, claim detail) and from
  `apps/api` for the poller. Every contract view returns either a plain scalar or a JSON
  *string* (never a raw object) — this is deliberate on the contract side specifically to
  avoid a schema-loading failure; the client here `JSON.parse`s the string.
- **`genlayer-browser-client.ts`** — wallet-connected writes (`"use client"`). Built fresh
  per call from the connected browser wallet, following the verified flow:
  `createClient({ chain, account, provider: window.ethereum })` →
  `client.connect("studionet")` → `client.writeContract(...)` →
  `client.waitForTransactionReceipt({ status: ACCEPTED })`. Critically, this function also
  inspects the finalized receipt's `consensus_data.leader_receipt[0].result.status` for
  `"rollback"` and throws if so — `waitForTransactionReceipt` resolves normally even for a
  *rejected* transaction, so without this check every write in the UI would have silently
  treated a clean revert as a success.
- **`api-client.ts`** — the fast-path reads described above, hitting `apps/api`'s cache
  endpoints instead of the chain directly.

## Backend structure (`apps/api/src/`)

```
index.ts              Express app entrypoint, mounts routers, starts the poller
env.ts                 zod-validated environment config
db.ts                  shared Prisma client
genlayer.ts            server-side read-only GenLayer client (mirrors the frontend's)
auth/siwe.ts           wallet sign-in: nonce issue + signature verification
middleware/session.ts  JWT session cookie (httpOnly, SameSite=None in production
                        since Vercel and Fly are different origins)
routes/
  health.ts            GET /api/v1/health — matches fly.toml's health check exactly
  auth.ts               nonce / verify / logout / me
  claims.ts             claim/evidence/activity listing, global evidence feed,
                        per-wallet activity — all cache reads, zod-validated inputs
  notifications.ts      per-wallet notification feed (auth required)
sync/poller.ts          the background job described above — includes a Postgres
                        advisory lock (only one Fly machine's poller runs a tick at a
                        time) and rate-limit-aware exponential backoff
```

## Frontend structure (`apps/web/`)

Every page from the original design brief is built as a real Next.js App Router route:
landing (`/`), claim discovery (`/arena`), claim detail (`/claims/[id]`), evidence
submission (`/claims/[id]/submit-evidence`), claim creation (`/claims/new`), a global
evidence feed (`/vault`), per-wallet claim history (`/staked`), a permissionless
adjudication-trigger hub listing every eligible claim (`/adjudication`) — the same trigger
also appears directly on each individual claim's own page once its evidence deadline has
passed, so a viewer doesn't need to already know the hub page exists — profile +
notifications (`/profile`), an
owner-only admin panel (`/admin`, not linked from the main nav — access is enforced by the
contract, not by hiding the link), and static content pages (`/intel`, `/laws`,
`/privacy`).

Wallet connection is [Reown AppKit](https://cloud.reown.com) (`@reown/appkit` +
`@reown/appkit-adapter-wagmi`) wrapping `wagmi`/`viem` — chosen over a bare `wagmi`
`injected()` connector because it adds WalletConnect support and a real connect modal
instead of MetaMask-or-nothing.

## Notifications

`sync/poller.ts` diffs each claim's previous vs. new `status` and each evidence item's
previous vs. new `adjudicated` flag on every poll tick, and creates real `Notification` rows
(claim status change → notify the creator; evidence adjudicated → notify the submitter, with
a distinct message when flagged as maliciously manipulated). The frontend's
`NotificationsPanel` requires a SIWE sign-in (a free signature, no transaction) before
showing them, matching `apps/api`'s session-cookie auth.
