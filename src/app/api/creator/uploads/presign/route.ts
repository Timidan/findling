import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUserId } from "@/server/auth/current-user";
import { validateUpload } from "@/server/storage/validation";
import { supabaseStorage } from "@/server/storage/supabase-storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    contentType?: string;
    sizeBytes?: number;
    durationMs?: number;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { contentType, sizeBytes, durationMs } = body;
  if (
    typeof contentType !== "string" ||
    typeof sizeBytes !== "number" ||
    typeof durationMs !== "number"
  ) {
    return NextResponse.json(
      { error: "contentType, sizeBytes and durationMs are required." },
      { status: 400 },
    );
  }

  const check = validateUpload({ mimeType: contentType, sizeBytes, durationMs });
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  // Server-generated key under the user's namespace (no client-controlled path → no traversal).
  const ext = contentType === "video/webm" ? "webm" : "mp4";
  const storageKey = `uploads/${userId}/${randomUUID()}.${ext}`;

  try {
    const target = await supabaseStorage.createUploadTarget({ storageKey });
    return NextResponse.json(target);
  } catch {
    return NextResponse.json(
      { error: "Could not create an upload target." },
      { status: 502 },
    );
  }
}
