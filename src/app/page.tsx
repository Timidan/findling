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
          <p>
            <a href={PRIVACY_URL}>Privacy Policy</a> | <a href={TERMS_URL}>Terms of Service</a>
          </p>
        </section>
      </noscript>
      <ReviewSummary />
      <LandingX stats={stats} priceMicroUsdc={priceMicroUsdc} split={split} />
    </>
  );
}

function ReviewSummary() {
  return (
    <section className="border-b border-border bg-background px-5 py-10 text-foreground sm:py-12 md:px-12">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            What this app does
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.02] tracking-tight sm:text-5xl md:text-6xl">
            Findling helps creators publish video clips and get paid when people or AI agents use them.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Creators connect YouTube to import videos they own, choose short clips,
            set prices, and receive USDC payments. Buyers and AI agents search for
            clips, pay once to use a clip, and keep a receipt. Finders curate clips
            so useful moments are easier to discover.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <a className="font-medium underline-offset-4 hover:underline" href={PRIVACY_URL}>
              Privacy Policy
            </a>
            <a className="font-medium underline-offset-4 hover:underline" href={TERMS_URL}>
              Terms of Service
            </a>
          </div>
        </div>
        <div className="grid gap-4 text-sm leading-6 text-muted-foreground">
          <section>
            <h2 className="text-base font-semibold text-foreground">How Findling uses Google</h2>
            <p className="mt-2">
              Google and YouTube access is used only when a creator chooses to connect YouTube.
              Findling uses that access to show the creator&apos;s channel, import videos
              the creator selects, and verify that clips belong to that creator.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">Who uses Findling</h2>
            <p className="mt-2">
              Creators publish clips, finders organize clips, and buyers or AI agents
              pay in USDC to use clips in their own projects. Findling does not sell
              Google user data.
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
