/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Reown AppKit's wagmi adapter pulls in Coinbase's "Base Account"
    // connector by default, which pulls in @coinbase/cdp-sdk's x402
    // payment-protocol client (many @x402/* submodules, none installed —
    // they're optional peers). We don't use Coinbase Smart Wallet / Base
    // Account at all, so the whole chain is cut off at its root rather
    // than chasing each individual @x402/* submodule webpack complains
    // about one at a time.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": false,
      "@coinbase/cdp-sdk": false,
      // @wagmi/connectors' metaMask connector optionally uses MetaMask's
      // own SDK connect-evm helper; @wagmi/core's "tempo" (account
      // abstraction) exports optionally reach for a Node "accounts" module
      // — neither is used by our injected/WalletConnect-only flow, and
      // both are only reachable behind runtime feature checks that never
      // fire here.
      "@metamask/connect-evm": false,
      accounts: false,
    };
    config.externals = [...(config.externals || []), "pino-pretty", "lokijs", "encoding"];
    return config;
  },
};

export default nextConfig;
