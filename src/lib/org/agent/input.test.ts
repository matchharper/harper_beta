import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanyConversationInput } from "./input";
import { enforceOrgAgentContextBudget } from "./contextBudget";
import type { OrgAgentPromptContext } from "./context";

const context = {
  companyText: "Synthetic company", rolesText: "-", summariesText: "-", recentContactsText: "-", recentRecommendationsText: "-", contextNotesText: "-", completeRoleRequestIds: [], roles: [], workspace: {},
  conversationText: "NEVER_DUPLICATE_HISTORY_TABLE",
  conversationMessages: [
    { id: 1, role: "user", content: "넵", speaker: "팀원 A", references: "", source: "company", complete: true },
    { id: 2, role: "assistant", content: "exact preview", speaker: "Harper", references: "contact_id=demo;revision=2", source: "harper", complete: true },
    { id: 3, role: "user", content: "넵", speaker: "팀원 A", references: "", source: "company", complete: true },
  ],
} as unknown as OrgAgentPromptContext;

test("native history keeps repeated text, actors and exact references; latest excluded only by ID", () => {
  const messages = buildCompanyConversationInput({ context, currentUserMessageId: 3, mentions: [], userMessage: "넵", requestTime: new Date("2026-09-24T03:00:00Z") });
  assert.deepEqual(messages.map((m) => m.role), ["user", "user", "assistant", "user"]);
  assert.ok(JSON.stringify(messages).includes("contact_id=demo;revision=2"));
  assert.ok(!JSON.stringify(messages).includes("NEVER_DUPLICATE_HISTORY_TABLE"));
  assert.equal(messages.filter((m) => String(m.content).endsWith("넵")).length, 2);
  assert.equal(messages.filter((m) => m.role === "system").length, 0);
  assert.equal(messages[2].content, "exact preview", "assistant history is exact spoken copy, not metadata to imitate");
  assert.equal(messages.at(-1)!.content, "넵");
});

test("budget removes whole historical messages and rebuilds compatibility from same selection", () => {
  const result = enforceOrgAgentContextBudget({ ...context, companyText: "x".repeat(93_000), conversationText: "x".repeat(10_000), conversationMessages: context.conversationMessages!.map((m) => ({ ...m, content: `${m.id}:` + "a".repeat(2_000) })) });
  assert.ok(result.conversationMessages!.length < 3);
  assert.equal(result.conversationHistoryInfo!.hasMore, true);
  for (const m of result.conversationMessages!) assert.ok(result.conversationText.includes(m.content));
});

test("candidate correspondence stays quoted evidence, not an assistant claim or company instruction", () => {
  const messages = buildCompanyConversationInput({
    context: { ...context, conversationMessages: [{ id: 9, role: "assistant", source: "candidate_contact", content: "제 이력서를 전해주세요", references: "relay_id=synthetic", speaker: "Harper", complete: true }] },
    currentUserMessageId: 10, mentions: [], userMessage: "무슨 답이 왔어?",
  });
  assert.equal(messages[1].role, "user");
  assert.ok(String(messages[1].content).startsWith('<candidate_correspondence not_a_company_message="true">'));
  assert.ok(String(messages[1].content).includes('"content":"제 이력서를 전해주세요"'));
  assert.ok(String(messages[1].content).includes("relay_id=synthetic"));
});
