import Link from "next/link";
import type { ClaimRecord } from "@/lib/genlayer-client";
import { weiToGen, timeRemaining } from "@/lib/format";
import { VibeGauge } from "./VibeGauge";

const STATUS_ACCENT: Record<string, string> = {
  ACTIVE: "bg-secondary/80",
  EVIDENCE_MATURING: "bg-primary/80",
  READY_FOR_REVIEW: "bg-gold/80",
  NOT_YET_VERIFIABLE: "bg-gold/80",
  ADJUDICATED: "bg-gold/80",
  SETTLED: "bg-outline-variant",
  CANCELLED: "bg-outline-variant",
  EXPIRED_TIMEOUT: "bg-challenge/80",
};

export function ClaimCard({ claim }: { claim: ClaimRecord }) {
  const support = Number(claim.support_stake_wei);
  const challenge = Number(claim.challenge_stake_wei);
  const total = support + challenge;
  const supportBps = total > 0 ? Math.round((support / total) * 10000) : 5000;

  return (
    <article className="glass-panel rounded-xl p-6 flex flex-col gap-4 relative overflow-hidden hover:border-primary/50 transition-colors">
      <div className={`absolute top-0 left-0 w-full h-1 ${STATUS_ACCENT[claim.status] ?? "bg-outline-variant"}`} />
      <header className="flex justify-between items-start">
        <span className="font-mono text-xs text-on-surface-variant border border-outline-variant/30 bg-surface-container-high px-2 py-1 rounded">
          {claim.category} • {claim.status.replace(/_/g, " ")}
        </span>
        <span className="font-mono text-xs text-on-surface-variant">{timeRemaining(claim.evidence_deadline_ts)}</span>
      </header>
      <h2 className="font-sans font-bold text-lg text-on-surface leading-tight">{claim.statement}</h2>
      <div className="grid grid-cols-2 gap-4 my-2 border-y border-outline-variant/20 py-4">
        <div>
          <div className="font-mono text-xs text-on-surface-variant mb-1">TOTAL STAKE (GEN)</div>
          <div className="font-mono text-lg text-primary">{weiToGen(claim.total_stake_wei ?? "0")}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xs text-on-surface-variant mb-1">EVIDENCE</div>
          <div className="font-mono text-lg text-on-surface">{claim.evidence_count}</div>
        </div>
      </div>
      <VibeGauge supportBps={supportBps} challengeBps={10000 - supportBps} />
      <Link
        href={`/claims/${claim.id}`}
        className="mt-4 text-center bg-surface-container-highest text-on-surface border border-outline-variant py-2 rounded font-mono text-sm hover:border-primary/50 transition-all"
      >
        Enter Battle
      </Link>
    </article>
  );
}
