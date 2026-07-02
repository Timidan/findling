/**
 * End-to-end claim-to-activate live demo:
 * listing -> pledge -> claim -> upload -> activate -> x402 buy -> reconcile -> withdraw.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/demo-claim-to-activate.ts
 *
 * This script intentionally uses the real Arc testnet Gateway/x402 path and the
 * real withdrawal API. It cannot be proven in a networkless sandbox.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import * as schema from "../src/server/db/schema";
import {
  claimUrlForSecret,
  createListing,
} from "../src/server/claimable/listings";
import {
  getPledgedDemand,
  listPledges,
  pledgeIntent,
} from "../src/server/claimable/pledges";
import { claimListing } from "../src/server/claimable/claim";
import { PEERTUBE_ATTESTATION_VERSION } from "../src/server/ownership/attestation";
import { computeSplit } from "../src/server/split/split";

const CREATOR_EMAIL = "dev-creator@findling.local";
const BUYER_EMAIL = "loop-buyer@findling.test";
const SEED_FINDER_EMAIL = "peertube-seed@findling.local";
const DEFAULT_SRC = "public/demo/snowboard.mp4";
const DEFAULT_BASE = "https://findling.timidan.xyz";
const DEFAULT_PLEDGE_MICRO_USDC = 120_000;
const MICRO_USDC_PER_USDC = BigInt(1_000_000);
const FONTS = [
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];

type Role = (typeof schema.roleEnum.enumValues)[number];
type UserRow = typeof schema.users.$inferSelect;
type PurchaseRow = typeof schema.purchases.$inferSelect;
type ReceiptRow = typeof schema.receipts.$inferSelect;

function connectDb() {
  const sql = postgres(requireEnv("DATABASE_URL"), { prepare: false });
  return { sql, db: drizzle(sql, { schema }) };
}

type DemoDb = ReturnType<typeof connectDb>["db"];

export function formatMicroUsdc(amountMicroUsdc: number): string {
  if (!Number.isInteger(amountMicroUsdc) || amountMicroUsdc < 0) {
    throw new Error(`invalid micro-USDC amount: ${amountMicroUsdc}`);
  }
  const micro = BigInt(amountMicroUsdc);
  const whole = micro / MICRO_USDC_PER_USDC;
  const fraction = micro % MICRO_USDC_PER_USDC;
  if (fraction === BigInt(0)) return whole.toString();
  const trimmed = fraction.toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}.${trimmed}`;
}

function usdc(amountMicroUsdc: number): string {
  return `${formatMicroUsdc(amountMicroUsdc)} USDC`;
}

export function extractUnlockParams(unlockUrl: string): {
  grantId: string;
  agentRunId: string;
} {
  const url = new URL(unlockUrl);
  const grantId = url.searchParams.get("grantId");
  const agentRunId = url.searchParams.get("agentRunId");
  if (!grantId || !agentRunId) {
    throw new Error("unlock URL missing grantId or agentRunId");
  }
  return { grantId, agentRunId };
}

export function assertSeedFinderSplit(input: {
  grossMicroUsdc: number;
  creatorMicroUsdc: number;
  finderMicroUsdc: number;
  platformMicroUsdc: number;
  finderId: string | null;
  expectedFinderId: string;
}): void {
  if (input.finderId !== input.expectedFinderId || input.finderMicroUsdc <= 0) {
    throw new Error(
      `seed finder was not paid: finderId=${input.finderId ?? "null"} ` +
        `finderMicroUsdc=${input.finderMicroUsdc}`,
    );
  }

  const expected = computeSplit({
    grossMicroUsdc: input.grossMicroUsdc,
    hasFinder: true,
  });
  if (
    input.creatorMicroUsdc !== expected.creatorMicroUsdc ||
    input.finderMicroUsdc !== expected.finderMicroUsdc ||
    input.platformMicroUsdc !== expected.platformMicroUsdc
  ) {
    throw new Error(
      `unexpected split for gross ${input.grossMicroUsdc}: ` +
        JSON.stringify({
          creatorMicroUsdc: input.creatorMicroUsdc,
          finderMicroUsdc: input.finderMicroUsdc,
          platformMicroUsdc: input.platformMicroUsdc,
          expected,
        }),
    );
  }
}

function step(n: number, title: string): void {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`${n}. ${title}`);
  console.log("=".repeat(72));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalMicroEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer micro-USDC amount`);
  }
  return parsed;
}

function requireAddress(name: string): string {
  const value = requireEnv(name);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed EVM address`);
  }
  return value;
}

function requirePrivateKey(name: string): `0x${string}` {
  const value = requireEnv(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed 32-byte private key`);
  }
  return value as `0x${string}`;
}

function mergedRoles(existing: readonly Role[], required: readonly Role[]): Role[] {
  return [...new Set([...existing, ...required])];
}

async function ensureUser(
  db: DemoDb,
  input: {
    email: string;
    displayName: string;
    roles: Role[];
    payoutWalletAddress?: string | null;
  },
): Promise<UserRow> {
  const existing = (
    await db.select().from(schema.users).where(eq(schema.users.email, input.email)).limit(1)
  )[0];
  if (!existing) {
    const [created] = await db
      .insert(schema.users)
      .values({
        email: input.email,
        displayName: input.displayName,
        roles: input.roles,
        payoutWalletAddress: input.payoutWalletAddress ?? null,
      })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(schema.users)
    .set({
      displayName: existing.displayName ?? input.displayName,
      roles: mergedRoles(existing.roles, input.roles),
      payoutWalletAddress:
        input.payoutWalletAddress ?? existing.payoutWalletAddress,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, existing.id))
    .returning();
  return updated;
}

async function ensureBuyerGrant(input: {
  db: DemoDb;
  buyer: UserRow;
  agentAddress: string;
  capMicroUsdc: number;
}) {
  await input.db
    .update(schema.buyerSessionGrants)
    .set({ status: "exhausted", updatedAt: new Date() })
    .where(eq(schema.buyerSessionGrants.buyerId, input.buyer.id));

  const [grant] = await input.db
    .insert(schema.buyerSessionGrants)
    .values({
      buyerId: input.buyer.id,
      walletAddress: input.agentAddress,
      sessionKeyAddress: input.agentAddress,
      chain: "arcTestnet",
      totalCapMicroUsdc: input.capMicroUsdc,
      remainingCapMicroUsdc: input.capMicroUsdc,
      perPurchaseCapMicroUsdc: input.capMicroUsdc,
      allowedUsageTypes: ["video_embed"],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      status: "active",
      providerMetadata: {
        demo: "claim-to-activate",
        fundedBy: "GatewayClient",
      },
    })
    .returning();
  return grant;
}

async function ensureGatewayBalance(input: {
  gateway: GatewayClient;
  requiredMicroUsdc: number;
  agentAddress: string;
}): Promise<void> {
  const before = await input.gateway.getBalances();
  console.log(`buyer Gateway available: ${before.gateway.formattedAvailable} USDC`);
  if (Number(before.gateway.available) >= input.requiredMicroUsdc) return;

  console.log("buyer Gateway balance is below the planned purchase.");
  console.log("attempting Gateway deposit of 0.5 USDC, matching buy-moment.ts...");
  try {
    await input.gateway.deposit("0.5");
  } catch (e) {
    throw new Error(
      [
        `buyer Gateway needs at least ${usdc(input.requiredMicroUsdc)} available.`,
        `Automatic deposit failed: ${e instanceof Error ? e.message : String(e)}`,
        `Fund AGENT_ADDRESS=${input.agentAddress} on Arc testnet, then re-run this script.`,
      ].join("\n"),
    );
  }

  const after = await input.gateway.getBalances();
  console.log(`buyer Gateway available after deposit: ${after.gateway.formattedAvailable} USDC`);
  if (Number(after.gateway.available) < input.requiredMicroUsdc) {
    throw new Error(
      `buyer Gateway still has ${after.gateway.formattedAvailable} USDC; ` +
        `needs ${usdc(input.requiredMicroUsdc)}. Fund ${input.agentAddress} and re-run.`,
    );
  }
}

async function createFreshClaimableListing(seedFinderId: string, baseUrl: string) {
  const refId = randomUUID();
  const result = await createListing(seedFinderId, {
    externalIdentity: "@powderline@peertube.demo",
    externalIdentityKind: "peertube_channel",
    externalRef: `https://peertube.demo.example/w/powderline-${refId}`,
    title: `Wanted: PeerTube snowboard spray ${refId.slice(0, 8)}`,
    description:
      "Demo wanted listing for a PeerTube creator claim-to-activate loop.",
    relevanceText:
      "PeerTube snowboard backcountry powder spray winter sports moment",
    sourceLicenceLabel: "CC BY",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return {
    ...result,
    claimUrl: claimUrlForSecret(baseUrl, result.claimSecret),
  };
}

function renderDemoMedia(input: {
  src: string;
  startSeconds: number;
  durationSeconds: number;
}) {
  if (!existsSync(input.src)) {
    throw new Error(`source video not found: ${input.src}`);
  }

  const id = randomUUID();
  const clip = `/tmp/demo-claim-${id}.mp4`;
  const poster = `/tmp/demo-claim-${id}.jpg`;
  const preview = `/tmp/demo-claim-preview-${id}.mp4`;
  const font = FONTS.find(existsSync) ?? null;

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-ss",
      String(input.startSeconds),
      "-i",
      input.src,
      "-t",
      String(input.durationSeconds),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-an",
      "-movflags",
      "+faststart",
      clip,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-ss",
      "2",
      "-i",
      clip,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      poster,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );

  const vf = font
    ? `scale=-2:480,drawtext=fontfile=${font}:text='findling preview':fontcolor=white@0.6:fontsize=20:x=(w-text_w)/2:y=h-36:box=1:boxcolor=black@0.35:boxborderw=8`
    : "scale=-2:480";
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-i",
      clip,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "30",
      "-an",
      "-movflags",
      "+faststart",
      preview,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );

  const durationSeconds = Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      clip,
    ])
      .toString()
      .trim(),
  );
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("ffprobe returned an invalid clip duration");
  }

  return {
    clip,
    poster,
    preview,
    durationMs: Math.round(durationSeconds * 1000),
  };
}

async function createPublishedCreatorMoment(input: {
  db: DemoDb;
  creatorId: string;
  listingTitle: string;
  externalIdentity: string;
  attestationVersion: string;
  priceMicroUsdc: number;
}) {
  const src = process.env.SRC ?? DEFAULT_SRC;
  const startSeconds = Number(process.env.SS ?? 38);
  const durationSeconds = Number(process.env.DUR ?? 8);
  const rendered = renderDemoMedia({ src, startSeconds, durationSeconds });
  const storageId = randomUUID();
  const clipKey = `clips/demo-claim/${storageId}.mp4`;
  const posterKey = `clips/demo-claim/${storageId}.jpg`;
  const previewKey = `previews/demo-claim/${storageId}.mp4`;

  try {
    const supa = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    for (const [key, file, type] of [
      [clipKey, rendered.clip, "video/mp4"],
      [posterKey, rendered.poster, "image/jpeg"],
      [previewKey, rendered.preview, "video/mp4"],
    ] as const) {
      const { error } = await supa.storage
        .from("moments")
        .upload(key, readFileSync(file), { contentType: type, upsert: true });
      if (error) throw error;
    }

    const now = new Date();
    const title = `Claimed PeerTube moment - ${storageId.slice(0, 8)}`;
    const [asset] = await input.db
      .insert(schema.assets)
      .values({
        creatorId: input.creatorId,
        sourceType: "upload",
        title,
        description: `Uploaded for ${input.listingTitle}`,
        mediaType: "video",
        sourceUrl: `peertube:${input.externalIdentity}`,
        ownershipModel: "channel_control",
        ownershipVerified: true,
        attestationText:
          `Creator claimed control of ${input.externalIdentity} and attested rights for this demo clip.`,
        attestationVersion: input.attestationVersion,
        attestationAt: now,
        status: "published",
      })
      .returning();

    const [moment] = await input.db
      .insert(schema.moments)
      .values({
        assetId: asset.id,
        creatorId: input.creatorId,
        title,
        description:
          "A licensed backcountry snowboard spray clip activated from a PeerTube wanted listing.",
        startMs: startSeconds * 1000,
        endMs: (startSeconds + durationSeconds) * 1000,
        durationMs: rendered.durationMs,
        clipStorageKey: clipKey,
        clipMimeType: "video/mp4",
        posterStorageKey: posterKey,
        previewStorageKey: previewKey,
        priceMicroUsdc: input.priceMicroUsdc,
        priceUsdSnapshot: formatMicroUsdc(input.priceMicroUsdc),
        usageType: "video_embed",
        licenseSummary: "Standard Findling video embed license.",
        ownershipVerified: true,
        attestationAt: now,
        status: "published",
        embeddingStatus: "pending",
      })
      .returning();

    const { upsertMomentEmbedding } = await import("../src/server/search/embeddings");
    const { findLicensableMoment } = await import("../src/server/catalog/licensable");
    await upsertMomentEmbedding(moment.id);
    const licensable = await findLicensableMoment(moment.id);
    if (!licensable) {
      throw new Error(`created moment ${moment.id} did not pass findLicensableMoment`);
    }
    const [freshMoment] = await input.db
      .select()
      .from(schema.moments)
      .where(eq(schema.moments.id, moment.id))
      .limit(1);
    return freshMoment ?? moment;
  } finally {
    for (const file of [rendered.clip, rendered.poster, rendered.preview]) {
      try {
        unlinkSync(file);
      } catch {
        // temp cleanup only
      }
    }
  }
}

function findPledgeForListing(
  pledges: Awaited<ReturnType<typeof listPledges>>["pledges"],
  listingId: string,
) {
  const pledge = pledges.find((p) => p.listingId === listingId);
  if (!pledge) throw new Error(`pledge for listing ${listingId} not found`);
  return pledge;
}

async function loadDemandIntent(db: DemoDb, listingId: string, buyerId: string) {
  const [intent] = await db
    .select()
    .from(schema.demandIntents)
    .where(
      and(
        eq(schema.demandIntents.listingId, listingId),
        eq(schema.demandIntents.buyerId, buyerId),
      ),
    )
    .limit(1);
  if (!intent) {
    throw new Error(`demand intent for buyer/listing not found: ${buyerId}/${listingId}`);
  }
  return intent;
}

async function loadPurchaseAndReceipt(
  db: DemoDb,
  paymentReference: string,
): Promise<{ purchase: PurchaseRow; receipt: ReceiptRow }> {
  const [purchase] = await db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.paymentReference, paymentReference))
    .limit(1);
  if (!purchase) {
    throw new Error(`purchase for paymentReference ${paymentReference} not found`);
  }
  const [receipt] = await db
    .select()
    .from(schema.receipts)
    .where(eq(schema.receipts.purchaseId, purchase.id))
    .limit(1);
  if (!receipt) {
    throw new Error(`receipt for purchase ${purchase.id} not found`);
  }
  return { purchase, receipt };
}

async function withdrawCreator(input: {
  creator: UserRow;
  baseUrl: string;
  sellerPrivateKey: `0x${string}`;
}): Promise<{
  txHash: string;
  amountMicroUsdc: number;
  recipient: string;
}> {
  if (!input.creator.payoutWalletAddress) {
    throw new Error("creator payoutWalletAddress is missing");
  }

  const sellerGateway = new GatewayClient({
    chain: "arcTestnet",
    privateKey: input.sellerPrivateKey,
  });
  const { issueAgentKey } = await import("../src/server/auth/agent-credential");
  const { getEarnings } = await import("../src/server/ledger/earnings");
  const bal = await sellerGateway.getBalances();
  const earnings = await getEarnings(input.creator.id);
  console.log(`seller Gateway available: ${bal.gateway.formattedAvailable} USDC`);
  console.log(
    `creator withdrawable before withdraw: ${usdc(earnings.creator.withdrawableMicroUsdc)}`,
  );
  if (Number(bal.gateway.available) < earnings.creator.withdrawableMicroUsdc) {
    console.log(
      "seller Gateway balance is below creator withdrawable; withdrawal may fail. " +
        "Fund the seller Gateway balance if the API rejects it.",
    );
  }

  const apiKey = await issueAgentKey(input.creator.id, "demo-claim-to-activate-withdraw");
  const body: { role: "creator"; maxFee?: string } = { role: "creator" };
  if (process.env.DEMO_WITHDRAW_MAX_FEE_USDC) {
    body.maxFee = process.env.DEMO_WITHDRAW_MAX_FEE_USDC;
  }
  const res = await fetch(`${input.baseUrl}/api/earnings/withdraw`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const out = (await res.json().catch(() => null)) as {
    status?: string;
    amountMicroUsdc?: number;
    transactionHash?: string;
    recipient?: string;
    failureReason?: string;
    error?: string;
  } | null;
  console.log(`withdraw -> ${res.status} ${JSON.stringify(out)}`);
  if (
    res.status !== 200 ||
    out?.status !== "succeeded" ||
    !out.transactionHash ||
    typeof out.amountMicroUsdc !== "number" ||
    !out.recipient
  ) {
    throw new Error(
      `creator withdrawal not confirmed: ${out?.failureReason ?? out?.error ?? res.status}`,
    );
  }
  return {
    txHash: out.transactionHash,
    amountMicroUsdc: out.amountMicroUsdc,
    recipient: out.recipient,
  };
}

async function main() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_BASE;
  const pledgeBudgetMicroUsdc = optionalMicroEnv(
    "DEMO_PLEDGE_MICRO_USDC",
    DEFAULT_PLEDGE_MICRO_USDC,
  );
  const priceMicroUsdc = optionalMicroEnv(
    "DEMO_PRICE_MICRO_USDC",
    optionalMicroEnv("PRICE_MICRO", pledgeBudgetMicroUsdc),
  );
  if (priceMicroUsdc > pledgeBudgetMicroUsdc) {
    throw new Error(
      `DEMO_PRICE_MICRO_USDC (${priceMicroUsdc}) must be <= pledge budget (${pledgeBudgetMicroUsdc})`,
    );
  }
  if (process.env.PAYMENT_PROVIDER !== "gateway_x402") {
    throw new Error("PAYMENT_PROVIDER=gateway_x402 is required for real withdrawal");
  }

  const agentPrivateKey = requirePrivateKey("AGENT_PRIVATE_KEY");
  const agentAddress = requireAddress("AGENT_ADDRESS");
  const sellerPrivateKey = requirePrivateKey("SELLER_PRIVATE_KEY");
  const sellerAddress = requireAddress("SELLER_ADDRESS");
  requireEnv("GATEWAY_FACILITATOR_URL");

  const creatorPayoutWallet =
    process.env.CREATOR_PAYOUT_ADDRESS ?? sellerAddress ?? agentAddress;
  if (!/^0x[0-9a-fA-F]{40}$/.test(creatorPayoutWallet)) {
    throw new Error("CREATOR_PAYOUT_ADDRESS must be a 0x-prefixed EVM address");
  }

  const { sql, db } = connectDb();
  const buyerGateway = new GatewayClient({
    chain: "arcTestnet",
    privateKey: agentPrivateKey,
  });

  let listingId = "";
  let momentId = "";
  let pledgeStatus = "";
  let paymentReference = "";
  let receiptCode = "";
  let withdrawalTxHash = "";
  let purchaseForSummary: PurchaseRow | null = null;

  try {
    step(1, "Ensure demo creator with payout wallet");
    const creator = await ensureUser(db, {
      email: CREATOR_EMAIL,
      displayName: "Dev Creator",
      roles: ["creator"],
      payoutWalletAddress: creatorPayoutWallet,
    });
    console.log(`creatorId=${creator.id}`);
    console.log(`email=${creator.email}`);
    console.log(`payoutWalletAddress=${creator.payoutWalletAddress}`);

    step(2, "Ensure buyer agent and funded Arc testnet session grant");
    const buyer = await ensureUser(db, {
      email: BUYER_EMAIL,
      displayName: "Loop Buyer",
      roles: ["buyer"],
    });
    const grant = await ensureBuyerGrant({
      db,
      buyer,
      agentAddress,
      capMicroUsdc: pledgeBudgetMicroUsdc,
    });
    await ensureGatewayBalance({
      gateway: buyerGateway,
      requiredMicroUsdc: priceMicroUsdc,
      agentAddress,
    });
    console.log(`buyerId=${buyer.id}`);
    console.log(`grantId=${grant.id}`);
    console.log(`grantCap=${usdc(grant.totalCapMicroUsdc)}`);
    console.log(`sessionKeyAddress=${grant.sessionKeyAddress}`);

    step(3, "Create fresh seed-finder claimable listing");
    const seedFinder = await ensureUser(db, {
      email: SEED_FINDER_EMAIL,
      displayName: "PeerTube Seed Finder",
      roles: ["finder"],
      payoutWalletAddress: process.env.SEED_FINDER_PAYOUT_ADDRESS ?? null,
    });
    const { listing, claimSecret, claimUrl } = await createFreshClaimableListing(
      seedFinder.id,
      baseUrl,
    );
    listingId = listing.id;
    console.log(`seedFinderId=${seedFinder.id}`);
    console.log(`listingId=${listing.id}`);
    console.log(`externalIdentity=${listing.externalIdentity}`);
    console.log(`externalRef=${listing.externalRef}`);
    console.log(`sourceLicenceLabel=${listing.sourceLicenceLabel}`);
    console.log(`claimSecret=${claimSecret}`);
    console.log(`claimUrl=${claimUrl}`);

    step(4, "Buyer pledges demand on the listing");
    const beforeDemand = await getPledgedDemand(listing.id);
    console.log(
      `demand before: ${usdc(beforeDemand.pledgedDemandMicroUsdc)} ` +
        `(${beforeDemand.pledgeCount} pledges)`,
    );
    const intent = await pledgeIntent({
      buyerId: buyer.id,
      listingId: listing.id,
      sessionGrantId: grant.id,
      budgetMicroUsdc: pledgeBudgetMicroUsdc,
      usageType: "video_embed",
    });
    const afterDemand = await getPledgedDemand(listing.id);
    console.log(`pledgeId=${intent.id}`);
    console.log(`pledgeBudget=${usdc(intent.budgetMicroUsdc)}`);
    console.log(
      `demand after: ${usdc(afterDemand.pledgedDemandMicroUsdc)} ` +
        `(${afterDemand.pledgeCount} pledge)`,
    );

    step(5, "Creator claims the listing");
    const claimed = await claimListing({
      secret: claimSecret,
      userId: creator.id,
      proof: { demoActorControl: true },
      proofVerifier: async () => true,
    });
    console.log(`listingId=${claimed.listing.id}`);
    console.log(`status=${claimed.listing.status}`);
    console.log(`claimedByUserId=${claimed.listing.claimedByUserId}`);
    console.log(
      `attestationVersion=${claimed.attestation?.attestationVersion ?? PEERTUBE_ATTESTATION_VERSION}`,
    );

    step(6, "Creator uploads a published, attested, licensable clip");
    const moment = await createPublishedCreatorMoment({
      db,
      creatorId: creator.id,
      listingTitle: listing.title,
      externalIdentity: listing.externalIdentity,
      attestationVersion:
        claimed.attestation?.attestationVersion ?? PEERTUBE_ATTESTATION_VERSION,
      priceMicroUsdc,
    });
    momentId = moment.id;
    console.log(`momentId=${moment.id}`);
    console.log(`assetId=${moment.assetId}`);
    console.log(`price=${usdc(moment.priceMicroUsdc)}`);
    console.log(`status=${moment.status}`);
    console.log(`embeddingStatus=${moment.embeddingStatus}`);

    step(7, "Activate listing and notify the pledged buyer");
    const { activateListing } = await import("../src/server/claimable/activate");
    const activation = await activateListing({
      listingId: listing.id,
      userId: creator.id,
      momentId: moment.id,
    });
    console.log(`listingId=${activation.listingId}`);
    console.log(`momentId=${activation.momentId}`);
    console.log(`seedFinderCurationId=${activation.curationId}`);
    console.log(`notifiedCount=${activation.notifiedCount}`);
    const notifiedPledges = await listPledges(buyer.id, { baseUrl });
    const notified = findPledgeForListing(notifiedPledges.pledges, listing.id);
    if (notified.status !== "notified" || !notified.unlockUrl) {
      throw new Error(`expected notified pledge with unlockUrl, got ${JSON.stringify(notified)}`);
    }
    const unlockParams = extractUnlockParams(notified.unlockUrl);
    if (unlockParams.grantId !== grant.id) {
      throw new Error(`unlockUrl carried grant ${unlockParams.grantId}, expected ${grant.id}`);
    }
    console.log(`pledgeStatus=${notified.status}`);
    console.log(`unlockUrl=${notified.unlockUrl}`);
    console.log(`unlockGrantId=${unlockParams.grantId}`);
    console.log(`unlockAgentRunId=${unlockParams.agentRunId}`);

    step(8, "Buyer pays the pledge unlock URL over real Gateway x402");
    console.log("paying x402 unlock...");
    const paid = await buyerGateway.pay<{
      unlockUrl: string;
      receiptCode: string;
      paymentReference: string;
      payer: string;
      split: {
        creatorMicroUsdc: number;
        finderMicroUsdc: number;
        platformMicroUsdc: number;
      };
    }>(notified.unlockUrl);
    paymentReference = paid.data.paymentReference;
    receiptCode = paid.data.receiptCode;
    console.log(`paidAmount=${paid.amount} USDC`);
    console.log(`paymentReference=${paid.data.paymentReference}`);
    console.log(`receiptCode=${paid.data.receiptCode}`);
    console.log(`payer=${paid.data.payer}`);
    console.log(`split=${JSON.stringify(paid.data.split)}`);
    const { purchase } = await loadPurchaseAndReceipt(db, paymentReference);
    const { getAgentRun } = await import("../src/server/agent/agent");
    const run = await getAgentRun(unlockParams.agentRunId);
    if (
      purchase.status !== "settled" ||
      purchase.provider !== "gateway_x402" ||
      run?.paymentStatus !== "settled"
    ) {
      throw new Error(
        `purchase did not settle cleanly: purchase=${purchase.status}/${purchase.provider} ` +
          `run=${run?.paymentStatus ?? "missing"}`,
      );
    }
    console.log(`purchaseId=${purchase.id}`);
    console.log(`agentRunPaymentStatus=${run.paymentStatus}`);

    step(9, "Reconcile pledge and print receipt split");
    const settledPledges = await listPledges(buyer.id, { baseUrl });
    const settled = findPledgeForListing(settledPledges.pledges, listing.id);
    pledgeStatus = settled.status;
    if (settled.status !== "settled") {
      throw new Error(`expected settled pledge, got ${JSON.stringify(settled)}`);
    }
    const settledIntent = await loadDemandIntent(db, listing.id, buyer.id);
    if (!settledIntent.settledPurchaseId) {
      throw new Error("pledge settled but settledPurchaseId is missing");
    }
    const receiptRows = await loadPurchaseAndReceipt(db, paymentReference);
    purchaseForSummary = receiptRows.purchase;
    assertSeedFinderSplit({
      grossMicroUsdc: receiptRows.purchase.grossMicroUsdc,
      creatorMicroUsdc: receiptRows.purchase.creatorMicroUsdc,
      finderMicroUsdc: receiptRows.purchase.finderMicroUsdc,
      platformMicroUsdc: receiptRows.purchase.platformMicroUsdc,
      finderId: receiptRows.purchase.finderId,
      expectedFinderId: seedFinder.id,
    });
    if (receiptRows.receipt.finderId !== seedFinder.id) {
      throw new Error(
        `receipt finder ${receiptRows.receipt.finderId ?? "null"} did not match seed finder ${seedFinder.id}`,
      );
    }
    console.log(`pledgeStatus=${settled.status}`);
    console.log(`settledPurchaseId=${settledIntent.settledPurchaseId}`);
    console.log(`receiptId=${receiptRows.receipt.id}`);
    console.log(`receiptCode=${receiptRows.receipt.receiptCode}`);
    console.log(`gross=${usdc(receiptRows.purchase.grossMicroUsdc)}`);
    console.log(`creator 80% -> ${creator.id}: ${usdc(receiptRows.purchase.creatorMicroUsdc)}`);
    console.log(
      `finder 12% -> ${seedFinder.id}: ${usdc(receiptRows.purchase.finderMicroUsdc)}`,
    );
    console.log(`platform 8% -> platform: ${usdc(receiptRows.purchase.platformMicroUsdc)}`);

    step(10, "Creator withdraws accrued creator earnings on-chain");
    const withdrawal = await withdrawCreator({
      creator,
      baseUrl,
      sellerPrivateKey,
    });
    withdrawalTxHash = withdrawal.txHash;
    console.log(`withdrawAmount=${usdc(withdrawal.amountMicroUsdc)}`);
    console.log(`withdrawRecipient=${withdrawal.recipient}`);
    console.log(`withdrawalTxHash=${withdrawal.txHash}`);
    if (
      purchaseForSummary &&
      withdrawal.amountMicroUsdc !== purchaseForSummary.creatorMicroUsdc
    ) {
      console.log(
        `withdrawNote=withdrew full creator balance; this purchase creator leg was ` +
          `${usdc(purchaseForSummary.creatorMicroUsdc)}`,
      );
    }

    console.log(`\n${"=".repeat(72)}`);
    console.log("SUMMARY");
    console.log("=".repeat(72));
    console.log(`listingId=${listingId}`);
    console.log(`momentId=${momentId}`);
    console.log(`pledge=${pledgeStatus}`);
    console.log(`gross=${purchaseForSummary ? usdc(purchaseForSummary.grossMicroUsdc) : "(missing)"}`);
    console.log(
      `creatorLeg=${purchaseForSummary ? usdc(purchaseForSummary.creatorMicroUsdc) : "(missing)"} -> ${creator.id}`,
    );
    console.log(
      `finderLeg=${purchaseForSummary ? usdc(purchaseForSummary.finderMicroUsdc) : "(missing)"} -> ${seedFinder.id}`,
    );
    console.log(
      `platformLeg=${purchaseForSummary ? usdc(purchaseForSummary.platformMicroUsdc) : "(missing)"} -> platform`,
    );
    console.log(`buyerPaymentReference=${paymentReference}`);
    console.log(`receiptCode=${receiptCode}`);
    console.log(`withdrawalTxHash=${withdrawalTxHash}`);
  } finally {
    await sql.end();
  }
}

function isMainModule(): boolean {
  return !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("\nDEMO FAILED");
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
