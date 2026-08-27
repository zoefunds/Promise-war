"use client";

// Wallet-connected GenLayer client for writes — built fresh per call from
// the connected browser wallet's address, per the verified genlayer-js@1.1.8
// pattern: createClient({ chain, account, provider: window.ethereum }),
// then client.connect("studionet") before writeContract(), then
// client.waitForTransactionReceipt(...) to confirm.
//
// value amounts below are in wei (native GEN's smallest unit), matching the
// contract's own u256 wei-denominated fields — callers must convert GEN to
// wei themselves (see lib/format.ts is display-only; conversion happens at
// the call site in each form).
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable } from "genlayer-js/types";

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;

function getInjectedProvider() {
  if (typeof window === "undefined" || !("ethereum" in window)) {
    throw new Error("No browser wallet detected. Install MetaMask or a compatible wallet.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum;
}

async function writeAndWait(
  account: `0x${string}`,
  functionName: string,
  args: CalldataEncodable[],
  valueWei: string,
) {
  if (!CONTRACT_ADDRESS) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured.");
  }
  // `account` is set once at client construction (createClient accepts a
  // plain address here); writeContract's own optional `account` override
  // expects a full viem Account object, not an address string, so we
  // deliberately don't pass it a second time per-call.
  const client = createClient({
    chain: studionet,
    account,
    provider: getInjectedProvider(),
  });
  await client.connect("studionet");

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: BigInt(valueWei),
  });

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.FINALIZED,
  });

  // CRITICAL: waitForTransactionReceipt resolves (does not throw) for a
  // contract-reverted call — a rejected write (e.g. "deadline has passed",
  // "already been claimed") comes back as a normal receipt with
  // consensus_data.leader_receipt[0].result.status === "rollback" and
  // execution_result something other than "SUCCESS". Discovered during
  // write-path testing: without this check, every calling UI component
  // (JoinSideButton, SettlementPanel, etc.) would treat a cleanly-rejected
  // transaction as a success, since no exception was ever thrown. Every
  // caller in this file relies on writeAndWait actually throwing here so
  // their existing try/catch surfaces the real revert reason.
  const leader = (receipt as { consensus_data?: { leader_receipt?: { result?: { status?: string; payload?: unknown } }[] } })
    ?.consensus_data?.leader_receipt?.[0];
  if (leader?.result?.status === "rollback") {
    const payload = leader.result.payload;
    throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
  }

  return { txHash, receipt };
}

/**
 * Extract a write method's decoded return value from a finalized receipt.
 *
 * `writeContract` itself only resolves to the transaction hash; the
 * leader's decoded execution result lives on the finalized receipt's
 * consensus data. Verified empirically against real transactions on the
 * deployed contract during write-path testing (not just the .d.ts shape,
 * which undersells the nesting): `leader_receipt[0].result` is itself an
 * object — `{ raw, status, payload }` — where `payload` is a JSON-encoded
 * representation of the actual return value: `"3"` for an int return,
 * `"\"FULFILLED\""` (literal surrounding quote characters) for a str
 * return, `"null"` for a null return. A naive read of `payload.readable`
 * therefore leaves string returns wrapped in stray quote characters —
 * caught when `request_adjudication`'s verdict rendered as `"FULFILLED"`
 * (with quotes) in a test script. JSON.parse-ing the readable payload
 * uniformly unwraps every return type correctly.
 */
function extractLeaderResult(receipt: unknown): string | undefined {
  const consensusData = (
    receipt as {
      consensus_data?: { leader_receipt?: { result?: { payload?: { readable?: string } } }[] };
    }
  )?.consensus_data;
  const raw = consensusData?.leader_receipt?.[0]?.result?.payload?.readable;
  if (raw === undefined || raw === null) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null ? undefined : String(parsed);
  } catch {
    return raw;
  }
}

