/**
 * Builds the canonical text we embed for a moment, plus its content hash.
 * The hash drives idempotent re-embedding: unchanged text → unchanged hash →
 * skip the (paid) embed call. Pure + deterministic so it is unit-testable.
 */
import { createHash } from "node:crypto";

export interface MomentSourceTextInput {
  title: string;
  description?: string | null;
  usageType?: string | null;
  /** Finder-supplied curation signal — tags + captions + use-case notes. */
  tags?: string[];
  captions?: (string | null | undefined)[];
}

export interface MomentSourceText {
  text: string;
  hash: string;
}

export function buildMomentSourceText(
  input: MomentSourceTextInput,
): MomentSourceText {
  const parts: string[] = [];
  if (input.title) parts.push(input.title.trim());
  if (input.description) parts.push(input.description.trim());
  if (input.usageType) parts.push(`usage: ${input.usageType}`);
  for (const tag of input.tags ?? []) {
    const t = tag.trim();
    if (t) parts.push(`#${t}`);
  }
  for (const caption of input.captions ?? []) {
    const c = caption?.trim();
    if (c) parts.push(c);
  }
  const text = parts.join("\n");
  const hash = createHash("sha256").update(text).digest("hex");
  return { text, hash };
}
