"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { getPlatformStats, isPaused as fetchIsPaused, getPendingAdminAction } from "@/lib/genlayer-client";
import {
  sweepTreasury,
  queuePause,
  pauseContract,
  queueUnpause,
  unpauseContract,
  queueSetProtocolFeeBps,
  setProtocolFeeBps,
  queueSetSlashSharesBps,
  setSlashSharesBps,
  queueSetMinStakes,
  setMinStakes,
  queueSetTreasuryAddress,
  setTreasuryAddress,
  queueTransferOwnership,
  transferOwnership,
  friendlyRevertMessage,
} from "@/lib/genlayer-browser-client";
import { weiToGen, shortAddress } from "@/lib/format";

type Stats = Awaited<ReturnType<typeof getPlatformStats>>;

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-[10px] uppercase text-on-surface-variant">{label}</label>
      <input
        {...props}
        className="bg-surface-container-low border border-outline-variant/50 rounded py-2 px-3 font-mono text-sm focus:outline-none focus:border-primary"
      />
    </div>
  );
}

function ResultLine({ msg, isError }: { msg: string | null; isError: boolean }) {
  if (!msg) return null;
  return <p className={`font-mono text-xs ${isError ? "text-challenge" : "text-secondary"}`}>{msg}</p>;
}

function formatCountdown(executableAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = executableAt - now;
  if (remaining <= 0) return "ready now";
  const hours = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  return `ready in ${hours}h ${mins}m`;
}

/** Every sensitive admin action is now queue-then-execute with a fixed
 * 48-hour timelock in between (see ADMIN_TIMELOCK_DELAY_SECONDS in the
 * contract) — this component drives that two-step flow generically:
 * checks get_pending_admin_action(actionKey) for a live countdown, shows
 * "Queue" while nothing is pending, "Execute" once the delay has elapsed,
 * and a countdown in between. */
