/**
 * E2E proof of the per-moment price editor: as Dev Creator, PATCH each moment to
 * a varied price via the API, and check validation + owner-scoping.
 *   npx tsx --env-file=.env.local scripts/test-moment-price.ts
 */
import { createHmac } from "node:crypto";
import postgres from "postgres";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://findling.timidan.xyz";
const secret = process.env.AUTH_SESSION_SECRET!;

function session(uid: string, addr: string) {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ uid, addr: addr.toLowerCase(), iat: now, exp: now + 3600 }),
  ).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

async function patch(cookie: string, momentId: string, priceMicroUsdc: number) {
  const r = await fetch(`${BASE}/api/creator/moments/${momentId}/price`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: `findling_session=${cookie}` },
    body: JSON.stringify({ priceMicroUsdc }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const [creator] = await sql`select id, wallet_address from users where email=${"dev-creator@findling.local"} limit 1`;
  const mom = await sql`select id, title from moments where creator_id=${creator.id} order by created_at asc`;
  await sql.end();
  const cookie = session(creator.id, creator.wallet_address ?? "0x0");

  // give each demo moment a DIFFERENT price
  const prices = [50_000, 150_000, 90_000]; // $0.05, $0.15, $0.09
  const set: string[] = [];
  for (let i = 0; i < mom.length; i++) {
    const p = prices[i % prices.length];
    const res = await patch(cookie, mom[i].id, p);
    set.push(`${res.status} $${res.body?.priceUsdSnapshot} — ${mom[i].title}`);
  }
  console.log("set varied prices:");
  for (const s of set) console.log("  " + s);

  // validation + auth
  const m0 = mom[0].id;
  const neg = await patch(cookie, m0, -1);
  const huge = await patch(cookie, m0, 200_000_000);
  const frac = await patch(cookie, m0, 50.5 as unknown as number);
  const unauth = await (await fetch(`${BASE}/api/creator/moments/${m0}/price`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priceMicroUsdc: 50_000 }) })).status;
  const notFound = await patch(cookie, "00000000-0000-0000-0000-000000000000", 50_000);

  console.log("\nvalidation:");
  console.log("  negative   (want 400):", neg.status);
  console.log("  over max   (want 400):", huge.status);
  console.log("  fractional (want 400):", frac.status);
  console.log("  unauth     (want 401):", unauth);
  console.log("  not owner  (want 404):", notFound.status);

  const pass =
    set.every((s) => s.startsWith("200")) &&
    neg.status === 400 && huge.status === 400 && frac.status === 400 &&
    unauth === 401 && notFound.status === 404;
  console.log(pass ? "\n✅ per-moment pricing works (varied prices set; validation + owner-scope enforced)" : "\n❌ FAILED");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("FAILED", e instanceof Error ? e.message : e); process.exit(1); });
