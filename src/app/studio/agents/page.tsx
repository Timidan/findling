import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getCurrentUserId } from "@/server/auth/current-user";
import { listGrants, grantView } from "@/server/grants/grants";
import { db } from "@/server/db/client";
import { agentCredentials } from "@/server/db/schema";
import { AgentsPanel, type CredRow, type GrantRow } from "@/components/studio/agents-panel";
import { StudioAuthGate } from "@/components/studio/studio-auth-gate";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const userId = await getCurrentUserId();
  const hdrs = await headers();
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
  const host = hdrs.get("host") ?? "findling.timidan.xyz";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = configuredOrigin ?? `${proto}://${host}`;

  if (!userId) {
    return (
      <StudioAuthGate message="Sign in with your wallet to configure agent access." />
    );
  }

  const [rawCreds, rawGrants] = await Promise.all([
    db
      .select({
        id: agentCredentials.id,
        label: agentCredentials.label,
        lastUsedAt: agentCredentials.lastUsedAt,
        expiresAt: agentCredentials.expiresAt,
        revokedAt: agentCredentials.revokedAt,
        createdAt: agentCredentials.createdAt,
      })
      .from(agentCredentials)
      .where(eq(agentCredentials.userId, userId))
      .orderBy(desc(agentCredentials.createdAt)),
    listGrants(userId),
  ]);

  // Serialize Date → ISO string so client component receives plain JSON
  const creds: CredRow[] = rawCreds.map((c) => ({
    id: c.id,
    label: c.label,
    lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    revokedAt: c.revokedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  }));

  const grants: GrantRow[] = rawGrants.map((g) => {
    const v = grantView(g);
    return {
      id: v.id,
      sessionKeyAddress: v.sessionKeyAddress,
      chain: v.chain,
      totalCapMicroUsdc: v.totalCapMicroUsdc,
      remainingCapMicroUsdc: v.remainingCapMicroUsdc,
      perPurchaseCapMicroUsdc: v.perPurchaseCapMicroUsdc,
      allowedUsageTypes: v.allowedUsageTypes,
      expiresAt: v.expiresAt?.toISOString() ?? null,
      status: v.status,
      createdAt: v.createdAt.toISOString(),
    };
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:py-10">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Studio</p>
        <h1 className="mt-2 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
          Agent Readiness
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Give an agent a key so it can search, pay for clips, unlock them, and keep receipts.
          Set limits before sharing a key. The agent can only spend and act within those limits.
        </p>
      </div>

      <div className="mt-8">
        <AgentsPanel initialCreds={creds} initialGrants={grants} initialOrigin={origin} />
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Agents authenticate via{" "}
        <code className="rounded bg-secondary px-1 py-0.5">Authorization: Bearer</code> on REST
        and MCP. The headless SIWE flow (wallet-to-key) lives at{" "}
        <code className="rounded bg-secondary px-1 py-0.5">/api/agent/auth</code> for automated
        onboarding.{" "}
        <a
          href="/skill.md"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Read the full agent skill →
        </a>
      </p>
    </div>
  );
}
