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
    .returning();

  // If the moment is already live, fold this new curation signal into search NOW.
  // The embedding source text includes curation tags/captions, so without this a
  // finder's tags wouldn't affect agent discovery until a manual re-embed.
  // Best-effort, and a dynamic import keeps the search module out of curation's
  // static import graph; a published moment stays published if a transient embed fails.
  if (moment.status === "published") {
    try {
      const { upsertMomentEmbedding } = await import("@/server/search/embeddings");
      await upsertMomentEmbedding(input.momentId);
    } catch (e) {
      console.error("[submitCuration] re-embed after curation failed:", e);
    }
  }

  return curation;
}
