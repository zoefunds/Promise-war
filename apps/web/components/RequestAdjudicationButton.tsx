"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { requestAdjudication, friendlyRevertMessage } from "@/lib/genlayer-browser-client";

export function RequestAdjudicationButton({ claimId }: { claimId: number }) {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!isConnected || !address) {
      setError("Connect your wallet first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // request_adjudication is not payable — any address may trigger it
      // once the evidence deadline has passed. This runs the real
      // GenLayer web-fetch + LLM consensus onchain and returns the
      // resulting verdict tag directly from the finalized receipt.
      const { verdict: v } = await requestAdjudication(address, claimId);
      setVerdict(v);
      router.refresh();
    } catch (err) {
      setError(friendlyRevertMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={busy}
        className="border border-gold text-gold font-mono text-xs uppercase py-2 px-4 rounded hover:bg-gold/10 transition-colors disabled:opacity-50"
      >
        {busy ? "Running consensus…" : "Trigger Adjudication"}
      </button>
      {verdict && <p className="font-mono text-[10px] text-secondary">Verdict: {verdict.replace(/_/g, " ")}</p>}
      {error && <p className="font-mono text-[10px] text-challenge">{error}</p>}
    </div>
  );
}
