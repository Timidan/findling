/**
 * POST /api/creator/moments/{momentId}/publish — flip a draft moment to
 * published (owner-only) so it becomes eligible for agent discovery. Previously
 * only scripts could publish; this is the missing in-app transition.
 *
 * Publishing makes the moment ELIGIBLE; it is also (best-effort) embedded here so
 * it's immediately vector-searchable. If embedding fails the moment stays
 * published and can be re-embedded later (scripts/reembed.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireUserId, UnauthenticatedError } from "@/server/auth/current-user";
import { isSameOrigin } from "@/server/auth/csrf";
import { publishMoment } from "@/server/catalog/catalog";
import { upsertMomentEmbedding, markEmbeddingFailed } from "@/server/search/embeddings";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_STATUS: Record<string, number> = {
  moment_not_found: 404,
  not_owner: 403,
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ momentId: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }

  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    throw e;
  }

  const { momentId } = await ctx.params;
  if (!UUID.test(momentId)) {
    return NextResponse.json({ error: "invalid_moment_id" }, { status: 400 });
  }

  const res = await publishMoment({ momentId, creatorId: userId });
  if (!res.ok) {
    return NextResponse.json({ error: res.reason }, { status: REASON_STATUS[res.reason] ?? 409 });
  }

  // status flipped to published — bust the cached studio catalog ("studio-catalog")
  revalidateTag("studio-catalog", "max");

  // Make it discoverable now. The moment is already published; embedding is what
  // makes it appear in agent search, so we surface the real outcome (and mark the
  // row "failed" on error so it's visibly retryable, not silently unsearchable).
  let embeddingStatus = "pending";
  try {
    const e = await upsertMomentEmbedding(momentId);
    embeddingStatus = e.status; // "embedded" | "unchanged"
  } catch (err) {
    console.error(
      "[publish] embedding failed (moment is published but NOT yet searchable):",
      err,
    );
    await markEmbeddingFailed(momentId).catch(() => {});
    embeddingStatus = "failed";
  }

  const searchable = embeddingStatus === "embedded" || embeddingStatus === "unchanged";
  return NextResponse.json({
    ok: true,
    momentId,
    status: res.moment.status,
    embeddingStatus,
    searchable,
  });
}
