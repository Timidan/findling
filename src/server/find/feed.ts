import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db/client";
import { assets, momentEmbeddings, moments, users } from "../db/schema";
import {
  isLicensableMoment,
  TAKEDOWN_ASSET_STATUSES,
} from "../catalog/licensable";
import {
  EMBEDDING_DIMENSIONS,
  getEmbeddingProvider,
  type EmbeddingProvider,
} from "../search";
import { listListings } from "../claimable/listings";
import { supabaseStorage } from "../storage/supabase-storage";

const DEFAULT_FEED_LIMIT = 30;
const MAX_FEED_LIMIT = 60;
const WANTED_FETCH_LIMIT = 100;
const PREVIEW_SIGNED_TTL_SECONDS = 60 * 15;

export type FeedTab = "all" | "available" | "wanted";
export type FeedSource = "upload" | "youtube" | "peertube";
export type FeedUsageType =
  | "video_embed"
  | "newsletter"
  | "social_post"
  | "internal_reference";

export interface FeedFilters {
  usageType?: FeedUsageType | null;
  licence?: string | null;
  source?: FeedSource | null;
  minDurationMs?: number | null;
  maxDurationMs?: number | null;
  maxPriceMicroUsdc?: number | null;
}

export interface LicensableFeedOptions {
  query?: string | null;
  filters?: FeedFilters | null;
  limit?: number | null;
}

export interface UnifiedFeedOptions extends LicensableFeedOptions {
  tab?: FeedTab | null;
}

export interface AvailableFeedItem {
  kind: "available";
  id: string;
  title: string;
  who: string;
  durationMs: number;
  priceMicroUsdc: number;
  licence: string;
  posterUrl: string | null;
  previewUrl: string;
}

export interface WantedFeedItem {
  kind: "wanted";
  listingId: string;
  title: string;
  externalIdentity: string;
  sourceLicenceLabel: string | null;
  sourceThumbnailUrl: string | null;
  pledgedDemandMicroUsdc: number;
  pledgeCount: number;
}

export type FeedItem = AvailableFeedItem | WantedFeedItem;

export interface UnifiedFeedResult {
  items: FeedItem[];
}

type AvailableQueryRow = {
  moment: typeof moments.$inferSelect;
  asset: typeof assets.$inferSelect;
  creator: Pick<
    typeof users.$inferSelect,
    "username" | "displayName" | "walletAddress" | "email"
  >;
};

type NormalizedFilters = {
  usageType?: FeedUsageType;
  licence?: string;
  source?: FeedSource;
  minDurationMs?: number;
  maxDurationMs?: number;
  maxPriceMicroUsdc?: number;
};

function cleanText(v: string | null | undefined): string {
  return v?.trim() ?? "";
}

function normalizeQuery(query: string | null | undefined): string {
  return cleanText(query);
}

function integerOrUndefined(v: number | null | undefined): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.trunc(v);
}

export function clampFeedLimit(limit: number | null | undefined): number {
  const n = integerOrUndefined(limit);
  if (n == null) return DEFAULT_FEED_LIMIT;
  return Math.min(Math.max(n, 1), MAX_FEED_LIMIT);
}

function normalizeFilters(filters: FeedFilters | null | undefined): NormalizedFilters {
  const out: NormalizedFilters = {};
  if (!filters) return out;

  if (filters.usageType) out.usageType = filters.usageType;
  const licence = cleanText(filters.licence);
  if (licence) out.licence = licence;
  if (filters.source) out.source = filters.source;

  const minDurationMs = integerOrUndefined(filters.minDurationMs);
  if (minDurationMs != null) out.minDurationMs = minDurationMs;
  const maxDurationMs = integerOrUndefined(filters.maxDurationMs);
  if (maxDurationMs != null) out.maxDurationMs = maxDurationMs;
  const maxPriceMicroUsdc = integerOrUndefined(filters.maxPriceMicroUsdc);
  if (maxPriceMicroUsdc != null) out.maxPriceMicroUsdc = maxPriceMicroUsdc;

  return out;
}

