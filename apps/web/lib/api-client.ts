// Backend cache client — this is what "the backend polls from the contract
// to the frontend" actually means in practice: apps/api's sync poller reads
// the deployed contract and upserts into Postgres; the frontend reads that
// cache through this client for fast discovery/listing, instead of hitting
// StudioNet directly on every page render (which is what lib/genlayer-client.ts
// was doing before this audit — a real integration gap, not a stylistic one:
// every arena page load was a live contract read).
//
// lib/genlayer-client.ts (direct-to-chain reads) and
// lib/genlayer-browser-client.ts (wallet-signed writes) remain the correct
// tools for anything that must be real-time-accurate immediately after a
// write the cache hasn't caught up to yet — the poller runs on an interval,
// so it can lag by up to SYNC_INTERVAL_MS.
import type { ClaimRecord, EvidenceRecord } from "./genlayer-client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `API request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// The cache stores camelCase Prisma column names; contract views (and the
// rest of the frontend) use the contract's own snake_case field names — map
// at this one boundary so callers never see the difference.
function toClaimRecord(row: Record<string, unknown>): ClaimRecord {
  return {
    id: row.id as number,
    creator: row.creator as string,
    statement: row.statement as string,
    description: row.description as string,
    resolution_criteria: row.resolutionCriteria as string,
    category: row.category as string,
    created_ts: row.createdTs as number,
    participation_deadline_ts: row.participationDeadlineTs as number,
    evidence_deadline_ts: row.evidenceDeadlineTs as number,
    status: row.status as string,
    min_side_stake_wei: row.minSideStakeWei as string,
    min_evidence_stake_wei: row.minEvidenceStakeWei as string,
    support_stake_wei: row.supportStakeWei as string,
    challenge_stake_wei: row.challengeStakeWei as string,
    total_stake_wei: row.totalStakeWei as string,
    evidence_count: row.evidenceCount as number,
    support_evidence_count: row.supportEvidenceCount as number,
    challenge_evidence_count: row.challengeEvidenceCount as number,
    neutral_evidence_count: row.neutralEvidenceCount as number,
    verdict: row.verdict as string,
    reasoning_summary: row.reasoningSummary as string,
    review_attempts: row.reviewAttempts as number,
    adjudicated_at: row.adjudicatedAt as number,
    settled_at: row.settledAt as number,
    side_payouts_settled: Boolean(row.sidePayoutsSettled),
    evidence_payouts_settled: Boolean(row.evidencePayoutsSettled),
    evidence_slash_pool_wei: (row.evidenceSlashPoolWei as string) ?? "0",
    protocol_fee_bps_snapshot: (row.protocolFeeBpsSnapshot as number) ?? 200,
    slash_treasury_share_bps_snapshot: (row.slashTreasuryShareBpsSnapshot as number) ?? 1500,
    slash_pool_share_bps_snapshot: (row.slashPoolShareBpsSnapshot as number) ?? 8500,
  };
}

function toEvidenceRecord(row: Record<string, unknown>): EvidenceRecord {
  return {
    id: row.id as number,
    claim_id: row.claimId as number,
    side: row.side as EvidenceRecord["side"],
    submitter: row.submitter as string,
    source_url: row.sourceUrl as string,
    source_title: row.sourceTitle as string,
    publisher: row.publisher as string,
    publication_date: row.publicationDate as string,
    retrieval_date: row.retrievalDate as string,
    summary: row.summary as string,
    source_type: row.sourceType as string,
    stake_wei: row.stakeWei as string,
    submitted_at: row.submittedAt as number,
    adjudicated: row.adjudicated as boolean,
    outcome: row.outcome as string,
    reasoning_summary: row.reasoningSummary as string,
    slash_bps: row.slashBps as number,
    reward_eligible: row.rewardEligible as boolean,
    flagged: row.flagged as boolean,
    superseded: row.superseded as boolean,
  };
}

export async function getCachedClaimsPage(
  offset: number,
  limit: number,
  filters?: { status?: string; category?: string; q?: string },
): Promise<ClaimRecord[]> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (filters?.status) params.set("status", filters.status);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.q) params.set("q", filters.q);
  const { claims } = await apiGet<{ claims: Record<string, unknown>[] }>(`/claims?${params.toString()}`);
  return claims.map(toClaimRecord);
}

export async function getCachedClaim(claimId: number): Promise<ClaimRecord> {
  const { claim } = await apiGet<{ claim: Record<string, unknown> }>(`/claims/${claimId}`);
  return toClaimRecord(claim);
}

export async function getCachedClaimEvidence(claimId: number): Promise<EvidenceRecord[]> {
  const { evidence } = await apiGet<{ evidence: Record<string, unknown>[] }>(`/claims/${claimId}/evidence`);
  return evidence.map(toEvidenceRecord);
}

export async function getCachedActivity(claimId: number, limit = 50) {
  return apiGet<{ activity: { kind: string; actor: string; amountWei: string; ts: number; note: string }[] }>(
    `/claims/${claimId}/activity?limit=${limit}`,
  ).then((r) => r.activity);
}

export type GlobalEvidenceRow = EvidenceRecord & { claim: { statement: string } };

export async function getGlobalEvidenceFeed(offset: number, limit: number): Promise<GlobalEvidenceRow[]> {
  const { evidence } = await apiGet<{
    evidence: (Record<string, unknown> & { claim: { statement: string } })[];
  }>(`/evidence?offset=${offset}&limit=${limit}`);
  return evidence.map((row) => ({ ...toEvidenceRecord(row), claim: row.claim }));
}

export type MyActivityClaim = {
  claimId: number;
  statement: string;
  status: string;
  verdict: string;
  lastActivityKind: string;
  lastActivityTs: number;
};

export async function getMyActivity(address: string): Promise<MyActivityClaim[]> {
  const { claims } = await apiGet<{ claims: MyActivityClaim[] }>(`/my-activity?address=${address}`);
  return claims;
}
