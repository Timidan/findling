import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

export interface TokenCipher {
  encrypt(plaintext: string): string;
  decrypt(payload: string): string;
}

/**
 * AES-256-GCM authenticated cipher for small secrets (the YouTube OAuth refresh
 * tokens stored at rest). Payload = base64(iv).base64(authTag).base64(ciphertext).
 *
 * INVARIANT: a fresh random 96-bit IV is generated per encrypt() — a key+IV pair
 * must never repeat (GCM nonce reuse is catastrophic). decrypt() verifies the GCM
 * auth tag, so tampering/truncation throws rather than returning bad plaintext.
 */
export function createTokenCipher(key: Buffer): TokenCipher {
  if (key.length !== 32) {
    throw new Error("Token cipher key must be 32 bytes (AES-256).");
  }
  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ct = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return [iv, tag, ct].map((b) => b.toString("base64")).join(".");
    },
    decrypt(payload) {
      const parts = payload.split(".");
      if (parts.length !== 3) throw new Error("Malformed token payload.");
      const [iv, tag, ct] = parts.map((p) => Buffer.from(p, "base64"));
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
        "utf8",
      );
    },
  };
}

/**
 * Resolve the 32-byte AES key from YOUTUBE_TOKEN_ENC_KEY. Accepts, in order:
 *   - a 64-char hex key (preferred: `openssl rand -hex 32`)
 *   - a 32-byte base64 key
 *   - a passphrase, scrypt-derived (>=32 chars; rejected below otherwise)
 * NOTE: the scrypt salt is fixed so the same passphrase always derives the same
 * key (required to decrypt previously-stored tokens) — which is why a strong,
 * high-entropy value matters; prefer a real random key over a passphrase in prod.
 */
function keyFromEnv(): Buffer {
  const raw = process.env.YOUTUBE_TOKEN_ENC_KEY;
  if (!raw) throw new Error("YOUTUBE_TOKEN_ENC_KEY is not set.");
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  // Reject obviously weak passphrases so a short string can't become a
  // brute-forceable key.
  if (raw.length < 32) {
    throw new Error(
      "YOUTUBE_TOKEN_ENC_KEY is too weak: use a 64-char hex key, a 32-byte base64 key, or a passphrase of >=32 chars.",
    );
  }
  return scryptSync(raw, "findling-youtube-token", 32);
}

let cached: TokenCipher | null = null;
export function tokenCipher(): TokenCipher {
  if (!cached) cached = createTokenCipher(keyFromEnv());
  return cached;
}
