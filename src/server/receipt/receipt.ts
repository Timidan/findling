/**
 * Receipt read-model — a public, shareable proof that a moment was licensed and
 * paid in USDC on Arc, with the 80/12/8 split and rights provenance. Receipts
 * are self-contained snapshots (taken at settlement), so this mostly reads the
 * receipt row + resolves payee handles.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { receipts, purchases, users } from "@/server/db/schema";
import { publicHandle } from "@/server/users/public-handle";

export interface ReceiptView {
  receiptCode: string;
  publicSlug: string;
  momentTitle: string;
  sourceType: string;
  usageType: string;
  licenseSummary: string | null;
  attributionText: string | null;
  ownershipModel: string | null;
  network: string;
  paymentReference: string;
  provider: string;
  payerAddress: string | null;
  grossMicroUsdc: number;
  creatorMicroUsdc: number;
  finderMicroUsdc: number;
  platformMicroUsdc: number;
  creatorHandle: string | null;
  finderHandle: string | null;
  settledAt: string;
}

export async function getReceiptBySlug(slug: string): Promise<ReceiptView | null> {
  const r = (
    await db.select().from(receipts).where(eq(receipts.publicSlug, slug))
  )[0];
  if (!r) return null;

  const purchase = (
    await db.select().from(purchases).where(eq(purchases.id, r.purchaseId))
  )[0];

  const handleCols = {
    username: users.username,
    displayName: users.displayName,
    walletAddress: users.walletAddress,
  };
  const creator = r.creatorId
    ? (await db.select(handleCols).from(users).where(eq(users.id, r.creatorId)))[0]
    : undefined;
  const finder = r.finderId
    ? (await db.select(handleCols).from(users).where(eq(users.id, r.finderId)))[0]
    : undefined;

  return {
    receiptCode: r.receiptCode,
    publicSlug: r.publicSlug,
    momentTitle: r.momentTitle,
    sourceType: r.sourceType,
    usageType: r.usageType,
    licenseSummary: r.licenseSummary,
    attributionText: r.attributionText,
    ownershipModel: r.ownershipModel,
    network: r.network,
    paymentReference: r.paymentReference,
    provider: purchase?.provider ?? "gateway_x402",
    payerAddress: purchase?.payerAddress ?? null,
    grossMicroUsdc: r.grossMicroUsdc,
    creatorMicroUsdc: r.creatorMicroUsdc,
    finderMicroUsdc: r.finderMicroUsdc,
    platformMicroUsdc: r.platformMicroUsdc,
    creatorHandle: creator ? publicHandle(creator, "creator") : null,
    finderHandle: finder ? publicHandle(finder, "finder") : null,
    settledAt: (purchase?.settledAt ?? r.createdAt).toISOString(),
  };
}
