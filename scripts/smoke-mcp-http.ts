/**
 * Smoke-test the HOSTED MCP endpoint (/api/mcp, Streamable HTTP). Issues an agent
 * key, confirms an unauthenticated POST is rejected, then connects a real MCP
 * client with the bearer key, lists the tools, and calls one.
 *   npx tsx --env-file=.env.local scripts/smoke-mcp-http.ts
 */
import postgres from "postgres";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { issueAgentKey } from "../src/server/auth/agent-credential";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const [u] = await sql`select id from users where email='loop-finder@findling.test' limit 1`;
  await sql.end();
  if (!u) throw new Error("loop-finder not found");
  const key = await issueAgentKey(u.id, "smoke-http");

  // 1) unauthenticated POST → expect 401
  const noauth = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  console.log("no-auth POST ->", noauth.status, "(want 401)");

  // 2) authed MCP client over Streamable HTTP
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  });
  const client = new Client({ name: "findling-smoke", version: "0.0.0" });
  await client.connect(transport);
  const tools = await client.listTools();
  console.log("tools:", tools.tools.map((t) => t.name).join(", "));
  const res = await client.callTool({ name: "get_earnings", arguments: {} });
  const text = (res.content as Array<{ type: string; text?: string }>).find(
    (c) => c.type === "text",
  )?.text;
  console.log("get_earnings ->", text?.slice(0, 140));
  await client.close();

  const ok = noauth.status === 401 && tools.tools.length === 6 && !!text;
  console.log(
    ok
      ? "\n✅ hosted MCP works (401 unauth · 6 tools · authed tool call returns data)"
      : "\n❌ FAILED",
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});
