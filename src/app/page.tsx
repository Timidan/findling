import { getMarketStats } from "@/server/catalog/stats";
import { computeSplit } from "@/server/split/split";
import { LandingX } from "@/components/concepts/concept-x";

// Runtime-only: the landing page shows live market stats from Postgres. Avoid
// touching Supabase during `next build`, where deploy networking may be absent.
export const dynamic = "force-dynamic";

// The cinematic scroll-story is the front door.
export default async function Home() {
  const stats = await getMarketStats().catch(() => ({
    settledCount: 0,
    grossMicroUsdc: 0,
    creatorMicroUsdc: 0,
    finderMicroUsdc: 0,
    platformMicroUsdc: 0,
    publishedMoments: 0,
    latestSlug: null,
  }));
  const priceMicroUsdc = 50_000;
  const split = computeSplit({ grossMicroUsdc: priceMicroUsdc, hasFinder: true });
  return <LandingX stats={stats} priceMicroUsdc={priceMicroUsdc} split={split} />;
}
