"use client";

import { useState } from "react";
import {
  CircleNotch,
  SealCheck,
  DownloadSimple,
  Coins,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import {
  createWalletClient,
  custom,
  getAddress,
  type Address,
  type EIP1193Provider,
} from "viem";
import { arcTestnet } from "viem/chains";
import { ConnectWallet, type Me } from "@/components/auth/connect-wallet";
import { UsdcAmount } from "@/components/brand/usdc";
import {
  purchaseMomentLicense,
  depositGatewayUsdc,
  type UnlockResponse,
} from "@/lib/x402-browser";

interface Moment {
  id: string;
  title: string;
  priceMicroUsdc: number;
  priceUsd: string;
  usageType: string;
  licence: string;
}

function injected(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null;
}

async function getWallet(): Promise<{
  walletClient: ReturnType<typeof createWalletClient>;
  account: Address;
}> {
  const eth = injected();
  if (!eth) throw new Error("No browser wallet found — install one to license.");
  const accounts = (await eth.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts?.[0]) throw new Error("No wallet account available.");
  const account = getAddress(accounts[0]);
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: custom(eth),
  });
  return { walletClient, account };
}

function msg(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/user rejected|denied|rejected the request/i.test(raw)) return "You cancelled the wallet request.";
  if (/insufficient|exceeds balance|over_remaining_cap|payment_not_settled/i.test(raw))
    return "Your Gateway USDC balance looks too low. Use “Set up licensing” to fund it, then try again.";
  return raw.length > 160 ? raw.slice(0, 160) + "…" : raw;
}

export function LicenseCheckout({
  moment,
  initialUser,
}: {
  moment: Moment;
  initialUser: Me;
}) {
  const [busy, setBusy] = useState<null | "fund" | "license">(null);
  const [error, setError] = useState<string | null>(null);
  const [funded, setFunded] = useState(false);
  const [result, setResult] = useState<UnlockResponse | null>(null);

  async function fund() {
    setBusy("fund");
    setError(null);
    try {
      const { walletClient, account } = await getWallet();
      await depositGatewayUsdc({ walletClient, account, amountUsdc: "0.50" });
      setFunded(true);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  }

  async function license() {
    setBusy("license");
    setError(null);
    try {
      const { walletClient, account } = await getWallet();
      // 1. A fresh fund-once buyer grant, capped to exactly this purchase.
      const grantRes = await fetch("/api/agent/session-grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionKeyAddress: account,
          totalCapMicroUsdc: moment.priceMicroUsdc,
        }),
      });
      if (!grantRes.ok) {
        setError(
          grantRes.status === 401
            ? "Connect your wallet above first, then license."
            : "Couldn't set up the purchase. Try again.",
        );
        return;
      }
      const { grant } = (await grantRes.json()) as { grant: { id: string } };
      // 2. Pay the x402 unlock with the injected wallet as the session key.
      const unlock = await purchaseMomentLicense({
        momentId: moment.id,
        grantId: grant.id,
        walletClient,
        account,
        baseUrl: window.location.origin,
      });
      setResult(unlock);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  }

  // ── licensed ───────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="rounded-2xl border border-sage/30 bg-sage/5 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-sage">
          <SealCheck weight="fill" className="size-4" /> Licensed
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          You licensed “{moment.title}”. Your full-quality file is ready (link valid ~5 min).
        </p>
        <a
          href={result.unlockUrl}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          <DownloadSimple weight="bold" className="size-4" /> Download licensed clip
        </a>
        <dl className="mt-4 space-y-1.5 text-xs text-muted-foreground">
          {result.receiptCode && (
            <div className="flex justify-between gap-2">
              <dt>Receipt</dt>
              <dd className="tabular font-medium text-foreground">{result.receiptCode}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt>Creator (80%)</dt>
            <dd><UsdcAmount micro={result.split.creatorMicroUsdc} className="tabular gap-0.5 text-foreground" /></dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Finder (12%)</dt>
            <dd><UsdcAmount micro={result.split.finderMicroUsdc} className="tabular gap-0.5 text-foreground" /></dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Platform (8%)</dt>
            <dd><UsdcAmount micro={result.split.platformMicroUsdc} className="tabular gap-0.5 text-foreground" /></dd>
          </div>
        </dl>
      </div>
    );
  }

  // ── checkout ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
            License price
          </p>
          <UsdcAmount
            micro={moment.priceMicroUsdc}
            className="tabular gap-0.5 font-display text-3xl tracking-tight"
          />
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[0.65rem] text-muted-foreground">
          <ShieldCheck weight="fill" className="size-3 text-sage" />
          {moment.licence}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {moment.usageType.replace(/_/g, " ")} license · paid in USDC on Arc · 80% to the creator
      </p>

      <div className="mt-4">
        <ConnectWallet initialUser={initialUser} className="w-full justify-center" />
      </div>

      <button
        type="button"
        onClick={license}
        disabled={busy !== null}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {busy === "license" && <CircleNotch weight="bold" className="size-4 animate-spin" />}
        {busy === "license" ? "Confirming in wallet…" : "License this moment"}
      </button>

      <button
        type="button"
        onClick={fund}
        disabled={busy !== null}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {busy === "fund" ? (
          <CircleNotch weight="bold" className="size-3.5 animate-spin" />
        ) : (
          <Coins weight="bold" className="size-3.5 text-sage" />
        )}
        {funded ? "Gateway funded ✓ — add more" : "Set up licensing (fund Gateway, one-time)"}
      </button>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      <p className="mt-4 text-[0.7rem] leading-relaxed text-muted-foreground">
        First time? Tap <span className="font-medium text-foreground">Set up licensing</span> to
        deposit USDC into Circle Gateway once — then license any moment in a tap. Your wallet signs
        each payment directly; Findling never holds your funds.
      </p>
    </div>
  );
}
