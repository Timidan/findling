/**
 * Sign-In With Ethereum (EIP-4361) verification. A nonce is issued and stored
 * SERVER-SIDE; login parses the SIWE message, checks the domain + expiry,
 * recovers the EOA signer, then ATOMICALLY consumes the nonce. Single-use is
 * enforced by the DB, so a captured login can't be replayed and a signature
 * minted for another site (whose nonce we never issued) can't be reused.
 */
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress, isAddress, getAddress } from "viem";
import { db } from "@/server/db/client";
import { users, siweNonces } from "@/server/db/schema";

export const NONCE_TTL_SECONDS = 10 * 60;
/** httpOnly cookie that binds an issued nonce to the requesting client. */
export const NONCE_COOKIE = "findling_nonce";

type Role = "creator" | "finder" | "buyer" | "admin";

/**
 * The domain a SIWE message MUST be signed for. Prefer the configured canonical
 * host (NEXT_PUBLIC_APP_URL) so an attacker can't bind a login by forwarding an
 * arbitrary `Host` header; fall back to the request host only in local dev.
 */
export function resolveAuthDomain(hostHeader: string | null): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      return new URL(configured).host;
    } catch {
      /* malformed config — fall through to the env-specific fallback */
    }
  }
  // In production we must NEVER trust the spoofable `Host` header to decide which
  // domain a signature was signed for. Fail closed: an empty expected domain makes
  // every SIWE `domain` check mismatch, so logins are blocked (never forgeable)
  // until a canonical NEXT_PUBLIC_APP_URL is configured. Host fallback is dev-only.
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[siwe] NEXT_PUBLIC_APP_URL missing/malformed in production — failing SIWE closed",
    );
    return "";
  }
  return hostHeader ?? "";
}

/** Issue a single-use nonce, persisted server-side with a short TTL. */
export async function issueNonce(): Promise<string> {
  // CSPRNG, hex (EIP-4361 requires an alphanumeric nonce of >=8 chars). 192 bits.
  // NOT viem's generateSiweNonce(), which derives from Math.random() and emits
  // predictable, overlapping values.
  const nonce = randomBytes(24).toString("hex");
  await db.insert(siweNonces).values({
    nonce,
    expiresAt: new Date(Date.now() + NONCE_TTL_SECONDS * 1000),
  });
  return nonce;
}

/** Atomically consume a nonce: succeeds once, for an unexpired unconsumed row. */
async function consumeNonce(nonce: string): Promise<boolean> {
  const rows = await db
    .update(siweNonces)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(siweNonces.nonce, nonce),
        isNull(siweNonces.consumedAt),
        gt(siweNonces.expiresAt, sql`now()`),
      ),
    )
    .returning({ nonce: siweNonces.nonce });
  return rows.length === 1;
}

export class SiweError extends Error {}

/**
 * Verify a SIWE login. Domain is MANDATORY. The signature is recovered and
 * checked BEFORE the nonce is consumed, so a bad signature never burns a nonce.
 */
export async function verifySiwe(
  message: string,
  signature: `0x${string}`,
  expectedDomain: string,
  boundNonce: string | null,
): Promise<{ address: string }> {
  const fields = parseSiweMessage(message);
  if (!fields.address || !isAddress(fields.address)) throw new SiweError("bad_address");
  if (!fields.nonce) throw new SiweError("missing_nonce");
  if (!fields.domain || fields.domain !== expectedDomain) {
    throw new SiweError("domain_mismatch");
  }
  // Bind the redemption to the client that requested the nonce: the message's
  // nonce must equal the one we set in this caller's httpOnly cookie. A captured
  // message+signature replayed from another client (no/!matching cookie) fails
  // here, before the single-use server consume.
  if (!boundNonce || fields.nonce !== boundNonce) {
    throw new SiweError("nonce_not_bound");
  }
  if (fields.expirationTime && fields.expirationTime.getTime() < Date.now()) {
    throw new SiweError("expired");
  }

  let recovered: string;
  try {
    recovered = await recoverMessageAddress({ message, signature });
  } catch {
    throw new SiweError("bad_signature");
  }
  if (recovered.toLowerCase() !== fields.address.toLowerCase()) {
    throw new SiweError("signature_mismatch");
  }

  // consume LAST — single-use, atomic; blocks replay + cross-site reuse
  if (!(await consumeNonce(fields.nonce))) throw new SiweError("bad_nonce");
  return { address: getAddress(fields.address) };
}

/** Find-or-create a user by wallet (stored lowercase). New users get `defaultRoles`. */
export async function upsertUserByWallet(
  address: string,
  defaultRoles: Role[] = ["creator", "finder"],
): Promise<{ id: string; address: string; created: boolean }> {
  const addr = address.toLowerCase();
  const existing = (
    await db.select().from(users).where(eq(users.walletAddress, addr))
  )[0];
  if (existing) return { id: existing.id, address: addr, created: false };
  const inserted = (
    await db
      .insert(users)
      .values({
        email: `${addr}@wallet.findling`,
        displayName: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
        walletAddress: addr,
        roles: defaultRoles,
      })
      .returning({ id: users.id })
  )[0];
  return { id: inserted.id, address: addr, created: true };
}
