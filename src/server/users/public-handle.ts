/**
 * The one place that turns a user row into a PUBLIC-safe display handle.
 *
 * Cascade: username → displayName → shortened wallet address → generic fallback.
 * NEVER falls back to email — the email local-part is PII and must not leak onto
 * public surfaces (receipts `/r/[slug]`, run traces `/trace/[runId]`, feed). The
 * feed/moment-detail read-models already use this cascade; receipt/trace must
 * reuse THIS helper so no surface silently reintroduces the email fallback.
 */
export interface PublicHandleInput {
  username?: string | null;
  displayName?: string | null;
  walletAddress?: string | null;
}

export function shortenWallet(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function publicHandle(
  user: PublicHandleInput | null | undefined,
  fallback = "anonymous",
): string {
  if (!user) return fallback;
  if (user.username) return user.username;
  if (user.displayName) return user.displayName;
  if (user.walletAddress) return shortenWallet(user.walletAddress);
  return fallback;
}
