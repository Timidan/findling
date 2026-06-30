import { describe, it, expect } from "vitest";
import {
  validateUpload,
  sniffVideoContainer,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_DURATION_MS,
} from "./validation";

const ok = {
  mimeType: "video/mp4",
  sizeBytes: 10 * 1024 * 1024,
  durationMs: 12_000,
};

describe("validateUpload", () => {
  it("accepts an mp4 within limits", () => {
    expect(validateUpload(ok)).toEqual({ ok: true });
  });

  it("accepts a webm within limits", () => {
    expect(validateUpload({ ...ok, mimeType: "video/webm" })).toEqual({
      ok: true,
    });
  });

  it("accepts exactly at the size and duration limits", () => {
    expect(
      validateUpload({
        mimeType: "video/mp4",
        sizeBytes: MAX_UPLOAD_BYTES,
        durationMs: MAX_DURATION_MS,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects unsupported mime types", () => {
    expect(validateUpload({ ...ok, mimeType: "video/quicktime" }).ok).toBe(false);
    expect(validateUpload({ ...ok, mimeType: "image/png" }).ok).toBe(false);
  });

  it("rejects files over the size limit", () => {
    expect(validateUpload({ ...ok, sizeBytes: MAX_UPLOAD_BYTES + 1 }).ok).toBe(
      false,
    );
  });

  it("rejects clips over the duration limit", () => {
    expect(validateUpload({ ...ok, durationMs: MAX_DURATION_MS + 1 }).ok).toBe(
      false,
    );
  });

  it("rejects non-positive size or duration", () => {
    expect(validateUpload({ ...ok, sizeBytes: 0 }).ok).toBe(false);
    expect(validateUpload({ ...ok, durationMs: 0 }).ok).toBe(false);
    expect(validateUpload({ ...ok, sizeBytes: -1 }).ok).toBe(false);
    expect(validateUpload({ ...ok, durationMs: -1 }).ok).toBe(false);
  });

  it("sniffs an MP4 from its ftyp magic at offset 4", () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(sniffVideoContainer(mp4)).toBe("video/mp4");
  });

  it("sniffs a WebM from its EBML magic", () => {
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);
    expect(sniffVideoContainer(webm)).toBe("video/webm");
  });

  it("rejects bytes that are neither MP4 nor WebM (e.g. HTML/PNG polyglot)", () => {
    expect(sniffVideoContainer(new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54]))).toBeNull(); // <!DOCT
    expect(sniffVideoContainer(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(sniffVideoContainer(new Uint8Array([]))).toBeNull();
  });

  it("exposes the limits", () => {
    expect(ALLOWED_MIME_TYPES).toContain("video/mp4");
    expect(ALLOWED_MIME_TYPES).toContain("video/webm");
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_DURATION_MS).toBe(60_000);
  });
});