/** Friendly-ize a revert message so a UI can show it directly. Strips the
 * contract's internal `[EXPECTED] ` / `[EXTERNAL] ` / `[TRANSIENT] ` /
 * `[LLM_ERROR] ` classification prefixes (see contracts/promise_war_contract.py) —
 * meaningful for debugging, noise for an end user. */
export function friendlyRevertMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const stripped = raw.replace(/^\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]\s*/, "");
  return stripped || "Transaction failed.";
}

export async function createClaim(
  account: `0x${string}`,
  args: {
    statement: string;
    description: string;
    resolutionCriteria: string;
    category: string;
    participationDeadlineTs: number;
    evidenceDeadlineTs: number;
    minSideStakeWei: string;
    minEvidenceStakeWei: string;
    valueWei: string;
  },
): Promise<{ txHash: string; claimId: number | null }> {
  const { txHash, receipt } = await writeAndWait(
    account,
    "create_claim",
    [
      args.statement,
      args.description,
      args.resolutionCriteria,
      args.category,
      args.participationDeadlineTs,
      args.evidenceDeadlineTs,
      Number(args.minSideStakeWei),
      Number(args.minEvidenceStakeWei),
    ],
    args.valueWei,
  );
  const rawResult = extractLeaderResult(receipt);
  const claimId = rawResult !== undefined && rawResult !== null && rawResult !== "" ? Number(rawResult) : null;
  return { txHash, claimId: Number.isFinite(claimId) ? claimId : null };
}

export async function joinSide(
  account: `0x${string}`,
  args: { claimId: number; side: "SUPPORT" | "CHALLENGE"; valueWei: string },
): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "join_side", [args.claimId, args.side], args.valueWei);
  return { txHash };
}

export async function submitEvidence(
  account: `0x${string}`,
  args: {
    claimId: number;
    side: "SUPPORT" | "CHALLENGE" | "NEUTRAL";
    sourceUrl: string;
    sourceTitle: string;
    publisher: string;
    publicationDate: string;
    summary: string;
    sourceType: string;
    valueWei: string;
  },
): Promise<{ txHash: string; evidenceId: number | null }> {
  const { txHash, receipt } = await writeAndWait(
    account,
    "submit_evidence",
    [args.claimId, args.side, args.sourceUrl, args.sourceTitle, args.publisher, args.publicationDate, args.summary, args.sourceType],
    args.valueWei,
  );
  const rawResult = extractLeaderResult(receipt);
  const evidenceId = rawResult !== undefined && rawResult !== null && rawResult !== "" ? Number(rawResult) : null;
  return { txHash, evidenceId: Number.isFinite(evidenceId) ? evidenceId : null };
}

export async function requestAdjudication(
  account: `0x${string}`,
  claimId: number,
): Promise<{ txHash: string; verdict: string | null }> {
  const { txHash, receipt } = await writeAndWait(account, "request_adjudication", [claimId], "0");
  const verdict = extractLeaderResult(receipt) ?? null;
  return { txHash, verdict };
}

export async function withdraw(account: `0x${string}`): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "withdraw", [], "0");
  return { txHash };
}

export async function settleClaimSides(account: `0x${string}`, claimId: number): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "settle_claim_sides", [claimId], "0");
  return { txHash };
}

export async function settleClaimEvidence(account: `0x${string}`, claimId: number): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "settle_claim_evidence", [claimId], "0");
  return { txHash };
}

export async function claimSidePayout(
  account: `0x${string}`,
  claimId: number,
  side: "SUPPORT" | "CHALLENGE",
): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "claim_side_payout", [claimId, side], "0");
  return { txHash };
}

export async function claimEvidencePayout(account: `0x${string}`, evidenceId: number): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "claim_evidence_payout", [evidenceId], "0");
  return { txHash };
}

export async function cancelClaim(account: `0x${string}`, claimId: number): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "cancel_claim", [claimId], "0");
  return { txHash };
}

export async function advanceToEvidenceMaturing(account: `0x${string}`, claimId: number): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "advance_to_evidence_maturing", [claimId], "0");
  return { txHash };
}

