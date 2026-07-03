import { describe, expect, it } from "vitest";
import { getWalletConnectHelp } from "./connect-wallet";

describe("getWalletConnectHelp", () => {
  it("treats chunk load failures as stale app errors, not missing wallets", () => {
    const help = getWalletConnectHelp(
      new Error("Failed to load chunk /_next/static/chunks/3-abc.js"),
    );

    expect(help.title).toBe("Reload needed");
    expect(help.message).toContain("updated");
    expect(help.action).toBe("reload");
  });

  it("uses a generic wallet install action for desktop browsers without a provider", () => {
    const help = getWalletConnectHelp("missing_provider");

    expect(help.title).toBe("Wallet needed");
    expect(help.message).toContain("browser wallet");
    expect(help.action).toBe("wallets");
  });
});
