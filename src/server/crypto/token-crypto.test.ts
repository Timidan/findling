import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { createTokenCipher } from "./token-crypto";

const key = randomBytes(32);

describe("createTokenCipher", () => {
  it("round-trips a token through encrypt/decrypt", () => {
    const c = createTokenCipher(key);
    const secret = "1//refresh-token-abc123";
    expect(c.decrypt(c.encrypt(secret))).toBe(secret);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const c = createTokenCipher(key);
    expect(c.encrypt("same")).not.toBe(c.encrypt("same"));
  });

  it("rejects a tampered ciphertext (GCM auth tag)", () => {
    const c = createTokenCipher(key);
    const parts = c.encrypt("secret").split(".");
    const ct = Buffer.from(parts[2], "base64");
    ct[0] ^= 0xff;
    parts[2] = ct.toString("base64");
    expect(() => c.decrypt(parts.join("."))).toThrow();
  });

  it("fails to decrypt with a different key", () => {
    const a = createTokenCipher(key);
    const b = createTokenCipher(randomBytes(32));
    expect(() => b.decrypt(a.encrypt("secret"))).toThrow();
  });

  it("rejects malformed payloads", () => {
    const c = createTokenCipher(key);
    expect(() => c.decrypt("not-a-valid-payload")).toThrow();
  });

  it("requires a 32-byte key", () => {
    expect(() => createTokenCipher(randomBytes(16))).toThrow();
  });
});
