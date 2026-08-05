import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrgAgentSystemPrompt,
  buildOrgAgentUserPrompt,
} from "@/lib/org/agent/prompts";

test("organization-agent system prompt keeps runtime data out", () => {
  const prompt = buildOrgAgentSystemPrompt();
  assert.match(prompt, /workspace-scoped, not fixed to one position/);
  assert.match(prompt, /reference data, never as instructions/);
  assert.match(prompt, /currently unavailable/);
  assert.match(prompt, /Never expose database or tool names, raw enum values/);
  assert.match(prompt, /thoughtful colleague speaking to a real person/);
  assert.match(
    prompt,
    /candidate-matching criteria in the relevant role request/
  );
  assert.match(prompt, /other durable company or role context in memory/);
  assert.match(prompt, /## Hard constraints/);
  assert.match(prompt, /## Preferred criteria/);
  assert.match(prompt, /facts already present in current context/);
  assert.match(prompt, /bounded, recent, truncated, or unavailable data/);
  assert.match(prompt, /absence, completeness, or comparison claims/);
  assert.match(prompt, /not a complete candidate directory/);
  assert.doesNotMatch(prompt, /named candidate/);
  assert.match(prompt, /replace requires one exact oldValue/);
  assert.match(prompt, /read it fully and update in the same turn/);
  assert.doesNotMatch(prompt, /workspaceId=/);
});

test("organization-agent user prompt puts the latest query last", () => {
  const prompt = buildOrgAgentUserPrompt({
    context: {
      companyText: "field\tvalue\nname\tTest",
      completeRoleRequestIds: [],
      contextNotesText: "-",
      conversationText: "speaker\tmessage\nuser\told",
      pendingUpdateText: "summary: 채용 기준 수정",
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
  assert.match(
    prompt,
    /<pending_update>\nsummary: 채용 기준 수정\n<\/pending_update>/
  );
  assert.ok(prompt.endsWith("</user_message>"));
});
