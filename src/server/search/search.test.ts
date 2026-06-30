import { describe, it, expect } from "vitest";
import { buildMomentSourceText } from "./source-text";
import { MockEmbeddingProvider } from "./mock-embedding-provider";
import { EMBEDDING_DIMENSIONS } from "./types";

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

describe("buildMomentSourceText", () => {
  it("is deterministic for the same input", () => {
    const a = buildMomentSourceText({ title: "Sunset", description: "golden hour" });
    const b = buildMomentSourceText({ title: "Sunset", description: "golden hour" });
    expect(a.hash).toBe(b.hash);
    expect(a.text).toBe(b.text);
  });

  it("changes the hash when content changes", () => {
    const a = buildMomentSourceText({ title: "Sunset" });
    const b = buildMomentSourceText({ title: "Sunrise" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("folds in tags and captions", () => {
    const { text } = buildMomentSourceText({
      title: "Goal",
      tags: ["soccer", "celebration"],
      captions: ["last-minute winner", null, "  "],
    });
    expect(text).toContain("Goal");
    expect(text).toContain("#soccer");
    expect(text).toContain("last-minute winner");
  });
});

describe("MockEmbeddingProvider", () => {
  const provider = new MockEmbeddingProvider();

  it("emits EMBEDDING_DIMENSIONS unit vectors", async () => {
    const [v] = await provider.embed(["hello world"]);
    expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(provider.dimensions).toBe(EMBEDDING_DIMENSIONS);
    expect(Math.sqrt(dot(v, v))).toBeCloseTo(1, 6); // unit length
  });

  it("is deterministic: same text → cosine 1.0", async () => {
    const [a] = await provider.embed(["anime opening shot"]);
    const [b] = await provider.embed(["anime opening shot"]);
    expect(dot(a, b)).toBeCloseTo(1, 6);
  });

  it("separates different text (cosine well below 1)", async () => {
    const [a] = await provider.embed(["a serene mountain lake at dawn"]);
    const [b] = await provider.embed(["a chaotic city street at night"]);
    expect(dot(a, b)).toBeLessThan(0.2);
  });

  it("embeds a batch in order", async () => {
    const vs = await provider.embed(["one", "two", "three"]);
    expect(vs).toHaveLength(3);
    const [solo] = await provider.embed(["two"]);
    expect(dot(vs[1], solo)).toBeCloseTo(1, 6);
  });
});
