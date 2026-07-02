import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ShareNetwork,
  Wallet,
  SealCheck,
  UploadSimple,
  HandCoins,
} from "@phosphor-icons/react/dist/ssr";
import { getSessionUser } from "@/server/auth/current-user";
import { SiteHeader } from "@/components/site/site-header";
import { ConnectWallet } from "@/components/auth/connect-wallet";
import { UsdcAmount } from "@/components/brand/usdc";
import { getClaimView } from "@/components/claim/sample-claim";
import { ClaimAction } from "@/components/claim/claim-action";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim a clip request · Findling",
  description: "If this clip is yours, claim the request, upload your version, and get paid when it is used.",
};

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ moment?: string }>;
}) {
  const { token } = await params;
  const { moment } = await searchParams;
  const [initialUser, view] = await Promise.all([
    getSessionUser(),
    getClaimView(token),
  ]);
  if (!view.found) notFound();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <SiteHeader tag="Claim request" initialUser={initialUser} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 py-12">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <ShareNetwork weight="bold" className="size-3.5 text-sage" />
          {view.externalIdentity}
        </span>

        <h1 className="mt-4 font-display text-3xl leading-[1.06] tracking-tight text-balance sm:text-4xl">
          People want this clip from you.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{view.title}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          If this clip is yours, claim the request, upload your version, and get
          paid when it is used.
        </p>

        {/* the waiting money — the reason to claim */}
        <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-sage/30 bg-sage/5 px-5 py-4">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
              Money waiting after upload
            </p>
            <UsdcAmount
              micro={view.pledgedDemandMicroUsdc}
              className="tabular gap-0.5 font-display text-3xl tracking-tight text-foreground"
            />
          </div>
          <p className="tabular shrink-0 text-right text-xs text-muted-foreground">
            {view.pledgeCount} {view.pledgeCount === 1 ? "agent" : "agents"}
            <br />
            ready to pay
          </p>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          This shows demand, not money held by Findling. Agents pay only after
          you claim and publish your own clip. You keep 80%.
        </p>

        <div className="mt-6">
          <ClaimAction
            token={token}
            connected={!!initialUser}
            initialStatus={view.status}
            momentId={moment ?? null}
            actorControlProof={view.actorControlProof}
          />
        </div>

        {/* claim flow */}
        <ol className="mt-8 space-y-3">
          <Step
            n={1}
            active
            icon={<Wallet weight="duotone" className="size-5 text-sage" />}
            title="Connect your wallet"
            body="Sign in with the wallet where you want your USDC payout."
          >
            <ConnectWallet initialUser={initialUser} />
          </Step>
          <Step
            n={2}
            icon={<SealCheck weight="duotone" className="size-5 text-sage" />}
            title="Prove this channel is yours"
            body="Paste a one-time Findling code into your PeerTube channel or video. We read it back to confirm control. No admin access needed."
          />
          <Step
            n={3}
            icon={<UploadSimple weight="duotone" className="size-5 text-sage" />}
            title="Upload your clip and publish"
            body="Add your own version and publish it so people and agents can use it."
          />
          <Step
            n={4}
            icon={<HandCoins weight="duotone" className="size-5 text-sage" />}
            title="Get paid"
            body="Agents pay through Findling after the clip is live. You receive 80% in USDC and can withdraw on-chain."
          />
        </ol>

        <p className="mt-8 text-center text-[0.7rem] text-muted-foreground">
          Steps 2 to 4 light up as we wire the claim flow. Nothing about your clip is sold
          until you complete them.
        </p>
      </main>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  icon,
  active = false,
  children,
}: {
  n: number;
  title: string;
  body: string;
  icon: React.ReactNode;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`flex gap-4 rounded-2xl border p-4 ${
        active ? "border-border bg-card" : "border-border/60 bg-card/40"
      }`}
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full ${
          active ? "bg-sage/15" : "bg-secondary"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="tabular text-[0.7rem] font-medium text-muted-foreground">
            Step {n}
          </span>
          {!active && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
              next
            </span>
          )}
        </div>
        <h2 className="mt-0.5 font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}
