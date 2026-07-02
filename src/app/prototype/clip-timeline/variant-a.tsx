"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "motion/react";
import {
  Scissors,
  Magnet,
  MapPin,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  Eye,
  Lock,
  SpeakerHigh,
  Play,
  SkipBack,
  SkipForward,
  FilmStrip,
} from "@phosphor-icons/react";

const VIDEO = "/demo/snowboard.mp4";
const POSTER = "/demo/snowboard-poster.jpg";

const PLAYHEAD = "#e0614a";

// Deterministic pseudo-waveform so the A1 track reads like real audio.
const WAVEFORM = Array.from({ length: 44 }, (_, i) => {
  const a = Math.sin(i * 0.7) * 0.5 + 0.5;
  const b = Math.sin(i * 1.9 + 1.3) * 0.5 + 0.5;
  const h = 0.18 + a * 0.55 + b * 0.25;
  return Math.min(1, h);
});

// Ruler timecodes across the visible span.
const RULER = ["00:00", "00:02", "00:04", "00:06", "00:08", "00:10", "00:12"];

export const label = "A — Resolve Pro (dual-monitor + multi-track)";

export default function VariantA() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() === true;

  useGSAP(
    () => {
      const q = gsap.utils.selector(ref);
      const clip = q(".v1-clip");
      const clipInner = q(".v1-clip-inner");
      const handles = q(".trim-grip");
      const playhead = q(".playhead");
      const chip = q(".hosted-chip");
      const srcTc = q(".src-tc");
      const progTc = q(".prog-tc");
      const bladeBtn = q(".tool-blade");

      // Resting layout: full clip span across the track, in/out at edges.
      const CLIP_FULL_LEFT = 3;
      const CLIP_FULL_WIDTH = 94;
      const CLIP_TRIM_LEFT = 22;
      const CLIP_TRIM_WIDTH = 52;

      if (reduce) {
        gsap.set(clip, {
          left: `${CLIP_TRIM_LEFT}%`,
          width: `${CLIP_TRIM_WIDTH}%`,
          opacity: 1,
        });
        gsap.set(handles, { opacity: 1, scaleY: 1 });
        gsap.set(playhead, { left: `${CLIP_TRIM_LEFT + CLIP_TRIM_WIDTH}%`, opacity: 1 });
        gsap.set(chip, { opacity: 1, y: 0, scale: 1 });
        return;
      }

      // Initial state for the loop.
      gsap.set(clip, {
        left: `${CLIP_FULL_LEFT}%`,
        width: `${CLIP_FULL_WIDTH}%`,
        opacity: 0.55,
      });
      gsap.set(clipInner, { filter: "grayscale(0.5)" });
      gsap.set(handles, { opacity: 0, scaleY: 0.6 });
      gsap.set(playhead, { left: "3%", opacity: 0 });
      gsap.set(chip, { opacity: 0, y: 8, scale: 0.96 });
      gsap.set(bladeBtn, { backgroundColor: "rgba(255,255,255,0.04)" });

      const tl = gsap.timeline({
        repeat: -1,
        repeatDelay: 0.8,
        defaults: { ease: "power3.out" },
      });

      // 1. Wake the clip up on the track.
      tl.to(playhead, { opacity: 1, duration: 0.25 }, 0.1);
      tl.to(clip, { opacity: 0.85, duration: 0.4 }, 0.1);

      // 2. Blade tool "engages" — the cut is about to happen.
      tl.to(
        bladeBtn,
        { backgroundColor: "rgba(224,97,74,0.22)", duration: 0.25 },
        0.3,
      );

      // 3. Playhead sweeps to the in-point; clip snaps its left edge in.
      tl.to(playhead, { left: `${CLIP_TRIM_LEFT}%`, duration: 1.0 }, 0.4);
      tl.to(
        clip,
        {
          left: `${CLIP_TRIM_LEFT}%`,
          width: `${CLIP_FULL_LEFT + CLIP_FULL_WIDTH - CLIP_TRIM_LEFT}%`,
          duration: 0.5,
          ease: "power4.out",
        },
        1.05,
      );
      tl.to(handles, { opacity: 1, scaleY: 1, duration: 0.3 }, 1.1);

      // 4. Playhead continues to the out-point; clip snaps its right edge in.
      tl.to(
        playhead,
        { left: `${CLIP_TRIM_LEFT + CLIP_TRIM_WIDTH}%`, duration: 1.0 },
        1.5,
      );
      tl.to(
        clip,
        { width: `${CLIP_TRIM_WIDTH}%`, duration: 0.5, ease: "power4.out" },
        1.9,
      );
      tl.to(clip, { opacity: 1, duration: 0.3 }, 1.9);
      tl.to(clipInner, { filter: "grayscale(0)", duration: 0.5 }, 1.9);

      // Source / program timecodes tick during the sweep (opacity-only fade
      // between two frozen readouts to keep it cheap — the DOM shows a static
      // mono string; we just pulse the program readout as it "captures").
      tl.to(srcTc, { opacity: 0.55, duration: 0.4 }, 1.9);
      tl.fromTo(
        progTc,
        { opacity: 0.55 },
        { opacity: 1, duration: 0.4 },
        1.9,
      );

      // 5. Settled pulse on the clip block.
      tl.to(
        clip,
        { scale: 1.012, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1 },
        2.45,
      );
      tl.to(
        bladeBtn,
        { backgroundColor: "rgba(255,255,255,0.04)", duration: 0.4 },
        2.5,
      );

      // 6. Hosted-moment chip lifts in near the Program monitor.
      tl.to(chip, { opacity: 1, y: 0, scale: 1, duration: 0.5 }, 2.7);

      // Hold, then quietly reset the clip opacity so the loop restart is clean.
      tl.to(playhead, { opacity: 0, duration: 0.3 }, "+=0.6");
      tl.to(chip, { opacity: 0, y: 8, duration: 0.3 }, "<");
    },
    { scope: ref, dependencies: [reduce] },
  );

  return (
    <div
      ref={ref}
      className="relative flex h-full w-full items-center justify-center px-4 py-6 text-zinc-200"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5">
        {/* ── Top toolbar strip ─────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-lg border border-white/8 bg-zinc-900/70 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
          <div className="flex items-center gap-1.5">
            <ToolBtn className="tool-blade" active>
              <Scissors weight="fill" className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn>
              <Magnet weight="fill" className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn>
              <MapPin weight="fill" className="h-3.5 w-3.5" />
            </ToolBtn>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <ToolBtn>
              <MagnifyingGlassMinus className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn>
              <MagnifyingGlassPlus className="h-3.5 w-3.5" />
            </ToolBtn>
          </div>
          <div className="flex items-center gap-2">
            <FilmStrip weight="regular" className="h-3.5 w-3.5 text-sage" />
            <span className="font-mono text-[10px] tracking-wide text-zinc-400 tabular-nums">
              TIMELINE 01 · 24fps
            </span>
          </div>
        </div>

        {/* ── Dual monitors ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2.5">
          <Monitor
            role="SOURCE"
            tint="text-zinc-400"
            tcClass="src-tc"
            tc="00:00:13:11"
          />
          <div className="relative">
            <Monitor
              role="PROGRAM"
              tint="text-sage"
              tcClass="prog-tc"
              tc="00:00:08:04"
            />
            {/* Hosted-moment chip anchored to the Program monitor */}
            <div className="hosted-chip pointer-events-none absolute -bottom-2 left-1/2 z-20 w-[86%] -translate-x-1/2 rounded-md border border-sage/40 bg-zinc-950/90 px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium leading-tight text-zinc-100">
                    Snowboard — backside 360
                  </p>
                  <p className="font-mono text-[9px] leading-tight text-sage tabular-nums">
                    hosted moment
                  </p>
                </div>
                <span className="shrink-0 rounded bg-sage/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-sage tabular-nums">
                  8.0s
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Time ruler ────────────────────────────────────────── */}
        <div className="relative mt-1 pl-16">
          <div className="flex items-end justify-between border-b border-white/10 pb-1">
            {RULER.map((t, i) => (
              <div key={t} className="flex flex-col items-center gap-0.5">
                <span
                  className={`font-mono text-[9px] tabular-nums ${
                    i === 0 ? "text-zinc-500" : "text-zinc-500"
                  }`}
                >
                  {t}
                </span>
                <span className="h-2 w-px bg-white/15" />
              </div>
            ))}
          </div>
        </div>

        {/* ── Multi-track stack ─────────────────────────────────── */}
        <div className="relative rounded-lg border border-white/8 bg-zinc-900/60 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          {/* Continuous red playhead spanning both tracks */}
          <div
            className="playhead pointer-events-none absolute inset-y-2 left-0 z-30 ml-16 w-px"
            style={{ backgroundColor: PLAYHEAD, boxShadow: `0 0 6px ${PLAYHEAD}` }}
          >
            <span
              className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px]"
              style={{ backgroundColor: PLAYHEAD }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            {/* V1 video track */}
            <div className="flex items-stretch gap-2">
              <TrackHeader label="V1" muted={false} kind="video" />
              <div className="relative h-14 flex-1 overflow-hidden rounded-md border border-white/8 bg-zinc-950/70">
                {/* faint frame dividers */}
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to right, rgba(255,255,255,0.06) 0 1px, transparent 1px 40px)",
                  }}
                />
                {/* selected clip block (the moment) */}
                <div className="v1-clip absolute inset-y-1 overflow-hidden rounded-[5px] border border-sage/70 bg-sage/15 shadow-[0_0_0_1px_rgba(138,150,123,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]">
                  <div
                    className="v1-clip-inner absolute inset-0 opacity-60"
                    style={{
                      backgroundImage: `url(${POSTER})`,
                      backgroundSize: "auto 100%",
                      backgroundRepeat: "repeat-x",
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-sage/10 to-transparent" />
                  {/* clip label */}
                  <span className="absolute left-1.5 top-1 font-mono text-[8px] font-medium text-white/90 tabular-nums">
                    backside_360.mp4
                  </span>
                  {/* in trim grip */}
                  <span className="trim-grip absolute inset-y-0 left-0 flex w-2 origin-center items-center justify-center border-r border-sage bg-sage/80">
                    <span className="h-4 w-px bg-zinc-900/70" />
                  </span>
                  {/* out trim grip */}
                  <span className="trim-grip absolute inset-y-0 right-0 flex w-2 origin-center items-center justify-center border-l border-sage bg-sage/80">
                    <span className="h-4 w-px bg-zinc-900/70" />
                  </span>
                </div>
              </div>
            </div>

            {/* A1 audio track */}
            <div className="flex items-stretch gap-2">
              <TrackHeader label="A1" muted={false} kind="audio" />
              <div className="relative h-10 flex-1 overflow-hidden rounded-md border border-white/8 bg-zinc-950/70">
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to right, rgba(255,255,255,0.05) 0 1px, transparent 1px 40px)",
                  }}
                />
                <div className="absolute inset-0 flex items-center gap-[2px] px-2">
                  {WAVEFORM.map((h, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-full bg-sage/45"
                      style={{ height: `${Math.round(h * 70)}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function Monitor({
  role,
  tint,
  tc,
  tcClass,
}: {
  role: string;
  tint: string;
  tc: string;
  tcClass: string;
}) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <video
        className="h-full w-full object-cover opacity-90"
        src={VIDEO}
        poster={POSTER}
        muted
        loop
        autoPlay
        playsInline
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/25" />
      {/* role chip */}
      <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-[#e0614a]" />
        <span className={`font-mono text-[9px] font-semibold tracking-wider ${tint}`}>
          {role}
        </span>
      </div>
      {/* timecode */}
      <span
        className={`${tcClass} absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wide text-zinc-200 tabular-nums backdrop-blur`}
      >
        {tc}
      </span>
      {/* transport hints */}
      <div className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-2 text-zinc-400">
        <SkipBack weight="fill" className="h-2.5 w-2.5" />
        <Play weight="fill" className="h-3 w-3 text-zinc-200" />
        <SkipForward weight="fill" className="h-2.5 w-2.5" />
      </div>
    </div>
  );
}

function ToolBtn({
  children,
  active,
  className = "",
}: {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={`flex h-6 w-6 items-center justify-center rounded border transition-colors ${
        active
          ? "border-sage/40 text-sage"
          : "border-white/8 text-zinc-400 hover:text-zinc-200"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function TrackHeader({
  label,
  kind,
}: {
  label: string;
  muted: boolean;
  kind: "video" | "audio";
}) {
  return (
    <div className="flex w-16 shrink-0 flex-col justify-center gap-1 rounded-md border border-white/8 bg-zinc-950/50 px-2 py-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold text-zinc-300 tabular-nums">
          {label}
        </span>
        {kind === "video" ? (
          <Eye weight="fill" className="h-3 w-3 text-zinc-500" />
        ) : (
          <SpeakerHigh weight="fill" className="h-3 w-3 text-zinc-500" />
        )}
      </div>
      <div className="flex items-center gap-1">
        <Lock weight="fill" className="h-2.5 w-2.5 text-zinc-600" />
        <span className="h-1 flex-1 rounded-full bg-white/8" />
      </div>
    </div>
  );
}
