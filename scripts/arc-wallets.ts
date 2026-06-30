/**
 * Idempotent Arc-testnet wallet setup for the demo. Generates the wallets we
 * need if they're missing, persists keys to .env.local (gitignored — secrets
 * never printed), and reports PUBLIC addresses + on-chain balances (which also
 * proves the Arc testnet RPC is reachable).
 *
 *   SELLER   — Findling platform wallet: receives gross (payTo) + runs withdraw()
 *   AGENT    — demo consumer agent (buyer): funds Gateway balance + signs pays
 *   CREATOR_PAYOUT — destination address for the creator's withdrawn share
 *
 * Fund SELLER + AGENT with Arc testnet USDC; CREATOR_PAYOUT only receives.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { GatewayClient } from "@circle-fin/x402-batching/client";

const ENV = ".env.local";
const HEX_KEY = /^0x[0-9a-fA-F]{64}$/;

function readEnv(): string {
  return readFileSync(ENV, "utf8");
}

function getVal(text: string, key: string): string {
  const m = text.match(new RegExp(`^${key}="?([^"\\n#]*)"?`, "m"));
  return m?.[1]?.trim() ?? "";
}

/** Replace KEY="..." in place, or append it under the Arc section. */
function setVal(text: string, key: string, val: string): string {
  const line = `${key}="${val}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return text.replace(
    /(GATEWAY_FACILITATOR_URL="[^"]*")/,
    `$1\n${line}`,
  );
}

function ensureWallet(
  text: string,
  keyVar: string,
  addrVar: string,
): { text: string; address: string; privateKey: string; created: boolean } {
  let pk = getVal(text, keyVar);
  let created = false;
  if (!HEX_KEY.test(pk)) {
    pk = generatePrivateKey();
    created = true;
  }
  const address = privateKeyToAccount(pk as `0x${string}`).address;
  let next = setVal(text, keyVar, pk);
  next = setVal(next, addrVar, address);
  return { text: next, address, privateKey: pk, created };
}

async function main() {
  let text = readEnv();

  const seller = ensureWallet(text, "SELLER_PRIVATE_KEY", "SELLER_ADDRESS");
  text = seller.text;
  const agent = ensureWallet(text, "AGENT_PRIVATE_KEY", "AGENT_ADDRESS");
  text = agent.text;
  const creator = ensureWallet(
    text,
    "CREATOR_PAYOUT_PRIVATE_KEY",
    "CREATOR_PAYOUT_ADDRESS",
  );
  text = creator.text;

  writeFileSync(ENV, text);

  console.log("Arc testnet demo wallets (fund SELLER + AGENT with testnet USDC):\n");
  console.log(`  SELLER         ${seller.address}${seller.created ? "  (generated)" : ""}`);
  console.log(`  AGENT (buyer)  ${agent.address}${agent.created ? "  (generated)" : ""}`);
  console.log(`  CREATOR_PAYOUT ${creator.address}${creator.created ? "  (generated)" : ""}`);
  console.log("\nchecking on-chain balances (proves Arc RPC reachable)...\n");

  for (const [name, pk] of [
    ["SELLER", seller.privateKey],
    ["AGENT", agent.privateKey],
  ] as const) {
    try {
      const gw = new GatewayClient({ chain: "arcTestnet", privateKey: pk as `0x${string}` });
      const balances = await gw.getBalances();
      console.log(`  ${name}:`, JSON.stringify(balances, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    } catch (e) {
      console.log(`  ${name}: balance check failed —`, e instanceof Error ? e.message : e);
    }
  }

  console.log("\nWALLETS READY ✅  (keys saved to .env.local; fund the addresses above)");
}

main().catch((e) => {
  console.error("\nWALLET SETUP FAILED ❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
