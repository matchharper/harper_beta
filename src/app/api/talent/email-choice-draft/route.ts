import { NextRequest, NextResponse } from "next/server";
import { verifyEmailChoiceDraft } from "@/lib/email/security";
import { getRequestUser } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/** Whether an email answer option was written for the signed-in person; only then does chat start with its text. */
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { signature?: unknown; text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";
  return NextResponse.json({
    valid: Boolean(text && signature && verifyEmailChoiceDraft(user.id, text, signature)),
  });
}
