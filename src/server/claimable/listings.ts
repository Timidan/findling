import { createHash, randomBytes } from "node:crypto";
import { desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { claimableListings } from "../db/schema";
import { getPledgedDemandByListing } from "./pledges";

export const EXTERNAL_IDENTITY_KINDS = [
  "youtube_channel",
  "peertube_channel",
  "activitypub_actor",
  "handle",
  "url",
] as const;

export type ExternalIdentityKind = (typeof EXTERNAL_IDENTITY_KINDS)[number];
export type ClaimableListingStatus =
  | "open"
  | "claimed"
  | "activated"
  | "expired";

type ClaimableListingRow = typeof claimableListings.$inferSelect;
export type ClaimableListingView = Omit<ClaimableListingRow, "claimSecretHash">;

export interface CreateListingResult {
  listing: ClaimableListingView;
  claimSecret: string;
}

export interface AgentListingFeedItem {
  id: string;
  title: string;
  pledgedDemandMicroUsdc: number;
  pledgeCount: number;
  status: "open" | "claimed";
}

export interface PublicListingFeedItem extends AgentListingFeedItem {
  externalIdentity: string;
  externalIdentityKind: ExternalIdentityKind;
  sourceLicenceLabel: string | null;
  sourceThumbnailUrl: string | null;
}

export type ListingFeedItem = AgentListingFeedItem;

export interface AgentListListingsResult {
  listings: AgentListingFeedItem[];
}

export interface PublicListListingsResult {
  listings: PublicListingFeedItem[];
}

export type ListListingsResult<
  TAudience extends "public" | "agent" = "agent",
> = TAudience extends "public"
  ? PublicListListingsResult
  : AgentListListingsResult;

const MAX_LISTINGS_LIMIT = 500;

export class ListingValidationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ListingValidationError";
  }
}

export class ListingConflictError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ListingConflictError";
  }
}

const createListingInputSchema = z.object({
  externalIdentity: z.string().trim().min(1).max(240),
  externalIdentityKind: z.enum(EXTERNAL_IDENTITY_KINDS),
  externalRef: z.string().trim().max(1000).nullish(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2000).nullish(),
  relevanceText: z.string().trim().max(2000).nullish(),
  sourceLicenceLabel: z.string().trim().max(120).nullish(),
  sourceThumbnailUrl: z.string().trim().url().max(1000).nullish(),
  expiresAt: z.union([z.date(), z.string().datetime()]).nullish(),
});

export type CreateListingInput = z.input<typeof createListingInputSchema>;

function toNullableText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeExternalRef(
  _kind: ExternalIdentityKind,
  ref: string | null | undefined,
): string | null {
  const value = toNullableText(ref);
  if (!value) return null;
  return value.toLowerCase().replace(/\/+$/, "");
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function createClaimSecret(): string {
  return randomBytes(32).toString("base64url");
}

function toListingView(row: ClaimableListingRow): ClaimableListingView {
  const { claimSecretHash, ...view } = row;
  void claimSecretHash;
  return view;
}

function toDateOrNull(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

function dbConstraint(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return null;
  // drizzle exposes `.constraint`; the underlying postgres-js error uses
  // `.constraint_name` — check both so a duplicate-channel insert is recognised
  // as a graceful ListingConflictError rather than throwing raw (which aborted
  // the seed crawl mid-run).
  const maybe = e as {
    constraint?: unknown;
    constraint_name?: unknown;
    cause?: unknown;
  };
  if (typeof maybe.constraint === "string") return maybe.constraint;
  if (typeof maybe.constraint_name === "string") return maybe.constraint_name;
  return dbConstraint(maybe.cause);
}

export function claimUrlForSecret(baseUrl: string, secret: string): string {
  return new URL(`/claim/${secret}`, baseUrl).toString();
}

export async function createListing(
  finderId: string,
  input: unknown,
): Promise<CreateListingResult> {
  const parsed = createListingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ListingValidationError("invalid_listing_input");
  }

  const claimSecret = createClaimSecret();
  try {
    const [listing] = await db
      .insert(claimableListings)
      .values({
        finderId,
        externalIdentity: parsed.data.externalIdentity,
        externalIdentityKind: parsed.data.externalIdentityKind,
        externalRef: toNullableText(parsed.data.externalRef),
        externalRefNormalized: normalizeExternalRef(
          parsed.data.externalIdentityKind,
          parsed.data.externalRef,
        ),
        title: parsed.data.title,
        description: toNullableText(parsed.data.description),
        relevanceText: toNullableText(parsed.data.relevanceText),
        sourceLicenceLabel: toNullableText(parsed.data.sourceLicenceLabel),
        sourceThumbnailUrl: toNullableText(parsed.data.sourceThumbnailUrl),
        claimSecretHash: hashSecret(claimSecret),
        status: "open",
        expiresAt: toDateOrNull(parsed.data.expiresAt),
      })
      .returning();

    return { listing: toListingView(listing), claimSecret };
  } catch (e) {
    const constraint = dbConstraint(e);
    if (constraint === "claimable_listings_external_ref_live_uq") {
      throw new ListingConflictError("duplicate_live_external_ref");
    }
    if (constraint === "claimable_listings_claim_secret_hash_uq") {
      throw new ListingConflictError("duplicate_claim_secret");
    }
    throw e;
  }
}

type ListListingsInput<TAudience extends "public" | "agent"> = {
  audience: TAudience;
  limit?: number;
};

export async function listListings(
  input: ListListingsInput<"public">,
): Promise<ListListingsResult<"public">>;
export async function listListings(
  input: ListListingsInput<"agent">,
): Promise<ListListingsResult<"agent">>;
export async function listListings(
  input: ListListingsInput<"public" | "agent">,
): Promise<PublicListListingsResult | AgentListListingsResult> {
  if (input.audience !== "public" && input.audience !== "agent") {
    throw new ListingValidationError("invalid_listing_audience");
  }
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.min(Math.max(Math.trunc(input.limit), 1), MAX_LISTINGS_LIMIT)
      : 50;

  const rows = await db
    .select({
      id: claimableListings.id,
      title: claimableListings.title,
      externalIdentity: claimableListings.externalIdentity,
      externalIdentityKind: claimableListings.externalIdentityKind,
      sourceLicenceLabel: claimableListings.sourceLicenceLabel,
      sourceThumbnailUrl: claimableListings.sourceThumbnailUrl,
      status: claimableListings.status,
      createdAt: claimableListings.createdAt,
    })
    .from(claimableListings)
    .where(inArray(claimableListings.status, ["open", "claimed"]))
    .orderBy(desc(claimableListings.createdAt))
    .limit(limit);

  const demandByListing = await getPledgedDemandByListing(
    rows.map((row) => row.id),
  );
  const baseRows = rows.map((row) => ({
    id: row.id,
    title: row.title,
    pledgedDemandMicroUsdc:
      demandByListing.get(row.id)?.pledgedDemandMicroUsdc ?? 0,
    pledgeCount: demandByListing.get(row.id)?.pledgeCount ?? 0,
    status: row.status as "open" | "claimed",
  }));

  if (input.audience === "agent") {
    return { listings: baseRows };
  }

  return {
    listings: rows.map((row, i) => ({
      ...baseRows[i],
      externalIdentity: row.externalIdentity,
      externalIdentityKind: row.externalIdentityKind,
      sourceLicenceLabel: row.sourceLicenceLabel,
      sourceThumbnailUrl: row.sourceThumbnailUrl,
    })),
  };
}
