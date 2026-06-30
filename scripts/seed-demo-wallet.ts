/**
 * Mint a demo keypair and bind it to the seeded "Dev Creator" (owner of the
 * snowboard moment + accrued earnings) so you can import the key into Rabby and
 * Sign-In With Ethereum into a populated studio. DEMO ONLY — throwaway testnet
 * wallet, no real funds; discard after the demo.
 *   npx tsx --env-file=.env.local scripts/seed-demo-wallet.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import * as schema from "../src/server/db/schema";

const CREATOR_EMAIL = "dev-creator@findling.local";

async function main() {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const addr = account.address.toLowerCase();

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });

  const [updated] = await db
    .update(schema.users)
    .set({ walletAddress: addr, payoutWalletAddress: account.address, updatedAt: new Date() })
    .where(eq(schema.users.email, CREATOR_EMAIL))
    .returning({ id: schema.users.id, email: schema.users.email });

  await sql.end();

  if (!updated) {
    console.error(`no user ${CREATOR_EMAIL} — nothing updated`);
    process.exit(1);
  }

  console.log("\n=== DEMO WALLET (import this into Rabby) ===");
  console.log("private key :", pk);
  console.log("address     :", account.address);
  console.log(`bound to    : ${updated.email} (${updated.id})`);
  console.log("\nImport the private key into Rabby, open the site, click Connect");
  console.log("wallet, sign the SIWE message — you'll land in Dev Creator's studio");
  console.log("(snowboard moment + ~0.080 USDC earned + a payout wallet set).");
  console.log("DEMO ONLY: throwaway testnet key, no real funds — discard after.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});
