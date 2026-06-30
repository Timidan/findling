/**
 * Single source for the HMAC signing secret used by sessions and agent-key
 * hashing. Required (>=32 chars) in EVERY environment and fails closed — there
 * is no insecure fallback, so a known secret can never be used to forge
 * sessions, regardless of NODE_ENV. Generate with `openssl rand -hex 32`.
 */
export function authSecret(): string {
  const s = process.env.AUTH_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "AUTH_SESSION_SECRET (>=32 chars) is required. Generate one with `openssl rand -hex 32`.",
    );
  }
  return s;
}
