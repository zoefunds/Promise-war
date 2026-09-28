# PROMISE WAR

**"Two sides. One claim. Bring proof."**

An onchain evidence-battle arena built on [GenLayer](https://www.genlayer.com/) Intelligent
Contracts. Someone locks GEN behind a verifiable real-world claim. Players stake GEN on
**SUPPORT** or **CHALLENGE** and back their side with priced, individually-adjudicated
evidence. GenLayer's own web-fetch + LLM consensus independently renders a verdict; the
contract settles GEN to the winning side and rewards the strongest evidence — no human
moderator, no off-chain oracle.

PROMISE WAR turns real-world verification into a competitive onchain evidence game: not a
prediction market, and not a generic "AI review" wrapper — a market where every settlement
outcome depends on GenLayer's validator consensus actually evaluating real evidence against
a real claim.

## Live deployment

| Component | URL / Address |
|---|---|
| Frontend | [promise-war.vercel.app](https://promise-war.vercel.app) |
| Backend API | [promise-war-api-george.fly.dev](https://promise-war-api-george.fly.dev) (`/api/v1/health`) |
| Intelligent Contract | `0xeE22D6623d86eFc23b1BFaDBDeB57ddF34076902` (GenLayer StudioNet) |
| Postgres | Fly Postgres, `promise-war-db-george` |

The contract address above is the current deployment. Contracts are immutable, so fixes take
effect through a fresh deployment; the frontend and backend are both wired to this address.

## What makes this a real GenLayer application, not an AI wrapper

- **Validator consensus does the actual verification.** `request_adjudication()` runs
  `gl.nondet.web.render`/`.get` to fetch each evidence URL for real, then an LLM prompt
  classifies it against the claim, and every validator independently re-derives the leader's
  economic conclusion (not the exact text) within a documented tolerance band — see
  `_evidence_outcomes_agree()` / `_claim_verdicts_agree()` in the contract. This is what
  keeps genuinely-close honest judgements from cascading into leader rotation or an
  `UNDETERMINED` consensus result, while a genuine disagreement (e.g. `FULFILLED` vs
  `NOT_FULFILLED`) still fails cleanly.
- **Untrusted evidence is data, never instructions.** The adjudication prompt explicitly
  tells the model that fetched page content and submitter summaries are untrusted and must
  never be followed as commands — defends against prompt injection via a malicious evidence
  URL.
- **Money actually moves based on the verdict.** Every payout — side stakes, evidence
  rewards/slashes, protocol fees — flows through one emission point (`_send_gen()`), always
  zero-ledger-then-transfer, verified end-to-end against the live deployment with real
  multi-account settlements (see `MEMORY.md`'s live test campaign logs).

## Repo layout

```
contracts/
  promise_war_contract.py     the one Intelligent Contract — full protocol
  test/                       AST-based static regression tests (pytest)
apps/web/                     Next.js 14 frontend (Vercel)
apps/api/                     Node/Express + Prisma backend (Fly.io, always-on)
database/                     Prisma schema — off-chain cache only, never money state
docs/                         architecture, contract, deployment, security, testing docs
.github/workflows/ci.yml      CI — contract lint/tests, frontend/backend typecheck+build
fly.toml                      apps/api deploy config — min_machines_running=1 (24/7)
MEMORY.md                     full project history/decision log — read this for the "why"
```

Further reading: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (system design, onchain vs
offchain split, data flow) · [`docs/CONTRACT.md`](docs/CONTRACT.md) (state machine, every
method, the economics) · [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) (how to redeploy each
piece) · [`docs/SECURITY.md`](docs/SECURITY.md) (threat model, audit history, known
limitations) · [`docs/TESTING.md`](docs/TESTING.md) (how to run everything).

## Quick start (local development)

Prerequisites: Node 20+, pnpm 9, Python 3.12+ (for contract tests), a local or remote
Postgres instance.

```bash
git clone https://github.com/zoefunds/Promise-war.git
cd Promise-war
pnpm install

cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
# fill in DATABASE_URL, CONTRACT_ADDRESS, SESSION_JWT_SECRET, etc. — see the
# comments in each file and docs/DEPLOYMENT.md for what each value means.

pnpm --filter @promise-war/api exec prisma db push --schema ../../database/schema.prisma
pnpm --filter @promise-war/web dev     # http://localhost:3000
pnpm --filter @promise-war/api dev     # http://localhost:4000
```

## Running the contract test suite

```bash
pip install pytest "genvm-linter==0.11.0"
python3 -m pytest contracts/test/ -v
genvm-lint check contracts/promise_war_contract.py
```

25 tests: AST-based static regression tests (contract source can't be `import`ed and
executed outside GenVM, so these parse and assert on the AST directly — see
`contracts/test/test_promise_war_static.py`'s module docstring) plus 500-trial-each
randomized property tests for payout conservation, claimant-ordering independence, and
slash conservation (`contracts/test/test_settlement_math_properties.py`).

## Audit & fix history

This contract went through four rounds of adversarial review during development. The current
deployment includes the fixes listed below and is backed by local regression tests plus live
StudioNet verification.

| Round | Score | Key finding(s) fixed |
|---|---|---|
| 1 | 2,520 → fixed | Payout dust could strand GEN; slashed-evidence pool wasn't reaching the winning side; `NOT_YET_VERIFIABLE` couldn't actually accept new evidence; evidence URLs had no source controls; creator could cancel after a third party staked |
| 2 | 3,420 → fixed | `settle_claim_evidence()` could run while a claim was still `NOT_YET_VERIFIABLE` (reopenable), permanently losing later evidence's slash accounting |
| 3 | 3,760 → fixed | Owner controls had no delay/notice mechanism before taking effect |
| 4 | 3,920 → fixed | A claim's settlement read the *live* global fee/slash-share config instead of what was in effect when the claim was created — an owner could apply a fee increase retroactively to already-staked claims |

The current deployed source was fetched from StudioNet and checked for the settlement and
verdict safeguards described in [`review.md`](review.md).

**Live verification on the current deployment**: the contract above was redeployed after
the latest fixes, the Postgres cache was cleared, and three real StudioNet E2E scenarios were
run with detailed claim, stake, evidence, supersession, adjudication, cancellation, refund,
and withdrawal data. The adjudication scenario returned `NOT_YET_VERIFIABLE` for irrelevant
evidence, so no unsafe settlement was forced.

**Open, not yet closed** (documented, not silently dropped):
- DNS-rebinding / redirect-following SSRF on evidence fetch — genuinely lives inside
  GenVM's own `gl.nondet.web` implementation, not something this contract's Python can
  intercept. HTTPS-only + a literal loopback/private-range/cloud-metadata blocklist is
  enforced (`_normalize_url()`); this is documented as a deliberately partial defense.
- CI-gated StudioNet/localnet lifecycle tests — the current suite is static + property
  tests; live transaction coverage is manual and documented in `review.md`. Building
  genuine CI-gated integration tests needs either a funded test-wallet secret in CI or a
  localnet GenVM node in the runner.
- Owner is a single EOA behind a 48-hour timelock (`ADMIN_TIMELOCK_DELAY_SECONDS`), not yet
  an N-of-M multisig — deferred pending the owner naming signer addresses and a threshold.

## License

Not yet specified.
