#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const production = args.has("--production") || process.env.NODE_ENV === "production";
const preferProcessEnv = args.has("--prefer-process-env") || process.env.CI === "true";
const requireWithdrawals =
  args.has("--require-withdrawals") || process.env.REQUIRE_WITHDRAWALS === "true";
const requireYoutube = args.has("--require-youtube") || process.env.REQUIRE_YOUTUBE === "true";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, valueRaw] = match;
    if (preferProcessEnv && process.env[key] != null && process.env[key] !== "") continue;
    const value = parseEnvValue(valueRaw);
    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

// Load base .env first, then .env.local so local values take precedence
// (matches Next.js's .env load order).
loadEnvFile(resolve(".env"));
loadEnvFile(resolve(".env.local"));

const errors = [];
const warnings = [];

function parseEnvValue(raw) {
  const value = raw.trim();
  const quote = value[0];
  if (quote === `"` || quote === "'") {
    let out = "";
    for (let i = 1; i < value.length; i += 1) {
      const ch = value[i];
      if (ch === quote && value[i - 1] !== "\\") return out;
      out += ch;
    }
    return out;
  }
  const hash = value.indexOf("#");
  return (hash >= 0 ? value.slice(0, hash) : value).trim();
}

function value(name) {
  return process.env[name]?.trim() ?? "";
}

function requireSet(name, why) {
  if (!value(name)) errors.push(`${name} is required${why ? ` (${why})` : ""}.`);
}

function requireUrl(name, opts = {}) {
  const v = value(name);
  if (!v) {
    errors.push(`${name} is required.`);
    return;
  }
  let url;
  try {
    url = new URL(v);
  } catch {
    errors.push(`${name} must be a valid URL.`);
    return;
  }
  if (opts.https && url.protocol !== "https:") {
    errors.push(`${name} must use https:// for live deployment.`);
  }
  if (opts.noLocalhost && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    errors.push(`${name} must not point at localhost for live deployment.`);
  }
}

function requireAddress(name) {
  const v = value(name);
  if (!/^0x[a-fA-F0-9]{40}$/.test(v)) {
    errors.push(`${name} must be a 0x-prefixed EVM address.`);
  }
}

function requirePrivateKey(name) {
  const v = value(name);
  if (!/^0x[a-fA-F0-9]{64}$/.test(v)) {
    errors.push(`${name} must be a 0x-prefixed 32-byte private key.`);
  }
}

// A secret strong enough for at-rest encryption: a 64-char hex key, a 32-byte
// base64 key, or a >=32-char passphrase. No-op when unset.
function requireStrongSecret(name) {
  const v = value(name);
  if (!v) return;
  const isHex64 = /^[0-9a-fA-F]{64}$/.test(v);
  let isBase64_32 = false;
  try {
    isBase64_32 = Buffer.from(v, "base64").length === 32;
  } catch {
    isBase64_32 = false;
  }
  if (!isHex64 && !isBase64_32 && v.length < 32) {
    errors.push(
      `${name} is too weak — use a 64-char hex key, a 32-byte base64 key, or a >=32-char passphrase (e.g. \`openssl rand -hex 32\`).`,
    );
  }
}

function requirePostgresUrl(name) {
  const v = value(name);
  if (!v) {
    errors.push(`${name} is required.`);
    return;
  }
  let url;
  try {
    url = new URL(v);
  } catch {
    errors.push(`${name} must be a valid Postgres URL.`);
    return;
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    errors.push(`${name} must start with postgres:// or postgresql://.`);
  }
}

requireUrl("NEXT_PUBLIC_APP_URL", {
  https: production,
  noLocalhost: production,
});
if (value("AUTH_SESSION_SECRET").length < 32) {
  errors.push("AUTH_SESSION_SECRET must be at least 32 characters.");
}
requirePostgresUrl("DATABASE_URL");
requireUrl("NEXT_PUBLIC_SUPABASE_URL", { https: production });
requireSet("SUPABASE_SERVICE_ROLE_KEY", "server-side Supabase storage access");
requireUrl("GATEWAY_FACILITATOR_URL", { https: production });
requireAddress("SELLER_ADDRESS");

