/**
 * Live proof of the Findling MCP surface: spawn the stdio server and drive it
 * with a real MCP client — list tools, search, get_moment, submit_curation,
 * get_earnings. Proves the agent's discovery + finder surface works.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { inArray } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

const FINDER_EMAIL = "mcp-finder@findling.test";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

function parse<T = Record<string, unknown>>(res: unknown): T {
  const text = (res as { content?: Array<{ text?: string }> }).content?.[0]?.text;
  return (text ? JSON.parse(text) : null) as T;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  // a finder identity for the curation tool
  await db.delete(schema.curations).where(
    inArray(
      schema.curations.finderId,
      (await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, [FINDER_EMAIL]))).map((u) => u.id),
    ),
  ).catch(() => {});
  await db.delete(schema.users).where(inArray(schema.users.email, [FINDER_EMAIL]));
  const [finder] = await db
    .insert(schema.users)
    .values({ email: FINDER_EMAIL, displayName: "MCP Finder", roles: ["finder"], payoutWalletAddress: "0xMCPFINDER" })
    .returning();

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "scripts/mcp-server.ts"],
    env: process.env as Record<string, string>,
  });
  const client = new Client({ name: "findling-smoke", version: "0.1.0" });
  await client.connect(transport);
  console.log("connected to findling MCP server\n");

  console.log("[1] list tools:");
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  console.log("  tools:", names.join(", "));
  for (const expected of ["search_moments", "get_moment", "get_agent_run", "submit_curation", "get_earnings", "request_withdraw"]) {
    assert(names.includes(expected), `exposes ${expected}`);
  }

  console.log("\n[2] search_moments:");
  const searchRes = parse<{ agentRunId: string; candidates: Array<{ momentId: string }> }>(
    await client.callTool({ name: "search_moments", arguments: { query: "opening moment", limit: 5 } }),
  );
  assert(typeof searchRes.agentRunId === "string", "returns an agentRunId (trace)");
  assert(Array.isArray(searchRes.candidates) && searchRes.candidates.length >= 1, "returns candidates");
  const momentId = searchRes.candidates[0].momentId;

  console.log("\n[3] get_moment:");
  const moment = parse(await client.callTool({ name: "get_moment", arguments: { momentId } }));
  assert(moment.momentId === momentId, "returns the moment");
  assert(typeof moment.unlockUrl === "string" && moment.unlockUrl.includes("/api/payments/x402/"), "includes x402 unlockUrl");
  console.log("  unlockUrl:", moment.unlockUrl);

  console.log("\n[4] submit_curation (finder/agent supply side):");
  const cur = parse(await client.callTool({ name: "submit_curation", arguments: { momentId, finderId: finder.id, tags: ["mcp", "demo"], relevanceText: "good cold open" } }));
  assert(typeof cur.curationId === "string", "curation created via MCP");

  console.log("\n[5] get_earnings:");
  const earn = parse(await client.callTool({ name: "get_earnings", arguments: { userId: finder.id } }));
  assert(earn.userId === finder.id && "finder" in earn, "returns earnings shape");

  console.log("\n[6] get_agent_run (trace):");
  const run = parse(await client.callTool({ name: "get_agent_run", arguments: { agentRunId: searchRes.agentRunId } }));
  assert(run.id === searchRes.agentRunId, "returns the recorded run trace");

  await client.close();

  // cleanup
  await db.delete(schema.curations).where(inArray(schema.curations.finderId, [finder.id]));
  await db.delete(schema.users).where(inArray(schema.users.id, [finder.id]));
  await sql.end();
  console.log("\nMCP AGENT SURFACE OK ✅  (tools · search · get_moment · curate · earnings · trace)");
}

main().catch((e) => {
  console.error("\nMCP SMOKE FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
