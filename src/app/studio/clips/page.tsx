import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { getStudioData } from "@/server/catalog/studio";
import { getCurrentUserId } from "@/server/auth/current-user";
import {
  MomentCard,
  ImportCta,
  StudioEmpty,
} from "@/components/studio/moment-card";

export const dynamic = "force-dynamic"; // signed URLs + live catalog

export default async function ClipsPage() {
  const sessionId = await getCurrentUserId();
  const data = sessionId ? await getStudioData(sessionId, false) : null;
  const moments = data?.moments ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:py-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Clips
          </p>
          <h1 className="mt-2 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
            Your moments
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {moments.length} {moments.length === 1 ? "moment" : "moments"}
            {data ? ` · ${data.publishedCount} live for agents` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ImportCta />
        </div>
      </div>

      <div className="mt-8">
        {moments.length === 0 ? (
          <StudioEmpty />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {moments.map((m) => (
              <MomentCard key={m.momentId} m={m} showEarned={!!sessionId} />
            ))}
            <Link
              href="/studio/upload"
              className="flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/40 p-4 text-center transition-colors hover:border-sage/50 hover:bg-card"
            >
              <span className="grid size-10 place-items-center rounded-full bg-secondary text-sage">
                <Plus weight="bold" className="size-5" />
              </span>
              <span className="text-sm font-medium">New moment</span>
              <span className="text-xs text-muted-foreground">
                Upload a clip or import from YouTube
              </span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
