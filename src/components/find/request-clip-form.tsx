"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  CircleNotch,
  Copy,
  LinkSimple,
  Plus,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

type RequestSourceKind =
  | "url"
  | "youtube_channel"
  | "peertube_channel"
  | "handle";

const SOURCE_OPTIONS: { value: RequestSourceKind; label: string }[] = [
  { value: "url", label: "Source link" },
  { value: "youtube_channel", label: "YouTube" },
  { value: "peertube_channel", label: "PeerTube" },
  { value: "handle", label: "Creator handle" },
];

interface RequestResponse {
  claimUrl?: string;
  error?: string;
  reason?: string;
}

function messageForError(data: RequestResponse | null): string {
  if (data?.error === "unauthenticated") return "Connect your wallet first.";
  if (data?.error === "request_conflict") return "That request already exists.";
  if (data?.error === "invalid_request") return "Check the request details.";
  return "Could not post the request. Try again.";
}

export function RequestClipForm({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [externalIdentity, setExternalIdentity] = useState("");
  const [externalIdentityKind, setExternalIdentityKind] =
    useState<RequestSourceKind>("url");
  const [externalRef, setExternalRef] = useState("");
  const [sourceLicenceLabel, setSourceLicenceLabel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCopied(false);
    if (!signedIn) {
      setError("Connect your wallet first.");
      return;
    }
    if (!title.trim()) {
      setError("Add the clip you want.");
      return;
    }
    if (!externalIdentity.trim()) {
      setError("Add the creator, channel, or source.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/find/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          externalIdentity: externalIdentity.trim(),
          externalIdentityKind,
          externalRef: externalRef.trim() || undefined,
          sourceLicenceLabel: sourceLicenceLabel.trim() || undefined,
          description: note.trim() || undefined,
          relevanceText: note.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as RequestResponse | null;
      if (!res.ok) {
        setError(messageForError(data));
        return;
      }
      setClaimUrl(data?.claimUrl ?? null);
      setTitle("");
      setExternalIdentity("");
      setExternalIdentityKind("url");
      setExternalRef("");
      setSourceLicenceLabel("");
      setNote("");
      router.replace("/find?tab=wanted", { scroll: false });
      router.refresh();
    } catch {
      setError("Could not post the request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyClaimUrl() {
    if (!claimUrl) return;
    await navigator.clipboard.writeText(claimUrl);
    setCopied(true);
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-xl tracking-tight">Request a clip</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Ask for a video you want to use. If the creator claims it and uploads
            the clip, it becomes available here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          <Plus weight="bold" className="size-4" />
          {open ? "Close" : "New request"}
        </button>
      </div>

      {claimUrl && (
        <div className="mt-4 rounded-xl border border-sage/30 bg-sage/10 p-3 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle weight="fill" className="mt-0.5 size-4 shrink-0 text-sage" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">Request posted</p>
              <p className="mt-1 text-muted-foreground">
                Send this claim link to the creator so they can upload the clip.
              </p>
              <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                <a
                  href={claimUrl}
                  className="min-w-0 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs text-sage"
                >
                  {claimUrl}
                </a>
                <button
                  type="button"
                  onClick={copyClaimUrl}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium"
                >
                  <Copy weight="bold" className="size-3.5" />
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Clip to find
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="e.g. founder explains pricing"
                className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-sage"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Creator or source
              <input
                value={externalIdentity}
                onChange={(e) => setExternalIdentity(e.target.value)}
                maxLength={160}
                placeholder="Creator name, channel, or site"
                className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-sage"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <label className="grid gap-1.5 text-sm font-medium">
              Source type
              <select
                value={externalIdentityKind}
                onChange={(e) =>
                  setExternalIdentityKind(e.target.value as RequestSourceKind)
                }
                className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-sage"
              >
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Link
              <span className="relative">
                <LinkSimple
                  weight="bold"
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                  maxLength={500}
                  placeholder="Optional video, channel, or post link"
                  className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3.5 text-sm outline-none focus-visible:border-sage"
                />
              </span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Rights note
              <input
                value={sourceLicenceLabel}
                onChange={(e) => setSourceLicenceLabel(e.target.value)}
                maxLength={80}
                placeholder="Optional, e.g. CC BY"
                className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-sage"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Use case
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={240}
                placeholder="Optional, what you need it for"
                className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-sage"
              />
            </label>
          </div>

          {!signedIn && (
            <p className="text-sm text-muted-foreground">
              Connect your wallet from the header before posting a request.
            </p>
          )}
          {error && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
              <WarningCircle weight="fill" className="size-4 shrink-0" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !signedIn}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50 sm:w-auto sm:justify-self-start"
          >
            {busy ? (
              <>
                <CircleNotch weight="bold" className="size-4 animate-spin" />
                Posting...
              </>
            ) : (
              <>
                <Plus weight="bold" className="size-4" />
                Post request
              </>
            )}
          </button>
        </form>
      )}
    </section>
  );
}
