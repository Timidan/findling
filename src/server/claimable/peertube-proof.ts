import { createHash, createHmac } from "node:crypto";
import { authSecret } from "../auth/secret";
import { claimableListings } from "../db/schema";
import { fetchPublicJson, type LookupFn } from "./public-fetch";

type ClaimableListingRow = typeof claimableListings.$inferSelect;

const VERIFIER = "findling-peertube-proof-v1";
const TOKEN_PREFIX = "fdl-claim-v1";

export type ActorProofMatchedField = "actor.summary" | "video.support";

export interface PeerTubeActorProofSnapshot extends Record<string, unknown> {
  kind: "peertube_actor_token";
  verifier: typeof VERIFIER;
  proofUrl: string;
  matchedField: ActorProofMatchedField;
  tokenHash: string;
  verifiedAt: string;
}

export interface PeerTubeActorProofResult {
  verified: boolean;
  snapshot?: PeerTubeActorProofSnapshot;
  reason?: string;
}

export interface PeerTubeActorProofDeps {
  fetch?: typeof fetch;
  lookup?: LookupFn;
  now?: () => Date;
  timeoutMs?: number;
  maxBytes?: number;
}

export function claimVerificationTokenForListing(
  listingId: string,
  secret = authSecret(),
): string {
  const mac = createHmac("sha256", secret)
    .update("findling:claim-actor-control:v1:")
    .update(listingId)
    .digest("base64url");
  return `${TOKEN_PREFIX}-${mac}`;
}

export async function verifyPeerTubeActorProof(
  listing: ClaimableListingRow,
  proof: unknown,
  deps: PeerTubeActorProofDeps = {},
): Promise<PeerTubeActorProofResult> {
  const expectedToken = claimVerificationTokenForListing(listing.id);
  const proofRecord = asRecord(proof);
  const submittedToken = proofRecord
    ? stringField(proofRecord, "token") ??
      stringField(proofRecord, "actorControlToken") ??
      stringField(proofRecord, "actorToken")
    : null;

  if (submittedToken !== expectedToken) {
    return { verified: false, reason: "token_mismatch" };
  }

  const proofUrl = proofRecord ? stringField(proofRecord, "proofUrl") : null;
  const target = proofUrl ?? listing.externalRef;
  if (!target) return { verified: false, reason: "missing_proof_url" };

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return { verified: false, reason: "invalid_proof_url" };
  }

  if (proofUrl && !isSameOrigin(proofUrl, listing.externalRef)) {
    return { verified: false, reason: "proof_url_origin_mismatch" };
  }

  const json = await fetchPublicJson(targetUrl, {
    ...deps,
    headers: {
      accept:
        'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/json',
    },
  }).catch(() => null);
  if (json === null) return { verified: false, reason: "proof_fetch_failed" };

  const matchedField = findTokenField(json, expectedToken);
  if (!matchedField) return { verified: false, reason: "token_not_found" };

  if (
    matchedField === "video.support" &&
    proofUrl &&
    !jsonReferencesListingActor(json, listing.externalRef)
  ) {
    return { verified: false, reason: "video_actor_mismatch" };
  }

  return {
    verified: true,
    snapshot: {
      kind: "peertube_actor_token",
      verifier: VERIFIER,
      proofUrl: targetUrl.toString(),
      matchedField,
      tokenHash: `sha256:${createHash("sha256")
        .update(expectedToken)
        .digest("hex")}`,
      verifiedAt: (deps.now ?? (() => new Date()))().toISOString(),
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function findTokenField(
  value: unknown,
  token: string,
): ActorProofMatchedField | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findTokenField(item, token);
      if (match) return match;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;
  for (const [key, child] of Object.entries(record)) {
    if (
      (key === "summary" || key === "description") &&
      typeof child === "string" &&
      child.includes(token)
    ) {
      return "actor.summary";
    }
    if (key === "support" && typeof child === "string" && child.includes(token)) {
      return "video.support";
    }
    const match = findTokenField(child, token);
    if (match) return match;
  }
  return null;
}

function jsonReferencesListingActor(json: unknown, externalRef: string | null): boolean {
  if (!externalRef) return false;
  const canonical = normalizeActorRef(externalRef);
  return candidateActorRefs(json).some((ref) => normalizeActorRef(ref) === canonical);
}

function candidateActorRefs(json: unknown): string[] {
  const record = asRecord(json);
  if (!record) return [];
  const candidates: string[] = [];
  addRef(candidates, record.attributedTo);
  addRef(candidates, record.actor);
  addRef(candidates, asRecord(record.channel)?.url);
  addRef(candidates, asRecord(record.channel)?.id);
  addRef(candidates, asRecord(record.account)?.url);
  addRef(candidates, asRecord(record.account)?.id);
  return candidates;
}

function addRef(candidates: string[], value: unknown): void {
  if (typeof value === "string") candidates.push(value);
  if (Array.isArray(value)) {
    for (const item of value) addRef(candidates, item);
  }
}

function normalizeActorRef(ref: string): string {
  try {
    const url = new URL(ref);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return ref.trim().replace(/\/+$/, "").toLowerCase();
  }
}

function isSameOrigin(proofUrl: string, externalRef: string | null): boolean {
  if (!externalRef) return false;
  try {
    return new URL(proofUrl).origin === new URL(externalRef).origin;
  } catch {
    return false;
  }
}
