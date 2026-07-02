/**
 * Hosted Findling MCP endpoint (Streamable HTTP, stateless).
 *
 * An MCP client connects REMOTELY with its agent bearer key — no local install,
 * no backend secrets. Every request is authenticated from the Authorization
 * header and the MCP server is bound to THAT agent, exposing the same tool set as
 * the stdio server (search / get / curate / earnings / withdraw / trace).
 *
 * Client config:
 *   { "url": "https://<host>/api/mcp",
 *     "headers": { "Authorization": "Bearer fdl_agent_..." } }
 *
 * Issue a key at /studio/agents (human session) or POST /api/agent/auth (headless).
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createFindlingMcpServer } from "@/server/mcp/server";
import { verifyAgentKey, bearerFrom } from "@/server/auth/agent-credential";
import { enforceRateLimit, clientIp } from "@/server/ratelimit/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32001,
        message:
          "Unauthorized. Send `Authorization: Bearer <fdl_agent_...>` after you issue a key at /studio/agents or POST /api/agent/auth.",
      },
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" },
    },
  );
}

async function handle(req: Request): Promise<Response> {
  const limited = await enforceRateLimit("mcp", clientIp(req));
  if (limited) return limited;
  // Authenticate the agent from the bearer key BEFORE creating the server, so an
  // unauthenticated request never touches a tool. verifyAgentKey honours
  // revocation + expiry.
  const agent = await verifyAgentKey(bearerFrom(req.headers.get("authorization")));
  if (!agent) return unauthorized();

  // A fresh server + stateless transport per request, bound to THIS agent — so the
  // hosted endpoint is multi-tenant without any shared session state.
  const origin = new URL(req.url).origin;
  const server = createFindlingMcpServer(origin, async () => agent);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: each request is independent + self-authed
    enableJsonResponse: true, // plain JSON responses — these tools are request/response, no SSE
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
