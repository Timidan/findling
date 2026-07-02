/**
 * Verify the HUMAN browser-checkout x402 path end-to-end on Arc testnet WITHOUT a
 * browser. It drives the EXACT `src/lib/x402-browser.ts:purchaseMomentLicense` — the
 * same hand-built EIP-3009 typed-data + `@x402/core/http` header the browser sends —
 * but signs with a local viem account instead of an injected wallet. If this settles,
 * the only thing the real browser changes is WHERE `signTypedData` runs.
 *
 *   npx tsx --env-file=.env.local scripts/verify-human-checkout.ts [momentId]
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { privateKeyToAccount } from "viem/accounts";
import type { WalletClient } from "viem";
import * as schema from "../src/server/db/schema";
import { purchaseMomentLicense } from "../src/lib/x402-browser";

const BUYER_EMAIL = "human-checkout@findling.test";

async function main() {
  const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  const AGENT_ADDR = process.env.AGENT_ADDRESS!;
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://findling.timidan.xyz";
  if (!AGENT_KEY || !AGENT_ADDR) throw new Error("AGENT_PRIVATE_KEY/ADDRESS not set");

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  let momentId = process.argv[2];
  if (!momentId) {
    const m = (
      await db
        .select()
        .from(schema.moments)
        .where(eq(schema.moments.status, "published"))
        .limit(1)
    )[0];
    if (!m) throw new Error("no published moment to license");
    momentId = m.id;
  }
  const moment = (
    await db.select().from(schema.moments).where(eq(schema.moments.id, momentId))
  )[0];
  if (!moment) throw new Error(`moment ${momentId} not found`);
  const price = moment.priceMicroUsdc;
  console.log(`licensing "${moment.title}" — ${price} micro-USDC ($${moment.priceUsdSnapshot})`);

  // Human buyer + a fresh grant; the wallet (AGENT addr here) is the session key.
  let buyer = (
    await db.select().from(schema.users).where(eq(schema.users.email, BUYER_EMAIL))
  )[0];
  if (!buyer) {
    [buyer] = await db
      .insert(schema.users)
      .values({ email: BUYER_EMAIL, displayName: "Human Checkout", roles: ["buyer"] })
      .returning();
  } else {
    await db
      .update(schema.buyerSessionGrants)
      .set({ status: "exhausted" })
      .where(eq(schema.buyerSessionGrants.buyerId, buyer.id));
  }
  const cap = price * 5;
  const [grant] = await db
    .insert(schema.buyerSessionGrants)
    .values({
      buyerId: buyer.id,
      walletAddress: AGENT_ADDR,
      sessionKeyAddress: AGENT_ADDR,
      totalCapMicroUsdc: cap,
      remainingCapMicroUsdc: cap,
      status: "active",
    })
    .returning();

  // Ensure the wallet has USDC in Gateway (the "fund-once" deposit).
  const gw = new GatewayClient({ chain: "arcTestnet", privateKey: AGENT_KEY });
  const bal = await gw.getBalances();
  console.log(`gateway balance: ${bal.gateway.formattedAvailable} USDC`);
  if (Number(bal.gateway.available) < price) {
    console.log("depositing 0.5 USDC into Gateway…");
    await gw.deposit("0.5");
  }

  // Pay via the BROWSER client function, signing with a local viem account.
  const account = privateKeyToAccount(AGENT_KEY);
  // The browser passes an injected wallet whose signTypedData signs in MetaMask. Here
  // we sign locally with the same account — identical EIP-712 output, no RPC needed.
  const walletClient = {
    signTypedData: (args: Record<string, unknown>) => {
      const { account: _ignored, ...rest } = args;
      return account.signTypedData(rest as never);
    },
  } as unknown as WalletClient;
  console.log("paying the x402 unlock via purchaseMomentLicense (browser code path)…");
  const unlock = await purchaseMomentLicense({
    momentId,
    grantId: grant.id,
    walletClient,
    account: account.address,
    baseUrl: BASE,
  });
  console.log(
    `✓ unlock: receipt ${unlock.receiptCode} · ref ${unlock.paymentReference} · split ${JSON.stringify(unlock.split)}`,
  );

  const purchase = (
    await db
      .select()
      .from(schema.purchases)
      .where(eq(schema.purchases.paymentReference, unlock.paymentReference))
  )[0];
  const splitSum =
    unlock.split.creatorMicroUsdc +
    unlock.split.finderMicroUsdc +
    unlock.split.platformMicroUsdc;
  const ok =
    !!purchase &&
    purchase.status === "settled" &&
    purchase.provider === "gateway_x402" &&
    purchase.sessionGrantId === grant.id &&
    purchase.buyerId === buyer.id &&
    splitSum === price;

  console.log(
    ok
      ? `\n✅ REAL Arc x402 HUMAN checkout settled — purchase ${purchase.id} · split sums to ${splitSum}/${price}`
      : `\n❌ settlement not verified (purchase=${purchase?.status}, splitSum=${splitSum}/${price})`,
  );
  await sql.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("\nVERIFY FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
