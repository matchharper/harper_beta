import assert from "node:assert/strict";
import test from "node:test";
import { ORG_AGENT_TOOLS } from "@/lib/org/agent/tools";
import { CRITERIA_PROPOSALS_ENABLED } from "@/lib/org/criteriaProposals";

// S2 G: Harper is told that reason tags lead to criteria suggestions only
// while those suggestions are switched on.
test("the reason tag inputs mention criteria suggestions only while they run", () => {
  const suggestion = /Harper suggests making it stricter in the Role's To-do; nothing changes until the company accepts/;
  for (const name of ["decide_company_intro", "decide_candidate_connection", "move_candidate_stage"]) {
    const tool = ORG_AGENT_TOOLS.find((item) => item.function.name === name)!;
    const tags = (tool.function.parameters as any).properties.reasonTags.description as string;
    assert.match(tags, /this Role's criterion ids from read_role, or experience_skills, role_fit, working_conditions, timing/, name);
    if (CRITERIA_PROPOSALS_ENABLED) assert.match(tags, suggestion, name);
    else assert.doesNotMatch(tags, /suggest/i, name);
  }
});
