import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "PROMISE WAR — Two sides. One claim. Bring proof.",
  description:
    "An onchain evidence-battle arena adjudicated by GenLayer Intelligent Contracts. Lock GEN behind a verifiable claim, stake SUPPORT or CHALLENGE, bring evidence, let the protocol decide.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-on-surface antialiased min-h-screen flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
