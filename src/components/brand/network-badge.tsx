import { cn } from "@/lib/utils";
import { ARC_NETWORK_LABEL } from "@/lib/explorer";

/**
 * Names the settlement network explicitly so the on-chain claim is falsifiable:
 * a user can see WHICH chain + asset and go check it. Static (no client JS) — a
 * live-green dot, the network label, and the asset ticker (USDC is Arc's native
 * currency, so "Arc Testnet · USDC" is literally the value being moved).
 */
export function NetworkBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      <span className="relative grid place-items-center">
        <span className="size-1.5 rounded-full bg-sage" />
        <span className="absolute size-1.5 animate-ping rounded-full bg-sage/70" />
      </span>
      {ARC_NETWORK_LABEL} · USDC
    </span>
  );
}
