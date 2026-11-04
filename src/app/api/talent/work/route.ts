import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { z } from "zod";
import { parseCareerForm } from "@/lib/career/forms/schema";
import { projectCareerWorkActivity } from "@/lib/career/work/activity";

/** Small conversation projection; private execution transcripts never leave the server. */
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conversationId = z.string().uuid().safeParse(req.nextUrl.searchParams.get("conversationId"));
  if (!conversationId.success) return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
  const admin = getTalentSupabaseAdmin();
  const owned = await admin.from("talent_conversations").select("id").eq("user_id", user.id).eq("id", conversationId.data).maybeSingle();
  if (owned.error) return NextResponse.json({ error: "Conversation unavailable" }, { status: 503 });
  if (!owned.data) return NextResponse.json({ error: "Conversation unavailable" }, { status: 404 });
  const [forms, latest, pending, work] = await Promise.all([
    (admin.rpc as any)("read_open_career_forms", { p_user_id: user.id, p_conversation_id: conversationId.data }),
    admin.from("talent_messages").select("id").eq("user_id", user.id).eq("conversation_id", conversationId.data).order("id", { ascending: false }).limit(1).maybeSingle(),
    (admin.from as any)("talent_external_operations").select("id,request,result", { count: "exact" }).eq("user_id", user.id)
      .eq("conversation_id", conversationId.data).eq("kind", "career_invocation").neq("status", "completed"),
    (admin.from as any)("talent_external_operations").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("conversation_id", conversationId.data).eq("kind", "delegated_work")
      .not("status", "in", "(completed,cancelled)"),
  ]);
  if (forms.error || latest.error || pending.error || work.error) return NextResponse.json({ error: "Work status unavailable" }, { status: 503 });
  return NextResponse.json({ forms: (forms.data ?? []).flatMap((row: { payload: unknown }) => {
    const form = parseCareerForm(row.payload); return form ? [form] : [];
  }), latestMessageId: latest.data?.id ?? null, pending: pending.count ?? 0,
    canStop: Boolean(work.count || forms.data?.length || (pending.data ?? []).some((row: { request: Record<string, unknown> }) =>
      !row.request.cleanup && !row.request.cleanup_browser_session)),
    activities: (pending.data ?? []).flatMap(projectCareerWorkActivity),
    retrying: (pending.data ?? []).some((row: { result: { last_error?: string } }) => Boolean(row.result.last_error)) });
}
