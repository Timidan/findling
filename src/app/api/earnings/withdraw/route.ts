/**
 * POST /api/earnings/withdraw — a creator or agent finder pulls accrued
 * earnings on-chain. The withdrawing user is the AUTHENTICATED identity (wallet
 * session or agent bearer key) — never a body-supplied userId — and the
 * recipient is ALWAYS their registered payout wallet. You can only withdraw your
 * own balance, to yourself.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { normalizeWithdrawCommand } from "@/server/agent/commands";
import { requestWithdrawal, NothingToWithdrawError } from "@/server/ledger/withdrawal";
import { getPayoutProvider } from "@/server/payment";
import { getActor } from "@/server/auth/current-user";
import { resolveAuthDomain } from "@/server/auth/siwe";
import { enforceRateLimit } from "@/server/ratelimit/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // CSRF defense-in-depth for the cookie-authed money mutation: a cross-origin
  // browser POST is rejected. Non-browser callers (agents) send no Origin.
  const origin = req.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* malformed Origin */
    }
    if (originHost !== resolveAuthDomain(req.headers.get("host"))) {
      return NextResponse.json({ error: "bad_origin" }, { status: 403 });
    }
  }

  const actor = await getActor(req);
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Throttle the money mutation per identity (the `withdraw` bucket exists for
  // exactly this). Withdrawals are already balance-bound and serialized by an
  // advisory lock, but this caps provider-call churn from a single actor.
  const limited = await enforceRateLimit("withdraw", actor.userId);
  if (limited) return limited;

  const command = normalizeWithdrawCommand(await req.json().catch(() => null));
  if (!command.ok) {
    return NextResponse.json({ error: command.error }, { status: command.status });
  }

  const user = (await db.select().from(users).where(eq(users.id, actor.userId)))[0];
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  if (!user.payoutWalletAddress) {
    return NextResponse.json({ error: "no_payout_wallet_registered" }, { status: 400 });
  }

  try {
    const withdrawal = await requestWithdrawal(
      {
        userId: user.id,
        role: command.value.role,
        recipientAddress: user.payoutWalletAddress,
        maxFee: command.value.maxFee,
      },
      getPayoutProvider(),
    );
    return NextResponse.json({
      withdrawalId: withdrawal.id,
      status: withdrawal.status,
      amountMicroUsdc: withdrawal.amountMicroUsdc,
      transactionHash: withdrawal.transactionHash,
      recipient: withdrawal.recipientWalletAddress,
      failureReason: withdrawal.failureReason,
    });
  } catch (e) {
    if (e instanceof NothingToWithdrawError) {
      return NextResponse.json({ error: "nothing_to_withdraw" }, { status: 400 });
    }
    console.error("[earnings/withdraw] error:", e);
    return NextResponse.json({ error: "withdraw_failed" }, { status: 502 });
  }
}
