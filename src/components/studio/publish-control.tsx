"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, CircleNotch, CheckCircle, WarningCircle } from "@phosphor-icons/react";

const ERRORS: Record<string, string> = {
  unauthenticated: "Sign in again to publish.",
  ownership_not_attested: "Rights aren't verified yet.",
  clip_not_ready: "The clip isn't ready yet.",
  not_owner: "You don't own this moment.",
};

/**
 * Owner-only publish action for a draft moment. Flips draft → published via
 * POST /api/creator/moments/{id}/publish (idempotent), then refreshes. Render
 * only for the owner; shows a "Live" pill once published.
 */
export function PublishControl({
  momentId,
  status,
}: {
  momentId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "published") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-sage">
        <CheckCircle weight="fill" className="size-3.5" /> Live
      </span>
    );
  }
  // Only drafts can be published from here (disabled/takedown are not).
  if (status !== "draft") return null;

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/creator/moments/${momentId}/publish`, {
        method: "POST",
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(ERRORS[d?.error ?? ""] ?? "Couldn't publish — try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={publish}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? (
          <CircleNotch weight="bold" className="size-3.5 animate-spin" />
        ) : (
          <Globe weight="bold" className="size-3.5" />
        )}
        Publish
      </button>
      {error && (
        <span role="alert" className="inline-flex items-center gap-1 text-[0.65rem] text-destructive">
          <WarningCircle weight="fill" className="size-3" /> {error}
        </span>
      )}
    </div>
  );
}
