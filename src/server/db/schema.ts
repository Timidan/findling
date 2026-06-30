import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  bigint,
  integer,
  jsonb,
  vector,
  real,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

type JsonObject = Record<string, unknown>;

/* ---------------- enums ---------------- */
export const roleEnum = pgEnum("role", ["creator", "finder", "buyer", "admin"]);
export const sourceTypeEnum = pgEnum("source_type", ["upload", "youtube"]);
export const ownershipModelEnum = pgEnum("ownership_model", [
  "channel_control",
  "contributor_attestation",
]);
export const assetStatusEnum = pgEnum("asset_status", [
  "draft",
  "published",
  "disabled",
  "takedown_pending",
]);
export const clipJobStatusEnum = pgEnum("clip_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);
export const momentStatusEnum = pgEnum("moment_status", [
  "draft",
  "published",
  "disabled",
  "takedown_pending",
]);
export const embeddingStatusEnum = pgEnum("embedding_status", [
  "pending",
  "ready",
  "failed",
]);
export const usageTypeEnum = pgEnum("usage_type", [
  "video_embed",
  "newsletter",
  "social_post",
  "internal_reference",
]);
export const claimableExternalIdentityKindEnum = pgEnum(
  "claimable_external_identity_kind",
  ["youtube_channel", "peertube_channel", "activitypub_actor", "handle", "url"],
);
export const claimableListingStatusEnum = pgEnum("claimable_listing_status", [
  "open",
  "claimed",
  "activated",
  "expired",
]);
export const demandIntentStatusEnum = pgEnum("demand_intent_status", [
  "pledged",
  "notified",
  "settled",
  "lapsed",
]);
export const sourceSurfaceEnum = pgEnum("source_surface", [
  "feed",
  "overlay",
  "share_link",
  "seed",
]);
export const grantStatusEnum = pgEnum("grant_status", [
  "pending",
  "active",
  "revoked",
  "expired",
  "exhausted",
]);
export const agentSurfaceEnum = pgEnum("agent_surface", [
  "mcp",
  "rest",
  "demo_harness",
  "feed",
  "overlay",
]);
export const agentPaymentStatusEnum = pgEnum("agent_payment_status", [
  "not_attempted",
  "requires_payment",
  "settled",
  "failed",
  "refused",
]);
export const purchaseStatusEnum = pgEnum("purchase_status", [
  "pending",
  "settled",
  "failed",
  "refunded",
]);
export const purchaseReservationStatusEnum = pgEnum(
  "purchase_reservation_status",
  ["pending", "recording", "settled", "released"],
);
export const providerEnum = pgEnum("payment_provider", ["gateway_x402", "mock"]);
export const withdrawalRoleEnum = pgEnum("withdrawal_role", [
  "creator",
  "finder",
]);
export const withdrawalStatusEnum = pgEnum("withdrawal_status", [
  "requested",
  "submitted",
  "succeeded",
  "failed",
]);
export const reportStatusEnum = pgEnum("report_status", [
  "received",
  "takedown_pending",
  "resolved",
  "rejected",
]);

/* ---------------- helpers ---------------- */
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
/** integer micro-USDC (1 USDC = 1_000_000) */
const micro = (name: string) => bigint(name, { mode: "number" });

/* ---------------- users ---------------- */
export const users = pgTable("users", {
  id: id(),
  supabaseUserId: text("supabase_user_id").unique(),
  email: text("email").notNull(),
  // unique public handle, chosen on first sign-in (lowercased; 3-20 [a-z0-9_])
  username: text("username").unique(),
  displayName: text("display_name"),
  roles: roleEnum("roles").array().notNull().default(sql`'{}'`),
  // login identity — stored lowercase so the unique constraint is case-insensitive
  walletAddress: text("wallet_address").unique(),
  payoutWalletAddress: text("payout_wallet_address"),
  youtubeChannelId: text("youtube_channel_id"),
  youtubeChannelTitle: text("youtube_channel_title"),
  youtubeRefreshTokenCiphertext: text("youtube_refresh_token_ciphertext"),
  youtubeConnectedAt: timestamp("youtube_connected_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ---------------- agent credentials (wallet-proven API keys) ---------------- */
// An autonomous agent proves control of its wallet (SIWE) and is issued a bearer
// key; we store only its SHA-256 hash. Presented as `Authorization: Bearer <key>`
// on the MCP + REST agent surface. Maps to a users row (with finder/buyer roles).
export const agentCredentials = pgTable(
  "agent_credentials",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    keyHash: text("key_hash").notNull().unique(),
    label: text("label"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("agent_credentials_user_idx").on(t.userId)],
);

/* ---------------- SIWE nonces (single-use, server-side) ---------------- */
// A login nonce is valid only if it exists here and is unconsumed + unexpired.
// `consumeNonce` flips `consumed_at` atomically, so a captured login can't be
// replayed and a signature minted for another site (whose nonce we never
// issued) can't be reused here.
export const siweNonces = pgTable("siwe_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/* ---------------- assets (source container) ---------------- */
export const assets = pgTable("assets", {
  id: id(),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  sourceType: sourceTypeEnum("source_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  mediaType: text("media_type").notNull().default("video"),
  originalStorageKey: text("original_storage_key"),
  originalMimeType: text("original_mime_type"),
  originalSizeBytes: bigint("original_size_bytes", { mode: "number" }),
  originalDurationMs: integer("original_duration_ms"),
  youtubeVideoId: text("youtube_video_id"),
  youtubeChannelId: text("youtube_channel_id"),
  youtubeChannelTitle: text("youtube_channel_title"),
  sourceUrl: text("source_url"),
  ownershipModel: ownershipModelEnum("ownership_model").notNull(),
  ownershipVerified: boolean("ownership_verified").notNull().default(false),
  attestationText: text("attestation_text"),
  attestationVersion: text("attestation_version"),
  attestationAt: timestamp("attestation_at", { withTimezone: true }),
  status: assetStatusEnum("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ---------------- clip jobs (yt-dlp + ffmpeg) ---------------- */
export const clipJobs = pgTable("clip_jobs", {
  id: id(),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  sourceType: sourceTypeEnum("source_type").notNull(),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  status: clipJobStatusEnum("status").notNull().default("queued"),
  inputReference: text("input_reference"),
  outputStorageKey: text("output_storage_key"),
  posterStorageKey: text("poster_storage_key"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/* ---------------- moments (licensable unit) ---------------- */
export const moments = pgTable(
  "moments",
  {
    id: id(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    clipJobId: uuid("clip_job_id").references(() => clipJobs.id),
    title: text("title").notNull(),
    description: text("description"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    durationMs: integer("duration_ms").notNull(),
    clipStorageKey: text("clip_storage_key"),
    clipMimeType: text("clip_mime_type"),
    clipSizeBytes: bigint("clip_size_bytes", { mode: "number" }),
    posterStorageKey: text("poster_storage_key"),
    // Low-res, watermarked PREVIEW for the public Feed. The full-quality
    // clipStorageKey is the licensed deliverable and is only signed AFTER payment
    // (the x402 unlock route). Never sign clipStorageKey on a public surface.
    previewStorageKey: text("preview_storage_key"),
    thumbnailUrl: text("thumbnail_url"),
    priceMicroUsdc: micro("price_micro_usdc").notNull(),
    priceUsdSnapshot: text("price_usd_snapshot").notNull(),
    usageType: usageTypeEnum("usage_type").notNull().default("video_embed"),
    licenseSummary: text("license_summary"),
    ownershipVerified: boolean("ownership_verified").notNull().default(false),
    attestationAt: timestamp("attestation_at", { withTimezone: true }),
    embeddingStatus: embeddingStatusEnum("embedding_status")
      .notNull()
      .default("pending"),
    status: momentStatusEnum("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("moments_status_idx").on(t.status),
    index("moments_creator_idx").on(t.creatorId),
    check("moments_price_positive", sql`price_micro_usdc > 0`),
    check("moments_duration_positive", sql`duration_ms > 0`),
    check("moments_clip_range", sql`end_ms >= start_ms`),
    // a published moment must have hosted media — no published-but-empty rows
    check(
      "moments_published_has_clip",
      sql`status <> 'published' OR clip_storage_key IS NOT NULL`,
    ),
  ],
);

/* ---------------- moment embeddings (pgvector) ---------------- */
export const momentEmbeddings = pgTable(
  "moment_embeddings",
  {
    id: id(),
    momentId: uuid("moment_id")
      .notNull()
      .references(() => moments.id),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    sourceTextHash: text("source_text_hash").notNull(),
    sourceText: text("source_text").notNull(),
    embedding: vector("embedding", { dimensions: 384 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("moment_embeddings_unique").on(t.momentId, t.provider, t.model),
    index("moment_embeddings_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

/* ---------------- curations (finder metadata) ---------------- */
export const curations = pgTable(
  "curations",
  {
    id: id(),
    momentId: uuid("moment_id")
      .notNull()
      .references(() => moments.id),
    finderId: uuid("finder_id")
      .notNull()
      .references(() => users.id),
    tags: text("tags").array().notNull().default(sql`'{}'`),
    caption: text("caption"),
    useCaseNote: text("use_case_note"),
    shareSlug: text("share_slug").unique(),
    sourceSurface: sourceSurfaceEnum("source_surface").notNull().default("feed"),
    relevanceText: text("relevance_text"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("curations_moment_idx").on(t.momentId)],
);

/* ---------------- buyer session grants (delegated, capped agent key) ---------------- */
export const buyerSessionGrants = pgTable(
  "buyer_session_grants",
  {
    id: id(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    walletAddress: text("wallet_address").notNull(),
    sessionKeyAddress: text("session_key_address").notNull(),
    chain: text("chain").notNull().default("arcTestnet"),
    gatewayBalanceReference: text("gateway_balance_reference"),
    totalCapMicroUsdc: micro("total_cap_micro_usdc").notNull(),
    remainingCapMicroUsdc: micro("remaining_cap_micro_usdc").notNull(),
    perPurchaseCapMicroUsdc: micro("per_purchase_cap_micro_usdc"),
    gasBufferMicroUsdc: micro("gas_buffer_micro_usdc"),
    allowedUsageTypes: usageTypeEnum("allowed_usage_types").array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: grantStatusEnum("status").notNull().default("pending"),
    providerMetadata: jsonb("provider_metadata"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // NOTE: a buyer private key is NEVER stored here. Only the session key ADDRESS.
  },
  (t) => [
    index("grants_buyer_status_idx").on(t.buyerId, t.status),
    index("grants_session_key_idx").on(t.sessionKeyAddress),
    index("grants_expires_idx").on(t.expiresAt),
    // caps must form a coherent funded-delegate envelope; remaining never exceeds total, never negative
    check(
      "grants_caps_valid",
      sql`"total_cap_micro_usdc" > 0 AND "remaining_cap_micro_usdc" >= 0 AND "remaining_cap_micro_usdc" <= "total_cap_micro_usdc"`,
    ),
  ],
);

/* ---------------- agent runs (the Agentic-30% trace) ---------------- */
export const agentRuns = pgTable("agent_runs", {
  id: id(),
  buyerId: uuid("buyer_id").references(() => users.id),
  sessionGrantId: uuid("session_grant_id").references(() => buyerSessionGrants.id),
  surface: agentSurfaceEnum("surface").notNull(),
  requestText: text("request_text").notNull(),
  parsedConstraints: jsonb("parsed_constraints"),
  candidateMomentIds: text("candidate_moment_ids").array(),
  candidateScores: jsonb("candidate_scores"),
  chosenMomentId: uuid("chosen_moment_id").references(() => moments.id),
  chosenCurationId: uuid("chosen_curation_id").references(() => curations.id),
  chosenFinderId: uuid("chosen_finder_id").references(() => users.id),
  attributionReason: text("attribution_reason"),
  budgetMicroUsdc: micro("budget_micro_usdc"),
  paymentStatus: agentPaymentStatusEnum("payment_status")
    .notNull()
    .default("not_attempted"),
  paymentReference: text("payment_reference"),
  // soft refs (avoid FK cycle with purchases/receipts)
  purchaseId: uuid("purchase_id"),
  receiptId: uuid("receipt_id"),
  refusalReason: text("refusal_reason"),
  trace: jsonb("trace"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/* ---------------- purchases (settled payment + split ledger row) ---------------- */
export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    momentId: uuid("moment_id")
      .notNull()
      .references(() => moments.id),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
    curationId: uuid("curation_id").references(() => curations.id),
    sessionGrantId: uuid("session_grant_id").references(
      () => buyerSessionGrants.id,
    ),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    finderId: uuid("finder_id").references(() => users.id),
    // who actually paid on-chain (the funded session key EOA) + why this finder won attribution
    payerAddress: text("payer_address"),
    attributionReason: text("attribution_reason"),
    curationScore: real("curation_score"),
    grossMicroUsdc: micro("gross_micro_usdc").notNull(),
    creatorMicroUsdc: micro("creator_micro_usdc").notNull(),
    finderMicroUsdc: micro("finder_micro_usdc").notNull(),
    platformMicroUsdc: micro("platform_micro_usdc").notNull(),
    remainderPolicy: text("remainder_policy")
      .notNull()
      .default("creator_receives_remainder"),
    paymentReference: text("payment_reference").notNull(),
    network: text("network").notNull().default("arcTestnet"),
    sellerAddress: text("seller_address").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    provider: providerEnum("provider").notNull(),
    status: purchaseStatusEnum("status").notNull().default("pending"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("purchases_moment_idx").on(t.momentId),
    index("purchases_creator_idx").on(t.creatorId),
    index("purchases_finder_idx").on(t.finderId),
    // one settled payment reference -> at most one purchase (belt-and-suspenders with idempotency_key)
    uniqueIndex("purchases_provider_network_ref_uq").on(
      t.provider,
      t.network,
      t.paymentReference,
    ),
    // settled rows must reconcile: the split always sums to gross
    check(
      "purchases_split_sums_to_gross",
      sql`"status" <> 'settled' OR "gross_micro_usdc" = "creator_micro_usdc" + "finder_micro_usdc" + "platform_micro_usdc"`,
    ),
    // no negative legs can hide inside a correct sum
    check(
      "purchases_split_nonneg",
      sql`"gross_micro_usdc" >= 0 AND "creator_micro_usdc" >= 0 AND "finder_micro_usdc" >= 0 AND "platform_micro_usdc" >= 0`,
    ),
  ],
);

/* ---------------- purchase reservations (unknown x402 settle outcomes) ---------------- */
export const purchaseReservations = pgTable(
  "purchase_reservations",
  {
    id: id(),
    momentId: uuid("moment_id")
      .notNull()
      .references(() => moments.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    sessionGrantId: uuid("session_grant_id")
      .notNull()
      .references(() => buyerSessionGrants.id),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
    purchaseId: uuid("purchase_id").references(() => purchases.id),
    amountMicroUsdc: micro("amount_micro_usdc").notNull(),
    provider: providerEnum("provider").notNull(),
    sellerAddress: text("seller_address").notNull(),
    payerAddress: text("payer_address").notNull(),
    paymentHeaderHash: text("payment_header_hash").notNull(),
    settledPaymentReference: text("settled_payment_reference"),
    settledNetwork: text("settled_network"),
    status: purchaseReservationStatusEnum("status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("purchase_reservations_status_idx").on(t.status),
    index("purchase_reservations_payment_hash_idx").on(
      t.provider,
      t.paymentHeaderHash,
    ),
    index("purchase_reservations_grant_idx").on(t.sessionGrantId, t.status),
    check("purchase_reservations_amount_positive", sql`"amount_micro_usdc" > 0`),
  ],
);

/* ---------------- claimable listings (wanted posters; not moments) ---------------- */
export const claimableListings = pgTable(
  "claimable_listings",
  {
    id: id(),
    finderId: uuid("finder_id")
      .notNull()
      .references(() => users.id),
    externalIdentity: text("external_identity").notNull(),
    externalIdentityKind: claimableExternalIdentityKindEnum(
      "external_identity_kind",
    ).notNull(),
    externalRef: text("external_ref"),
    externalRefNormalized: text("external_ref_normalized"),
    title: text("title").notNull(),
    description: text("description"),
    relevanceText: text("relevance_text"),
    sourceLicenceLabel: text("source_licence_label"),
    // Absolute https thumbnail URL of the matched source video (e.g. a PeerTube
    // /lazy-static/thumbnails/<uuid>.jpg), validated to the instance origin before
    // storage. Nullable: dead instances / no thumbnail fall back to the card icon.
    sourceThumbnailUrl: text("source_thumbnail_url"),
    claimSecretHash: text("claim_secret_hash").notNull(),
    status: claimableListingStatusEnum("status").notNull().default("open"),
    claimedByUserId: uuid("claimed_by_user_id").references(() => users.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimProofSnapshot: jsonb("claim_proof_snapshot").$type<JsonObject | null>(),
    createdMomentId: uuid("created_moment_id").references(() => moments.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("claimable_listings_status_idx").on(t.status),
    index("claimable_listings_finder_idx").on(t.finderId),
    uniqueIndex("claimable_listings_claim_secret_hash_uq").on(
      t.claimSecretHash,
    ),
    uniqueIndex("claimable_listings_external_ref_live_uq")
      .on(t.externalIdentityKind, t.externalRefNormalized)
      .where(
        sql`${t.externalRefNormalized} IS NOT NULL AND ${t.status} IN ('open', 'claimed')`,
      ),
  ],
);

/* ---------------- demand intents (pledged interest; no money movement) ---------------- */
export const demandIntents = pgTable(
  "demand_intents",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => claimableListings.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    sessionGrantId: uuid("session_grant_id")
      .notNull()
      .references(() => buyerSessionGrants.id),
    budgetMicroUsdc: micro("budget_micro_usdc").notNull(),
    usageType: usageTypeEnum("usage_type"),
    status: demandIntentStatusEnum("status").notNull().default("pledged"),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
    settledPurchaseId: uuid("settled_purchase_id").references(() => purchases.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("demand_intents_buyer_listing_uq").on(t.buyerId, t.listingId),
    index("demand_intents_listing_status_idx").on(t.listingId, t.status),
    index("demand_intents_buyer_status_idx").on(t.buyerId, t.status),
  ],
);

/* ---------------- receipts ---------------- */
export const receipts = pgTable("receipts", {
  id: id(),
  // one receipt per settled purchase
  purchaseId: uuid("purchase_id")
    .notNull()
    .unique()
    .references(() => purchases.id),
  receiptCode: text("receipt_code").notNull().unique(),
  publicSlug: text("public_slug").notNull().unique(),
  momentTitle: text("moment_title").notNull(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  usageType: usageTypeEnum("usage_type").notNull(),
  licenseSummary: text("license_summary"),
  attributionText: text("attribution_text"),
  // payee identities snapshotted at settlement (receipt stays valid if user rows change)
  creatorId: uuid("creator_id").references(() => users.id),
  finderId: uuid("finder_id").references(() => users.id),
  // rights provenance snapshot: how the clip was licensed at the moment of sale
  ownershipModel: ownershipModelEnum("ownership_model"),
  attestationVersion: text("attestation_version"),
  attestationText: text("attestation_text"),
  attestationAt: timestamp("attestation_at", { withTimezone: true }),
  paymentReference: text("payment_reference").notNull(),
  network: text("network").notNull(),
  grossMicroUsdc: micro("gross_micro_usdc").notNull(),
  creatorMicroUsdc: micro("creator_micro_usdc").notNull(),
  finderMicroUsdc: micro("finder_micro_usdc").notNull(),
  platformMicroUsdc: micro("platform_micro_usdc").notNull(),
  clipStorageKeySnapshot: text("clip_storage_key_snapshot"),
  createdAt: createdAt(),
});

/* ---------------- withdrawals (real Arc-testnet payout) ---------------- */
export const withdrawals = pgTable(
  "withdrawals",
  {
    id: id(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id),
    recipientWalletAddress: text("recipient_wallet_address").notNull(),
    role: withdrawalRoleEnum("role").notNull(),
    amountMicroUsdc: micro("amount_micro_usdc").notNull(),
    maxFee: text("max_fee"),
    network: text("network").notNull().default("arcTestnet"),
    provider: providerEnum("provider").notNull().default("gateway_x402"),
    gatewayWithdrawReference: text("gateway_withdraw_reference"),
    transactionHash: text("transaction_hash"),
    status: withdrawalStatusEnum("status").notNull().default("requested"),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("withdrawals_recipient_idx").on(t.recipientUserId),
    check("withdrawals_amount_positive", sql`"amount_micro_usdc" > 0`),
    // a single on-chain tx / gateway payout reference maps to at most one row —
    // DB-level guard against recording the same external payout twice
    uniqueIndex("withdrawals_tx_hash_uq")
      .on(t.transactionHash)
      .where(sql`transaction_hash IS NOT NULL`),
    uniqueIndex("withdrawals_gateway_ref_uq")
      .on(t.gatewayWithdrawReference)
      .where(sql`gateway_withdraw_reference IS NOT NULL`),
  ],
);

/* ---------------- reports (dispute / takedown) ---------------- */
export const reports = pgTable("reports", {
  id: id(),
  reporterUserId: uuid("reporter_user_id").references(() => users.id),
  assetId: uuid("asset_id").references(() => assets.id),
  momentId: uuid("moment_id").references(() => moments.id),
  reason: text("reason").notNull(),
  details: text("details"),
  status: reportStatusEnum("status").notNull().default("received"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
