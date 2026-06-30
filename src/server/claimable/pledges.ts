import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import {
  buyerSessionGrants,
  claimableListings,
  demandIntents,
  purchases,
} from "../db/schema";

export const PLEDGE_USAGE_TYPES = [
  "video_embed",
  "newsletter",
  "social_post",
  "internal_reference",
] as const;

export type PledgeUsageType = (typeof PLEDGE_USAGE_TYPES)[number];
export type DemandIntentView = typeof demandIntents.$inferSelect;
export type DemandIntentStatus = DemandIntentView["status"];

export interface PledgedDemand {
  pledgedDemandMicroUsdc: number;
  pledgeCount: number;
}

export interface PledgeIntentInput {
  buyerId: string;
  listingId: string;
  sessionGrantId: string;
  budgetMicroUsdc: number;
  usageType?: PledgeUsageType | null;
}

export interface BuyerPledgeView {
  listingId: string;
  status: DemandIntentStatus;
  unlockUrl: string | null;
}

export interface ListPledgesResult {
  pledges: BuyerPledgeView[];
}

export interface ListPledgesOptions {
  baseUrl?: string | null;
}

export class PledgeValidationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "PledgeValidationError";
  }
}

const pledgeIntentInputSchema = z.object({
  buyerId: z.string().uuid(),
  listingId: z.string().uuid(),
  sessionGrantId: z.string().uuid(),
  budgetMicroUsdc: z.number().int().positive(),
  usageType: z.enum(PLEDGE_USAGE_TYPES).nullish(),
});

function asSafeInteger(v: unknown): number {
  const n = typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  if (!Number.isSafeInteger(n)) {
    throw new Error("unsafe_integer_result");
  }
  return n;
}

function isGrantUnexpired(expiresAt: Date | null): boolean {
  return expiresAt === null || expiresAt.getTime() > Date.now();
}

function isListingPledgeable(status: string): boolean {
  return status === "open" || status === "claimed";
}

interface DemandGroupRow {
  listingId: string;
  sessionGrantId: string;
  remainingCapMicroUsdc: unknown;
  pledgedBudgetMicroUsdc: unknown;
  pledgeCount: unknown;
}

interface PledgeListRow {
  id: string;
  listingId: string;
  sessionGrantId: string;
  status: DemandIntentStatus;
  agentRunId: string | null;
  settledPurchaseId: string | null;
  createdMomentId: string | null;
  createdAt: Date;
}

function summarizeDemandGroups(rows: DemandGroupRow[]): Map<string, PledgedDemand> {
  const byListing = new Map<string, PledgedDemand>();

  for (const row of rows) {
    const existing =
      byListing.get(row.listingId) ??
      ({ pledgedDemandMicroUsdc: 0, pledgeCount: 0 } satisfies PledgedDemand);
    const remainingCapMicroUsdc = asSafeInteger(row.remainingCapMicroUsdc);
    const pledgedBudgetMicroUsdc = asSafeInteger(row.pledgedBudgetMicroUsdc);

    existing.pledgedDemandMicroUsdc += Math.min(
      remainingCapMicroUsdc,
      pledgedBudgetMicroUsdc,
    );
    existing.pledgeCount += asSafeInteger(row.pledgeCount);
    byListing.set(row.listingId, existing);
  }

  return byListing;
}

function resolveBaseUrl(baseUrl?: string | null): string {
  const resolved = baseUrl ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!resolved) {
    throw new Error("app_base_url_not_configured");
  }
  return resolved;
}

function unlockUrlForPledge(
  row: PledgeListRow,
  baseUrl?: string | null,
): string | null {
  if (row.status !== "notified" || !row.createdMomentId || !row.agentRunId) {
    return null;
  }

  const unlock = new URL(
    `/api/payments/x402/moments/${row.createdMomentId}/unlock`,
    resolveBaseUrl(baseUrl),
  );
  unlock.searchParams.set("grantId", row.sessionGrantId);
  unlock.searchParams.set("agentRunId", row.agentRunId);
  return unlock.toString();
}

async function findSettledPurchaseId(agentRunId: string): Promise<string | null> {
  const [purchase] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(eq(purchases.agentRunId, agentRunId), eq(purchases.status, "settled")),
    )
    .limit(1);

  return purchase?.id ?? null;
}

async function reconcilePledge(row: PledgeListRow): Promise<PledgeListRow> {
  if (row.status !== "notified" || !row.agentRunId) return row;

  const settledPurchaseId = await findSettledPurchaseId(row.agentRunId);
  if (!settledPurchaseId) return row;

  const [updated] = await db
    .update(demandIntents)
    .set({
      status: "settled",
      settledPurchaseId,
      updatedAt: new Date(),
    })
    .where(
      and(eq(demandIntents.id, row.id), eq(demandIntents.status, "notified")),
    )
    .returning({
      status: demandIntents.status,
      settledPurchaseId: demandIntents.settledPurchaseId,
    });

  if (!updated) return row;

  return {
    ...row,
    status: updated.status,
    settledPurchaseId: updated.settledPurchaseId,
  };
}

