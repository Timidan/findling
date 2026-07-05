import Link from "next/link";
import { cn } from "@/lib/utils";
import { FindlingMark } from "@/components/brand/logo";

/**
 * Shared site footer. Quiet, structural — sage mark, ink wordmark, the one-line
 * product claim, and the network it settles on. Amber is reserved for money, so
 * nothing here is gold.
 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-border/70", className)}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <FindlingMark size="1.1rem" className="text-sage" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Findling</span>: video clips
            people and agents can pay to use.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground">
          <Link href="/studio" className="transition-colors hover:text-foreground">
            Studio
          </Link>
          <Link href="/wanted" className="transition-colors hover:text-foreground">
            Requests
          </Link>
          <Link href="/earnings" className="transition-colors hover:text-foreground">
            Earnings
          </Link>
          <span className="tabular text-[0.7rem] uppercase tracking-[0.16em]">
            USDC · Arc
          </span>
        </div>
      </div>
    </footer>
  );
}
