"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "motion/react";
import { Scissors, FilmStrip, ArrowsInLineVertical } from "@phosphor-icons/react";

const VIDEO = "/demo/snowboard.mp4";
const POSTER = "/demo/snowboard-poster.jpg";

export const label = "E — Frame Contact-Sheet (discrete storyboard grid)";

// A contact strip of discrete frames. The in/out selection is a contiguous run.
const FRAME_COUNT = 14;
const SEL_START = 4; // inclusive
const SEL_END = 10; // inclusive
const FPS = 24;
const SRC_FRAME_STEP = 11; // source frames between contact-sheet tiles

// MM:SS:FF timecode from an absolute frame index.
function tc(frame: number) {
  const ff = frame % FPS;
  const totalSeconds = Math.floor(frame / FPS);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(mm)}:${p(ss)}:${p(ff)}`;
}

const FRAMES = Array.from({ length: FRAME_COUNT }, (_, i) => {
  const selected = i >= SEL_START && i <= SEL_END;
  // Slide background-position across the poster so each tile reads as a
  // slightly different frame of the source.
  const bgX = (i / (FRAME_COUNT - 1)) * 100;
  const bgY = 38 + (i % 3) * 8;
  const srcFrame = 84 + i * SRC_FRAME_STEP;
  return { i, selected, bgX, bgY, srcFrame };
});

const SEL_DURATION_S = ((SEL_END - SEL_START + 1) * SRC_FRAME_STEP) / FPS;

export default function VariantE() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() === true;

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;

      const q = gsap.utils.selector(root);
      const tiles = gsap.utils.toArray<HTMLElement>(q("[data-tile]"));
      const selectedTiles = gsap.utils.toArray<HTMLElement>(q("[data-tile-sel='1']"));
      const unselectedTiles = gsap.utils.toArray<HTMLElement>(q("[data-tile-sel='0']"));
      const walker = q("[data-walker]")[0] as HTMLElement | undefined;
      const inTag = q("[data-in]")[0] as HTMLElement | undefined;
      const outTag = q("[data-out]")[0] as HTMLElement | undefined;
      const selRing = q("[data-selring]")[0] as HTMLElement | undefined;
      const strip = q("[data-strip]")[0] as HTMLElement | undefined;
      const card = q("[data-card]")[0] as HTMLElement | undefined;
      const durLive = q("[data-dur]")[0] as HTMLElement | undefined;

      // Geometry: measure the contiguous selected run relative to the strip so
      // the ring and stepped walker land exactly on the tiles.
      const measure = (el?: HTMLElement) => {
        if (!el || !strip) return { left: 0, width: 0 };
        return { left: el.offsetLeft, width: el.offsetWidth };
      };
      const firstSel = selectedTiles[0];
      const lastSel = selectedTiles[selectedTiles.length - 1];
      const a = measure(firstSel);
      const b = measure(lastSel);
      const runLeft = a.left;
      const runWidth = b.left + b.width - a.left;

      if (selRing) {
        gsap.set(selRing, { left: runLeft - 5, width: runWidth + 10 });
      }

      // ---- Reduced motion: final resting state, no timeline. ----
      if (reduce) {
        gsap.set(unselectedTiles, { opacity: 0.26, filter: "grayscale(1)" });
        gsap.set(selectedTiles, { opacity: 1, filter: "grayscale(0)", scale: 1, y: 0 });
        gsap.set([selRing, inTag, outTag].filter(Boolean), { opacity: 1 });
        gsap.set(walker ?? {}, { opacity: 0 });
        gsap.set(card ?? {}, { opacity: 1, y: 0, scale: 1 });
        if (durLive) durLive.textContent = `${SEL_DURATION_S.toFixed(1)}s`;
        return;
      }

      // ---- Initial (pre-selection) state ----
      gsap.set(tiles, { opacity: 1, filter: "grayscale(0)", scale: 1, y: 0 });
      gsap.set([selRing, inTag, outTag].filter(Boolean), { opacity: 0 });
      gsap.set(card ?? {}, { opacity: 0, y: 22, scale: 0.96 });
      if (walker) gsap.set(walker, { opacity: 0, x: measure(firstSel).left, width: measure(firstSel).width });
      if (durLive) durLive.textContent = "0.0s";

      const tl = gsap.timeline({
        repeat: -1,
        repeatDelay: 0.8,
        defaults: { ease: "power3.out" },
      });

      // 1) Out-of-selection frames desaturate + dim.
      tl.to(
        unselectedTiles,
        { opacity: 0.24, filter: "grayscale(1)", duration: 0.5, stagger: 0.02 },
        0.1,
      );

      // 2) Selection ring snaps in around the contiguous run.
      if (selRing) tl.to(selRing, { opacity: 1, duration: 0.35 }, 0.4);

      // 3) IN / OUT tags pop on the first & last selected tiles.
      tl.fromTo(
        [inTag, outTag].filter(Boolean),
        { opacity: 0, y: 6, scale: 0.8 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(2)" },
        0.55,
      );

      // 4) Stepped playhead HOPS frame-by-frame across the run (discrete jumps).
      const hopDur = 0.16;
      const walkStart = 0.8;
      if (walker) tl.set(walker, { opacity: 1 }, walkStart);
      selectedTiles.forEach((el, idx) => {
        const at = walkStart + idx * hopDur;
        if (walker) {
          // Discrete jump — position set instantly at each step time.
          tl.set(walker, { x: el.offsetLeft, width: el.offsetWidth }, at);
        }
        // Frame under the head briefly lifts.
        tl.to(el, { y: -8, scale: 1.06, duration: 0.12, ease: "power2.out" }, at);
        tl.to(el, { y: 0, scale: 1, duration: 0.18, ease: "power2.in" }, at + hopDur * 0.55);
      });

      const walkEnd = walkStart + selectedTiles.length * hopDur;

      // 5) The whole selected run lifts together.
      tl.to(
        selectedTiles,
        { y: -10, scale: 1.04, duration: 0.4, stagger: { each: 0.03, from: "center" } },
        walkEnd + 0.05,
      );
      if (walker) tl.to(walker, { opacity: 0, duration: 0.25 }, walkEnd + 0.05);

      // 6) Coalesce: selected tiles collapse toward center as the card assembles.
      tl.to(
        selectedTiles,
        {
          y: 40,
          scale: 0.35,
          opacity: 0,
          duration: 0.5,
          ease: "power2.in",
          stagger: { each: 0.02, from: "edges" },
        },
        walkEnd + 0.55,
      );
      if (selRing)
        tl.to(
          selRing,
          { opacity: 0, scaleX: 0.9, duration: 0.4, transformOrigin: "50% 50%" },
          walkEnd + 0.6,
        );
      tl.to([inTag, outTag].filter(Boolean), { opacity: 0, duration: 0.3 }, walkEnd + 0.6);
      if (card)
        tl.to(card, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "power3.out" }, walkEnd + 0.78);

      // 7) Duration counter ticks up while the run is scanned.
      const counter = { v: 0 };
      tl.to(
        counter,
        {
          v: SEL_DURATION_S,
          duration: Math.max(0.4, walkEnd - 0.5),
          ease: "none",
          onUpdate: () => {
            if (durLive) durLive.textContent = `${counter.v.toFixed(1)}s`;
          },
        },
        0.55,
      );

      // 8) Hold on the assembled card, then reset for the loop.
      tl.to({}, { duration: 1.0 });
      if (card) tl.to(card, { opacity: 0, y: 18, scale: 0.96, duration: 0.45, ease: "power2.in" });
      tl.set(selectedTiles, { y: 0, scale: 1, opacity: 1, filter: "grayscale(0)" });
      tl.set([selRing, inTag, outTag].filter(Boolean), { opacity: 0, scaleX: 1 });
      tl.set(unselectedTiles, { opacity: 1, filter: "grayscale(0)" });
      if (walker) tl.set(walker, { opacity: 0, x: measure(firstSel).left, width: measure(firstSel).width });
      tl.call(() => {
        if (durLive) durLive.textContent = "0.0s";
      });

      void lastSel;
    },
    { scope: ref, dependencies: [reduce] },
  );

  return (
    <div ref={ref} className="relative flex h-full w-full items-center justify-center px-5 py-8">
      <div className="mx-auto w-full max-w-3xl">
        {/* Source monitor */}
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <video
            className="aspect-video w-full object-cover opacity-90"
            src={VIDEO}
            poster={POSTER}
            muted
            loop
            autoPlay
            playsInline
          />
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md border border-white/10 bg-black/60 px-2 py-1 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#e0614a] shadow-[0_0_6px_#e0614a]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/80">Source</span>
          </div>
          <div className="absolute right-3 top-3 rounded-md border border-white/10 bg-black/60 px-2 py-1 font-mono text-[11px] tabular-nums text-white/70 backdrop-blur-sm">
            00:00:08:04
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
        </div>

        {/* Contact-sheet header */}
        <div className="mt-4 flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-sage/30 bg-sage/10">
              <Scissors size={14} weight="bold" className="text-sage" />
            </span>
            <div className="leading-tight">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                select in / out
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-white/70">
                <FilmStrip size={12} weight="fill" className="text-white/40" />
                <span className="font-mono text-[11px] tabular-nums">{FRAME_COUNT} frames</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-sage/25 bg-sage/[0.08] px-2.5 py-1.5">
            <ArrowsInLineVertical size={13} weight="bold" className="text-sage/80" />
            <span data-dur className="font-mono text-[13px] font-medium tabular-nums text-sage">
              0.0s
            </span>
          </div>
        </div>

        {/* Contact strip */}
        <div className="relative mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
          {/* Selection ring — geometry set from JS to hug the contiguous run */}
          <div
            data-selring
            className="pointer-events-none absolute z-20 rounded-lg ring-2 ring-sage shadow-[0_0_0_1px_rgba(138,150,123,0.35),0_0_22px_rgba(138,150,123,0.35)]"
            style={{ top: "0.55rem", bottom: "0.55rem", left: 0, width: 0, opacity: 0 }}
          />

          {/* Stepped walker highlight */}
          <div
            data-walker
            className="pointer-events-none absolute z-30 rounded-lg border-2 border-white/90 bg-white/[0.07] shadow-[0_0_16px_rgba(255,255,255,0.45)]"
            style={{ top: "0.75rem", bottom: "1.6rem", left: 0, width: 0, opacity: 0 }}
          >
            <span className="absolute -top-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
          </div>

          {/* The frame tiles — a single discrete row */}
          <div data-strip className="relative flex gap-1.5">
            {FRAMES.map((f) => {
              const isFirstSel = f.i === SEL_START;
              const isLastSel = f.i === SEL_END;
              return (
                <div
                  key={f.i}
                  data-tile
                  data-tile-sel={f.selected ? "1" : "0"}
                  className="relative aspect-[3/4] flex-1 overflow-hidden rounded-md border border-white/10 bg-zinc-900 will-change-transform"
                  style={{
                    backgroundImage: `url(${POSTER})`,
                    backgroundSize: "360% auto",
                    backgroundPosition: `${f.bgX}% ${f.bgY}%`,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-black/10" />
                  <div className="pointer-events-none absolute inset-0 rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />

                  {/* frame number caption */}
                  <div className="absolute bottom-0.5 left-0.5 right-0.5 truncate rounded bg-black/55 px-0.5 py-px text-center font-mono text-[7px] leading-none tabular-nums text-white/70 backdrop-blur-sm">
                    {String(f.i).padStart(2, "0")}
                  </div>

                  {/* IN / OUT tags */}
                  {isFirstSel && (
                    <div
                      data-in
                      className="absolute -left-1 -top-2 z-40 rounded-[3px] bg-sage px-1 py-px font-mono text-[8px] font-bold uppercase leading-none tracking-wider text-black shadow-[0_0_10px_rgba(138,150,123,0.6)]"
                    >
                      In
                    </div>
                  )}
                  {isLastSel && (
                    <div
                      data-out
                      className="absolute -right-1 -top-2 z-40 rounded-[3px] bg-sage px-1 py-px font-mono text-[8px] font-bold uppercase leading-none tracking-wider text-black shadow-[0_0_10px_rgba(138,150,123,0.6)]"
                    >
                      Out
                    </div>
                  )}

                  {/* sage bracket grips on run edges */}
                  {isFirstSel && (
                    <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1 rounded-l-md bg-sage">
                      <span className="absolute left-[3px] top-1/2 h-4 w-px -translate-y-1/2 bg-black/40" />
                    </span>
                  )}
                  {isLastSel && (
                    <span className="pointer-events-none absolute inset-y-0 right-0 z-10 w-1 rounded-r-md bg-sage">
                      <span className="absolute right-[3px] top-1/2 h-4 w-px -translate-y-1/2 bg-black/40" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* frame-index ruler */}
          <div className="mt-2 flex items-center justify-between px-0.5 font-mono text-[9px] tabular-nums text-white/25">
            <span>0:00</span>
            <span>0:04</span>
            <span>0:07</span>
            <span>0:10</span>
            <span>0:13</span>
          </div>
        </div>

        {/* Hosted-moment card — assembles beneath the strip */}
        <div
          data-card
          className="mt-4 flex items-center gap-3 rounded-xl border border-sage/25 bg-zinc-950/80 p-3 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm"
          style={{ opacity: 0 }}
        >
          <div
            className="relative h-12 w-20 flex-shrink-0 overflow-hidden rounded-md border border-white/10 bg-zinc-900"
            style={{
              backgroundImage: `url(${POSTER})`,
              backgroundSize: "cover",
              backgroundPosition: "center 42%",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/85 shadow">
                <span className="ml-0.5 h-0 w-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-black" />
              </span>
            </div>
            <span className="absolute left-1 top-1 rounded bg-sage/90 px-1 py-px font-mono text-[7px] font-bold uppercase leading-none tracking-wide text-black">
              Moment
            </span>
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="font-display text-base text-white">Snowboard — backside 360</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] tabular-nums text-white/45">
              <span className="uppercase tracking-widest">hosted moment</span>
              <span className="h-2.5 w-px bg-white/20" />
              <span className="text-sage">{SEL_DURATION_S.toFixed(1)}s</span>
              <span className="h-2.5 w-px bg-white/20" />
              <span>
                {tc(FRAMES[SEL_START].srcFrame)} → {tc(FRAMES[SEL_END].srcFrame)}
              </span>
            </div>
          </div>
          <span className="flex-shrink-0 rounded-md border border-sage/30 bg-sage/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-sage">
            Ready
          </span>
        </div>
      </div>
    </div>
  );
}
