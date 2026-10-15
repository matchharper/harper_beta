import type { User } from "@supabase/supabase-js";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import { assertOrgTeamRoleAccess, visibleOrgRoleIds } from "@/lib/org/teamAccess";

type Admin = any;
const sourceKinds: Record<string, string> = { contact: "contact", intro_request: "intro", meeting_round: "meeting" };

/** Compact execution facts; absent schema is a rollout boundary, not success. */
export async function companyFollowupSourceFacts(admin: Admin, kind: string, id: string) {
  try {
  const { data, error } = await admin.from("company_talent_followups")
    .select("id,due_at,delay_days,status,revision,delivery_started_at")
    .eq("source_kind", kind).eq("source_id", id).order("created_at");
  if (error) return { available: false };
  return { available: true, sourceContactRef: `${kind === "intro" ? "intro_request" : kind === "contact" ? "contact" : "meeting_round"}:${id}`,
    items: (data ?? []).map((f: any) => ({ contactRef: `followup:${f.id}`, scheduledAt: f.due_at,
      delayDaysAfterFirstEmail: f.delay_days, status: f.status, expectedRevision: f.revision,
      changeable: f.status === "pending" && !f.delivery_started_at })),
    timing: "candidate_agent_follows_up_from_saved_date_as_conversation_allows" };
  } catch {
    return { available: false };
  }
}

