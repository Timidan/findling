import {
  createListing,
  ListingConflictError,
  type CreateListingInput,
  type CreateListingResult,
} from "./listings";
import { fetchPublicJson, type LookupFn } from "./public-fetch";

const CLEAN_LICENCE_LABELS = new Map<number, string>([
  [1, "CC BY"],
  [2, "CC BY-SA"],
  [7, "CC0"],
]);

const DEFAULT_PAGE_SIZE = 100;

type FetchImpl = typeof fetch;
type CreateListingFn = (
  finderId: string,
  input: CreateListingInput,
) => Promise<CreateListingResult | unknown>;

export interface SeedFromPeerTubeInput {
  instance: string;
  /**
   * Real Findling user id for the configured seed finder.
   * Seeded listings still pay the finder 12% after activation, so callers must
   * pass an existing system/seed finder user id instead of a fabricated id.
   */
  seedFinderId: string;
  maxPages: number;
  pageSize?: number;
  fetchImpl?: FetchImpl;
  lookup?: LookupFn;
  timeoutMs?: number;
  maxBytes?: number;
  create?: CreateListingFn;
}

export interface SeedFromPeerTubeResult {
  pagesFetched: number;
  videosSeen: number;
  kept: number;
  excludedByLicence: number;
  duplicatesSkipped: number;
  invalidSkipped: number;
  created: number;
  conflictSkipped: number;
}

interface MappedPeerTubeVideo {
  dedupeKey: string;
  input: CreateListingInput;
}

function emptyResult(): SeedFromPeerTubeResult {
  return {
    pagesFetched: 0,
    videosSeen: 0,
    kept: 0,
    excludedByLicence: 0,
    duplicatesSkipped: 0,
    invalidSkipped: 0,
    created: 0,
    conflictSkipped: 0,
  };
}

function clampPositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordField(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const field = value[key];
  return isRecord(field) ? field : null;
}

function stringField(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!value) return null;
  const field = value[key];
  if (typeof field !== "string") return null;
  const trimmed = field.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberField(
  value: Record<string, unknown> | null,
  key: string,
): number | null {
  if (!value) return null;
  const field = value[key];
  const n = typeof field === "number" ? field : Number(field);
  return Number.isFinite(n) ? n : null;
}

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function canonicalIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

function videoApiUrl(instance: string, count: number, start: number): URL {
  const url = new URL("/api/v1/videos", instance);
  url.searchParams.set("count", String(count));
  url.searchParams.set("start", String(start));
  return url;
}

function licenceLabel(video: Record<string, unknown>): string | null {
  const licence = recordField(video, "licence") ?? recordField(video, "license");
  const id = numberField(licence, "id");
  return id == null ? null : CLEAN_LICENCE_LABELS.get(id) ?? null;
}

function channelForVideo(
  video: Record<string, unknown>,
): Record<string, unknown> | null {
  return recordField(video, "channel") ?? recordField(video, "videoChannel");
}

function actorKeyForVideo(
  video: Record<string, unknown>,
  channel: Record<string, unknown>,
): string | null {
  const account = recordField(video, "account");
  return (
    stringField(channel, "actorId") ??
    stringField(channel, "url") ??
    stringField(account, "actorId") ??
    stringField(account, "url")
  );
}

/**
 * Build an absolute https thumbnail URL from a video's instance-relative
 * `thumbnailPath` (e.g. "/lazy-static/thumbnails/<uuid>.jpg"). Hardened: only a
 * single-slash absolute path is accepted, and the resolved URL must stay on the
 * crawled instance's https origin — never an off-origin or protocol-relative host.
 */
export function thumbnailUrlForVideo(
  video: Record<string, unknown>,
  instance: string,
): string | null {
  const path =
    stringField(video, "thumbnailPath") ?? stringField(video, "previewPath");
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  try {
    const base = new URL(instance);
    const url = new URL(path, base);
    if (url.protocol !== "https:") return null;
    if (url.origin !== base.origin) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function mapPeerTubeVideo(
  video: unknown,
  instance: string,
): MappedPeerTubeVideo | null {
  if (!isRecord(video)) return null;

  const sourceLicenceLabel = licenceLabel(video);
  if (!sourceLicenceLabel) return null;

  const uuid = stringField(video, "uuid");
  const title = stringField(video, "name");
  const channel = channelForVideo(video);
  const channelUrl = stringField(channel, "url");
  const channelName =
    stringField(channel, "name") ?? stringField(channel, "displayName");
  const channelHost = stringField(channel, "host") ?? hostFromUrl(channelUrl);
  const actorKey = channel ? actorKeyForVideo(video, channel) : null;

  if (!uuid || !title || !channelUrl || !channelName || !channelHost || !actorKey) {
    return null;
  }

  return {
    dedupeKey: `${canonicalIdentity(actorKey)}::${uuid.toLowerCase()}`,
    input: {
      externalIdentity: `${channelName} · ${channelHost}`,
      externalIdentityKind: "peertube_channel",
      externalRef: channelUrl,
      title,
      sourceLicenceLabel,
      sourceThumbnailUrl: thumbnailUrlForVideo(video, instance),
    },
  };
}

async function loadPeerTubePage(
  fetchImpl: FetchImpl,
  instance: string,
  count: number,
  start: number,
  input: Pick<SeedFromPeerTubeInput, "lookup" | "timeoutMs" | "maxBytes">,
): Promise<{ data: unknown[]; total: number | null }> {
  const body = await fetchPublicJson(videoApiUrl(instance, count, start), {
    fetch: fetchImpl,
    lookup: input.lookup,
    timeoutMs: input.timeoutMs,
    maxBytes: input.maxBytes,
    headers: { accept: "application/json" },
  });
  if (!isRecord(body)) return { data: [], total: null };

  const data = Array.isArray(body.data) ? body.data : [];
  const total = numberField(body, "total");
  return { data, total };
}

export async function seedFromPeerTube(
  input: SeedFromPeerTubeInput,
): Promise<SeedFromPeerTubeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const create = input.create ?? createListing;
  const pageSize = clampPositiveInteger(input.pageSize, DEFAULT_PAGE_SIZE);
  const maxPages = clampPositiveInteger(input.maxPages, 1);
  const result = emptyResult();
  const seen = new Set<string>();

  let start = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const { data, total } = await loadPeerTubePage(
      fetchImpl,
      input.instance,
      pageSize,
      start,
      input,
    );
    result.pagesFetched += 1;

    for (const raw of data) {
      result.videosSeen += 1;
      const licence = isRecord(raw) ? licenceLabel(raw) : null;
      if (!licence) {
        result.excludedByLicence += 1;
        continue;
      }

      const mapped = mapPeerTubeVideo(raw, input.instance);
      if (!mapped) {
        result.invalidSkipped += 1;
        continue;
      }
      if (seen.has(mapped.dedupeKey)) {
        result.duplicatesSkipped += 1;
        continue;
      }
      seen.add(mapped.dedupeKey);
      result.kept += 1;

      try {
        await create(input.seedFinderId, mapped.input);
        result.created += 1;
      } catch (e) {
        if (
          e instanceof ListingConflictError &&
          e.reason === "duplicate_live_external_ref"
        ) {
          result.conflictSkipped += 1;
          continue;
        }
        throw e;
      }
    }

    start += pageSize;
    if (data.length === 0) break;
    if (total !== null && start >= total) break;
    if (total === null && data.length < pageSize) break;
  }

  return result;
}
