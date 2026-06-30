/**
 * Authenticated identity for routes and server components.
 *
 *  - Humans authenticate with a wallet (SIWE) → an HMAC-signed session cookie.
 *  - Agents authenticate with a wallet-proven bearer key on the agent surface.
 *
 * `getCurrentUserId`/`requireUserId` keep their original signatures so existing
 * creator/upload callers keep working — the dev stub is gone.
 */
import { getSession } from "./session";
import {
  verifyAgentKey,
  bearerFrom,
  type AgentAuth,
} from "./agent-credential";

export class UnauthenticatedError extends Error {
  constructor() {
    super("UNAUTHENTICATED");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The human session user id (browser cookie), or null. */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.uid ?? null;
}

export interface SessionUser {
  id: string;
  address: string | null;
  displayName: string | null;
}

/**
 * The signed-in human, shaped for the ConnectWallet button, straight from the
 * session cookie (no DB hit). Server components on DYNAMIC routes pass this as
 * `initialUser` so the wallet button hydrates already-connected — no flash of a
 * disconnected state on refresh/navigation. Do NOT call this on cached routes:
 * it reads cookies (forcing the route dynamic) and would bake one user's state
 * into shared HTML.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  return { id: session.uid, address: session.addr, displayName: null };
}

export async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) throw new UnauthenticatedError();
  return userId;
}

export interface Actor {
  userId: string;
  via: "session" | "agent";
  roles: string[];
  address: string | null;
}

/** Headers-bearing object (NextRequest or Request) for actor resolution. */
type HasHeaders = { headers: { get(name: string): string | null } };

/** Agent-surface auth: a wallet-proven bearer key only. */
export async function getAgentAuth(req: HasHeaders): Promise<AgentAuth | null> {
  return verifyAgentKey(bearerFrom(req.headers.get("authorization")));
}

/**
 * Resolve the acting identity on a route that accepts EITHER an agent bearer key
 * OR a human session. The agent key wins if present.
 */
export async function getActor(req: HasHeaders): Promise<Actor | null> {
  const agent = await getAgentAuth(req);
  if (agent) {
    return {
      userId: agent.userId,
      via: "agent",
      roles: agent.roles,
      address: agent.address,
    };
  }
  const session = await getSession();
  if (session) {
    return { userId: session.uid, via: "session", roles: [], address: session.addr };
  }
  return null;
}

export async function requireActor(req: HasHeaders): Promise<Actor> {
  const actor = await getActor(req);
  if (!actor) throw new UnauthenticatedError();
  return actor;
}
