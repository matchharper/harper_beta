import assert from "node:assert/strict";
import test from "node:test";
import { ORG_AGENT_TOOLS, isOrgAgentToolName } from "@/lib/org/agent/tools";

test("candidate connection tools are paused and not exposed", () => {
  assert.equal(isOrgAgentToolName("prepare_candidate_connection"), false);
  const toolNames: string[] = ORG_AGENT_TOOLS.map((item) => item.function.name);

  assert.equal(toolNames.includes("prepare_candidate_connection"), false);
  assert.equal(toolNames.includes("decide_candidate_connection"), false);
  assert.equal(isOrgAgentToolName("decide_candidate_connection"), false);
});
