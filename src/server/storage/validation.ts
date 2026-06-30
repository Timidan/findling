// Pure upload validation for direct-upload moments. No I/O.
export const ALLOWED_MIME_TYPES = ["video/mp4", "video/webm"] as const;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_DURATION_MS = 60_000; // 60 s

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export interface UploadValidationInput {
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
}

export type UploadValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Sniff a video container from the FIRST BYTES of a file (magic numbers) so the
 * upload pipeline validates the real bytes, not a client-supplied Content-Type
 * (which is attacker-controlled on a direct-to-storage upload).
 *   - MP4 / ISO-BMFF: bytes 4..7 == "ftyp"
 *   - WebM / Matroska: starts with the EBML magic 0x1A 45 DF A3
 * Returns the detected container, or null if it is neither.
 */
export function sniffVideoContainer(head: Uint8Array): AllowedMimeType | null {
  if (
    head.length >= 4 &&
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3
  ) {
    return "video/webm";
  }
  if (
    head.length >= 8 &&
    head[4] === 0x66 && // f
    head[5] === 0x74 && // t
    head[6] === 0x79 && // y
    head[7] === 0x70 // p
  ) {
    return "video/mp4";
  }
  return null;
}

export function validateUpload({
  mimeType,
  sizeBytes,
  durationMs,
}: UploadValidationInput): UploadValidationResult {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "File is empty or has an invalid size." };
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, error: "Clip has an invalid or zero duration." };
  }
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return {
      ok: false,
      error: `Unsupported format "${mimeType}". Use MP4 or WebM.`,
    };
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "File is too large (max 25 MB)." };
  }
  if (durationMs > MAX_DURATION_MS) {
    return { ok: false, error: "Clip is too long (max 60s)." };
  }
  return { ok: true };
}
