"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowSquareOut,
  CheckCircle,
  CircleNotch,
  FilmSlate,
  Play,
  WarningCircle,
  X,
  YoutubeLogo,
} from "@phosphor-icons/react";

type YoutubeStatus = "connected" | "already_connected" | "error" | null;

interface YoutubeVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
}

type LoadPhase = "idle" | "loading" | "ready" | "error";
type ImportPhase = "idle" | "importing" | "done" | "error";

function secsToMs(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}

function cleanPrice(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  const fraction = rest.join("").slice(0, 6);
  return rest.length ? `${whole}.${fraction}` : whole;
}

function statusCopy(status: YoutubeStatus): { title: string; body: string } | null {
  if (status === "connected") {
    return {
      title: "YouTube connected",
      body: "Load your channel videos, choose one, then save the part you want as a draft clip.",
    };
  }
  if (status === "already_connected") {
    return {
      title: "YouTube is already connected",
      body: "You do not need to sign in again. Load your videos when you want to import a clip.",
    };
  }
  if (status === "error") {
    return {
      title: "YouTube did not connect",
      body: "Try again. If Google asks for access, allow YouTube read access so Findling can show your own videos.",
    };
  }
  return null;
}

export function YoutubeImportPanel({
  connected,
  channelTitle,
  status,
}: {
  connected: boolean;
  channelTitle: string | null;
  status: YoutubeStatus;
}) {
  const router = useRouter();
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("idle");
  const [importPhase, setImportPhase] = useState<ImportPhase>("idle");
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [selected, setSelected] = useState<YoutubeVideo | null>(null);
  const [startSec, setStartSec] = useState("0");
  const [endSec, setEndSec] = useState("15");
  const [title, setTitle] = useState("");
  const [priceUsd, setPriceUsd] = useState("0.05");
  const [error, setError] = useState<string | null>(null);
  const [momentId, setMomentId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(status === "connected" || status === "already_connected");
  const statusMessage = useMemo(() => statusCopy(status), [status]);

  const loadVideos = useCallback(async () => {
    if (!connected) return;
    setError(null);
    setLoadPhase("loading");
    try {
      const res = await fetch("/api/creator/youtube/videos", {
        credentials: "same-origin",
      });
      const body = (await res.json().catch(() => null)) as {
        videos?: YoutubeVideo[];
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(body?.error ?? "Could not load your YouTube videos.");
      }
      setVideos(body?.videos ?? []);
      setLoadPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your YouTube videos.");
      setLoadPhase("error");
    }
  }, [connected]);

  function chooseVideo(video: YoutubeVideo) {
    setSelected(video);
    setTitle(video.title.slice(0, 120));
    setStartSec("0");
    setEndSec("15");
    setMomentId(null);
    setImportPhase("idle");
    setError(null);
  }

  async function importClip(e: FormEvent) {
    e.preventDefault();
    if (!selected) {
      setError("Choose a video first.");
      return;
    }
    const startMs = secsToMs(startSec);
    const endMs = secsToMs(endSec);
    if (startMs == null || endMs == null || endMs <= startMs) {
      setError("Enter a valid start and end time.");
      return;
    }
    if (endMs - startMs > 60_000) {
      setError("Choose 60 seconds or less.");
      return;
    }
    if (!title.trim()) {
      setError("Add a title.");
      return;
    }

    setError(null);
    setImportPhase("importing");
    try {
      const res = await fetch("/api/creator/youtube/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          videoId: selected.videoId,
          startMs,
          endMs,
          title: title.trim(),
          priceUsd,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        momentId?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(body?.error ?? "Could not import that clip.");
      }
      setMomentId(body?.momentId ?? null);
      setImportPhase("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import that clip.");
      setImportPhase("error");
    }
  }

  if (!connected) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-2xl tracking-tight">Connect YouTube once</h2>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              Findling asks Google for read access to your YouTube account so it
              can show videos from your own channel. We store a refresh token so
              you do not need to sign in every time you import.
            </p>
          </div>
          <Link
            href="/api/creator/youtube/connect"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            <YoutubeLogo weight="fill" className="size-4" />
            Connect YouTube
            <ArrowSquareOut weight="bold" className="size-4" />
          </Link>
        </div>
        {statusMessage && status === "error" && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" />
            {statusMessage.body}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {modalOpen && statusMessage && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 px-4 py-8 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="youtube-connected-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sage/15 text-sage">
                <CheckCircle weight="fill" className="size-6" />
              </span>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X weight="bold" className="size-4" />
              </button>
            </div>
            <h2
              id="youtube-connected-title"
              className="mt-4 font-display text-2xl tracking-tight"
            >
              {statusMessage.title}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{statusMessage.body}</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  void loadVideos();
                }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                <Play weight="bold" className="size-4" />
                Load videos
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary/60"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Connected channel
              </p>
              <h2 className="mt-1 truncate font-display text-2xl tracking-tight">
                {channelTitle ?? "YouTube channel"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Videos load only when you ask, so this page stays fast.
              </p>
              <Link
                href="/api/creator/youtube/connect?force=1"
                className="mt-2 inline-flex text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Reconnect YouTube
              </Link>
            </div>
            <button
              type="button"
              onClick={loadVideos}
              disabled={loadPhase === "loading"}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {loadPhase === "loading" ? (
                <CircleNotch weight="bold" className="size-4 animate-spin" />
              ) : (
                <Play weight="bold" className="size-4" />
              )}
              {loadPhase === "loading" ? "Loading..." : "Load channel videos"}
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="mt-6">
            {loadPhase === "idle" && (
              <EmptyState text="Load your YouTube videos, then choose the one you want to turn into a paid clip." />
            )}
            {loadPhase === "loading" && (
              <div role="status" className="rounded-xl border border-border bg-background px-4 py-5 text-sm">
                <div className="flex items-center gap-2">
                  <CircleNotch weight="bold" className="size-4 animate-spin text-sage" />
                  Asking YouTube for your channel videos.
                </div>
              </div>
            )}
            {loadPhase === "ready" && videos.length === 0 && (
              <EmptyState text="No YouTube uploads were found for this channel." />
            )}
            {loadPhase === "ready" && videos.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {videos.map((video) => (
                  <button
                    key={video.videoId}
                    type="button"
                    onClick={() => chooseVideo(video)}
                    className={`flex min-h-28 gap-3 rounded-2xl border p-3 text-left transition-colors ${
                      selected?.videoId === video.videoId
                        ? "border-sage bg-sage/10"
                        : "border-border bg-background hover:bg-secondary/40"
                    }`}
                  >
                    <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-xl bg-secondary">
                      {video.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={video.thumbnailUrl}
                          alt=""
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : (
                        <span className="grid size-full place-items-center text-sage">
                          <FilmSlate weight="duotone" className="size-5" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-medium leading-snug">
                        {video.title || "Untitled video"}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {video.publishedAt
                          ? new Date(video.publishedAt).toLocaleDateString()
                          : "YouTube upload"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Clip details
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-tight">
            {selected ? "Save a draft clip" : "Choose a video"}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Pick a short moment from the video. You can edit the price later in Clips.
          </p>

          {selected ? (
            <form onSubmit={importClip} className="mt-5 space-y-4">
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="line-clamp-2 text-sm font-medium">{selected.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  youtube.com/watch?v={selected.videoId}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start second">
                  <input
                    value={startSec}
                    onChange={(e) => setStartSec(e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-sage"
                  />
                </Field>
                <Field label="End second">
                  <input
                    value={endSec}
                    onChange={(e) => setEndSec(e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-sage"
                  />
                </Field>
              </div>

              <Field label="Clip title">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-sage"
                />
              </Field>

              <Field label="Price in USDC">
                <input
                  value={priceUsd}
                  onChange={(e) => setPriceUsd(cleanPrice(e.target.value))}
                  inputMode="decimal"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-sage"
                />
              </Field>

              {importPhase === "importing" && (
                <div role="status" className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <CircleNotch weight="bold" className="size-4 animate-spin text-sage" />
                    Fetching the YouTube video, cutting the clip, and making its thumbnail.
                  </div>
                </div>
              )}

              {importPhase === "done" && (
                <div className="rounded-xl border border-sage/30 bg-sage/10 px-4 py-3 text-sm text-sage">
                  Clip saved as a draft.
                  <Link
                    href={momentId ? `/studio/clips?moment=${encodeURIComponent(momentId)}` : "/studio/clips"}
                    className="ml-1 font-semibold underline-offset-4 hover:underline"
                  >
                    Open Clips
                  </Link>
                </div>
              )}

              <button
                type="submit"
                disabled={importPhase === "importing" || importPhase === "done"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {importPhase === "importing" ? (
                  <CircleNotch weight="bold" className="size-4 animate-spin" />
                ) : importPhase === "done" ? (
                  <CheckCircle weight="fill" className="size-4" />
                ) : (
                  <FilmSlate weight="bold" className="size-4" />
                )}
                {importPhase === "importing"
                  ? "Importing..."
                  : importPhase === "done"
                    ? "Saved"
                    : "Save draft clip"}
              </button>
            </form>
          ) : (
            <div className="mt-5">
              <EmptyState text="Your selected video appears here. Then choose the start time, end time, title, and price." />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed border-border bg-background/60 px-5 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
