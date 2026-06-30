/**
 * CSRF defense-in-depth for cookie-authed, state-changing route handlers.
 *
 * Next.js Route Handlers (unlike Server Actions) get NO built-in Origin check,
 * and the session cookie is only `SameSite=lax`. So for any cookie-authed
 * mutation we additionally reject cross-origin browser requests by comparing the
 * `Origin` header to our canonical host. Browsers always send `Origin` on
 * cross-site POSTs; non-browser callers (agents) send none, so they pass.
 */
import { resolveAuthDomain } from "./siwe";

type HasHeaders = { headers: { get(name: string): string | null } };

/**
 * True when the request is same-origin (or has no `Origin`, i.e. a non-browser
 * caller). False only when a browser presents a cross-origin `Origin`.
 */
export function isSameOrigin(req: HasHeaders): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // server-to-server / agent — no Origin to forge
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // malformed Origin — reject
  }
  return originHost === resolveAuthDomain(req.headers.get("host"));
}
