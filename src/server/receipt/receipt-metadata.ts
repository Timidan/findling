import type { Metadata } from "next";
import type { ReceiptView } from "./receipt";

/**
 * Per-receipt page metadata (title / description / Open Graph). Pure so it is
 * unit-testable and so the page's `generateMetadata` is a thin fetch + call.
 * A missing receipt gets a generic fallback (the page itself 404s).
 */
export function receiptMetadata(r: ReceiptView | null): Metadata {
  if (!r) return { title: "Receipt · Findling" };
  const usage = r.usageType.replace(/_/g, " ");
  return {
    title: `${r.momentTitle}: license receipt`,
    description: `${usage} license, settled in USDC on Arc.`,
    openGraph: {
      title: `${r.momentTitle}: licensed and paid in USDC`,
      description: "A public, shareable proof that an AI agent licensed this video moment on Findling.",
    },
  };
}
