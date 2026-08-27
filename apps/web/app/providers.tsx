"use client";

import { ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { wagmiAdapter, wagmiConfig, studionet, REOWN_PROJECT_ID } from "@/lib/wagmi-config";

// createAppKit registers the modal as a module-level singleton — it must
// run exactly once, outside the component (re-running per render/mount
// throws). This is the fix for "wallet connect has issues": previously the
// app only offered wagmi's bare injected() connector (MetaMask-or-nothing,
// no mobile/WalletConnect support, no polished modal) — AppKit adds a real
// multi-wallet connect modal backed by Reown's WalletConnect network.
createAppKit({
  adapters: [wagmiAdapter],
  networks: [studionet],
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: "PROMISE WAR",
    description: "Two sides. One claim. Bring proof.",
    url: "https://promise-war.vercel.app",
    icons: ["https://promise-war.vercel.app/favicon.svg"],
  },
  features: { analytics: false },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
