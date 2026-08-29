import assert from "node:assert/strict";
import test from "node:test";
import type { DailyCompanyStatsSourceRows } from "@/lib/dailyCompanyStats";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";

function baseRows(): DailyCompanyStatsSourceRows {
  return {
    events: [],
    loginLogs: [],
    memberships: [],
    messages: [],
    progress: [],
    recommendations: [],
    roles: [],
    slackIntegrations: [],
    tags: [],
    toolMessages: [],
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
      saved_stage: "connected",
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
  assert.equal(report.totals.connectedCount, 2);
  assert.equal(report.totals.connectedTodayCount, 1);
  assert.equal(report.totals.rolling7Day.connectedCount, 1);
});

test("company stats keep Harper acceptances separate from another role's later stage", async () => {
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
      name: "Accepted Role",
      role_id: "role-accepted",
      source_type: "internal",
      status: "active",
    },
    {
      company_internal_roles: { is_auto: false },
      company_workspace_id: "workspace",
      is_expired: false,
      name: "Connected Role",
      role_id: "role-connected",
      source_type: "internal",
      status: "paused",
    },
  ];
  rows.recommendations = [
    {
      feedback: "like",
      feedback_at: "2026-08-16T02:00:00.000Z",
      id: "recommendation-accepted",
      role_id: "role-accepted",
      saved_stage: "connected",
      talent_id: "talent-shared",
    },
    {
      feedback: "like",
      feedback_at: "2026-08-15T02:00:00.000Z",
      id: "recommendation-connected",
      role_id: "role-connected",
      saved_stage: "connected",
      talent_id: "talent-shared",
    },
  ];
  rows.tags = [
    {
      id: "tag-connected",
      opportunity_id: "role-connected",
      tag: "내부:연결됨",
      talent_id: "talent-shared",
      updated_at: "2026-08-16T03:00:00.000Z",
    },
  ];

  const report = compileDailyCompanyStatsReport({ date: "2026-08-16", rows });
  const company = report.otherCompanies[0];

  assert.equal(company.acceptedCount, 1);
  assert.equal(company.connectedCount, 1);
  assert.deepEqual(
    company.roleStats.map((role) => ({
      acceptedCount: role.acceptedCount,
      connectedCount: role.connectedCount,
      roleId: role.roleId,
    })),
    [
      {
        acceptedCount: 1,
        connectedCount: 0,
        roleId: "role-accepted",
      },
      {
        acceptedCount: 0,
        connectedCount: 1,
        roleId: "role-connected",
      },
    ]
  );
});

