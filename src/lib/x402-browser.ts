/**
 * Browser-side x402 license purchase + Circle Gateway funding (Arc testnet).
 *
 * The human's injected wallet IS the buyer session key: it signs the Circle Gateway
 * batched EIP-3009 `TransferWithAuthorization` directly via viem `signTypedData`, so
 * no raw private key ever leaves the wallet. We deliberately do NOT import
 * `GatewayClient` — its config needs a raw `privateKey` and its bundle pulls in Node
 * `crypto`. `@x402/core/http` is browser-safe (btoa/atob base64).
 *
 * Constants verified against the live `@circle-fin/x402-batching` CHAIN_CONFIGS and
 * the server provider (src/server/payment/gateway-x402-provider.ts): USDC 0x3600…,
 * Gateway wallet 0x0077…, chain 5042002, domain { name:"GatewayWalletBatched", v"1" }.
 */
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import {
  createPublicClient,
  erc20Abi,
  getAddress,
  http,
  parseUnits,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { arcTestnet } from "viem/chains";

const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_TESTNET_NETWORK = "eip155:5042002";
const GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS = 604_900;

const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const;

const transferWithAuthorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

type GatewayRequirement = {
  scheme: string;
  network: string;
  asset: Address;
  amount: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  extra?: {
    name?: unknown;
    version?: unknown;
    verifyingContract?: unknown;
    [key: string]: unknown;
  };
};

export type UnlockResponse = {
  unlockUrl: string;
  receiptCode?: string | null;
  paymentReference: string;
  split: {
    creatorMicroUsdc: number;
    finderMicroUsdc: number;
    platformMicroUsdc: number;
  };
};

function randomHex32(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

function selectGatewayArcRequirement(accepts: unknown[]): GatewayRequirement {
  const req = accepts.find((item): item is GatewayRequirement => {
    const r = item as GatewayRequirement;
    return (
      r.scheme === "exact" &&
      r.network === ARC_TESTNET_NETWORK &&
      r.extra?.name === "GatewayWalletBatched" &&
      r.extra?.version === "1" &&
      typeof r.extra?.verifyingContract === "string"
    );
  });

  if (!req) throw new Error("No Circle Gateway batched Arc testnet payment option");
  return req;
}

/**
 * Pay the x402 unlock route for `momentId` using `grantId`, signing with the injected
 * wallet. Returns the signed download URL + receipt + the 80/12/8 split. Assumes the
 * payer already has USDC in the Gateway (see `depositGatewayUsdc`).
 */
export async function purchaseMomentLicense(input: {
  momentId: string;
  grantId: string;
  walletClient: WalletClient;
  account: Address;
  baseUrl: string;
}): Promise<UnlockResponse> {
  const payer = getAddress(input.account);
  const route = new URL(
    `/api/payments/x402/moments/${encodeURIComponent(input.momentId)}/unlock`,
    input.baseUrl,
  );
  route.searchParams.set("grantId", input.grantId);

  const challengeRes = await fetch(route, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "include",
  });

  if (challengeRes.ok) {
    const alreadyUnlocked = await readJson<UnlockResponse>(challengeRes);
    if (!alreadyUnlocked?.unlockUrl) throw new Error("Unexpected unlock response");
    return alreadyUnlocked;
  }

  if (challengeRes.status !== 402) {
    const body = await readJson<unknown>(challengeRes);
    throw new Error(
      `Unlock challenge failed (${challengeRes.status}): ${JSON.stringify(body)}`,
    );
  }

  const requiredHeader = challengeRes.headers.get("PAYMENT-REQUIRED");
  if (!requiredHeader) throw new Error("Missing PAYMENT-REQUIRED header");

  const paymentRequired = decodePaymentRequiredHeader(requiredHeader) as {
    x402Version: number;
    resource?: unknown;
    extensions?: Record<string, unknown>;
    accepts: unknown[];
  };

  const accepted = selectGatewayArcRequirement(paymentRequired.accepts);
  const verifyingContract = getAddress(accepted.extra!.verifyingContract as Address);
  const now = Math.floor(Date.now() / 1000);
  const validFor = Math.max(
    Number(accepted.maxTimeoutSeconds),
    GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS,
  );

  const authorization = {
    from: payer,
    to: getAddress(accepted.payTo),
    value: String(accepted.amount),
    validAfter: String(now - 600),
    validBefore: String(now + validFor),
    nonce: randomHex32(),
  };

  const signature = await input.walletClient.signTypedData({
    account: payer,
    domain: {
      name: "GatewayWalletBatched",
      version: "1",
      chainId: ARC_TESTNET_CHAIN_ID,
      verifyingContract,
    },
    types: transferWithAuthorizationTypes,
    primaryType: "TransferWithAuthorization",
    message: {
      from: getAddress(authorization.from),
      to: getAddress(authorization.to),
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });

  const paymentSignature = encodePaymentSignatureHeader({
    x402Version: paymentRequired.x402Version ?? 2,
    payload: { authorization, signature },
    resource: paymentRequired.resource,
    accepted,
    ...(paymentRequired.extensions ? { extensions: paymentRequired.extensions } : {}),
  } as never);

  const paidRes = await fetch(route, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Payment-Signature": paymentSignature,
    },
    credentials: "include",
  });

  const body = await readJson<UnlockResponse & { error?: string; reason?: string }>(
    paidRes,
  );
  if (!paidRes.ok || !body?.unlockUrl) {
    throw new Error(`Payment failed (${paidRes.status}): ${JSON.stringify(body)}`);
  }

  return {
    unlockUrl: body.unlockUrl,
    receiptCode: body.receiptCode ?? null,
    paymentReference: body.paymentReference,
    split: body.split,
  };
}

const gatewayWalletAbi = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "depositFor",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

/**
 * Fund the buyer's Circle Gateway balance once (approve + deposit USDC), from the
 * injected wallet on Arc testnet. After this, `purchaseMomentLicense` can pay
 * gas-free up to the deposited balance.
 */
export async function depositGatewayUsdc(input: {
  walletClient: WalletClient;
  account: Address;
  amountUsdc: string;
  depositor?: Address;
}) {
  await input.walletClient.switchChain({ id: arcTestnet.id });

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http("https://rpc.testnet.arc.network"),
  });

  const amount = parseUnits(input.amountUsdc, 6);
  const depositor = input.depositor ?? input.account;

  const allowance = await publicClient.readContract({
    address: ARC_USDC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [input.account, GATEWAY_WALLET],
  });

  let approvalTxHash: `0x${string}` | undefined;
  if (allowance < amount) {
    approvalTxHash = await input.walletClient.writeContract({
      account: input.account,
      address: ARC_USDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [GATEWAY_WALLET, amount],
      chain: arcTestnet,
    });
    await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
  }

  const depositTxHash =
    depositor.toLowerCase() === input.account.toLowerCase()
      ? await input.walletClient.writeContract({
          account: input.account,
          address: GATEWAY_WALLET,
          abi: gatewayWalletAbi,
          functionName: "deposit",
          args: [ARC_USDC, amount],
          gas: BigInt(120000),
          chain: arcTestnet,
        })
      : await input.walletClient.writeContract({
          account: input.account,
          address: GATEWAY_WALLET,
          abi: gatewayWalletAbi,
          functionName: "depositFor",
          args: [ARC_USDC, depositor, amount],
          gas: BigInt(120000),
          chain: arcTestnet,
        });

  await publicClient.waitForTransactionReceipt({ hash: depositTxHash });
  return { approvalTxHash, depositTxHash };
}
