"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLineDown,
  CircleNotch,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { UsdcAmount } from "@/components/brand/usdc";

type Status =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done"; amountMicroUsdc: number; txHash: string | null }
  | { kind: "error"; message: string };

const ERRORS: Record<string, string> = {
  nothing_to_withdraw: "Nothing to withdraw yet.",
  no_payout_wallet_registered: "No payout wallet on file for this account.",
  user_not_found: "Account not found.",
};

/**
 * Withdraw CTA — pulls a role's accrued balance to the user's registered payout
 * wallet via POST /api/earnings/withdraw. The withdrawing identity and recipient
 * are derived server-side from the session/key — this sends only { role }.
 */
export function WithdrawButton({
  role,
  withdrawableMicroUsdc,
  hasPayoutWallet,
  label,
}: {
  role: "creator" | "finder";
  withdrawableMicroUsdc: number;
  hasPayoutWallet: boolean;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const disabled =
    withdrawableMicroUsdc <= 0 ||
    !hasPayoutWallet ||
    status.kind === "pending" ||
    isPending;

  async function withdraw() {
    setStatus({ kind: "pending" });
    try {
      const res = await fetch("/api/earnings/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        amountMicroUsdc?: number;
        transactionHash?: string | null;
      };
      if (!res.ok) {
        setStatus({
          kind: "error",
          message: ERRORS[data.error ?? ""] ?? data.error ?? "Withdrawal failed.",
        });
        return;
      }
      setStatus({
        kind: "done",
        amountMicroUsdc: data.amountMicroUsdc ?? withdrawableMicroUsdc,
        txHash: data.transactionHash ?? null,
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Network error.",
      });
    }
  }

  if (status.kind === "done") {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-sage">
          <CheckCircle weight="fill" className="size-4" />
          Withdrawing{" "}
          <UsdcAmount
            micro={status.amountMicroUsdc}
            className="tabular gap-0.5 text-foreground"
          />
        </span>
        {status.txHash ? (
          <span className="tabular break-all text-[0.7rem] text-muted-foreground">
            tx {status.txHash.slice(0, 14)}…
          </span>
        ) : (
          <span className="text-[0.7rem] text-muted-foreground">
            Settling to your payout wallet on Arc.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <button
        type="button"
        onClick={withdraw}
        disabled={disabled}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-gold px-4 py-2.5 text-sm font-semibold text-gold-foreground transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:py-2"
      >
        {status.kind === "pending" ? (
          <CircleNotch weight="bold" className="size-4 animate-spin" />
        ) : (
          <ArrowLineDown weight="bold" className="size-4" />
        )}
        {label}
      </button>
      {status.kind === "error" && (
        <span className="inline-flex items-center gap-1 text-[0.7rem] text-destructive">
          <WarningCircle weight="fill" className="size-3.5" />
          {status.message}
        </span>
      )}
      {!hasPayoutWallet && status.kind !== "error" && (
        <span className="text-[0.7rem] text-muted-foreground">
          Connect a payout wallet to withdraw.
        </span>
      )}
    </div>
  );
}
