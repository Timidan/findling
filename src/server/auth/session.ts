/**
 * Human session — a stateless, HMAC-signed cookie (no JWT dependency). The
 * payload is `base64url(json).base64url(hmac-sha256)`; tampering or expiry makes
 * it invalid. Identity is the user's id + wallet address. Set only from route
 * handlers / server actions; read anywhere.
 */
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "./secret";

const COOKIE = "findling_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface Session {
  uid: string;
  addr: string;
  iat: number;
  exp: number;
}

function signPart(b64Body: string): string {
  return createHmac("sha256", authSecret()).update(b64Body).digest("base64url");
}

export function encodeSession(payload: Session): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signPart(body)}`;
}

export function decodeSession(token: string | undefined): Session | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signPart(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as Session;
    if (!payload.uid || !payload.addr || typeof payload.exp !== "number") {
      return null;
    }
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSession(uid: string, addr: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const token = encodeSession({
    uid,
    addr: addr.toLowerCase(),
    iat: now,
    exp: now + MAX_AGE_SECONDS,
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE)?.value);
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
