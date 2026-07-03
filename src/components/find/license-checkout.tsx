"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise,
  ArrowSquareOut,
  CircleNotch,
  SealCheck,
  DownloadSimple,
  Coins,
  ShieldCheck,
  WarningCircle,
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
  getGatewayPaymentReadiness,
  formatMicroUsdcBalance,
  microUsdcToDecimal,
  type GatewayReadiness,
  type UnlockResponse,
} from "@/lib/x402-browser";

const ARC_TESTNET_USDC_FAUCET_URL = "https://faucet.circle.com/";

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
  if (!eth) {
    throw new Error(
      "No browser wallet found. Open this page inside your wallet app, or enable a wallet extension.",
    );
  }
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

async function getConnectedWallet(): Promise<WalletReady> {
  const eth = injected();
  if (!eth) {
    throw new Error(
      "No browser wallet found. Open this page inside your wallet app, or enable a wallet extension.",
    );
  }
  const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
  if (!accounts?.[0]) {
    throw new Error("Open your wallet and connect it to Findling.");
  }
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
  if (/insufficient|exceeds balance|over_remaining_cap|payment_not_settled/i.test(raw)) {
    return "Payment setup changed. Check your USDC balance, then try again.";
  }
  return raw.length > 160 ? raw.slice(0, 160) + "..." : raw;
}

type WalletReady = Awaited<ReturnType<typeof getWallet>>;
type PaymentSetup =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "wrong_network" }
  | { state: "wallet_unavailable"; message: string }
  | { state: "error"; message: string }
  | { state: GatewayReadiness["status"]; readiness: GatewayReadiness };

function setupFromReadiness(readiness: GatewayReadiness): PaymentSetup {
  return { state: readiness.status, readiness };
}

async function inspectPaymentSetup(input: {
  requiredMicroUsdc: number;
  promptWallet?: boolean;
}): Promise<{ setup: PaymentSetup; wallet?: WalletReady; readiness?: GatewayReadiness }> {
  try {
    const wallet = input.promptWallet ? await getWallet() : await getConnectedWallet();
    const chainId = await wallet.walletClient.getChainId();
    if (chainId !== arcTestnet.id) {
      return { setup: { state: "wrong_network" }, wallet };
    }
    const readiness = await getGatewayPaymentReadiness({
      account: wallet.account,
      requiredMicroUsdc: input.requiredMicroUsdc,
    });
    return { setup: setupFromReadiness(readiness), wallet, readiness };
  } catch (e) {
    const message = msg(e);
    const setup: PaymentSetup =
      /No browser wallet|No wallet account|connect it to Findling|Open this page/i.test(
        message,
      )
        ? { state: "wallet_unavailable", message }
        : { state: "error", message };
    return { setup };
  }
}

function setupCopy(setup: PaymentSetup): { title: string; body: string } {
  if (setup.state === "checking") {
    return {
      title: "Checking payment setup",
      body: "We are checking your network, Gateway balance, and wallet USDC before payment.",
    };
  }
  if (setup.state === "wrong_network") {
    return {
      title: "Switch network first",
      body: "Payments settle on Arc Testnet. Switch once, then we will check your balance again.",
    };
  }
  if (setup.state === "wallet_unavailable") {
    return {
      title: "Wallet access needed",
      body: setup.message,
    };
  }
  if (setup.state === "error") {
    return {
      title: "Could not check payment setup",
      body: setup.message,
    };
  }
  if (setup.state === "ready") {
    return {
      title: "Ready to pay",
      body: "Gateway has enough USDC for this clip. Your wallet only needs to sign the payment.",
    };
  }
  if (setup.state === "needs_gateway_funding") {
    return {
      title: "Add USDC before paying",
      body: setup.readiness.allowanceNeeded
        ? "Your wallet may ask for approval once, then a deposit. After that, we continue to payment."
        : "One wallet transaction adds the missing USDC. After that, we continue to payment.",
    };
  }
  if (setup.state === "needs_wallet_usdc") {
    return {
      title: "Add USDC to your wallet",
      body: "Your wallet needs more Arc Testnet USDC before it can add funds for this clip.",
    };
  }
  return {
    title: "Payment setup",
    body: "Connect your wallet to check whether you can pay for this clip.",
  };
}

