import { Navbar } from "@/components/Navbar";
import { SideNav } from "@/components/SideNav";
import { Footer } from "@/components/Footer";
import { ClaimCard } from "@/components/ClaimCard";
import { getCachedClaimsPage } from "@/lib/api-client";
import { getClaimsPage } from "@/lib/genlayer-client";

// Server component: reads the backend's Postgres cache (kept warm by
// apps/api's sync poller) for fast discovery — this is the primary path.
// Falls back to a direct contract read only if the API is unreachable, so
// the arena still works (just slower) if apps/api is ever down; either way
// StudioNet is never hit on every single page load in the common case.
export default async function ArenaPage() {
  let claims: Awaited<ReturnType<typeof getClaimsPage>> = [];
  let loadError: string | null = null;
  try {
    claims = await getCachedClaimsPage(0, 24);
  } catch {
    try {
      claims = await getClaimsPage(0, 24);
    } catch (err) {
      loadError = err instanceof Error ? err.message : "Failed to load claims.";
    }
  }

  return (
    <>
      <Navbar />
      <div className="flex flex-1 pt-16">
        <SideNav />
        <main className="flex-1 lg:ml-64 p-margin-mobile md:p-margin-desktop min-h-screen">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-8 glass-panel p-4 rounded-lg">
            <input
              className="w-full md:w-96 bg-surface-container-lowest border border-outline-variant/50 text-on-surface font-mono text-sm rounded px-4 py-2 focus:outline-none focus:border-primary"
              placeholder="Search claims by statement or category…"
              type="text"
            />
            <div className="flex flex-wrap gap-2 font-mono text-sm">
              <select className="bg-surface-container border border-outline-variant/50 text-on-surface rounded px-3 py-2">
                <option>Category: All</option>
                <option>DEFI</option>
                <option>TECH</option>
                <option>GEOPOLITICS</option>
              </select>
              <select className="bg-surface-container border border-outline-variant/50 text-on-surface rounded px-3 py-2">
                <option>Status: All</option>
                <option>ACTIVE</option>
                <option>READY_FOR_REVIEW</option>
                <option>SETTLED</option>
              </select>
            </div>
          </div>

          {loadError && (
            <div className="glass-panel rounded-lg p-6 mb-8 border border-challenge/40 text-challenge font-mono text-sm">
              Could not load live claims from the deployed contract yet: {loadError}
            </div>
          )}

          {claims.length === 0 && !loadError && (
            <div className="glass-panel rounded-lg p-12 text-center text-on-surface-variant font-mono text-sm">
              No claims yet. Be the first to bring one to the arena.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {claims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}
