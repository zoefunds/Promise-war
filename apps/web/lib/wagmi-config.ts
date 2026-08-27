import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain } from "@reown/appkit/networks";

// GenLayer StudioNet — chain id / RPC filled in from env once the user
// confirms the network's current values (verify against
// https://docs.genlayer.com/ before deploying; these can change between
// StudioNet releases). Built with @reown/appkit/networks' own defineChain
// (not viem's) since AppKit's adapter requires the CaipNetwork shape
// (chainNamespace + caipNetworkId), which a plain viem Chain doesn't have.
const STUDIONET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_STUDIONET_CHAIN_ID ?? "61999");

export const studionet = defineChain({
  id: STUDIONET_CHAIN_ID,
  caipNetworkId: `eip155:${STUDIONET_CHAIN_ID}`,
  chainNamespace: "eip155",
  name: "GenLayer StudioNet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_STUDIONET_RPC_URL ?? "https://studio.genlayer.com/api"] },
  },
});

// Reown (formerly WalletConnect) AppKit project id — public by design (it
// scopes rate limits/branding, not a secret). Get one at
// https://cloud.reown.com if this ever needs to change.
export const REOWN_PROJECT_ID = "684530160ef98fd51cd4588f4347a9fd";

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId: REOWN_PROJECT_ID,
  networks: [studionet],
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
