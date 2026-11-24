import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

/** Records the newest message a visible Career chat displayed. */
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { conversationId?: unknown; messageId?: unknown } | null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId.trim() : "";
  const messageId = Number(body?.messageId);
  if (!conversationId || !Number.isSafeInteger(messageId) || messageId <= 0)
    return NextResponse.json({ error: "conversationId and messageId are required" }, { status: 400 });
  const { data, error } = await (getTalentSupabaseAdmin().rpc as any)("mark_career_messages_seen_v1", {
    p_user: user.id, p_conversation: conversationId, p_message_id: messageId,
  });
  if (error) {
    console.error("[career-seen] could not record", { conversationId, messageId, error: error.message });
    return NextResponse.json({ error: "Could not record" }, { status: 500 });
  }
  return NextResponse.json({ seenMessageId: data ?? null });
}
