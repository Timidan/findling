import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  SealCheck,
  Path,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import { getReceiptBySlug } from "@/server/receipt/receipt";
import { receiptMetadata } from "@/server/receipt/receipt-metadata";
import { getSessionUser } from "@/server/auth/current-user";
import { SiteHeader } from "@/components/site/site-header";
import { UsdcAmount, UsdcIcon } from "@/components/brand/usdc";
import { formatDateTime, formatMicroUsdc } from "@/lib/format";
import { arcAddressUrl, arcTxUrl } from "@/lib/explorer";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return receiptMetadata(await getReceiptBySlug(slug));
}

const usd = (micro: number) => formatMicroUsdc(micro);
const NETWORK_LABEL: Record<string, string> = {
  "eip155:5042002": "Arc Testnet",
  arcTestnet: "Arc Testnet",
};

function shortAddr(a: string | null): string {
  if (!a) return "Not available";
  return a.length > 14 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;
}

function isTxHash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = await getReceiptBySlug(slug);
  if (!r) notFound();
  const initialUser = await getSessionUser();
  const payerUrl = r.payerAddress ? arcAddressUrl(r.payerAddress) : null;
  const settlementTxUrl = isTxHash(r.paymentReference)
    ? arcTxUrl(r.paymentReference)
    : null;

  const rows = [
    { who: r.creatorHandle ?? "creator", role: "creator", pct: "80%", micro: r.creatorMicroUsdc },
    {
      who: r.finderHandle ?? "platform reserve",
      role: r.finderHandle ? "finder" : "no finder",
      pct: "12%",
      micro: r.finderMicroUsdc,
    },
    { who: "Findling", role: "platform", pct: "8%", micro: r.platformMicroUsdc },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <SiteHeader tag="Receipt" initialUser={initialUser} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 py-12">
      {/* settled seal */}
      <div className="mt-2 flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-full bg-sage/15 text-sage">
          <SealCheck weight="fill" className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-sage">Clip unlocked and paid in USDC</p>
          <p className="tabular text-xs text-muted-foreground">
            {NETWORK_LABEL[r.network] ?? r.network} ·{" "}
            {formatDateTime(r.settledAt)}
          </p>
        </div>
      </div>

      <h1 className="mt-6 font-display text-3xl leading-[1.05] tracking-tight text-balance sm:text-4xl">
        {r.momentTitle}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This is proof that a clip was unlocked and paid for.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Paid once to use this clip for {r.usageType.replace("_", " ")}. Source:{" "}
        {r.sourceType === "youtube" ? "YouTube import" : "upload"}
        {r.licenseSummary ? ` · ${r.licenseSummary}` : ""}
      </p>

      {/* the split */}
      <section className="mt-8">
        <h2 className="mb-2 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          Who got paid
        </h2>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((row) => (
            <div key={row.role} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.who}</p>
                <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                  {row.role} · {row.pct}
                </p>
              </div>
              <UsdcAmount
                micro={row.micro}
                sign="+"
                className="tabular shrink-0 gap-0.5 text-sm font-semibold text-foreground"
              />
            </div>
          ))}
          <div className="flex items-center justify-between bg-secondary/40 px-4 py-3">
            <p className="text-sm font-semibold">Gross paid</p>
            <span className="tabular inline-flex items-center gap-1 text-sm font-semibold">
              {usd(r.grossMicroUsdc)} <UsdcIcon size="0.85em" />
            </span>
          </div>
        </div>
      </section>

      {/* proof */}
      <section className="mt-8 space-y-2.5 text-sm">
        <h2 className="mb-1 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          Payment proof
        </h2>
        <DetailRow label="Provider" value={r.provider === "gateway_x402" ? "Circle Gateway (x402)" : r.provider} />
        <DetailRow label="Network" value={NETWORK_LABEL[r.network] ?? r.network} />
        <DetailRow
          label="Payer (agent key)"
          value={shortAddr(r.payerAddress)}
          href={payerUrl ?? undefined}
          linkLabel="View on Arc Testnet"
          mono
        />
        <DetailRow
          label={settlementTxUrl ? "Settlement tx" : "Settlement ref"}
          value={r.paymentReference}
          href={settlementTxUrl ?? undefined}
          linkLabel="View tx on Arc Testnet"
          mono
        />
        {r.attributionText && <DetailRow label="Attribution" value={r.attributionText} />}
        {r.ownershipModel && (
          <DetailRow
            label="Usage rights"
            value={r.ownershipModel === "channel_control" ? "YouTube channel control" : "Contributor attestation"}
          />
        )}
      </section>

      <div className="mt-8 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <Path weight="bold" className="size-4 shrink-0 text-sage" />
        <span>
          Paid autonomously by an AI agent. Circle Gateway settles small payments
          in batches. The on-chain transaction lands when the batch flushes.
        </span>
      </div>

      <footer className="mt-auto pt-10">
        <a
          href={payerUrl ?? "https://testnet.arcscan.app"}
          target="_blank"
          rel="noreferrer"
          className="tabular inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          receipt {r.receiptCode} ·{" "}
          {r.payerAddress ? "view payer on Arc Testnet" : "view on Arc Testnet"}
          <ArrowSquareOut className="size-3.5" />
        </a>
      </footer>
      </main>
    </div>
  );
}

function DetailRow({
  label,
  value,
  href,
  linkLabel,
  mono,
}: {
  label: string;
  value: string;
  href?: string;
  linkLabel?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-words text-right ${mono ? "tabular break-all" : ""}`}>
        {value}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="ml-2 inline-flex items-center gap-1 text-xs text-sage underline-offset-2 hover:underline"
          >
            {linkLabel ?? "View on Arc Testnet"}
            <ArrowSquareOut className="size-3.5" />
          </a>
        )}
      </span>
    </div>
  );
}
