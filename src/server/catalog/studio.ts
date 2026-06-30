/**
 * Creator-studio read-model — every moment a creator owns (any status, not just
 * published), shaped for the management list with a short-lived signed poster
 * URL. Read-only; the Feed sees only published moments, the studio sees all.
 */
import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db/client";
import {
  assets,
  moments,
  purchases,
  receipts,
  users,
  withdrawals,
} from "@/server/db/schema";
import { supabaseStorage } from "@/server/storage/supabase-storage";
import { getCurrentUserId } from "@/server/auth/current-user";
import { COUNTED_WITHDRAWAL_STATUSES } from "@/server/ledger/earnings";
import {
  assembleStudioMoments,
  type StudioCatalogRow,
  type StudioMoment,
  type StudioSaleAgg,
} from "./studio-assemble";

export type { StudioMoment };

const SIGNED_TTL = 60 * 30;
const CATALOG_REVALIDATE_SECONDS = 15;
/**
 * Upper bound on the studio management list. It is a single-screen catalog view,
 * not an infinite feed, so this clamp keeps an extreme catalog from signing an
 * unbounded poster batch (and reading an unbounded row set) on every render.
 */
const STUDIO_MAX_MOMENTS = 500;

export interface StudioCreator {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  youtubeChannelTitle: string | null;
}

/** Public-facing handle: username → display name → short wallet → email local. */
export function studioHandle(u: {
  username?: string | null;
  displayName?: string | null;
  walletAddress?: string | null;
  email?: string | null;
}): string {
  if (u.username) return u.username;
  if (u.displayName) return u.displayName;
  if (u.walletAddress) return `${u.walletAddress.slice(0, 6)}…${u.walletAddress.slice(-4)}`;
  return u.email?.split("@")[0] ?? "Creator";
}

export interface StudioData {
  creator: StudioCreator;
  moments: StudioMoment[];
  publishedCount: number;
  earnedMicroUsdc: number;
}

interface StudioCatalogData {
  creator: StudioCreator;
  rows: StudioCatalogRow[];
}

interface StudioSale {
  momentId: string;
  licenses: number;
  earned: number;
}

/** The creator to default the studio to: the one who owns the most published moments. */
const getCachedDefaultCreatorId = unstable_cache(
  async (): Promise<string | null> => {
    const [row] = await db
      .select({ creatorId: moments.creatorId, n: count() })
      .from(moments)
      .where(eq(moments.status, "published"))
      .groupBy(moments.creatorId)
      .orderBy(desc(count()))
      .limit(1);
    if (row?.creatorId) return row.creatorId;
    const [anyCreator] = await db
      .select({ id: users.id })
      .from(moments)
      .innerJoin(users, eq(users.id, moments.creatorId))
      .limit(1);
    return anyCreator?.id ?? null;
  },
  ["studio-default-creator-v1"],
  { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["studio-catalog"] },
);

export async function getDefaultCreatorId(): Promise<string | null> {
  return getCachedDefaultCreatorId();
}

/**
 * The studio's acting creator: the LOGGED-IN wallet user if there's a session,
 * otherwise the public default creator (a read-only preview of the demo
 * catalogue). No caller-supplied id override — that was an IDOR.
 */
export async function resolveStudioCreatorId(): Promise<string | null> {
  return (await getCurrentUserId()) ?? (await getDefaultCreatorId());
}

const getStudioCatalogRows = unstable_cache(
  async (
    creatorId: string,
    publishedOnly: boolean,
  ): Promise<StudioCatalogData | null> => {
    const creator = (
      await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          youtubeChannelTitle: users.youtubeChannelTitle,
        })
        .from(users)
        .where(eq(users.id, creatorId))
    )[0];
    if (!creator) return null;

    const rows = await db
      .select({
        moment: {
          id: moments.id,
          title: moments.title,
          description: moments.description,
          status: moments.status,
          usageType: moments.usageType,
          durationMs: moments.durationMs,
          priceMicroUsdc: moments.priceMicroUsdc,
          ownershipVerified: moments.ownershipVerified,
          posterStorageKey: moments.posterStorageKey,
          createdAt: moments.createdAt,
        },
        asset: {
          sourceType: assets.sourceType,
        },
      })
      .from(moments)
      .innerJoin(assets, eq(assets.id, moments.assetId))
      // a logged-OUT preview (default-creator) must only ever see PUBLISHED
      // moments — never another creator's drafts or their signed poster URLs.
      .where(
        publishedOnly
          ? and(
              eq(moments.creatorId, creatorId),
              eq(moments.status, "published"),
            )
          : eq(moments.creatorId, creatorId),
      )
      .orderBy(desc(moments.createdAt))
      .limit(STUDIO_MAX_MOMENTS);

    return { creator, rows };
  },
  ["studio-catalog-v1"],
  { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["studio-catalog"] },
);