function assertVector(v: number[] | undefined): asserts v is number[] {
  if (!Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `feed embedding: expected ${EMBEDDING_DIMENSIONS}-dim vector, got ${v?.length}`,
    );
  }
  for (const x of v) {
    if (!Number.isFinite(x)) throw new Error("feed embedding: non-finite value");
  }
}

function assertProviderDims(provider: EmbeddingProvider) {
  if (provider.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `feed embedding provider ${provider.provider}/${provider.model} has ${provider.dimensions} dims, schema requires ${EMBEDDING_DIMENSIONS}`,
    );
  }
}

function licenceLabel(summary: string | null): string {
  const value = cleanText(summary);
  return value || "Standard";
}

function creatorLabel(creator: AvailableQueryRow["creator"]): string {
  if (creator.username) return creator.username;
  if (creator.displayName) return creator.displayName;
  if (creator.walletAddress) {
    return `${creator.walletAddress.slice(0, 6)}...${creator.walletAddress.slice(-4)}`;
  }
  return creator.email?.split("@")[0] ?? "Creator";
}

function matchesFilters(row: AvailableQueryRow, filters: NormalizedFilters): boolean {
  const { moment, asset } = row;
  if (filters.usageType && moment.usageType !== filters.usageType) return false;
  if (filters.source && asset.sourceType !== filters.source) return false;
  if (
    filters.minDurationMs != null &&
    moment.durationMs < filters.minDurationMs
  ) {
    return false;
  }
  if (
    filters.maxDurationMs != null &&
    moment.durationMs > filters.maxDurationMs
  ) {
    return false;
  }
  if (
    filters.maxPriceMicroUsdc != null &&
    moment.priceMicroUsdc > filters.maxPriceMicroUsdc
  ) {
    return false;
  }
  if (filters.licence) {
    const haystack = licenceLabel(moment.licenseSummary).toLowerCase();
    if (!haystack.includes(filters.licence.toLowerCase())) return false;
  }
  return true;
}

function availableSqlFilters(filters: NormalizedFilters, provider?: EmbeddingProvider) {
  const conditions = [
    eq(moments.status, "published"),
    isNotNull(moments.clipStorageKey),
    isNotNull(moments.previewStorageKey),
    eq(moments.ownershipVerified, true),
    isNotNull(moments.attestationAt),
    notInArray(assets.status, [...TAKEDOWN_ASSET_STATUSES]),
  ];

  if (provider) {
    conditions.push(eq(momentEmbeddings.provider, provider.provider));
    conditions.push(eq(momentEmbeddings.model, provider.model));
  }
  if (filters.usageType) {
    conditions.push(eq(moments.usageType, filters.usageType));
  }
  if (filters.source) {
    conditions.push(sql`${assets.sourceType} = ${filters.source}`);
  }
  if (filters.licence) {
    const labelMatch = ilike(moments.licenseSummary, `%${filters.licence}%`);
    conditions.push(
      filters.licence.toLowerCase() === "standard"
        ? or(labelMatch, isNull(moments.licenseSummary))!
        : labelMatch,
    );
  }
  if (filters.minDurationMs != null) {
    conditions.push(gte(moments.durationMs, filters.minDurationMs));
  }
  if (filters.maxDurationMs != null) {
    conditions.push(lte(moments.durationMs, filters.maxDurationMs));
  }
  if (filters.maxPriceMicroUsdc != null) {
    conditions.push(lte(moments.priceMicroUsdc, filters.maxPriceMicroUsdc));
  }

  return conditions;
}

function baseAvailableSelect() {
  return {
    moment: moments,
    asset: assets,
    creator: {
      username: users.username,
      displayName: users.displayName,
      walletAddress: users.walletAddress,
      email: users.email,
    },
  };
}

