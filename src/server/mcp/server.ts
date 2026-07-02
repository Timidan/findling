/**
 * Findling MCP server — the agent-facing marketplace surface. Mirrors the REST
 * agent API as MCP tools so the consumer's agent can drive the full loop.
 * TWO-SIDED: buyer tools (discover) + finder tools (curate / earn / withdraw).
 *
 * AUTH: the server authenticates via `FINDLING_AGENT_KEY` (a wallet-proven
 * bearer key from POST /api/agent/auth). Identity comes from that key — never
 * from tool arguments — so an agent can only act as, and earn/withdraw for,
 * itself. Findling holds NO buyer key: discovery returns each moment's
 * `unlockUrl`; the agent pays it with its OWN GatewayClient (x402).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { runAgentSearch, getMomentForAgent, getAgentRun } from "@/server/agent/agent";
import {
  normalizeAgentSearchCommand,
  normalizeSubmitCurationCommand,
  normalizeWithdrawCommand,
} from "@/server/agent/commands";
import { submitCuration } from "@/server/catalog/curation";
import {
  claimUrlForSecret,
  createListing,
  EXTERNAL_IDENTITY_KINDS,
  listListings,
  ListingConflictError,
  ListingValidationError,
} from "@/server/claimable/listings";
import {
  listPledges,
  pledgeIntent,
  PLEDGE_USAGE_TYPES,
  PledgeValidationError,
} from "@/server/claimable/pledges";
import { getEarnings } from "@/server/ledger/earnings";
import { requestWithdrawal, NothingToWithdrawError } from "@/server/ledger/withdrawal";
import { getPayoutProvider } from "@/server/payment";
import { rateLimit } from "@/server/ratelimit/rate-limit";
import { verifyAgentKey, type AgentAuth } from "@/server/auth/agent-credential";

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function unknownToolError(tool: string, e: unknown) {
  console.error(`[mcp] ${tool} failed:`, e);
  return { error: "internal_error" };
}

function hasRole(agent: AgentAuth, role: string): boolean {
  return agent.roles.includes(role);
}

const UNAUTH = {
  error: "unauthenticated",
  hint: "Set FINDLING_AGENT_KEY to a key from POST /api/agent/auth (see /skill.md).",
};

export function createFindlingMcpServer(
  baseUrl: string,
  resolveAgent: () => Promise<AgentAuth | null> = () =>
    verifyAgentKey(process.env.FINDLING_AGENT_KEY),
): McpServer {
  const server = new McpServer({ name: "findling", version: "0.1.0" });

  // Resolve the acting agent on EVERY call (honours revocation). The stdio entry
  // uses the default env-key resolver; the hosted /api/mcp endpoint passes the
  // agent it already verified from that request's Authorization header.
  const agentAuth = resolveAgent;

  // ---------------- buyer side: discovery ----------------
  server.registerTool(
    "search_moments",
    {
      description:
        "Search Findling's catalog of licensable short video moments by natural-language intent. Returns ranked eligible candidates and an agentRunId that traces the decision. To license a moment, pay its unlockUrl with your own wallet.",
      inputSchema: {
        query: z
          .string()
          .trim()
          .min(1)
          .max(1000)
          .describe("what the moment should depict / be useful for"),
        maxPriceMicroUsdc: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("per-moment budget cap, integer micro-USDC (1 USDC = 1_000_000)"),
        usageType: z
          .enum(["video_embed", "newsletter", "social_post", "internal_reference"])
          .optional(),
        limit: z.number().int().positive().max(25).optional(),
        grantId: z.string().uuid().optional().describe("your active session-grant id"),
      },
    },
    async (args) => {
      const agent = await agentAuth();
      if (!agent) return result(UNAUTH);
      const command = normalizeAgentSearchCommand({
        query: args.query,
        grantId: args.grantId ?? null,
        maxPriceMicroUsdc: args.maxPriceMicroUsdc,
        usageType: args.usageType,
        limit: args.limit,
      });
      if (!command.ok) return result({ error: command.error });
      const r = await runAgentSearch({
        requestText: command.value.query,
        surface: "mcp",
        buyerId: agent.userId,
        sessionGrantId: command.value.grantId,
        maxPriceMicroUsdc: command.value.maxPriceMicroUsdc,
        usageType: command.value.usageType,
        limit: command.value.limit,
      });
      return result(r);
    },
  );

  server.registerTool(
    "get_moment",
    {
      description:
        "Get agent-readable detail for a moment: price, duration, usage, license, source, and the x402 `unlockUrl`. Pass your grantId (and agentRunId from search) so the returned unlockUrl is directly payable with GatewayClient.pay().",
      inputSchema: {
        momentId: z.string().uuid(),
        grantId: z.string().uuid().optional().describe("your active session-grant id (required to pay)"),
        agentRunId: z.string().uuid().optional().describe("the run from search_moments (enables finder attribution)"),
      },
    },
    async (args) => {
      const agent = await agentAuth();
      if (!agent) return result(UNAUTH);
      const m = await getMomentForAgent(args.momentId, baseUrl, {
        grantId: args.grantId,
        agentRunId: args.agentRunId,
      });
      return result(m ?? { error: "moment_not_available" });
    },
  );

  server.registerTool(
    "get_agent_run",
    {
      description:
        "Fetch the trace for one of YOUR agent runs: parsed request, candidates, scores, chosen moment, payment status, receipt.",
      inputSchema: { agentRunId: z.string().uuid() },
    },
    async (args) => {
      const agent = await agentAuth();
      if (!agent) return result(UNAUTH);
      const run = await getAgentRun(args.agentRunId);
      if (!run || run.buyerId !== agent.userId) {
        return result({ error: "run_not_found" });
      }
      return result(run);
    },
  );

  server.registerTool(
    "list_listings",
    {
      description:
        "Read Findling's claimable demand feed: wanted video moments that are not payable until the real creator claims and uploads. Buyer and finder agents may read this feed.",
      inputSchema: {},
    },
    async () => {
      const agent = await agentAuth();
      if (!agent) return result(UNAUTH);
      return result(await listListings({ audience: "agent" }));
    },
  );

  server.registerTool(
    "pledge_interest",
    {
      description:
        "Pledge buyer interest in a claimable listing using one of YOUR active session grants. This records demand only; no USDC moves and the listing is not directly payable.",
      inputSchema: {
        listingId: z.string().uuid(),
        sessionGrantId: z.string().uuid(),
        budgetMicroUsdc: z
          .number()
          .int()
          .positive()
          .describe("integer micro-USDC budget snapshot (1 USDC = 1_000_000)"),
        usageType: z.enum(PLEDGE_USAGE_TYPES).optional(),
      },
    },
    async (args) => {
      const agent = await agentAuth();
      if (!agent) return result(UNAUTH);
      if (!hasRole(agent, "buyer")) return result({ error: "buyer_agent_required" });
      try {
        const intent = await pledgeIntent({
          buyerId: agent.userId,
          listingId: args.listingId,
          sessionGrantId: args.sessionGrantId,
          budgetMicroUsdc: args.budgetMicroUsdc,
          usageType: args.usageType,
        });
        return result({ intent });
      } catch (e) {
        if (e instanceof PledgeValidationError) {
          return result({ error: "invalid_pledge", reason: e.reason });
        }
        return result(unknownToolError("pledge_interest", e));
      }
    },
  );

  server.registerTool(
    "list_pledges",
    {
      description:
        "List YOUR claimable listing pledges. Before activation, unlockUrl is null; after activation/notification it points at the payable x402 unlock route. Settled pledges return null.",
      inputSchema: {},
    },
    async () => {
      const agent = await agentAuth();
      if (!agent) return result(UNAUTH);
      if (!hasRole(agent, "buyer")) return result({ error: "buyer_agent_required" });
      return result(await listPledges(agent.userId, { baseUrl }));
    },
  );

  // ---------------- finder side: supply / earnings ----------------
  server.registerTool(
    "create_listing",
    {
      description:
        "Create a claimable wanted listing as a FINDER. Returns the listing plus a one-time claim URL for the real creator. This does not create a payable moment and moves no money.",
      inputSchema: {
        externalIdentity: z.string().trim().min(1).max(240),
        externalIdentityKind: z.enum(EXTERNAL_IDENTITY_KINDS),
        externalRef: z.string().trim().max(1000).optional(),
        title: z.string().trim().min(1).max(240),
        description: z.string().trim().max(2000).optional(),
        relevanceText: z.string().trim().max(2000).optional(),
        expiresAt: z.string().datetime().optional(),
      },
    },
    async (args) => {
      const agent = await agentAuth();
      if (!agent) return result(UNAUTH);
      if (!hasRole(agent, "finder")) return result({ error: "finder_agent_required" });
      try {
        const created = await createListing(agent.userId, args);
        return result({
          listing: created.listing,
          claimUrl: claimUrlForSecret(baseUrl, created.claimSecret),
        });
      } catch (e) {
        if (e instanceof ListingValidationError) {
          return result({ error: "invalid_listing", reason: e.reason });
        }
        if (e instanceof ListingConflictError) {
          return result({ error: "listing_conflict", reason: e.reason });
        }
        return result(unknownToolError("create_listing", e));
      }
    },
  );

  server.registerTool(
    "submit_curation",
    {
      description:
        "Curate a moment as a FINDER (tags, caption, use-case note, relevance). If your curation is the attributed one when a buyer licenses the moment, you earn the 12% finder split. Earnings accrue to YOUR authenticated identity.",
      inputSchema: {
        momentId: z.string().uuid(),
        tags: z.array(z.string().max(40)).max(20).optional(),
        caption: z.string().max(280).optional(),
        useCaseNote: z.string().max(500).optional(),
        relevanceText: z.string().max(500).optional(),
      },
    },
    async (args) => {
      const agent = await agentAuth();
      if (!agent) return result(UNAUTH);
      const command = normalizeSubmitCurationCommand(args);
      if (!command.ok) return result({ error: command.error });
      try {
        const c = await submitCuration({
          momentId: command.value.momentId,
          finderId: agent.userId,
          tags: command.value.tags,
          caption: command.value.caption,
          useCaseNote: command.value.useCaseNote,
          relevanceText: command.value.relevanceText,
        });
        return result({ curationId: c.id, shareSlug: c.shareSlug, momentId: c.momentId });
      } catch (e) {
        return result(unknownToolError("submit_curation", e));
      }
    },
  );

  server.registerTool(
    "get_earnings",
    {
      description:
        "Get YOUR accrued / withdrawn / withdrawable balance as creator and as finder (integer micro-USDC).",
      inputSchema: {},
    },
    async () => {
      const agent = await agentAuth();
      if (!agent) return result(UNAUTH);
      return result(await getEarnings(agent.userId));
    },
  );

  server.registerTool(
    "request_withdraw",
    {
      description:
        "Withdraw YOUR accrued earnings on-chain to your registered payout wallet. Works for an agent finder pulling its own 12% earnings.",
      inputSchema: {
        role: z.enum(["creator", "finder"]),
        maxFee: z.string().optional().describe("max payout fee, decimal USDC string"),
      },
    },
    async (args) => {
      const agent = await agentAuth();
      if (!agent) return result(UNAUTH);
      // Per-identity throttle on the money mutation. The hosted /api/mcp endpoint
      // only rate-limits by IP at the transport; bound withdraws per agent too.
      const withdrawLimit = await rateLimit("withdraw", agent.userId);
      if (!withdrawLimit.allowed) {
        return result({
          error: "rate_limited",
          retryAfterSeconds: withdrawLimit.retryAfterSec,
        });
      }
      const command = normalizeWithdrawCommand(args);
      if (!command.ok) return result({ error: command.error });
      const user = (await db.select().from(users).where(eq(users.id, agent.userId)))[0];
      if (!user) return result({ error: "user_not_found" });
      if (!user.payoutWalletAddress) return result({ error: "no_payout_wallet_registered" });
      try {
        const w = await requestWithdrawal(
          {
            userId: user.id,
            role: command.value.role,
            recipientAddress: user.payoutWalletAddress,
            maxFee: command.value.maxFee,
          },
          getPayoutProvider(),
        );
        return result({
          withdrawalId: w.id,
          status: w.status,
          amountMicroUsdc: w.amountMicroUsdc,
          transactionHash: w.transactionHash,
          recipient: w.recipientWalletAddress,
          failureReason: w.failureReason,
        });
      } catch (e) {
        if (e instanceof NothingToWithdrawError) return result({ error: "nothing_to_withdraw" });
        return result(unknownToolError("request_withdraw", e));
      }
    },
  );

  return server;
}
