import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const STEPS = [
  {
    title: "Find a claim",
    body: "Browse the Arena for verifiable, falsifiable real-world claims — a protocol milestone, a treaty ratification, a launch date. Vague or unfalsifiable claims get flagged CLAIM_INVALID at adjudication, so precision helps everyone.",
  },
  {
    title: "Investigate",
    body: "Read the claim's resolution criteria carefully — that's exactly what GenLayer will weigh evidence against. Look for primary sources: official reports, onchain data, regulatory filings, reputable journalism.",
  },
  {
    title: "Pick a side, back it with evidence",
    body: "Stake GEN on SUPPORT or CHALLENGE, then submit evidence with its own stake. Evidence is judged on authenticity, authority, relevance, timeliness, and whether it genuinely supports the side it was submitted for — not on how much GEN backs it.",
  },
  {
    title: "Let the arena play out",
    body: "Other investigators will find counter-evidence. Strong evidence earns a reward when its side wins; weak, misleading, or fabricated evidence gets slashed once GenLayer adjudicates — regardless of which side staked more.",
  },
];

export default function IntelPage() {
  return (
    <>
      <Navbar />
      <main className="flex-grow pt-24 pb-16 px-margin-mobile md:px-margin-desktop max-w-3xl mx-auto w-full flex flex-col gap-8">
        <div>
          <h1 className="font-sans font-extrabold text-3xl text-primary mb-2">Intel</h1>
          <p className="text-on-surface-variant">
            A short guide to playing PROMISE WAR well — the game is investigation and evidence quality,
            not who can stake the most.
          </p>
        </div>
        <div className="flex flex-col gap-6">
          {STEPS.map((s, i) => (
            <div key={s.title} className="glass-panel rounded-lg p-6">
              <div className="font-mono text-xs text-primary mb-2">STEP {i + 1}</div>
              <h2 className="font-sans font-bold text-lg text-on-surface mb-2">{s.title}</h2>
              <p className="text-sm text-on-surface-variant">{s.body}</p>
            </div>
          ))}
        </div>
        <Link
          href="/arena"
          className="self-start bg-primary-fixed-dim text-on-primary font-mono text-xs uppercase tracking-wider px-6 py-3 rounded hover:brightness-110 transition-all"
        >
          Enter the Arena
        </Link>
      </main>
      <Footer />
    </>
  );
}
