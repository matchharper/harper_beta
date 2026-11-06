import { toTalentMessageResponse, type TalentMessageRow } from "@/lib/talentOnboarding/models";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { z } from "zod";
import { parseCareerForm } from "@/lib/career/forms/schema";
import { projectCareerWorkActivity } from "@/lib/career/work/activity";

/** Small conversation projection; private execution transcripts never leave the server. */
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conversationId = z
    .string()
    .uuid()
    .safeParse(req.nextUrl.searchParams.get("conversationId"));
  if (!conversationId.success)
    return NextResponse.json(
      { error: "Invalid conversation" },
      { status: 400 }
    );
  const admin = getTalentSupabaseAdmin();
  const owned = await admin
    .from("talent_conversations")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", conversationId.data)
    .maybeSingle();
  if (owned.error)
    return NextResponse.json(
      { error: "Conversation unavailable" },
      { status: 503 }
    );
  if (!owned.data)
    return NextResponse.json(
      { error: "Conversation unavailable" },
      { status: 404 }
    );
  const [forms, latest, pending, work, completed, dependencies] = await Promise.all([
    (admin.rpc as any)("read_open_career_forms", {
      p_user_id: user.id,
      p_conversation_id: conversationId.data,
    }),
    admin
      .from("talent_messages")
      .select("id")
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId.data)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (admin.from as any)("talent_external_operations")
      .select(
        "id,parent_id,created_at,request->cleanup,request->cleanup_browser_session,result->activity,result->>last_error",
        { count: "exact" }
      )
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId.data)
      .eq("kind", "career_invocation")
      .neq("status", "completed"),
    (admin.from as any)("talent_external_operations")
      .select("id,request->>origin_reply_id", { count: "exact" })
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId.data)
      .eq("kind", "delegated_work")
      .not("status", "in", "(completed,cancelled)"),
    (admin.from as any)("talent_external_operations")
      .select("id,updated_at")
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId.data)
      .eq("kind", "career_invocation")
      .eq("status", "completed")
      .not("request", "cs", '{"cleanup":true}')
      .is("request->>cleanup_browser_session", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (admin.from as any)("talent_external_operations").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("conversation_id", conversationId.data)
      .or("and(kind.eq.career_dependency,status.eq.reserved),and(kind.eq.browser_session,status.eq.human)"),
  ]);
  if (
    dependencies.error ||
    forms.error ||
    latest.error ||
    pending.error ||
    work.error ||
    completed.error
  )
    return NextResponse.json(
      { error: "Work status unavailable" },
      { status: 503 }
    );
  // Running output can be older than the latest history page after concurrent
  // inputs. Read it by invocation identity rather than relying on that page.
  const owners = new Map<string, string>((work.data ?? []).flatMap((row: {id:string; origin_reply_id?:string}) => row.origin_reply_id ? [[row.id,row.origin_reply_id]] : []));
  const replyIds = [...new Set<string>((pending.data ?? []).map((row: { id: string; parent_id?: string }) =>
    (row.parent_id && owners.get(row.parent_id)) || `invocation:${row.id}`))];
  const displays = replyIds.length ? await admin.from("talent_messages")
    .select("*").eq("user_id", user.id).eq("conversation_id", conversationId.data)
    .in("message_type", ["career_turn_activity", "chat"])
    .in("payload->>careerTextReplyId", replyIds) : {data: [], error: null};
  if (displays.error) return NextResponse.json({error: "Work status unavailable"}, {status: 503});
  return NextResponse.json({
    turns: (displays.data ?? []).map(row => toTalentMessageResponse(row as TalentMessageRow)),
    completionCursor: completed.data
      ? `${completed.data.id}:${completed.data.updated_at}`
      : null,
    forms: (forms.data ?? []).flatMap((row: { payload: unknown }) => {
      const form = parseCareerForm(row.payload);
      return form ? [form] : [];
    }),
    latestMessageId: latest.data?.id ?? null,
    pending: pending.count ?? 0,
    canStop: Boolean(
      work.count || dependencies.count ||
      forms.data?.length ||
      (pending.data ?? []).some(
        (row: { cleanup?: boolean; cleanup_browser_session?: string }) =>
          !row.cleanup && !row.cleanup_browser_session
      )
    ),
    activeInvocationIds: [...new Set([...(pending.data ?? []).map((row: { id: string }) => row.id), ...replyIds.filter(id => id.startsWith("invocation:")).map(id => id.slice(11))])],
    activities: (pending.data ?? []).flatMap(
      (row: {
        id: string;
        parent_id?: string;
        created_at?: string;
        cleanup?: boolean;
        cleanup_browser_session?: string;
        activity?: { logs?: unknown; startedAt?: string; waitingForReply?: boolean };
      }) => row.parent_id && !owners.has(row.parent_id) ? [] :
        projectCareerWorkActivity({
          id: row.id,
          created_at: row.created_at,
          request: {
            cleanup: row.cleanup,
            cleanup_browser_session: row.cleanup_browser_session,
          },
          result: { activity: row.activity },
        }).map(activity => ({ ...activity, ...(row.parent_id && owners.has(row.parent_id) ? { ownerReplyId: owners.get(row.parent_id) } : {}) }))
    ),
    retrying: (pending.data ?? []).some((row: { last_error?: string }) =>
      Boolean(row.last_error)
    ),
  });
}
