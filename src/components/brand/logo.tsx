import { cn } from "@/lib/utils";

/**
 * Findling logo — the "Bracket" mark: two film-frame corner brackets framing a
 * play triangle (the selected clip / the moment held inside the frame). Draws
 * with currentColor so it inherits ink-on-cream and light-on-dark.
 */
export function FindlingMark({
  className,
  size = "1em",
  title,
}: {
  className?: string;
  size?: number | string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5 H5 V11" className="mark-bracket" />
      <path d="M21 27 H27 V21" className="mark-bracket" />
      <path
        d="M13 11 L23 16 L13 21 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        className="mark-play"
      />
    </svg>
  );
}

/** Mark + "Findling" wordmark lockup. Mark in sage, wordmark in current text color. */
export function FindlingLogo({
  className,
  size = "1.15rem",
  markClassName,
  wordClassName,
}: {
  className?: string;
  size?: number | string;
  markClassName?: string;
  wordClassName?: string;
}) {
  return (
    <span className={cn("mark-lockup inline-flex items-center gap-2", className)}>
      <FindlingMark size={size} className={cn("text-sage", markClassName)} />
      <span className={cn("font-display leading-none tracking-tight", wordClassName)}>
        Findling
      </span>
    </span>
  );
}
