"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { EIP1193Provider } from "viem";
import { Wallet, SignOut, CircleNotch, ArrowSquareOut, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type Me = { id: string; address: string | null; displayName: string | null } | null;

const AUTH_ME_TIMEOUT_MS = 8_000;
type WalletLink = { label: string; href: string };

function shorten(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function injected(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  return eth ?? null;
}

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function dappUrlWithoutScheme(url: string): string {
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function mobileWalletLinks(url: string): WalletLink[] {
  return [
    {
      label: "Open in MetaMask",
      href: `https://link.metamask.io/dapp/${dappUrlWithoutScheme(url)}`,
    },
    {
      label: "Open in Trust Wallet",
      href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
    },
  ];
}

/**
 * Sign-In With Ethereum button. Connects the injected browser wallet, signs a
 * SIWE message against a server nonce, and establishes the session cookie. Shows
 * the connected address + sign-out once authenticated.
 */
export function ConnectWallet({
  className,
  initialUser,
}: {
  className?: string;
  /** Server-seeded session user so the button hydrates already-connected — no
   *  flash of a disconnected state on refresh/navigation. Omit on cached pages
   *  (the landing): there it resolves client-side and shows a neutral placeholder
   *  until known, never a false "Connect wallet". */
  initialUser?: Me;
}) {
  // `undefined` = not yet known; `null` = known-logged-out; a user = connected.
  const [me, setMe] = useState<Me | undefined>(initialUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletHelpOpen, setWalletHelpOpen] = useState(false);
  const [walletLinks, setWalletLinks] = useState<WalletLink[]>([]);
  const errorId = useId();
  // Bumped on every sign-in / sign-out. A slow mount revalidation captures the
  // value at fire time and only applies if it hasn't changed since — so a stale
  // /api/auth/me can't overwrite a newer, user-initiated auth state.
  const gen = useRef(0);

  useEffect(() => {
    // Revalidate against the server (covers cross-tab logout + cached pages).
    let alive = true;
    const started = gen.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      AUTH_ME_TIMEOUT_MS,
    );
    fetch("/api/auth/me", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (alive && gen.current === started) setMe(d.user ?? null);
      })
      .catch(() => {
        // Never strand an unseeded button on the placeholder forever.
        if (alive && gen.current === started) setMe((prev) => prev ?? null);
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });
    return () => {
      alive = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const signIn = useCallback(async () => {
    gen.current += 1; // this action supersedes any in-flight revalidation
    setError(null);
    setWalletHelpOpen(false);
    const provider = injected();
    if (!provider) {
      const mobile = isMobileBrowser();
      const message = mobile
        ? "Open Findling in a wallet browser, then connect again."
        : "No wallet found. Install a browser wallet.";
      setError(message);
      setWalletLinks(mobile && typeof window !== "undefined" ? mobileWalletLinks(window.location.href) : []);
      setWalletHelpOpen(true);
      return;
    }
    setBusy(true);
    try {
      // load viem on demand so it stays out of every page's initial bundle
      const [{ createWalletClient, custom }, { createSiweMessage }] =
        await Promise.all([import("viem"), import("viem/siwe")]);
      const client = createWalletClient({ transport: custom(provider) });
      const [address] = await client.requestAddresses();
      const chainId = await client.getChainId();
      const { nonce } = await fetch("/api/auth/nonce").then((r) => r.json());
      const message = createSiweMessage({
        address,
        chainId,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: "1",
        statement: "Sign in to Findling",
      });
      const signature = await client.signMessage({ account: address, message });
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!res.ok) throw new Error("verification failed");
      const me = await fetch("/api/auth/me").then((r) => r.json());
      setMe(me.user ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign-in failed");
      setWalletHelpOpen(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    gen.current += 1; // supersede any in-flight revalidation
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setMe(null);
    } finally {
      setBusy(false);
    }
  }, []);

  if (me === undefined) {
    // Unknown — a neutral pill matching the button's footprint (no layout shift,
    // no false disconnected flash) until the session resolves.
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs",
          className,
        )}
      >
        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/40" />
        <span className="h-3 w-16 animate-pulse rounded bg-muted-foreground/20" />
      </span>
    );
  }

  if (me?.address) {
    return (
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        title={`${me.address}: sign out`}
        className={cn(
          "tabular inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/60",
          className,
        )}
      >
        <span className="size-1.5 rounded-full bg-sage" />
        {shorten(me.address)}
        <SignOut weight="bold" className="size-3.5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        title={error ?? "Sign in with your wallet"}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60",
          className,
        )}
      >
        {busy ? (
          <CircleNotch weight="bold" className="size-3.5 animate-spin" />
        ) : (
          <Wallet weight="fill" className="size-3.5" />
        )}
        {busy ? "Signing..." : "Connect wallet"}
      </button>
      <span id={errorId} role="alert" aria-live="assertive" className="sr-only">
        {error ?? ""}
      </span>
      {walletHelpOpen && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Wallet connection help"
          className="fixed inset-x-4 bottom-4 z-[80] mx-auto max-w-sm rounded-2xl border border-border bg-card p-4 text-foreground shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Wallet needed</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error ?? "Open this page in a wallet browser, then connect again."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWalletHelpOpen(false)}
              aria-label="Close wallet help"
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X weight="bold" className="size-4" />
            </button>
          </div>
          {walletLinks.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {walletLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
                >
                  {link.label}
                  <ArrowSquareOut weight="bold" className="size-4" />
                </a>
              ))}
            </div>
          ) : (
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              Install MetaMask
              <ArrowSquareOut weight="bold" className="size-4" />
            </a>
          )}
        </div>
      )}
    </>
  );
}
