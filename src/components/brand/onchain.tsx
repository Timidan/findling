"use client";

import { useState } from "react";
import { ArrowSquareOut, Copy, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { arcTxUrl, arcAddressUrl, shortHex } from "@/lib/explorer";

/**
 * On-chain proof primitives — the affordances that turn a number-in-a-database
 * into something a skeptical user can VERIFY. A tx hash / wallet address is shown
 * as a monospace, middle-truncated value that (a) deep-links to the Arc testnet
 * explorer in a new tab and (b) copies the full value to the clipboard. Used
 * anywhere money actually moved on-chain (withdrawals, payout wallets).
 */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard blocked — the explorer link is still the primary proof */
        }
      }}
      className="grid size-4 shrink-0 place-items-center text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? (
        <Check weight="bold" className="size-3 text-sage" />
      ) : (
        <Copy weight="bold" className="size-3" />
      )}
    </button>
  );
}

/** A transaction hash that links to the Arc explorer + copies the full hash. */
export function TxLink({
  hash,
  className,
  label = "tx",
}: {
  hash: string;
  className?: string;
  label?: string;
}) {
  return (
    <span className={cn("tabular inline-flex items-center gap-1", className)}>
      <a
        href={arcTxUrl(hash)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        {label} {shortHex(hash)}
        <ArrowSquareOut weight="bold" aria-hidden className="size-3" />
      </a>
      <CopyButton value={hash} label="Copy transaction hash" />
    </span>
  );
}

/** A wallet address that links to its Arc explorer page + copies the full address. */
export function AddressLink({
  address,
  className,
  prefix,
}: {
  address: string;
  className?: string;
  prefix?: string;
}) {
  return (
    <span className={cn("tabular inline-flex items-center gap-1", className)}>
      <a
        href={arcAddressUrl(address)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        {prefix ? `${prefix} ` : ""}
        {shortHex(address)}
        <ArrowSquareOut weight="bold" aria-hidden className="size-3" />
      </a>
      <CopyButton value={address} label="Copy wallet address" />
    </span>
  );
}
