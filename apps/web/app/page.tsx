import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const SETTLED_TICKER = [
  { id: "CLAIM-0004", amount: "12,500 GEN" },
  { id: "CLAIM-0003", amount: "3,200 GEN" },
  { id: "CLAIM-0002", amount: "85,000 GEN" },
  { id: "CLAIM-0001", amount: "50,000 GEN" },
];

const FEATURES = [
  {
    icon: "🔍",
    title: "Evidence Discovery",
    body: "Every submission is a real GEN stake, timestamped and permanently recorded onchain — evidence quality, not evidence quantity, is what wins a claim.",
  },
  {
    icon: "🧠",
    title: "Intelligent Adjudication",
    body: "GenLayer's own web-fetch + LLM consensus independently verifies each source and weighs the full evidence set to render a verdict — no human moderator, no off-chain oracle.",
  },
  {
    icon: "🔒",
    title: "Onchain Settlement",
    body: "One emission point, zero-then-transfer every time. GEN moves to the winning side and the strongest evidence the moment a verdict lands — no intermediaries, no manual payout.",
  },
];

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main className="flex-grow pt-16 flex flex-col items-center w-full">
        <section className="relative w-full min-h-[70vh] flex flex-col items-center justify-center px-margin-mobile md:px-margin-desktop overflow-hidden">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/60 to-background" />
            <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[140px]" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[140px]" />
          </div>
          <div className="relative z-10 max-w-container-max w-full flex flex-col items-center text-center gap-8 mt-12">
            <h1 className="font-sans font-extrabold text-4xl md:text-6xl text-primary max-w-4xl tracking-tight">
              Two sides. One claim. Bring proof.
            </h1>
            <p className="font-sans text-on-surface-variant max-w-2xl text-lg">
              The immutable arena for high-stakes adjudication. Stake your GEN, submit evidence,
              and let GenLayer's own web-fetch + LLM consensus decide.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mt-4">
              <Link
                href="/arena"
                className="bg-primary-fixed-dim text-on-primary font-mono text-xs uppercase tracking-widest px-8 py-4 rounded shadow-glow-cyan hover:brightness-110 transition-all"
              >
                Enter the Arena
              </Link>
              <Link
                href="/laws"
                className="border border-primary-fixed-dim text-primary-fixed-dim bg-transparent font-mono text-xs uppercase tracking-widest px-8 py-4 rounded hover:bg-primary/10 transition-colors"
              >
                View Laws
              </Link>
            </div>
          </div>
        </section>

        <div className="w-full bg-surface-container-lowest border-y border-outline-variant/10 py-3">
          <div className="ticker-wrap font-mono text-sm text-secondary">
            <div className="ticker">
              {[...SETTLED_TICKER, ...SETTLED_TICKER].map((t, i) => (
                <span key={i} className="mx-4">
                  <span className="text-on-surface-variant">SETTLED:</span> {t.id}{" "}
                  <span className="text-primary">→</span> {t.amount}
                  <span className="mx-4 text-outline-variant">•</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <section className="w-full max-w-container-max px-margin-mobile md:px-margin-desktop py-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass-panel p-8 rounded-lg flex flex-col gap-4 hover:border-primary/50 transition-colors">
                <div className="w-12 h-12 rounded bg-surface-container flex items-center justify-center border border-outline-variant/20 text-2xl">
                  {f.icon}
                </div>
                <h3 className="font-sans font-bold text-xl text-primary">{f.title}</h3>
                <p className="text-on-surface-variant">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