async function demandGroupsForListings(listingIds: string[]): Promise<DemandGroupRow[]> {
  if (listingIds.length === 0) return [];

  return db
    .select({
      listingId: demandIntents.listingId,
      sessionGrantId: demandIntents.sessionGrantId,
      remainingCapMicroUsdc: buyerSessionGrants.remainingCapMicroUsdc,
      pledgedBudgetMicroUsdc: sql<string>`coalesce(sum(${demandIntents.budgetMicroUsdc}), 0)`,
      pledgeCount: sql<string>`count(${demandIntents.id})`,
    })
    .from(demandIntents)
    .innerJoin(
      buyerSessionGrants,
      eq(buyerSessionGrants.id, demandIntents.sessionGrantId),
    )
    .where(
      and(
        inArray(demandIntents.listingId, listingIds),
        inArray(demandIntents.status, ["pledged", "notified"]),
        eq(buyerSessionGrants.status, "active"),
        or(
          isNull(buyerSessionGrants.expiresAt),
          gt(buyerSessionGrants.expiresAt, new Date()),
        ),
      ),
    )
    .groupBy(
      demandIntents.listingId,
      demandIntents.sessionGrantId,
      buyerSessionGrants.remainingCapMicroUsdc,
    );
}

export async function getPledgedDemandByListing(
  listingIds: string[],
): Promise<Map<string, PledgedDemand>> {
  return summarizeDemandGroups(await demandGroupsForListings(listingIds));
}

export async function getPledgedDemand(
  listingId: string,
): Promise<PledgedDemand> {
  const byListing = await getPledgedDemandByListing([listingId]);
  return (
    byListing.get(listingId) ??
    ({ pledgedDemandMicroUsdc: 0, pledgeCount: 0 } satisfies PledgedDemand)
  );
}

export async function pledgeIntent(
  input: PledgeIntentInput,
): Promise<DemandIntentView> {
  const parsed = pledgeIntentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PledgeValidationError("invalid_pledge_input");
  }

  const [grant] = await db
    .select()
    .from(buyerSessionGrants)
    .where(eq(buyerSessionGrants.id, parsed.data.sessionGrantId))
    .limit(1);

  if (!grant) {
    throw new PledgeValidationError("grant_not_pledgeable");
  }
  if (grant.buyerId !== parsed.data.buyerId) {
    throw new PledgeValidationError("grant_not_owner");
  }
  if (grant.status !== "active" || !isGrantUnexpired(grant.expiresAt)) {
    throw new PledgeValidationError("grant_not_pledgeable");
  }

  const [listing] = await db
    .select()
    .from(claimableListings)
    .where(eq(claimableListings.id, parsed.data.listingId))
    .limit(1);

  if (!listing || !isListingPledgeable(listing.status)) {
    throw new PledgeValidationError("listing_not_pledgeable");
  }

  const usageType = parsed.data.usageType ?? null;
  const updatedAt = new Date();
  const [intent] = await db
    .insert(demandIntents)
    .values({
      buyerId: parsed.data.buyerId,
      listingId: parsed.data.listingId,
      sessionGrantId: parsed.data.sessionGrantId,
      budgetMicroUsdc: parsed.data.budgetMicroUsdc,
      usageType,
      status: "pledged",
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [demandIntents.buyerId, demandIntents.listingId],
      set: {
        sessionGrantId: parsed.data.sessionGrantId,
        budgetMicroUsdc: parsed.data.budgetMicroUsdc,
        usageType,
        status: "pledged",
        updatedAt,
      },
    })
    .returning();

  return intent;
}

export async function listPledges(
  buyerId: string,
  options: ListPledgesOptions = {},
): Promise<ListPledgesResult> {
  const rows = await db
    .select({
      id: demandIntents.id,
      listingId: demandIntents.listingId,
      sessionGrantId: demandIntents.sessionGrantId,
      status: demandIntents.status,
      agentRunId: demandIntents.agentRunId,
      settledPurchaseId: demandIntents.settledPurchaseId,
      createdMomentId: claimableListings.createdMomentId,
      createdAt: demandIntents.createdAt,
    })
    .from(demandIntents)
    .innerJoin(
      claimableListings,
      eq(claimableListings.id, demandIntents.listingId),
    )
    .where(eq(demandIntents.buyerId, buyerId))
    .orderBy(desc(demandIntents.createdAt));
  const reconciled: PledgeListRow[] = [];
  for (const row of rows) {
    reconciled.push(await reconcilePledge(row));
  }

  return {
    pledges: reconciled.map((row) => ({
      listingId: row.listingId,
      status: row.status,
      unlockUrl: unlockUrlForPledge(row, options.baseUrl),
    })),
  };
}
