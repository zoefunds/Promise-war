"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { createClaim, friendlyRevertMessage } from "@/lib/genlayer-browser-client";

const CATEGORIES = ["DEFI", "TECH", "GEOPOLITICS", "CLIMATE", "GOVERNANCE", "FINANCE", "SPORTS", "PUBLIC_HEALTH", "OTHER"];

export default function CreateClaimPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [statement, setStatement] = useState("");
  const [description, setDescription] = useState("");
  const [resolutionCriteria, setResolutionCriteria] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [participationDays, setParticipationDays] = useState("3");
  const [evidenceDays, setEvidenceDays] = useState("7");
  const [openingStakeGen, setOpeningStakeGen] = useState("10");
  const [minSideStakeGen, setMinSideStakeGen] = useState("1");
  const [minEvidenceStakeGen, setMinEvidenceStakeGen] = useState("0.5");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected || !address) {
      setError("Connect your wallet first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const now = Math.floor(Date.now() / 1000);
      const participationDeadlineTs = now + Number(participationDays) * 86400;
      const evidenceDeadlineTs = participationDeadlineTs + Number(evidenceDays) * 86400;
      const toWei = (gen: string) => BigInt(Math.round(Number(gen) * 1e18)).toString();

      const { claimId } = await createClaim(address, {
        statement,
        description,
        resolutionCriteria,
        category,
        participationDeadlineTs,
        evidenceDeadlineTs,
        minSideStakeWei: toWei(minSideStakeGen),
        minEvidenceStakeWei: toWei(minEvidenceStakeGen),
        valueWei: toWei(openingStakeGen),
      });
      router.push(claimId !== null ? `/claims/${claimId}` : "/arena");
    } catch (err) {
      setError(friendlyRevertMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="flex-grow pt-24 pb-16 flex items-center justify-center px-margin-mobile">
        <form onSubmit={handleSubmit} className="w-full max-w-2xl glass-panel rounded-xl p-8 flex flex-col gap-6">
          <div>
            <h1 className="font-sans font-bold text-2xl text-on-surface">Bring a Claim to the Arena</h1>
            <p className="font-mono text-xs text-on-surface-variant mt-1">
              Structure it clearly — GenLayer will eventually weigh evidence against exactly what you write here.
            </p>
          </div>

          <div>
            <label className="block font-mono text-xs uppercase text-on-surface-variant mb-2">Claim statement</label>
            <input
              required
              maxLength={300}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder='"Protocol X will reach 100k users by December."'
              className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase text-on-surface-variant mb-2">Description / context</label>
            <textarea
              rows={3}
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm resize-none focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase text-on-surface-variant mb-2">
              Resolution criteria (how should "fulfilled" be judged?)
            </label>
            <textarea
              rows={3}
              maxLength={2000}
              value={resolutionCriteria}
              onChange={(e) => setResolutionCriteria(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm resize-none focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-xs uppercase text-on-surface-variant mb-2">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-mono text-xs uppercase text-on-surface-variant mb-2">Opening stake (GEN)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingStakeGen}
                onChange={(e) => setOpeningStakeGen(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm text-right"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-xs uppercase text-on-surface-variant mb-2">
                Participation window (days)
              </label>
              <input
                type="number"
                min="1"
                value={participationDays}
                onChange={(e) => setParticipationDays(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm text-right"
              />
            </div>
            <div>
              <label className="block font-mono text-xs uppercase text-on-surface-variant mb-2">
                Evidence window after that (days)
              </label>
              <input
                type="number"
                min="1"
                value={evidenceDays}
                onChange={(e) => setEvidenceDays(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm text-right"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-xs uppercase text-on-surface-variant mb-2">Min side stake (GEN)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={minSideStakeGen}
                onChange={(e) => setMinSideStakeGen(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm text-right"
              />
            </div>
            <div>
              <label className="block font-mono text-xs uppercase text-on-surface-variant mb-2">
                Min evidence stake (GEN)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={minEvidenceStakeGen}
                onChange={(e) => setMinEvidenceStakeGen(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded py-3 px-4 text-sm text-right"
              />
            </div>
          </div>

          {error && <p className="font-mono text-xs text-challenge">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 bg-primary-fixed-dim text-on-primary font-mono text-xs uppercase tracking-wider py-4 rounded hover:brightness-110 transition-colors disabled:opacity-50"
          >
            {submitting ? "Deploying claim…" : "Lock GEN & Create Claim"}
          </button>
        </form>
      </main>
      <Footer />
    </>
  );
}
