"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { SideNav } from "@/components/SideNav";
import { Footer } from "@/components/Footer";
import { getMyActivity, type MyActivityClaim } from "@/lib/api-client";

export default function MyStakedClaimsPage() {
  const { address, isConnected } = useAccount();
  const [claims, setClaims] = useState<MyActivityClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    getMyActivity(address)
      .then(setClaims)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load your claims."))
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <>
      <Navbar />
      <div className="flex flex-1 pt-16">
        <SideNav />
        <main className="flex-1 lg:ml-64 p-margin-mobile md:p-margin-desktop min-h-screen">
          <h1 className="font-sans font-bold text-2xl text-on-surface mb-2">My Staked Claims</h1>
          <p className="font-mono text-xs text-on-surface-variant mb-8">
            Every claim you've created, staked a side on, or submitted evidence for.
          </p>

          {!isConnected && (
            <div className="glass-panel rounded-lg p-12 text-center text-on-surface-variant font-mono text-sm">
              Connect your wallet to see your staked claims.
            </div>
          )}
          {isConnected && loading && (
            <div className="glass-panel rounded-lg p-12 text-center text-on-surface-variant font-mono text-sm">
              Loading…
            </div>
          )}
          {error && (
            <div className="glass-panel rounded-lg p-6 border border-challenge/40 text-challenge font-mono text-sm">
              {error}
            </div>
          )}
          {isConnected && !loading && !error && claims.length === 0 && (
            <div className="glass-panel rounded-lg p-12 text-center text-on-surface-variant font-mono text-sm">
              No activity yet — join a claim or submit evidence to see it here.
            </div>
          )}

          <div className="flex flex-col gap-3">
            {claims.map((c) => (
              <Link
                key={c.claimId}
                href={`/claims/${c.claimId}`}
                className="glass-panel rounded p-4 flex justify-between items-center hover:border-primary/50 transition-colors"
              >
                <div>
                  <div className="text-sm text-on-surface">{c.statement}</div>
                  <div className="font-mono text-[10px] text-on-surface-variant mt-1">
                    {c.status.replace(/_/g, " ")}
                    {c.verdict ? ` · ${c.verdict.replace(/_/g, " ")}` : ""}
                  </div>
                </div>
                <span className="font-mono text-[10px] text-primary">#{c.claimId}</span>
              </Link>
            ))}
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}
