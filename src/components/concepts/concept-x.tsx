"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ReactLenis, useLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";
import {
  ArrowRight,
  CaretDown,
  FilmSlate,
  Lightning,
  MagicWand,
  MagnifyingGlass,
  Path,
  Receipt,
  Scissors,
  SealCheck,
  Sparkle,
  Tag,
  Wallet,
} from "@phosphor-icons/react";
import { UsdcIcon } from "@/components/brand/usdc";
import { FindlingLogo } from "@/components/brand/logo";
import { PoweredBy } from "@/components/brand/tech-logos";
import { ConnectWallet } from "@/components/auth/connect-wallet";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "900"],
  style: ["normal", "italic"],
  variable: "--font-cx",
});

const MOTION_EASE = "power3.out";
const VIDEO = "/demo/snowboard.mp4";
const POSTER = "/demo/snowboard-poster.jpg";
const AGENT_QUERY = "find an 8s snowboard trick under $0.10 for a winter recap";

// stable 3dp for the animated count-up + round demo prices; the split rows below
// use formatMicroUsdc so a non-round leg would still render exactly.
const usd = (micro: number) => (micro / 1_000_000).toFixed(3);

interface Split {
  creatorMicroUsdc: number;
  finderMicroUsdc: number;
  platformMicroUsdc: number;
}

interface Stats {
  settledCount: number;
  grossMicroUsdc: number;
  creatorMicroUsdc: number;
  finderMicroUsdc: number;
  publishedMoments: number;
}

type BeatContent = {
  step: string;
  kicker: string;
  title: string;
  body: string;
  Icon: typeof Scissors;
};

const BEATS: BeatContent[] = [
  {
    step: "01",
    kicker: "clip the cut",
    title: "A moment is just a cut.",
    body: "Findling marks the in and out around the trick, renders the 8-second clip, and hosts it as a licensable moment.",
    Icon: Scissors,
  },
  {
    step: "02",
    kicker: "curate",
    title: "Someone makes it findable.",
    body: "A finder tags the trick into useful context. When their pick gets licensed, their 12% finder cut is already encoded.",
    Icon: Sparkle,
  },
  {
    step: "03",
    kicker: "discover",
    title: "A consumer's agent finds it.",
    body: "No browsing. The agent searches Findling over MCP in plain language and selects the moment that matches intent and budget.",
    Icon: MagicWand,
  },
  {
    step: "04",
    kicker: "pay",
    title: "The agent pays the x402 unlock.",
    body: "A USDC nanopayment lands on Arc. The agent signs with its own funded session key, with no human in the loop.",
    Icon: Lightning,
  },
  {
    step: "05",
    kicker: "disperse",
    title: "Settled instantly. Split instantly.",
    body: "Gross lands and fans out the same second: 80% creator, 12% finder, 8% platform. A receipt is issued.",
    Icon: SealCheck,
  },
];