export function parseFollowupReference(value: unknown) {
  const [kind, id, extra] = String(value ?? "").split(":");
  if (extra || !kind || !id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new OrgHttpError(400, "정확한 연락 참조를 확인해 주세요.");
  return { kind, id };
}

export async function listCompanyFollowups(args: {
  admin: Admin; user: User; workspaceId: string; roleId?: string | null; talentId?: string | null;
  ids?: string[]; status?: string | null; after?: string | null; before?: string | null;
  dateBasis?: string; query?: string | null; limit?: number; offset?: number; includeHistory?: boolean;
}) {
  await assertOrgWorkspacePermission({ ...args, permission: "view" });
  const roleIds = await visibleOrgRoleIds(args);
  const limit = args.limit ?? 20, offset = args.offset ?? 0;
  const { data, error } = await args.admin.rpc("list_company_followup_rows_v1", {
    p_workspace: args.workspaceId, p_role_ids: roleIds, p_ids: args.ids ?? null,
    p_role: args.roleId ?? null, p_talent: args.talentId ?? null, p_status: args.status ?? null,
    p_date_basis: args.dateBasis ?? "scheduled", p_after: args.after ?? null, p_before: args.before ?? null,
    p_query: args.query ?? null, p_limit: limit + 1, p_offset: offset,
  });
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return { items: [], hasMore: false, limit, offset, dateBasis: args.dateBasis ?? "scheduled" };
  const { data: states, error: stateError } = await args.admin.from("opportunity_scheduler_state")
    .select("talent_id,next_check_at").in("talent_id", [...new Set(rows.map((row: any) => row.talent_id))]);
  if (stateError) throw stateError;
  const items = await Promise.all(rows.slice(0, limit).map(async (row: any) => {
    const [{ data: source, error: sourceError }, { data: deliveries, error: deliveryError }] = await Promise.all([
      args.admin.rpc("company_followup_source_v1", { p_kind: row.source_kind, p_id: row.source_id }),
      row.delivery_run_id ? args.admin.from("talent_opportunity_delivery").select("id,channel,status,sent_at,error_message,payload")
        .eq("discovery_run_id", row.delivery_run_id).eq("talent_id", row.talent_id) : Promise.resolve({ data: [], error: null }),
    ]);
    if (sourceError || deliveryError) throw sourceError || deliveryError;
    const email = (deliveries ?? []).find((d: any) => d.channel === "email");
    const chat = (deliveries ?? []).find((d: any) => d.channel === "chat");
    const changeable = row.status === "pending" && !row.delivery_started_at && email?.status !== "sent";
    const nextCheck = (states ?? []).find((s: any) => s.talent_id === row.talent_id)?.next_check_at ?? null;
    // A talent email can bundle other companies and private career content.
    // Shared history exposes receipts, never the unrestricted whole message.
    const body = null;
    let history: any[] = [];
    if (args.includeHistory) {
      const { data, error } = await args.admin.from("talent_progress")
        .select("created_at,metadata").eq("open_to_company",true).eq("metadata->>followupId",row.id)
        .order("created_at",{ascending:false}).limit(30);
      if (error) throw error;
      history=(data ?? []).map((event: any) => ({ at:event.metadata?.sentAt ?? event.created_at,event:event.metadata?.eventType,
        recordedAt:event.created_at,
        scheduledAt:event.metadata?.dueAt,previousScheduledAt:event.metadata?.previousDueAt }));
    }
    const state = row.status === "cancelled" ? "후속 연락 취소됨" : row.status === "delivered" || email?.status === "sent" ? "후속 이메일 발송됨"
      : row.delivery_started_at ? "후속 연락 전달 시작 · 채널별 결과 확인 가능"
      : !source?.active ? "원본 요청 종료 · 후속 연락 불가"
      : !source?.originalSentAt ? "최초 이메일 전달을 기다리는 후속 일정"
      : !row.due_at ? "최초 전달 후 날짜 확정 대기"
      : new Date(row.due_at).getTime() <= Date.now() ? "예정일 도래 · 후보자 측 Harper Agent가 후속 연락 진행 예정" : "후속 연락 예정";
    return {
      contactRef: `followup:${row.id}`, kind: "followup", followupId: row.id, expectedRevision: row.revision,
      sourceContactRef: `${row.source_kind === "intro" ? "intro_request" : row.source_kind === "contact" ? "contact" : "meeting_round"}:${row.source_id}`,
      candidateName: source?.candidateName ?? "후보자", talentId: row.talent_id,
      candidate: { name: source?.candidateName ?? "후보자", email: null, type: "candidate" },
      roleId: row.role_id, roleName: source?.roleName, role: { roleId: row.role_id, name: source?.roleName },
      activityAt: args.dateBasis === "sent" ? email?.sent_at ?? null
        : args.dateBasis === "created" ? row.created_at : args.dateBasis === "updated" ? row.updated_at : row.due_at,
      initiatedBy: "Harper", state, delayDays: row.delay_days,
      scheduledAt: row.due_at, nextCheckAt: nextCheck, firstEmailSentAt: source?.originalSentAt ?? null,
      request: source?.requestSummary, status: row.status, history,
      availableActions: changeable ? [...(source?.active ? ["reschedule_followup"] : []), "cancel_followup"] : email?.status === "failed" && row.status === "pending" ? ["cancel_followup"] : [],
      message: { scheduledAt: row.due_at, sentAt: email?.status === "sent" ? email.sent_at : null,
        subject: null, body,
        sender: { name: "Harper", email: null, type: "harper" }, recipient: { name: source?.candidateName, email: null, type: "candidate" }, deliveryState: state },
      channels: (deliveries ?? []).map((d: any) => ({ channel: d.channel, status: d.status, sentAt: d.sent_at })),
      chatSentAt: chat?.status === "sent" ? chat.sent_at : null,
    };
  }));
  return { items, hasMore: rows.length > limit, limit, offset, dateBasis: args.dateBasis ?? "scheduled" };
}

export async function changeCompanyFollowup(args: {
  admin: Admin; user: User; workspaceId: string; input: Record<string, any>; actionKey: string;
}) {
  await assertOrgWorkspacePermission({ ...args, permission: "manage_candidates" });
  const action = args.input.action;
  if (action === "add_followup") {
    const reference = parseFollowupReference(args.input.sourceContactRef);
    let kind = sourceKinds[reference.kind], id = reference.id;
    if (!kind && reference.kind !== "interview_request") throw new OrgHttpError(400, "원본 연락의 정확한 참조가 필요합니다.");
    if (reference.kind === "interview_request") {
      const { data, error } = await args.admin.from("meeting_schedules").select("active_round_id,role_id")
        .eq("id", id).eq("company_workspace_id", args.workspaceId).single();
      if (error) throw error;
      await assertOrgTeamRoleAccess({ ...args, roleId: data.role_id });
      kind = "meeting"; id = data.active_round_id;
    }
    const { data: source, error } = await args.admin.rpc("company_followup_source_v1", { p_kind: kind, p_id: id });
    if (error) throw error;
    if (!source || source.workspaceId !== args.workspaceId) throw new OrgHttpError(404, "연락을 찾지 못했습니다.");
    await assertOrgTeamRoleAccess({ ...args, roleId: source.roleId });
    const dueAt = followupDate(args.input.scheduledAt);
    const result = await args.admin.rpc("add_company_followup_v1", { p_workspace: args.workspaceId, p_kind: kind,
      p_source: id, p_due_at: dueAt, p_actor: args.user.id, p_key: `${args.actionKey}:${kind}:${id}:${dueAt}` });
    if (result.error) throw result.error;
    return { status: "scheduled", followupId: result.data.id, scheduledAt: result.data.due_at, expectedRevision: result.data.revision };
  }
  const ref = parseFollowupReference(args.input.contactRef);
  if (ref.kind !== "followup") throw new OrgHttpError(400, "후속 연락의 정확한 참조가 필요합니다.");
  const { items } = await listCompanyFollowups({ ...args, ids: [ref.id], limit: 1 });
  const row = items[0];
  if (!row) throw new OrgHttpError(404, "후속 연락을 찾지 못했습니다.");
  await assertOrgTeamRoleAccess({ ...args, roleId: row.roleId });
  if (!Number.isSafeInteger(args.input.expectedRevision)) throw new OrgHttpError(400, "현재 일정 revision이 필요합니다.");
  const result = await args.admin.rpc("change_company_followup_v1", { p_workspace: args.workspaceId, p_id: ref.id,
    p_revision: args.input.expectedRevision, p_action: action === "cancel_followup" ? "cancel" : "reschedule",
    p_due_at: action === "cancel_followup" ? null : followupDate(args.input.scheduledAt), p_actor: args.user.id });
  if (result.error) throw result.error;
  return { status: result.data.status, contactRef: `followup:${ref.id}`, scheduledAt: result.data.due_at,
    expectedRevision: result.data.revision, originalRequestChanged: false };
}

function followupDate(value: unknown) {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) throw new OrgHttpError(400, "시간대를 포함한 예약 날짜가 필요합니다.");
  return new Date(value).toISOString();
}
