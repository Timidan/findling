/**
 * Agent Surface command normalization.
 *
 * REST and MCP are Adapters over the same agent-facing Interface. Keep caller
 * input shaping here so both surfaces exercise the same command semantics.
 */
import { USAGE_TYPES, type UsageType } from "@/server/grants/grants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_SURFACES = ["feed", "overlay", "share_link", "seed"] as const;
type SourceSurface = (typeof SOURCE_SURFACES)[number];

export type CommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function boundedText(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

function usageType(v: unknown): UsageType | undefined {
  return typeof v === "string" && USAGE_TYPES.includes(v as UsageType)
    ? (v as UsageType)
    : undefined;
}

function sourceSurface(v: unknown): SourceSurface | undefined {
  return typeof v === "string" && SOURCE_SURFACES.includes(v as SourceSurface)
    ? (v as SourceSurface)
    : undefined;
}

export interface AgentSearchCommand {
  query: string;
  grantId: string | null;
  maxPriceMicroUsdc?: number;
  usageType?: UsageType;
  limit?: number;
}

export function normalizeAgentSearchCommand(
  input: unknown,
): CommandResult<AgentSearchCommand> {
  if (!isRecord(input) || typeof input.query !== "string" || input.query.trim().length === 0) {
    return { ok: false, error: "query is required", status: 400 };
  }

  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.min(Math.max(Math.trunc(input.limit), 1), 25)
      : undefined;
  const maxPriceMicroUsdc =
    typeof input.maxPriceMicroUsdc === "number" &&
    Number.isFinite(input.maxPriceMicroUsdc) &&
    input.maxPriceMicroUsdc > 0
      ? Math.trunc(input.maxPriceMicroUsdc)
      : undefined;

  return {
    ok: true,
    value: {
      query: input.query.trim().slice(0, 1000),
      grantId: typeof input.grantId === "string" ? input.grantId : null,
      maxPriceMicroUsdc,
      usageType: usageType(input.usageType),
      limit,
    },
  };
}

export interface SubmitCurationCommand {
  momentId: string;
  tags?: string[];
  caption?: string;
  useCaseNote?: string;
  relevanceText?: string;
  sourceSurface?: SourceSurface;
}

export function normalizeSubmitCurationCommand(
  input: unknown,
): CommandResult<SubmitCurationCommand> {
  if (!isRecord(input) || typeof input.momentId !== "string" || !UUID.test(input.momentId)) {
    return { ok: false, error: "valid momentId is required", status: 400 };
  }

  const tags = Array.isArray(input.tags)
    ? input.tags.slice(0, 20).map((t) => String(t).slice(0, 40))
    : undefined;

  return {
    ok: true,
    value: {
      momentId: input.momentId,
      tags,
      caption: boundedText(input.caption, 280),
      useCaseNote: boundedText(input.useCaseNote, 500),
      relevanceText: boundedText(input.relevanceText, 500),
      sourceSurface: sourceSurface(input.sourceSurface),
    },
  };
}

export interface WithdrawCommand {
  role: "creator" | "finder";
  maxFee?: string;
}

export function normalizeWithdrawCommand(input: unknown): CommandResult<WithdrawCommand> {
  if (!isRecord(input) || (input.role !== "creator" && input.role !== "finder")) {
    return { ok: false, error: "role ('creator'|'finder') is required", status: 400 };
  }
  return {
    ok: true,
    value: {
      role: input.role,
      maxFee: typeof input.maxFee === "string" ? input.maxFee : undefined,
    },
  };
}
