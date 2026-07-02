/**
 * Findling MCP server over stdio. The consumer's agent (e.g. the demo Claude
 * harness) spawns this and connects. Reads DB/config from the environment.
 *
 *   node --import tsx scripts/mcp-server.ts
 * (env: DATABASE_URL, NEXT_PUBLIC_APP_URL, SUPABASE_*, PAYMENT_PROVIDER, …)
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFindlingMcpServer } from "../src/server/mcp/server";

async function main() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://findling.timidan.xyz";
  const server = createFindlingMcpServer(baseUrl);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP wire protocol
  console.error(`[findling-mcp] connected over stdio (baseUrl=${baseUrl})`);
}

main().catch((e) => {
  console.error("[findling-mcp] fatal:", e);
  process.exit(1);
});
