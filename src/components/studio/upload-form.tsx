"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  UploadSimple,
  CircleNotch,
  CheckCircle,
  WarningCircle,
  FilmSlate,
  X,
} from "@phosphor-icons/react";

const ALLOWED = ["video/mp4", "video/webm"];
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_MS = 60_000;

type Phase = "idle" | "uploading" | "finalizing" | "done" | "error";

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/**
 * Direct-upload a short clip: read its duration client-side, presign a signed
 * upload target, PUT the file, then finalize into a creator asset. Mirrors the
 * server's validation (MP4/WebM · ≤25 MB · ≤60 s) for instant feedback.
 */
export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rights, setRights] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const probeRef = useRef(0); // supersedes stale duration-probe events

  const pick = useCallback(
    (f: File | null) => {
      ++probeRef.current;
      setError(null);
      setDurationMs(null);
      if (!f) {
        setFile(null);
        return;
      }
      if (!ALLOWED.includes(f.type)) {
        setError("Use an MP4 or WebM video.");
        setFile(null);
        return;
      }
      if (f.size > MAX_BYTES) {
        setError("File is too large (max 25 MB).");
        setFile(null);
        return;
      }
      setFile(f);
      const myProbe = probeRef.current;
      const url = URL.createObjectURL(f);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (probeRef.current !== myProbe) return; // superseded by a newer pick
        const ms = Math.round(v.duration * 1000);
        if (!Number.isFinite(ms) || ms <= 0) {
          setError("Couldn't read the clip duration.");
          setFile(null);
          return;
        }
        if (ms > MAX_MS) {
          setError("Clip is too long (max 60s).");
          setFile(null);
          return;
        }
        setDurationMs(ms);
        setTitle((t) => t || f.name.replace(/\.[^.]+$/, ""));
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        if (probeRef.current !== myProbe) return;
        setError("Couldn't read that video file.");
        setFile(null);
      };
      v.src = url;
    },
    [],
  );

  const busy = phase === "uploading" || phase === "finalizing";

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!file || durationMs == null) return setError("Choose a video first.");
      if (!title.trim()) return setError("Add a title.");
      if (!rights) return setError("Confirm you have the rights to license this clip.");
      setError(null);
      setPhase("uploading");
      try {
        const pres = await fetch("/api/creator/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: file.type, sizeBytes: file.size, durationMs }),
        });
        const presJson = await pres.json().catch(() => null);
        if (!pres.ok) throw new Error(presJson?.error ?? "Could not start the upload.");
        const { uploadUrl, storageKey } = presJson as { uploadUrl: string; storageKey: string };

        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("Upload failed. Check your connection and try again.");

        setPhase("finalizing");
        const comp = await fetch("/api/creator/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storageKey,
            title: title.trim(),
            description: description.trim() || undefined,
            attestationAccepted: true,
          }),
        });
        const compJson = await comp.json().catch(() => null);
        if (!comp.ok) throw new Error(compJson?.error ?? "Could not finalize the moment.");
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setPhase("error");
      }
    },
    [file, durationMs, title, description, rights],
  );

  if (phase === "done") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-sage/15 text-sage">
          <CheckCircle weight="fill" className="size-7" />
        </span>
        <div>
          <h2 className="font-display text-2xl tracking-tight">Clip uploaded</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            &ldquo;{title.trim()}&rdquo; is now a draft moment. Set its USDC price in Clips and
            hit Publish so agents can discover it.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/studio/clips"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            Go to Clips
          </Link>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setDurationMs(null);
              setTitle("");
              setDescription("");
              setRights(false);
              setPhase("idle");
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary/60"
          >
            Upload another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center transition-colors hover:border-sage/50 hover:bg-card"
        >
          <span className="grid size-12 place-items-center rounded-full bg-secondary text-sage">
            <UploadSimple weight="bold" className="size-6" />
          </span>
          <span className="font-medium">Choose a video</span>
          <span className="text-sm text-muted-foreground">MP4 or WebM · up to 25 MB · up to 60s</span>
        </button>
      ) : (
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-sage">
            <FilmSlate weight="duotone" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="tabular mt-0.5 text-xs text-muted-foreground">
              {mb(file.size)}
              {durationMs != null ? ` · ${secs(durationMs)}` : " · reading..."}
            </p>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={() => pick(null)}
              aria-label="Remove file"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X weight="bold" className="size-4" />
            </button>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        id="moment-file"
        type="file"
        accept="video/mp4,video/webm"
        aria-label="Choose a video file to upload"
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />

      <div className="space-y-2">
        <label htmlFor="moment-title" className="block text-sm font-medium">
          Title
        </label>
        <input
          id="moment-title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="e.g. Snowboard backcountry spray"
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-sage"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="moment-desc" className="block text-sm font-medium">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="moment-desc"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="What's the licensable moment? Helps agents find it."
          className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-sage"
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4">
        <input
          type="checkbox"
          checked={rights}
          onChange={(e) => setRights(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-sage"
        />
        <span className="text-sm text-muted-foreground">
          I own or control the rights to this clip and may license it to others.
        </span>
      </label>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
          <WarningCircle weight="fill" className="size-4 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !file || durationMs == null}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50 sm:w-auto"
      >
        {busy ? (
          <>
            <CircleNotch weight="bold" className="size-4 animate-spin" />
            {phase === "finalizing" ? "Finalizing..." : "Uploading..."}
          </>
        ) : (
          <>
            <UploadSimple weight="bold" className="size-4" />
            Upload clip
          </>
        )}
      </button>
    </form>
  );
}
