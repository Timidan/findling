import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const FORBIDDEN = /[—–…]/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (path.includes(`${join("src", "app", "prototype")}${"/"}`)) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) return [];
    const stat = statSync(path);
    if (stat.isDirectory()) return walk(path);
    if (![...EXTENSIONS].some((ext) => path.endsWith(ext))) return [];
    return [path];
  });
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("app copy style", () => {
  it("keeps visible app copy concise and free of long dash punctuation", () => {
    const offenders = ROOTS.flatMap(walk).flatMap((path) => {
      const cleaned = stripComments(readFileSync(path, "utf8"));
      return cleaned
        .split("\n")
        .map((line, index) => ({ line, index: index + 1 }))
        .filter(({ line }) => FORBIDDEN.test(line))
        .map(({ line, index }) => `${relative(process.cwd(), path)}:${index}: ${line.trim()}`);
    });

    expect(offenders).toEqual([]);
  });
});
