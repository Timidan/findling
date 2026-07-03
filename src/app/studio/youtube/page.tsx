import Link from "next/link";
import { ArrowLeft, YoutubeLogo } from "@phosphor-icons/react/dist/ssr";
import { eq } from "drizzle-orm";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { StudioAuthGate } from "@/components/studio/studio-auth-gate";
import { YoutubeImportPanel } from "@/components/studio/youtube-import-panel";

export const dynamic = "force-dynamic";

type YoutubeStatus = "connected" | "already_connected" | "error" | null;

function normalizeStatus(value: string | string[] | undefined): YoutubeStatus {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "connected" || raw === "already_connected" || raw === "error") {
    return raw;
  }
  return null;
}

export default async function StudioYoutubePage({
  searchParams,
}: {
  searchParams: Promise<{ youtube?: string | string[] }>;
}) {
  const id = await getCurrentUserId();
  if (!id) {
    return <StudioAuthGate message="Sign in with your wallet to import from YouTube." />;
  }

  const sp = await searchParams;
  const status = normalizeStatus(sp.youtube);
  const account = (
    await db
      .select({
        youtubeChannelTitle: users.youtubeChannelTitle,
        youtubeRefreshTokenCiphertext: users.youtubeRefreshTokenCiphertext,
      })
      .from(users)
      .where(eq(users.id, id))
  )[0];

  const connected = !!account?.youtubeRefreshTokenCiphertext;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:py-10">
      <Link
        href="/studio/clips"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft weight="bold" className="size-3.5" />
        Clips
      </Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <YoutubeLogo weight="fill" className="size-4 text-sage" />
            YouTube import
          </p>
          <h1 className="mt-2 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
            Bring in a clip from your channel
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Connect YouTube once. After that, load your channel videos when you
            need them, pick the part you want, set a price, and save it as a
            draft clip.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <YoutubeImportPanel
          connected={connected}
          channelTitle={account?.youtubeChannelTitle ?? null}
          status={status}
        />
      </div>
    </div>
  );
}
