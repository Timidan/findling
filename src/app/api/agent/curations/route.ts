/**
 * POST /api/agent/curations — a FINDER (human or agent) curates a moment.
 * Supply side of the two-sided agent economy: a curation agent earns the 12%
 * finder split when this curation is the attributed one on a purchase.
 */
import { NextResponse, type NextRequest } from "next/server";
import { normalizeSubmitCurationCommand } from "@/server/agent/commands";
import { submitCuration } from "@/server/catalog/curation";
import { getActor } from "@/server/auth/current-user";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const limited = await enforceRateLimit("curation", actor.userId);
  if (limited) return limited;

  const command = normalizeSubmitCurationCommand(await req.json().catch(() => null));
  if (!command.ok) {
    return NextResponse.json({ error: command.error }, { status: command.status });
  }

  try {
    const curation = await submitCuration({
      momentId: command.value.momentId,
      finderId: actor.userId,
      tags: command.value.tags,
      caption: command.value.caption,
      useCaseNote: command.value.useCaseNote,
      relevanceText: command.value.relevanceText,
      sourceSurface: command.value.sourceSurface,
    });
    return NextResponse.json({
      curationId: curation.id,
      shareSlug: curation.shareSlug,
      momentId: curation.momentId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "self_curation_not_allowed") {
      return NextResponse.json({ error: "self_curation_not_allowed" }, { status: 403 });
    }
    if (msg.includes("not found")) {
      return NextResponse.json({ error: "moment_not_found" }, { status: 404 });
    }
    console.error("[agent/curations] error:", e);
    return NextResponse.json({ error: "curation_failed" }, { status: 400 });
  }
}