async function getStudioSales(creatorId: string): Promise<StudioSale[]> {
  return db
    .select({
      momentId: purchases.momentId,
      licenses: count(),
      earned: sql<number>`coalesce(sum(${purchases.creatorMicroUsdc}), 0)`,
    })
    .from(purchases)
    .where(
      and(eq(purchases.creatorId, creatorId), eq(purchases.status, "settled")),
    )
    .groupBy(purchases.momentId);
}

export interface StudioIdentity {
  id: string;
  email: string;
  username: string | null;
  walletAddress: string | null;
  displayName: string | null;
  youtubeChannelTitle: string | null;
  payoutWalletAddress: string | null;
}

/**
 * Lightweight creator identity for the studio shell (sidebar, settings, and the
 * earnings/payouts resolver). Defaults to the studio's default creator unless an
 * explicit id is given. No signed URLs or aggregation — cheap enough for a layout.
 */
export async function getStudioIdentity(
  creatorId?: string,
): Promise<StudioIdentity | null> {
  const id = creatorId ?? (await getDefaultCreatorId());
  if (!id) return null;
  const row = (
    await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        walletAddress: users.walletAddress,
        displayName: users.displayName,
        youtubeChannelTitle: users.youtubeChannelTitle,
        payoutWalletAddress: users.payoutWalletAddress,
      })
      .from(users)
      .where(eq(users.id, id))
  )[0];
  return row ?? null;
}

export async function getStudioData(
  creatorId: string,
  publishedOnly = false,
): Promise<StudioData | null> {
  const [catalog, sales] = await Promise.all([
    getStudioCatalogRows(creatorId, publishedOnly),
    getStudioSales(creatorId),
  ]);
  if (!catalog) return null;

  const salesByMoment = new Map<string, StudioSaleAgg>(
    sales.map((s) => [
      s.momentId,
      { licenses: Number(s.licenses), earned: Number(s.earned) },
    ]),
  );

  // Sign every poster in ONE batch round-trip instead of one network call per
  // row (the old unbounded Promise.all). A whole-batch failure degrades to null
  // URLs, matching the previous per-row `.catch(() => null)` behaviour.
  const posterKeys = catalog.rows
    .map((r) => r.moment.posterStorageKey)
    .filter((k): k is string => !!k);
  const posterUrlByKey = await supabaseStorage.createSignedDownloadUrls(
    posterKeys,
    SIGNED_TTL,
  );

  const { moments: out, publishedCount, earnedMicroUsdc } = assembleStudioMoments(
    catalog.rows,
    salesByMoment,
    posterUrlByKey,
  );

  return {
    creator: catalog.creator,
    moments: out,
    publishedCount,
    earnedMicroUsdc,
  };
}

export interface RecentLicense {
  purchaseId: string;
  momentTitle: string;
  at: Date;
  grossMicroUsdc: number;
  /** this user's earned share on this license (creator + finder, whichever applies) */
  yourShareMicroUsdc: number;
  role: "creator" | "finder" | "both";
  viaAgent: boolean;
  /** public receipt slug, if a receipt was minted — links the row to its on-chain proof */
  receiptSlug: string | null;
}

/**
 * The most recent settled licenses this user earned from (as creator and/or
 * finder), newest first — a time-ordered activity ledger for the studio.
 */
export async function getRecentLicenses(
  userId: string,
  limit = 6,
): Promise<RecentLicense[]> {
  const rows = await db
    .select({
      id: purchases.id,
      title: moments.title,
      settledAt: purchases.settledAt,
      createdAt: purchases.createdAt,
      gross: purchases.grossMicroUsdc,
      creatorShare: purchases.creatorMicroUsdc,
      finderShare: purchases.finderMicroUsdc,
      creatorId: purchases.creatorId,
      finderId: purchases.finderId,
      agentRunId: purchases.agentRunId,
      receiptSlug: receipts.publicSlug,
    })
    .from(purchases)
    .innerJoin(moments, eq(moments.id, purchases.momentId))
    .leftJoin(receipts, eq(receipts.purchaseId, purchases.id))
    .where(
      and(
        eq(purchases.status, "settled"),
        or(eq(purchases.creatorId, userId), eq(purchases.finderId, userId)),
      ),
    )
    .orderBy(desc(purchases.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const isCreator = r.creatorId === userId;
    const isFinder = r.finderId === userId;
    return {
      purchaseId: r.id,
      momentTitle: r.title,
      at: r.settledAt ?? r.createdAt,
      grossMicroUsdc: Number(r.gross),
      yourShareMicroUsdc:
        (isCreator ? Number(r.creatorShare) : 0) + (isFinder ? Number(r.finderShare) : 0),
      role: isCreator && isFinder ? "both" : isCreator ? "creator" : "finder",
      viaAgent: !!r.agentRunId,
      receiptSlug: r.receiptSlug ?? null,
    };
  });
}

/* ---------------- unified transactions ledger ---------------- */