export async function claimAdjudicationTimeout(account: `0x${string}`, claimId: number): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "claim_adjudication_timeout", [claimId], "0");
  return { txHash };
}

export async function claimSideRefund(
  account: `0x${string}`,
  claimId: number,
  side: "SUPPORT" | "CHALLENGE",
): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "claim_side_refund", [claimId, side], "0");
  return { txHash };
}

export async function claimEvidenceRefund(account: `0x${string}`, evidenceId: number): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "claim_evidence_refund", [evidenceId], "0");
  return { txHash };
}

export async function sweepTreasury(account: `0x${string}`): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "sweep_treasury", [], "0");
  return { txHash };
}

// ---- Admin (owner-only — the contract itself enforces this via
// _only_owner(); the frontend has no way to read the owner address since
// no get_owner() view exists, so every call below is optimistic and simply
// surfaces the contract's own "[EXPECTED] only the owner may call this"
// rejection to a non-owner caller rather than hiding the panel from them.
//
// Every sensitive action here is now queue-then-execute with a fixed
// 48-hour timelock in between (ADMIN_TIMELOCK_DELAY_SECONDS in the
// contract) — each pair below mirrors the contract's own
// queue_<action>() / <action>() split exactly. `sweep_treasury` alone
// stays a single instant call (see the contract's own comment on why). --

export async function queuePause(account: `0x${string}`): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "queue_pause", [], "0");
  return { txHash };
}

export async function pauseContract(account: `0x${string}`): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "pause", [], "0");
  return { txHash };
}

export async function queueUnpause(account: `0x${string}`): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "queue_unpause", [], "0");
  return { txHash };
}

export async function unpauseContract(account: `0x${string}`): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "unpause", [], "0");
  return { txHash };
}

export async function queueSetProtocolFeeBps(account: `0x${string}`, feeBps: number): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "queue_set_protocol_fee_bps", [feeBps], "0");
  return { txHash };
}

export async function setProtocolFeeBps(account: `0x${string}`, feeBps: number): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "set_protocol_fee_bps", [feeBps], "0");
  return { txHash };
}

export async function queueSetSlashSharesBps(
  account: `0x${string}`,
  treasuryShareBps: number,
  poolShareBps: number,
): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "queue_set_slash_shares_bps", [treasuryShareBps, poolShareBps], "0");
  return { txHash };
}

export async function setSlashSharesBps(
  account: `0x${string}`,
  treasuryShareBps: number,
  poolShareBps: number,
): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "set_slash_shares_bps", [treasuryShareBps, poolShareBps], "0");
  return { txHash };
}

export async function queueSetMinStakes(
  account: `0x${string}`,
  minSideStakeWei: string,
  minEvidenceStakeWei: string,
): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(
    account,
    "queue_set_min_stakes",
    [Number(minSideStakeWei), Number(minEvidenceStakeWei)],
    "0",
  );
  return { txHash };
}

export async function setMinStakes(
  account: `0x${string}`,
  minSideStakeWei: string,
  minEvidenceStakeWei: string,
): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "set_min_stakes", [Number(minSideStakeWei), Number(minEvidenceStakeWei)], "0");
  return { txHash };
}

export async function queueSetTreasuryAddress(account: `0x${string}`, newTreasury: string): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "queue_set_treasury_address", [newTreasury], "0");
  return { txHash };
}

export async function setTreasuryAddress(account: `0x${string}`, newTreasury: string): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "set_treasury_address", [newTreasury], "0");
  return { txHash };
}

export async function queueTransferOwnership(account: `0x${string}`, newOwner: string): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "queue_transfer_ownership", [newOwner], "0");
  return { txHash };
}

export async function transferOwnership(account: `0x${string}`, newOwner: string): Promise<{ txHash: string }> {
  const { txHash } = await writeAndWait(account, "transfer_ownership", [newOwner], "0");
  return { txHash };
}
