import Link from "next/link";
import { Logo } from "./Logo";
import { ConnectWalletButton } from "./ConnectWalletButton";

const links = [
  { href: "/arena", label: "Arena" },
  { href: "/intel", label: "Intel" },
  { href: "/laws", label: "Laws" },
];

export function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-mono text-xs font-bold tracking-widest text-primary-fixed-dim">
            PROMISE WAR
          </span>
        </Link>
        <div className="hidden md:flex gap-6">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-on-surface-variant text-sm hover:text-primary px-2 py-1 rounded hover:bg-surface-container-high/40 transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ConnectWalletButton />
      </div>
    </nav>
  );
}
