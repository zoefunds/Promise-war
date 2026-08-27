"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { joinSide, friendlyRevertMessage } from "@/lib/genlayer-browser-client";

export function JoinSideButton({
  claimId,
  side,
  disabledReason,
}: {
  claimId: number;
  side: "SUPPORT" | "CHALLENGE";
  /** When set, the button renders as a disabled explanation instead of an
   * action — e.g. "Participation deadline has passed". Computed by the
   * parent from the claim's actual deadline timestamp, not its cached
   * status (see lib/format.ts's isPast doc comment for why). */
  disabledReason?: string;
}) {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amountGen, setAmountGen] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tone =
    side === "SUPPORT"
      ? "border-secondary text-secondary hover:bg-secondary/10"
      : "border-challenge text-challenge hover:bg-challenge/10";

  async function handleJoin() {
    if (!isConnected || !address) {
      setError("Connect your wallet first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const valueWei = BigInt(Math.round(Number(amountGen) * 1e18)).toString();
      await joinSide(address, { claimId, side, valueWei });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(friendlyRevertMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (disabledReason) {
    return (
      <div className="w-full border border-outline-variant/30 text-on-surface-variant font-mono text-xs uppercase py-2 rounded text-center opacity-70">
        {disabledReason}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`w-full border font-mono text-xs uppercase py-2 rounded transition-colors ${tone}`}
      >
        Join {side === "SUPPORT" ? "Support" : "Challenge"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 border border-outline-variant/40 rounded p-3">
      <label className="font-mono text-xs uppercase text-on-surface-variant">Stake amount (GEN)</label>
      <input
        type="number"
        min="0.01"
        step="0.01"
        value={amountGen}
        onChange={(e) => setAmountGen(e.target.value)}
        className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-2 px-3 text-right font-mono text-sm focus:outline-none focus:border-primary"
      />
      {error && <p className="font-mono text-xs text-challenge">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleJoin}
          disabled={busy}
          className={`flex-1 border font-mono text-xs uppercase py-2 rounded transition-colors disabled:opacity-50 ${tone}`}
        >
          {busy ? "Staking…" : "Confirm"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="px-3 border border-outline-variant/50 text-on-surface-variant font-mono text-xs uppercase py-2 rounded hover:border-outline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
