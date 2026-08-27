"use client";

import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function ConnectWalletButton() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();

  if (isConnected && address) {
    return (
      <button
        onClick={() => open({ view: "Account" })}
        className="bg-surface-container-high text-on-surface font-mono text-xs px-4 py-2 rounded border border-outline-variant/40 hover:border-primary/50 transition-colors"
      >
        {shortAddr(address)}
      </button>
    );
  }

  return (
    <button
      onClick={() => open()}
      className="bg-primary-fixed-dim text-on-primary font-mono text-xs uppercase tracking-wider px-4 py-2 rounded shadow-glow-cyan hover:brightness-110 transition-all"
    >
      Connect Wallet
    </button>
  );
}
