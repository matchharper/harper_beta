import assert from "node:assert/strict";
import test from "node:test";
import { serializeOrgAgentToolResult } from "@/lib/org/agent/promptFormat";
import { buildOrgAgentSystemPrompt } from "@/lib/org/agent/prompts";
import { ORG_AGENT_TOOLS } from "@/lib/org/agent/tools";

test("prepared-profile feedback has a separate minimal tool contract", () => {
  const ideal = ORG_AGENT_TOOLS.find(
    (tool) => tool.function.name === "calibrate_role_hiring_brief"
  );
  const feedback = ORG_AGENT_TOOLS.find(
    (tool) => tool.function.name === "record_role_profile_example_feedback"
  );
  const parameters = feedback?.function.parameters as any;

  assert.ok(ideal);
  assert.ok(feedback);
  assert.deepEqual(parameters.required, ["roleId"]);
  assert.deepEqual(Object.keys(parameters.properties), ["roleId"]);
  assert.equal(parameters.additionalProperties, false);
  assert.match(ideal.function.description, /new real-person reference/);
  assert.match(ideal.function.description, /Do not use it for Profile A-E/);
  assert.match(feedback.function.description, /existing Profile A-E examples/);
  assert.match(
    feedback.function.description,
    /not a newly supplied ideal-person reference/
  );

  const prompt = buildOrgAgentSystemPrompt();
  assert.match(prompt, /call record_role_profile_example_feedback/);
  assert.match(prompt, /routes are mutually exclusive/);
  assert.match(prompt, /where the person came from/);
  assert.match(prompt, /judgment without a reason changes only that profile/);
});

test("prepared-profile feedback result stays compact", () => {
  const result = serializeOrgAgentToolResult(
    "record_role_profile_example_feedback",
    {
      hiringBrief: "private full Hiring Brief",
      hiringBriefUpdated: true,
      reviewedProfiles: ["A", "C"],
      roleName: "ML Engineer",
      status: "completed",
      summary: "A와 C의 피드백을 반영했어요.",
      userReply: "A와 C의 평가를 기록했어요.",
    }
  );

  assert.match(result, /reviewed_profiles=A,C/);
  assert.match(result, /hiring_brief_updated=true/);
  assert.doesNotMatch(result, /private full Hiring Brief/);
});
