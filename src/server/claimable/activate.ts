import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { findLicensableMoment } from "../catalog/licensable";
import { db } from "../db/client";
import {
  agentRuns,
  claimableListings,
  curations,
  demandIntents,
  moments,
} from "../db/schema";

type ClaimableListingRow = typeof claimableListings.$inferSelect;
type MomentRow = typeof moments.$inferSelect;

export const CLAIMABLE_RUN_STARTED_AT = sql`clock_timestamp()`;

export interface ActivateListingInput {
  listingId: string;
  userId: string;
  momentId: string;
}

export interface ActivateListingSummary {
  listingId: string;
  momentId: string;
  curationId: string | null;
  notifiedCount: number;
}

export class ActivationValidationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ActivationValidationError";
  }
}

function generateShareSlug(): string {
  return `c-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function assertActivationInput(input: ActivateListingInput): void {
  if (
    typeof input.listingId !== "string" ||
    typeof input.userId !== "string" ||
    typeof input.momentId !== "string" ||
    input.listingId.length === 0 ||
    input.userId.length === 0 ||
    input.momentId.length === 0
  ) {
    throw new ActivationValidationError("invalid_activation_input");
  }
}

async function loadMoment(momentId: string): Promise<MomentRow | null> {
  const [moment] = await db
    .select()
    .from(moments)
    .where(eq(moments.id, momentId))
    .limit(1);
  return moment ?? null;
}

async function loadListing(
  listingId: string,
): Promise<ClaimableListingRow | null> {
  const [listing] = await db
    .select()
    .from(claimableListings)
    .where(eq(claimableListings.id, listingId))
    .limit(1);
  return listing ?? null;
}

function assertListingOwner(
  listing: ClaimableListingRow,
  userId: string,
): void {
  if (listing.claimedByUserId !== userId) {
    throw new ActivationValidationError("listing_not_claimed_by_user");
  }
}

function safeCount(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isSafeInteger(n)) throw new Error("unsafe_integer_result");
  return n;
}

async function summarizeActivatedListing(
  listing: ClaimableListingRow,
  userId: string,
): Promise<ActivateListingSummary> {
  assertListingOwner(listing, userId);
  if (listing.status !== "activated" || !listing.createdMomentId) {
    throw new ActivationValidationError("listing_not_claimed_by_user");
  }

  const [curation] = await db
    .select({ id: curations.id })
    .from(curations)
    .where(
      and(
        eq(curations.momentId, listing.createdMomentId),
        eq(curations.finderId, listing.finderId),
      ),
    )
    .orderBy(asc(curations.createdAt))
    .limit(1);

  const [notified] = await db
    .select({ notifiedCount: sql<string>`count(*)` })
    .from(demandIntents)
    .where(
      and(
        eq(demandIntents.listingId, listing.id),
        inArray(demandIntents.status, ["notified", "settled"]),
      ),
    )
    .limit(1);

  return {
    listingId: listing.id,
    momentId: listing.createdMomentId,
    curationId: curation?.id ?? null,
    notifiedCount: safeCount(notified?.notifiedCount),
  };
}

export async function activateListing(
  input: ActivateListingInput,
): Promise<ActivateListingSummary> {
  assertActivationInput(input);

  const moment = await loadMoment(input.momentId);
  if (!moment) {
    throw new ActivationValidationError("moment_not_licensable");
  }
  if (moment.creatorId !== input.userId) {
    throw new ActivationValidationError("not_moment_owner");
  }

  const licensable = await findLicensableMoment(input.momentId);
  if (!licensable) {
    throw new ActivationValidationError("moment_not_licensable");
  }

  const listing = await loadListing(input.listingId);
  if (!listing) {
    throw new ActivationValidationError("listing_not_claimed_by_user");
  }

  if (listing.status === "activated") {
    return summarizeActivatedListing(listing, input.userId);
  }
  if (listing.status !== "claimed") {
    throw new ActivationValidationError("listing_not_claimed_by_user");
  }
  assertListingOwner(listing, input.userId);

  const summary = await db.transaction(async (tx) => {
    const updatedAt = new Date();
    const [activated] = await tx
      .update(claimableListings)
      .set({
        status: "activated",
        createdMomentId: input.momentId,
        updatedAt,
      })
      .where(
        and(
          eq(claimableListings.id, input.listingId),
          eq(claimableListings.status, "claimed"),
          eq(claimableListings.claimedByUserId, input.userId),
        ),
      )
      .returning();

    if (!activated) return null;

    const [curation] = await tx
      .insert(curations)
      .values({
        momentId: input.momentId,
        finderId: listing.finderId,
        tags: [],
        caption: null,
        useCaseNote: null,
        shareSlug: generateShareSlug(),
        sourceSurface: "feed",
        relevanceText: listing.title,
      })
      .returning();

    const pledgedIntents = await tx
      .select()
      .from(demandIntents)
      .where(
        and(
          eq(demandIntents.listingId, input.listingId),
          eq(demandIntents.status, "pledged"),
        ),
      );

    let notifiedCount = 0;
    for (const intent of pledgedIntents) {
      const [run] = await tx
        .insert(agentRuns)
        .values({
          buyerId: intent.buyerId,
          sessionGrantId: intent.sessionGrantId,
          surface: "feed",
          requestText: `claimable:${input.listingId}`,
          candidateMomentIds: [input.momentId],
          candidateScores: [{ momentId: input.momentId, score: 1 }],
          budgetMicroUsdc: intent.budgetMicroUsdc,
          paymentStatus: "requires_payment",
          startedAt: CLAIMABLE_RUN_STARTED_AT,
        })
        .returning();

      if (!run) continue;

      const [notified] = await tx
        .update(demandIntents)
        .set({
          agentRunId: run.id,
          status: "notified",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(demandIntents.id, intent.id),
            eq(demandIntents.status, "pledged"),
          ),
        )
        .returning();

      if (notified) notifiedCount += 1;
    }

    return {
      listingId: input.listingId,
      momentId: input.momentId,
      curationId: curation?.id ?? null,
      notifiedCount,
    } satisfies ActivateListingSummary;
  });

  if (summary) return summary;

  const fresh = await loadListing(input.listingId);
  if (fresh?.status === "activated") {
    return summarizeActivatedListing(fresh, input.userId);
  }
  throw new ActivationValidationError("listing_not_claimed_by_user");
}
