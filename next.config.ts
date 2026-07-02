import type { NextConfig } from "next";
import path from "node:path";

// Comprehensive but non-breaking security posture. The hard headers below are
// safe to enforce everywhere; the Content-Security-Policy ships in REPORT-ONLY
// so it can't break wallet connections, Supabase storage, RPC, or images on day
// one — observe violations, then promote to an enforcing `Content-Security-Policy`.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Next.js needs inline/eval for its runtime; tighten with nonces later.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  // wallets / RPC / Supabase / x402 facilitator over https + wss
  "connect-src 'self' https: wss:",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  // HTTPS-only. Assumes the droplet terminates TLS (nginx) — required for a
  // public deployment. Remove/shorten max-age if serving plain HTTP during setup.
  { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray pnpm-lock.yaml in the home
  // dir otherwise makes Next infer the wrong root for file tracing).
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Transformers.js loads a native ONNX runtime — keep it out of the bundle so
  // the server resolves it via native require (the local embedding provider).
  serverExternalPackages: ["@huggingface/transformers"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
