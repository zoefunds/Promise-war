"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/arena", label: "Live Claims", icon: "⚔️" },
  { href: "/vault", label: "Evidence Vault", icon: "🗄️" },
  { href: "/staked", label: "My Staked Claims", icon: "📌" },
  { href: "/adjudication", label: "Adjudication", icon: "⚖️" },
];

export function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-16 h-[calc(100vh-64px)] z-40 w-64 bg-surface-container-lowest border-r border-outline-variant/10">
      <div className="p-6 border-b border-outline-variant/10">
        <Link
          href="/claims/new"
          className="w-full block text-center border border-primary text-primary font-mono text-xs uppercase tracking-wider py-2 rounded hover:bg-primary/10 transition-colors"
        >
          New Claim
        </Link>
      </div>
      <nav className="flex-1 py-4 font-mono text-sm">
        {items.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex items-center gap-3 px-4 py-3 border-l-4 transition-colors " +
                (active
                  ? "text-primary border-primary bg-primary/5"
                  : "text-on-surface-variant border-transparent hover:bg-surface-container-high hover:text-on-surface")
              }
            >
              <span>{item.icon}</span> {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