export function LicenseCheckout({
  moment,
  initialUser,
}: {
  moment: Moment;
  initialUser: Me;
}) {
  const [busy, setBusy] = useState<null | "setup" | "fund" | "license">(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UnlockResponse | null>(null);
  // Auth state, seeded from the server and kept in sync by the ConnectWallet
  // button below (its onAuthChange). This drives ONE state-aware CTA instead of
  // three competing full-width buttons: connect first, then pay.
  const [me, setMe] = useState<Me | undefined>(initialUser);
  const signedIn = !!me?.address;
  const [paymentSetup, setPaymentSetup] = useState<PaymentSetup>(() =>
    initialUser?.address ? { state: "checking" } : { state: "idle" },
  );

  const refreshPaymentSetup = useCallback(
    async (opts: { promptWallet?: boolean } = {}) => {
      if (!signedIn) {
        setPaymentSetup({ state: "idle" });
        return;
      }
      setPaymentSetup({ state: "checking" });
      setError(null);
      const { setup } = await inspectPaymentSetup({
        requiredMicroUsdc: moment.priceMicroUsdc,
        promptWallet: opts.promptWallet,
      });
      setPaymentSetup(setup);
    },
    [moment.priceMicroUsdc, signedIn],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.resolve();
      if (!alive) return;
      if (!signedIn) {
        setPaymentSetup({ state: "idle" });
        return;
      }
      setPaymentSetup({ state: "checking" });
      const { setup } = await inspectPaymentSetup({
        requiredMicroUsdc: moment.priceMicroUsdc,
      });
      if (alive) setPaymentSetup(setup);
    })();
    return () => {
      alive = false;
    };
  }, [moment.priceMicroUsdc, signedIn]);

  const completeLicense = useCallback(
    async ({ walletClient, account }: WalletReady) => {
      // 1. A fresh fund-once buyer grant, capped to exactly this purchase.
      setStatus("Creating your clip pass.");
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
        throw new Error(
          grantRes.status === 401
            ? "Connect your wallet first, then use this clip."
            : "Could not start this payment. Try again.",
        );
      }
      const { grant } = (await grantRes.json()) as { grant: { id: string } };
      // 2. Pay the x402 unlock with the injected wallet as the session key.
      const unlock = await purchaseMomentLicense({
        momentId: moment.id,
        grantId: grant.id,
        walletClient,
        account,
        baseUrl: window.location.origin,
        onStatus: setStatus,
      });
      setResult(unlock);
    },
    [moment.id, moment.priceMicroUsdc],
  );

  const switchToArc = useCallback(async () => {
    setBusy("setup");
    setStatus("Opening wallet.");
    setError(null);
    try {
      const { walletClient } = await getWallet();
      setStatus("Switching to Arc Testnet.");
      await walletClient.switchChain({ id: arcTestnet.id });
      setStatus("Checking payment setup.");
      const { setup } = await inspectPaymentSetup({
        requiredMicroUsdc: moment.priceMicroUsdc,
      });
      setPaymentSetup(setup);
    } catch (e) {
      const message = msg(e);
      setError(message);
      setPaymentSetup({ state: "error", message });
    } finally {
      setStatus(null);
      setBusy(null);
    }
  }, [moment.priceMicroUsdc]);

  const license = useCallback(async () => {
    setBusy("license");
    setStatus("Checking payment setup.");
    setError(null);
    try {
      const { setup, wallet } = await inspectPaymentSetup({
        requiredMicroUsdc: moment.priceMicroUsdc,
        promptWallet: true,
      });
      setPaymentSetup(setup);
      if (!wallet || setup.state !== "ready") return;
      await completeLicense(wallet);
    } catch (e) {
      const message = msg(e);
      setError(message);
      setPaymentSetup({ state: "error", message });
    } finally {
      setStatus(null);
      setBusy(null);
    }
  }, [completeLicense, moment.priceMicroUsdc]);

  const addFundsAndLicense = useCallback(async () => {
    setBusy("fund");
    setStatus("Checking payment setup.");
    setError(null);
    try {
      const { setup, wallet, readiness } = await inspectPaymentSetup({
        requiredMicroUsdc: moment.priceMicroUsdc,
        promptWallet: true,
      });
      setPaymentSetup(setup);
      if (!wallet || !readiness) return;
      if (readiness.status === "ready") {
        setBusy("license");
        await completeLicense(wallet);
        return;
      }
      if (readiness.status !== "needs_gateway_funding") return;

      await depositGatewayUsdc({
        walletClient: wallet.walletClient,
        account: wallet.account,
        amountUsdc: microUsdcToDecimal(readiness.shortfallMicroUsdc),
        onStatus: setStatus,
      });

      setStatus("Checking Gateway balance.");
      const after = await getGatewayPaymentReadiness({
        account: wallet.account,
        requiredMicroUsdc: moment.priceMicroUsdc,
      });
      setPaymentSetup(setupFromReadiness(after));
      if (after.status !== "ready") return;

      setBusy("license");
      await completeLicense(wallet);
    } catch (e) {
      const message = msg(e);
      setError(message);
      setPaymentSetup({ state: "error", message });
    } finally {
      setStatus(null);
      setBusy(null);
    }
  }, [completeLicense, moment.priceMicroUsdc]);

  // ── licensed ───────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="rounded-2xl border border-sage/30 bg-sage/5 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-sage">
          <SealCheck weight="fill" className="size-4" /> Unlocked
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          You unlocked &quot;{moment.title}&quot;. Your full-quality file is ready.
        </p>
        <a
          href={result.unlockUrl}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          <DownloadSimple weight="bold" className="size-4" /> Download clip
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

  const setupText = setupCopy(paymentSetup);
  const readiness = "readiness" in paymentSetup ? paymentSetup.readiness : null;
  const paymentBusy = busy === "setup" || busy === "fund" || busy === "license";

  // ── checkout ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
            Use price
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
        Pay once to use this clip in your project. The creator gets paid, and your receipt shows what you unlocked.
      </p>

      {signedIn ? (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">Wallet</span>
            <ConnectWallet
              initialUser={me}
              onAuthChange={setMe}
              className="w-full justify-center sm:w-auto"
            />
          </div>

          <div className="mt-4 border-y border-border/70 py-3">
            <div className="flex items-start gap-2.5">
              {paymentSetup.state === "checking" ? (
                <CircleNotch weight="bold" className="mt-0.5 size-4 shrink-0 animate-spin text-sage" />
              ) : paymentSetup.state === "ready" ? (
                <ShieldCheck weight="fill" className="mt-0.5 size-4 shrink-0 text-sage" />
              ) : paymentSetup.state === "needs_gateway_funding" ? (
                <Coins weight="bold" className="mt-0.5 size-4 shrink-0 text-sage" />
              ) : (
                <WarningCircle weight="bold" className="mt-0.5 size-4 shrink-0 text-amber-400" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">{setupText.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {setupText.body}
                </p>
              </div>
            </div>

            {readiness && (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.7rem] text-muted-foreground">
                <dt>Clip price</dt>
                <dd className="text-right tabular text-foreground">
                  {formatMicroUsdcBalance(readiness.requiredMicroUsdc)} USDC
                </dd>
                <dt>Ready in Gateway</dt>
                <dd className="text-right tabular text-foreground">
                  {formatMicroUsdcBalance(readiness.gatewayAvailableMicroUsdc)} USDC
                </dd>
                <dt>Wallet USDC</dt>
                <dd className="text-right tabular text-foreground">
                  {formatMicroUsdcBalance(readiness.walletMicroUsdc)} USDC
                </dd>
                {readiness.shortfallMicroUsdc > BigInt(0) && (
                  <>
                    <dt>Need before pay</dt>
                    <dd className="text-right tabular text-foreground">
                      {formatMicroUsdcBalance(readiness.shortfallMicroUsdc)} USDC
                    </dd>
                  </>
                )}
              </dl>
            )}

            {paymentSetup.state === "needs_wallet_usdc" && readiness && (
              <a
                href={ARC_TESTNET_USDC_FAUCET_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-sage transition-colors hover:text-foreground"
              >
                Get Arc Testnet USDC from faucet
                <ArrowSquareOut weight="bold" className="size-3.5" />
              </a>
            )}
          </div>

          {paymentSetup.state === "ready" && (
            <button
              type="button"
              onClick={license}
              disabled={paymentBusy}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {busy === "license" && <CircleNotch weight="bold" className="size-4 animate-spin" />}
              {busy === "license" ? "Working..." : "Use this clip"}
            </button>
          )}

          {paymentSetup.state === "needs_gateway_funding" && (
            <button
              type="button"
              onClick={addFundsAndLicense}
              disabled={paymentBusy}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {busy === "fund" && <CircleNotch weight="bold" className="size-4 animate-spin" />}
              {busy === "fund" ? "Working..." : "Add USDC and use clip"}
            </button>
          )}

          {paymentSetup.state === "wrong_network" && (
            <button
              type="button"
              onClick={switchToArc}
              disabled={paymentBusy}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {busy === "setup" && <CircleNotch weight="bold" className="size-4 animate-spin" />}
              {busy === "setup" ? "Working..." : "Switch to Arc Testnet"}
            </button>
          )}

          {paymentSetup.state === "needs_wallet_usdc" && (
            <button
              type="button"
              disabled
              className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground opacity-70"
            >
              Add USDC to your wallet
            </button>
          )}

          {(paymentSetup.state === "checking" || paymentSetup.state === "idle") && (
            <button
              type="button"
              disabled
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground opacity-70"
            >
              <CircleNotch weight="bold" className="size-4 animate-spin" />
              Checking payment setup...
            </button>
          )}

          {(paymentSetup.state === "wallet_unavailable" || paymentSetup.state === "error") && (
            <button
              type="button"
              onClick={() => refreshPaymentSetup({ promptWallet: true })}
              disabled={paymentBusy}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <ArrowClockwise weight="bold" className="size-4" />
              Check again
            </button>
          )}

          {status && (
            <p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">
              {status}
            </p>
          )}

          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

          <p className="mt-4 text-[0.7rem] leading-relaxed text-muted-foreground">
            Your wallet signs the payment. Findling never holds your funds.
          </p>
        </>
      ) : (
        <>
          {/* Signed out: a single primary CTA. Paying isn't possible yet, so we
              don't show a dead "Use this clip" button that only 401s. */}
          <div className="mt-4">
            <ConnectWallet
              initialUser={me ?? null}
              onAuthChange={setMe}
              className="w-full justify-center"
            />
          </div>

          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

          <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
            Connect your wallet to use this clip. First-time buyers add USDC to
            Circle Gateway once. Your wallet signs each payment directly, and
            Findling never holds your funds.
          </p>
        </>
      )}
    </div>
  );
}
