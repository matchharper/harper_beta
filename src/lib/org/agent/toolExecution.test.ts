import assert from "node:assert/strict";
import test from "node:test";
import type { OrgAgentPromptContext } from "@/lib/org/agent/context";
import {
  createOrgAgentToolExecutionState,
  promoteOrgAgentToolReadVisibility,
} from "@/lib/org/agent/toolState";

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
