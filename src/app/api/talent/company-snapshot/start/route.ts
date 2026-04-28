import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { startCompanySnapshot } from "@/lib/career/companySnapshot";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      companyName?: string;
      conversationId?: string;
      reason?: string | null;
    };
    const conversationId = String(body.conversationId ?? "").trim();
    const companyName = String(body.companyName ?? "").trim();

    if (!conversationId || !companyName) {
      return NextResponse.json(
        { error: "conversationId and companyName are required" },
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

    const result = await startCompanySnapshot({
      admin,
      companyName,
      conversationId,
      reason: body.reason ?? null,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to start company snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
