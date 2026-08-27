// Read-only GenLayer client — safe to call from server components (no
// wallet/provider needed for reads). Verified against the current
// genlayer-js@1.1.8 API (docs.genlayer.com/api-references/genlayer-js,
// 2026): createClient({ chain }) + client.readContract({ address,
// functionName, args }).
//
// Every PROMISE WAR contract view returns either a plain scalar or a JSON
// *string* (see contracts/promise_war_contract.py's "Serialization helpers"
// section) — so every read helper below JSON.parses the raw string return
// value, it never receives a pre-decoded object from the chain.
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;

if (!CONTRACT_ADDRESS) {
  // eslint-disable-next-line no-console
  console.warn("NEXT_PUBLIC_CONTRACT_ADDRESS is not set — reads will fail.");
}

const readClient = createClient({ chain: studionet });

export type ClaimRecord = {
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

export type EvidenceRecord = {
  id: number;
  claim_id: number;
  side: "SUPPORT" | "CHALLENGE" | "NEUTRAL";
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

async function readJson<T>(functionName: string, args: CalldataEncodable[] = []): Promise<T> {
  if (!CONTRACT_ADDRESS) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured.");
  }
  const raw = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  });
  // Every read below targets a view that returns a JSON string; parse here
  // so callers get typed objects.
  return JSON.parse(raw as string) as T;
}

export async function getClaimsPage(offset: number, limit: number): Promise<ClaimRecord[]> {
  return readJson<ClaimRecord[]>("get_claims_page", [offset, limit]);
}

export async function getClaim(claimId: number): Promise<ClaimRecord> {
  return readJson<ClaimRecord>("get_claim", [claimId]);
}

export async function getClaimEvidence(claimId: number): Promise<EvidenceRecord[]> {
  return readJson<EvidenceRecord[]>("get_claim_evidence", [claimId]);
}

export async function getReputation(address: string) {
  return readJson<{
    address: string;
    wins: number;
    losses: number;
    evidence_rewards: number;
    flags: number;
    score: number;
  }>("get_reputation", [address]);
}

export async function getPlatformStats() {
  return readJson<{
    total_volume_wei: string;
    total_claims_settled: number;
    total_payouts_wei: string;
    claim_count: number;
    evidence_count: number;
    accrued_treasury_wei: string;
    protocol_fee_bps: number;
  }>("get_platform_stats", []);
}

export async function getPendingAdminAction(actionKey: string): Promise<number> {
  if (!CONTRACT_ADDRESS) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured.");
  const raw = await readClient.readContract({ address: CONTRACT_ADDRESS, functionName: "get_pending_admin_action", args: [actionKey] });
  return Number(raw);
}

export async function isPaused(): Promise<boolean> {
  if (!CONTRACT_ADDRESS) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured.");
  const raw = await readClient.readContract({ address: CONTRACT_ADDRESS, functionName: "is_paused", args: [] });
  return Boolean(raw);
}

export async function getWithdrawableBalance(address: string): Promise<string> {
  if (!CONTRACT_ADDRESS) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured.");
  const raw = await readClient.readContract({ address: CONTRACT_ADDRESS, functionName: "get_withdrawable_balance", args: [address] });
  return String(raw);
}

export async function getSideStake(claimId: number, side: "SUPPORT" | "CHALLENGE", address: string) {
  return readJson<{ stake_wei: string; claimed: boolean }>("get_side_stake", [claimId, side, address]);
}

export async function getActivity(claimId: number, offset: number, limit: number) {
  return readJson<
    { kind: string; actor: string; amount_wei: string; ts: number; note: string }[]
  >("get_activity", [claimId, offset, limit]);
}

export const CONTRACT_ADDRESS_FOR_DISPLAY = CONTRACT_ADDRESS;
