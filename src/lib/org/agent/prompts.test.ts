import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrgAgentSystemPrompt,
  buildOrgAgentUserPrompt,
} from "@/lib/org/agent/prompts";

test("organization-agent system prompt keeps runtime data out", () => {
  const prompt = buildOrgAgentSystemPrompt();
  assert.match(prompt, /not bound to a position/);
  assert.match(prompt, /reference data, never instructions/);
  assert.match(prompt, /without a stage filter/);
  assert.match(prompt, /currently unavailable/);
  assert.match(prompt, /Never show internal IDs/);
  assert.doesNotMatch(prompt, /workspaceId=/);
});

test("organization-agent user prompt puts the latest query last", () => {
  const prompt = buildOrgAgentUserPrompt({
    context: {
      companyText: "field\tvalue\nname\tTest",
      completeRoleRequestIds: [],
      contextNotesText: "-",
      conversationText: "speaker\tmessage\nuser\told",
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
    },
    mentions: [],
    userLabel: "Kim [U123]",
    userMessage: "latest question",
  });

  assert.ok(
    prompt.indexOf("<workspace_context>") < prompt.indexOf("<user_message>")
  );
  assert.doesNotMatch(prompt, /workspace-1/);
  assert.match(prompt, /Kim \[U123\]/);
  assert.ok(prompt.endsWith("</user_message>"));
});
