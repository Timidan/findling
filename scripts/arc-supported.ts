import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";

async function main() {
  const url = process.env.GATEWAY_FACILITATOR_URL || "https://gateway-api-testnet.circle.com";
  const fac = new BatchFacilitatorClient({ url });
  const supported = await fac.getSupported();
  // find the Arc testnet entry (eip155:5042002)
  const kinds = (supported as { kinds?: unknown[] }).kinds ?? [];
  console.log("facilitator:", url);
  console.log("total kinds:", kinds.length);
  const arc = (kinds as Array<Record<string, unknown>>).filter(
    (k) => String(k.network).includes("5042002"),
  );
  console.log("arc testnet kinds:", JSON.stringify(arc, null, 2));
}
main().catch((e) => { console.error("getSupported failed:", e instanceof Error ? e.message : e); process.exit(1); });
