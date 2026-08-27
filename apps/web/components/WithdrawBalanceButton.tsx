"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { getWithdrawableBalance } from "@/lib/genlayer-client";
import { withdraw, friendlyRevertMessage } from "@/lib/genlayer-browser-client";
import { weiToGen } from "@/lib/format";

export function WithdrawBalanceButton() {
  const { address, isConnected } = useAccount();
  const [balanceWei, setBalanceWei] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!address) return;
    try {
      setBalanceWei(await getWithdrawableBalance(address));
    } catch {
      setBalanceWei(null);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function handleWithdraw() {
    if (!address) return;
    setError(null);
    setBusy(true);
    try {
      await withdraw(address);
      await refresh();
    } catch (err) {
      setError(friendlyRevertMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected || !address) return null;

  const hasBalance = balanceWei && balanceWei !== "0";

  return (
    <div className="glass-panel rounded-lg p-6 flex flex-col gap-3">
      <h2 className="font-mono text-xs uppercase text-primary tracking-widest">Withdrawable Balance</h2>
      <div className="font-mono text-2xl text-on-surface">{balanceWei ? weiToGen(balanceWei) : "0"} GEN</div>
      <p className="font-mono text-xs text-on-surface-variant">
        Rewards, refunds, and evidence payouts accumulate here once claimed on a settled claim — this
        button is the final step that actually moves GEN to your wallet.
      </p>
      {error && <p className="font-mono text-xs text-challenge">{error}</p>}
      <button
        onClick={handleWithdraw}
        disabled={!hasBalance || busy}
        className="self-start bg-primary-fixed-dim text-on-primary font-mono text-xs uppercase tracking-wider px-6 py-3 rounded hover:brightness-110 transition-colors disabled:opacity-40"
      >
        {busy ? "Withdrawing…" : "Withdraw"}
      </button>
    </div>
  );
}
