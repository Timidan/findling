/**
 * Mint a fresh demo claimable listing + a pledge on it, and print its claim URL
 * (for showing the live claim page). No on-chain money — pledges are funded intent.
 *   npx tsx --env-file=.env.local scripts/demo-make-claim-link.ts
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/server/db/client";
import { createListing } from "../src/server/claimable/listings";
import { pledgeIntent, getPledgedDemand } from "../src/server/claimable/pledges";

const SEED_FINDER_EMAIL = "peertube-seed@findling.local";
const BUYER_EMAIL = "loop-buyer@findling.test";
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://findling.timidan.xyz";

async function main() {
  const finder = (
    await db.select().from(schema.users).where(eq(schema.users.email, SEED_FINDER_EMAIL))
  )[0];
  if (!finder) throw new Error("seed-finder missing — run seed-peertube first");

  const { listing, claimSecret } = await createListing(finder.id, {
    externalIdentity: "karate_kombat · peertube.uno",
    externalIdentityKind: "peertube_channel",
    externalRef: `https://peertube.uno/video-channels/demo_claim_${Date.now()}`,
    title: "Senryoku Taijutsu — the perfect counter, slowed down",
    sourceLicenceLabel: "CC BY-SA",
  });
  console.log("CLAIM URL:", `${BASE}/claim/${claimSecret}`);

  const buyer = (
    await db.select().from(schema.users).where(eq(schema.users.email, BUYER_EMAIL))
  )[0];
  if (buyer) {
    const grant = (
      await db
        .select()
        .from(schema.buyerSessionGrants)
        .where(
          and(
            eq(schema.buyerSessionGrants.buyerId, buyer.id),
            eq(schema.buyerSessionGrants.status, "active"),
          ),
        )
    )[0];
    if (grant) {
      await pledgeIntent({
        buyerId: buyer.id,
        listingId: listing.id,
        sessionGrantId: grant.id,
        budgetMicroUsdc: 250_000,
      });
      console.log("pledged 0.25 USDC from the buyer's active grant");
    } else {
      console.log("(no active buyer grant — claim page will show 0 demand)");
    }
  }
  console.log("demand:", await getPledgedDemand(listing.id));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
