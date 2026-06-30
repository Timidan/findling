import type { Metadata } from "next";
import {
  getUnifiedFeed,
  type FeedTab,
  type FeedSource,
  type FeedUsageType,
} from "@/server/find/feed";
import { getSessionUser } from "@/server/auth/current-user";
import { SiteHeader } from "@/components/site/site-header";
import { FindShell } from "@/components/find/find-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find — the exact video moment you can actually license · Findling",
  description:
    "Search a vibe, scene, or use case. Rights-clean video moments available now, plus ones agents have already pledged USDC for.",
};

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function num(v: string | string[] | undefined): number | undefined {
  const s = one(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tabParam = one(sp.tab);
  const tab: FeedTab =
    tabParam === "available" || tabParam === "wanted" ? tabParam : "all";
  const query = (one(sp.q) ?? "").trim();
  const view: "grid" | "list" = one(sp.view) === "list" ? "list" : "grid";
  const filters = {
    usageType: one(sp.usage) as FeedUsageType | undefined,
    licence: one(sp.licence) || undefined,
    source: one(sp.src) as FeedSource | undefined,
    maxDurationMs: num(sp.maxDur),
    maxPriceMicroUsdc: num(sp.maxPrice),
  };

  const [initialUser, feed, wanted] = await Promise.all([
    getSessionUser(),
    getUnifiedFeed({ tab, query: query || undefined, filters, limit: 36 }),
    getUnifiedFeed({ tab: "wanted", limit: 100 }),
  ]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <SiteHeader tag="Find" initialUser={initialUser} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10">
        <h1 className="max-w-3xl font-display text-3xl leading-[1.06] tracking-tight text-balance sm:text-[2.6rem]">
          Find the exact video moment you can actually license.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Search a vibe, scene, or use case — rights-clean moments available now, plus
          ones agents have already pledged USDC for.
        </p>
        <div className="mt-6">
          <FindShell
            items={feed.items}
            tab={tab}
            query={query}
            view={view}
            wantedCount={wanted.items.length}
          />
        </div>
      </main>
    </div>
  );
}
