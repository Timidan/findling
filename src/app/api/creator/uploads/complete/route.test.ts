import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  completeUpload: vi.fn(),
  createUploadDerivatives: vi.fn(),
  markUploadIntentCompleted: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  removeObject: vi.fn(),
  getObjectInfo: vi.fn(),
  readObjectHead: vi.fn(),
  createSignedDownloadUrl: vi.fn(),
}));

vi.mock("@/server/auth/current-user", () => ({
  requireUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/server/auth/csrf", () => ({
  isSameOrigin: vi.fn(() => true),
}));

vi.mock("@/server/ratelimit/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/server/uploads/upload-intent", () => ({
  markUploadIntentCompleted: mocks.markUploadIntentCompleted,
}));

vi.mock("@/server/storage/supabase-storage", () => ({
  supabaseStorage: {
    removeObject: mocks.removeObject,
    getObjectInfo: mocks.getObjectInfo,
    readObjectHead: mocks.readObjectHead,
    createSignedDownloadUrl: mocks.createSignedDownloadUrl,
  },
}));

vi.mock("@/server/catalog/catalog", () => ({
  DEFAULT_MOMENT_PRICE_MICRO_USDC: 50_000,
  priceUsdSnapshotFor: vi.fn(() => "0.050"),
  completeUpload: mocks.completeUpload,
}));

vi.mock("@/server/clip/ffmpeg", () => ({
  probeDurationMs: vi.fn(async () => 12_000),
  assertWithinMaxDuration: vi.fn(),
  createUploadDerivatives: mocks.createUploadDerivatives,
}));

describe("POST /api/creator/uploads/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getObjectInfo.mockResolvedValue({
      sizeBytes: 1024,
      contentType: "video/mp4",
    });
    mocks.readObjectHead.mockResolvedValue(
      Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0, 0, 0, 0, 0]),
    );
    mocks.createSignedDownloadUrl.mockResolvedValue("https://storage.example/signed-source.mp4");
    mocks.createUploadDerivatives.mockResolvedValue({
      posterStorageKey: "clips/user-1/poster.jpg",
      previewStorageKey: "previews/user-1/preview.mp4",
    });
    mocks.completeUpload.mockResolvedValue({
      moment: { id: "moment-1", assetId: "asset-1", status: "draft" },
    });
  });

  it("finalizes direct uploads with generated poster and preview keys", async () => {
    const response = await POST(
      new NextRequest("https://findling.timidan.xyz/api/creator/uploads/complete", {
        method: "POST",
        body: JSON.stringify({
          storageKey: "uploads/user-1/11111111-1111-4111-8111-111111111111.mp4",
          title: "Relationship advice",
          description: "Short practical clip",
          attestationAccepted: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createUploadDerivatives).toHaveBeenCalledWith({
      sourceUrl: "https://storage.example/signed-source.mp4",
      creatorId: "user-1",
      durationMs: 12_000,
    });
    expect(mocks.completeUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        posterStorageKey: "clips/user-1/poster.jpg",
        previewStorageKey: "previews/user-1/preview.mp4",
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/studio");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/studio/clips");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("studio-catalog", "max");
  });

  it("cleans generated derivatives if finalization fails", async () => {
    mocks.completeUpload.mockRejectedValueOnce(new Error("db unavailable"));
    const storageKey = "uploads/user-1/11111111-1111-4111-8111-111111111111.mp4";

    const response = await POST(
      new NextRequest("https://findling.timidan.xyz/api/creator/uploads/complete", {
        method: "POST",
        body: JSON.stringify({
          storageKey,
          title: "Relationship advice",
          attestationAccepted: true,
        }),
      }),
    );

    expect(response.status).toBe(502);
    expect(mocks.removeObject).toHaveBeenCalledWith(storageKey);
    expect(mocks.removeObject).toHaveBeenCalledWith("clips/user-1/poster.jpg");
    expect(mocks.removeObject).toHaveBeenCalledWith("previews/user-1/preview.mp4");
  });
});
