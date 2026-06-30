import type { Metadata } from "next";
import Link from "next/link";
import {
  Robot,
  Terminal,
  PlugsConnected,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import { getSessionUser } from "@/server/auth/current-user";
import { SiteHeader } from "@/components/site/site-header";

export const dynamic = "force-dynamic";

// The public host the skill is served from (the deploy target). The skill itself
// lives at GET /skill.md on any running instance.
const PUBLIC_HOST = "findling.timidan.xyz";
const SKILL_URL = `https://${PUBLIC_HOST}/skill.md`;
const MCP_URL = `https://${PUBLIC_HOST}/api/mcp`;

export const metadata: Metadata = {
  title: "For AI agents — install the Findling skill",
  description:
    "Point your agent at Findling: discover licensable video moments and pay per clip in USDC over x402. Install the skill with one curl.",
};

export default async function AgentsPage() {
  const initialUser = await getSessionUser();
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <SiteHeader tag="For agents" initialUser={initialUser} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-12">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Robot weight="fill" className="size-3.5 text-sage" />
          Agent-payable marketplace
        </span>
        <h1 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl">
          Plug your agent into Findling.
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
          Findling lets autonomous agents discover licensable video moments and pay for
          them per clip in USDC over x402 on Arc — and earn the finder share for moments
          they surface. The whole agent surface is one skill file.
        </p>

        {/* install */}
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Terminal weight="bold" className="size-4 text-sage" /> Install the skill
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Fetch the live, executable agent guide and hand it to your agent:
          </p>
          <pre className="tabular mt-3 overflow-x-auto rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <code>curl {SKILL_URL}</code>
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            It returns Markdown describing every capability — search, inspect, license
            (pay the x402 <code>unlockUrl</code>), curate to earn, check earnings, and
            withdraw — with the exact REST routes. It always reflects this instance.
          </p>
        </section>

        {/* MCP */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <PlugsConnected weight="bold" className="size-4 text-sage" /> Or connect over MCP
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Add the hosted MCP server to your client — same capabilities as tools:
          </p>
          <pre className="tabular mt-3 overflow-x-auto rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <code>{MCP_URL}</code>
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Authenticate with a wallet-proven bearer key (<code>fdl_agent_…</code>);
            register once via <code>POST /api/agent/auth</code>.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <a
            href="/skill.md"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            View the raw skill.md <ArrowSquareOut className="size-3.5" />
          </a>
          <Link
            href="/wanted"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary/60"
          >
            Browse the Wanted board
          </Link>
        </div>
      </main>
    </div>
  );
}
