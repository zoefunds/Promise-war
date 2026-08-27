// Background sync loop: periodically re-reads claim/evidence/activity state
// from the deployed contract and upserts it into Postgres. This is the only
// writer of the cache tables — the API routes never write to them directly.
// Runs as a setInterval inside the same always-on process (fly.toml keeps
// min_machines_running=1), not a separate cron job, so there's no
// coordination problem between "the API" and "the sync job" being
// different processes that could drift out of sync on restart.
import { prisma } from "../db.js";
import { chainGetClaimCount, chainGetClaimsPage, chainGetClaimEvidence, chainGetActivity } from "../genlayer.js";
import { env } from "../env.js";

// Notification recipients are identified by wallet address, which may not
// have a User row yet (nobody has to sign in before their claim/evidence
// can generate a notification for them) — upsert on demand so the FK is
// always satisfiable.
async function notifyUser(walletAddress: string, claimId: number, kind: string, message: string): Promise<void> {
  const user = await prisma.user.upsert({
    where: { walletAddress },
    create: { walletAddress },
    update: {},
  });
  await prisma.notification.create({
    data: { userId: user.id, claimId, kind, message },
  });
}

function statusChangeMessage(statement: string, newStatus: string): string {
  const label = newStatus.replace(/_/g, " ").toLowerCase();
  return `Your claim "${statement.slice(0, 80)}" is now ${label}.`;
}

function evidenceAdjudicatedMessage(sourceTitle: string, outcome: string, flagged: boolean): string {
  const label = outcome.replace(/_/g, " ").toLowerCase();
  if (flagged) {
    return `Your evidence "${sourceTitle}" was flagged as maliciously manipulated — its stake was fully slashed.`;
  }
  return `Your evidence "${sourceTitle}" was adjudicated: ${label}.`;
}

