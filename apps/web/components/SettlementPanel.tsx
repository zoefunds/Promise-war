"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import {
  settleClaimSides,
  settleClaimEvidence,
  claimSidePayout,
  claimSideRefund,
  cancelClaim,
  claimAdjudicationTimeout,
  friendlyRevertMessage,
} from "@/lib/genlayer-browser-client";
import { isPast, ADJUDICATION_TIMEOUT_SECONDS } from "@/lib/format";
import type { ClaimRecord } from "@/lib/genlayer-client";

const DECISIVE_VERDICTS = new Set(["FULFILLED", "MATERIALLY_FULFILLED", "PARTIALLY_FULFILLED", "NOT_FULFILLED"]);
const TERMINAL_STATUSES = new Set(["SETTLED", "CANCELLED", "EXPIRED_TIMEOUT"]);

function ActionButton({
  label,
  tone,
  onRun,
}: {
  label: string;
  tone: "gold" | "primary" | "challenge";
  onRun: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const { isConnected } = useAccount();
  const toneClass =
    tone === "gold" ? "border-gold text-gold hover:bg-gold/10" : tone === "challenge" ? "border-challenge text-challenge hover:bg-challenge/10" : "border-primary text-primary hover:bg-primary/10";

  async function handle() {
    if (!isConnected) {
      setMsg("Connect your wallet first.");
      setIsError(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await onRun();
      setMsg("Done.");
      setIsError(false);
    } catch (err) {
      setMsg(friendlyRevertMessage(err));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handle}
        disabled={busy}
        className={`border font-mono text-xs uppercase py-2 px-3 rounded transition-colors disabled:opacity-50 ${toneClass}`}
      >
        {busy ? "Working…" : label}
      </button>
      {msg && <p className={`font-mono text-[10px] ${isError ? "text-challenge" : "text-secondary"}`}>{msg}</p>}
    </div>
  );
}

export function SettlementPanel({ claim }: { claim: ClaimRecord }) {
  const { address } = useAccount();
  const router = useRouter();

  const refresh = () => router.refresh();
  const withAddr = (fn: (addr: `0x${string}`) => Promise<unknown>) => async () => {
    if (!address) throw new Error("Connect your wallet first.");
    await fn(address as `0x${string}`);
    refresh();
  };

  const evidenceDeadlinePassed = isPast(claim.evidence_deadline_ts);
  const participationDeadlinePassed = isPast(claim.participation_deadline_ts);
  const isTerminal = TERMINAL_STATUSES.has(claim.status);
  const isDecisive = DECISIVE_VERDICTS.has(claim.verdict);
  const isRefundable = claim.status === "CANCELLED" || claim.status === "EXPIRED_TIMEOUT" || claim.verdict === "CLAIM_INVALID";
  const timedOut = !isTerminal && evidenceDeadlinePassed && isPast(claim.evidence_deadline_ts + ADJUDICATION_TIMEOUT_SECONDS);
  const canCancel =
    claim.status === "ACTIVE" &&
    Number(claim.challenge_stake_wei) === 0 &&
    claim.evidence_count === 0 &&
    !participationDeadlinePassed;

  const sections: React.ReactNode[] = [];

  // These two now reflect ground truth (claim.side_payouts_settled /
  // claim.evidence_payouts_settled, exposed directly by the contract)
  // instead of guessing from status alone and letting the contract reject
  // a redundant call — a real improvement once the fixed contract is
  // redeployed and the cache picks these fields up.
  if (isDecisive && !claim.side_payouts_settled) {
    sections.push(
      <ActionButton key="settle-sides" label="Settle Sides" tone="gold" onRun={withAddr((a) => settleClaimSides(a, claim.id))} />,
    );
  }
  // settle_claim_evidence() only accepts a terminal verdict (decisive or
  // CLAIM_INVALID) — never NOT_YET_VERIFIABLE, since that status is
  // explicitly reopenable for new evidence and "settle once, forever"
  // would strand any later evidence's slash. Mirror that gate here rather
  // than showing a button that would now cleanly (but pointlessly) revert.
  const evidenceSettlementEligible = isDecisive || claim.verdict === "CLAIM_INVALID";
  if (evidenceSettlementEligible && !claim.evidence_payouts_settled) {
    sections.push(
      <ActionButton
        key="settle-evidence"
        label="Settle Evidence"
        tone="gold"
        onRun={withAddr((a) => settleClaimEvidence(a, claim.id))}
      />,
    );
    if (isDecisive) {
      sections.push(
        <p key="settle-order-note" className="font-mono text-[10px] text-on-surface-variant col-span-full">
          Settle Evidence before claiming side payouts — the winning side's bonus pool from slashed
          evidence is only finalized once evidence settlement runs.
        </p>,
      );
    }
  } else if (claim.verdict === "NOT_YET_VERIFIABLE" && !claim.evidence_payouts_settled) {
    sections.push(
      <p key="not-yet-verifiable-note" className="font-mono text-[10px] text-on-surface-variant col-span-full">
        This claim is still open for new evidence (NOT_YET_VERIFIABLE) — evidence settlement is only
        available once a final verdict is reached.
      </p>,
    );
  }
  // The contract requires evidence settlement to finish first on a
  // decisive verdict (so the winning-side bonus pool is final before any
  // side payout reads it) — mirror that gate here rather than let the
  // user hit a doomed transaction.
  const canClaimSidePayout = isDecisive && (claim.evidence_payouts_settled || claim.evidence_count === 0);
  if (isDecisive) {
    sections.push(
      <ActionButton
        key="claim-support"
        label={canClaimSidePayout ? "Claim My SUPPORT Payout" : "Claim SUPPORT (settle evidence first)"}
        tone="primary"
        onRun={withAddr((a) => claimSidePayout(a, claim.id, "SUPPORT"))}
      />,
      <ActionButton
        key="claim-challenge"
        label={canClaimSidePayout ? "Claim My CHALLENGE Payout" : "Claim CHALLENGE (settle evidence first)"}
        tone="primary"
        onRun={withAddr((a) => claimSidePayout(a, claim.id, "CHALLENGE"))}
      />,
    );
  }
  if (isRefundable) {
    sections.push(
      <ActionButton key="refund-support" label="Refund My SUPPORT Stake" tone="primary" onRun={withAddr((a) => claimSideRefund(a, claim.id, "SUPPORT"))} />,
      <ActionButton key="refund-challenge" label="Refund My CHALLENGE Stake" tone="primary" onRun={withAddr((a) => claimSideRefund(a, claim.id, "CHALLENGE"))} />,
    );
  }
  if (timedOut) {
    sections.push(
      <ActionButton
        key="timeout"
        label="Claim Timed Out — Recover Stakes"
        tone="challenge"
        onRun={withAddr((a) => claimAdjudicationTimeout(a, claim.id))}
      />,
    );
  }
  if (canCancel) {
    sections.push(
      <ActionButton key="cancel" label="Cancel Claim (creator only)" tone="challenge" onRun={withAddr((a) => cancelClaim(a, claim.id))} />,
    );
  }

  if (sections.length === 0) return null;

  return (
    <div className="glass-panel rounded-lg p-4 flex flex-col gap-3">
      <h3 className="font-mono text-xs uppercase text-on-surface-variant tracking-widest">Settlement &amp; Payouts</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{sections}</div>
      <p className="font-mono text-[10px] text-on-surface-variant">
        These actions are safe to try even if already done elsewhere — the contract cleanly rejects a
        repeat call (e.g. "already been claimed") rather than double-paying.
      </p>
    </div>
  );
}
