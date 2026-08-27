"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { claimEvidencePayout, claimEvidenceRefund, friendlyRevertMessage } from "@/lib/genlayer-browser-client";

export function EvidencePayoutButton({ evidenceId, submitter, refundable }: { evidenceId: number; submitter: string; refundable: boolean }) {
  const { address, isConnected } = useAccount();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const isMine = isConnected && address?.toLowerCase() === submitter.toLowerCase();
  if (!isMine) return null;

  async function handle() {
    if (!address) return;
    setBusy(true);
    setMsg(null);
    try {
      if (refundable) {
        await claimEvidenceRefund(address, evidenceId);
      } else {
        await claimEvidencePayout(address, evidenceId);
      }
      setMsg("Claimed — check your withdrawable balance on Profile.");
      setIsError(false);
    } catch (err) {
      setMsg(friendlyRevertMessage(err));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <button
        onClick={handle}
        disabled={busy}
        className="font-mono text-[10px] uppercase text-primary hover:underline disabled:opacity-50"
      >
        {busy ? "Claiming…" : refundable ? "Claim Refund" : "Claim Evidence Payout"}
      </button>
      {msg && <p className={`font-mono text-[10px] mt-1 ${isError ? "text-challenge" : "text-secondary"}`}>{msg}</p>}
    </div>
  );
}