export function LandingX({
  stats,
  priceMicroUsdc,
  split,
}: {
  stats: Stats;
  priceMicroUsdc: number;
  split: Split;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() === true;

  useLandingMotion(rootRef, reduceMotion, priceMicroUsdc, split);

  const page = (
    <div ref={rootRef} className={`${display.variable} dark relative overflow-x-clip bg-background text-foreground`}>
      <FixedBackdrop />
      <main className="relative z-10">
        <LandingHeader />
        <Hero />
        {reduceMotion ? (
          <ReducedMomentStory priceMicroUsdc={priceMicroUsdc} split={split} />
        ) : (
          <MomentStory priceMicroUsdc={priceMicroUsdc} split={split} />
        )}
        <Proof stats={stats} />
        <FooterCTA />
      </main>
    </div>
  );

  return (
    <ReactLenis
      root
      options={{
        autoRaf: false,
        duration: reduceMotion ? 0 : 1.35,
        lerp: reduceMotion ? 1 : 0.075,
        smoothWheel: !reduceMotion,
        syncTouch: !reduceMotion,
        touchMultiplier: 1.35,
        wheelMultiplier: 0.86,
      }}
    >
      <LenisGsapBridge disabled={reduceMotion} />
      {page}
    </ReactLenis>
  );
}

function useLandingMotion(
  rootRef: React.RefObject<HTMLDivElement | null>,
  reduceMotion: boolean,
  priceMicroUsdc: number,
  split: Split,
) {
  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || reduceMotion) return;

      const q = gsap.utils.selector(root);
      const story = q(".moment-story")[0] as HTMLElement | undefined;
      const pin = q(".moment-pin")[0] as HTMLElement | undefined;

      gsap.defaults({ ease: MOTION_EASE });

      const heroTl = gsap.timeline({ defaults: { ease: MOTION_EASE } });
      heroTl
        // logo "racks into focus" once on mount (wrapper scale — never touches
        // the brackets' CSS idle loop, so the two layers can't fight)
        .from(".hero-mark", { autoAlpha: 0, scale: 1.05, duration: 0.7, ease: "power2.out" })
        .from(".hero-chip", { autoAlpha: 0, y: 16, duration: 0.65 }, "-=0.42")
        .from(".hero-line", { autoAlpha: 0, yPercent: 112, duration: 1.05, stagger: 0.08 }, "-=0.28")
        .from(".hero-copy", { autoAlpha: 0, y: 18, duration: 0.7 }, "-=0.45")
        .from(".hero-action", { autoAlpha: 0, y: 14, duration: 0.55, stagger: 0.08 }, "-=0.35")
        .from(".hero-cue", { autoAlpha: 0, y: -8, duration: 0.45 }, "-=0.15");

      gsap.to(".cx-video", {
        scale: 1.08,
        yPercent: -3,
        ease: "none",
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
        },
      });

      (q(".cx-reveal") as HTMLElement[]).forEach((section) => {
        gsap.from(section, {
          autoAlpha: 0,
          y: 36,
          duration: 0.9,
          scrollTrigger: {
            trigger: section,
            start: "top 80%",
          },
        });
      });

      const mm = gsap.matchMedia();

      mm.add("(max-width: 1023px)", () => {
        (q(".mobile-story-beat") as HTMLElement[]).forEach((beat) => {
          gsap.from(beat, {
            autoAlpha: 0,
            y: 28,
            duration: 0.8,
            scrollTrigger: {
              trigger: beat,
              start: "top 80%",
            },
          });
        });
      });

      mm.add("(min-width: 1024px)", () => {
        if (!story || !pin) return undefined;

        const storyQ = gsap.utils.selector(story);
        const storyTargets = (selector: string) => storyQ(selector) as HTMLElement[];
        const copies = storyTargets(".story-copy");
        const panels = storyTargets(".story-panel");
        const dots = storyTargets(".story-step-dot");
        const scrim = q(".cx-scrim")[0] as HTMLElement | undefined;
        const video = q(".cx-video")[0] as HTMLElement | undefined;
        const clipTrack = storyTargets(".clip-track")[0];
        const payWire = storyTargets(".pay-wire-track")[0];
        const payDot = storyTargets(".pay-dot")[0];
        const agentType = storyTargets(".agent-type")[0];

        gsap.set([...copies, ...panels], { autoAlpha: 0, y: 34, scale: 0.985 });
        gsap.set(copies[0], { autoAlpha: 1, y: 0, scale: 1 });
        gsap.set(panels[0], { autoAlpha: 1, y: 0, scale: 1 });
        gsap.set(storyTargets(".story-progress-fill"), { scaleY: 0, transformOrigin: "50% 0%" });
        gsap.set(dots, { autoAlpha: 0.42, scale: 0.86 });
        gsap.set(dots[0], { autoAlpha: 1, scale: 1.15 });

        gsap.set(storyTargets(".clip-region"), { xPercent: 12, scaleX: 0.1, transformOrigin: "0% 50%" });
        gsap.set(storyTargets(".clip-bracket-left"), { x: -52, scaleY: 0.45, autoAlpha: 0.35 });
        gsap.set(storyTargets(".clip-bracket-right"), { x: 52, scaleY: 0.45, autoAlpha: 0.35 });
        gsap.set(storyTargets(".clip-playhead"), { x: 0, autoAlpha: 0.9 });
        gsap.set(storyTargets(".clip-moment"), { autoAlpha: 0, y: 28, scale: 0.94 });

        gsap.set(storyTargets(".tag-pill"), { autoAlpha: 0, y: 18, scale: 0.92 });
        gsap.set(storyTargets(".curate-reward"), { autoAlpha: 0, y: 14 });
        gsap.set(storyTargets(".agent-type"), { textContent: "" });
        gsap.set(storyTargets(".agent-connection"), { strokeDasharray: 1, strokeDashoffset: 1, opacity: 0 });
        gsap.set(storyTargets(".agent-result"), { autoAlpha: 0, y: 18, scale: 0.96 });
        gsap.set(storyTargets(".pay-dot"), { autoAlpha: 0, x: 0, y: 0, scale: 0.85 });
        gsap.set(storyTargets(".pay-status-settled"), { autoAlpha: 0, y: 10 });
        gsap.set(storyTargets(".pay-status-required"), { autoAlpha: 1, y: 0 });
        gsap.set(storyTargets(".split-gross"), { autoAlpha: 0, y: 12 });
        gsap.set(storyTargets(".split-bar"), { scaleX: 0, transformOrigin: "0% 50%" });
        gsap.set(storyTargets(".split-seg"), { autoAlpha: 0 });
        gsap.set(storyTargets(".split-recipient"), { autoAlpha: 0, y: 16 });
        gsap.set(storyTargets(".split-bloom"), { autoAlpha: 0, scale: 0.6, transformOrigin: "50% 50%" });
        gsap.set(storyTargets(".split-receipt-chip"), { autoAlpha: 0, y: 10 });
        gsap.set(storyTargets(".split-count"), { textContent: "+0.000" });

        const storyTl = gsap.timeline({
          defaults: { ease: MOTION_EASE },
          scrollTrigger: {
            trigger: story,
            start: "top top",
            end: () => `+=${window.innerHeight * 5.2}`,
            scrub: 0.85,
            pin,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });

        storyTl.to(storyTargets(".story-progress-fill"), { scaleY: 1, duration: 5, ease: "none" }, 0);

        if (video) {
          storyTl.to(video, { scale: 1.14, yPercent: -5, duration: 5, ease: "none" }, 0);
        }

        if (scrim) {
          storyTl
            .to(scrim, { opacity: 0.72, duration: 0.6, ease: "none" }, 0.1)
            .to(scrim, { opacity: 0.82, duration: 0.6, ease: "none" }, 2.9)
            .to(scrim, { opacity: 0.76, duration: 0.7, ease: "none" }, 4.05);
        }

        for (let i = 1; i < BEATS.length; i += 1) {
          storyTl
            .to(copies[i - 1], { autoAlpha: 0, y: -34, scale: 0.982, duration: 0.38 }, i - 0.05)
            .fromTo(
              copies[i],
              { autoAlpha: 0, y: 38, scale: 0.982 },
              { autoAlpha: 1, y: 0, scale: 1, duration: 0.54 },
              i + 0.02,
            )
            .to(panels[i - 1], { autoAlpha: 0, y: -24, scale: 0.97, duration: 0.35 }, i - 0.02)
            .fromTo(
              panels[i],
              { autoAlpha: 0, y: 34, scale: 0.965 },
              { autoAlpha: 1, y: 0, scale: 1, duration: 0.6 },
              i + 0.05,
            )
            .to(dots[i - 1], { autoAlpha: 0.42, scale: 0.86, duration: 0.22 }, i)
            .to(dots[i], { autoAlpha: 1, scale: 1.15, duration: 0.25 }, i);
        }

        storyTl
          .to(storyTargets(".clip-region"), { xPercent: 26, scaleX: 0.44, duration: 0.24, ease: "back.out(2.4)" }, 0.1)
          .to(
            storyTargets(".clip-bracket-left, .clip-bracket-right"),
            { x: 0, scaleY: 1, autoAlpha: 1, duration: 0.18, stagger: 0.025, ease: "back.out(3)" },
            0.14,
          )
          .to(storyTargets(".clip-playhead"), { x: () => (clipTrack?.clientWidth ?? 260) - 3, duration: 0.5, ease: "none" }, 0.33)
          .to(storyTargets(".clip-moment"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.42 }, 0.68)
          .to(storyTargets(".tag-pill"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.34, stagger: 0.06 }, 1.14)
          .to(storyTargets(".curate-reward"), { autoAlpha: 1, y: 0, duration: 0.35 }, 1.48);

        if (agentType) {
          const proxy = { count: 0 };
          storyTl.to(
            proxy,
            {
              count: AGENT_QUERY.length,
              duration: 0.52,
              ease: "none",
              onUpdate: () => {
                agentType.textContent = `"${AGENT_QUERY.slice(0, Math.round(proxy.count))}"`;
              },
            },
            2.16,
          );
        }

        storyTl
          .to(storyTargets(".agent-connection"), { strokeDashoffset: 0, opacity: 1, duration: 0.44, ease: "none" }, 2.34)
          .to(storyTargets(".agent-result"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.38 }, 2.52);

        if (payWire && payDot) {
          storyTl
            .to(payDot, { autoAlpha: 1, scale: 1, duration: 0.08 }, 3.12)
            .to(payDot, { x: () => payWire.clientWidth - 13, y: -8, duration: 0.44, ease: "back.out(1.8)" }, 3.16)
            .to(payDot, { y: 0, scale: 0.78, duration: 0.16, ease: "power2.in" }, 3.58);
        }

        storyTl
          .to(storyTargets(".pay-status-required"), { autoAlpha: 0, y: -10, duration: 0.18 }, 3.52)
          .to(storyTargets(".pay-status-settled"), { autoAlpha: 1, y: 0, duration: 0.26 }, 3.62)
          .fromTo(storyTargets(".pay-amount"), { scale: 0.94 }, { scale: 1.06, duration: 0.18, yoyo: true, repeat: 1 }, 3.62);

        storyTl
          .to(storyTargets(".split-gross"), { autoAlpha: 1, y: 0, duration: 0.3 }, 4.04)
          .to(storyTargets(".split-bar"), { scaleX: 1, duration: 0.5, ease: "power3.out" }, 4.16)
          .to(storyTargets(".split-seg"), { autoAlpha: 1, duration: 0.3, stagger: 0.09 }, 4.42)
          .to(storyTargets(".split-bloom"), { autoAlpha: 0.5, scale: 1.5, duration: 0.22, ease: "power2.out" }, 4.52)
          .to(storyTargets(".split-bloom"), { autoAlpha: 0, scale: 1.95, duration: 0.34, ease: "power2.out" }, 4.68)
          .to(storyTargets(".split-recipient"), { autoAlpha: 1, y: 0, duration: 0.34, stagger: 0.07 }, 4.5);

        const countSpans = storyTargets(".split-count");
        countSpans.forEach((span, index) => {
          const target = Number(span.dataset.micro ?? 0);
          const counter = { value: 0 };
          storyTl.to(
            counter,
            {
              value: target,
              duration: 0.58,
              ease: "power2.out",
              onUpdate: () => {
                span.textContent = `+${usd(counter.value)}`;
              },
            },
            4.58 + index * 0.075,
          );
        });

        storyTl.to(storyTargets(".split-receipt-chip"), { autoAlpha: 1, y: 0, duration: 0.28 }, 4.74);

        return () => {
          storyTl.kill();
        };
      });

      return () => {
        mm.revert();
        heroTl.kill();
      };
    },
    {
      scope: rootRef,
      dependencies: [
        reduceMotion,
        priceMicroUsdc,
        split.creatorMicroUsdc,
        split.finderMicroUsdc,
        split.platformMicroUsdc,
      ],
      revertOnUpdate: true,
    },
  );
}

