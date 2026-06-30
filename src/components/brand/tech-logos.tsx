import { cn } from "@/lib/utils";
import { UsdcIcon } from "./usdc";

/**
 * Infrastructure credit marks for the footer "Built on" strip. The USDC coin is
 * the real Circle token glyph; the Circle / Arc marks are clean monochrome
 * lockups in currentColor so they sit on any surface. (Swap in the official
 * brand SVGs here if/when vendored — the lockup API stays the same.)
 */

function CircleMark({ className }: { className?: string }) {
  // ring + core — Circle's stablecoin infrastructure
  return (
    <svg viewBox="0 0 24 24" className={cn("size-[1.15em]", className)} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.4" fill="currentColor" />
    </svg>
  );
}

function ArcMark({ className }: { className?: string }) {
  // a swept arc — the Arc network
  return (
    <svg viewBox="0 0 24 24" className={cn("size-[1.15em]", className)} fill="none" aria-hidden>
      <path
        d="M3.5 18.5 A 9.5 9.5 0 0 1 20.5 18.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="6.2" r="1.7" fill="currentColor" />
    </svg>
  );
}

function Lockup({
  mark,
  name,
  href,
}: {
  mark: React.ReactNode;
  name: React.ReactNode;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-white/65 transition-colors hover:text-white"
    >
      {mark}
      <span className="text-sm font-medium tracking-tight">{name}</span>
    </a>
  );
}

/** "Built on" infrastructure strip for the landing footer. */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      <p className="text-[0.7rem] uppercase tracking-[0.18em] text-white/40">Built on</p>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
        <Lockup href="https://www.circle.com" mark={<CircleMark />} name="Circle" />
        <Lockup href="https://www.arc.network" mark={<ArcMark />} name="Arc" />
        <a
          href="https://www.x402.org"
          target="_blank"
          rel="noreferrer"
          className="font-mono text-sm tracking-tight text-white/65 transition-colors hover:text-white"
        >
          x402
        </a>
        <Lockup href="https://www.circle.com/usdc" mark={<UsdcIcon size="1.15em" />} name="USDC" />
      </div>
    </div>
  );
}
