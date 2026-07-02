"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "motion/react";
import { ArrowRight } from "@phosphor-icons/react";

const VIDEO = "/demo/snowboard.mp4";
const POSTER = "/demo/snowboard-poster.jpg";

export const label = "C — Editorial Minimal (single hairline strip)";

export default function VariantC() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() === true;

  useGSAP(
    () => {
      if (reduce) {
        // Final resting state: the cut is formed, moment revealed.
        gsap.set(".vc-bracket-in", { xPercent: 0, opacity: 1 });
        gsap.set(".vc-bracket-out", { xPercent: 0, opacity: 1 });
        gsap.set(".vc-window", { opacity: 1 });
        gsap.set(".vc-tc-in, .vc-tc-out", { opacity: 1, y: 0 });
        gsap.set(".vc-playhead", { xPercent: 100, opacity: 0 });
        gsap.set(".vc-moment", { opacity: 1, y: 0 });
        return;
      }

      // Initial state ---------------------------------------------------------
      // The selection window begins full-width; brackets sit at the far edges.
      gsap.set(".vc-bracket-in", { xPercent: -180, opacity: 0 });
      gsap.set(".vc-bracket-out", { xPercent: 180, opacity: 0 });
      gsap.set(".vc-window", { opacity: 0 });
      gsap.set(".vc-tc-in, .vc-tc-out", { opacity: 0, y: 6 });
      gsap.set(".vc-playhead", { xPercent: 0, opacity: 0 });
      gsap.set(".vc-moment", { opacity: 0, y: 10 });

      const tl = gsap.timeline({
        repeat: -1,
        repeatDelay: 0.8,
        defaults: { ease: "power3.out" },
      });

      // The window blooms into being at full width.
      tl.to(".vc-window", { opacity: 1, duration: 0.5 }, 0)
        .to(
          ".vc-bracket-in",
          { xPercent: 0, opacity: 1, duration: 0.9, ease: "power2.out" },
          0.1,
        )
        .to(
          ".vc-bracket-out",
          { xPercent: 0, opacity: 1, duration: 0.9, ease: "power2.out" },
          0.1,
        );

      // The brackets glide gracefully inward to frame the 8-second cut.
      tl.to(
        ".vc-window",
        { "--vc-l": "24%", "--vc-r": "24%", duration: 1.5, ease: "power3.inOut" },
        0.9,
      )
        .to(
          ".vc-tc-in",
          { opacity: 1, y: 0, duration: 0.6 },
          1.2,
        )
        .to(
          ".vc-tc-out",
          { opacity: 1, y: 0, duration: 0.6 },
          1.3,
        );

      // A single thin playhead sweeps across the formed cut, once.
      tl.set(".vc-playhead", { opacity: 1 }, 1.2)
        .to(
          ".vc-playhead",
          { xPercent: 100, duration: 1.9, ease: "none" },
          1.2,
        )
        .to(".vc-playhead", { opacity: 0, duration: 0.4 }, 3.0);

      // The hosted moment blooms in beneath, refined and quiet.
      tl.to(
        ".vc-moment",
        { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" },
        2.9,
      );

      // Hold, then dissolve back to the beginning.
      tl.to({}, { duration: 1.4 });
      tl.to(
        [".vc-window", ".vc-tc-in", ".vc-tc-out", ".vc-moment", ".vc-bracket-in", ".vc-bracket-out"],
        { opacity: 0, duration: 0.6, ease: "power2.in" },
        "<",
      );
    },
    { scope: ref, dependencies: [reduce] },
  );

  return (
    <div ref={ref} className="relative flex h-full w-full items-center justify-center px-6 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        {/* Header: serif label + duration ---------------------------------- */}
        <div className="mb-6 flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <h3 className="font-display text-3xl leading-none tracking-tight text-white/90">
              the cut
            </h3>
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/35">
              from source
            </span>
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-[10px] uppercase tracking-[0.28em] text-sage/70">
              duration
            </span>
            <span className="text-lg leading-none text-white/85">0:08</span>
          </div>
        </div>

        {/* The strip ------------------------------------------------------- */}
        <div className="relative">
          {/* Floating in-point timecode */}
          <div
            className="vc-tc-in pointer-events-none absolute -top-7 z-20 -translate-x-1/2 font-mono text-[11px] tabular-nums text-sage/90"
            style={{ left: "24%" }}
          >
            <span className="mr-1 text-[9px] uppercase tracking-[0.2em] text-sage/45">
              in
            </span>
            0:03
          </div>
          {/* Floating out-point timecode */}
          <div
            className="vc-tc-out pointer-events-none absolute -top-7 z-20 -translate-x-1/2 font-mono text-[11px] tabular-nums text-sage/90"
            style={{ right: "24%", transform: "translateX(50%)" }}
          >
            <span className="mr-1 text-[9px] uppercase tracking-[0.2em] text-sage/45">
              out
            </span>
            0:11
          </div>

          {/* Hairline top rule */}
          <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />

          {/* Filmstrip lane */}
          <div className="relative h-28 overflow-hidden rounded-sm bg-zinc-950/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.06] sm:h-32">
            {/* Live source frame, tastefully desaturated, tiled feel via low opacity */}
            <video
              className="absolute inset-0 h-full w-full object-cover opacity-25 saturate-50 [filter:grayscale(0.35)_contrast(1.05)]"
              src={VIDEO}
              poster={POSTER}
              autoPlay
              muted
              loop
              playsInline
            />
            {/* Poster tiled as filmstrip frames */}
            <div
              className="absolute inset-0 opacity-30 mix-blend-luminosity"
              style={{
                backgroundImage: `url(${POSTER})`,
                backgroundRepeat: "repeat-x",
                backgroundSize: "auto 100%",
                backgroundPosition: "center",
              }}
            />
            {/* Faint vertical frame dividers */}
            <div
              className="absolute inset-0 opacity-[0.5]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to right, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, transparent 1px, transparent 84px)",
              }}
            />
            {/* Vignette to sink the edges */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />
            <div className="absolute inset-0 bg-black/25" />

            {/* Selection window ------------------------------------------- */}
            <div
              className="vc-window absolute inset-y-0"
              style={
                {
                  left: "var(--vc-l, 0%)",
                  right: "var(--vc-r, 0%)",
                  "--vc-l": "0%",
                  "--vc-r": "0%",
                } as React.CSSProperties
              }
            >
              {/* Sage translucent glass over the kept region */}
              <div className="absolute inset-0 bg-sage/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" />
              {/* Darken everything outside via left/right shadow spill */}
              <div className="absolute inset-y-0 -left-px w-px bg-sage/70" />
              <div className="absolute inset-y-0 -right-px w-px bg-sage/70" />

              {/* In bracket — ultra-thin hairline grip */}
              <div className="vc-bracket-in absolute inset-y-0 left-0 flex w-4 -translate-x-1/2 items-center justify-center">
                <div className="relative h-full w-px bg-sage/80">
                  <span className="absolute left-1/2 top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[1px] border-l border-t border-b border-sage/85" />
                </div>
              </div>
              {/* Out bracket — ultra-thin hairline grip */}
              <div className="vc-bracket-out absolute inset-y-0 right-0 flex w-4 translate-x-1/2 items-center justify-center">
                <div className="relative h-full w-px bg-sage/80">
                  <span className="absolute left-1/2 top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[1px] border-r border-t border-b border-sage/85" />
                </div>
              </div>
            </div>

            {/* Single thin sage playhead sweeping once -------------------- */}
            <div className="vc-playhead absolute inset-y-0 left-0 w-px bg-sage shadow-[0_0_8px_rgba(138,150,123,0.6)]">
              <span className="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-sage" />
            </div>
          </div>

          {/* Hairline bottom rule */}
          <div className="absolute -bottom-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />

          {/* Minimal mono ruler ----------------------------------------- */}
          <div className="mt-3 flex items-center justify-between font-mono text-[10px] tabular-nums text-white/30">
            <span>0:00</span>
            <span>0:03</span>
            <span>0:05</span>
            <span>0:08</span>
            <span>0:11</span>
            <span>0:13</span>
          </div>
        </div>

        {/* Hosted moment — refined bloom ---------------------------------- */}
        <div className="vc-moment mt-9 flex items-center justify-between border-t border-white/[0.07] pt-6">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-sage/55">
              hosted moment
            </span>
            <h4 className="font-display text-2xl leading-none tracking-tight text-white/90">
              Snowboard — backside 360
            </h4>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm tabular-nums text-white/55">8.0s</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-sage/40 text-sage/90">
              <ArrowRight size={14} weight="bold" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
