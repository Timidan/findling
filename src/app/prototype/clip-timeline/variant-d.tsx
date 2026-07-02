"use client";

import { useMemo, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "motion/react";
import { Waveform, SpeakerHigh } from "@phosphor-icons/react";

const VIDEO = "/demo/snowboard.mp4";
const POSTER = "/demo/snowboard-poster.jpg";

const BAR_COUNT = 90;
// Selection spans this contiguous window of bars (in/out gates).
const SEL_START = 24;
const SEL_END = 66;

// Deterministic pseudo-waveform: a couple of stacked sines + a decaying
// transient near the loudest peak so it reads like real recorded audio.
function barHeight(i: number): number {
  const t = i / BAR_COUNT;
  const base =
    0.34 +
    0.30 * Math.abs(Math.sin(t * Math.PI * 6.0 + 0.4)) +
    0.20 * Math.abs(Math.sin(t * Math.PI * 13.0 + 1.1)) +
    0.12 * Math.abs(Math.sin(t * Math.PI * 27.0));
  // Transient swell centered on the loudest peak (bar ~45).
  const peak = Math.exp(-Math.pow((i - 45) / 7, 2)) * 0.32;
  return Math.min(1, base + peak);
}

const RULER = ["0:00", "0:02", "0:04", "0:06", "0:08", "0:10", "0:12", "0:13"];
const PEAK_BAR = 45;

export default function VariantD() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() === true;

  const bars = useMemo(
    () => Array.from({ length: BAR_COUNT }, (_, i) => barHeight(i)),
    [],
  );

  const inSelection = (i: number) => i >= SEL_START && i <= SEL_END;

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      const litBars = gsap.utils.toArray<HTMLElement>(root.querySelectorAll("[data-lit]"));
      const selWindow = root.querySelector<HTMLElement>("[data-sel]");
      const gateIn = root.querySelector<HTMLElement>("[data-gate='in']");
      const gateOut = root.querySelector<HTMLElement>("[data-gate='out']");
      const playhead = root.querySelector<HTMLElement>("[data-playhead]");
      const chip = root.querySelector<HTMLElement>("[data-chip]");
      const meter = root.querySelector<HTMLElement>("[data-meter]");

      const selLeft = (SEL_START / BAR_COUNT) * 100;
      const selWidth = ((SEL_END - SEL_START + 1) / BAR_COUNT) * 100;

      if (reduce) {
        // Final resting state: selection formed, every in-selection bar lit,
        // moment chip shown.
        gsap.set(selWindow, { opacity: 1, scaleX: 1 });
        gsap.set([gateIn, gateOut], { opacity: 1, x: 0 });
        gsap.set(playhead, { left: `${selLeft + selWidth}%`, opacity: 0 });
        litBars.forEach((b) => {
          const idx = Number(b.dataset.idx);
          gsap.set(b, { opacity: inSelection(idx) ? 1 : 0 });
        });
        gsap.set(chip, { opacity: 1, y: 0 });
        gsap.set(meter, { opacity: 0.9 });
        return;
      }

      // Initial state.
      gsap.set(selWindow, { opacity: 0, scaleX: 0.86, transformOrigin: "50% 50%" });
      gsap.set(gateIn, { opacity: 0, x: -10 });
      gsap.set(gateOut, { opacity: 0, x: 10 });
      gsap.set(playhead, { left: `${selLeft}%`, opacity: 0 });
      gsap.set(litBars, { opacity: 0 });
      gsap.set(chip, { opacity: 0, y: 10 });
      gsap.set(meter, { opacity: 0.5 });

      const tl = gsap.timeline({
        repeat: -1,
        repeatDelay: 0.8,
        defaults: { ease: "power3.out" },
      });

      // 1. In/out gates snap in, selection band forms over the waveform.
      tl.to(gateIn, { opacity: 1, x: 0, duration: 0.35 }, 0.1)
        .to(gateOut, { opacity: 1, x: 0, duration: 0.35 }, 0.16)
        .to(
          selWindow,
          { opacity: 1, scaleX: 1, duration: 0.5, ease: "power2.out" },
          0.18,
        )
        .to(meter, { opacity: 0.9, duration: 0.4 }, 0.2);

      // 2. Playhead appears at the in-gate and sweeps L->R across the band.
      tl.to(playhead, { opacity: 1, duration: 0.2 }, 0.55).to(
        playhead,
        {
          left: `${selLeft + selWidth}%`,
          duration: 2.0,
          ease: "none",
        },
        0.6,
      );

      // 3. As the playhead passes each in-selection bar, that bar lights sage.
      //    Stagger the illumination to match the sweep timing.
      const selCount = SEL_END - SEL_START + 1;
      litBars.forEach((b) => {
        const idx = Number(b.dataset.idx);
        if (!inSelection(idx)) return;
        const frac = (idx - SEL_START) / selCount;
        tl.to(
          b,
          { opacity: 1, duration: 0.18, ease: "power1.out" },
          0.6 + frac * 2.0,
        );
      });

      // 4. Selection band pulses on the loudest peak as the playhead crosses it.
      const peakTime = 0.6 + ((PEAK_BAR - SEL_START) / selCount) * 2.0;
      tl.to(
        selWindow,
        { scaleX: 1.015, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1 },
        peakTime,
      );

      // 5. Playhead fades at the out-gate, hosted-moment chip lifts in.
      tl.to(playhead, { opacity: 0, duration: 0.25 }, 2.65).to(
        chip,
        { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" },
        2.7,
      );

      // 6. Hold, then reset dim for the loop.
      tl.to({}, { duration: 0.7 })
        .to(chip, { opacity: 0, y: 10, duration: 0.35 }, ">")
        .to(litBars, { opacity: 0, duration: 0.3 }, "<")
        .to([gateIn], { opacity: 0, x: -10, duration: 0.3 }, "<")
        .to([gateOut], { opacity: 0, x: 10, duration: 0.3 }, "<")
        .to(selWindow, { opacity: 0, scaleX: 0.86, duration: 0.3 }, "<")
        .to(meter, { opacity: 0.5, duration: 0.3 }, "<");
    },
    { scope: ref, dependencies: [reduce] },
  );

  const selLeftPct = (SEL_START / BAR_COUNT) * 100;
  const selWidthPct = ((SEL_END - SEL_START + 1) / BAR_COUNT) * 100;

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center gap-4 px-5 py-8">
        {/* Header row: tool identity + master timecode */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-400">
            <Waveform weight="fill" className="h-4 w-4 text-sage" />
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              Audio scrubber
            </span>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-zinc-500">
            00:00:08:04
          </span>
        </div>

        {/* The editor surface */}
        <div className="relative rounded-2xl border border-white/10 bg-zinc-950/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
          <div className="flex gap-3">
            {/* Left: dB-ish level meter scale */}
            <div
              data-meter
              className="flex w-9 shrink-0 flex-col justify-between py-[2px] pr-1"
            >
              {["0", "-6", "-12", "-24", "-∞"].map((db) => (
                <div
                  key={db}
                  className="flex items-center justify-end gap-1.5 font-mono text-[9px] tabular-nums leading-none text-zinc-600"
                >
                  <span>{db}</span>
                  <span className="h-px w-1.5 bg-zinc-700" />
                </div>
              ))}
            </div>

            {/* Right: video lane + waveform hero, sharing one selection */}
            <div className="relative flex-1">
              {/* Companion VIDEO lane (short, tiled poster filmstrip) */}
              <div className="relative mb-2 h-8 overflow-hidden rounded-md border border-white/10 bg-black">
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-45"
                  style={{
                    backgroundImage: `url(${POSTER})`,
                    backgroundSize: "auto 100%",
                    backgroundRepeat: "repeat-x",
                    backgroundPosition: "center",
                  }}
                />
                {/* faint frame dividers */}
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, rgba(0,0,0,0.55) 0px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 44px)",
                  }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-black/50" />
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 font-mono text-[8px] uppercase tracking-[0.16em] text-white/60">
                  V1
                </span>
                {/* Hidden source video element (satisfies real-media read) */}
                <video
                  className="absolute right-1.5 top-1/2 h-6 w-10 -translate-y-1/2 rounded-sm object-cover opacity-70"
                  src={VIDEO}
                  poster={POSTER}
                  muted
                  playsInline
                  preload="none"
                />
              </div>

              {/* WAVEFORM hero */}
              <div className="relative h-36 overflow-hidden rounded-lg border border-white/10 bg-black/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                {/* center baseline */}
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />

                {/* mirrored bars */}
                <div className="absolute inset-0 flex items-center justify-between px-2">
                  {bars.map((h, i) => {
                    const lit = inSelection(i);
                    return (
                      <div
                        key={i}
                        className="relative flex flex-1 flex-col items-center justify-center"
                        style={{ height: "100%" }}
                      >
                        {/* dim base bar (top + bottom mirror) */}
                        <span
                          className={`w-full rounded-full ${
                            lit ? "bg-zinc-600/70" : "bg-zinc-700/45"
                          }`}
                          style={{
                            height: `${h * 84}%`,
                            maxWidth: "3px",
                          }}
                        />
                        {/* lit sage overlay bar (animated opacity) */}
                        <span
                          data-lit
                          data-idx={i}
                          className="absolute left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-sage shadow-[0_0_6px_rgba(122,158,110,0.55)]"
                          style={{
                            height: `${h * 84}%`,
                            maxWidth: "3px",
                            opacity: 0,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Selection band over the waveform */}
                <div
                  data-sel
                  className="pointer-events-none absolute inset-y-0 rounded-md border-x border-sage bg-sage/12"
                  style={{
                    left: `${selLeftPct}%`,
                    width: `${selWidthPct}%`,
                  }}
                >
                  <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-sage/20 to-transparent" />
                  <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-sage/20 to-transparent" />
                </div>

                {/* IN gate */}
                <div
                  data-gate="in"
                  className="absolute inset-y-0 z-10 flex w-4 items-stretch"
                  style={{ left: `calc(${selLeftPct}% - 8px)` }}
                >
                  <div className="relative h-full w-full rounded-l-sm border-y border-l-2 border-sage bg-sage/25">
                    <span className="absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-black/70" />
                  </div>
                </div>

                {/* OUT gate */}
                <div
                  data-gate="out"
                  className="absolute inset-y-0 z-10 flex w-4 items-stretch"
                  style={{ left: `calc(${selLeftPct + selWidthPct}% - 8px)` }}
                >
                  <div className="relative h-full w-full rounded-r-sm border-y border-r-2 border-sage bg-sage/25">
                    <span className="absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-black/70" />
                  </div>
                </div>

                {/* Playhead sweeping across the waveform */}
                <div
                  data-playhead
                  className="pointer-events-none absolute inset-y-0 z-20 -ml-px w-px bg-white"
                  style={{ left: `${selLeftPct}%`, opacity: 0 }}
                >
                  <div className="absolute -top-[3px] left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
                </div>
              </div>

              {/* Time ruler under the waveform */}
              <div className="mt-2 flex items-center justify-between font-mono text-[9px] tabular-nums text-zinc-600">
                {RULER.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Hosted-moment chip */}
        <div className="flex justify-start pl-12">
          <div
            data-chip
            className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm"
            style={{ opacity: 0 }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sage/15 text-sage">
              <SpeakerHigh weight="fill" className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <div className="font-display text-[13px] text-zinc-100">
                Snowboard — backside 360
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-zinc-500">
                <span>hosted moment</span>
                <span className="text-zinc-700">·</span>
                <span className="text-sage">8.0s</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const label = "D — Waveform-first (audio-led scrubber)";
