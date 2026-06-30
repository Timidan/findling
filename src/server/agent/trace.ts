/**
 * Agent-run trace read-model — the auditable story of one autonomous decision:
 * request → parsed constraints → ranked candidates → chosen moment → finder
 * attribution → payment → receipt. This is the agentic decision artifact.
 */
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/server/db/client";
import { agentRuns, moments, users, receipts } from "@/server/db/schema";
import { canViewTrace } from "./trace-access";

export interface TraceCandidate {
  momentId: string;
  title: string;
  score: number;
  chosen: boolean;
}

export interface AgentRunTrace {
  runId: string;
  surface: string;
  requestText: string;
  parsedConstraints: unknown;
  budgetMicroUsdc: number | null;
  candidates: TraceCandidate[];
  chosenMomentTitle: string | null;
  chosenFinderHandle: string | null;
  attributionReason: string | null;
  paymentStatus: string;
  paymentReference: string | null;
  receiptSlug: string | null;
  startedAt: string;
  completedAt: string | null;
}

export async function getAgentRunTrace(
  runId: string,
  viewerUserId: string | null,
): Promise<AgentRunTrace | null> {
  const run = (await db.select().from(agentRuns).where(eq(agentRuns.id, runId)))[0];
  if (!run) return null;
  // Private buyer runs are owner-only; ownerless demo runs stay public. Return
  // null (→ 404 in the page) rather than 403 so we don't leak that a run exists.
  if (!canViewTrace(run.buyerId, viewerUserId)) return null;

  const ids = run.candidateMomentIds ?? [];
  const titleRows = ids.length
    ? await db.select({ id: moments.id, title: moments.title }).from(moments).where(inArray(moments.id, ids))
    : [];
  const titleById = new Map(titleRows.map((r) => [r.id, r.title]));
  const scoreById = new Map(
    ((run.candidateScores as { momentId: string; score: number }[] | null) ?? []).map((s) => [s.momentId, s.score]),
  );
  const candidates: TraceCandidate[] = ids.map((id) => ({
    momentId: id,
    title: titleById.get(id) ?? "(unavailable)",
    score: scoreById.get(id) ?? 0,
    chosen: id === run.chosenMomentId,
  }));

  const chosenMomentTitle = run.chosenMomentId ? titleById.get(run.chosenMomentId) ?? null : null;
  const finder = run.chosenFinderId
    ? (await db.select().from(users).where(eq(users.id, run.chosenFinderId)))[0]
    : undefined;
  const receipt = run.receiptId
    ? (await db.select({ slug: receipts.publicSlug }).from(receipts).where(eq(receipts.id, run.receiptId)))[0]
    : undefined;

  return {
    runId: run.id,
    surface: run.surface,
    requestText: run.requestText,
    parsedConstraints: run.parsedConstraints,
    budgetMicroUsdc: run.budgetMicroUsdc,
    candidates,
    chosenMomentTitle,
    chosenFinderHandle: finder ? finder.displayName ?? finder.email.split("@")[0] : null,
    attributionReason: run.attributionReason,
    paymentStatus: run.paymentStatus,
    paymentReference: run.paymentReference,
    receiptSlug: receipt?.slug ?? null,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
  };
}

/**
 * Most-recent settled run the viewer is allowed to see — the default for the
 * demo trace page. Owner-scoped so `/trace/latest` can never resolve to another
 * buyer's private run: an anonymous viewer only ever sees ownerless (null-buyer)
 * demo runs; a logged-in viewer additionally sees their own.
 */
export async function getLatestSettledRunId(
  viewerUserId: string | null,
): Promise<string | null> {
  const visible = viewerUserId
    ? or(isNull(agentRuns.buyerId), eq(agentRuns.buyerId, viewerUserId))
    : isNull(agentRuns.buyerId);
  const r = (
    await db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(and(eq(agentRuns.paymentStatus, "settled"), visible))
      .orderBy(desc(agentRuns.startedAt))
      .limit(1)
  )[0];
  return r?.id ?? null;
}