// PAYMENT_PROVIDER gates the money path: `mock` records fake settlements, so a
// public-testnet deploy that pays real creators/finders MUST be gateway_x402.
// Always require it to be set explicitly (no silent `mock` default in the gate),
// and refuse anything but gateway_x402 in production so mock payouts can't ship.
const paymentProvider = value("PAYMENT_PROVIDER");
if (!paymentProvider) {
  errors.push(
    "PAYMENT_PROVIDER is required (set gateway_x402 for a live gateway deployment).",
  );
} else if (production && paymentProvider !== "gateway_x402") {
  errors.push("PAYMENT_PROVIDER must be gateway_x402 for live deployment.");
}

// SELLER_PRIVATE_KEY signs on-chain gateway payouts (withdrawals). It is the
// money-critical key for the payout half of the marketplace, so the DEFAULT gate
// requires it in production even without --require-withdrawals: a public deploy
// without it silently ships a marketplace where creators/finders can never be
// paid out. Off-production it stays a warning so `mock` local runs still pass.
if (requireWithdrawals || production) {
  requirePrivateKey("SELLER_PRIVATE_KEY");
} else if (!value("SELLER_PRIVATE_KEY")) {
  warnings.push("SELLER_PRIVATE_KEY is not set; live withdrawals will fail, though x402 buys can still settle.");
}

const embeddingProvider = value("EMBEDDING_PROVIDER") || "local";
if (!["local", "openai", "gemini", "mock"].includes(embeddingProvider)) {
  errors.push("EMBEDDING_PROVIDER must be one of local, openai, gemini, mock.");
}
if (production && embeddingProvider === "mock") {
  errors.push("EMBEDDING_PROVIDER=mock is not acceptable for live deployment.");
}
if (embeddingProvider === "openai") requireSet("OPENAI_API_KEY", "OpenAI embeddings");
if (embeddingProvider === "gemini" && !value("GEMINI_API_KEY") && !value("GOOGLE_API_KEY")) {
  errors.push("GEMINI_API_KEY or GOOGLE_API_KEY is required for EMBEDDING_PROVIDER=gemini.");
}
if (production && embeddingProvider === "local") {
  warnings.push("EMBEDDING_PROVIDER=local is allowed, but confirm your host can download/cache the HF model.");
}

// YouTube import is "enabled" (and therefore money-adjacent config that must be
// gated by the DEFAULT check) whenever ANY of its vars are present — the OAuth
// client trio or the token-encryption key. `--require-youtube` forces it on even
// if nothing is set yet, for a deploy that will turn it on.
const youtubeConfigured =
  value("GOOGLE_CLIENT_ID") ||
  value("GOOGLE_CLIENT_SECRET") ||
  value("GOOGLE_OAUTH_REDIRECT_URI") ||
  value("YOUTUBE_TOKEN_ENC_KEY");

if (requireYoutube || youtubeConfigured) {
  requireSet("GOOGLE_CLIENT_ID", "YouTube import");
  requireSet("GOOGLE_CLIENT_SECRET", "YouTube import");
  requireUrl("GOOGLE_OAUTH_REDIRECT_URI", { https: production, noLocalhost: production });
  requireSet("YOUTUBE_TOKEN_ENC_KEY", "stored YouTube refresh-token encryption");
}

// Whenever the token-encryption key is set — via --require-youtube, because the
// feature is configured, or on its own — reject a weak value. token-crypto.ts has
// a fallback scrypt branch that derives a key from ANY string with a hardcoded
// salt, so a weak passphrase is silently accepted and quietly weakens the at-rest
// encryption of stored YouTube refresh tokens. Require real ≥32-byte entropy.
if (value("YOUTUBE_TOKEN_ENC_KEY")) requireStrongSecret("YOUTUBE_TOKEN_ENC_KEY");

if (warnings.length) {
  console.warn("Deployment env warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error("Deployment env check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Deployment env check passed.");
