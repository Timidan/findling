import { describe, it, expect } from "vitest";
import { refill, consume, type BucketConfig } from "./token-bucket";

const cfg: BucketConfig = { capacity: 10, refillPerSec: 1 }; // 1 token/sec, burst 10

describe("token-bucket refill", () => {
  it("a fresh bucket starts full at capacity", () => {
    expect(refill(null, 0, cfg)).toBe(10);
  });

  it("refills linearly with elapsed time, capped at capacity", () => {
    expect(refill({ tokens: 2, updatedAtMs: 0 }, 3_000, cfg)).toBe(5); // +3s = +3
    expect(refill({ tokens: 8, updatedAtMs: 0 }, 60_000, cfg)).toBe(10); // capped
  });

  it("never goes backwards for a non-monotonic clock", () => {
    expect(refill({ tokens: 4, updatedAtMs: 5_000 }, 0, cfg)).toBe(4);
  });
});

describe("token-bucket consume", () => {
  it("allows and decrements while tokens remain", () => {
    const d = consume({ tokens: 3, updatedAtMs: 0 }, 0, cfg);
    expect(d.allowed).toBe(true);
    expect(d.tokens).toBe(2);
    expect(d.retryAfterSec).toBe(0);
  });

  it("denies when empty and does NOT consume (tokens unchanged)", () => {
    const d = consume({ tokens: 0, updatedAtMs: 0 }, 0, cfg);
    expect(d.allowed).toBe(false);
    expect(d.tokens).toBe(0);
  });

  it("computes retryAfter from the refill rate", () => {
    // empty bucket, 1 token/sec → need ~1s for the next token
    expect(consume({ tokens: 0, updatedAtMs: 0 }, 0, cfg).retryAfterSec).toBe(1);
    // slow refill: 0.1/sec, empty → 10s to earn 1 token
    const slow = consume({ tokens: 0, updatedAtMs: 0 }, 0, { capacity: 5, refillPerSec: 0.1 });
    expect(slow.retryAfterSec).toBe(10);
  });

  it("exhausts a full bucket in exactly `capacity` calls", () => {
    let state = { tokens: cfg.capacity, updatedAtMs: 0 };
    let allowed = 0;
    for (let i = 0; i < 15; i++) {
      const d = consume(state, 0, cfg); // clock frozen → no refill
      if (d.allowed) allowed++;
      state = { tokens: d.tokens, updatedAtMs: 0 };
    }
    expect(allowed).toBe(10);
  });

  it("honors a custom cost", () => {
    const d = consume({ tokens: 5, updatedAtMs: 0 }, 0, { ...cfg, cost: 5 });
    expect(d.allowed).toBe(true);
    expect(d.tokens).toBe(0);
    expect(consume({ tokens: 4, updatedAtMs: 0 }, 0, { ...cfg, cost: 5 }).allowed).toBe(false);
  });
});
