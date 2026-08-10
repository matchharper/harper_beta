import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoleCreationSystemPrompt,
  buildRoleCreationUserPrompt,
} from "@/lib/org/agent/roleCreationPrompt";

test("registered role chats edit immediately without asking to create again", () => {
  const prompt = buildRoleCreationSystemPrompt({
    editingRegisteredRole: true,
  });

  assert.match(prompt, /REGISTERED ROLE EDITING/);
  assert.match(prompt, /Do not request role-creation confirmation/);
  assert.match(
    prompt,
    /Apply facts the user supplies through the update tools/
  );
  assert.match(prompt, /Creation-only gaps are not blockers/);
});

test("guides adaptive role discovery without turning it into a fixed script", () => {
  const prompt = buildRoleCreationSystemPrompt();

  assert.match(
    prompt,
    /not a questionnaire, fixed script, or mandatory sequence/
  );
  assert.match(prompt, /existing JD, job-posting URL, or file/);
  assert.match(prompt, /draft from the information they have/);
  assert.match(prompt, /single easy-to-scan grouped question/);
  assert.match(
    prompt,
    /location, employment type, work mode, compensation range/
  );
  assert.match(
    prompt,
    /compensation as optional rather than an activation blocker/
  );
  assert.match(
    prompt,
    /private matching judgment that a public JD may not contain/
  );
  assert.match(prompt, /context can remain internal and need not be published/);
  assert.match(prompt, /visited in any order, combined, revisited, or skipped/);
  assert.match(
    prompt,
    /prioritize understanding the opportunity and matching criteria/
  );
});

test("includes server-resolved talent mentions in role creation context", () => {
  const prompt = buildRoleCreationUserPrompt({
    attachments: [],
    history: [],
    mentions: [
      {
        displayName: "김테스트",
        recommendationId: "recommendation-1",
        roleId: "role-previous",
        talentId: "talent-1",
      },
    ],
    state: {
      assigneeUserIds: [],
      channels: [],
      currentUser: { name: "채용 담당자" },
      members: [],
      metadata: {},
      role: { name: "Founding Designer" },
      workspace: {
        brief: null,
        companyDescription: null,
        companyName: "Harper",
        pitch: null,
        request: null,
      },
    } as any,
    userMessage: "@김테스트 같은 분을 찾고 싶어요.",
  });

  assert.match(prompt, /<RESOLVED_TALENT_MENTIONS>/);
  assert.match(prompt, /김테스트/);
  assert.match(prompt, /recommendation-1/);
  assert.match(prompt, /talent-1/);
});
