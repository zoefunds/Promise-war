import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { SideNav } from "@/components/SideNav";
import { Footer } from "@/components/Footer";
import { getGlobalEvidenceFeed } from "@/lib/api-client";
import { weiToGen, shortAddress } from "@/lib/format";

const SIDE_COLOR: Record<string, string> = {
  SUPPORT: "text-secondary border-secondary",
  CHALLENGE: "text-challenge border-challenge",
  NEUTRAL: "text-primary border-primary",
};

export default async function EvidenceVaultPage() {
  let evidence: Awaited<ReturnType<typeof getGlobalEvidenceFeed>> = [];
  let loadError: string | null = null;
  try {
    evidence = await getGlobalEvidenceFeed(0, 30);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load the evidence vault.";
  }

  return (
    <>
      <Navbar />
      <div className="flex flex-1 pt-16">
        <SideNav />
        <main className="flex-1 lg:ml-64 p-margin-mobile md:p-margin-desktop min-h-screen">
          <h1 className="font-sans font-bold text-2xl text-on-surface mb-2">Evidence Vault</h1>
          <p className="font-mono text-xs text-on-surface-variant mb-8">
            Every piece of evidence submitted across every claim, newest first — a permanent, staked
            record of the investigative work behind the arena.
          </p>

          {loadError && (
            <div className="glass-panel rounded-lg p-6 mb-8 border border-challenge/40 text-challenge font-mono text-sm">
              {loadError}
            </div>
          )}
          {evidence.length === 0 && !loadError && (
            <div className="glass-panel rounded-lg p-12 text-center text-on-surface-variant font-mono text-sm">
              No evidence submitted yet.
            </div>
          )}

          <div className="flex flex-col gap-3">
            {evidence.map((e) => (
              <Link
                key={e.id}
                href={`/claims/${e.claim_id}`}
                className={`glass-panel rounded p-4 flex flex-col gap-2 border-l-2 hover:border-opacity-100 transition-colors ${SIDE_COLOR[e.side] ?? "border-outline-variant"}`}
              >
                <div className="flex justify-between items-start gap-4">
                  <span className="font-mono text-xs text-on-surface-variant">{e.claim.statement}</span>
                  <span className="font-mono text-[10px] text-on-surface-variant whitespace-nowrap">
                    {weiToGen(e.stake_wei)} GEN
                  </span>
                </div>
                <div className="text-sm text-on-surface">{e.source_title}</div>
                <div className="flex justify-between items-center font-mono text-[10px] text-on-surface-variant">
                  <span>
                    {e.side} · {shortAddress(e.submitter)}
                  </span>
                  <span>{e.adjudicated ? e.outcome.replace(/_/g, " ") : "Awaiting review"}</span>
                </div>
              </Link>
            ))}
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}
