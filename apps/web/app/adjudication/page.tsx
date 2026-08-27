import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { SideNav } from "@/components/SideNav";
import { Footer } from "@/components/Footer";
import { RequestAdjudicationButton } from "@/components/RequestAdjudicationButton";
import { getCachedClaimsPage } from "@/lib/api-client";
import { timeRemaining, isPast } from "@/lib/format";

// Must mirror request_adjudication()'s own eligibility check exactly
// (contracts/promise_war_contract.py): status in these three PLUS the
// evidence deadline having passed — not "status says EVIDENCE_MATURING",
// since a claim can sit in plain ACTIVE indefinitely if nobody ever calls
// advance_to_evidence_maturing(). Filtering on cached status alone (the
// previous version of this page) silently hid every such claim from this
// list even though request_adjudication() would happily accept them.
const ELIGIBLE_STATUSES = ["ACTIVE", "EVIDENCE_MATURING", "NOT_YET_VERIFIABLE"];

export default async function AdjudicationPage() {
  let claims: Awaited<ReturnType<typeof getCachedClaimsPage>> = [];
  let loadError: string | null = null;
  try {
    const page = await getCachedClaimsPage(0, 50);
    claims = page.filter((c) => ELIGIBLE_STATUSES.includes(c.status) && isPast(c.evidence_deadline_ts));
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load claims.";
  }

  return (
    <>
      <Navbar />
      <div className="flex flex-1 pt-16">
        <SideNav />
        <main className="flex-1 lg:ml-64 p-margin-mobile md:p-margin-desktop min-h-screen">
          <h1 className="font-sans font-bold text-2xl text-on-surface mb-2">Adjudication</h1>
          <p className="font-mono text-xs text-on-surface-variant mb-8">
            Claims past their evidence deadline are eligible for adjudication — anyone can trigger
            GenLayer's web-fetch + LLM consensus to render a verdict. This costs no GEN, just gas.
          </p>

          {loadError && (
            <div className="glass-panel rounded-lg p-6 mb-8 border border-challenge/40 text-challenge font-mono text-sm">
              {loadError}
            </div>
          )}
          {claims.length === 0 && !loadError && (
            <div className="glass-panel rounded-lg p-12 text-center text-on-surface-variant font-mono text-sm">
              No claims are currently eligible for adjudication.
            </div>
          )}

          <div className="flex flex-col gap-3">
            {claims.map((c) => (
              <div key={c.id} className="glass-panel rounded p-4 flex justify-between items-center gap-4">
                <div>
                  <Link href={`/claims/${c.id}`} className="text-sm text-on-surface hover:text-primary">
                    {c.statement}
                  </Link>
                  <div className="font-mono text-[10px] text-on-surface-variant mt-1">
                    {c.status.replace(/_/g, " ")} · {timeRemaining(c.evidence_deadline_ts)}
                  </div>
                </div>
                <RequestAdjudicationButton claimId={c.id} />
              </div>
            ))}
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}
