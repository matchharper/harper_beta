import {
  getOrgRoleStatusPresentation,
  isOrgRoleCountedAsActive,
} from "@/lib/org/roleStatus";
import {
  buildCompanyRoleCounts,
  COMPANY_ROLE_STAGES,
} from "./companyRoleSummary";
import {
  kstDay,
  createCompanyMetricAccumulator,
} from "./companyDashboardMetrics";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { type CompanyDashboard } from "./companyDashboardTypes";
import {
  describeOpsCompanyProgressActivity,
  OPS_COMPANY_PROGRESS_KINDS,
  OPS_COMPANY_DIRECTORY_PROGRESS_KINDS,
  getOpsCompanyStageLabelKey,
} from "./companyActivityPresentation";

// Read every page: a PostgREST row cap must never silently turn into a KPI total.
async function readRows(makeQuery: () => any): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery().range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return rows;
    if (rows.length >= 100_000)
      throw new Error("집계 범위가 너무 큽니다. 더 짧은 기간을 선택해 주세요.");
  }
}
export async function fetchCompanyDashboard(
  days: number,
  workspaceId?: string,
  directoryIds?: string[]
): Promise<CompanyDashboard> {
  const admin = getSupabaseAdmin();
  const through = kstDay(new Date().toISOString());
  const from = new Date(
    Date.parse(`${through}T00:00:00Z`) - (days - 1) * 86400_000
  )
    .toISOString()
    .slice(0, 10);
  const since = `${from}T00:00:00+09:00`;
  const workspaces = await readRows(() => {
    let q = admin
      .from("company_workspace")
      .select("company_workspace_id,company_name")
      .eq("is_internal", true)
      .order("company_workspace_id");
    if (directoryIds) q = q.in("company_workspace_id", directoryIds);
    if (workspaceId) q = q.eq("company_workspace_id", workspaceId);
    return q;
  });
  const ids = workspaces.map((w) => w.company_workspace_id);
  if (!ids.length) return { from, through, companies: [], points: [] };
  const [roles, messages, logs, outbox, introCandidates] = await Promise.all([
    readRows(() =>
      admin
        .from("company_roles")
        .select(
          "role_id,name,status,company_workspace_id,information,is_expired,company_internal_roles!inner(is_harper_tailored_role,role_status_changed_at)"
        )
        .in("company_workspace_id", ids)
        .eq("source_type", "internal")
        .not("company_internal_roles.is_harper_tailored_role", "is", true)
        .order("role_id")
    ),
    directoryIds
      ? Promise.resolve([])
      : readRows(() =>
          admin
            .from("company_messages")
            .select("id,company_workspace_id,created_at,metadata")
            .in("company_workspace_id", ids)
            .eq("role", "user")
            .eq("status", "completed")
            .in("message_type", ["chat", "slack"])
            .gte("created_at", since)
            .order("id")
        ),
    directoryIds
      ? Promise.resolve([])
      : readRows(() =>
          admin
            .from("logs")
            .select("id,type,user_id,created_at,meta_data")
            .in("meta_data->>workspaceId", ids)
            .eq("type", "org_workspace_visited")
            .gte("created_at", since)
            .order("id")
        ),
    directoryIds
      ? Promise.resolve([])
      : readRows(() =>
          (admin.from("company_first_slack_outbox" as any) as any)
            .select("id,run_id,company_workspace_id,candidate_ids,sent_at")
            .in("company_workspace_id", ids)
            .eq("status", "sent")
            .gte("sent_at", since)
            .order("id")
        ),
    directoryIds
      ? Promise.resolve([])
      : readRows(() =>
          (admin.from("company_intro_candidates" as any) as any)
            .select("id,role_id")
            .in("company_workspace_id", ids)
            .order("id")
        ),
  ]);
  const visibleRoles = roles.filter((r) => r.information?.testOnly !== true);
  const roleMap = new Map(visibleRoles.map((r) => [r.role_id, r]));
  const progress: any[] = [];
  // Bound IN clauses rather than generating one request for each company.
  const roleIds = [...roleMap.keys()];
  const hiringStarts = new Map<string, string>();
  const candidateCounts = new Map<
    string,
    CompanyDashboard["companies"][number]["roles"][number]["candidateCounts"]
  >();
  if (directoryIds) {
    const activeRoleIds = visibleRoles
      .filter(
        (role) => !role.is_expired && isOrgRoleCountedAsActive(role.status)
      )
      .map((role) => role.role_id);
    for (let index = 0; index < activeRoleIds.length; index += 150) {
      const chunk = activeRoleIds.slice(index, index + 150);
      const [recommendations, intros, tags, stages, connections, starts] =
        await Promise.all([
          readRows(() =>
            (
              admin.from(
                "talent_effective_opportunity_recommendations_v1" as any
              ) as any
            )
              .select("id,role_id,talent_id,feedback,saved_stage")
              .in("role_id", chunk)
              .order("id")
          ),
          readRows(() =>
            admin
              .from("company_intro_candidates")
              .select("id,role_id,talent_id,status")
              .in("role_id", chunk)
              .in("status", [
                "ready",
                "awaiting_talent",
                "connecting",
                "closed",
                "passed",
              ])
              .or("close_reason.is.null,close_reason.neq.route_replaced")
              .order("id")
          ),
          readRows(() =>
            admin
              .from("talent_opportunity_tag")
              .select("id,talent_id,opportunity_id,tag,updated_at")
              .in("opportunity_id", chunk)
              .order("updated_at", { ascending: false })
              .order("id", { ascending: false })
          ),
          readRows(() =>
            admin
              .from("ops_matching_role_stages")
              .select("id,role_id")
              .in("role_id", chunk)
              .order("id")
          ),
          readRows(() =>
            admin
              .from("talent_progress")
              .select("id,recommendation_id")
              .in("role_id", chunk)
              .eq("kind", "org_stage_change")
              .contains("metadata", { stage: "connected" })
              .order("id")
          ),
          readRows(() =>
            admin
              .from("company_first_search_runs")
              .select("id,role_id,created_at")
              .in("role_id", chunk)
              .eq("trigger_reason", "role_activated")
              .order("created_at")
              .order("id")
          ),
        ]);
      for (const [id, counts] of buildCompanyRoleCounts({
        recommendations,
        intros,
        tags,
        stages,
        connections,
      }))
        candidateCounts.set(id, counts);
      for (const start of starts)
        if (!hiringStarts.has(start.role_id))
          hiringStarts.set(start.role_id, start.created_at);
    }
  }
  const directoryActions: any[] = [];
  const customStageLabelByKey = new Map<string, string>();
  if (directoryIds) {
    const latest = await Promise.all(
      ids.map(async (id) => {
        const companyRoleIds = visibleRoles
          .filter((r) => r.company_workspace_id === id)
          .map((r) => r.role_id);
        const [decisions, invitations] = await Promise.all([
          companyRoleIds.length
            ? admin
                .from("talent_progress")
                .select("id,role_id,talent_id,kind,metadata,text,created_at")
                .in("role_id", companyRoleIds)
                .in("kind", OPS_COMPANY_DIRECTORY_PROGRESS_KINDS)
                .order("created_at", { ascending: false })
                .order("id", { ascending: false })
                .limit(5)
            : Promise.resolve({ data: [], error: null }),
          admin
            .from("logs")
            .select("id,type,created_at,meta_data")
            .eq("meta_data->>workspaceId", id)
            .in("type", ["org_invitation_sent", "org_invitation_cancelled"])
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(5),
        ]);
        if (decisions.error) throw decisions.error;
        if (invitations.error) throw invitations.error;
        directoryActions.push(...(invitations.data ?? []));
        return decisions.data ?? [];
      })
    );
    progress.push(...latest.flat());
    const stageRoleIds = [
      ...new Set(
        progress
          .filter((row) => row.kind === "org_stage_change")
          .map((row) => row.role_id)
      ),
    ];
    for (let i = 0; i < stageRoleIds.length; i += 150) {
      const stages = await readRows(() =>
        admin
          .from("ops_matching_role_stages")
          .select("id,role_id,label")
          .in("role_id", stageRoleIds.slice(i, i + 150))
          .order("id")
      );
      for (const stage of stages)
        customStageLabelByKey.set(
          getOpsCompanyStageLabelKey(stage.role_id, stage.id),
          stage.label
        );
    }
  } else
    for (let i = 0; i < roleIds.length; i += 150) {
      progress.push(
        ...(await readRows(() =>
          admin
            .from("talent_progress")
            .select("id,role_id,talent_id,kind,metadata,text,created_at")
            .in("role_id", roleIds.slice(i, i + 150))
            .in("kind", OPS_COMPANY_PROGRESS_KINDS)
            .gte("created_at", since)
            .order("id")
        ))
      );
    }
  const accumulator = createCompanyMetricAccumulator(from, through);
  const add = accumulator.add;
  for (const row of logs) {
    add(
      row.meta_data.workspaceId,
      "visits",
      row.created_at,
      `${row.user_id}:${kstDay(row.created_at)}`
    );
  }
  for (const row of messages) {
    if (!row.metadata?.companyEventUiDuplicateOf)
      add(row.company_workspace_id, "chats", row.created_at);
  }
  const visibleCandidates = new Set(
    introCandidates
      .filter((row) => roleMap.has(row.role_id))
      .map((row) => row.id)
  );
  // A second channel may finish after midnight or outside the selected period.
  // Resolve every receipt for the runs in range, then count only their first delivery.
  const deliveredRunIds = [...new Set(outbox.map((row) => row.run_id))];
  const receipts: any[] = [];
  for (let i = 0; i < deliveredRunIds.length; i += 150) {
    receipts.push(
      ...(await readRows(() =>
        (admin.from("company_first_slack_outbox" as any) as any)
          .select("id,run_id,company_workspace_id,candidate_ids,sent_at")
          .in("run_id", deliveredRunIds.slice(i, i + 150))
          .eq("status", "sent")
          .order("id")
      ))
    );
  }
  for (const row of receipts.sort((a, b) =>
    a.sent_at.localeCompare(b.sent_at)
  )) {
    for (const id of row.candidate_ids ?? []) {
      if (visibleCandidates.has(id))
        add(
          row.company_workspace_id,
          "presented",
          row.sent_at,
          `${row.run_id}:${id}`
        );
    }
  }
  const latestByWorkspace = new Map<string, any[]>();
  for (const row of (directoryIds ? [...progress] : []).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )) {
    const role = roleMap.get(row.role_id);
    if (!role || !OPS_COMPANY_DIRECTORY_PROGRESS_KINDS.includes(row.kind))
      continue;
    const list = latestByWorkspace.get(role.company_workspace_id) ?? [];
    if (list.length < 5) list.push(row);
    latestByWorkspace.set(role.company_workspace_id, list);
  }
  const recentTalentIds = [
    ...new Set(
      [...latestByWorkspace.values()].flat().map((row) => row.talent_id)
    ),
  ];
  const talentNames = new Map<string, string>();
  for (let i = 0; i < recentTalentIds.length; i += 150) {
    const { data, error } = await admin
      .from("talent_users")
      .select("user_id,name")
      .in("user_id", recentTalentIds.slice(i, i + 150));
    if (error) throw error;
    for (const row of data ?? [])
      talentNames.set(row.user_id, row.name || "후보자");
  }
  const activities = new Map<
    string,
    CompanyDashboard["companies"][number]["activities"]
  >();
  for (const row of progress) {
    const role = roleMap.get(row.role_id);
    if (!role) continue;
    const id = role.company_workspace_id;
    const metric =
      row.kind === "org_company_intro_requested"
        ? "intros"
        : ["org_company_intro_passed", "org_stage_change"].includes(row.kind)
          ? "feedback"
          : row.kind === "org_candidate_profile_first_view"
            ? "profileViews"
            : null;
    if (metric) add(id, metric, row.created_at);
    if (
      !directoryIds ||
      !OPS_COMPANY_DIRECTORY_PROGRESS_KINDS.includes(row.kind)
    )
      continue;
    const description = describeOpsCompanyProgressActivity({
      candidateName: talentNames.get(row.talent_id) || "후보자",
      roleName: role.name,
      customStageLabelByKey,
      progress: {
        kind: row.kind,
        metadata: row.metadata,
        roleId: row.role_id,
        text: row.text,
      },
    });
    const list = activities.get(id) ?? [];
    list.push({
      id: row.id,
      title: description.title,
      occurredAt: row.created_at,
    });
    activities.set(id, list);
  }
  for (const row of directoryActions) {
    const id = row.meta_data?.workspaceId;
    const list = activities.get(id) ?? [];
    const target = row.meta_data?.targetLabel;
    list.push({
      id: `action:${row.id}`,
      occurredAt: row.created_at,
      title: `${target ? `${target} · ` : ""}${row.type === "org_invitation_sent" ? "팀원 초대 발송" : "팀원 초대 취소"}`,
    });
    activities.set(id, list);
  }
  if (directoryIds)
    for (const role of visibleRoles) {
      if (!["active", "top_priority", "paused", "ended"].includes(role.status))
        continue;
      const internal = Array.isArray(role.company_internal_roles)
        ? role.company_internal_roles[0]
        : role.company_internal_roles;
      const changedAt = internal?.role_status_changed_at;
      if (!changedAt) continue;
      // This timestamp also changes on priority edits and is shared by paused/ended.
      // Report the recorded change and current status, never invent a start/end event.
      const list = activities.get(role.company_workspace_id) ?? [];
      list.push({
        id: `role-status:${role.role_id}`,
        occurredAt: changedAt,
        title: `${role.name} · 채용 상태 변경 (현재 ${getOrgRoleStatusPresentation(role.status).label})`,
      });
      activities.set(role.company_workspace_id, list);
    }
  return {
    from,
    through,
    companies: workspaces.map((w) => ({
      id: w.company_workspace_id,
      name: w.company_name,
      roles: visibleRoles
        .filter(
          (r) =>
            r.company_workspace_id === w.company_workspace_id &&
            !r.is_expired &&
            r.status !== "deleted"
        )
        .map((r) => ({
          id: r.role_id,
          name: r.name,
          status: r.status,
          hiringStartedAt:
            hiringStarts.get(r.role_id) ??
            (Array.isArray(r.company_internal_roles)
              ? r.company_internal_roles[0]
              : r.company_internal_roles
            )?.role_status_changed_at ??
            null,
          hiringStartBasis: hiringStarts.has(r.role_id)
            ? ("activation" as const)
            : ("status_change" as const),
          candidateCounts:
            candidateCounts.get(r.role_id) ??
            COMPANY_ROLE_STAGES.map((stage) => ({ ...stage, count: 0 })),
        })),
      activities: (activities.get(w.company_workspace_id) ?? [])
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, 5),
    })),
    points: accumulator.values(),
  };
}
