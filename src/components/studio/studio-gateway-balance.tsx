"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowClockwise,
  ArrowSquareOut,
  CircleNotch,
  Coins,
  X,
} from "@phosphor-icons/react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  type Address,
  type EIP1193Provider,
} from "viem";
import { arcTestnet } from "viem/chains";
import { cn } from "@/lib/utils";
import { depositGatewayUsdc } from "@/lib/x402-browser";
import { GATEWAY_BALANCE_UPDATED_EVENT } from "@/lib/gateway-events";

const ARC_TESTNET_USDC_FAUCET_URL = "https://faucet.circle.com/";
const ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network";
const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
const MICRO_USDC = BigInt(1_000_000);

type BalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; balance: string }
  | { status: "error" };

type WalletBalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; balance: string; microUsdc: bigint }
  | { status: "error" };

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
      "Open this page inside your wallet app, or enable a wallet extension.",
    );
  }
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.[0]) throw new Error("No wallet account available.");
  const account = getAddress(accounts[0]);
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: custom(eth),
  });
  return { walletClient, account };
}

function depositMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/user rejected|denied|rejected the request/i.test(raw)) {
    return "You cancelled the wallet request.";
  }
  if (/insufficient|exceeds balance/i.test(raw)) {
    return "Your wallet needs more Arc Testnet USDC. Use the faucet link above.";
  }
  return raw.length > 140 ? `${raw.slice(0, 140)}...` : raw;
}

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

function parseUsdcToMicro(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * MICRO_USDC + BigInt(fraction.padEnd(6, "0"));
}

async function fetchWalletUsdcBalance(address: string): Promise<{
  balance: string;
  microUsdc: bigint;
}> {
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(ARC_TESTNET_RPC_URL),
  });
  const microUsdc = await publicClient.readContract({
    address: ARC_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [getAddress(address)],
  });
  return { balance: cleanUsdc(formatUnits(microUsdc, 6)), microUsdc };
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
  const [depositOpen, setDepositOpen] = useState(false);
  const [amountUsdc, setAmountUsdc] = useState("1");
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [walletBalance, setWalletBalance] = useState<WalletBalanceState>({ status: "idle" });

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

  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.resolve();
      if (!alive) return;
      if (!address || !depositOpen) {
        setWalletBalance({ status: "idle" });
        return;
      }
      setWalletBalance({ status: "loading" });
      try {
        const balance = await fetchWalletUsdcBalance(address);
        if (alive) setWalletBalance({ status: "ready", ...balance });
      } catch {
        if (alive) setWalletBalance({ status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [address, depositOpen, refresh]);

  if (!address) return null;
  const targetAddress = getAddress(address);

  const isLoading = state.status === "loading";
  const label =
    state.status === "ready"
      ? `${state.balance} USDC`
      : state.status === "error"
        ? "Check balance"
        : "Loading";
  const depositMicroUsdc = parseUsdcToMicro(amountUsdc);
  const amountExceedsWallet =
    walletBalance.status === "ready" &&
    depositMicroUsdc != null &&
    depositMicroUsdc > walletBalance.microUsdc;
  const canDeposit =
    !depositing && depositMicroUsdc != null && depositMicroUsdc > 0 && !amountExceedsWallet;
  const walletBalanceLabel =
    walletBalance.status === "ready"
      ? `${walletBalance.balance} USDC`
      : walletBalance.status === "loading"
        ? "Checking"
        : walletBalance.status === "error"
          ? "Unavailable"
          : "Open wallet";

  async function deposit() {
    if (!canDeposit) return;
    setDepositing(true);
    setDepositStatus("Opening wallet.");
    setDepositError(null);
    try {
      const { walletClient, account } = await getWallet();
      if (account.toLowerCase() !== targetAddress.toLowerCase()) {
        throw new Error("Switch your wallet to the connected Studio account.");
      }
      await depositGatewayUsdc({
        walletClient,
        account,
        amountUsdc,
        onStatus: setDepositStatus,
      });
      setDepositStatus("Deposit complete.");
      setRefresh((n) => n + 1);
      window.dispatchEvent(new Event(GATEWAY_BALANCE_UPDATED_EVENT));
      window.setTimeout(() => {
        setDepositOpen(false);
        setDepositStatus(null);
      }, 900);
    } catch (e) {
      setDepositError(depositMessage(e));
      setDepositStatus(null);
    } finally {
      setDepositing(false);
    }
  }

  return (
    <>
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
        <button
          type="button"
          onClick={() => setDepositOpen(true)}
          aria-label="Deposit to Gateway"
          className={cn(
            "shrink-0 rounded-full bg-primary px-2 py-1 text-[0.65rem] font-semibold text-primary-foreground transition-transform active:scale-[0.98]",
            compact && "px-1.5",
          )}
        >
          {compact ? "+" : "Deposit"}
        </button>
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

      {depositOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Deposit to Gateway"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-medium">Deposit to Gateway</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Move Arc Testnet USDC from your wallet into Gateway.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDepositOpen(false)}
                className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Close"
              >
                <X weight="bold" className="size-4" />
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Wallet USDC</span>
                <span className="text-xs font-medium tabular text-foreground">
                  {walletBalanceLabel}
                </span>
              </div>
            </div>

            <label className="mt-4 block text-xs text-muted-foreground">
              Amount (USDC)
            </label>
            <input
              type="number"
              min="0.000001"
              step="0.01"
              value={amountUsdc}
              onChange={(e) => setAmountUsdc(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage/40"
            />
            <div className="mt-2 flex gap-1.5">
              {["0.5", "1", "5"].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setAmountUsdc(amount)}
                  className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {amount}
                </button>
              ))}
            </div>

            <a
              href={ARC_TESTNET_USDC_FAUCET_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-sage transition-colors hover:text-foreground"
            >
              Get Arc Testnet USDC
              <ArrowSquareOut weight="bold" className="size-3.5" />
            </a>

            <button
              type="button"
              onClick={deposit}
              disabled={!canDeposit}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {depositing && <CircleNotch weight="bold" className="size-4 animate-spin" />}
              {depositing ? "Depositing..." : "Deposit test USDC"}
            </button>

            {amountExceedsWallet && (
              <p className="mt-2 text-xs text-destructive">
                Amount is higher than your wallet USDC balance.
              </p>
            )}
            {depositStatus && (
              <p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">
                {depositStatus}
              </p>
            )}
            {depositError && <p className="mt-2 text-xs text-destructive">{depositError}</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
