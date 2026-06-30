import { NextResponse, type NextRequest } from "next/server";
import { clearSession } from "@/server/auth/session";
import { isSameOrigin } from "@/server/auth/csrf";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  await clearSession();
  return NextResponse.json({ ok: true });
}