async function syncOnce(): Promise<void> {
  const total = await chainGetClaimCount();
  if (total === 0) return;

  // Page through every claim newest-first, mirroring get_claims_page's own
  // pagination contract (max 50 per call).
  const pageSize = 50;
  let offset = 0;
  while (offset < total) {
    const page = await chainGetClaimsPage(offset, Math.min(pageSize, total - offset));
    for (const claim of page) {
      const previousClaim = await prisma.claim.findUnique({ where: { id: claim.id } });

      await prisma.claim.upsert({
        where: { id: claim.id },
        create: {
          id: claim.id,
          creator: claim.creator,
          statement: claim.statement,
          description: claim.description,
          resolutionCriteria: claim.resolution_criteria,
          category: claim.category,
          createdTs: claim.created_ts,
          participationDeadlineTs: claim.participation_deadline_ts,
          evidenceDeadlineTs: claim.evidence_deadline_ts,
          status: claim.status,
          minSideStakeWei: claim.min_side_stake_wei,
          minEvidenceStakeWei: claim.min_evidence_stake_wei,
          supportStakeWei: claim.support_stake_wei,
          challengeStakeWei: claim.challenge_stake_wei,
          totalStakeWei: claim.total_stake_wei,
          evidenceCount: claim.evidence_count,
          supportEvidenceCount: claim.support_evidence_count,
          challengeEvidenceCount: claim.challenge_evidence_count,
          neutralEvidenceCount: claim.neutral_evidence_count,
          verdict: claim.verdict,
          reasoningSummary: claim.reasoning_summary,
          reviewAttempts: claim.review_attempts,
          adjudicatedAt: claim.adjudicated_at,
          settledAt: claim.settled_at,
          sidePayoutsSettled: claim.side_payouts_settled,
          evidencePayoutsSettled: claim.evidence_payouts_settled,
          evidenceSlashPoolWei: claim.evidence_slash_pool_wei,
          protocolFeeBpsSnapshot: claim.protocol_fee_bps_snapshot,
          slashTreasuryShareBpsSnapshot: claim.slash_treasury_share_bps_snapshot,
          slashPoolShareBpsSnapshot: claim.slash_pool_share_bps_snapshot,
        },
        update: {
          status: claim.status,
          supportStakeWei: claim.support_stake_wei,
          challengeStakeWei: claim.challenge_stake_wei,
          totalStakeWei: claim.total_stake_wei,
          evidenceCount: claim.evidence_count,
          supportEvidenceCount: claim.support_evidence_count,
          challengeEvidenceCount: claim.challenge_evidence_count,
          neutralEvidenceCount: claim.neutral_evidence_count,
          verdict: claim.verdict,
          reasoningSummary: claim.reasoning_summary,
          reviewAttempts: claim.review_attempts,
          adjudicatedAt: claim.adjudicated_at,
          settledAt: claim.settled_at,
          sidePayoutsSettled: claim.side_payouts_settled,
          evidencePayoutsSettled: claim.evidence_payouts_settled,
          evidenceSlashPoolWei: claim.evidence_slash_pool_wei,
          protocolFeeBpsSnapshot: claim.protocol_fee_bps_snapshot,
          slashTreasuryShareBpsSnapshot: claim.slash_treasury_share_bps_snapshot,
          slashPoolShareBpsSnapshot: claim.slash_pool_share_bps_snapshot,
        },
      });

      // Claim-level notifications: only fire on an actual status
      // transition (never on the first sync of a brand-new claim, which
      // would otherwise spam the creator the moment their own create_claim
      // call gets picked up).
      if (previousClaim && previousClaim.status !== claim.status) {
        await notifyUser(claim.creator, claim.id, "CLAIM_STATUS_CHANGED", statusChangeMessage(claim.statement, claim.status));
      }

      const evidence = await chainGetClaimEvidence(claim.id);
      for (const e of evidence) {
        const previousEvidence = await prisma.evidence.findUnique({ where: { id: e.id } });

        await prisma.evidence.upsert({
          where: { id: e.id },
          create: {
            id: e.id,
            claimId: e.claim_id,
            side: e.side,
            submitter: e.submitter,
            sourceUrl: e.source_url,
            sourceTitle: e.source_title,
            publisher: e.publisher,
            publicationDate: e.publication_date,
            retrievalDate: e.retrieval_date,
            summary: e.summary,
            sourceType: e.source_type,
            stakeWei: e.stake_wei,
            submittedAt: e.submitted_at,
            adjudicated: e.adjudicated,
            outcome: e.outcome,
            reasoningSummary: e.reasoning_summary,
            slashBps: e.slash_bps,
            rewardEligible: e.reward_eligible,
            flagged: e.flagged,
            superseded: e.superseded,
          },
          update: {
            adjudicated: e.adjudicated,
            outcome: e.outcome,
            reasoningSummary: e.reasoning_summary,
            slashBps: e.slash_bps,
            rewardEligible: e.reward_eligible,
            flagged: e.flagged,
            superseded: e.superseded,
          },
        });

        // Evidence-level notification: fires exactly once, the poll cycle
        // where adjudicated flips false -> true (the submitter's evidence
        // just got a verdict from GenLayer's consensus).
        const justAdjudicated = e.adjudicated && !(previousEvidence?.adjudicated ?? false);
        if (justAdjudicated) {
          await notifyUser(
            e.submitter,
            claim.id,
            "EVIDENCE_ADJUDICATED",
            evidenceAdjudicatedMessage(e.source_title, e.outcome, e.flagged),
          );
        }
      }

      await syncActivity(claim.id);
    }
    offset += pageSize;
  }
}

const ACTIVITY_PAGE_SIZE = 100;
const ACTIVITY_MAX_PAGES = 20; // hard safety cap: 2000 events/claim/tick

/**
 * Pages backward (newest-first, matching get_activity's own ordering)
 * through a claim's full activity log rather than only ever fetching the
 * first 100 events. The previous version fetched exactly one page at
 * offset 0 every tick — fine for a quiet claim, but on any claim with more
 * than 100 lifetime events, events beyond the 100th were never fetched
 * again once pushed off that first page, silently disappearing from the
 * cache. Fixed by walking pages until hitting an event that's already
 * cached (an efficient stopping point, since everything newer than that
 * has necessarily already been synced) or the safety cap.
 */
