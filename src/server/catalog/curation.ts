/**
 * Curation service — a FINDER (human or agent) curates a moment into a useful
 * discovery context (tags, caption, use-case note, relevance). When that
 * curation is the attributed one on a purchase, the finder earns the 12% split.
 *
 * This is the supply-side hook for the two-sided agent economy: a curation
 * agent calls submitCuration and later withdraws its accrued finder earnings.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { curations, moments } from "@/server/db/schema";
import { scheduleReembed } from "@/server/search/reembed-queue";

export interface SubmitCurationInput {
  momentId: string;
  finderId: string;
  tags?: string[];
  caption?: string | null;
  useCaseNote?: string | null;
  relevanceText?: string | null;
  sourceSurface?: "feed" | "overlay" | "share_link" | "seed";
  /** Optional explicit share slug; generated if omitted. */
  shareSlug?: string;
}

function generateShareSlug(): string {
  return `c-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export async function submitCuration(input: SubmitCurationInput) {
  // the moment must exist (curating a non-existent moment is a client error)
  const moment = (
    await db
      .select({ id: moments.id, creatorId: moments.creatorId, status: moments.status })
      .from(moments)
      .where(eq(moments.id, input.momentId))
  )[0];
  if (!moment) throw new Error(`submitCuration: moment ${input.momentId} not found`);
  // a creator can't curate their own moment and harvest the 12% finder split
  if (moment.creatorId === input.finderId) {
    throw new Error("self_curation_not_allowed");
  }

  // One curation per (finder, moment) — enforced by curations_moment_finder_uq.
  // Re-curating the same moment UPDATES the finder's existing row in place rather
  // than minting duplicates (which would let a finder spam re-embeds / bloat the
  // 12% land-grab). momentId/finderId/shareSlug are preserved on conflict.
  const [curation] = await db
    .insert(curations)
    .values({
      momentId: input.momentId,
      finderId: input.finderId,
      tags: input.tags ?? [],
      caption: input.caption ?? null,
      useCaseNote: input.useCaseNote ?? null,
      relevanceText: input.relevanceText ?? null,
      sourceSurface: input.sourceSurface ?? "feed",
      shareSlug: input.shareSlug ?? generateShareSlug(),
    })
    .onConflictDoUpdate({
      target: [curations.momentId, curations.finderId],
      set: {
        tags: input.tags ?? [],
        caption: input.caption ?? null,
        useCaseNote: input.useCaseNote ?? null,
        relevanceText: input.relevanceText ?? null,
        sourceSurface: input.sourceSurface ?? "feed",
        updatedAt: new Date(),
      },
    })
    .returning();

  // A published moment's discovery text now includes this curation. Re-embed OFF
  // the request path, debounced/coalesced (see search/reembed-queue), so a burst
  // of curations can't storm the embedding provider + HNSW index per call.
  if (moment.status === "published") {
    scheduleReembed(input.momentId);
  }

  return curation;
}
