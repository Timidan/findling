/**
 * Buyer session grants — the self-serve "give my agent a funded spending
 * envelope" primitive. An authenticated buyer agent declares a session key (the
 * funded EOA it will pay from) plus caps (total / per-purchase / expiry / usage
 * types); the x402 unlock route then binds settlement to that key and reserves
 * against the cap atomically. No private key is ever stored — only the address.
 */
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { buyerSessionGrants } from "@/server/db/schema";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const MAX_TOTAL_CAP_MICRO = 100_000_000; // 100 USDC ceiling per grant (sanity bound)
const MAX_EXPIRY_SECONDS = 90 * 24 * 3600; // 90 days

export const USAGE_TYPES = [
  "video_embed",
  "newsletter",
  "social_post",
  "internal_reference",
] as const;
export type UsageType = (typeof USAGE_TYPES)[number];

export class GrantValidationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "GrantValidationError";
  }
}

export interface CreateGrantInput {
  buyerId: string;
  sessionKeyAddress: string;
  totalCapMicroUsdc: number;
  perPurchaseCapMicroUsdc?: number | null;
  expiresInSeconds?: number | null;
  allowedUsageTypes?: string[] | null;
}

/** Validate + create an active session grant for this buyer. */
export async function createGrant(input: CreateGrantInput) {
  const addr = input.sessionKeyAddress?.trim();
  if (!addr || !ADDR_RE.test(addr)) {
    throw new GrantValidationError("invalid_session_key_address");
  }
  if (!Number.isInteger(input.totalCapMicroUsdc) || input.totalCapMicroUsdc <= 0) {
    throw new GrantValidationError("total_cap_must_be_a_positive_integer");
  }
  if (input.totalCapMicroUsdc > MAX_TOTAL_CAP_MICRO) {
    throw new GrantValidationError("total_cap_too_large");
  }

  const perPurchase = input.perPurchaseCapMicroUsdc ?? null;
  if (perPurchase != null) {
    if (!Number.isInteger(perPurchase) || perPurchase <= 0) {
      throw new GrantValidationError("per_purchase_cap_must_be_a_positive_integer");
    }
    if (perPurchase > input.totalCapMicroUsdc) {
      throw new GrantValidationError("per_purchase_cap_exceeds_total");
    }
  }

  let expiresAt: Date | null = null;
  if (input.expiresInSeconds != null) {
    if (
      !Number.isInteger(input.expiresInSeconds) ||
      input.expiresInSeconds <= 0 ||
      input.expiresInSeconds > MAX_EXPIRY_SECONDS
    ) {
      throw new GrantValidationError("expires_in_seconds_out_of_range");
    }
    expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
  }

  let usage: UsageType[] | null = null;
  if (input.allowedUsageTypes != null) {
    if (!Array.isArray(input.allowedUsageTypes) || input.allowedUsageTypes.length === 0) {
      throw new GrantValidationError("allowed_usage_types_must_be_a_non_empty_array");
    }
    for (const u of input.allowedUsageTypes) {
      if (!USAGE_TYPES.includes(u as UsageType)) {
        throw new GrantValidationError(`unknown_usage_type:${u}`);
      }
    }
    usage = input.allowedUsageTypes as UsageType[];
  }

  const [grant] = await db
    .insert(buyerSessionGrants)
    .values({
      buyerId: input.buyerId,
      // single-key model: the funding wallet IS the session key the agent pays from
      walletAddress: addr,
      sessionKeyAddress: addr,
      totalCapMicroUsdc: input.totalCapMicroUsdc,
      remainingCapMicroUsdc: input.totalCapMicroUsdc,
      perPurchaseCapMicroUsdc: perPurchase,
      allowedUsageTypes: usage,
      expiresAt,
      status: "active",
    })
    .returning();
  return grant;
}

/** List this buyer's grants, newest first. */
export async function listGrants(buyerId: string) {
  return db
    .select()
    .from(buyerSessionGrants)
    .where(eq(buyerSessionGrants.buyerId, buyerId))
    .orderBy(desc(buyerSessionGrants.createdAt));
}

/**
 * Count a buyer's currently-active grants — what the self-serve creation quota
 * checks against so one account can't spin up unbounded funded-delegate
 * envelopes. Only 'active' grants count; revoked/expired/exhausted ones don't.
 */
export async function activeGrantCount(buyerId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(buyerSessionGrants)
    .where(
      and(
        eq(buyerSessionGrants.buyerId, buyerId),
        eq(buyerSessionGrants.status, "active"),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Revoke a grant — owner-scoped. Returns the updated row, or null if it doesn't
 * exist or isn't owned by this buyer (the WHERE makes it a no-op for non-owners).
 */
export async function revokeGrant(buyerId: string, grantId: string) {
  const rows = await db
    .update(buyerSessionGrants)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(
      and(
        eq(buyerSessionGrants.id, grantId),
        eq(buyerSessionGrants.buyerId, buyerId),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

/** Public-safe shape (never leaks internal columns). */
export function grantView(g: typeof buyerSessionGrants.$inferSelect) {
  return {
    id: g.id,
    sessionKeyAddress: g.sessionKeyAddress,
    chain: g.chain,
    totalCapMicroUsdc: g.totalCapMicroUsdc,
    remainingCapMicroUsdc: g.remainingCapMicroUsdc,
    perPurchaseCapMicroUsdc: g.perPurchaseCapMicroUsdc,
    allowedUsageTypes: g.allowedUsageTypes,
    expiresAt: g.expiresAt,
    status: g.status,
    createdAt: g.createdAt,
  };
}
