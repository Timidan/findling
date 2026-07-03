import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  existsSync: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  removeObject: vi.fn(),
  uploadObject: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: mocks.execFile,
}));

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mocks.mkdir,
  readFile: mocks.readFile,
  rm: mocks.rm,
}));

vi.mock("@/server/storage/supabase-storage", () => ({
  supabaseStorage: {
    removeObject: mocks.removeObject,
    uploadObject: mocks.uploadObject,
  },
}));

import { createUploadDerivatives } from "./ffmpeg";

describe("createUploadDerivatives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execFile.mockImplementation((_bin, _args, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      cb(null, { stdout: "", stderr: "" });
    });
    mocks.existsSync.mockReturnValue(true);
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.readFile.mockResolvedValue(Buffer.from("media"));
    mocks.rm.mockResolvedValue(undefined);
    mocks.uploadObject.mockResolvedValue(undefined);
  });

  it("keeps optional source audio in generated preview videos", async () => {
    await createUploadDerivatives({
      sourceUrl: "https://storage.example/source.mp4",
      creatorId: "creator-1",
      durationMs: 12_000,
    });

    const ffmpegCalls = mocks.execFile.mock.calls.filter(
      ([binary]) => binary === "ffmpeg",
    );
    const previewArgs = ffmpegCalls.at(-1)?.[1] as string[] | undefined;

    expect(previewArgs).toBeDefined();
    expect(previewArgs).not.toContain("-an");
    expect(previewArgs).toEqual(
      expect.arrayContaining(["-map", "0:v:0", "-map", "0:a?", "-c:a", "aac"]),
    );
  });
});
