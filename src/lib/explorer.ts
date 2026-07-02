/**
 * Arc testnet block-explorer links (Blockscout, https://testnet.arcscan.app).
 *
 * On Arc, USDC is the chain's NATIVE currency (chain id 5042002), so payouts and
 * settlements are visible as ordinary value transfers on the explorer — a tx hash
 * resolves to a real, verifiable on-chain event. This is the single source of
 * truth for every "view on Arc" affordance, so the base URL is verified in one
 * place rather than hardcoded per page.
 */
export const ARC_EXPLORER_BASE = "https://testnet.arcscan.app";
export const ARC_NETWORK_LABEL = "Arc Testnet";

/** Deep link to a transaction on the Arc testnet explorer. */
export function arcTxUrl(hash: string): string {
  return `${ARC_EXPLORER_BASE}/tx/${encodeURIComponent(hash)}`;
}

/** Deep link to an address (its balance + tx history) on the Arc testnet explorer. */
export function arcAddressUrl(address: string): string {
  return `${ARC_EXPLORER_BASE}/address/${encodeURIComponent(address)}`;
}

/** Middle-truncate a hash/address for display: `0x1234…cdef`. */
export function shortHex(value: string, lead = 6, tail = 4): string {
  return value.length > lead + tail + 1
    ? `${value.slice(0, lead)}...${value.slice(-tail)}`
    : value;
}

/** Display form for a (possibly missing) wallet address. */
export function shortAddress(a: string | null | undefined): string {
  return a ? shortHex(a) : "Not available";
}