function TimelockedAction({
  title,
  description,
  danger,
  actionKey,
  onQueue,
  onExecute,
  children,
}: {
  title: string;
  description: string;
  danger?: boolean;
  actionKey: string;
  onQueue: () => Promise<unknown>;
  onExecute: () => Promise<unknown>;
  children?: React.ReactNode;
}) {
  const [executableAt, setExecutableAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  async function refreshPending() {
    try {
      const ts = await getPendingAdminAction(actionKey);
      setExecutableAt(ts > 0 ? ts : null);
    } catch {
      setExecutableAt(null);
    }
  }

  useEffect(() => {
    refreshPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionKey]);

  const isPending = executableAt !== null;
  const isReady = isPending && executableAt! <= Math.floor(Date.now() / 1000);

  async function handle(fn: () => Promise<unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ text: "Success.", isError: false });
      await refreshPending();
    } catch (err) {
      setMsg({ text: friendlyRevertMessage(err), isError: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`glass-panel rounded-lg p-6 flex flex-col gap-4 ${danger ? "border border-challenge/40" : ""}`}>
      <div>
        <h2 className={`font-mono text-sm uppercase tracking-wider ${danger ? "text-challenge" : "text-primary"}`}>{title}</h2>
        <p className="font-mono text-xs text-on-surface-variant mt-1">{description}</p>
      </div>
      {children}
      <div className="flex items-center gap-3">
        {!isPending && (
          <button
            onClick={() => handle(onQueue)}
            disabled={busy}
            className="border border-gold text-gold font-mono text-xs uppercase px-6 py-2 rounded hover:bg-gold/10 transition-colors disabled:opacity-50"
          >
            {busy ? "Queuing…" : "Queue (starts 48h timelock)"}
          </button>
        )}
        {isPending && !isReady && (
          <span className="font-mono text-xs text-on-surface-variant">
            Queued — {formatCountdown(executableAt!)}
          </span>
        )}
        {isPending && isReady && (
          <button
            onClick={() => handle(onExecute)}
            disabled={busy}
            className={`font-mono text-xs uppercase px-6 py-2 rounded transition-colors disabled:opacity-50 ${
              danger ? "bg-challenge text-on-surface hover:brightness-110" : "bg-primary-fixed-dim text-on-primary hover:brightness-110"
            }`}
          >
            {busy ? "Executing…" : "Execute"}
          </button>
        )}
      </div>
      <ResultLine msg={msg?.text ?? null} isError={!!msg?.isError} />
    </div>
  );
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const [stats, setStats] = useState<Stats | null>(null);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [feeBps, setFeeBps] = useState("200");
  const [treasuryShareBps, setTreasuryShareBps] = useState("1500");
  const [poolShareBps, setPoolShareBps] = useState("8500");
  const [minSideStakeGen, setMinSideStakeGen] = useState("0");
  const [minEvidenceStakeGen, setMinEvidenceStakeGen] = useState("0");
  const [newTreasuryAddress, setNewTreasuryAddress] = useState("");
  const [newOwnerAddress, setNewOwnerAddress] = useState("");

  const [sweepMsg, setSweepMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [sweepBusy, setSweepBusy] = useState(false);

  async function refresh() {
    try {
      const [s, p] = await Promise.all([getPlatformStats(), fetchIsPaused()]);
      setStats(s);
      setPaused(p);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load contract state.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSweep() {
    if (!address) {
      setSweepMsg({ text: "Connect your wallet first.", isError: true });
      return;
    }
    setSweepBusy(true);
    setSweepMsg(null);
    try {
      await sweepTreasury(address);
      setSweepMsg({ text: "Success.", isError: false });
      await refresh();
    } catch (err) {
      setSweepMsg({ text: friendlyRevertMessage(err), isError: true });
    } finally {
      setSweepBusy(false);
    }
  }

  const toWei = (gen: string) => BigInt(Math.round(Number(gen) * 1e18)).toString();
  const a = address as `0x${string}` | undefined;

  return (
    <>
      <Navbar />
      <main className="flex-grow pt-24 pb-16 px-margin-mobile md:px-margin-desktop max-w-4xl mx-auto w-full flex flex-col gap-8">
        <div>
          <h1 className="font-sans font-extrabold text-3xl text-primary mb-2">Admin</h1>
          <p className="font-mono text-xs text-on-surface-variant">
            Owner-only contract configuration. The contract has no on-chain "who is the owner" view, so
            this page can't hide itself from a non-owner wallet — every action below is enforced by the
            contract itself, and will cleanly reject with "only the owner may call this" if you aren't
            the deployer. Every sensitive action requires queuing first and waiting a fixed 48-hour
            timelock before it can execute — no single transaction can change platform config or pause
            the arena instantly.
          </p>
        </div>

        {!isConnected && (
          <div className="glass-panel rounded-lg p-8 text-center text-on-surface-variant font-mono text-sm">
            Connect your wallet (the contract owner's wallet) to use admin actions.
          </div>
        )}

        {loadError && (
          <div className="glass-panel rounded-lg p-6 border border-challenge/40 text-challenge font-mono text-sm">{loadError}</div>
        )}

        {stats && (
          <div className="glass-panel rounded-lg p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="font-mono text-[10px] text-on-surface-variant uppercase">Accrued Treasury</div>
              <div className="font-mono text-lg text-gold">{weiToGen(stats.accrued_treasury_wei)} GEN</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-on-surface-variant uppercase">Protocol Fee</div>
              <div className="font-mono text-lg text-on-surface">{stats.protocol_fee_bps / 100}%</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-on-surface-variant uppercase">Claims / Evidence</div>
              <div className="font-mono text-lg text-on-surface">
                {stats.claim_count} / {stats.evidence_count}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-on-surface-variant uppercase">Status</div>
              <div className={`font-mono text-lg ${paused ? "text-challenge" : "text-secondary"}`}>
                {paused === null ? "…" : paused ? "PAUSED" : "LIVE"}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-on-surface-variant uppercase">Total Volume</div>
              <div className="font-mono text-sm text-on-surface">{weiToGen(stats.total_volume_wei)} GEN</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-on-surface-variant uppercase">Total Payouts</div>
              <div className="font-mono text-sm text-on-surface">{weiToGen(stats.total_payouts_wei)} GEN</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-on-surface-variant uppercase">Claims Settled</div>
              <div className="font-mono text-sm text-on-surface">{stats.total_claims_settled}</div>
            </div>
            {address && (
              <div>
                <div className="font-mono text-[10px] text-on-surface-variant uppercase">Connected As</div>
                <div className="font-mono text-sm text-on-surface">{shortAddress(address)}</div>
              </div>
            )}
          </div>
        )}

        <div className="glass-panel rounded-lg p-6 flex flex-col gap-4">
          <div>
            <h2 className="font-mono text-sm uppercase tracking-wider text-primary">Sweep Treasury</h2>
            <p className="font-mono text-xs text-on-surface-variant mt-1">
              Transfer the entire accrued treasury balance to the configured treasury address. Not
              timelocked — it can only move funds to treasury_address, and changing that address IS
              timelocked, so the destination is already protected.
            </p>
          </div>
          <button
            onClick={handleSweep}
            disabled={sweepBusy}
            className="self-start bg-gold text-background font-mono text-xs uppercase tracking-wider px-6 py-3 rounded hover:brightness-110 transition-colors disabled:opacity-50"
          >
            {sweepBusy ? "Sweeping…" : "Sweep Treasury"}
          </button>
          <ResultLine msg={sweepMsg?.text ?? null} isError={!!sweepMsg?.isError} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TimelockedAction
            title={paused ? "Unpause Platform" : "Pause Platform"}
            description="Pausing blocks create_claim, join_side, submit_evidence, and request_adjudication platform-wide. Settlement/withdrawal actions remain available regardless."
            danger={!paused}
            actionKey={paused ? "unpause" : "pause"}
            onQueue={() => (paused ? queueUnpause(a!) : queuePause(a!))}
            onExecute={() => (paused ? unpauseContract(a!) : pauseContract(a!))}
          />

          <TimelockedAction
            title="Protocol Fee"
            description="Basis points taken from the winning pool on settlement. Capped at 1000 bps (10%) by the contract."
            actionKey={`set_protocol_fee_bps:${feeBps}`}
            onQueue={() => queueSetProtocolFeeBps(a!, Number(feeBps))}
            onExecute={() => setProtocolFeeBps(a!, Number(feeBps))}
          >
            <Field label="Fee (bps)" type="number" min={0} max={1000} value={feeBps} onChange={(e) => setFeeBps(e.target.value)} />
          </TimelockedAction>

          <TimelockedAction
            title="Slash Shares"
            description="Split of a slashed evidence stake between treasury and the pool. Must sum to exactly 10000 bps."
            actionKey={`set_slash_shares_bps:${treasuryShareBps}:${poolShareBps}`}
            onQueue={() => queueSetSlashSharesBps(a!, Number(treasuryShareBps), Number(poolShareBps))}
            onExecute={() => setSlashSharesBps(a!, Number(treasuryShareBps), Number(poolShareBps))}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Treasury (bps)" type="number" value={treasuryShareBps} onChange={(e) => setTreasuryShareBps(e.target.value)} />
              <Field label="Pool (bps)" type="number" value={poolShareBps} onChange={(e) => setPoolShareBps(e.target.value)} />
            </div>
          </TimelockedAction>

          <TimelockedAction
            title="Platform-Wide Minimum Stakes"
            description="Floors applied on top of each claim's own minimum for side stakes and evidence stakes."
            actionKey={`set_min_stakes:${toWei(minSideStakeGen || "0")}:${toWei(minEvidenceStakeGen || "0")}`}
            onQueue={() => queueSetMinStakes(a!, toWei(minSideStakeGen), toWei(minEvidenceStakeGen))}
            onExecute={() => setMinStakes(a!, toWei(minSideStakeGen), toWei(minEvidenceStakeGen))}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min side stake (GEN)" type="number" min={0} step="0.01" value={minSideStakeGen} onChange={(e) => setMinSideStakeGen(e.target.value)} />
              <Field label="Min evidence stake (GEN)" type="number" min={0} step="0.01" value={minEvidenceStakeGen} onChange={(e) => setMinEvidenceStakeGen(e.target.value)} />
            </div>
          </TimelockedAction>

          <TimelockedAction
            title="Treasury Address"
            description="Where sweep_treasury() sends the accrued balance."
            actionKey={`set_treasury_address:${newTreasuryAddress.toLowerCase()}`}
            onQueue={() => queueSetTreasuryAddress(a!, newTreasuryAddress)}
            onExecute={() => setTreasuryAddress(a!, newTreasuryAddress)}
          >
            <Field label="New treasury address" placeholder="0x…" value={newTreasuryAddress} onChange={(e) => setNewTreasuryAddress(e.target.value)} />
          </TimelockedAction>

          <TimelockedAction
            title="Transfer Ownership"
            description="Irreversible from here — the new owner takes over every admin action on this page, including this one."
            danger
            actionKey={`transfer_ownership:${newOwnerAddress.toLowerCase()}`}
            onQueue={() => queueTransferOwnership(a!, newOwnerAddress)}
            onExecute={() => {
              if (!window.confirm(`Execute ownership transfer to ${newOwnerAddress}? This cannot be undone from this page.`)) {
                return Promise.resolve();
              }
              return transferOwnership(a!, newOwnerAddress);
            }}
          >
            <Field label="New owner address" placeholder="0x…" value={newOwnerAddress} onChange={(e) => setNewOwnerAddress(e.target.value)} />
          </TimelockedAction>
        </div>
      </main>
      <Footer />
    </>
  );
}
