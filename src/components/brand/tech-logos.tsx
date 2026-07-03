import { cn } from "@/lib/utils";
import { UsdcIcon } from "./usdc";

/**
 * Infrastructure credit marks for the footer "Built on" strip. The SVG assets
 * are rendered as monochrome CSS masks so they inherit currentColor and sit
 * cleanly on the dark surface.
 */

function BrandMark({
  src,
  label,
  ratio,
  heightEm = 1.1,
  className,
}: {
  src: string;
  /** accessible name */
  label: string;
  /** intrinsic width / height, so the mask box keeps the logo's aspect ratio */
  ratio: number;
  /** mark height, in em relative to the surrounding text */
  heightEm?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-block shrink-0", className)}
      style={{
        height: `${heightEm}em`,
        width: `${(heightEm * ratio).toFixed(3)}em`,
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

function Lockup({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-white/65 transition-colors hover:text-white"
    >
      {children}
    </a>
  );
}

/** The official x402 wordmark alone, mono via currentColor - reusable inline
 *  (e.g. a "Powered by x402 payments" chip). Set text color on it to tint. */
export function X402Mark({
  heightEm,
  className,
}: {
  heightEm?: number;
  className?: string;
}) {
  return (
    <BrandMark
      src="/brand/x402.svg"
      label="x402"
      ratio={2.595}
      heightEm={heightEm}
      className={className}
    />
  );
}

/** The official Arc wordmark, mono via currentColor - reusable inline. */
export function ArcMark({
  heightEm,
  className,
}: {
  heightEm?: number;
  className?: string;
}) {
  return (
    <BrandMark
      src="/brand/arc.svg"
      label="Arc"
      ratio={2.92}
      heightEm={heightEm}
      className={className}
    />
  );
}

/** "Built on" infrastructure strip for the landing footer. */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      <p className="text-[0.7rem] uppercase tracking-[0.18em] text-white/40">Built on</p>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4 text-sm">
        <Lockup href="https://www.circle.com">
          <BrandMark src="/brand/circle.svg" label="Circle" ratio={1} />
          <span className="font-medium tracking-tight">Circle</span>
        </Lockup>
        <Lockup href="https://arc.network">
          <BrandMark src="/brand/arc-icon.svg" label="Arc" ratio={0.969} />
          <span className="font-medium tracking-tight">Arc</span>
        </Lockup>
        {/* The official x402 mark is a self-contained wordmark, so it stands alone. */}
        <Lockup href="https://www.x402.org">
          <BrandMark src="/brand/x402.svg" label="x402" ratio={2.595} />
        </Lockup>
        <Lockup href="https://www.circle.com/usdc">
          <UsdcIcon size="1.15em" />
          <span className="font-medium tracking-tight">USDC</span>
        </Lockup>
      </div>
    </div>
  );
}
