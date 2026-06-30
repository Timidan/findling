import Link from "next/link";
import {
  Wallet,
  YoutubeLogo,
  Tag,
  CheckCircle,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import { getStudioIdentity } from "@/server/catalog/studio";
import { getCurrentUserId } from "@/server/auth/current-user";
import { PayoutWalletControl } from "@/components/auth/payout-wallet-control";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // account details (email, payout wallet, YouTube) are private — require login
  const id = await getCurrentUserId();
  const identity = id ? await getStudioIdentity(id).catch(() => null) : null;

  if (!identity) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-5 py-24 text-center">
        <Wallet weight="duotone" className="size-9 text-sage" />
        <h1 className="font-display text-3xl tracking-tight">
          Connect your wallet
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your wallet to manage your account.
        </p>
      </div>
    );
  }

  const ytConnected = !!identity.youtubeChannelTitle;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:py-10">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Settings
        </p>
        <h1 className="mt-2 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
          Account
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {identity.email ?? "Your creator account"}
        </p>
      </div>

      <div className="mt-8 space-y-3">
        <Row
          icon={<Wallet weight="duotone" className="size-5" />}
          title="Payout wallet"
          desc="Where withdrawn USDC settles on Arc."
        >
          <PayoutWalletControl
            initial={identity.payoutWalletAddress}
            loginAddress={identity.walletAddress}
          />
        </Row>

        <Row
          icon={<YoutubeLogo weight="fill" className="size-5 text-sage" />}
          title="YouTube channel"
          desc="Import clips and verify ownership of your moments."
        >
          {ytConnected ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium">
              <CheckCircle weight="fill" className="size-3.5 text-sage" />
              {identity.youtubeChannelTitle}
            </span>
          ) : (
            <Link
              href="/api/creator/youtube/connect"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              Connect
              <ArrowSquareOut weight="bold" className="size-3.5" />
            </Link>
          )}
        </Row>

        <Row
          icon={<Tag weight="duotone" className="size-5" />}
          title="Default clip price"
          desc="Set per-moment when you publish. Editable defaults are coming."
        >
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            Per moment
          </span>
        </Row>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Profile editing and notification preferences are coming next. For now,
        connect a channel and set prices per moment in{" "}
        <Link
          href="/studio/clips"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Clips
        </Link>
        .
      </p>
    </div>
  );
}

function Row({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sage">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="shrink-0 sm:pl-4">{children}</div>
    </div>
  );
}
