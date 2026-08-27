"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { submitEvidence, friendlyRevertMessage } from "@/lib/genlayer-browser-client";
import { getCachedClaim } from "@/lib/api-client";
import { getClaim } from "@/lib/genlayer-client";
import { isPast } from "@/lib/format";
import type { ClaimRecord } from "@/lib/genlayer-client";

const SOURCE_TYPES = [
  "PRIMARY_SOURCE",
  "OFFICIAL_REPORT",
  "REGULATORY_FILING",
  "GOVERNMENT_RECORD",
  "ONCHAIN_DATA",
  "PEER_REVIEWED_RESEARCH",
  "INDEPENDENT_INVESTIGATION",
  "REPUTABLE_JOURNALISM",
  "ORGANIZATIONAL_PUBLICATION",
  "COMMUNITY_GENERATED",
  "SOCIAL_MEDIA",
  "ARCHIVED_SOURCE",
  "ANONYMOUS_SOURCE",
];

type TxState = "idle" | "preparing" | "awaiting_wallet" | "submitted" | "pending" | "confirmed" | "failed";

export default function SubmitEvidencePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [side, setSide] = useState<"SUPPORT" | "CHALLENGE" | "NEUTRAL">("SUPPORT");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publicationDate, setPublicationDate] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceType, setSourceType] = useState(SOURCE_TYPES[0]);
  const [stakeGen, setStakeGen] = useState("1");
  const [txState, setTxState] = useState<TxState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimRecord | null>(null);
  const [claimLoading, setClaimLoading] = useState(true);

  useEffect(() => {
    const claimId = Number(params.id);
    getCachedClaim(claimId)
      .catch(() => getClaim(claimId))
      .then(setClaim)
      .catch(() => setClaim(null))
      .finally(() => setClaimLoading(false));
  }, [params.id]);

  // Mirrors submit_evidence()'s own eligibility check exactly — the
  // contract requires status in (ACTIVE, EVIDENCE_MATURING) AND now <=
  // evidence_deadline_ts. Checking this client-side before the user fills
  // out the whole form (rather than letting them discover it only after
  // signing a doomed transaction) is the actual fix for "staking/evidence
  // still appeared allowed after the deadline passed".
  const evidenceWindowOpen =
    claim !== null && ["ACTIVE", "EVIDENCE_MATURING"].includes(claim.status) && !isPast(claim.evidence_deadline_ts);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected || !address) {
      setError("Connect your wallet first.");
      return;
    }
    if (claim && !evidenceWindowOpen) {
      setError("The evidence submission window for this claim has closed.");
      return;
    }
    setError(null);
    setTxState("preparing");
    try {
      const valueWei = BigInt(Math.round(Number(stakeGen) * 1e18)).toString();
      setTxState("awaiting_wallet");
      await submitEvidence(address, {
        claimId: Number(params.id),
        side,
        sourceUrl,
        sourceTitle,
        publisher,
        publicationDate,
        summary,
        sourceType,
        valueWei,
      });
      setTxState("confirmed");
      router.push(`/claims/${params.id}`);
    } catch (err) {
      setTxState("failed");
      setError(friendlyRevertMessage(err));
    }
  }

  return (
    <>
      <Navbar />
      <main className="flex-grow pt-24 pb-16 flex items-center justify-center px-margin-mobile">
        <div className="w-full max-w-2xl glass-panel rounded-xl overflow-hidden">
          <header className="p-6 border-b border-outline-variant/20 bg-surface-container/50">
            <h1 className="font-sans font-bold text-2xl text-on-surface">Submit Evidence</h1>
            <p className="font-mono text-xs text-on-surface-variant mt-1">CLAIM #{params.id}</p>
          </header>

          {!claimLoading && claim && !evidenceWindowOpen && (
            <div className="mx-6 mt-6 p-4 rounded border border-challenge/40 bg-challenge/10 font-mono text-xs text-challenge">
              This claim's evidence window has closed ({claim.status.replace(/_/g, " ")}) — submission
              will be rejected onchain. You can still fill out the form to see it, but Sign &amp; Submit
              is disabled.
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 md:p-8 flex flex-col gap-8">
            <section>
              <label className="block font-mono text-xs uppercase text-on-surface-variant mb-3">Position</label>
              <div className="grid grid-cols-3 gap-3">
                {(["SUPPORT", "CHALLENGE", "NEUTRAL"] as const).map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setSide(s)}
                    className={
                      "py-3 px-4 rounded border font-mono text-sm transition-all " +
                      (side === s
                        ? s === "SUPPORT"
                          ? "border-secondary bg-secondary/10 text-secondary"
                          : s === "CHALLENGE"
                            ? "border-challenge bg-challenge/10 text-challenge"
                            : "border-primary bg-primary/10 text-primary"
                        : "border-outline-variant/50 text-on-surface-variant hover:border-outline")
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <label className="block font-mono text-xs uppercase text-on-surface-variant mb-3">Source URL</label>
              <input
                required
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://…"
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 font-mono text-sm focus:outline-none focus:border-primary"
              />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-xs uppercase text-on-surface-variant mb-3">Source title</label>
                <input
                  required
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase text-on-surface-variant mb-3">Publisher</label>
                <input
                  required
                  value={publisher}
                  onChange={(e) => setPublisher(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-xs uppercase text-on-surface-variant mb-3">Publication date</label>
                <input
                  type="date"
                  value={publicationDate}
                  onChange={(e) => setPublicationDate(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase text-on-surface-variant mb-3">Source type</label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm focus:outline-none focus:border-primary"
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section>
              <label className="block font-mono text-xs uppercase text-on-surface-variant mb-3">
                How does this evidence bear on the claim?
              </label>
              <textarea
                required
                rows={4}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm resize-none focus:outline-none focus:border-primary"
              />
            </section>

            <section>
              <label className="block font-mono text-xs uppercase text-on-surface-variant mb-3">Stake amount (GEN)</label>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={stakeGen}
                onChange={(e) => setStakeGen(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-right font-mono text-sm focus:outline-none focus:border-primary"
              />
              <p className="font-mono text-xs text-on-surface-variant mt-2">
                This GEN is staked and reviewed alongside every other submission — weak, fabricated, or
                manipulated evidence is slashed once GenLayer adjudicates.
              </p>
            </section>

            {error && <p className="font-mono text-xs text-challenge">{error}</p>}

            <footer className="border-t border-outline-variant/20 pt-6 flex justify-end">
              <button
                type="submit"
                disabled={txState === "preparing" || txState === "awaiting_wallet" || (claim !== null && !evidenceWindowOpen)}
                className="bg-primary-fixed-dim text-on-primary font-mono text-xs uppercase tracking-wider py-4 px-8 rounded hover:brightness-110 transition-colors disabled:opacity-50"
              >
                {txState === "idle" || txState === "failed"
                  ? "Sign & Submit"
                  : txState === "preparing"
                    ? "Preparing…"
                    : txState === "awaiting_wallet"
                      ? "Awaiting wallet…"
                      : "Submitted"}
              </button>
            </footer>
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
