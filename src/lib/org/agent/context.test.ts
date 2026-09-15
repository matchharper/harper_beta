import assert from "node:assert/strict";
import test from "node:test";
import {
  CONVERSATION_CONTEXT_MAX_CHARS,
  CONVERSATION_MESSAGE_MAX_CHARS,
  formatOrgAgentContactSummary,
  formatRecentOrgAgentToolContext,
  type OrgAgentPromptContext,
} from "@/lib/org/agent/context";
import { buildDefaultOrgAgentLongTextObservations } from "@/lib/org/agent/contextVisibility";
import { formatOrgAgentCompanyContext } from "@/lib/org/agent/promptFormat";
import { selectRecentlyPresentedContactDraftReferences } from "@/lib/org/agent/toolState";

test("uses the expanded recent-conversation limits", () => {
  assert.equal(CONVERSATION_MESSAGE_MAX_CHARS, 6_000);
  assert.equal(CONVERSATION_CONTEXT_MAX_CHARS, 50_000);
});

test("contact summary exposes only bounded counts and an exact-read instruction", () => {
  const formatted = formatOrgAgentContactSummary({
    allResponseContactCount: 12,
    allSentCount: 31,
    asOf: "2026-09-15T03:00:00.000Z",
    recentActiveDraftCount: 2,
    recentResponseContactCount: 3,
    recentSentCount: 5,
    windowStart: "2026-09-08T03:00:00.000Z",
  });

  assert.match(formatted, /scope=workspace window=rolling_7_days/);
  assert.match(formatted, /recent_active_drafts=2/);
  assert.match(formatted, /recent_sent=5/);
  assert.match(formatted, /recent_contacts_with_response=3/);
  assert.match(formatted, /all_time_sent=31/);
  assert.match(formatted, /all_time_contacts_with_response=12/);
  assert.match(formatted, /list_contacts와 read_contact/);
  assert.match(formatted, /특정 연락이 없다고 판단하지 않는다/);
  assert.doesNotMatch(formatted, /contact_id|subject|body/);
});

test("unavailable contact summary never looks like an empty history", () => {
  const formatted = formatOrgAgentContactSummary(null);

  assert.match(formatted, /available=false/);
  assert.match(formatted, /연락이 없다고 추정하지 말고/);
  assert.doesNotMatch(formatted, /recent_sent=0|all_time_sent=0/);
});

test("recent tool context carries bounded outcomes and exact continuation identifiers", () => {
  const messages = [
    {
      content: "older",
      createdAt: "2026-09-15T00:00:00.000Z",
      id: 1,
      mentions: [],
      metadata: {
        toolResults: [
          {
            callId: "old",
            continuationContext: "role_id=too-old",
            name: "change_role_status",
            status: "unchanged" as const,
            summary: "old result",
          },
        ],
      },
      role: "assistant" as const,
      slackThreadId: "thread-1",
      slackUserId: null,
    },
    {
      content: "user",
      createdAt: "2026-09-15T00:01:00.000Z",
      id: 2,
      mentions: [],
      metadata: {},
      role: "user" as const,
      slackThreadId: "thread-1",
      slackUserId: "U1",
    },
    {
      content: "choose",
      createdAt: "2026-09-15T00:02:00.000Z",
      id: 3,
      mentions: [],
      metadata: {
        toolResults: [
          {
            callId: "latest",
            continuationContext:
              "role_id=role-1;notification_channel_options=C123|hiring|current=true|selected=false;assignee_options=user-1|민지|current=true",
            name: "change_role_status",
            status: "unchanged" as const,
            summary: "채널과 담당자 선택 필요",
          },
        ],
      },
      role: "assistant" as const,
      slackThreadId: "thread-1",
      slackUserId: null,
    },
  ];

  const formatted = formatRecentOrgAgentToolContext(messages);

  assert.match(formatted, /change_role_status\tunchanged/);
  assert.match(formatted, /role_id=role-1/);
  assert.match(formatted, /C123\|hiring\|current=true\|selected=false/);
  assert.match(formatted, /user-1\|민지\|current=true/);
  assert.doesNotMatch(formatted, /too-old/);
});

