/**
 * Top up the SELLER's Circle Gateway balance from its on-chain USDC, so creator
 * withdrawals (paid from the seller Gateway balance) have headroom.
 *   AMOUNT=1 npx tsx --env-file=.env.local scripts/deposit-seller.ts
 *
 * Mirrors the working buyer deposit in buy-moment.ts (async main(), no top-level
 * await — top-level await trips tsx's CJS transform with a TransformError).
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

const AMOUNT = process.env.AMOUNT ?? "1";

async function main() {
  const key = process.env.SELLER_PRIVATE_KEY as `0x${string}`;
  if (!key) throw new Error("SELLER_PRIVATE_KEY not set");

  const gw = new GatewayClient({ chain: "arcTestnet", privateKey: key });

  const before = await gw.getBalances();
  console.log(
    `seller on-chain USDC: ${before.wallet.formatted} · gateway available: ${before.gateway.formattedAvailable}`,
  );

  console.log(`depositing ${AMOUNT} USDC into the seller Gateway balance…`);
  const res = await gw.deposit(AMOUNT);
  console.log(
    `deposit submitted ✓ approvalTx=${res.approvalTxHash ?? "(allowance ok)"} depositTx=${res.depositTxHash}`,
  );

  const after = await gw.getBalances();
  console.log(
    `seller gateway available now: ${after.gateway.formattedAvailable} USDC`,
  );
}

main().catch((e) => {
  console.error("SELLER DEPOSIT FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