async function syncActivity(claimId: number): Promise<void> {
  let offset = 0;
  for (let page = 0; page < ACTIVITY_MAX_PAGES; page++) {
    const activity = await chainGetActivity(claimId, offset, ACTIVITY_PAGE_SIZE);
    if (activity.length === 0) return;

    let sawExisting = false;
    for (const a of activity) {
      // Activity events have no stable onchain id, so we key on the
      // (claimId, kind, actor, ts) tuple being effectively unique in
      // practice; duplicate inserts are harmless for a read-only feed, so
      // we simply skip if an identical row already exists rather than
      // maintaining a synthetic composite unique constraint.
      const exists = await prisma.activityEvent.findFirst({
        where: { claimId, kind: a.kind, actor: a.actor, ts: a.ts },
      });
      if (exists) {
        sawExisting = true;
        continue;
      }
      await prisma.activityEvent.create({
        data: { claimId, kind: a.kind, actor: a.actor, amountWei: a.amount_wei, ts: a.ts, note: a.note },
      });
    }

    if (sawExisting || activity.length < ACTIVITY_PAGE_SIZE) return;
    offset += ACTIVITY_PAGE_SIZE;
  }
}

// Fixed 64-bit key for the Postgres advisory lock below — arbitrary but
// stable, must never change (a different value would let two machines
// "own" the lock simultaneously across a deploy that changes it).
const POLLER_LEADER_LOCK_KEY = 875_301_442_019n;

/** True if StudioNet's public RPC gateway rejected the request for
 * exceeding its quota (hourly or daily — both message formats seen in
 * practice: "Rate limit exceeded: 500 requests per hour" and
 * "... 5000 requests per day"). Checked so the poller can back off
 * dramatically instead of retrying on the next ordinary tick and
 * guaranteeing another rejection. */
function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /rate limit exceeded/i.test(message);
}

export function startSyncPoller(): void {
  let running = false;
  // Consecutive rate-limit hits — grows the backoff exponentially (capped
  // at ~30min) instead of hammering an already-exceeded quota on a fixed
  // interval, which is exactly what turned one rate-limited tick into a
  // sustained outage during testing (every tick re-triggered the same
  // rejection). skipUntilMs is a plain "don't try again before this wall-
  // clock time" gate, checked at the top of every tick.
  let consecutiveRateLimitHits = 0;
  let skipUntilMs = 0;

  const tick = async () => {
    if (running) return; // never overlap a slow sync with the next tick
    if (Date.now() < skipUntilMs) return; // still backing off from a rate limit
    running = true;
    try {
      // Multi-machine safety: fly.toml runs 2 machines for availability,
      // but both running an independent poll loop on the same interval
      // doubles StudioNet RPC usage for zero benefit (they'd write the
      // same rows to the same shared Postgres). A session-scoped advisory
      // lock ensures only one machine's poller actually executes per
      // tick — the other finds the lock held and skips cleanly, no error,
      // no wasted RPC calls. Lock auto-releases if that machine's
      // connection drops (e.g. a restart), so there's no permanent
      // lockout risk if the "leader" machine goes away.
      const [{ acquired }] = await prisma.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_lock(${POLLER_LEADER_LOCK_KEY}) AS acquired
      `;
      if (!acquired) return;

      try {
        await syncOnce();
        consecutiveRateLimitHits = 0;
      } finally {
        await prisma.$queryRaw`SELECT pg_advisory_unlock(${POLLER_LEADER_LOCK_KEY})`;
      }
    } catch (err) {
      if (isRateLimitError(err)) {
        consecutiveRateLimitHits += 1;
        const backoffMs = Math.min(env.syncIntervalMs * 2 ** consecutiveRateLimitHits, 30 * 60 * 1000);
        skipUntilMs = Date.now() + backoffMs;
        // eslint-disable-next-line no-console
        console.error(
          `[sync] rate-limited (${consecutiveRateLimitHits} consecutive hits) — backing off ${Math.round(backoffMs / 1000)}s`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.error("[sync] poll failed:", err instanceof Error ? err.message : err);
      }
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(tick, env.syncIntervalMs);
}
