import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  normalizeMockInterviewType,
  startMockInterview,
} from "@/lib/mockInterview/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      channel?: "call" | "chat";
      conversationId?: string;
      interviewType?: string;
      sessionId?: string;
    };
    const conversationId = String(body.conversationId ?? "").trim();
    const sessionId = String(body.sessionId ?? "").trim();
    const channel = body.channel === "call" ? "call" : "chat";

    if (!conversationId || !sessionId) {
      return NextResponse.json(
        { error: "conversationId and sessionId are required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const result = await startMockInterview({
      admin,
      channel,
      conversationId,
      interviewType: normalizeMockInterviewType(body.interviewType),
      sessionId,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start mock interview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
