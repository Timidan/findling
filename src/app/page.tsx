import { getMarketStats } from "@/server/catalog/stats";
import { computeSplit } from "@/server/split/split";
import { LandingX } from "@/components/concepts/concept-x";

const PRIVACY_URL = "https://findling.timidan.xyz/privacy";
const TERMS_URL = "https://findling.timidan.xyz/terms";

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
  return (
    <>
      <noscript>
        <section className="bg-background px-5 py-8 text-foreground md:px-12">
          <h1>Findling is a video clip marketplace.</h1>
          <p>
            Creators connect YouTube to import videos they own, publish short clips,
            set prices, and get paid when people or AI agents pay in USDC to use those clips.
          </p>
          <h2>How Findling uses Google</h2>
          <p>
            Google and YouTube access is used only when a creator chooses to connect YouTube.
            Findling uses that access to show the creator&apos;s channel, import videos
            the creator selects, and verify that clips belong to that creator.
          </p>
          <p>
            Findling helps creators publish video clips and get paid when people or AI agents use them.
          </p>
          <p>
            <a href={PRIVACY_URL}>Privacy Policy</a> | <a href={TERMS_URL}>Terms of Service</a>
          </p>
        </section>
      </noscript>
      <LandingX stats={stats} priceMicroUsdc={priceMicroUsdc} split={split} />
    </>
  );
}
