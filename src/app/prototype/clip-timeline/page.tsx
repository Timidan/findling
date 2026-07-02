"use client";

/*
 * THROWAWAY PROTOTYPE — clip-timeline UI exploration for landing beat 01
 * ("A moment is just a cut"). Five structurally-different variants of the
 * clipping animation, each self-looping so the motion is visible without the
 * scroll-pin. Flip with the bottom bar or ← / → . See NOTES.md.
 *
 * Review at: /prototype/clip-timeline?variant=A  (A B C D E)
 *
 * Delete this whole folder once a winner is folded into CutTimeline
 * (src/components/concepts/concept-x.tsx).
 */

import { useEffect, useState } from "react";
import { PrototypeSwitcher } from "./switcher";
import VariantA, { label as labelA } from "./variant-a";
import VariantB, { label as labelB } from "./variant-b";
import VariantC, { label as labelC } from "./variant-c";
import VariantD, { label as labelD } from "./variant-d";
import VariantE, { label as labelE } from "./variant-e";

const VARIANTS: Record<string, () => React.JSX.Element> = {
  A: VariantA,
  B: VariantB,
  C: VariantC,
  D: VariantD,
  E: VariantE,
};

const LABELS: Record<string, string> = {
  A: labelA,
  B: labelB,
  C: labelC,
  D: labelD,
  E: labelE,
};

const KEYS = ["A", "B", "C", "D", "E"];
const VIDEO = "/demo/snowboard.mp4";
const POSTER = "/demo/snowboard-poster.jpg";

function readVariant(): string {
  if (typeof window === "undefined") return "A";
  const raw = (new URLSearchParams(window.location.search).get("variant") ?? "A").toUpperCase();
  return KEYS.includes(raw) ? raw : "A";
}

export default function ClipTimelinePrototype() {
  // URL is the source of truth, but initialise deterministically for SSR/first
  // paint (always "A") then reconcile to the query param after mount to avoid a
  // hydration mismatch.
  const [variant, setVariant] = useState("A");
  useEffect(() => {
    // Post-hydration reconcile: SSR + first client render both use "A" (no
    // hydration mismatch), then we adopt the ?variant= param once window exists.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVariant(readVariant());
  }, []);

  const change = (next: string) => {
    setVariant(next);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
  };

  const Active = VARIANTS[variant] ?? VariantA;

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-[#0b0c0e] text-white">
      {/* shared cinematic backdrop so each variant is judged at real density */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <video
          src={VIDEO}
          poster={POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="size-full scale-110 object-cover opacity-20 blur-2xl"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/85" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,transparent,rgba(0,0,0,0.7))]" />
      </div>

      {/* prototype banner */}
      <div className="relative z-10 flex items-center gap-2 px-5 pt-5 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-white/45">
        <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-sage">
          prototype
        </span>
        <span className="hidden sm:inline">clip-timeline · beat 01 · flip with ← / →</span>
      </div>

      {/* the variant stage */}
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-5xl items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full">
          <Active />
        </div>
      </div>

      <PrototypeSwitcher
        keys={KEYS}
        labels={LABELS}
        current={variant}
        onChange={change}
      />
    </div>
  );
}
