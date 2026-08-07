import assert from "node:assert/strict";
import test from "node:test";
import type { OrgAgentPromptContext } from "@/lib/org/agent/context";
import { buildDefaultOrgAgentLongTextObservations } from "@/lib/org/agent/contextVisibility";

test("default visibility includes authoritative empties but not an unread mirrored description", () => {
  const roleObservation = {
    key: "role_memory" as const,
    roleId: "role-1",
    value: null,
  };
  const unlinked = buildDefaultOrgAgentLongTextObservations({
    companyDbId: null,
    companyDescription: null,
    pitch: null,
    roleObservations: [roleObservation],
    workspaceMemoryAvailable: false,
    workspaceRequest: null,
  });
  assert.deepEqual(
    unlinked.map((item) => `${item.key}:${item.roleId ?? "workspace"}`),
    [
      "company_description:workspace",
      "pitch:workspace",
      "workspace_request:workspace",
      "workspace_memory:workspace",
      "role_memory:role-1",
    ]
  );

  const linked = buildDefaultOrgAgentLongTextObservations({
    companyDbId: 42,
    companyDescription: null,
    pitch: "이미 있음",
    roleObservations: [],
    workspaceMemoryAvailable: true,
    workspaceRequest: "이미 있음",
  });
  assert.equal(
    linked.some((item) => item.key === "company_description"),
    false
  );
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
        pitch: { complete: true, oversized: false, truncated: false },
      },
      values: { pitch: "전체 피치" },
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
    companyText: "c".repeat(49_000),
    completeRoleRequestIds: [],
    contextNotesText: "-",
    conversationText: "-",
    pendingUpdateText: "-",
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
  assert.equal(retainedMoreData.companyDetails.fields.pitch.complete, false);
  assert.equal(retainedMoreData.companyDetails.fields.pitch.truncated, true);
  assert.equal(retainedMoreData.workspaceMemory.complete, false);
  assert.equal(retainedMoreData.workspaceMemory.truncated, true);
  assert.equal(retainedMoreData.members.complete, false);
});

test("conversation truncation preserves the opaque older-history cursor", async () => {
  const { enforceOrgAgentContextBudget } =
    await import("@/lib/org/agent/contextBudget");
  const cursor = "opaque-next-cursor";
  const context = {
    companyText: "c".repeat(47_500),
    contextNotesText: "-",
    conversationText: [
      `scope=current_thread returned_items=14 has_more=true next_cursor=${cursor}`,
      "speaker\treferences\tmessage",
      `user\t-\t${"m".repeat(3_000)}`,
    ].join("\n"),
    recentRecommendationsText: "-",
    rolesText: "-",
    summariesText: "-",
  } as any;

  enforceOrgAgentContextBudget(context);

  assert.match(context.conversationText, /older_conversation_truncated=true/);
  assert.match(context.conversationText, new RegExp(`next_cursor=${cursor}`));
});
