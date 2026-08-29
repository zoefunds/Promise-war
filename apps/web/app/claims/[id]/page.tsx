import { Navbar } from "@/components/Navbar";
import { SideNav } from "@/components/SideNav";
import { Footer } from "@/components/Footer";
import { VibeGauge } from "@/components/VibeGauge";
import { getClaim, getClaimEvidence } from "@/lib/genlayer-client";
import { getCachedClaim, getCachedClaimEvidence } from "@/lib/api-client";
import { weiToGen, shortAddress, isPast } from "@/lib/format";
import { JoinSideButton } from "@/components/JoinSideButton";
import { SettlementPanel } from "@/components/SettlementPanel";
import { EvidencePayoutButton } from "@/components/EvidencePayoutButton";
import { RequestAdjudicationButton } from "@/components/RequestAdjudicationButton";
import Link from "next/link";

export default async function ClaimDetailPage({ params }: { params: { id: string } }) {
  const claimId = Number(params.id);
  let claim, evidence;
  let loadError: string | null = null;
  // Cache-first (fast, backed by the sync poller), falling back to a
  // direct contract read if the API is unreachable or hasn't synced this
  // claim yet (e.g. right after create_claim, before the next poll tick).
  try {
    [claim, evidence] = await Promise.all([getCachedClaim(claimId), getCachedClaimEvidence(claimId)]);
  } catch {
    try {
      [claim, evidence] = await Promise.all([getClaim(claimId), getClaimEvidence(claimId)]);
    } catch (err) {
      loadError = err instanceof Error ? err.message : "Failed to load claim.";
    }
  }

  return (
    <>
      <Navbar />
      <div className="flex flex-1 pt-16">
        <SideNav />
        <main className="flex-1 lg:ml-64 p-margin-mobile md:p-margin-desktop flex flex-col gap-8 max-w-container-max mx-auto w-full">
          {loadError || !claim ? (
            <div className="glass-panel rounded-lg p-12 text-center text-challenge font-mono text-sm">
              {loadError ?? "Claim not found."}
            </div>
          ) : (
            <>
              {(() => {
                const participationOpen = claim.status === "ACTIVE" && !isPast(claim.participation_deadline_ts);
                const evidenceOpen =
                  ["ACTIVE", "EVIDENCE_MATURING"].includes(claim.status) && !isPast(claim.evidence_deadline_ts);
                const isRefundable = claim.status === "CANCELLED" || claim.status === "EXPIRED_TIMEOUT" || claim.verdict === "CLAIM_INVALID";
                // Mirrors request_adjudication()'s own eligibility check
                // exactly (contracts/promise_war_contract.py) and the
                // /adjudication hub page's filter: permissionless, callable
                // by ANY address (not just the creator) once the evidence
                // deadline has passed. This button used to exist only on
                // the separate /adjudication page — a real UX gap, since a
                // viewer landing directly on a specific claim had no way to
                // trigger it without knowing that other page existed.
                const adjudicationEligible =
                  ["ACTIVE", "EVIDENCE_MATURING", "NOT_YET_VERIFIABLE"].includes(claim.status) &&
                  isPast(claim.evidence_deadline_ts);
                return (
                  <>
                    <section className="glass-panel p-6 rounded-lg border-t-2 border-t-primary flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
                      <div className="absolute inset-0 scanline opacity-30" />
                      <div className="relative z-10 flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="bg-surface-container-high px-2 py-1 rounded font-mono text-xs text-primary border border-outline-variant/30">
                            CLAIM #{claim.id}
                          </span>
                          <span className="font-mono text-xs text-gold">{claim.status.replace(/_/g, " ")}</span>
                          {claim.status === "ACTIVE" && isPast(claim.evidence_deadline_ts) && (
                            <span className="font-mono text-xs text-challenge">deadline passed — awaiting adjudication</span>
                          )}
                        </div>
                        <h1 className="font-sans font-extrabold text-3xl md:text-4xl text-on-surface mb-2">
                          "{claim.statement}"
                        </h1>
                        <div className="flex gap-4 font-mono text-sm text-on-surface-variant">
                          <span>Creator: {shortAddress(claim.creator)}</span>
                          <span className="text-on-surface">Total stake: {weiToGen(claim.total_stake_wei)} GEN</span>
                        </div>
                      </div>
                      <div className="relative z-10 flex flex-col gap-3 min-w-[200px]">
                        {evidenceOpen ? (
                          <Link
                            href={`/claims/${claim.id}/submit-evidence`}
                            className="bg-primary-fixed-dim text-on-primary font-mono text-xs uppercase tracking-wider py-3 px-6 rounded hover:brightness-110 transition-colors text-center"
                          >
                            + Submit Evidence
                          </Link>
                        ) : (
                          <div className="border border-outline-variant/30 text-on-surface-variant font-mono text-xs uppercase py-3 px-6 rounded text-center opacity-70">
                            Evidence window closed
                          </div>
                        )}
                      </div>
                    </section>

                    <SettlementPanel claim={claim} />

                    <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
                      <div className="lg:col-span-5 flex flex-col gap-4">
                        <div className="flex justify-between items-center border-b border-secondary/30 pb-2">
                          <h2 className="font-mono text-xs uppercase text-secondary">Support</h2>
                          <span className="font-mono text-xs text-on-surface-variant">{claim.support_evidence_count} items</span>
                        </div>
                        {evidence
                          ?.filter((e) => e.side === "SUPPORT")
                          .map((e) => (
                            <div key={e.id} className="glass-panel p-4 rounded border-l-2 border-secondary">
                              <a
                                href={e.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-on-surface hover:text-secondary block mb-2 underline decoration-outline-variant underline-offset-4"
                              >
                                {e.source_title}
                              </a>
                              <div className="font-mono text-xs text-on-surface-variant text-right">
                                {e.adjudicated ? e.outcome.replace(/_/g, " ") : "Awaiting review"}
                              </div>
                              <EvidencePayoutButton evidenceId={e.id} submitter={e.submitter} refundable={isRefundable} />
                            </div>
                          ))}
                        <div className="mt-2">
                          <JoinSideButton
                            claimId={claim.id}
                            side="SUPPORT"
                            disabledReason={participationOpen ? undefined : "Participation deadline has passed"}
                          />
                        </div>
                      </div>

                      <div className="lg:col-span-2 flex flex-col items-center gap-4">
                        <div className="font-mono text-xs text-on-surface-variant uppercase">Arena Pulse</div>
                        <VibeGauge
                          supportBps={
                            Number(claim.support_stake_wei) + Number(claim.challenge_stake_wei) > 0
                              ? Math.round(
                                  (Number(claim.support_stake_wei) /
                                    (Number(claim.support_stake_wei) + Number(claim.challenge_stake_wei))) *
                                    10000,
                                )
                              : 5000
                          }
                          challengeBps={0}
                        />
                        {claim.verdict && (
                          <div className="glass-panel rounded p-3 text-center mt-4">
                            <div className="font-mono text-xs text-gold uppercase mb-1">Verdict</div>
                            <div className="font-mono text-sm text-on-surface">{claim.verdict.replace(/_/g, " ")}</div>
                          </div>
                        )}
                      </div>

                      <div className="lg:col-span-5 flex flex-col gap-4">
                        <div className="flex justify-between items-center border-b border-challenge/30 pb-2">
                          <h2 className="font-mono text-xs uppercase text-challenge">Challenge</h2>
                          <span className="font-mono text-xs text-on-surface-variant">{claim.challenge_evidence_count} items</span>
                        </div>
                        {evidence
                          ?.filter((e) => e.side === "CHALLENGE")
                          .map((e) => (
                            <div key={e.id} className="glass-panel p-4 rounded border-l-2 border-challenge">
                              <a
                                href={e.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-on-surface hover:text-challenge block mb-2 underline decoration-outline-variant underline-offset-4"
                              >
                                {e.source_title}
                              </a>
                              <div className="font-mono text-xs text-on-surface-variant text-right">
                                {e.adjudicated ? e.outcome.replace(/_/g, " ") : "Awaiting review"}
                              </div>
                              <EvidencePayoutButton evidenceId={e.id} submitter={e.submitter} refundable={isRefundable} />
                            </div>
                          ))}
                        <div className="mt-2">
                          <JoinSideButton
                            claimId={claim.id}
                            side="CHALLENGE"
                            disabledReason={participationOpen ? undefined : "Participation deadline has passed"}
                          />
                        </div>

                        <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg overflow-hidden mt-4">
                          <div className="bg-surface-container-high px-4 py-2 border-b border-outline-variant/20 flex justify-between items-center">
                            <span className="font-mono text-xs text-on-surface-variant uppercase tracking-wider">
                              GenLayer Adjudication
                            </span>
                          </div>
                          <div className="p-4 font-mono text-xs text-on-surface leading-relaxed">
                            {claim.reasoning_summary || "No adjudication has run yet for this claim."}
                          </div>
                          {adjudicationEligible && (
                            <div className="p-4 border-t border-outline-variant/20 flex flex-col gap-2">
                              <p className="font-mono text-[10px] text-on-surface-variant">
                                The evidence deadline has passed — anyone can trigger adjudication now (no
                                stake or GEN required, just gas). This is not limited to the claim's
                                creator.
                              </p>
                              <RequestAdjudicationButton claimId={claim.id} />
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  </>
                );
              })()}
            </>
          )}
        </main>
      </div>
      <Footer />
    </>
  );
}
