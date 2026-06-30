/**
 * Agent interface service — exposes Findling's marketplace to EXTERNAL consumer
 * agents (Findling never builds the agent). Owns the agent_runs trace that makes
 * the agentic decision auditable: request → candidates → scores →
 * chosen moment → attribution → payment → receipt.
 *
 * Discovery only. Payment happens agent-side via the buyer's GatewayClient
 * against the x402 unlock route — Findling holds no buyer key.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { agentRuns, buyerSessionGrants } from "@/server/db/schema";
import { findLicensableMoment } from "@/server/catalog/licensable";
import { searchMoments, type SearchHit } from "@/server/search/embeddings";

export type AgentSurface = "mcp" | "rest" | "demo_harness" | "feed" | "overlay";

export interface AgentSearchInput {
  requestText: string;
  surface: AgentSurface;
  buyerId?: string | null;
  sessionGrantId?: string | null;
  maxPriceMicroUsdc?: number;
  usageType?: string;
  limit?: number;
}

export interface AgentSearchResult {
  agentRunId: string;
  candidates: SearchHit[];
  parsedConstraints: {
    maxPriceMicroUsdc?: number;
    usageType?: string;
    limit: number;
  };
}

export async function runAgentSearch(
  input: AgentSearchInput,
): Promise<AgentSearchResult> {
  const limit = input.limit ?? 8;
  const parsedConstraints = {
    maxPriceMicroUsdc: input.maxPriceMicroUsdc,
    usageType: input.usageType,
    limit,
  };

  const candidates = await searchMoments(input.requestText, {
    limit,
    maxPriceMicroUsdc: input.maxPriceMicroUsdc,
    usageType: input.usageType,
  });

  // Never bind a run to a session grant the buyer doesn't own (a stolen grantId
  // must not let an attacker attach their run to a victim's grant).
  let sessionGrantId = input.sessionGrantId ?? null;
  if (sessionGrantId) {
    const grant = (
      await db
        .select({ buyerId: buyerSessionGrants.buyerId })
        .from(buyerSessionGrants)
        .where(eq(buyerSessionGrants.id, sessionGrantId))
    )[0];
    if (!grant || !input.buyerId || grant.buyerId !== input.buyerId) {
      sessionGrantId = null;
    }
  }

  const [run] = await db
    .insert(agentRuns)
    .values({
      buyerId: input.buyerId ?? null,
      sessionGrantId,
      surface: input.surface,
      requestText: input.requestText,
      parsedConstraints,
      candidateMomentIds: candidates.map((c) => c.momentId),
      candidateScores: candidates.map((c) => ({ momentId: c.momentId, score: c.score })),
      budgetMicroUsdc: input.maxPriceMicroUsdc ?? null,
      paymentStatus: "not_attempted",
    })
    .returning();

  return { agentRunId: run.id, candidates, parsedConstraints };
}

export interface AgentMomentDetail {
  momentId: string;
  title: string;
  description: string | null;
  durationMs: number;
  priceMicroUsdc: number;
  priceUsd: string;
  usageType: string;
  licenseSummary: string | null;
  sourceType: string;
  /** Where the agent's GatewayClient pays to unlock this moment. */
  unlockUrl: string;
}

export interface MomentForAgentOptions {
  /** Bind the unlock URL to the agent's grant (REQUIRED to actually pay). */
  grantId?: string | null;
  /** Tie the unlock to a discovery run (enables finder attribution). */
  agentRunId?: string | null;
}

export async function getMomentForAgent(
  momentId: string,
  baseUrl: string,
  opts: MomentForAgentOptions = {},
): Promise<AgentMomentDetail | null> {
  const licensable = await findLicensableMoment(momentId);
  if (!licensable) return null;
  const { moment, asset } = licensable;

  // the unlock route REQUIRES grantId; include it (+ run) so the URL is payable
  const unlock = new URL(`${baseUrl}/api/payments/x402/moments/${moment.id}/unlock`);
  if (opts.grantId) unlock.searchParams.set("grantId", opts.grantId);
  if (opts.agentRunId) unlock.searchParams.set("agentRunId", opts.agentRunId);
  return {
    momentId: moment.id,
    title: moment.title,
    description: moment.description,
    durationMs: moment.durationMs,
    priceMicroUsdc: moment.priceMicroUsdc,
    priceUsd: moment.priceUsdSnapshot,
    usageType: moment.usageType,
    licenseSummary: moment.licenseSummary,
    sourceType: asset?.sourceType ?? "upload",
    unlockUrl: unlock.toString(),
  };
}

export async function getAgentRun(agentRunId: string) {
  return (
    await db.select().from(agentRuns).where(eq(agentRuns.id, agentRunId))
  )[0];
}
