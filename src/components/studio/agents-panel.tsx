"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  CaretDown,
  Key,
  Plus,
  Trash,
  Copy,
  CheckCircle,
  WarningCircle,
  CircleNotch,
  Robot,
  Warning,
  X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatDate, formatMicroUsdc } from "@/lib/format";
import { GATEWAY_BALANCE_UPDATED_EVENT } from "@/lib/gateway-events";

export type CredRow = {
  id: string;
  label: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type GrantRow = {
  id: string;
  sessionKeyAddress: string;
  chain: string;
  totalCapMicroUsdc: number;
  remainingCapMicroUsdc: number;
  perPurchaseCapMicroUsdc: number | null;
  allowedUsageTypes: string[] | null;
  expiresAt: string | null;
  status: string;
  createdAt: string;
};

const USAGE_TYPES = ["video_embed", "newsletter", "social_post", "internal_reference"] as const;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const MICRO_USDC = BigInt(1_000_000);
const PERCENT_HELPERS = [
  { percent: 25, label: "25%" },
  { percent: 50, label: "50%" },
  { percent: 75, label: "75%" },
  { percent: 100, label: "100%" },
] as const;

function microToUsdcInput(value: bigint): string {
  const whole = value / MICRO_USDC;
  const fraction = (value % MICRO_USDC).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function percentOfMicroUsdc(value: bigint, percent: number): string {
  return microToUsdcInput((value * BigInt(percent)) / BigInt(100));
}

function parseMicroUsdcString(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

async function fetchGatewayAvailableMicroUsdc(address: string): Promise<bigint> {
  const res = await fetch(
    `/api/payments/gateway/balances?address=${encodeURIComponent(address)}`,
    { credentials: "same-origin" },
  );
  const body = (await res.json()) as { availableMicroUsdc?: string };
  if (!res.ok) throw new Error("gateway_balance_unavailable");
  const micro = parseMicroUsdcString(body.availableMicroUsdc);
  if (micro == null) throw new Error("gateway_balance_unavailable");
  return micro;
}

function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard blocked (e.g. non-HTTPS / permission) — the value stays
           visible in the UI so it can still be selected and copied manually */
      });
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy"
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-secondary",
        copied ? "text-sage" : "text-muted-foreground",
        className,
      )}
    >
      {copied ? <CheckCircle weight="fill" className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-medium">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function CollapsibleRows({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-secondary/30"
      >
        <span className="text-[0.7rem] uppercase tracking-[0.15em] text-muted-foreground">
          {label} ({count})
        </span>
        <CaretDown
          weight="bold"
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  );
}

/* ── Readiness badge ────────────────────────────────────────────────────────── */

function ReadinessBadge({
  hasActiveKey,
  hasActiveGrant,
}: {
  hasActiveKey: boolean;
  hasActiveGrant: boolean;
}) {
  const ready = hasActiveKey && hasActiveGrant;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4",
        ready ? "border-sage/30 bg-sage/5" : "border-border bg-card",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
          ready ? "bg-sage/15 text-sage" : "bg-secondary text-muted-foreground",
        )}
      >
        <Robot weight="duotone" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium", ready ? "text-sage" : "text-foreground")}>
          {ready ? "Agent ready" : "Setup incomplete"}
        </p>
        {ready ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Agent spends your wallet&apos;s Gateway balance. Grants cap how much it
            can use.
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {!hasActiveKey && (
              <li className="flex items-center gap-1">
                <WarningCircle weight="fill" className="size-3.5 text-amber-500" />
                Create a key below
              </li>
            )}
            {!hasActiveGrant && (
              <li className="flex items-center gap-1">
                <WarningCircle weight="fill" className="size-3.5 text-amber-500" />
                Create a grant to set spending limits
              </li>
            )}
          </ul>
        )}
      </div>
      {ready && <CheckCircle weight="fill" className="mt-0.5 size-5 shrink-0 text-sage" />}
    </div>
  );
}

/* ── API Keys ──────────────────────────────────────────────────────────────── */

