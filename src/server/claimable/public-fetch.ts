import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_BYTES = 256 * 1024;
// The runtime's built-in fetch, captured before anything can override it. When
// the live global fetch still equals this baseline we route through the
// IP-pinned https path; a test that swaps in its own global fetch is honored
// verbatim so injected transports keep working.
const BUILTIN_FETCH: typeof fetch = fetch;
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
  const addresses = await assertSafePublicHttpsUrl(url, deps.lookup);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    // Pin the connection to an address we already validated. An injected or
    // overridden fetch keeps the plain path; the real network path resolves
    // once, validates, then dials that exact IP so undici can't re-resolve
    // the hostname to an internal address between check and connect
    // (DNS-rebinding TOCTOU).
    const overrideFetch =
      deps.fetch ?? (fetch === BUILTIN_FETCH ? undefined : fetch);
    const res = overrideFetch
      ? await overrideFetch(url.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: deps.headers ?? { accept: "application/json" },
        })
      : await pinnedHttpsFetch(url, addresses, {
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

type PinnedFetchOptions = {
  signal: AbortSignal;
  headers: HeadersInit;
};

// Perform a real HTTPS GET against a pre-validated IP while presenting the
// original hostname for the Host header and TLS SNI/servername. Redirects are
// not followed (matching the caller's `redirect: "manual"` contract): a 3xx
// yields a non-ok Response the caller rejects, so a redirect to an internal
// URL is never dialed.
async function pinnedHttpsFetch(
  url: URL,
  addresses: LookupRecord[],
  options: PinnedFetchOptions,
): Promise<Response> {
  const hostname = normalizedHostname(url.hostname);
  // Only ever hand the socket an address that already passed the blocklist.
  const pinned = addresses.find((record) => !isBlockedIp(record.address));
  if (!pinned) throw new Error("blocked_public_ip");

  const { status, headers, body } = await new Promise<{
    status: number;
    headers: Headers;
    body: Buffer;
  }>((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: "https:",
        hostname,
        // Honor a non-default port from the URL; default to 443 otherwise.
        port: url.port ? Number(url.port) : 443,
        servername: hostname,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        // Force the connection onto the validated address instead of letting
        // Node re-resolve the hostname at connect time (DNS-rebinding TOCTOU).
        lookup: (_host, opts, cb) => {
          if (opts.all) {
            cb(null, [{ address: pinned.address, family: pinned.family }]);
          } else {
            cb(null, pinned.address, pinned.family);
          }
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: nodeHeadersToWeb(res.headers),
            body: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    const onAbort = () => req.destroy(new Error("public_fetch_aborted"));
    if (options.signal.aborted) onAbort();
    else options.signal.addEventListener("abort", onAbort, { once: true });
    new Headers(options.headers).forEach((value, key) =>
      req.setHeader(key, value),
    );
    // Preserve the original Host header for name-based virtual hosts even
    // though the socket is dialed to the pinned IP.
    req.setHeader("host", url.host);
    req.end();
  });

  // The Web Response constructor rejects out-of-range statuses and forbids a
  // body on null-body statuses (204/205/304). Normalize both so the caller's
  // `!res.ok` check drives the outcome instead of a constructor throw.
  if (status < 200 || status > 599) throw new Error("public_fetch_not_ok");
  const nullBody = status === 204 || status === 205 || status === 304;
  // Copy into a fresh ArrayBuffer-backed view so the body is a valid BodyInit.
  return new Response(nullBody ? null : new Uint8Array(body), {
    status,
    headers,
  });
}

function nodeHeadersToWeb(
  headers: Record<string, string | string[] | undefined>,
): Headers {
  const web = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) web.append(key, item);
    } else {
      web.set(key, value);
    }
  }
  return web;
}

export async function assertSafePublicHttpsUrl(
  url: URL,
  lookup: LookupFn | undefined,
): Promise<LookupRecord[]> {
  if (url.protocol !== "https:") throw new Error("public_url_not_https");
  const hostname = normalizedHostname(url.hostname);
  if (isBlockedHostname(hostname)) throw new Error("blocked_public_hostname");

  const records = await (lookup ?? defaultLookup)(hostname);
  const addresses = Array.isArray(records) ? records : [records];
  if (addresses.length === 0) throw new Error("public_dns_empty");
  // Validate EVERY resolved address. A single private/loopback/link-local
  // answer poisons the whole set — otherwise a rebind could slip an internal
  // IP alongside a public decoy.
  if (addresses.some((record) => isBlockedIp(record.address))) {
    throw new Error("blocked_public_ip");
  }
  return addresses;
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
