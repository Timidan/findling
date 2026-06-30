import { describe, it, expect } from "vitest";
import { MockPaymentProvider } from "./mock-provider";

const provider = new MockPaymentProvider();
const requirement = provider.buildRequirement({
  amountMicroUsdc: 50_000,
  sellerAddress: "0xSELLER",
  network: "arcTestnet",
  resource: "moment-1",
  idempotencyKey: "idem-1",
});

describe("MockPaymentProvider", () => {
  it("builds a requirement that echoes the inputs", () => {
    expect(requirement.amountMicroUsdc).toBe(50_000);
    expect(requirement.sellerAddress).toBe("0xSELLER");
    expect(requirement.idempotencyKey).toBe("idem-1");
  });

  it("rejects a malformed payload", async () => {
    const v = await provider.verify({ nope: true }, requirement);
    expect(v).toEqual({ ok: false, reason: "malformed_payload" });
  });

  it("rejects an underpayment", async () => {
    const v = await provider.verify(
      { mock: true, payerAddress: "0xBUYER", amountMicroUsdc: 10 },
      requirement,
    );
    expect(v).toEqual({ ok: false, reason: "insufficient_amount" });
  });

  it("verifies and returns the payer for a sufficient payload", async () => {
    const v = await provider.verify(
      { mock: true, payerAddress: "0xBUYER", amountMicroUsdc: 50_000 },
      requirement,
    );
    expect(v).toEqual({ ok: true, payerAddress: "0xBUYER" });
  });

  it("settles deterministically from the idempotency key", async () => {
    const payload = { mock: true, payerAddress: "0xBUYER", amountMicroUsdc: 50_000 };
    const a = await provider.settle(payload, requirement);
    const b = await provider.settle(payload, requirement);
    expect(a).toEqual({
      ok: true,
      paymentReference: "mock_idem-1",
      payerAddress: "0xBUYER",
      network: "arcTestnet",
    });
    expect(b).toEqual(a); // stable / deterministic
  });

  it("does not settle a payload that fails verification", async () => {
    const s = await provider.settle({ bad: true }, requirement);
    expect(s.ok).toBe(false);
  });

  it("withdraws with a deterministic reference and rejects non-positive amounts", async () => {
    const ok = await provider.withdraw({
      recipientAddress: "0xCREATOR",
      amountMicroUsdc: 40_000,
      network: "arcTestnet",
      reference: "wd-1",
    });
    expect(ok.ok).toBe(true);
    expect(ok.transactionHash).toBe("mock_tx_wd-1");

    const bad = await provider.withdraw({
      recipientAddress: "0xCREATOR",
      amountMicroUsdc: 0,
      network: "arcTestnet",
      reference: "wd-2",
    });
    expect(bad.ok).toBe(false);
  });
});