async function semanticAvailableRows(
  query: string,
  filters: NormalizedFilters,
  limit: number,
): Promise<AvailableQueryRow[]> {
  const provider = getEmbeddingProvider();
  assertProviderDims(provider);
  const [queryVector] = await provider.embed([query]);
  assertVector(queryVector);

  const distance = cosineDistance(momentEmbeddings.embedding, queryVector);

  return db
    .select(baseAvailableSelect())
    .from(momentEmbeddings)
    .innerJoin(moments, eq(moments.id, momentEmbeddings.momentId))
    .innerJoin(assets, eq(assets.id, moments.assetId))
    .innerJoin(users, eq(users.id, moments.creatorId))
    .where(and(...availableSqlFilters(filters, provider)))
    .orderBy(asc(distance), desc(moments.createdAt))
    .limit(limit);
}

async function recentAvailableRows(
  filters: NormalizedFilters,
  limit: number,
): Promise<AvailableQueryRow[]> {
  return db
    .select(baseAvailableSelect())
    .from(moments)
    .innerJoin(assets, eq(assets.id, moments.assetId))
    .innerJoin(users, eq(users.id, moments.creatorId))
    .where(and(...availableSqlFilters(filters)))
    .orderBy(desc(moments.createdAt))
    .limit(limit);
}

async function lexicalAvailableRows(
  query: string,
  filters: NormalizedFilters,
  limit: number,
): Promise<AvailableQueryRow[]> {
  const like = `%${query}%`;
  return db
    .select(baseAvailableSelect())
    .from(moments)
    .innerJoin(assets, eq(assets.id, moments.assetId))
    .innerJoin(users, eq(users.id, moments.creatorId))
    .where(
      and(
        ...availableSqlFilters(filters),
        or(
          ilike(moments.title, like),
          ilike(moments.description, like),
          ilike(assets.title, like),
          ilike(assets.description, like),
          ilike(assets.sourceUrl, like),
        )!,
      ),
    )
    .orderBy(desc(moments.createdAt))
    .limit(limit);
}

function mergeAvailableRows(
  primary: AvailableQueryRow[],
  secondary: AvailableQueryRow[],
  limit: number,
): AvailableQueryRow[] {
  const seen = new Set<string>();
  const out: AvailableQueryRow[] = [];
  for (const row of [...primary, ...secondary]) {
    if (seen.has(row.moment.id)) continue;
    seen.add(row.moment.id);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

async function availableItemsFromRows(
  rows: AvailableQueryRow[],
  filters: NormalizedFilters,
): Promise<AvailableFeedItem[]> {
  const eligibleRows = rows.filter(
    (row) =>
      isLicensableMoment(row.moment, row.asset) &&
      !!row.moment.previewStorageKey &&
      matchesFilters(row, filters),
  );
  const previewKeys = eligibleRows.map((row) => row.moment.previewStorageKey!);
  // Poster is a separate still image (poster_storage_key, a .jpg) — NOT the
  // licensed clip. Signing it publicly is safe and intended; the <img> in the
  // card needs an image, not the preview .mp4.
  const posterKeys = eligibleRows
    .map((row) => row.moment.posterStorageKey)
    .filter((key): key is string => !!key);
  const [previewUrlByKey, posterUrlByKey] = await Promise.all([
    supabaseStorage.createSignedDownloadUrls(previewKeys, PREVIEW_SIGNED_TTL_SECONDS),
    posterKeys.length
      ? supabaseStorage.createSignedDownloadUrls(posterKeys, PREVIEW_SIGNED_TTL_SECONDS)
      : Promise.resolve(new Map<string, string | null>()),
  ]);

  return eligibleRows.flatMap((row) => {
    const previewKey = row.moment.previewStorageKey!;
    const previewUrl = previewUrlByKey.get(previewKey);
    if (!previewUrl) return [];
    const posterUrl = row.moment.posterStorageKey
      ? posterUrlByKey.get(row.moment.posterStorageKey) ?? null
      : null;
    return [
      {
        kind: "available" as const,
        id: row.moment.id,
        title: row.moment.title,
        who: `${creatorLabel(row.creator)} @ ${row.asset.sourceType}`,
        durationMs: row.moment.durationMs,
        priceMicroUsdc: row.moment.priceMicroUsdc,
        licence: licenceLabel(row.moment.licenseSummary),
        posterUrl,
        previewUrl,
      },
    ];
  });
}

export async function getLicensableFeed(
  opts: LicensableFeedOptions = {},
): Promise<AvailableFeedItem[]> {
  const limit = clampFeedLimit(opts.limit);
  const query = normalizeQuery(opts.query);
  const filters = normalizeFilters(opts.filters);
  let rows: AvailableQueryRow[];
  if (query) {
    let semanticRows: AvailableQueryRow[] = [];
    try {
      semanticRows = await semanticAvailableRows(query, filters, limit);
    } catch (e) {
      console.error("[find/feed] semantic search failed; using text search:", e);
    }
    const lexicalRows =
      semanticRows.length >= limit
        ? []
        : await lexicalAvailableRows(query, filters, limit);
    rows = mergeAvailableRows(semanticRows, lexicalRows, limit);
  } else {
    rows = await recentAvailableRows(filters, limit);
  }
  return availableItemsFromRows(rows, filters);
}

function matchesWantedQuery(
  listing: { title: string; externalIdentity: string },
  query: string,
): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    listing.title.toLowerCase().includes(needle) ||
    listing.externalIdentity.toLowerCase().includes(needle)
  );
}

