import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { OrgHttpError } from "./httpError";

type Admin = ReturnType<typeof getSupabaseAdmin>;

export type OrgTodoSuggestionRow = {
  id: string;
  kind: string;
  title: string;
  plan: string;
  talent_ids: string[] | null;
  /** Each candidate's pipeline column when Harper suggested it. */
  talent_stages: Record<string, string> | null;
  status: string;
  source: string | null;
  expires_at: string;
  decided_at: string | null;
  completed_at: string | null;
  created_at: string;
};

function isMissingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "PGRST205" || code === "42P01";
}

function suggestions(admin: Admin) {
  return admin.from("company_todo_suggestions" as any) as any;
}

/**
 * A Role's suggestions as the To-do shows them: open ones that have not
 * expired (kinds the team muted left out), approved ones still running, and
 * ones finished in the last days. An approved suggestion is finished once
 * Harper has replied in the Role chat after the approval.
 */
export async function readRoleTodoSuggestions(args: {
  admin: Admin;
  workspaceId: string;
  roleId: string;
  since: string;
  now: Date;
}) {
  const { admin, workspaceId, roleId } = args;
  const [rows, mutes] = await Promise.all([
    suggestions(admin)
      .select(
        "id,kind,title,plan,talent_ids,talent_stages,status,source,expires_at,decided_at,completed_at,created_at"
      )
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .or(
        `status.eq.pending,status.eq.approved,and(status.eq.done,completed_at.gte.${args.since})`
      )
      .order("created_at", { ascending: false })
      .limit(50),
    (admin.from("company_todo_suggestion_mutes" as any) as any)
      .select("kind")
      .eq("role_id", roleId),
  ]);
  // Until the suggestions table is created (DB change applied after the web
  // release), the To-do shows its other columns instead of failing.
  if (isMissingTable(rows.error) || isMissingTable(mutes.error)) return [];
  for (const response of [rows, mutes]) {
    if (response.error) throw response.error;
  }
  const muted = new Set(
    ((mutes.data ?? []) as Array<{ kind: string }>).map((row) => row.kind)
  );
  const now = args.now.getTime();
  const list = ((rows.data ?? []) as OrgTodoSuggestionRow[]).filter(
    (row) =>
      row.status !== "pending" ||
      (Date.parse(row.expires_at) > now && !muted.has(row.kind))
  );

  // Harper's first reply in the Role chat after the approval ends the work.
  const approved = list.filter(
    (row) => row.status === "approved" && row.decided_at
  );
  if (approved.length) {
    const oldest = approved.map((row) => row.decided_at!).sort()[0]!;
    const replies = await (admin.from("company_messages" as any) as any)
      .select("created_at")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .eq("role", "assistant")
      .is("slack_thread_id", null)
      .gt("created_at", oldest)
      .order("created_at", { ascending: true })
      .limit(200);
    if (replies.error) throw replies.error;
    const replyTimes = (
      (replies.data ?? []) as Array<{ created_at: string }>
    ).map((row) => row.created_at);
    for (const row of approved) {
      const reply = replyTimes.find((at) => at > row.decided_at!);
      if (reply) {
        row.status = "done";
        row.completed_at = reply;
      }
    }
  }
  return list;
}

/** The team's answer to a suggestion: go ahead, not now, or stop this kind. */
export async function decideRoleTodoSuggestion(args: {
  admin: Admin;
  workspaceId: string;
  roleId: string;
  suggestionId: string;
  decision: "approve" | "dismiss" | "mute";
  userId: string;
}) {
  const { admin, workspaceId, roleId } = args;
  const { data: row, error } = await suggestions(admin)
    .select("id,kind,title,plan,status,expires_at")
    .eq("id", args.suggestionId)
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new OrgHttpError(404, "Suggestion not found");
  if (row.status !== "pending" || Date.parse(row.expires_at) <= Date.now()) {
    throw new OrgHttpError(409, "이미 답한 제안이에요.");
  }
  const now = new Date().toISOString();
  // Only a still-open suggestion changes, so a double click answers once.
  const { data: updated, error: updateError } = await suggestions(admin)
    .update({
      status: args.decision === "approve" ? "approved" : "dismissed",
      decided_at: now,
      decided_by: args.userId,
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new OrgHttpError(409, "이미 답한 제안이에요.");
  if (args.decision === "mute") {
    const { error: muteError } = await (
      admin.from("company_todo_suggestion_mutes" as any) as any
    ).upsert(
      {
        company_workspace_id: workspaceId,
        role_id: roleId,
        kind: row.kind,
        created_by: args.userId,
      },
      { onConflict: "role_id,kind" }
    );
    if (muteError) throw muteError;
  }
  return { plan: String(row.plan ?? ""), title: String(row.title ?? "") };
}

/** The updates (알림) this person marked as read on the Role's To-do. */
export async function readTodoReads(args: {
  admin: Admin;
  roleId: string;
  userId: string;
}) {
  const { data, error } = await (
    args.admin.from("company_todo_reads" as any) as any
  )
    .select("item_id")
    .eq("user_id", args.userId)
    .eq("role_id", args.roleId);
  if (isMissingTable(error)) return new Set<string>();
  if (error) throw error;
  return new Set(
    ((data ?? []) as Array<{ item_id: string }>).map((row) => row.item_id)
  );
}

/** "읽음": the update leaves this person's To-do, above the chat and in the tab. */
export async function markTodoRead(args: {
  admin: Admin;
  itemId: string;
  roleId: string;
  userId: string;
}) {
  const { error } = await (
    args.admin.from("company_todo_reads" as any) as any
  ).upsert(
    { item_id: args.itemId, role_id: args.roleId, user_id: args.userId },
    { onConflict: "user_id,role_id,item_id" }
  );
  if (error) throw error;
}
