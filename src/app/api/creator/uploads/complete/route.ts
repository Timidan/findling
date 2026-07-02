import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireUserId } from "@/server/auth/current-user";
import { isSameOrigin } from "@/server/auth/csrf";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";
import { markUploadIntentCompleted } from "@/server/uploads/upload-intent";
import {
  MAX_UPLOAD_BYTES,
  sniffVideoContainer,
  type AllowedMimeType,
} from "@/server/storage/validation";
import { supabaseStorage } from "@/server/storage/supabase-storage";
import {
  completeUpload,
  priceUsdSnapshotFor,
  DEFAULT_MOMENT_PRICE_MICRO_USDC,
} from "@/server/catalog/catalog";
import { probeDurationMs, assertWithinMaxDuration } from "@/server/clip/ffmpeg";
import {
  UPLOAD_ATTESTATION_TEXT,
  UPLOAD_ATTESTATION_VERSION,
} from "@/server/ownership/attestation";

export const runtime = "nodejs";
export const maxDuration = 120; // server-side ffprobe over the stored object

// Exactly the shape we mint at presign: uploads/<userId>/<uuid>.(mp4|webm).
// No slashes, no "..", no encoded separators can pass.
const KEY_NAME = /^[0-9a-fA-F-]{36}\.(mp4|webm)$/;

export async function POST(req: NextRequest) {
  // Cookie-authed browser mutation — reject cross-origin (CSRF defense-in-depth).
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }

  const limited = await enforceRateLimit("mutation", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    storageKey?: string;
    title?: string;
    description?: string;
    attestationAccepted?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { storageKey, title, description, attestationAccepted } = body;

  // 1) Strict key shape — must be the exact server-minted format for THIS user.
  const prefix = `uploads/${userId}/`;
  if (
    typeof storageKey !== "string" ||
    !storageKey.startsWith(prefix) ||
    !KEY_NAME.test(storageKey.slice(prefix.length))
  ) {
    return NextResponse.json(
      { error: "Unknown or unauthorized storageKey." },
      { status: 400 },
    );
  }

  if (typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (attestationAccepted !== true) {
    return NextResponse.json(
      { error: "You must confirm you have the rights to license this clip." },
      { status: 400 },
    );
  }
  // Coerce/bound text up front (a non-string would otherwise throw at .trim()
  // later — after the object is uploaded — leaving an orphan and a 500; and the
  // API must enforce its own length caps, not rely on the client's).
  const titleText = title.trim().slice(0, 200);
  const descriptionText =
    typeof description === "string" ? description.trim().slice(0, 500) : null;

  // 2) Validate the REAL uploaded object. The browser PUT the bytes straight to
  //    storage, so BOTH the stored Content-Type and the bytes are attacker-
  //    influenced: we measure the size server-side and sniff the container from
  //    the magic bytes (never trusting the client-declared MIME). Rejected
  //    uploads are deleted so orphaned objects don't accumulate.
  async function rejectAndCleanup(error: string, status: number) {
    try {
      await supabaseStorage.removeObject(storageKey as string);
    } catch (e) {
      console.error("[uploads/complete] cleanup failed for", storageKey, e);
    }
    return NextResponse.json({ error }, { status });
  }

  let info: { sizeBytes: number; contentType: string } | null;
  try {
    info = await supabaseStorage.getObjectInfo(storageKey);
  } catch {
    return NextResponse.json(
      { error: "Could not verify the uploaded file." },
      { status: 502 },
    );
  }
  if (!info) {
    return NextResponse.json(
      { error: "Upload not found — finish uploading the file first." },
      { status: 400 },
    );
  }
  if (info.sizeBytes <= 0 || info.sizeBytes > MAX_UPLOAD_BYTES) {
    return rejectAndCleanup("Uploaded file is empty or larger than 25 MB.", 400);
  }

  // Sniff the container from the first bytes — the authoritative type check.
  let container: AllowedMimeType | null;
  try {
    const head = await supabaseStorage.readObjectHead(storageKey, 16);
    container = sniffVideoContainer(head);
  } catch {
    return NextResponse.json(
      { error: "Could not verify the uploaded file." },
      { status: 502 },
    );
  }
  if (!container) {
    return rejectAndCleanup("Uploaded file is not a valid MP4 or WebM video.", 400);
  }

  // Probe the REAL duration server-side (ffprobe over a short-lived signed URL)
  // and enforce the authoritative ≤60s rule — the client-reported duration is
  // untrusted. (This also closes the "60s not enforced for uploads" gap.)
  let durationMs: number;
  try {
    const probeUrl = await supabaseStorage.createSignedDownloadUrl(storageKey, 120);
    durationMs = await probeDurationMs(probeUrl);
    assertWithinMaxDuration(durationMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (msg.includes("too long")) {
      return rejectAndCleanup("Clip is too long (max 60s).", 400);
    }
    return rejectAndCleanup("Could not read the clip — is it a valid video?", 400);
  }

  // A direct upload is already the final clip: create the source asset AND a draft
  // moment (at the default price, for the creator to adjust), atomically. The
  // sniffed container — not the client-claimed MIME — is recorded.
  const priceMicroUsdc = DEFAULT_MOMENT_PRICE_MICRO_USDC;
  try {
    const { moment } = await completeUpload({
      creatorId: userId,
      title: titleText,
      description: descriptionText,
      storageKey,
      mimeType: container,
      sizeBytes: info.sizeBytes,
      durationMs,
      priceMicroUsdc,
      priceUsdSnapshot: priceUsdSnapshotFor(priceMicroUsdc),
      attestationText: UPLOAD_ATTESTATION_TEXT,
      attestationVersion: UPLOAD_ATTESTATION_VERSION,
    });

    // Object is now a real deliverable — take it off the sweeper's list. Best-
    // effort: the upload already succeeded, so an intent-table hiccup must not
    // fail the request (the worst case is a harmless 'pending' row).
    try {
      await markUploadIntentCompleted(storageKey);
    } catch (e) {
      console.error("[uploads/complete] markUploadIntentCompleted failed:", e);
    }

    // the studio catalog (cached, tag "studio-catalog") now has a new draft moment
    revalidateTag("studio-catalog", "max");

    return NextResponse.json({
      momentId: moment.id,
      assetId: moment.assetId,
      status: moment.status,
      durationMs,
    });
  } catch (e) {
    // DB write failed after we accepted the object — clean it up, don't 500/orphan.
    console.error("[uploads/complete] completeUpload failed:", e);
    return rejectAndCleanup("Could not finalize the upload — please try again.", 502);
  }
}
