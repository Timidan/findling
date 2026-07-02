"use client";

import { useEffect } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

/**
 * PROTOTYPE-ONLY floating variant switcher. Fixed bottom-centre pill with
 * prev/next arrows + the current variant label. Cycles with the arrow keys
 * (ignored while typing). Hidden in production builds so a stray merge can't
 * ship it. Throwaway — delete with the rest of /prototype/clip-timeline once a
 * winner is folded into CutTimeline.
 */
export function PrototypeSwitcher({
  keys,
  labels,
  current,
  onChange,
}: {
  keys: string[];
  labels: Record<string, string>;
  current: string;
  onChange: (next: string) => void;
}) {
  const index = Math.max(0, keys.indexOf(current));
  const go = (delta: number) => {
    const next = keys[(index + delta + keys.length) % keys.length];
    onChange(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (typing) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, keys]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-full border border-white/15 bg-black/85 px-1.5 py-1.5 text-white shadow-[0_10px_40px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous variant"
          className="grid size-9 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          <CaretLeft weight="bold" className="size-4" />
        </button>
        <div className="flex min-w-[15rem] items-center justify-center gap-2 px-2 text-center">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sage/20 font-mono text-xs font-semibold text-sage">
            {current}
          </span>
          <span className="truncate text-sm font-medium">
            {labels[current] ?? current}
          </span>
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next variant"
          className="grid size-9 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          <CaretRight weight="bold" className="size-4" />
        </button>
      </div>
    </div>
  );
}
