/**
 * Findling demo agent — the consumer's OWN agent, driving the full loop from
 * OUTSIDE the product, exactly as any external agent (or a Claude subagent)
 * would: discover via Findling's MCP server, reason over candidates, then pay
 * the x402 unlock route with its OWN funded session key. Findling holds no key.
 *
 *   discover (MCP search_moments) → reason (pick best in budget) →
 *   get_moment (grant-aware unlockUrl) → PAY (GatewayClient.pay) → receipt + trace
 *
 * Needs: the Next dev server up (x402 route), the AGENT wallet funded, env loaded.
 *   set -a; source .env.local; set +a; npx tsx scripts/demo-agent/run.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import * as schema from "../../src/server/db/schema";

const BUYER_EMAIL = "demo-agent@findling.test";
const BUDGET_MICRO = 100_000; // the agent will spend up to $0.10 per moment

function log(line = "") {
  console.log(line);
}
function step(n: number, title: string) {
  log(`\n\x1b[1m[${n}] ${title}\x1b[0m`);
}
function parse<T = Record<string, unknown>>(res: unknown): T {
  const text = (res as { content?: Array<{ text?: string }> }).content?.[0]?.text;
  return (text ? JSON.parse(text) : null) as T;
}

async function main() {
  const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  const AGENT_ADDR = process.env.AGENT_ADDRESS!;
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://findling.timidan.xyz";
  if (!AGENT_KEY) throw new Error("AGENT_PRIVATE_KEY not set");

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  log("\x1b[2m── Findling demo agent ─────────────────────────────────\x1b[0m");
  log("A consumer's agent, holding its own funded Arc wallet, licensing a moment autonomously.");

  // one-time: this agent's Findling identity + funded session grant
  let buyer = (await db.select().from(schema.users).where(eq(schema.users.email, BUYER_EMAIL)))[0];
  if (!buyer) {
    [buyer] = await db
      .insert(schema.users)
      .values({ email: BUYER_EMAIL, displayName: "Demo Consumer Agent", roles: ["buyer"], walletAddress: AGENT_ADDR })
      .returning();
  }
  let grant = (
    await db
      .select()
      .from(schema.buyerSessionGrants)
      .where(and(eq(schema.buyerSessionGrants.buyerId, buyer.id), eq(schema.buyerSessionGrants.status, "active")))
  )[0];
  if (!grant) {
    [grant] = await db
      .insert(schema.buyerSessionGrants)
      .values({
        buyerId: buyer.id,
        walletAddress: AGENT_ADDR,
        sessionKeyAddress: AGENT_ADDR,
        totalCapMicroUsdc: 1_000_000,
        remainingCapMicroUsdc: 1_000_000,
        perPurchaseCapMicroUsdc: BUDGET_MICRO,
        status: "active",
      })
      .returning();
  }
  log(`\x1b[2msession grant ${grant.id.slice(0, 8)} · cap ${(grant.remainingCapMicroUsdc / 1e6).toFixed(2)} USDC · key ${AGENT_ADDR.slice(0, 8)}…\x1b[0m`);

  // connect to Findling's MCP marketplace
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "scripts/mcp-server.ts"],
    env: process.env as Record<string, string>,
  });
  const mcp = new Client({ name: "demo-consumer-agent", version: "0.1.0" });
  await mcp.connect(transport);

  const intent = "a calm opening shot under $0.10 for a weeknight video edit";

  step(1, "DISCOVER — search Findling over MCP");
  log(`   intent: "${intent}"`);
  const search = parse<{ agentRunId: string; candidates: Array<{ momentId: string; title: string; score: number; priceMicroUsdc: number }> }>(
    await mcp.callTool({
      name: "search_moments",
      arguments: { query: intent, maxPriceMicroUsdc: BUDGET_MICRO, buyerId: buyer.id, grantId: grant.id, limit: 5 },
    }),
  );
  log(`   → ${search.candidates.length} eligible candidate(s); agentRun ${search.agentRunId.slice(0, 8)}`);
  for (const c of search.candidates) {
    log(`     · ${c.title}  \x1b[2m(score ${c.score.toFixed(3)}, $${(c.priceMicroUsdc / 1e6).toFixed(3)})\x1b[0m`);
  }
  if (search.candidates.length === 0) throw new Error("no eligible moments — publish one first");

  step(2, "REASON — pick the best match within budget");
  const choice = search.candidates[0];
  log(`   chose: "${choice.title}"  \x1b[2m($${(choice.priceMicroUsdc / 1e6).toFixed(3)} ≤ $${(BUDGET_MICRO / 1e6).toFixed(2)} budget)\x1b[0m`);

  step(3, "RESOLVE — get the payable unlock endpoint");
  const moment = parse<{ unlockUrl: string; priceUsd: string }>(
    await mcp.callTool({ name: "get_moment", arguments: { momentId: choice.momentId, grantId: grant.id, agentRunId: search.agentRunId } }),
  );
  log(`   unlockUrl: \x1b[2m${moment.unlockUrl}\x1b[0m`);

  step(4, "PAY — agent settles the x402 nanopayment with its OWN key");
  const gw = new GatewayClient({ chain: "arcTestnet", privateKey: AGENT_KEY });
  const bal = await gw.getBalances();
  if (Number(bal.gateway.available) < choice.priceMicroUsdc) {
    log(`   depositing 0.5 USDC into Gateway…`);
    await gw.deposit("0.5");
  }
  const pay = await gw.pay<{
    receiptCode: string;
    paymentReference: string;
    split: { creatorMicroUsdc: number; finderMicroUsdc: number; platformMicroUsdc: number };
  }>(moment.unlockUrl);
  const d = pay.data;
  log(`   \x1b[32m✓ PAID ${pay.amount} USDC on Arc\x1b[0m  ref ${d.paymentReference.slice(0, 12)}…`);
  log(`     split → creator $${(d.split.creatorMicroUsdc / 1e6).toFixed(3)} · finder $${(d.split.finderMicroUsdc / 1e6).toFixed(3)} · platform $${(d.split.platformMicroUsdc / 1e6).toFixed(3)}`);

  step(5, "DONE — human-viewable proof");
  // resolve the receipt slug for the link
  const purchase = (await db.select().from(schema.purchases).where(eq(schema.purchases.paymentReference, d.paymentReference)))[0];
  const receipt = purchase ? (await db.select().from(schema.receipts).where(eq(schema.receipts.purchaseId, purchase.id)))[0] : undefined;
  log(`   receipt:  ${BASE}/r/${receipt?.publicSlug ?? "?"}`);
  log(`   trace:    ${BASE}/trace/${search.agentRunId}`);
  log(`   studio:   ${BASE}/studio`);

  await mcp.close();
  await sql.end();
  log(`\n\x1b[1m\x1b[32mDEMO COMPLETE ✅  an AI agent discovered, licensed, and paid for a moment — no human in the loop.\x1b[0m`);
}

main().catch((e) => {
  console.error("\n\x1b[31mDEMO FAILED ❌\x1b[0m", e instanceof Error ? e.message : e);
  process.exit(1);
});