async function getWantedFeed(
  opts: Pick<UnifiedFeedOptions, "query" | "limit"> = {},
): Promise<WantedFeedItem[]> {
  const limit = clampFeedLimit(opts.limit);
  const query = normalizeQuery(opts.query);
  const { listings } = await listListings({
    audience: "public",
    limit: WANTED_FETCH_LIMIT,
  });

  return listings
    .filter((listing) => matchesWantedQuery(listing, query))
    .slice(0, limit)
    .map((listing) => ({
      kind: "wanted" as const,
      listingId: listing.id,
      title: listing.title,
      externalIdentity: listing.externalIdentity,
      sourceLicenceLabel: listing.sourceLicenceLabel,
      sourceThumbnailUrl: listing.sourceThumbnailUrl,
      pledgedDemandMicroUsdc: listing.pledgedDemandMicroUsdc,
      pledgeCount: listing.pledgeCount,
    }));
}

function mergeDemandFirst(
  wanted: WantedFeedItem[],
  available: AvailableFeedItem[],
  limit: number,
): FeedItem[] {
  const out: FeedItem[] = [];
  let wantedIndex = 0;
  let availableIndex = 0;

  while (
    out.length < limit &&
    (wantedIndex < wanted.length || availableIndex < available.length)
  ) {
    let added = false;
    for (let i = 0; i < 2 && out.length < limit; i++) {
      if (wantedIndex < wanted.length) {
        out.push(wanted[wantedIndex++]);
        added = true;
      }
    }
    if (availableIndex < available.length && out.length < limit) {
      out.push(available[availableIndex++]);
      added = true;
    }
    if (!added) break;
  }

  return out;
}

export async function getUnifiedFeed(
  opts: UnifiedFeedOptions = {},
): Promise<UnifiedFeedResult> {
  const tab = opts.tab ?? "all";
  const limit = clampFeedLimit(opts.limit);

  if (tab === "available") {
    return { items: await getLicensableFeed({ ...opts, limit }) };
  }
  if (tab === "wanted") {
    return { items: await getWantedFeed({ query: opts.query, limit }) };
  }

  const [wanted, available] = await Promise.all([
    getWantedFeed({ query: opts.query, limit }),
    getLicensableFeed({ ...opts, limit }),
  ]);
  return { items: mergeDemandFirst(wanted, available, limit) };
}
