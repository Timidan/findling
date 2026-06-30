import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const BLOCKED_IPV4_CIDRS: Array<[base: string, bits: number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export type LookupRecord = {
  address: string;
  family: number;
};

export type LookupFn = (
  hostname: string,
) => Promise<LookupRecord | LookupRecord[]>;

export interface FetchPublicJsonDeps {
  fetch?: typeof fetch;
  lookup?: LookupFn;
  now?: () => Date;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: HeadersInit;
}

export async function fetchPublicJson(
  url: URL,
  deps: FetchPublicJsonDeps = {},
): Promise<unknown> {
  await assertSafePublicHttpsUrl(url, deps.lookup);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const res = await (deps.fetch ?? fetch)(url.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: deps.headers ?? { accept: "application/json" },
    });
    if (!res.ok) throw new Error("public_fetch_not_ok");
    const text = await readCappedText(res, deps.maxBytes ?? DEFAULT_MAX_BYTES);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function assertSafePublicHttpsUrl(
  url: URL,
  lookup: LookupFn | undefined,
): Promise<void> {
  if (url.protocol !== "https:") throw new Error("public_url_not_https");
  const hostname = normalizedHostname(url.hostname);
  if (isBlockedHostname(hostname)) throw new Error("blocked_public_hostname");

  const records = await (lookup ?? defaultLookup)(hostname);
  const addresses = Array.isArray(records) ? records : [records];
  if (addresses.length === 0) throw new Error("public_dns_empty");
  if (addresses.some((record) => isBlockedIp(record.address))) {
    throw new Error("blocked_public_ip");
  }
}

async function defaultLookup(hostname: string): Promise<LookupRecord[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function normalizedHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function isBlockedHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  return isBlockedIp(hostname);
}

function isBlockedIp(ip: string): boolean {
  const normalized = normalizedHostname(ip);
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedIpv4) return isBlockedIp(mappedIpv4[1]);

  const kind = isIP(normalized);
  if (kind === 4) return isBlockedIpv4(normalized);
  if (kind === 6) return isBlockedIpv6(normalized);
  return false;
}

function isBlockedIpv4(ip: string): boolean {
  const value = ip
    .split(".")
    .reduce((n, part) => (n << 8) + Number.parseInt(part, 10), 0) >>> 0;
  return BLOCKED_IPV4_CIDRS.some(([base, bits]) =>
    inCidr(value, ipv4ToInt(base), bits),
  );
}

function ipv4ToInt(ip: string): number {
  return ip
    .split(".")
    .reduce((n, part) => (n << 8) + Number.parseInt(part, 10), 0) >>> 0;
}

function inCidr(value: number, base: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (base & mask);
}

function isBlockedIpv6(ip: string): boolean {
  if (ip === "::" || ip === "::1") return true;
  const first = Number.parseInt(ip.split(":").find(Boolean) ?? "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xff00) === 0xff00) return true;
  return false;
}

async function readCappedText(res: Response, maxBytes: number): Promise<string> {
  const length = res.headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    throw new Error("public_response_too_large");
  }
  if (!res.body) {
    const text = await res.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error("public_response_too_large");
    }
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) throw new Error("public_response_too_large");
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}