function LenisGsapBridge({ disabled }: { disabled: boolean }) {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis || disabled) return;

    const update = (time: number) => {
      lenis.raf(time * 1000);
    };

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    ScrollTrigger.refresh();

    return () => {
      gsap.ticker.remove(update);
      lenis.off("scroll", ScrollTrigger.update);
    };
  }, [disabled, lenis]);

  return null;
}

function FixedBackdrop() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <video
        src={VIDEO}
        poster={POSTER}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="cx-video size-full object-cover will-change-transform"
      />
      <div className="cx-scrim absolute inset-0 bg-gradient-to-b from-black/60 via-black/66 to-black/88 opacity-90" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,transparent,rgba(0,0,0,0.6))]" />
      {/* left darkening so the story copy always has contrast over bright frames */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
    </div>
  );
}

function LandingHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-5 py-5 md:px-12">
      <Link
        href="/"
        aria-label="Findling home"
        className="shrink-0 [text-shadow:0_2px_20px_rgba(0,0,0,0.65)]"
      >
        <FindlingLogo
          size="2rem"
          className="hero-mark"
          wordClassName="text-[1.7rem] text-white md:text-[2.15rem]"
        />
      </Link>
      <nav className="flex items-center gap-1">
        <Link
          href="/studio"
          className="hidden rounded-full px-3 py-1.5 text-sm text-white/70 transition-colors hover:text-white sm:inline"
        >
          Studio
        </Link>
        <Link
          href="/wanted"
          className="hidden rounded-full px-3 py-1.5 text-sm text-white/70 transition-colors hover:text-white sm:inline"
        >
          Wanted
        </Link>
        <Link
          href="/agents"
          className="hidden rounded-full px-3 py-1.5 text-sm text-white/70 transition-colors hover:text-white md:inline"
        >
          For agents
        </Link>
        <ConnectWallet />
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-[100dvh] flex-col justify-end px-5 pb-20 md:px-12 md:pb-24">
      <div className="max-w-5xl">
        <div className="hero-chip mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/70 backdrop-blur-md">
          a media marketplace for agents
        </div>
        <h1 className="font-[family-name:var(--font-cx)] text-[3.25rem] font-light leading-[0.96] tracking-tight text-balance sm:text-6xl md:text-[5rem] lg:text-[5.8rem]">
          <span className="block overflow-hidden pb-1">
            <span className="hero-line block will-change-transform">Every video is full of</span>
          </span>
          <span className="block overflow-hidden pb-2">
            <span className="hero-line block will-change-transform">
              <em className="italic font-normal">moments</em> worth paying for.
            </span>
          </span>
        </h1>
        <p className="hero-copy mt-6 max-w-xl text-lg leading-relaxed text-white/75">
          Follow one 8-second snowboard trick as it becomes a hosted clip, gets found by an
          agent, unlocks through x402, and settles into real USDC splits on Arc.
        </p>
        <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Link
            href="/studio"
            className="hero-action inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-foreground px-7 py-3.5 text-sm font-semibold text-background transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0"
          >
            Open Studio <ArrowRight weight="bold" className="size-4" />
          </Link>
          <Link
            href="/agents"
            className="hero-action inline-flex min-h-12 items-center justify-center gap-2 px-2 py-3 text-sm font-medium text-white/70 underline-offset-4 transition-colors duration-300 hover:text-white hover:underline"
          >
            <Path weight="bold" className="size-4" /> Plug in your agent
          </Link>
        </div>
      </div>
      <div className="hero-cue mt-14 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/65">
        <CaretDown weight="bold" className="size-3.5 text-sage" /> follow one moment
      </div>
    </section>
  );
}

