"use client";

import { useAccount } from "wagmi";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { WithdrawBalanceButton } from "@/components/WithdrawBalanceButton";
import { shortAddress } from "@/lib/format";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();

  return (
    <>
      <Navbar />
      <main className="flex-grow pt-24 pb-16 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto w-full">
        {!isConnected || !address ? (
          <div className="glass-panel rounded-lg p-12 text-center text-on-surface-variant font-mono text-sm">
            Connect your wallet to view your Operator profile.
          </div>
        ) : (
          <div className="glass-panel rounded-xl p-8 flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-surface-container-highest flex items-center justify-center text-2xl">
                🛡️
              </div>
              <div>
                <div className="font-mono text-xs uppercase text-primary tracking-widest">Operator</div>
                <div className="font-mono text-sm text-on-surface-variant">{shortAddress(address)}</div>
              </div>
            </div>
            <p className="font-mono text-xs text-on-surface-variant">
              Reputation, wins/losses, and evidence-reward history are read live from the deployed
              contract's <code>get_reputation</code> view — wire this once the GenLayer client is
              connected (see <code>lib/genlayer-client.ts</code>).
            </p>
          </div>
        )}
        {isConnected && address && (
          <div className="mt-6 flex flex-col gap-6">
            <WithdrawBalanceButton />
            <NotificationsPanel />
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
