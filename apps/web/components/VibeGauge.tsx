// The "Vibe Check" gauge — ratio of SUPPORT vs CHALLENGE stake, per DESIGN.md.
export function VibeGauge({ supportBps, challengeBps }: { supportBps: number; challengeBps: number }) {
  const supportPct = Math.round(supportBps / 100);
  const challengePct = 100 - supportPct;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between font-mono text-xs">
        <span className="text-secondary">{supportPct}% Support</span>
        <span className="text-challenge">{challengePct}% Challenge</span>
      </div>
      <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden flex">
        <div className="h-full bg-secondary shadow-glow-green" style={{ width: `${supportPct}%` }} />
        <div className="h-full bg-challenge shadow-glow-red" style={{ width: `${challengePct}%` }} />
      </div>
    </div>
  );
}
