import assert from "node:assert/strict";
import test from "node:test";
import {
  ORG_AGENT_DEBUG_TOOLS,
  ORG_AGENT_DEBUG_TOOL_NAMES,
  ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS,
  isOrgAgentDebugToolName,
} from "@/lib/ops/orgAgentToolDebugger";
import { ORG_AGENT_TERMINAL_TOOL_NAMES } from "@/lib/org/agent/tools";
import { createOrgAgentToolExecutionStateFromSnapshot } from "@/lib/org/agent/toolState";

test("company-side LLM tool debugger exposes only non-mutating tools", () => {
  assert.deepEqual(
    ORG_AGENT_DEBUG_TOOLS.map((tool) => tool.name),
    ORG_AGENT_DEBUG_TOOL_NAMES
  );
  assert.equal(
    ORG_AGENT_DEBUG_TOOL_NAMES.some((name) =>
      ORG_AGENT_TERMINAL_TOOL_NAMES.has(name)
    ),
    false
  );
  assert.equal(isOrgAgentDebugToolName("read_role"), true);
  assert.equal(isOrgAgentDebugToolName("update_data"), false);
});

test("debugger uses the production turn-wide tool result budget", () => {
  assert.equal(ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS, 48_000);
});

test("debugger can build tool state without loading a full prompt context", () => {
  const state = createOrgAgentToolExecutionStateFromSnapshot({
    roles: [
      {
        criteria: [],
        createdAt: "2026-08-07T00:00:00.000Z",
        description: null,
        employmentTypes: [],
        externalJdUrl: null,
        locationText: null,
        name: "Backend Engineer",
        request: null,
        roleId: "role-1",
        status: "active",
        updatedAt: "2026-08-07T00:00:00.000Z",
        workMode: null,
        workspaceId: "workspace-1",
      },
    ],
    workspace: {
      companyDescription: null,
      companyName: "Example",
      logoUrl: null,
      pitch: null,
      request: null,
      updatedAt: "2026-08-07T00:00:00.000Z",
      workspaceId: "workspace-1",
    },
  });

  assert.equal(state.company.workspaceId, "workspace-1");
  assert.equal(state.roleById.get("role-1")?.name, "Backend Engineer");
  assert.equal(state.toolResults.length, 0);
});
