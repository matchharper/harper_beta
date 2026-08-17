import assert from "node:assert/strict";
import test from "node:test";
import type { DailyCompanyStatsSourceRows } from "@/lib/dailyCompanyStats";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";

function baseRows(): DailyCompanyStatsSourceRows {
  return {
    loginLogs: [],
    memberships: [],
    messages: [],
    progress: [],
    recommendations: [],
    roles: [],
    slackIntegrations: [],
    tags: [],
    workspaces: [],
  };
}

test("company stats separate Slack or auto-member workspaces from other companies", async () => {
  const { compileDailyCompanyStatsReport } =
    await import("@/lib/dailyCompanyStats");
  const rows = baseRows();
  rows.workspaces = [
    { company_name: "Slack Co", company_workspace_id: "workspace-slack" },
    { company_name: "Auto Co", company_workspace_id: "workspace-auto" },
    { company_name: "Other Co", company_workspace_id: "workspace-other" },
  ];
  rows.roles = [
    {
      company_internal_roles: { is_auto: false },
      company_workspace_id: "workspace-slack",
      is_expired: false,
      role_id: "role-slack",
      source_type: "internal",
      status: "active",
    },
    {
      company_internal_roles: { is_auto: true },
      company_workspace_id: "workspace-auto",
      is_expired: false,
      role_id: "role-auto",
      source_type: "internal",
      status: "top_priority",
    },
    {
      company_internal_roles: { is_auto: true },
      company_workspace_id: "workspace-other",
      is_expired: false,
      role_id: "role-other",
      source_type: "external",
      status: "active",
    },
  ];
  rows.memberships = [
    { company_user_id: "member-auto", company_workspace_id: "workspace-auto" },
  ];
  rows.slackIntegrations = [
    { company_workspace_id: "workspace-slack", status: "active" },
  ];

  const report = compileDailyCompanyStatsReport({ date: "2026-08-16", rows });

  assert.deepEqual(
    report.servedCompanies.map((company) => company.companyName),
    ["Auto Co", "Slack Co"]
  );
  assert.deepEqual(
    report.otherCompanies.map((company) => company.companyName),
    ["Other Co"]
  );
  assert.equal(report.servedCompanies[0].activeRoleCount, 1);
  assert.equal(report.otherCompanies[0].activeRoleCount, 0);
});

