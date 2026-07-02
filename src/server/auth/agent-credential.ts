/**
 * Agent credentials — an autonomous agent proves control of its wallet (SIWE)
 * and is issued a bearer key. Only the SHA-256 hash is stored; the plaintext is
 * returned once. Presented as `Authorization: Bearer <key>` on the MCP + REST
 * agent surface and resolved to the agent's users row.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/server/db/client";
import { agentCredentials, users } from "@/server/db/schema";

const KEY_PREFIX = "fdl_agent_";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

const KEY_TTL_DAYS = 90;

/** Issue a new agent bearer key for a user. Returns the plaintext ONCE. */
export async function issueAgentKey(
  userId: string,
  label?: string,
): Promise<string> {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  await db.insert(agentCredentials).values({
    userId,
    keyHash: hashKey(key),
    label: label ?? null,
    expiresAt: new Date(Date.now() + KEY_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  return key;
}

/**
 * Count a user's currently-usable agent keys: not revoked, and either no expiry
 * or an expiry still in the future. This is what the self-serve mint quota
 * checks against so one account can't accrue unbounded live keys.
 */
export async function activeAgentKeyCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(agentCredentials)
    .where(
      and(
        eq(agentCredentials.userId, userId),
        isNull(agentCredentials.revokedAt),
        or(
          isNull(agentCredentials.expiresAt),
          gt(agentCredentials.expiresAt, new Date()),
        ),
      ),
    );
  return row?.n ?? 0;
}

/** Revoke an agent credential (idempotent). */
export async function revokeAgentKey(credentialId: string): Promise<void> {
  await db
    .update(agentCredentials)
    .set({ revokedAt: new Date() })
    .where(eq(agentCredentials.id, credentialId));
}

export interface AgentAuth {
  userId: string;
  roles: string[];
  address: string | null;
  credentialId: string;
}

/** Resolve a presented bearer key to its agent, or null. Touches lastUsedAt. */
export async function verifyAgentKey(
  presented: string | null | undefined,
): Promise<AgentAuth | null> {
  if (!presented || !presented.startsWith(KEY_PREFIX)) return null;
  const row = (
    await db
      .select({ cred: agentCredentials, user: users })
      .from(agentCredentials)
      .innerJoin(users, eq(users.id, agentCredentials.userId))
      .where(eq(agentCredentials.keyHash, hashKey(presented)))
  )[0];
  if (!row) return null;
  const { cred, user } = row;
  if (cred.revokedAt) return null;
  if (cred.expiresAt && cred.expiresAt.getTime() < Date.now()) return null;
  await db
    .update(agentCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentCredentials.id, cred.id))
    .catch(() => {});
  return {
    userId: user.id,
    roles: user.roles,
    address: user.walletAddress,
    credentialId: cred.id,
  };
}

/** Extract a bearer token from an Authorization header value. */
export function bearerFrom(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1].trim() : null;
}
