// Server-side, read-only GenLayer client — mirrors apps/web/lib/genlayer-client.ts
// exactly (verified against genlayer-js@1.1.8; see that file's header
// comment for how the API surface was confirmed). This is the ONLY place
// apps/api talks to the deployed contract; the sync poller is the only
// caller.
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";
import { env } from "./env.js";

const client = createClient({ chain: studionet });
const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS as `0x${string}`;

async function readJson<T>(functionName: string, args: CalldataEncodable[] = []): Promise<T> {
  const raw = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  });
  return JSON.parse(raw as string) as T;
}

export type ChainClaim = {
  id: number;
  creator: string;
  statement: string;
  description: string;
  resolution_criteria: string;
  category: string;
  created_ts: number;
  participation_deadline_ts: number;
  evidence_deadline_ts: number;
  status: string;
  min_side_stake_wei: string;
  min_evidence_stake_wei: string;
  support_stake_wei: string;
  challenge_stake_wei: string;
  total_stake_wei: string;
  evidence_count: number;
  support_evidence_count: number;
  challenge_evidence_count: number;
  neutral_evidence_count: number;
  verdict: string;
  reasoning_summary: string;
  review_attempts: number;
  adjudicated_at: number;
  settled_at: number;
  side_payouts_settled: boolean;
  evidence_payouts_settled: boolean;
  evidence_slash_pool_wei: string;
  protocol_fee_bps_snapshot: number;
  slash_treasury_share_bps_snapshot: number;
  slash_pool_share_bps_snapshot: number;
};

export type ChainEvidence = {
  id: number;
  claim_id: number;
  side: string;
  submitter: string;
  source_url: string;
  source_title: string;
  publisher: string;
  publication_date: string;
  retrieval_date: string;
  summary: string;
  source_type: string;
  stake_wei: string;
  submitted_at: number;
  adjudicated: boolean;
  outcome: string;
  reasoning_summary: string;
  slash_bps: number;
  reward_eligible: boolean;
  flagged: boolean;
  superseded: boolean;
};

export async function chainGetClaimCount(): Promise<number> {
  const raw = await client.readContract({ address: CONTRACT_ADDRESS, functionName: "get_claim_count", args: [] });
  return Number(raw);
}

export async function chainGetClaimsPage(offset: number, limit: number): Promise<ChainClaim[]> {
  return readJson<ChainClaim[]>("get_claims_page", [offset, limit]);
}

export async function chainGetClaimEvidence(claimId: number): Promise<ChainEvidence[]> {
  return readJson<ChainEvidence[]>("get_claim_evidence", [claimId]);
}

export async function chainGetActivity(claimId: number, offset: number, limit: number) {
  return readJson<{ kind: string; actor: string; amount_wei: string; ts: number; note: string }[]>(
    "get_activity",
    [claimId, offset, limit],
  );
}
