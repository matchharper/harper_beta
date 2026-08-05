import assert from "node:assert/strict";
import test from "node:test";
import { parseCompanyDataChanges } from "@/lib/org/agent/companyDataMutation";
import type { OrgAgentPromptContext } from "@/lib/org/agent/context";
import {
  createOrgAgentToolExecutionState,
  enforceOrgAgentTerminalMutationOutcome,
  isOrgAgentLongTextComplete,
  markOrgAgentLongTextComplete,
  promoteOrgAgentToolReadVisibility,
} from "@/lib/org/agent/toolState";

function minimalContext(
  defaultLongTextObservations: NonNullable<
    OrgAgentPromptContext["defaultLongTextObservations"]
  > = []
) {
  return {
    companyText: "-",
    completeRoleRequestIds: [],
    contextNotesText: "-",
    conversationText: "-",
    defaultLongTextObservations,
    recentRecommendationsText: "-",
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
}

test("role request reads become writable only after the tool batch", () => {
  const context = {
    companyText: "-",
    completeRoleRequestIds: ["role-visible"],
    contextNotesText: "-",
    conversationText: "-",
    recentRecommendationsText: "-",
    roles: [
      {
        createdAt: "2026-07-30T10:23:45.123Z",
        description: null,
        employmentTypes: [],
        externalJdUrl: null,
        locationText: null,
        name: "Visible",
        request: "full request",
        roleId: "role-visible",
        status: "active",
        updatedAt: "2026-07-30T10:23:45.123Z",
        workMode: null,
        workspaceId: "workspace-1",
      },
      {
        createdAt: "2026-07-30T10:23:45.123Z",
        description: null,
        employmentTypes: [],
        externalJdUrl: null,
        locationText: null,
        name: "Compacted",
        request: "long request",
        roleId: "role-compacted",
        status: "active",
        updatedAt: "2026-07-30T10:23:45.123Z",
        workMode: null,
        workspaceId: "workspace-1",
      },
    ],
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
  const state = createOrgAgentToolExecutionState(context);

  assert.equal(state.fullRoleRequestIds.has("role-visible"), true);
  assert.equal(state.fullRoleRequestIds.has("role-compacted"), false);

  // read_role has executed, but a parallel update in the same tool batch must
  // not be allowed to act as though the model already saw that result.
  state.pendingFullRoleRequestIds.add("role-compacted");
  assert.equal(state.fullRoleRequestIds.has("role-compacted"), false);

  promoteOrgAgentToolReadVisibility(state);
  assert.equal(state.fullRoleRequestIds.has("role-compacted"), true);
  assert.equal(state.pendingFullRoleRequestIds.size, 0);
});

test("long-text rewrite visibility is bound to the exact observed value", () => {
  const state = createOrgAgentToolExecutionState(
    minimalContext([{ key: "workspace_memory", roleId: null, value: null }])
  );

  assert.equal(
    isOrgAgentLongTextComplete({
      currentValue: null,
      key: "workspace_memory",
      roleId: null,
      state,
    }),
    true
  );
  assert.equal(
    isOrgAgentLongTextComplete({
      currentValue: "다른 사용자가 방금 쓴 메모",
      key: "workspace_memory",
      roleId: null,
      state,
    }),
    false
  );

  markOrgAgentLongTextComplete({
    key: "role_request",
    observedValue: "A",
    roleId: "role-1",
    state,
  });
  assert.equal(
    isOrgAgentLongTextComplete({
      currentValue: "A",
      key: "role_request",
      roleId: "role-1",
      state,
    }),
    true
  );
  assert.equal(
    isOrgAgentLongTextComplete({
      currentValue: "B",
      key: "role_request",
      roleId: "role-1",
      state,
    }),
    false
  );
});

test("an authoritative empty long-text target enables the large rewrite completion budget", async () => {
  const { getOrgAgentToolCompletionMaxTokens } =
    await import("@/lib/org/agent/toolCompletionBudget");
  const state = createOrgAgentToolExecutionState(
    minimalContext([{ key: "workspace_memory", roleId: null, value: null }])
  );
  const eightThousandCharacters = "가".repeat(8_000);
  const parsed = parseCompanyDataChanges({
    changes: [
      {
        key: "workspace_memory",
        kind: "rewrite",
        value: eightThousandCharacters,
      },
    ],
    summary: "회사 메모 작성",
  });

  assert.equal(parsed.changes[0].value, eightThousandCharacters);
  assert.equal(state.completeLongTextTargets.size, 1);
  assert.equal(getOrgAgentToolCompletionMaxTokens(state), 32_000);
  assert.equal(
    getOrgAgentToolCompletionMaxTokens(
      createOrgAgentToolExecutionState(minimalContext())
    ),
    4_000
  );
});

test("pending proposal lookup ignores expired rows at the query boundary", async () => {
  const { hasPendingOrgAgentUpdateProposal } =
    await import("@/lib/org/agent/proposals");
  const filters: Array<[string, unknown]> = [];
  const query = {
    eq(field: string, value: unknown) {
      filters.push([`eq:${field}`, value]);
      return this;
    },
    gt(field: string, value: unknown) {
      filters.push([`gt:${field}`, value]);
      return this;
    },
    limit() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve({ data: null, error: null });
    },
    select() {
      return this;
    },
  };
  const before = Date.now();
  const pending = await hasPendingOrgAgentUpdateProposal({
    admin: { from: () => query } as any,
    scopeKey: "chat:conversation-1",
    workspaceId: "workspace-1",
  });
  const after = Date.now();
  const expiryFilter = filters.find(([name]) => name === "gt:expires_at");

  assert.equal(pending, false);
  assert.ok(expiryFilter);
  const expiry = new Date(String(expiryFilter[1])).getTime();
  assert.ok(expiry >= before && expiry <= after);
});

test("disabled candidate mutation tools are rejected before any side effect", async () => {
  const { assertOrgAgentToolAvailable, OrgAgentToolInputError } =
    await import("@/lib/org/agent/toolAvailability");
  let databaseCalls = 0;
  const state = createOrgAgentToolExecutionState(minimalContext());

  assert.throws(
    () => {
      assertOrgAgentToolAvailable("decide_candidate_connection");
      databaseCalls += 1;
    },
    (error: unknown) =>
      error instanceof OrgAgentToolInputError &&
      error.message === "This tool is not available"
  );
  assert.equal(databaseCalls, 0);
  assert.equal(state.actions.length, 0);
  assert.equal(state.updateSummaries.length, 0);
});

test("a failed terminal mutation cannot be presented as a success", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.toolResults.push({
    callId: "update-1",
    name: "update_data",
    status: "error",
    summary: "변경 적용 실패",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(state, "요청하신 내용을 반영했습니다."),
    "요청하신 변경은 적용되지 않았습니다. 내용을 다시 확인한 뒤 시도해 주세요."
  );
});
