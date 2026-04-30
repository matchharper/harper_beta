import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { prepareMockInterview } from "@/lib/mockInterview/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      conversationId?: string;
      opportunityId?: string | null;
      sourceMessage?: string | null;
    };
    const conversationId = String(body.conversationId ?? "").trim();
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const { data: conversation, error: conversationError } = await admin
      .from("talent_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) {
      throw new Error(
        conversationError.message ?? "Failed to load conversation"
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const result = await prepareMockInterview({
      admin,
      conversationId,
      opportunityId: body.opportunityId ?? null,
      sourceMessage: body.sourceMessage ?? null,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to prepare mock interview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
