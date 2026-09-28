# Deployment

All three pieces — contract, frontend, backend — are currently live. This documents how
each was deployed and how to redeploy any one of them.

## Contract (GenLayer StudioNet)

The contract is immutable once deployed — a code fix only takes effect on a **fresh
deployment with a new address**. The deployer (never an agent/CI process) is always the
one who runs this:

1. Verify current requirements at <https://docs.genlayer.com/> and
   <https://skills.genlayer.com/> — GenVM syntax/behavior has changed across StudioNet
   releases.
2. Before deploying, run the local checks:
   ```bash
   python3 -m py_compile contracts/promise_war_contract.py
   genvm-lint check contracts/promise_war_contract.py
   python3 -m pytest contracts/test/ -v
   ```
3. Deploy `contracts/promise_war_contract.py` via GenLayer Studio, with constructor args:
   - `treasury_address` — the address that receives swept protocol fees + slash treasury
     shares (can be the deployer's own address; changeable later via
     `queue_set_treasury_address` / `set_treasury_address`, subject to the 48h timelock)
   - `min_side_stake_wei` — platform-wide floor on top of each claim's own minimum
     (`0` is a reasonable default — it just means "no extra floor")
   - `min_evidence_stake_wei` — same, for evidence stakes
4. **Verify the schema loads cleanly before wiring the address in anywhere:**
   ```js
   const client = createClient({ chain: studionet });
   const schema = await client.getContractSchema(NEW_ADDRESS);
   console.log(Object.keys(schema.methods).length); // should be 45
   ```
5. Wire the new address into every consumer (see below), and **clear the Postgres cache**
   — data from a previous contract address is meaningless under a new one, since claim IDs
   restart from 0.

## Wiring a new contract address in

Three places need the same address:

```bash
# apps/web/.env.local (local dev)
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...

# Vercel (production frontend)
vercel env rm NEXT_PUBLIC_CONTRACT_ADDRESS production --yes
echo -n "0x..." | vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production

# Fly.io (production backend)
fly secrets set CONTRACT_ADDRESS="0x..." --app promise-war-api-george
```

Then clear the cache (from repo root, with a local tunnel to the Fly Postgres instance):

```bash
fly proxy 15432:5432 -a promise-war-db-george &
psql "postgres://promise_war_api:<password>@localhost:15432/promise_war_api?sslmode=disable" \
  -c "TRUNCATE TABLE activity_events, evidence, notifications, claims RESTART IDENTITY CASCADE;"
```

(`users` / `auth_nonces` are left intact — wallet identities aren't tied to a specific
contract deployment.)

Then redeploy both apps (see below) and re-verify with a live read:
```bash
curl https://promise-war-api-george.fly.dev/api/v1/claims   # should be [] after a fresh reset
```

## Frontend (Vercel)

```bash
cd apps/web
pnpm build              # verify locally first — catches env/type errors before deploying
vercel deploy --prod
```

Notes from this project's own deploy history, worth knowing before you hit them:
- The Vercel project's **Root Directory** must be set to `apps/web` (via the Vercel
  dashboard or the `v9/projects` API) for monorepo builds to use the pnpm workspace
  correctly — deploying from a subdirectory without this uses a broken standalone `npm
  install` that can't resolve workspace-hoisted dependencies.
- `next.config.mjs` has webpack aliases (`@base-org/account: false`,
  `@coinbase/cdp-sdk: false`, plus a few externals) to strip an unused Coinbase
  Smart-Wallet dependency chain that Reown AppKit's wagmi adapter pulls in by default —
  without them, the build fails on unresolvable `@x402/*` submodules.

## Backend (Fly.io)

```bash
cd apps/api
pnpm build                                    # prisma generate + tsc, verify locally
fly deploy --app promise-war-api-george --config ../../fly.toml
```

`fly.toml` sets `min_machines_running = 1` and `auto_stop_machines = false` — this is the
literal mechanism behind "the backend must never die." Two machines run for availability;
`sync/poller.ts` uses a Postgres advisory lock so only one machine's poll loop executes per
tick (redundant simultaneous polling from both machines was a real, observed cause of
exhausting StudioNet's shared RPC quota during heavy testing).

### Database schema changes

```bash
fly proxy 15432:5432 -a promise-war-db-george &
DATABASE_URL="postgres://promise_war_api:<password>@localhost:15432/promise_war_api?sslmode=disable" \
  npx prisma db push --schema ../../database/schema.prisma --accept-data-loss
```

(`db push` was used throughout this project's development rather than tracked migrations —
appropriate for a cache with no meaningful historical data of its own; switch to
`prisma migrate` if this ever needs a real migration history.)

## Rate limits — a real operational constraint

StudioNet's public RPC gateway enforces both an hourly (~500 req) and daily (~5000 req)
request quota. This project's own heavy multi-round audit testing tripped both limits more
than once. `sync/poller.ts` backs off exponentially (capped at 30 minutes) on a detected
rate-limit error rather than retrying every fixed interval — but if you're running your own
heavy test campaign against a shared StudioNet endpoint, budget for this: a burst of
transaction + polling activity can visibly stall the backend's cache for a stretch until
the quota window clears. This never puts contract funds at risk (the chain itself has no
rate limit-shaped failure mode) — it only delays how quickly the *cache* reflects reality.