test("company stats choose the latest use and login and format one company per line", async () => {
  const {
    compileDailyCompanyStatsReport,
    formatDailyCompanyStatsSlackMessage,
    formatDailyCompanyStatsSlackDetailMessages,
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
  assert.match(message, /• A &amp; B — /);
  assert.match(
    message,
    /<https:\/\/matchharper\.com\/org\/jobs\?orgId=workspace&roleId=all\|수락 0> · 연결 대기 0 · 진행 중 0 · 거절 0/
  );
  assert.doesNotMatch(message, /auto X/);
  assert.equal(
    message.split("\n").filter((line) => line.includes("A &amp; B")).length,
    1
  );
  assert.equal(formatDailyCompanyStatsSlackDetailMessages(report).length, 1);
});

test("company stats include daily totals, linked acceptances, and thread details", async () => {
  const {
    compileDailyCompanyStatsReport,
    formatDailyCompanyStatsSlackDetailMessages,
    formatDailyCompanyStatsSlackMessage,
  } = await import("@/lib/dailyCompanyStats");
  const rows = baseRows();
  rows.workspaces = [
    { company_name: "Slack Company", company_workspace_id: "workspace-main" },
    { company_name: "No Change", company_workspace_id: "workspace-empty" },
  ];
  rows.roles = [
    {
      company_internal_roles: { is_auto: false },
      company_workspace_id: "workspace-main",
      created_at: "2026-08-16T01:00:00.000Z",
      is_expired: false,
      name: "Platform",
      role_id: "role-new",
      source_type: "internal",
      status: "active",
    },
    {
      company_internal_roles: { is_auto: false },
      company_workspace_id: "workspace-main",
      created_at: "2026-08-10T01:00:00.000Z",
      is_expired: false,
      name: "API",
      role_id: "role-paused",
      source_type: "internal",
      status: "paused",
    },
    {
      company_internal_roles: { is_auto: false },
      company_workspace_id: "workspace-main",
      created_at: "2026-08-10T01:00:00.000Z",
      is_expired: false,
      name: "Legacy",
      role_id: "role-ended",
      source_type: "internal",
      status: "ended",
    },
    {
      company_internal_roles: { is_auto: false },
      company_workspace_id: "workspace-main",
      created_at: "2026-08-10T01:00:00.000Z",
      is_expired: true,
      name: "Deleted",
      role_id: "role-deleted",
      source_type: "internal",
      status: "ended",
    },
    {
      company_internal_roles: { is_auto: false },
      company_workspace_id: "workspace-empty",
      created_at: "2026-08-10T01:00:00.000Z",
      is_expired: false,
      name: "Old",
      role_id: "role-empty",
      source_type: "internal",
      status: "ended",
    },
  ];
  rows.memberships = [
    {
      company_user_id: "member-new",
      company_workspace_id: "workspace-main",
      created_at: "2026-08-16T01:30:00.000Z",
    },
    {
      company_user_id: "member-old",
      company_workspace_id: "workspace-main",
      created_at: "2026-08-10T01:30:00.000Z",
    },
  ];
  rows.slackIntegrations = [
    { company_workspace_id: "workspace-main", status: "active" },
  ];
  rows.messages = [
    {
      company_workspace_id: "workspace-main",
      created_at: "2026-08-16T02:00:00.000Z",
      message_type: "slack",
      role: "user",
    },
    {
      company_workspace_id: "workspace-main",
      created_at: "2026-08-16T03:00:00.000Z",
      message_type: "chat",
      role: "user",
    },
  ];
  rows.recommendations = [
    {
      feedback: "accepted",
      feedback_at: "2026-08-16T04:00:00.000Z",
      id: "recommendation-accepted",
      role_id: "role-new",
      saved_stage: "accepted",
      talent_id: "talent-accepted",
    },
    {
      feedback: null,
      feedback_at: null,
      id: "recommendation-pending",
      role_id: "role-new",
      saved_stage: "pending_connection",
      talent_id: "talent-pending",
    },
    {
      feedback: "negative",
      feedback_at: "2026-08-16T04:30:00.000Z",
      id: "recommendation-rejected",
      role_id: "role-new",
      saved_stage: "rejected",
      talent_id: "talent-rejected",
    },
  ];
  rows.progress = [
    {
      company_user_id: "member-new",
      created_at: "2026-08-16T05:00:00.000Z",
      kind: "org_stage_change",
      metadata: { stage: "pending_connection" },
      recommendation_id: "recommendation-pending",
      role_id: "role-new",
      talent_id: "talent-pending",
    },
  ];
  rows.events = [
    {
      content: 'Mina · API.status: - "active" + "paused"',
      created_at: "2026-08-16T06:00:00.000Z",
      workspace_id: "workspace-main",
    },
    {
      content: 'Mina · Legacy.status: - "active" + "ended"',
      created_at: "2026-08-16T07:00:00.000Z",
      workspace_id: "workspace-main",
    },
    {
      content: "Mina · Deleted.is_expired: - false + true",
      created_at: "2026-08-16T08:00:00.000Z",
      workspace_id: "workspace-main",
    },
    {
      content: 'Other · API.status: - "active" + "paused"',
      created_at: "2026-08-16T08:30:00.000Z",
      workspace_id: "workspace-empty",
    },
  ];
  rows.toolMessages = [
    {
      company_workspace_id: "workspace-main",
      created_at: "2026-08-16T09:00:00.000Z",
      metadata: {
        toolResults: [
          { name: "get_roles", status: "success" },
          { name: "change_role_status", status: "error" },
        ],
      },
      status: "sent",
    },
    {
      company_workspace_id: "workspace-main",
      created_at: "2026-08-16T10:00:00.000Z",
      metadata: { toolResults: [{ name: "get_roles", status: "unchanged" }] },
      status: "sent",
    },
    {
      company_workspace_id: "workspace-main",
      created_at: "2026-08-16T10:30:00.000Z",
      metadata: { source: "org_role_creation_assistant" },
      status: "sent",
      thinking_logs: [
        { label: "링크 확인 실패", status: "error" },
        { label: "역할 정보 반영 완료", status: "done" },
      ],
    },
  ];

  const report = compileDailyCompanyStatsReport({ date: "2026-08-16", rows });
  const message = formatDailyCompanyStatsSlackMessage(report);
  const detail = formatDailyCompanyStatsSlackDetailMessages(report).join("\n");

  assert.deepEqual(report.totals, {
    acceptedCount: 1,
    acceptedTodayCount: 1,
    activeRoleCount: 1,
    chatTodayCount: 1,
    connectedCount: 0,
    connectedTodayCount: 0,
    memberCount: 2,
    newMemberTodayCount: 1,
    newRoleTodayCount: 1,
    pendingConnectionCount: 1,
    pendingConnectionTodayCount: 1,
    rejectedCount: 1,
    rejectedTodayCount: 1,
    rolling7Day: {
      acceptedCount: 1,
      connectedCount: 0,
      pendingConnectionCount: 1,
      rejectedCount: 1,
    },
    slackTodayCount: 1,
  });
  assert.equal(report.failedToolCallCount, 2);
  assert.deepEqual(report.tools, [
    { callCount: 1, failedCallCount: 1, name: "change_role_status" },
    { callCount: 2, failedCallCount: 0, name: "get_roles" },
    { callCount: 1, failedCallCount: 1, name: "open_url" },
    { callCount: 1, failedCallCount: 0, name: "update_role_draft" },
  ]);
  assert.match(
    message,
    /<https:\/\/matchharper\.com\/org\/jobs\?orgId=workspace-main&roleId=all\|수락 1> · 연결 대기 1 · 진행 중 0 · 거절 1/
  );
  assert.match(message, /- 채팅 수: Slack 1개 · web 1개/);
  assert.match(
    message,
    /- 지난 7일 신규 전환: 수락자 1명 · 연결 대기 1명 · 연결됨 0명 · 거절 1명/
  );
  assert.match(
    detail,
    /- <https:\/\/matchharper\.com\/ops\/company\?workspaceId=workspace-main&tab=conversations\|오늘 채팅 수: Slack 1개 · web 1개>/
  );
  assert.match(detail, /- 멤버 2명 \(\+오늘 1명\)/);
  assert.match(detail, /- 역할 등록: Platform/);
  assert.match(detail, /- 역할 중단: API/);
  assert.equal(detail.match(/- 역할 중단: API/g)?.length, 1);
  assert.match(detail, /- 역할 정지: Legacy/);
  assert.match(detail, /- 역할 삭제: Deleted/);
  assert.match(detail, /- 새로 등록된 연결 대기 1명/);
  assert.match(
    detail,
    /<https:\/\/matchharper\.com\/org\/jobs\?orgId=workspace-main&roleId=all\|새로 등록된 수락자 1명>/
  );
  assert.match(detail, /- 역할별 후보 상태/);
  assert.match(
    detail,
    /• Platform \(active\) — <https:\/\/matchharper\.com\/org\/jobs\?orgId=workspace-main&roleId=role-new\|수락 1> · 연결 대기 1 · 진행 중 0 · 거절 1/
  );
  assert.match(
    detail,
    /• API \(paused\) — <https:\/\/matchharper\.com\/org\/jobs\?orgId=workspace-main&roleId=role-paused\|수락 0> · 연결 대기 0 · 진행 중 0 · 거절 0/
  );
  assert.doesNotMatch(detail, /• Legacy \(ended\)/);
  assert.doesNotMatch(detail, /• Deleted \(ended\)/);
  assert.match(detail, /- get_roles: 2 calls \/ error 0/);
  assert.match(detail, /- open_url: 1 calls \/ error 1/);
  assert.match(detail, /- 실패한 tool call: 2개/);
  assert.doesNotMatch(detail, /No Change/);
});
