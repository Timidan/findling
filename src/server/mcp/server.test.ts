import { beforeEach, describe, expect, it, vi } from "vitest";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: "text"; text: string }>;
}>;

const mocks = vi.hoisted(() => ({
  tools: new Map<string, ToolHandler>(),
  submitCuration: vi.fn(),
  normalizeSubmitCurationCommand: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class McpServer {
    registerTool(name: string, _config: unknown, cb: ToolHandler) {
      mocks.tools.set(name, cb);
      return {};
    }
  },
}));

vi.mock("@/server/db/client", () => ({
  db: {
    select: vi.fn(),
  },
}));
vi.mock("@/server/db/schema", () => ({ users: { id: "users.id" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("@/server/agent/agent", () => ({
  runAgentSearch: vi.fn(),
  getMomentForAgent: vi.fn(),
  getAgentRun: vi.fn(),
}));
vi.mock("@/server/agent/commands", () => ({
  normalizeAgentSearchCommand: vi.fn(() => ({ ok: false, error: "not_used" })),
  normalizeSubmitCurationCommand: mocks.normalizeSubmitCurationCommand,
  normalizeWithdrawCommand: vi.fn(() => ({ ok: false, error: "not_used" })),
}));
vi.mock("@/server/catalog/curation", () => ({
  submitCuration: mocks.submitCuration,
}));
vi.mock("@/server/claimable/listings", () => ({
  claimUrlForSecret: vi.fn(),
  createListing: vi.fn(),
  EXTERNAL_IDENTITY_KINDS: ["peertube_channel", "url"],
  listListings: vi.fn(),
  ListingConflictError: class ListingConflictError extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  },
  ListingValidationError: class ListingValidationError extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  },
}));
vi.mock("@/server/claimable/pledges", () => ({
  listPledges: vi.fn(),
  pledgeIntent: vi.fn(),
  PLEDGE_USAGE_TYPES: ["video_embed"],
  PledgeValidationError: class PledgeValidationError extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  },
}));
vi.mock("@/server/ledger/earnings", () => ({ getEarnings: vi.fn() }));
vi.mock("@/server/ledger/withdrawal", () => ({
  requestWithdrawal: vi.fn(),
  NothingToWithdrawError: class NothingToWithdrawError extends Error {},
}));
vi.mock("@/server/payment", () => ({ getPayoutProvider: vi.fn() }));
vi.mock("@/server/auth/agent-credential", () => ({
  verifyAgentKey: vi.fn(),
}));

import { createFindlingMcpServer } from "./server";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const MOMENT_ID = "99999999-9999-4999-8999-999999999999";

function parseToolResult(result: Awaited<ReturnType<ToolHandler>>) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("createFindlingMcpServer safe errors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.tools.clear();
    mocks.normalizeSubmitCurationCommand.mockReturnValue({
      ok: true,
      value: {
        momentId: MOMENT_ID,
        tags: [],
        caption: undefined,
        useCaseNote: undefined,
        relevanceText: undefined,
      },
    });
  });

  it("logs unknown tool exceptions server-side and returns a generic MCP error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.submitCuration.mockRejectedValue(
      new Error("postgres://user:secret@db.internal duplicate key details"),
    );
    createFindlingMcpServer("https://findling.example", async () => ({
      address: "0x1111111111111111111111111111111111111111",
      credentialId: "credential-1",
      userId: USER_ID,
      roles: ["finder"],
    }));

    const handler = mocks.tools.get("submit_curation");
    expect(handler).toBeDefined();

    const result = await handler!({ momentId: MOMENT_ID });
    const payload = parseToolResult(result);

    expect(payload).toEqual({ error: "internal_error" });
    expect(JSON.stringify(payload)).not.toContain("postgres");
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