function KeysSection({
  creds,
  setCreds,
}: {
  creds: CredRow[];
  setCreds: React.Dispatch<React.SetStateAction<CredRow[]>>;
}) {
  const [label, setLabel] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function issue() {
    setIssuing(true);
    setIssueError(null);
    setNewKey(null);
    try {
      const res = await fetch("/api/agent/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
      if (!res.ok) {
        setIssueError(data.error ?? "Failed to issue key.");
        return;
      }
      setNewKey(data.key ?? null);
      setLabel("");
      const listRes = await fetch("/api/agent/keys");
      const listData = (await listRes.json().catch(() => ({}))) as { credentials?: CredRow[] };
      if (listData.credentials) setCreds(listData.credentials);
    } catch {
      setIssueError("Network error.");
    } finally {
      setIssuing(false);
    }
  }

  async function revoke(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/agent/keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCreds((prev) =>
          prev.map((c) => (c.id === id ? { ...c, revokedAt: new Date().toISOString() } : c)),
        );
      }
    } finally {
      setRevoking(null);
    }
  }

  const active = creds.filter((c) => !c.revokedAt);
  const revoked = creds.filter((c) => !!c.revokedAt);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <SectionHeader
        title="Agent keys"
        desc="Issue a key for REST and MCP. Store it when shown."
      />

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Label (e.g. my-buyer-agent)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !issuing && issue()}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sage/40"
        />
        <button
          type="button"
          onClick={issue}
          disabled={issuing}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {issuing ? (
            <CircleNotch weight="bold" className="size-4 animate-spin" />
          ) : (
            <Plus weight="bold" className="size-4" />
          )}
          Create key
        </button>
      </div>
      {issueError && (
        <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
          <WarningCircle weight="fill" className="size-3.5" />
          {issueError}
        </p>
      )}

      {newKey && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Warning weight="fill" className="size-4 shrink-0 text-amber-500" />
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Shown once. Copy it now. You cannot retrieve it again.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{newKey}</code>
            <CopyButton value={newKey} className="shrink-0" />
          </div>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="mt-2 flex items-center gap-1 text-[0.7rem] text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" /> Dismiss
          </button>
        </div>
      )}

      {active.length > 0 && (
        <CollapsibleRows label="Active" count={active.length} defaultOpen={false}>
          {active.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
            >
              <Key weight="duotone" className="size-4 shrink-0 text-sage" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.label ?? "Unlabeled"}</p>
                <p className="text-[0.7rem] text-muted-foreground">
                  Issued {formatDate(c.createdAt)}
                  {c.lastUsedAt && ` · last used ${formatDate(c.lastUsedAt)}`}
                  {c.expiresAt && ` · expires ${formatDate(c.expiresAt)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(c.id)}
                disabled={revoking === c.id}
                title="Revoke"
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                {revoking === c.id ? (
                  <CircleNotch weight="bold" className="size-3.5 animate-spin" />
                ) : (
                  <Trash className="size-3.5" />
                )}
                Revoke
              </button>
            </div>
          ))}
        </CollapsibleRows>
      )}

      {revoked.length > 0 && (
        <p className="mt-3 text-[0.7rem] text-muted-foreground">
          {revoked.length} revoked key{revoked.length !== 1 ? "s" : ""} not shown.
        </p>
      )}

      {creds.length === 0 && !newKey && (
        <p className="mt-4 text-sm text-muted-foreground">No keys yet. Create one above.</p>
      )}
    </div>
  );
}

/* ── Session Grants ─────────────────────────────────────────────────────────── */

const GRANT_DEFAULTS = {
  sessionKeyAddress: "",
  totalCapUsdc: "",
  perPurchaseCapUsdc: "",
  expiresInDays: "",
  allowedUsageTypes: [] as string[],
};

function GrantsSection({
  grants,
  setGrants,
  walletAddress,
}: {
  grants: GrantRow[];
  setGrants: React.Dispatch<React.SetStateAction<GrantRow[]>>;
  walletAddress?: string | null;
}) {
  const [form, setForm] = useState(GRANT_DEFAULTS);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [gatewayBalance, setGatewayBalance] = useState<bigint | null>(null);
  const [gatewayBalanceRefresh, setGatewayBalanceRefresh] = useState(0);
  const sessionWalletAddress = form.sessionKeyAddress.trim();
  const gatewayBalanceAddress = ADDRESS_RE.test(sessionWalletAddress)
    ? sessionWalletAddress
    : walletAddress;

  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.resolve();
      if (!alive) return;
      if (!gatewayBalanceAddress) {
        setGatewayBalance(null);
        return;
      }
      try {
        const balance = await fetchGatewayAvailableMicroUsdc(gatewayBalanceAddress);
        if (alive) setGatewayBalance(balance);
      } catch {
        if (alive) setGatewayBalance(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [gatewayBalanceAddress, gatewayBalanceRefresh]);

  useEffect(() => {
    function refreshGatewayBalance() {
      setGatewayBalanceRefresh((n) => n + 1);
    }
    window.addEventListener(GATEWAY_BALANCE_UPDATED_EVENT, refreshGatewayBalance);
    return () => {
      window.removeEventListener(GATEWAY_BALANCE_UPDATED_EVENT, refreshGatewayBalance);
    };
  }, []);

  function toggleUsage(u: string) {
    setForm((f) => ({
      ...f,
      allowedUsageTypes: f.allowedUsageTypes.includes(u)
        ? f.allowedUsageTypes.filter((x) => x !== u)
        : [...f.allowedUsageTypes, u],
    }));
  }

  async function create() {
    setCreating(true);
    setCreateError(null);
    const totalMicro = Math.round(parseFloat(form.totalCapUsdc) * 1_000_000);
    const perMicro = form.perPurchaseCapUsdc
      ? Math.round(parseFloat(form.perPurchaseCapUsdc) * 1_000_000)
      : undefined;
    const expiresInSeconds = form.expiresInDays
      ? Math.round(parseFloat(form.expiresInDays) * 86400)
      : undefined;
    try {
      const res = await fetch("/api/agent/session-grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionKeyAddress: form.sessionKeyAddress,
          totalCapMicroUsdc: totalMicro,
          perPurchaseCapMicroUsdc: perMicro ?? null,
          expiresInSeconds: expiresInSeconds ?? null,
          allowedUsageTypes: form.allowedUsageTypes.length ? form.allowedUsageTypes : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        grant?: GrantRow;
        error?: string;
        reason?: string;
      };
      if (!res.ok) {
        setCreateError(data.reason ?? data.error ?? "Failed to create grant.");
        return;
      }
      if (data.grant) setGrants((prev) => [data.grant as GrantRow, ...prev]);
      setForm(GRANT_DEFAULTS);
    } catch {
      setCreateError("Network error.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/agent/session-grants/${id}`, { method: "DELETE" });
      if (res.ok) {
        setGrants((prev) => prev.map((g) => (g.id === id ? { ...g, status: "revoked" } : g)));
      }
    } finally {
      setRevoking(null);
    }
  }

  const active = grants.filter((g) => g.status === "active" || g.status === "exhausted");
  const inactive = grants.filter((g) => g.status !== "active" && g.status !== "exhausted");

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sage/40";
  const labelCls = "block text-xs text-muted-foreground mb-1";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <SectionHeader
        title="Spending grants"
        desc="Agent spends the session wallet's Gateway balance. Set the most it can use."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Session wallet address*</label>
          <input
            type="text"
            placeholder="0x..."
            value={form.sessionKeyAddress}
            onChange={(e) => setForm((f) => ({ ...f, sessionKeyAddress: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Total cap (USDC)*</label>
          <input
            type="number"
            placeholder="5.00"
            min="0.000001"
            step="0.01"
            value={form.totalCapUsdc}
            onChange={(e) => setForm((f) => ({ ...f, totalCapUsdc: e.target.value }))}
            className={inputCls}
          />
          {gatewayBalance != null && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[0.65rem] text-muted-foreground">
                From Gateway balance:
              </span>
              {PERCENT_HELPERS.map(({ percent, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      totalCapUsdc: percentOfMicroUsdc(gatewayBalance, percent),
                    }))
                  }
                  className="rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>Per-clip cap (USDC, optional)</label>
          <input
            type="number"
            placeholder="0.10"
            min="0.000001"
            step="0.01"
            value={form.perPurchaseCapUsdc}
            onChange={(e) => setForm((f) => ({ ...f, perPurchaseCapUsdc: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Expires in (days, optional)</label>
          <input
            type="number"
            placeholder="30"
            min="1"
            step="1"
            value={form.expiresInDays}
            onChange={(e) => setForm((f) => ({ ...f, expiresInDays: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Allowed usage types (optional). Leave empty to allow all.</label>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {USAGE_TYPES.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => toggleUsage(u)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.7rem] font-medium transition-colors",
                  form.allowedUsageTypes.includes(u)
                    ? "bg-sage/15 text-sage"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                )}
              >
                {u.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={create}
          disabled={creating || !form.sessionKeyAddress || !form.totalCapUsdc}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {creating ? (
            <CircleNotch weight="bold" className="size-4 animate-spin" />
          ) : (
            <Plus weight="bold" className="size-4" />
          )}
          Create grant
        </button>
        {createError && (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <WarningCircle weight="fill" className="size-3.5" />
            {createError}
          </span>
        )}
      </div>

      {active.length > 0 && (
        <CollapsibleRows label="Active" count={active.length} defaultOpen={false}>
          {active.map((g) => (
            <div
              key={g.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="break-all font-mono text-xs">
                  {g.sessionKeyAddress.slice(0, 8)}...{g.sessionKeyAddress.slice(-6)}
                </p>
                <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                  {formatMicroUsdc(g.remainingCapMicroUsdc)} /{" "}
                  {formatMicroUsdc(g.totalCapMicroUsdc)} USDC remaining
                  {g.perPurchaseCapMicroUsdc != null &&
                    ` · <= ${formatMicroUsdc(g.perPurchaseCapMicroUsdc)} / purchase`}
                  {g.allowedUsageTypes?.length
                    ? ` · ${g.allowedUsageTypes.join(", ")}`
                    : ""}
                  {g.expiresAt ? ` · expires ${formatDate(g.expiresAt)}` : ""}
                  {` · ${g.status}`}
                </p>
              </div>
              {g.status === "active" && (
                <button
                  type="button"
                  onClick={() => revoke(g.id)}
                  disabled={revoking === g.id}
                  className="inline-flex shrink-0 items-center gap-1 self-start rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 sm:self-center"
                >
                  {revoking === g.id ? (
                    <CircleNotch weight="bold" className="size-3.5 animate-spin" />
                  ) : (
                    <Trash className="size-3.5" />
                  )}
                  Revoke
                </button>
              )}
            </div>
          ))}
        </CollapsibleRows>
      )}

      {inactive.length > 0 && (
        <p className="mt-3 text-[0.7rem] text-muted-foreground">
          {inactive.length} inactive grant{inactive.length !== 1 ? "s" : ""} (revoked/exhausted)
          not shown.
        </p>
      )}

      {grants.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No grants yet. Create one above.</p>
      )}
    </div>
  );
}

/* ── Connect (REST + hosted MCP) ────────────────────────────────────────────── */

function CodeBlock({ value }: { value: string }) {
  return (
    <div className="relative rounded-xl border border-border bg-background p-4">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-foreground">
        {value}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={value} />
      </div>
    </div>
  );
}

const MCP_TOOLS = [
  "search_moments",
  "get_moment",
  "submit_curation",
  "get_earnings",
  "request_withdraw",
  "get_agent_run",
];

const CLIENT_TABS = [
  { id: "cursor", label: "Cursor" },
  { id: "claude", label: "Claude Code" },
  { id: "vscode", label: "VS Code" },
  { id: "other", label: "Other" },
] as const;
type ClientId = (typeof CLIENT_TABS)[number]["id"];

function ConnectSection({ origin }: { origin: string }) {
  const [client, setClient] = useState<ClientId>("cursor");
  const url = `${origin}/api/mcp`;
  const skillUrl = `${origin}/skill.md`;
  const KEY = "Bearer <fdl_agent_...>"; // user pastes the key they issued above

  // Each client wants a structurally DIFFERENT config — a wrong shape silently
  // fails — so we template the exact one per selected client.
  const configs: Record<ClientId, { file: string; snippet: string; note: string }> = {
    cursor: {
      file: "~/.cursor/mcp.json (global)   ·   .cursor/mcp.json (this project)",
      snippet: JSON.stringify(
        { mcpServers: { findling: { url, headers: { Authorization: KEY } } } },
        null,
        2,
      ),
      note: "Swap the placeholder for the key you issued above.",
    },
    claude: {
      file: "Run this in your terminal, then use /mcp in Claude Code.",
      snippet: `claude mcp add --transport http findling ${url} \\\n  --header "Authorization: ${KEY}"`,
      note: "Adds the hosted server to Claude Code over Streamable HTTP.",
    },
    vscode: {
      file: ".vscode/mcp.json (workspace)   ·   or your user profile",
      snippet: JSON.stringify(
        {
          servers: {
            findling: { type: "http", url, headers: { Authorization: KEY } },
          },
        },
        null,
        2,
      ),
      note: 'VS Code uses the top-level "servers" key with type "http".',
    },
    other: {
      file: "Any MCP client (classic Claude Desktop, Windsurf, Zed, ...)",
      snippet: JSON.stringify(
        {
          mcpServers: {
            findling: {
              command: "npx",
              args: ["-y", "mcp-remote", url, "--header", "Authorization:${FINDLING_KEY}"],
              env: { FINDLING_KEY: KEY },
            },
          },
        },
        null,
        2,
      ),
      note: "Bridges the hosted endpoint to stdio via mcp-remote. The colon-no-space header + env form avoids a Windows quoting bug.",
    },
  };
  const cur = configs[client];

  const cursorDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=findling&config=${btoa(
    JSON.stringify({ url, headers: { Authorization: KEY } }),
  )}`;
  const curl = `curl ${url} \\\n  -H "Authorization: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <SectionHeader
          title="Connect your agent"
          desc="Add Findling to your AI client. Nothing runs locally."
        />
        <span className="mt-1 shrink-0 rounded-full bg-sage/15 px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-sage">
          hosted MCP
        </span>
      </div>

      {/* client picker */}
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-lg bg-secondary/50 p-1">
        {CLIENT_TABS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setClient(c.id)}
            aria-pressed={client === c.id}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              client === c.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="tabular mb-1.5 truncate text-[0.7rem] text-muted-foreground">{cur.file}</p>
      <CodeBlock value={cur.snippet} />
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{cur.note}</p>
        {client === "cursor" && (
          <a
            href={cursorDeeplink}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            <Plus weight="bold" className="size-3.5" /> Add to Cursor
          </a>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        6 tools:{" "}
        {MCP_TOOLS.map((t, i) => (
          <span key={t}>
            <code className="rounded bg-secondary px-1 py-0.5">{t}</code>
            {i < MCP_TOOLS.length - 1 ? " " : ""}
          </span>
        ))}
      </p>

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-[0.7rem] uppercase tracking-[0.15em] text-muted-foreground">
          Headless / REST
        </p>
        <div className="mt-2">
          <CodeBlock value={curl} />
          <p className="mt-1.5 text-xs text-muted-foreground">
            JSON-RPC over HTTP, or send the bearer header on the{" "}
            <code className="rounded bg-secondary px-1 py-0.5">/api/agent/*</code> REST routes.
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-[0.7rem] uppercase tracking-[0.15em] text-muted-foreground">
          Agent skill file
        </p>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
            {skillUrl}
          </code>
          <CopyButton value={skillUrl} className="shrink-0" />
        </div>
        <a
          href="/skill.md"
          className="mt-2 inline-flex text-xs font-medium text-foreground underline-offset-4 hover:underline"
        >
          Open /skill.md →
        </a>
      </div>
    </div>
  );
}

/* ── Root panel ─────────────────────────────────────────────────────────────── */

export function AgentsPanel({
  initialCreds,
  initialGrants,
  initialOrigin,
  walletAddress,
}: {
  initialCreds: CredRow[];
  initialGrants: GrantRow[];
  initialOrigin: string;
  walletAddress?: string | null;
}) {
  const [creds, setCreds] = useState(initialCreds);
  const [grants, setGrants] = useState(initialGrants);

  const hasActiveKey = creds.some((c) => !c.revokedAt);
  const hasActiveGrant = grants.some((g) => g.status === "active");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)] lg:items-start">
      <div className="space-y-4">
        <ReadinessBadge hasActiveKey={hasActiveKey} hasActiveGrant={hasActiveGrant} />
        <KeysSection creds={creds} setCreds={setCreds} />
        <GrantsSection grants={grants} setGrants={setGrants} walletAddress={walletAddress} />
      </div>
      <div className="lg:sticky lg:top-6">
        <ConnectSection origin={initialOrigin} />
      </div>
    </div>
  );
}
