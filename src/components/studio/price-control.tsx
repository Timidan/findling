"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PencilSimple, Check, X } from "@phosphor-icons/react";
import { UsdcIcon } from "@/components/brand/usdc";
import { formatMicroUsdc } from "@/lib/format";

const MIN_MICRO = 1_000; // $0.001
const MAX_MICRO = 100_000_000; // $100

/**
 * Inline per-moment price editor for the owner. Collapsed it shows the price as a
 * pencil-on-hover affordance; expanded it takes a USD amount, converts to integer
 * micro-USDC, PATCHes the moment, and refreshes. Owner-only — render only when the
 * viewer owns the moment.
 */
export function PriceControl({
  momentId,
  initialMicro,
}: {
  momentId: string;
  initialMicro: number;
}) {
  const router = useRouter();
  const [micro, setMicro] = useState(initialMicro);
  const [editing, setEditing] = useState(false);
  const [usd, setUsd] = useState(String(initialMicro / 1_000_000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const v = Number(usd);
    if (!Number.isFinite(v) || v <= 0) {
      setError("Enter a price.");
      return;
    }
    const m = Math.round(v * 1_000_000);
    if (m < MIN_MICRO || m > MAX_MICRO) {
      setError("Price must be $0.001 to $100.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/creator/moments/${momentId}/price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceMicroUsdc: m }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          d?.error === "unauthenticated"
            ? "Sign in again to set a price."
            : "Couldn't update the price.",
        );
        return;
      }
      setMicro(m);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setUsd(String(micro / 1_000_000));
          setError(null);
          setEditing(true);
        }}
        aria-label="Edit price"
        className="group inline-flex items-center gap-1.5"
      >
        <span className="tabular inline-flex items-center gap-1 text-sm font-semibold text-foreground">
          {formatMicroUsdc(micro)}
          <UsdcIcon size="0.8em" />
        </span>
        <PencilSimple
          weight="bold"
          className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        />
      </button>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <label htmlFor={`price-${momentId}`} className="sr-only">
          Price in USD
        </label>
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background px-2 py-1 focus-within:border-sage">
          <span className="text-xs text-muted-foreground">$</span>
          <input
            id={`price-${momentId}`}
            name="price"
            autoFocus
            inputMode="decimal"
            autoComplete="off"
            value={usd}
            onChange={(e) => setUsd(e.target.value.replace(/[^0-9.]/g, ""))}
            aria-invalid={error ? true : undefined}
            className="tabular w-14 bg-transparent text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          aria-label="Save price"
          className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
        >
          <Check weight="bold" className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancel"
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X weight="bold" className="size-3.5" />
        </button>
      </div>
      {error && (
        <span role="alert" className="text-[0.65rem] text-destructive">
          {error}
        </span>
      )}
    </form>
  );
}
