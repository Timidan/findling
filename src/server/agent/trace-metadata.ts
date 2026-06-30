import type { Metadata } from "next";
import type { AgentRunTrace } from "./trace";

/**
 * Per-trace page metadata (title / description / Open Graph). Pure so it is
 * unit-testable and so the page's `generateMetadata` is a thin fetch + call.
 * A missing OR owner-scoped-away (private) trace gets a generic fallback so we
 * never leak a buyer's chosen-moment title in a private run's <title>.
 */
export function traceMetadata(t: AgentRunTrace | null): Metadata {
  if (!t) return { title: "Agent trace — Findling" };
  const subject = t.chosenMomentTitle ?? "Agent trace";
  return {
    title: `${subject} — how the agent decided`,
    description: "An auditable trace of one autonomous license — request to receipt, paid in USDC on Arc.",
    openGraph: {
      title: `${subject} — how an AI agent decided`,
      description: "Watch an agent search, choose, and license a video moment on Findling.",
    },
  };
}