test("recent tool context expires outside the nearest four messages", () => {
  const messages = [
    {
      content: "old",
      createdAt: "2026-09-15T00:00:00.000Z",
      id: 1,
      mentions: [],
      metadata: {
        toolResults: [
          {
            callId: "old",
            continuationContext: "role_id=too-old",
            name: "change_role_status",
            status: "unchanged" as const,
            summary: "old result",
          },
        ],
      },
      role: "assistant" as const,
      slackThreadId: "thread-1",
      slackUserId: null,
    },
    ...Array.from({ length: 4 }, (_, index) => ({
      content: `later-${index}`,
      createdAt: "2026-09-15T00:01:00.000Z",
      id: index + 2,
      mentions: [],
      metadata: {},
      role: (index % 2 === 0 ? "user" : "assistant") as "assistant" | "user",
      slackThreadId: "thread-1",
      slackUserId: null,
    })),
  ];

  assert.equal(formatRecentOrgAgentToolContext(messages), "-");
});

test("default visibility treats the always-injected pitch document as complete", () => {
  const roleObservation = {
    key: "role_memory" as const,
    roleId: "role-1",
    value: null,
  };
  const unlinked = buildDefaultOrgAgentLongTextObservations({
    pitch: null,
    roleObservations: [roleObservation],
    workspaceMemoryAvailable: false,
    workspaceRequest: null,
  });
  assert.deepEqual(
    unlinked.map((item) => `${item.key}:${item.roleId ?? "workspace"}`),
    [
      "pitch:workspace",
      "workspace_request:workspace",
      "workspace_memory:workspace",
      "role_memory:role-1",
    ]
  );

  const linked = buildDefaultOrgAgentLongTextObservations({
    pitch: "이미 있음",
    roleObservations: [],
    workspaceMemoryAvailable: true,
    workspaceRequest: "이미 있음",
  });
  assert.equal(linked[0]?.key, "pitch");
  assert.equal(linked[0]?.value, "이미 있음");
});

