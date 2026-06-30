import { describe, it, expect } from "vitest";
import { traceMetadata } from "./trace-metadata";
import type { AgentRunTrace } from "./trace";

const base: AgentRunTrace = {
  runId: "run-1",
  surface: "mcp",
  requestText: "a calm sunset clip",
  parsedConstraints: null,
  budgetMicroUsdc: 100000,
  candidates: [],
  chosenMomentTitle: "Golden hour over the bay",
  chosenFinderHandle: "alice",
  attributionReason: "earliest_curation",
  paymentStatus: "settled",
  paymentReference: "0xref",
  receiptSlug: "abc",
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:05.000Z",
};

describe("traceMetadata", () => {
  it("titles the page with the chosen moment", () => {
    const m = traceMetadata(base);
    expect(String(m.title)).toContain("Golden hour over the bay");
  });

  it("uses a generic-but-present title when no moment was chosen", () => {
    const m = traceMetadata({ ...base, chosenMomentTitle: null });
    expect(String(m.title)).toContain("Agent trace");
  });

  it("falls back to a generic title when the trace is missing/private", () => {
    const m = traceMetadata(null);
    expect(String(m.title)).toBe("Agent trace — Findling");
    expect(m.openGraph).toBeUndefined();
  });
});
