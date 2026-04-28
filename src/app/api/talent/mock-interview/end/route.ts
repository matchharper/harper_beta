import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { completeMockInterview } from "@/lib/mockInterview/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      conversationId?: string;
      sessionId?: string | null;
    };
    const conversationId = String(body.conversationId ?? "").trim();
    const sessionId = String(body.sessionId ?? "").trim();
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const result = await completeMockInterview({
      admin,
      conversationId,
      sessionId: sessionId || null,
      userId: user.id,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Active mock interview not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to end mock interview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