test("company stats count current candidate stages and daily additions by unique talent", async () => {
  const { compileDailyCompanyStatsReport } =
    await import("@/lib/dailyCompanyStats");
  const rows = baseRows();
  rows.workspaces = [
    { company_name: "Company", company_workspace_id: "workspace" },
  ];
  rows.roles = [
    {
      company_internal_roles: { is_auto: false },
      company_workspace_id: "workspace",
      is_expired: false,
      role_id: "role",
      source_type: "internal",
      status: "active",
    },
  ];
  rows.recommendations = [
    {
      feedback: "like",
      feedback_at: "2026-08-16T02:00:00.000Z",
      id: "accepted",
      role_id: "role",
      saved_stage: null,
      talent_id: "talent-accepted",
    },
    {
      feedback: "positive",
      feedback_at: "2026-08-16T03:00:00.000Z",
      id: "pending",
      role_id: "role",
      saved_stage: null,
      talent_id: "talent-pending",
    },
    {
      feedback: "like",
      feedback_at: "2026-08-15T14:00:00.000Z",
      id: "connected",
      role_id: "role",
      saved_stage: null,
      talent_id: "talent-connected",
    },
    {
      feedback: "like",
      feedback_at: "2026-08-15T13:00:00.000Z",
      id: "custom",
      role_id: "role",
      saved_stage: null,
      talent_id: "talent-custom",
    },
    {
      feedback: "like",
      feedback_at: "2026-08-15T12:00:00.000Z",
      id: "stopped",
      role_id: "role",
      saved_stage: null,
      talent_id: "talent-stopped",
    },
  ];
  rows.tags = [
    {
      id: "tag-pending",
      opportunity_id: "role",
      tag: "내부:연결대기",
      talent_id: "talent-pending",
      updated_at: "2026-08-16T04:00:00.000Z",
    },
    {
      id: "tag-connected",
      opportunity_id: "role",
      tag: "내부:수락",
      talent_id: "talent-connected",
      updated_at: "2026-08-16T04:00:00.000Z",
    },
    {
      id: "tag-custom",
      opportunity_id: "role",
      tag: "내부단계:interview",
      talent_id: "talent-custom",
      updated_at: "2026-08-16T04:00:00.000Z",
    },
    {
      id: "tag-stopped",
      opportunity_id: "role",
      tag: "내부:프로세스중단",
      talent_id: "talent-stopped",
      updated_at: "2026-08-16T04:00:00.000Z",
    },
  ];
  rows.progress = [
    {
      company_user_id: "member",
      created_at: "2026-08-16T05:00:00.000Z",
      kind: "org_stage_change",
      metadata: { stage: "connected" },
      recommendation_id: "connected",
      role_id: "role",
      talent_id: "talent-connected",
    },
    {
      company_user_id: "member",
      created_at: "2026-08-16T06:00:00.000Z",
      kind: "org_stage_change",
      metadata: { stage: "connected" },
      recommendation_id: "connected-duplicate-event",
      role_id: "role",
      talent_id: "talent-connected",
    },
  ];

  const report = compileDailyCompanyStatsReport({ date: "2026-08-16", rows });
  const company = report.otherCompanies[0];

  assert.equal(company.acceptedCount, 1);
  assert.equal(company.pendingConnectionCount, 1);
  assert.equal(company.connectedCount, 2);
  assert.equal(company.acceptedTodayCount, 2);
  assert.equal(company.connectedTodayCount, 1);
});

test("company stats choose the latest use and login and format one company per line", async () => {
  const {
    compileDailyCompanyStatsReport,
    formatDailyCompanyStatsSlackMessage,
  } = await import("@/lib/dailyCompanyStats");
  const rows = baseRows();
  rows.workspaces = [
    { company_name: "A & B", company_workspace_id: "workspace" },
  ];
  rows.roles = [
    {
      company_internal_roles: { is_auto: false },
      company_workspace_id: "workspace",
      is_expired: false,
      role_id: "role",
      source_type: "internal",
      status: "active",
    },
  ];
  rows.memberships = [
    { company_user_id: "member", company_workspace_id: "workspace" },
  ];
  rows.slackIntegrations = [
    { company_workspace_id: "workspace", status: "active" },
  ];
  rows.messages = [
    {
      company_workspace_id: "workspace",
      created_at: "2026-08-16T01:00:00.000Z",
      message_type: "chat",
      role: "user",
    },
    {
      company_workspace_id: "workspace",
      created_at: "2026-08-16T02:00:00.000Z",
      message_type: "slack",
      role: "user",
    },
  ];
  rows.progress = [
    {
      company_user_id: "member",
      created_at: "2026-08-16T03:00:00.000Z",
      kind: "org_stage_change",
      metadata: { stage: "process_stopped" },
      recommendation_id: "recommendation",
      role_id: "role",
      talent_id: "talent",
    },
  ];
  rows.loginLogs = [
    {
      created_at: "2026-08-15T23:00:00.000Z",
      type: "login_completed",
      user_id: "member",
    },
  ];

  const report = compileDailyCompanyStatsReport({ date: "2026-08-16", rows });
  const message = formatDailyCompanyStatsSlackMessage(report);

  assert.equal(report.servedCompanies[0].latestUsageKind, "rejected");
  assert.equal(
    report.servedCompanies[0].latestLoginAt,
    "2026-08-15T23:00:00.000Z"
  );
  assert.match(message, /• A &amp; B — Slack O · 멤버 1/);
  assert.doesNotMatch(message, /auto X/);
  assert.match(message, /최근 사용 거절 08\/16 12:00/);
  assert.equal(
    message.split("\n").filter((line) => line.includes("A &amp; B")).length,
    1
  );
});