test("company context always includes the complete pitch document and no legacy descriptions", () => {
  const pitch = `# 회사 문서\n\n${"전체 설명 ".repeat(1_500)}\n마지막 문장`;
  const formatted = formatOrgAgentCompanyContext({
    companyDetailsAvailable: true,
    companyName: "Example",
    pitch,
    workspaceMemoryAvailable: false,
    workspaceRequestExists: false,
  });

  assert.match(formatted, /pitch_document_complete\ttrue/);
  assert.match(formatted, /<company_information_document>/);
  assert.match(formatted, /# 회사 문서/);
  assert.match(formatted, /마지막 문장/);
  assert.doesNotMatch(formatted, /brief|company_description|short_description/);
});

test("oversized recent pipeline data is replaced by one unambiguous incomplete marker", async () => {
  const { formatRecentRecommendations } =
    await import("@/lib/org/agent/contextBudget");
  const rows = Object.assign(
    Array.from({ length: 20 }, (_, index) => ({
      candidate: {
        email: null,
        headline: `긴 헤드라인 ${index} ${"h".repeat(300)}`,
        name: `후보자 ${index} ${"n".repeat(180)}`,
        talentId: `talent-${index}-${"t".repeat(120)}`,
      },
      recommendationId: `recommendation-${index}`,
      role: {
        name: `포지션 ${index} ${"r".repeat(180)}`,
        roleId: `role-${index}-${"i".repeat(120)}`,
      },
      stage: "pending_connection",
      stageLabel: null,
    })),
    { recentComplete: true, returnedItems: 20 }
  ) as any;

  const formatted = formatRecentRecommendations(rows);

  assert.match(formatted, /recent_complete=false/);
  assert.match(formatted, /status=truncated/);
  assert.doesNotMatch(formatted, /recent_complete=true/);
  assert.doesNotMatch(formatted, /talent-0/);
});

test("total context truncation revokes every retained completeness marker", async () => {
  const { enforceOrgAgentContextBudget } =
    await import("@/lib/org/agent/contextBudget");
  const retainedMoreData = {
    companyDetails: {
      complete: true,
      fields: {
        workspace_request: {
          complete: true,
          oversized: false,
          truncated: false,
        },
      },
      values: { workspace_request: "전체 요청" },
    },
    members: {
      complete: true,
      items: [],
      returnedCount: 0,
      totalCount: 0,
    },
    workspaceMemory: {
      complete: true,
      content: "전체 메모",
      exists: true,
      truncated: false,
    },
  } as any;
  const context = {
    companyText: "c".repeat(97_000),
    completeRoleRequestIds: [],
    contextNotesText: "-",
    conversationText: "-",
    pendingUpdateText: "-",
    recentContactsText: "recent_sent=2\nall_time_sent=10",
    recentRecommendationsText:
      "returned_items=1 recent_complete=true\ntalent_id | name",
    retainedDataText: [
      "serialization_complete=true",
      "workspace_memory_complete=true",
      "전체 메모",
    ].join("\n"),
    retainedMoreData,
    roles: [],
    rolesText: "-",
    summariesText: "-",
    workspace: {
      companyDescription: null,
      companyName: "Test",
      logoUrl: null,
      pitch: null,
      request: null,
      updatedAt: "2026-07-30T10:23:45.123Z",
      workspaceId: "workspace-1",
    },
  } satisfies OrgAgentPromptContext;

  const bounded = enforceOrgAgentContextBudget(context);

  assert.match(bounded.recentRecommendationsText, /recent_complete=false/);
  assert.doesNotMatch(
    bounded.recentRecommendationsText,
    /recent_complete=true/
  );
  assert.match(bounded.retainedDataText ?? "", /serialization_complete=false/);
  assert.doesNotMatch(bounded.retainedDataText ?? "", /complete=true/);
  assert.equal(retainedMoreData.companyDetails.complete, false);
  assert.equal(
    retainedMoreData.companyDetails.fields.workspace_request.complete,
    false
  );
  assert.equal(
    retainedMoreData.companyDetails.fields.workspace_request.truncated,
    true
  );
  assert.equal(retainedMoreData.workspaceMemory.complete, false);
  assert.equal(retainedMoreData.workspaceMemory.truncated, true);
  assert.equal(retainedMoreData.members.complete, false);
});

test("conversation truncation preserves the current Slack thread ID", async () => {
  const { enforceOrgAgentContextBudget, ORG_AGENT_CONTEXT_MAX_CHARS } =
    await import("@/lib/org/agent/contextBudget");
  const threadId = "thread-1";
  const context = {
    companyText: "c".repeat(ORG_AGENT_CONTEXT_MAX_CHARS - 500),
    contextNotesText: "-",
    conversationText: [
      `scope=current_thread thread_id=${threadId} returned_items=24 has_more=true`,
      "speaker\treferences\tmessage",
      `user\t-\t${"m".repeat(3_000)}`,
    ].join("\n"),
    recentRecommendationsText: "-",
    rolesText: "-",
    summariesText: "-",
  } as any;

  enforceOrgAgentContextBudget(context);

  assert.match(context.conversationText, /older_conversation_truncated=true/);
  assert.match(context.conversationText, new RegExp(`thread_id=${threadId}`));
});

test("keeps every draft reference from the nearest draft presentation in the recent four messages", () => {
  const refs = Array.from({ length: 15 }, (_, index) => ({
    contactId: `contact-${index + 1}`,
    revision: 1,
  }));

  assert.deepEqual(
    selectRecentlyPresentedContactDraftReferences([
      {
        metadata: { contactDraftRefs: [{ contactId: "older", revision: 1 }] },
        role: "assistant",
      },
      { metadata: {}, role: "user" },
      { metadata: { contactDraftRefs: refs }, role: "assistant" },
      { metadata: {}, role: "user" },
      { metadata: {}, role: "assistant" },
    ]),
    refs
  );
});

test("does not reuse a draft presentation older than four conversation messages", () => {
  assert.deepEqual(
    selectRecentlyPresentedContactDraftReferences([
      {
        metadata: {
          contactDraftRefs: [{ contactId: "too-old", revision: 1 }],
        },
        role: "assistant",
      },
      { metadata: {}, role: "user" },
      { metadata: {}, role: "assistant" },
      { metadata: {}, role: "user" },
      { metadata: {}, role: "assistant" },
    ]),
    []
  );
});
