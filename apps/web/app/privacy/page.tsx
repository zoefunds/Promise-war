import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="flex-grow pt-24 pb-16 px-margin-mobile md:px-margin-desktop max-w-3xl mx-auto w-full flex flex-col gap-6">
        <h1 className="font-sans font-extrabold text-3xl text-primary mb-2">Privacy Hash</h1>
        <div className="glass-panel rounded-lg p-6 flex flex-col gap-4 text-sm text-on-surface-variant">
          <p>
            PROMISE WAR is built on public infrastructure. Everything you submit onchain — claims,
            evidence, stakes, wallet addresses — is permanently public on GenLayer StudioNet by design;
            that's what makes adjudication auditable. There is no way to make an onchain submission
            private after the fact.
          </p>
          <p>
            <strong className="text-on-surface">What we (the off-chain backend) store:</strong> a cache
            of the same public onchain data (claims, evidence, activity), your wallet address if you
            sign in (for notifications), and nothing else. We do not collect emails, IP-based tracking,
            or third-party analytics.
          </p>
          <p>
            <strong className="text-on-surface">Wallet sign-in:</strong> authentication is a signed
            message (no password, no email) verified once and exchanged for a session cookie. The
            signature itself is not stored — only your wallet address.
          </p>
          <p>
            <strong className="text-on-surface">No custodial funds:</strong> this application never
            holds your private keys. Every stake, payout, and withdrawal is a transaction you sign
            yourself with your own wallet.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
