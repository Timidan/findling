"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "motion/react";
import {
  ScissorsIcon,
  GaugeIcon,
  SpeakerHighIcon,
  TrashSimpleIcon,
  PlayIcon,
  CheckCircleIcon,
  DotsSixVerticalIcon,
} from "@phosphor-icons/react";

const VIDEO = "/demo/snowboard.mp4";
const POSTER = "/demo/snowboard-poster.jpg";

export const label = "B — CapCut Mobile (fixed center playhead, moving timeline)";

const TOOLS = [
  { icon: ScissorsIcon, name: "Split" },
  { icon: GaugeIcon, name: "Speed" },
  { icon: SpeakerHighIcon, name: "Volume" },
  { icon: TrashSimpleIcon, name: "Delete" },
];

export default function VariantB() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() === true;

  useGSAP(
    () => {
      const q = gsap.utils.selector(ref);
      const strip = q(".cc-strip")[0];
      const block = q(".cc-block")[0];
      const toast = q(".cc-toast")[0];
      const splitLine = q(".cc-splitline")[0];
      const scissorsBtn = q(".cc-tool-split")[0];
      const bubble = q(".cc-bubble")[0];
      const bubbleTC = q(".cc-bubble-tc")[0];
      const caps = q(".cc-cap");

      if (reduce) {
        gsap.set(strip, { x: -168 });
        gsap.set(block, { opacity: 1, scale: 1 });
        gsap.set(caps, { opacity: 1, scale: 1 });
        gsap.set(toast, { opacity: 1, y: 0, scale: 1 });
        gsap.set(bubble, { opacity: 1, y: 0 });
        if (bubbleTC) bubbleTC.textContent = "00:04";
        gsap.set(splitLine, { opacity: 0 });
        return;
      }

      // Resting / entry state.
      gsap.set(strip, { x: 60 });
      gsap.set(block, { opacity: 1, scale: 1 });
      gsap.set(caps, { opacity: 1, scale: 1 });
      gsap.set(toast, { opacity: 0, y: 14, scale: 0.92 });
      gsap.set(splitLine, { opacity: 0, scaleY: 0.4, transformOrigin: "50% 0%" });
      gsap.set(bubble, { opacity: 0, y: 6 });

      const tcProxy = { v: 0 };
      const setTC = () => {
        if (!bubbleTC) return;
        const total = Math.max(0, Math.min(8, tcProxy.v));
        const s = Math.floor(total);
        const cs = Math.floor((total - s) * 100);
        bubbleTC.textContent = `00:0${s}.${cs.toString().padStart(2, "0")}`;
      };

      const tl = gsap.timeline({
        repeat: -1,
        repeatDelay: 0.8,
        defaults: { ease: "power3.out" },
      });

      // Bubble fades up as scrubbing begins.
      tl.to(bubble, { opacity: 1, y: 0, duration: 0.4 }, 0.1);

      // The filmstrip scrubs left under the fixed center playhead.
      tl.to(strip, { x: -168, duration: 3.2, ease: "none" }, 0);
      tl.to(tcProxy, { v: 8, duration: 3.2, ease: "none", onUpdate: setTC }, 0);

      // Mid-scrub: SPLIT pulse at the playhead.
      tl.to(
        scissorsBtn,
        { scale: 1.18, duration: 0.14, ease: "back.out(3)", yoyo: true, repeat: 1 },
        1.5,
      );
      tl.fromTo(
        splitLine,
        { opacity: 0, scaleY: 0.4 },
        { opacity: 1, scaleY: 1, duration: 0.22, ease: "back.out(2)" },
        1.55,
      );
      tl.to(splitLine, { opacity: 0, duration: 0.5, ease: "power2.in" }, 2.25);

      // Handles bounce as the block settles into selection.
      tl.to(
        caps,
        {
          scale: 1.14,
          duration: 0.16,
          ease: "back.out(4)",
          yoyo: true,
          repeat: 1,
          stagger: 0.06,
        },
        2.4,
      );
      tl.to(
        block,
        { scale: 1.015, duration: 0.18, ease: "back.out(3)", yoyo: true, repeat: 1 },
        2.4,
      );

      // Bubble eases out.
      tl.to(bubble, { opacity: 0, y: 6, duration: 0.3 }, 3.0);

      // "Moment saved" toast blooms.
      tl.to(
        toast,
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.7)" },
        3.15,
      );
      tl.to(toast, { opacity: 0, y: 12, scale: 0.94, duration: 0.4 }, 4.5);
    },
    { scope: ref, dependencies: [reduce] },
  );

  return (
    <div ref={ref} className="relative flex h-full w-full items-center justify-center px-4 py-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        {/* Preview card */}
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <video
            className="aspect-video w-full object-cover"
            src={VIDEO}
            poster={POSTER}
            muted
            playsInline
            autoPlay
            loop
            preload="metadata"
          />
          {/* top gradient scrim */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" />

          {/* project title chip */}
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-sage" />
            <span className="font-mono text-[11px] tabular-nums tracking-wide text-white/85">
              Snowboard · backside 360
            </span>
          </div>

          {/* play/pause pill */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-black shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)] backdrop-blur">
            <PlayIcon weight="fill" className="h-4 w-4" />
            <span className="font-mono text-[12px] font-semibold tabular-nums">
              00:08
            </span>
          </div>
        </div>

        {/* Tool row — CapCut round buttons */}
        <div className="flex items-stretch justify-center gap-3">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const isSplit = t.name === "Split";
            return (
              <div key={t.name} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={[
                    "cc-tool flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors",
                    isSplit
                      ? "cc-tool-split border-sage/60 bg-sage/20 text-sage shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                      : "border-white/10 bg-zinc-900/80 text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                  ].join(" ")}
                >
                  <Icon weight={isSplit ? "bold" : "regular"} className="h-6 w-6" />
                </div>
                <span className="font-sans text-[11px] font-medium text-white/60">
                  {t.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Timeline panel */}
        <div className="relative rounded-[24px] border border-white/10 bg-zinc-950/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
          {/* floating timecode bubble */}
          <div className="cc-bubble pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2 rounded-full bg-white px-2.5 py-1 text-black shadow-[0_6px_18px_-6px_rgba(0,0,0,0.8)]">
            <span className="cc-bubble-tc font-mono text-[11px] font-semibold tabular-nums">
              00:00.00
            </span>
            <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-white" />
          </div>

          {/* Track viewport (clips the sliding strip) */}
          <div className="relative mt-6 h-20 overflow-hidden rounded-xl">
            {/* Sliding filmstrip strip */}
            <div
              className="cc-strip absolute left-0 top-1/2 flex h-16 -translate-y-1/2 items-center will-change-transform"
              style={{ paddingLeft: "50%" }}
            >
              {/* Selected clip block */}
              <div
                className="cc-block relative flex h-16 w-[336px] shrink-0 items-center overflow-hidden rounded-xl border-2 border-sage bg-black shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)] will-change-transform"
                style={{
                  backgroundImage: `url(${POSTER})`,
                  backgroundRepeat: "repeat-x",
                  backgroundSize: "auto 100%",
                  backgroundPosition: "left center",
                }}
              >
                {/* frame dividers */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, transparent 0 55px, rgba(0,0,0,0.55) 55px 56px)",
                  }}
                />
                {/* darken for legibility */}
                <div className="pointer-events-none absolute inset-0 bg-black/20" />

                {/* selection sheen */}
                <div className="pointer-events-none absolute inset-0 rounded-[10px] ring-1 ring-inset ring-white/15" />

                {/* Left CapCut handle */}
                <div className="cc-cap absolute -left-[2px] top-1/2 z-10 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-xl bg-white text-black shadow-[0_4px_12px_-4px_rgba(0,0,0,0.8)] will-change-transform">
                  <DotsSixVerticalIcon weight="bold" className="h-5 w-5 text-zinc-700" />
                </div>
                {/* Right CapCut handle */}
                <div className="cc-cap absolute -right-[2px] top-1/2 z-10 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-xl bg-white text-black shadow-[0_4px_12px_-4px_rgba(0,0,0,0.8)] will-change-transform">
                  <DotsSixVerticalIcon weight="bold" className="h-5 w-5 text-zinc-700" />
                </div>

                {/* clip label */}
                <span className="absolute bottom-1 left-9 font-mono text-[10px] tabular-nums text-white/80">
                  8.0s
                </span>
              </div>

              {/* trailing empty room so the strip can scroll past center */}
              <div className="h-16 w-[200px] shrink-0" />
            </div>

            {/* Fixed center playhead */}
            <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-full -translate-x-1/2">
              {/* split divider that drops in at the playhead */}
              <div className="cc-splitline absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-sage/80 shadow-[0_0_8px_rgba(110,122,94,0.9)]" />
              {/* main white playhead */}
              <div className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
              {/* triangle knob */}
              <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[1px]">
                <div className="h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-white" />
              </div>
            </div>
          </div>

          {/* zoom / scale hint */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] tabular-nums text-white/40">1x</span>
              <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-2/5 rounded-full bg-white/30" />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-white/40">8x</span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">
              pinch to zoom
            </span>
          </div>
        </div>
      </div>

      {/* "Moment saved" toast */}
      <div className="cc-toast pointer-events-none absolute bottom-8 left-1/2 z-40 -translate-x-1/2 will-change-transform">
        <div className="flex items-center gap-2.5 rounded-full border border-sage/40 bg-zinc-900/95 px-4 py-2.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur">
          <CheckCircleIcon weight="fill" className="h-5 w-5 text-sage" />
          <div className="flex flex-col leading-tight">
            <span className="font-sans text-[12px] font-semibold text-white">
              Moment saved
            </span>
            <span className="font-mono text-[10px] tabular-nums text-white/50">
              hosted clip · 8.0s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
