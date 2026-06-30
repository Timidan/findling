"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle, PencilSimple, X } from "@phosphor-icons/react";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Set or change the on-chain payout wallet (where withdrawn USDC settles).
 * Collapsed it shows the current address as a pill with a Change affordance;
 * expanded it offers a free-form input plus a one-tap "Use my login wallet".
 * POSTs to /api/auth/payout-wallet and reloads so the new value propagates.
 */
export function PayoutWalletControl({
  initial,
  loginAddress,
}: {
  initial: string | null;
  loginAddress: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? loginAddress ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(address: string) {
    setError(null);
    if (!ADDR_RE.test(address)) {
      setError("Enter a valid 0x… address (40 hex characters).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/payout-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(
          d?.error === "unauthenticated"
            ? "Sign in again to update your payout wallet."
            : "That address looks off — double-check it.",
        );
        return;
      }
      window.location.reload();
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        {initial ? (
          <span className="tabular inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium">
            <CheckCircle weight="fill" className="size-3.5 text-sage" />
            {short(initial)}
          </span>
        ) : (
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            Not set
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setValue(initial ?? loginAddress ?? "");
            setError(null);
            setEditing(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary active:scale-[0.98]"
        >
          <PencilSimple weight="bold" className="size-3.5" />
          {initial ? "Change" : "Set"}
        </button>
      </div>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void save(value.trim());
  }

  const canUseLogin = loginAddress && loginAddress !== initial;

  return (
    <form onSubmit={submit} className="flex w-full flex-col items-stretch gap-2 sm:w-72">
      <label htmlFor="payout-address" className="sr-only">
        Payout wallet address
      </label>
      <div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 focus-within:border-sage">
        <input
          id="payout-address"
          name="payout-address"
          autoComplete="off"
          inputMode="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.trim())}
          placeholder="0x…"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "payout-error" : undefined}
          className="tabular w-full bg-transparent text-xs outline-none"
        />
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancel"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X weight="bold" className="size-3.5" />
        </button>
      </div>
      {canUseLogin && (
        <button
          type="button"
          onClick={() => save(loginAddress!)}
          disabled={busy}
          className="text-left text-xs text-sage underline-offset-4 hover:underline disabled:opacity-60"
        >
          Use my login wallet ({short(loginAddress!)})
        </button>
      )}
      {error && (
        <p id="payout-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save payout wallet"}
      </button>
    </form>
  );
}
