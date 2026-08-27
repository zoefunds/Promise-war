import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const SECTIONS = [
  {
    title: "Claim creation",
    rules: [
      "Permissionless — any address may create a claim. There is no reputation gate; the economic stake required is the only filter.",
      "A claim needs a statement, description, resolution criteria, category, a participation deadline (when side-staking closes), and an evidence deadline (when evidence submission closes) — the evidence deadline must be at or after the participation deadline.",
      "The creator may optionally lock an opening GEN stake, which is automatically placed on SUPPORT.",
    ],
  },
  {
    title: "Staking a side",
    rules: [
      "Anyone may stake GEN on SUPPORT or CHALLENGE while a claim is ACTIVE, up to its participation deadline.",
      "Each claim has its own minimum stake, floored by a platform-wide minimum.",
    ],
  },
  {
    title: "Submitting evidence",
    rules: [
      "Evidence may be submitted for SUPPORT, CHALLENGE, or NEUTRAL, staked with its own GEN amount, up to the evidence deadline.",
      "GenLayer independently fetches the source URL and evaluates it on five axes: authenticity, source authority, relevance, timeliness, and whether it genuinely supports the side it was submitted for.",
      "Evidence is classified into one of ten outcome tiers, from STRONGLY_SUPPORTS (no slash, reward-eligible) down to MALICIOUSLY_MANIPULATED (100% slashed, flagged).",
    ],
  },
  {
    title: "Adjudication",
    rules: [
      "Permissionless — any address may trigger request_adjudication() once the evidence deadline has passed. No transaction value is required, only gas.",
      "GenLayer weighs every already-adjudicated piece of evidence and renders one of six verdicts: FULFILLED, MATERIALLY_FULFILLED, PARTIALLY_FULFILLED, NOT_FULFILLED, NOT_YET_VERIFIABLE, or CLAIM_INVALID.",
      "NOT_YET_VERIFIABLE is a safe, nonterminal result — the claim stays open for more evidence rather than forcing a premature payout. New evidence may be submitted and a retry requested after a 6-hour cooldown; the evidence window is extended forward each time this happens so the reopening is real, not just described.",
      "If nobody triggers adjudication within 7 days of the evidence deadline, any address may call claim_adjudication_timeout() — every stake becomes fully refundable.",
    ],
  },
  {
    title: "Settlement",
    rules: [
      "FULFILLED pays 100% of the combined pool to SUPPORT. MATERIALLY_FULFILLED pays 85%. PARTIALLY_FULFILLED splits 55/45. NOT_FULFILLED pays 100% to CHALLENGE. CLAIM_INVALID refunds everyone in full.",
      "A 2% protocol fee (capped at 10% by contract-level governance) applies to the winning pool only — never to a refund.",
      "Payout division can leave a few wei of floor-division remainder — the contract tracks cumulative claimed stake per side and hands that remainder to whichever claimant's payout completes the side's total, so the full pool is always distributed with nothing left permanently unclaimed.",
      "85% of every slashed evidence stake is added to a pool paid out to the winning side's stakers (on top of their own share of the combined pool); the remaining 15% goes to the protocol treasury. A claim with no winning side (NOT_YET_VERIFIABLE staying open, or CLAIM_INVALID) has no slash pool to distribute, so it falls back to the treasury instead.",
      "Reward-eligible evidence on the winning side earns a reputation credit for its submitter; flagged (maliciously manipulated) evidence costs its submitter a reputation penalty regardless of which side it was on.",
    ],
  },
  {
    title: "Source integrity",
    rules: [
      "Evidence URLs must be https:// — plaintext http:// sources are rejected outright.",
      "Obvious non-public hosts (localhost, private IP ranges, cloud metadata endpoints) are rejected at submission time.",
      "This is a deliberate, partial defense: DNS-resolution-time spoofing and redirect-chain behavior happen inside GenLayer's own fetch implementation, outside what this contract's Python code can inspect or override.",
    ],
  },
  {
    title: "Cancellation",
    rules: [
      "The creator may cancel a claim only while it is still ACTIVE and only if no other address has staked either side or submitted evidence yet — the moment anyone else participates, the claim can no longer be cancelled out from under them.",
    ],
  },
];

export default function LawsPage() {
  return (
    <>
      <Navbar />
      <main className="flex-grow pt-24 pb-16 px-margin-mobile md:px-margin-desktop max-w-3xl mx-auto w-full flex flex-col gap-8">
        <div>
          <h1 className="font-sans font-extrabold text-3xl text-primary mb-2">Terms of Combat</h1>
          <p className="text-on-surface-variant">
            The actual rules enforced by the deployed Intelligent Contract — not marketing copy. Every
            number here matches <code>contracts/promise_war_contract.py</code> exactly.
          </p>
        </div>
        <div className="flex flex-col gap-6">
          {SECTIONS.map((s) => (
            <div key={s.title} className="glass-panel rounded-lg p-6">
              <h2 className="font-sans font-bold text-lg text-on-surface mb-3">{s.title}</h2>
              <ul className="flex flex-col gap-2">
                {s.rules.map((r, i) => (
                  <li key={i} className="text-sm text-on-surface-variant flex gap-2">
                    <span className="text-primary">→</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