function MomentStory({ priceMicroUsdc, split }: { priceMicroUsdc: number; split: Split }) {
  return (
    <>
      <MobileMomentStory priceMicroUsdc={priceMicroUsdc} split={split} />
      <PinnedMomentStory priceMicroUsdc={priceMicroUsdc} split={split} />
    </>
  );
}

function MobileMomentStory({ priceMicroUsdc, split }: { priceMicroUsdc: number; split: Split }) {
  return (
    <section className="mobile-moment-story px-5 py-16 md:px-12 lg:hidden">
      <div className="mx-auto grid max-w-3xl gap-5">
        <div className="mb-1 flex items-center gap-3">
          <span className="h-px w-8 bg-sage/60" />
          <span className="text-xs uppercase tracking-[0.2em] text-white/50">one trick, full flow</span>
        </div>
        {BEATS.map((beat, index) => (
          <article
            key={beat.step}
            className="mobile-story-beat grid min-w-0 gap-5 rounded-[1.25rem] border border-white/10 bg-zinc-950/64 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:p-5 md:p-6"
          >
            <StoryCopy beat={beat} reduced />
            <div className="min-w-0 overflow-hidden rounded-[1rem] border border-white/10 bg-zinc-950/62 p-3 sm:p-4">
              <StoryVisual index={index} priceMicroUsdc={priceMicroUsdc} split={split} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PinnedMomentStory({ priceMicroUsdc, split }: { priceMicroUsdc: number; split: Split }) {
  return (
    <section className="moment-story relative hidden lg:block">
      <div className="moment-pin relative flex min-h-[100dvh] items-center overflow-hidden px-5 py-14 md:px-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="relative">
            <div className="mb-8 hidden items-center gap-3 md:flex">
              <span className="h-px w-10 bg-sage/60" />
              <span className="text-xs uppercase tracking-[0.22em] text-white/50">one trick, full flow</span>
            </div>
            <div className="relative min-h-[23rem]">
              {BEATS.map((beat) => (
                <StoryCopy key={beat.step} beat={beat} />
              ))}
            </div>
            <StoryProgress />
          </div>
          <div className="relative min-h-[34rem] overflow-hidden rounded-[1.5rem] border border-white/10 bg-zinc-950/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md md:min-h-[38rem] md:p-6">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.08),transparent_34%,rgba(255,255,255,0.05)_68%,transparent)] opacity-60" />
            <StoryPanel index={0}>
              <CutTimeline />
            </StoryPanel>
            <StoryPanel index={1}>
              <CurationPanel />
            </StoryPanel>
            <StoryPanel index={2}>
              <AgentDiscovery priceMicroUsdc={priceMicroUsdc} />
            </StoryPanel>
            <StoryPanel index={3}>
              <PaymentPanel priceMicroUsdc={priceMicroUsdc} />
            </StoryPanel>
            <StoryPanel index={4}>
              <DispersePanel priceMicroUsdc={priceMicroUsdc} split={split} />
            </StoryPanel>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReducedMomentStory({ priceMicroUsdc, split }: { priceMicroUsdc: number; split: Split }) {
  return (
    <section className="px-5 py-16 md:px-12">
      <div className="mx-auto grid max-w-7xl gap-6">
        {BEATS.map((beat, index) => (
          <div
            key={beat.step}
            className="grid gap-6 rounded-[1.5rem] border border-white/10 bg-zinc-950/58 p-5 backdrop-blur-md lg:grid-cols-[0.8fr_1.2fr] lg:p-8"
          >
            <StoryCopy beat={beat} reduced />
            <div className="min-h-[20rem] min-w-0 overflow-hidden sm:min-h-[22rem]">
              <StoryVisual index={index} priceMicroUsdc={priceMicroUsdc} split={split} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StoryVisual({ index, priceMicroUsdc, split }: { index: number; priceMicroUsdc: number; split: Split }) {
  if (index === 0) return <CutTimeline />;
  if (index === 1) return <CurationPanel />;
  if (index === 2) return <AgentDiscovery priceMicroUsdc={priceMicroUsdc} />;
  if (index === 3) return <PaymentPanel priceMicroUsdc={priceMicroUsdc} />;
  return <DispersePanel priceMicroUsdc={priceMicroUsdc} split={split} />;
}

function StoryCopy({ beat, reduced }: { beat: BeatContent; reduced?: boolean }) {
  const Icon = beat.Icon;
  return (
    <article className={reduced ? "" : "story-copy absolute inset-0"}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-sage">
          <Icon weight={beat.step === "04" || beat.step === "05" ? "fill" : "duotone"} className="size-5" />
        </span>
        <span className="tabular min-w-0 text-xs uppercase tracking-[0.2em] text-white/50">
          {beat.step} / {beat.kicker}
        </span>
      </div>
      <h2 className="mt-6 max-w-xl font-[family-name:var(--font-cx)] text-3xl font-light leading-[1.05] tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.7)] sm:text-4xl md:text-5xl lg:mt-7 lg:text-6xl">
        {beat.title}
      </h2>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-white/85 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)] sm:text-base md:text-lg lg:mt-5">
        {beat.body}
      </p>
    </article>
  );
}

function StoryProgress() {
  return (
    <div className="mt-6 flex items-center gap-4 md:mt-0">
      <div className="relative h-40 w-px overflow-hidden bg-white/12">
        <span className="story-progress-fill absolute inset-x-0 top-0 block h-full origin-top bg-sage" />
      </div>
      <div className="grid gap-3">
        {BEATS.map((beat) => (
          <div key={beat.step} className="flex items-center gap-2.5">
            <span className="story-step-dot size-2 rounded-full bg-sage" />
            <span className="tabular text-[0.68rem] uppercase tracking-[0.18em] text-white/42">
              {beat.step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoryPanel({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <div className="story-panel absolute inset-4 flex items-center justify-center md:inset-6" data-panel={index}>
      {children}
    </div>
  );
}

function CutTimeline() {
  return (
    <div className="flex h-full w-full flex-col justify-center">
      {/* source monitor — looks like an editor's program preview */}
      <div className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)]">
        <div className="relative h-[11.5rem] w-full sm:h-[13.5rem] md:h-[16rem]">
          <video
            src={VIDEO}
            poster={POSTER}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="size-full object-cover opacity-95"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/20" />
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 font-mono text-[0.62rem] uppercase tracking-wider text-white/85 backdrop-blur">
            <span className="size-1.5 rounded-full bg-[#e0614a]" /> source
          </div>
          <div className="absolute right-3 top-3 rounded-md bg-black/55 px-2 py-1 font-mono text-[0.62rem] tabular-nums text-white/85 backdrop-blur">
            00:00:08:04
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-end justify-between gap-3 font-mono text-[0.68rem] sm:text-xs">
        <div className="min-w-0">
          <p className="uppercase tracking-[0.18em] text-white/42">timeline</p>
          <p className="mt-1 text-white/65">
            in <span className="text-white/85">0:03</span> · out <span className="text-white/85">0:11</span>
          </p>
        </div>
        <p className="flex shrink-0 items-center gap-1.5 text-sage">
          <Scissors weight="bold" className="size-3.5" /> clip / 0:08
        </p>
      </div>

      {/* NLE timeline track — filmstrip of frames with trim handles + playhead */}
      <div className="clip-track relative h-20 overflow-hidden rounded-lg border border-white/12 bg-black/60 sm:h-24">
        {/* filmstrip frames (tiled source) */}
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{ backgroundImage: `url(${POSTER})`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" }}
        />
        <div className="pointer-events-none absolute inset-0 bg-black/35" />
        <div className="pointer-events-none absolute inset-0 flex">
          {Array.from({ length: 12 }).map((_, index) => (
            <span key={index} className="h-full flex-1 border-r border-white/10 last:border-r-0" />
          ))}
        </div>

        {/* selected clip region (GSAP-driven: xPercent/scaleX from 0% 50%) */}
        <div className="clip-region absolute inset-y-0 left-0 w-full border-y-2 border-sage bg-sage/15 shadow-[inset_0_0_0_1px_rgba(110,122,94,0.45)]" />

        {/* trim handles (GSAP-driven: x + scaleY). Positioned via top/height, no translate. */}
        <div className="clip-bracket-left absolute left-[26%] top-3 flex h-14 w-3 origin-center items-center justify-center rounded-l-md bg-sage sm:top-4 sm:h-16 sm:w-3.5">
          <span className="h-6 w-px bg-black/35" />
        </div>
        <div className="clip-bracket-right absolute left-[70%] top-3 flex h-14 w-3 origin-center items-center justify-center rounded-r-md bg-sage sm:top-4 sm:h-16 sm:w-3.5">
          <span className="h-6 w-px bg-black/35" />
        </div>

        {/* playhead (GSAP-driven: x) with a knob */}
        <div className="clip-playhead absolute left-0 top-0 h-full w-0.5 bg-white">
          <span className="absolute -left-[5px] -top-1 size-3 rotate-45 rounded-[2px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
        </div>
      </div>

      {/* time ruler */}
      <div className="mt-1.5 flex justify-between font-mono text-[0.6rem] tabular-nums text-white/35">
        {["0:00", "0:03", "0:06", "0:09", "0:13"].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>

      {/* the hosted moment that lifts out */}
      <div className="clip-moment mt-4 rounded-xl border border-white/10 bg-zinc-950/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-sage">
              <FilmSlate weight="duotone" className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.8rem] font-medium text-white">Snowboard — backside 360</p>
              <p className="mt-0.5 truncate font-mono text-[0.65rem] text-white/44">hosted moment · 8.0s</p>
            </div>
          </div>
          <Scissors weight="bold" className="size-4 shrink-0 text-sage" />
        </div>
      </div>
    </div>
  );
}

function CurationPanel() {
  const tags = ["#snowboard", "#backside-360", "#powder", "#winter-edit", "#sports-recap"];
  return (
    <div className="w-full max-w-xl">
      <div className="rounded-2xl border border-white/10 bg-zinc-950/74 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-sage">
              <Tag weight="duotone" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-white">finder curation</p>
              <p className="truncate font-mono text-xs text-white/42">metadata that agents can understand</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 px-3 py-1 font-mono text-xs text-white/50">
            score 0.91
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="tag-pill rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm text-white/80 backdrop-blur"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="curate-reward mt-4 rounded-2xl border border-white/12 bg-zinc-950/70 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-5">
          <p className="text-sm text-white/60">finder earns when this moment sells</p>
          <p className="tabular font-[family-name:var(--font-cx)] text-3xl font-light text-white sm:text-4xl">12%</p>
        </div>
      </div>
    </div>
  );
}

function AgentDiscovery({ priceMicroUsdc }: { priceMicroUsdc: number }) {
  return (
    <div className="relative w-full max-w-2xl">
      <svg className="pointer-events-none absolute inset-0 hidden h-full w-full md:block" viewBox="0 0 680 360" aria-hidden>
        <path
          className="agent-connection"
          pathLength="1"
          d="M128 112 C250 48 370 54 512 170"
          fill="none"
          stroke="var(--sage)"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
      <div className="relative grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
        <div className="min-w-0 rounded-2xl border border-white/10 bg-zinc-950/78 p-4 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:p-5">
          <div className="flex items-center gap-2 text-xs text-white/48">
            <span className="size-1.5 rounded-full bg-sage" /> agent / MCP search_moments
          </div>
          <p className="mt-4 min-h-20 break-words text-sm leading-relaxed text-white/90">
            <span className="agent-type">&ldquo;{AGENT_QUERY}&rdquo;</span>
            <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-white align-middle" />
          </p>
        </div>
        <div className="agent-result min-w-0 self-end rounded-2xl border border-white/10 bg-zinc-950/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-sage">
              <MagnifyingGlass weight="duotone" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">Snowboard / backside 360</p>
              <p className="truncate font-mono text-xs text-white/45">score 0.91 · 8.0s · winter recap</p>
            </div>
          </div>
          <p className="mt-4 flex items-center justify-end gap-1 font-mono text-sm text-white">
            {usd(priceMicroUsdc)} <UsdcIcon size="0.85em" />
          </p>
        </div>
      </div>
    </div>
  );
}

function PaymentPanel({ priceMicroUsdc }: { priceMicroUsdc: number }) {
  return (
    <div className="w-full max-w-2xl">
      <div className="rounded-2xl border border-white/10 bg-zinc-950/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:p-6">
        <div className="relative flex items-center justify-between">
          <PaymentNode label="agent" />
          <div className="pay-wire-track relative mx-3 h-px min-w-10 flex-1 bg-white/15 sm:mx-4">
            <span className="pay-dot absolute -top-1.5 left-0 size-3 rounded-full bg-gold" />
          </div>
          <PaymentNode label="seller" />
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="relative min-h-10">
            <div className="pay-status-required absolute inset-0">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-white/42">x402 response</p>
              <p className="mt-1 text-lg text-white">402 payment required</p>
            </div>
            <div className="pay-status-settled absolute inset-0 opacity-0">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-white/42">Arc settlement</p>
              <p className="mt-1 text-lg text-white">settled / receipt issued</p>
            </div>
          </div>
          <div className="pay-amount flex items-center justify-end gap-1 rounded-full border border-white/15 bg-zinc-950/70 px-4 py-2 font-mono text-sm font-semibold text-white">
            <span>{usd(priceMicroUsdc)}</span>
            <UsdcIcon size="0.85em" />
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-white/50">
        The funded session key signs the payment policy and the seller receives an issued receipt.
      </p>
    </div>
  );
}

function PaymentNode({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="grid size-11 place-items-center rounded-full border border-white/15 bg-white/10 text-white/80 sm:size-12">
        {label === "agent" ? <Wallet weight="duotone" className="size-5" /> : <Receipt weight="duotone" className="size-5" />}
      </span>
      <span className="text-[0.68rem] uppercase tracking-[0.18em] text-white/45">{label}</span>
    </div>
  );
}

function DispersePanel({ priceMicroUsdc, split }: { priceMicroUsdc: number; split: Split }) {
  const rows = [
    { id: "creator", label: "Creator", pct: 80, micro: split.creatorMicroUsdc, swatch: "bg-white", seg: "bg-white" },
    { id: "finder", label: "Finder", pct: 12, micro: split.finderMicroUsdc, swatch: "bg-white/55", seg: "bg-white/55" },
    { id: "platform", label: "Platform", pct: 8, micro: split.platformMicroUsdc, swatch: "bg-white/30", seg: "bg-white/30" },
  ];

  return (
    <div className="split-stage flex h-full w-full flex-col justify-center">
      <div className="split-gross">
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-white/45">
          gross settled · USDC on Arc
        </p>
        <p className="mt-1 flex items-center gap-2 font-[family-name:var(--font-cx)] text-4xl font-light leading-none text-white sm:text-5xl md:text-6xl">
          <span>{usd(priceMicroUsdc)}</span>
          <UsdcIcon size="0.6em" />
        </p>
      </div>

      <div className="relative mt-7">
        <div className="split-bloom pointer-events-none absolute left-[40%] top-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25 opacity-0 blur-xl" />
        <div className="split-bar relative flex h-3 w-full origin-left gap-1">
          {rows.map((r) => (
            <span key={r.id} className={`split-seg block rounded-full ${r.seg}`} style={{ width: `${r.pct}%` }} />
          ))}
        </div>
        <div className="mt-2 flex font-mono text-[0.58rem] uppercase tracking-[0.12em] text-white/40">
          {rows.map((r) => (
            <span key={r.id} style={{ width: `${r.pct}%` }} className="truncate">
              {r.pct}% {r.label.toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-7 divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md">
        {rows.map((r) => (
          <div key={r.id} className="split-recipient flex items-center justify-between gap-3 px-3 py-3.5 sm:gap-4 sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`size-2.5 shrink-0 rounded-full ${r.swatch}`} />
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{r.label}</p>
                <p className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-white/40">
                  {r.pct}% claim
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 font-mono text-sm font-semibold tabular-nums text-white sm:text-base md:text-lg">
              <span className="split-count" data-micro={r.micro}>
                +{usd(r.micro)}
              </span>
              <UsdcIcon size="0.85em" />
            </div>
          </div>
        ))}
      </div>

      <div className="split-receipt-chip mt-5 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-white/45 backdrop-blur-md">
        <Receipt weight="duotone" className="size-3.5 shrink-0 text-sage" />
        <span>Arc settled</span>
        <span className="h-3 w-px bg-white/15" />
        <span>receipt issued</span>
      </div>
    </div>
  );
}

function Proof({ stats }: { stats: Stats }) {
  return (
    <section className="cx-reveal px-5 py-24 md:px-12">
      <div className="mx-auto max-w-6xl border-y border-white/10 py-12 backdrop-blur-sm md:py-16">
        <p className="text-xs uppercase tracking-[0.18em] text-white/50">live on Arc testnet</p>
        <h2 className="mt-3 max-w-2xl font-[family-name:var(--font-cx)] text-4xl font-light tracking-tight md:text-5xl">
          Real payments. Real splits.
        </h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          <Stat label="moments licensed by agents" value={String(stats.settledCount)} />
          <Stat label="USDC settled on Arc" value={(stats.grossMicroUsdc / 1e6).toFixed(2)} usdc />
          <Stat
            label="paid to creators + finders"
            value={((stats.creatorMicroUsdc + stats.finderMicroUsdc) / 1e6).toFixed(2)}
            usdc
          />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, usdc }: { label: string; value: string; usdc?: boolean }) {
  return (
    <div>
      <p className="tabular flex items-center gap-2 font-[family-name:var(--font-cx)] text-4xl font-light tracking-tight sm:text-5xl">
        <span>{value}</span>
        {usdc && <UsdcIcon size="0.62em" />}
      </p>
      <p className="mt-2 text-sm text-white/60">{label}</p>
    </div>
  );
}

function FooterCTA() {
  return (
    <section className="cx-reveal px-5 pb-28 pt-8 md:px-12">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-2xl font-[family-name:var(--font-cx)] text-4xl font-light leading-tight tracking-tight md:text-6xl">
          Give your agent a wallet and a taste.
        </h2>
        <div className="mt-8">
          <Link
            href="/studio"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-foreground px-7 py-3.5 text-sm font-medium text-background transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0"
          >
            Open Studio <ArrowRight weight="bold" className="size-4" />
          </Link>
        </div>
        <div className="mt-14 border-t border-white/10 pt-8">
          <div className="flex flex-col gap-9 md:flex-row md:items-start md:justify-between">
            <div>
              <FindlingLogo size="1.6rem" wordClassName="text-2xl text-white" />
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/45">
                A video-first marketplace where agents discover moments and pay creators in USDC.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/55">
                <Link href="/studio" className="transition-colors hover:text-white">Studio</Link>
                <Link href="/wanted" className="transition-colors hover:text-white">Wanted</Link>
                <Link href="/agents" className="transition-colors hover:text-white">For agents</Link>
              </div>
            </div>
            <PoweredBy className="md:items-end md:text-right" />
          </div>
          <p className="tabular mt-9 text-xs text-white/35">
            Circle Gateway nanopayments · x402 · Arc testnet
          </p>
        </div>
      </div>
    </section>
  );
}
