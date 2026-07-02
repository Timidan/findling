"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MagnifyingGlass,
  SquaresFour,
  Rows,
  SlidersHorizontal,
  CaretDown,
} from "@phosphor-icons/react/dist/ssr";
import { FeedCard, type FeedItem } from "./cards";

/*
 * The interactive discovery chrome: search → /find?q=, tabs, a Filters panel, and a
 * grid/list toggle — all driven through the URL so views are shareable + SSR re-fetches
 * the feed. The RSC page fetches `items` server-side and passes them in.
 */

const TABS = [
  { k: "all", label: "All" },
  { k: "available", label: "Available" },
  { k: "wanted", label: "Wanted" },
  { k: "trending", label: "Trending" },
] as const;

const FILTER_GROUPS: { key: string; label: string; opts: [string, string][] }[] = [
  { key: "usage", label: "Usage", opts: [["Video embed", "video_embed"], ["Newsletter", "newsletter"], ["Social post", "social_post"], ["Internal", "internal_reference"]] },
  { key: "licence", label: "License", opts: [["CC-BY", "CC BY"], ["CC-BY-SA", "CC BY-SA"], ["CC0", "CC0"], ["Standard", "Standard"]] },
  { key: "src", label: "Source", opts: [["Upload", "upload"], ["YouTube", "youtube"], ["PeerTube", "peertube"]] },
  { key: "maxDur", label: "Max duration", opts: [["Under 10s", "10000"], ["Under 30s", "30000"]] },
  { key: "maxPrice", label: "Max price", opts: [["≤ $0.05", "50000"], ["≤ $0.10", "100000"], ["≤ $0.25", "250000"]] },
];

export function FindShell({
  items,
  tab,
  query,
  view,
  wantedCount,
}: {
  items: FeedItem[];
  tab: string;
  query: string;
  view: "grid" | "list";
  wantedCount?: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(query);
  const [filtersOpen, setFiltersOpen] = useState(false);

  function go(next: Record<string, string | null>) {
    const p = new URLSearchParams(params?.toString() ?? "");
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    router.push(`/find?${p.toString()}`);
  }
  function clearFilters() {
    const keep = new URLSearchParams();
    for (const k of ["q", "tab", "view"]) {
      const v = params?.get(k);
      if (v) keep.set(k, v);
    }
    router.push(`/find?${keep.toString()}`);
  }

  const activeTab = tab || "all";
  const activeFilterCount = FILTER_GROUPS.filter((g) => params?.get(g.key)).length;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: q.trim() || null });
        }}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 shadow-sm"
      >
        <MagnifyingGlass weight="bold" className="size-5 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a vibe, scene, or use case..."
          aria-label="Search moments"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button type="submit" className="hidden rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground sm:inline">
          Search
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between gap-3 border-b border-border">
        <div className="-mb-px flex items-center gap-1 overflow-x-auto">
          {TABS.map(({ k, label }) => {
            const active = activeTab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => go({ tab: k === "all" ? null : k })}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${active ? "border-sage font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {label}
                {k === "wanted" && wantedCount != null && (
                  <span className="tabular ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">{wantedCount}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label="Grid view" onClick={() => go({ view: null })} className={`grid size-8 place-items-center rounded-lg ${view !== "list" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>
            <SquaresFour weight={view !== "list" ? "fill" : "regular"} className="size-4" />
          </button>
          <button type="button" aria-label="List view" onClick={() => go({ view: "list" })} className={`grid size-8 place-items-center rounded-lg ${view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>
            <Rows weight={view === "list" ? "fill" : "regular"} className="size-4" />
          </button>
        </div>
      </div>

      {/* Filters — a real toggle button + a grouped panel */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/60"
        >
          <SlidersHorizontal weight="bold" className="size-3.5 text-sage" /> Filters
          {activeFilterCount > 0 && (
            <span className="tabular rounded-full bg-sage/15 px-1.5 py-0.5 text-[0.6rem] text-sage">{activeFilterCount}</span>
          )}
          <CaretDown weight="bold" className={`size-3 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
        </button>

        {filtersOpen && (
          <div className="mt-3 space-y-3 rounded-2xl border border-border bg-card p-4">
            {FILTER_GROUPS.map((g) => (
              <div key={g.key}>
                <p className="mb-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">{g.label}</p>
                <div className="flex flex-wrap gap-2">
                  {g.opts.map(([label, val]) => {
                    const active = params?.get(g.key) === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => go({ [g.key]: active ? null : val })}
                        className={`rounded-full px-3 py-1.5 text-xs transition-colors ${active ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearFilters} className="text-xs font-medium text-sage transition-colors hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <p className="font-display text-2xl tracking-tight">No moments found</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">Try a different search, or clear the filters.</p>
        </div>
      ) : (
        <ul className={view === "list" ? "mt-6 grid grid-cols-1 gap-3" : "mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2"}>
          {items.map((it) => (
            <li key={it.kind === "available" ? it.id : it.listingId}>
              <FeedCard item={it} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
