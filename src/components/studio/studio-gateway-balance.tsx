"use client";

import { useEffect, useState } from "react";
import { ArrowClockwise, CircleNotch, Coins } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type BalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; balance: string }
  | { status: "error" };

function cleanUsdc(value: string): string {
  if (!/^\d+(\.\d+)?$/.test(value)) return "0";
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

async function fetchGatewayBalance(address: string): Promise<string> {
  const res = await fetch(
    `/api/payments/gateway/balances?address=${encodeURIComponent(address)}`,
    { credentials: "same-origin" },
  );
  const body = (await res.json()) as { formattedAvailable?: string };
  if (!res.ok || !body.formattedAvailable) {
    throw new Error("gateway_balance_unavailable");
  }
  return cleanUsdc(body.formattedAvailable);
}

export function StudioGatewayBalance({
  address,
  compact = false,
  className,
}: {
  address?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<BalanceState>(() =>
    address ? { status: "loading" } : { status: "idle" },
  );
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.resolve();
      if (!alive) return;
      if (!address) {
        setState({ status: "idle" });
        return;
      }
      setState({ status: "loading" });
      try {
        const balance = await fetchGatewayBalance(address);
        if (alive) setState({ status: "ready", balance });
      } catch {
        if (alive) setState({ status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [address, refresh]);

  if (!address) return null;

  const isLoading = state.status === "loading";
  const label =
    state.status === "ready"
      ? `${state.balance} USDC`
      : state.status === "error"
        ? "Check balance"
        : "Loading";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-background/55 px-2.5 py-2",
        compact && "rounded-full px-2 py-1",
        className,
      )}
      aria-label="Gateway balance"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-sage/15">
          {isLoading ? (
            <CircleNotch weight="bold" className="size-3 animate-spin text-sage" />
          ) : (
            <Coins weight="fill" className="size-3 text-sage" />
          )}
        </span>
        <div className="min-w-0">
          {!compact && (
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground">
              Gateway
            </p>
          )}
          <p className="truncate text-xs font-medium tabular text-foreground">{label}</p>
        </div>
      </div>
      {state.status === "error" && (
        <button
          type="button"
          onClick={() => setRefresh((n) => n + 1)}
          className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Refresh Gateway balance"
        >
          <ArrowClockwise weight="bold" className="size-3.5" />
        </button>
      )}
    </div>
  );
}