export type LedgerKind = "license" | "withdrawal";

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  at: Date;
  /** moment title (license) or a payout label (withdrawal) */
  label: string;
  role: "creator" | "finder" | "both";
  /** signed money for display: +share for a license credit, −amount for a payout */
  signedMicroUsdc: number;
  /** "settled" for a license credit, else the withdrawal status */
  status: "settled" | "requested" | "submitted" | "succeeded" | "failed";
  /** on-chain tx hash (withdrawals only, once broadcast) */
  transactionHash: string | null;
  /** destination wallet (withdrawals only) */
  walletAddress: string | null;
  /** public receipt slug (licenses only) */
  receiptSlug: string | null;
  viaAgent: boolean;
  /** running ledger balance AFTER this entry (micro-USDC), oldest→newest */
  balanceMicroUsdc: number;
}

export interface TransactionLedger {
  entries: LedgerEntry[]; // newest first
  /** current ledger balance — must equal earnings.totalWithdrawable */
  endingBalanceMicroUsdc: number;
}

// in-flight or done withdrawals reduce the balance; a failed one is shown but
// does NOT move the balance — same status set getEarnings() counts, so the
// ledger's running balance always reconciles with "withdrawable now".
const BALANCE_REDUCING = new Set<string>(COUNTED_WITHDRAWAL_STATUSES);

/**
 * One reverse-chronological transactions feed interleaving inflows (license
 * credits, +) and outflows (withdrawals, −) with a running balance — the
 * wallet-activity view of a creator/finder's money. Credits are off-chain ledger
 * entries (linkable to their public receipt); withdrawals are real Arc payouts
 * (linkable to the explorer by tx hash). The running balance is computed across
 * the FULL set so the most-recent row reconciles to "withdrawable now".
 */
export async function getTransactionLedger(
  userId: string,
): Promise<TransactionLedger> {
  const [creditRows, withdrawalRows] = await Promise.all([
    db
      .select({
        id: purchases.id,
        title: moments.title,
        settledAt: purchases.settledAt,
        createdAt: purchases.createdAt,
        creatorShare: purchases.creatorMicroUsdc,
        finderShare: purchases.finderMicroUsdc,
        creatorId: purchases.creatorId,
        finderId: purchases.finderId,
        agentRunId: purchases.agentRunId,
        receiptSlug: receipts.publicSlug,
      })
      .from(purchases)
      .innerJoin(moments, eq(moments.id, purchases.momentId))
      .leftJoin(receipts, eq(receipts.purchaseId, purchases.id))
      .where(
        and(
          eq(purchases.status, "settled"),
          or(eq(purchases.creatorId, userId), eq(purchases.finderId, userId)),
        ),
      ),
    db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.recipientUserId, userId)),
  ]);

  const credits: LedgerEntry[] = creditRows.map((r) => {
    const isCreator = r.creatorId === userId;
    const isFinder = r.finderId === userId;
    return {
      id: `license:${r.id}`,
      kind: "license",
      at: r.settledAt ?? r.createdAt,
      label: r.title,
      role: isCreator && isFinder ? "both" : isCreator ? "creator" : "finder",
      signedMicroUsdc:
        (isCreator ? Number(r.creatorShare) : 0) +
        (isFinder ? Number(r.finderShare) : 0),
      status: "settled",
      transactionHash: null,
      walletAddress: null,
      receiptSlug: r.receiptSlug ?? null,
      viaAgent: !!r.agentRunId,
      balanceMicroUsdc: 0,
    };
  });

  const debits: LedgerEntry[] = withdrawalRows.map((w) => ({
    id: `withdrawal:${w.id}`,
    kind: "withdrawal",
    // order by REQUEST time: the balance is decremented from `requested` onward
    // (createdAt), so folding by createdAt keeps every intermediate running
    // balance correct even while a payout is still settling. completedAt is only
    // proof metadata, surfaced via the tx link rather than the timeline.
    at: w.createdAt,
    label: `${w.role} payout`,
    role: w.role,
    signedMicroUsdc: -Number(w.amountMicroUsdc),
    status: w.status,
    transactionHash: w.transactionHash,
    walletAddress: w.recipientWalletAddress,
    receiptSlug: null,
    viaAgent: false,
    balanceMicroUsdc: 0,
  }));

  // oldest → newest, then fold the running balance (failed payouts move nothing).
  // Deterministic tie-break for same-millisecond rows so per-row balances are
  // stable across reads: time, then credit-before-debit, then id.
  const ordered = [...credits, ...debits].sort((a, b) => {
    const dt = a.at.getTime() - b.at.getTime();
    if (dt !== 0) return dt;
    if (a.kind !== b.kind) return a.kind === "license" ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  let balance = 0;
  for (const e of ordered) {
    if (e.kind === "license") balance += e.signedMicroUsdc;
    else if (BALANCE_REDUCING.has(e.status)) balance += e.signedMicroUsdc;
    e.balanceMicroUsdc = balance;
  }

  return {
    entries: ordered.reverse(),
    endingBalanceMicroUsdc: balance,
  };
}
