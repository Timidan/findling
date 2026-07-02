"use client";

import { useState } from "react";
import Link from "next/link";
import {
  SealCheck,
  UploadSimple,
  CircleNotch,
  Broadcast,
} from "@phosphor-icons/react/dist/ssr";

/**
 * The interactive claim → upload → activate CTA on a claim page.
 *
 *  - open    → "Claim this moment" (POST /api/claim/:token, SIWE session).
 *  - claimed → upload your clip (links to /studio/upload?claim=:token); once a
 *              published moment is in hand (?moment=… on return), "Go live"
 *              activates it (POST /api/claim/:token/activate { momentId }).
 *  - activated → live; the waiting agents can pay.
 *
 * The unguessable secret is the token in the URL; the routes verify it server-side
 * and bind the claim/activation to the session user.
 */
interface ActorProof {
  required: boolean;
  kind: string;
  token: string;
  externalRef: string | null;
  acceptedFields: readonly string[];
  instructions: string;
}

export function ClaimAction({
  token,
  connected,
  initialStatus,
  momentId,
  actorControlProof,
  endpoints,
}: {
  /** The claim secret, for the /claim/:token page. Omit when `endpoints` is given. */
  token?: string;
  connected: boolean;
  initialStatus: string;
  momentId?: string | null;
  actorControlProof?: ActorProof | null;
  /** Override the claim/activate/upload targets (the discovery-hub claim-start
   *  path keys on a public listingId instead of the secret token). */
  endpoints?: { claim: string; activate: string; uploadHref: string };
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState("");

  const claimPath = endpoints?.claim ?? `/api/claim/${token}`;
  const activatePath = endpoints?.activate ?? `/api/claim/${token}/activate`;
  const uploadHref =
    endpoints?.uploadHref ?? `/studio/upload?claim=${encodeURIComponent(token ?? "")}`;

  async function post(path: string, body: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body,
      });
      if (res.status === 401) {
        setError("Connect your wallet above first, then try again.");
        return null;
      }
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          reason?: string;
          error?: string;
        };
        setError(humanError(b.reason ?? b.error));
        return null;
      }
      return (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      setError("Network error. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  // ── activated ────────────────────────────────────────────────────────────
  if (status === "activated") {
    return (
      <div className="rounded-2xl border border-sage/30 bg-sage/5 px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-sage">
          <Broadcast weight="fill" className="size-4" /> Live. Agents can use it now
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your clip is published and agents following this request have been notified. You keep 80%
          every time it is used. Check your earnings in the Studio.
        </p>
        <Link
          href="/studio/earnings"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          View earnings
        </Link>
      </div>
    );
  }

  // ── claimed ──────────────────────────────────────────────────────────────
  if (status === "claimed") {
    // returned with a published moment → offer to go live
    if (momentId) {
      return (
        <div className="rounded-2xl border border-sage/30 bg-sage/5 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-sage">
            <SealCheck weight="fill" className="size-4" /> Clip published. Ready to go live
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Go live to notify agents following this request. They pay when they use the clip
            and you keep 80%.
          </p>
          <button
            type="button"
            onClick={() =>
              post(activatePath, JSON.stringify({ momentId })).then(
                (r) => r && setStatus("activated"),
              )
            }
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {busy && <CircleNotch weight="bold" className="size-4 animate-spin" />}
            {busy ? "Going live..." : "Go live"}
          </button>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      );
    }
    // claimed, needs a clip
    return (
      <div className="rounded-2xl border border-sage/30 bg-sage/5 px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-sage">
          <SealCheck weight="fill" className="size-4" /> Claimed. It is yours
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your own version and publish it. Then come back here to go live.
          You keep 80% when it is used.
        </p>
        <Link
          href={uploadHref}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          <UploadSimple weight="bold" className="size-4" />
          Upload your clip
        </Link>
      </div>
    );
  }

  // ── open: actor-control kinds must prove they control the channel ──────────
  if (actorControlProof?.required) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <p className="text-sm font-medium">Prove you control this channel</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {actorControlProof.instructions}
          </p>
          <code className="tabular mt-3 block break-all rounded-lg bg-secondary px-3 py-2 text-xs">
            {actorControlProof.token}
          </code>
          <input
            value={proofUrl}
            onChange={(e) => setProofUrl(e.target.value)}
            placeholder="optional: a public video URL on your instance"
            className="mt-3 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs outline-none focus-visible:border-sage"
          />
        </div>
        <button
          type="button"
          onClick={() =>
            post(
              claimPath,
              JSON.stringify({
                proof: {
                  type: actorControlProof.kind,
                  token: actorControlProof.token,
                  proofUrl: proofUrl.trim() || undefined,
                },
              }),
            ).then((r) => r && setStatus("claimed"))
          }
          disabled={busy || !connected}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <CircleNotch weight="bold" className="size-4 animate-spin" />}
          {busy ? "Verifying..." : "Verify and claim request"}
        </button>
        {!connected && (
          <p className="text-xs text-muted-foreground">
            Connect your wallet above to claim.
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  // ── open: baseline (non-actor-control) ─────────────────────────────────────
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          post(claimPath, "{}").then((r) => r && setStatus("claimed"))
        }
        disabled={busy || !connected}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && <CircleNotch weight="bold" className="size-4 animate-spin" />}
        {busy ? "Claiming..." : "Claim request"}
      </button>
      {!connected && (
        <p className="mt-2 text-xs text-muted-foreground">
          Connect your wallet above to claim.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function humanError(reason?: string): string {
  switch (reason) {
    case "finder_cannot_claim_own_listing":
      return "You created this request, so you can't claim it yourself.";
    case "actor_proof_failed":
    case "actor_proof_required":
      return "We couldn't verify you control this channel.";
    case "listing_not_claimable":
      return "This request has already been claimed.";
    case "not_moment_owner":
      return "That clip isn't owned by this account.";
    case "moment_not_licensable":
      return "Publish your clip first, then go live.";
    default:
      return "Something went wrong. Try again.";
  }
}
