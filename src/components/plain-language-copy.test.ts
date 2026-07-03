import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("plain language product copy", () => {
  it("uses action-first language on discovery and checkout", () => {
    expect(source("src/app/find/page.tsx")).toContain("Find video clips you can use.");
    expect(source("src/app/find/page.tsx")).toContain(
      "Available clips are ready to use now. Wanted clips are requests creators can claim and get paid for.",
    );
    expect(source("src/components/find/cards.tsx")).toContain("Use clip");
    expect(source("src/components/find/cards.tsx")).toContain("Claim request");
    expect(source("src/components/find/license-checkout.tsx")).toContain(
      "Pay once to use this clip in your project.",
    );
    expect(source("src/components/find/license-checkout.tsx")).not.toContain(
      "License this moment",
    );
  });

  it("explains creator and agent roles in plain language", () => {
    expect(source("src/app/studio/page.tsx")).toContain(
      "Upload clips, publish them, and earn when people or agents use them.",
    );
    expect(source("src/app/claim/[token]/page.tsx")).toContain(
      "If this clip is yours, claim the request, upload your version, and get paid when it is used.",
    );
    expect(source("src/app/studio/agents/page.tsx")).toContain(
      "Create a key, set a spending limit, then connect your agent.",
    );
  });

  it("keeps proof pages understandable before technical details", () => {
    expect(source("src/app/r/[slug]/page.tsx")).toContain(
      "This is proof that a clip was unlocked and paid for.",
    );
    expect(source("src/app/trace/[runId]/page.tsx")).toContain(
      "See how an agent searched, chose, and paid for a clip.",
    );
  });

  it("keeps the wallet area free of extra page labels", () => {
    expect(source("src/components/site/site-header.tsx")).not.toContain(
      "tracking-[0.18em]",
    );
    expect(source("src/components/site/site-header.tsx")).toContain(
      "initialUser={initialUser}",
    );
    expect(source("src/components/site/site-header.tsx")).toContain(
      "compactOnMobile",
    );
  });

  it("keeps payment setup blockers clear before payment is clickable", () => {
    const checkout = source("src/components/find/license-checkout.tsx");

    expect(checkout).toContain("Checking payment setup");
    expect(checkout).toContain("Switch to Arc Testnet");
    expect(checkout).toContain("Add USDC and use clip");
    expect(checkout).toContain("Add USDC to your wallet");
    expect(checkout).not.toContain("Your Gateway USDC balance looks too low");
    expect(checkout).not.toContain("First time? Set up payments");
  });

  it("shows the Gateway balance beside the Studio wallet identity", () => {
    const sidebar = source("src/components/studio/studio-sidebar.tsx");

    expect(sidebar).toContain("StudioGatewayBalance");
    expect(sidebar).toContain("initialUser?.address");
  });

  it("keeps agent setup side-by-side with a visible skill file copy action", () => {
    const page = source("src/app/studio/agents/page.tsx");
    const panel = source("src/components/studio/agents-panel.tsx");

    expect(page).toContain("max-w-6xl");
    expect(panel).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]");
    expect(panel).toContain("Agent skill file");
    expect(panel).toContain("CopyButton value={skillUrl}");
    expect(panel).not.toContain("<details");
  });

  it("keeps agent lists compact and explains Gateway-funded spending", () => {
    const panel = source("src/components/studio/agents-panel.tsx");

    expect(panel).toContain("Agent spends the session wallet's Gateway balance.");
    expect(panel).toContain("CollapsibleRows");
    expect(panel).toContain("defaultOpen={false}");
    expect(panel).toContain("25%");
    expect(panel).toContain("50%");
    expect(panel).toContain("75%");
    expect(panel).toContain("100%");
  });

  it("lets Studio users deposit to Gateway from the balance pill", () => {
    const balance = source("src/components/studio/studio-gateway-balance.tsx");

    expect(balance).toContain("Deposit");
    expect(balance).toContain("depositGatewayUsdc");
    expect(balance).toContain("Get Arc Testnet USDC");
    expect(balance).toContain("fixed inset-0");
    expect(balance).toContain("createPortal");
    expect(balance).toContain("document.body");
    expect(balance).toContain("Wallet USDC");
    expect(balance).toContain("fetchWalletUsdcBalance");
  });
});
