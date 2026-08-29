import assert from "node:assert/strict";
import test from "node:test";

import { formatTalentMessageContentForLlmPrompt } from "./opportunityFeedbackNote";

test("strips opportunity run metadata before adding a message to an LLM prompt", () => {
  const formatted = formatTalentMessageContentForLlmPrompt({
    content: [
      "검색을 접수했어요.",
      "",
      "[opportunity_run](/career?opportunityRunId=00000000-0000-4000-8000-000000000001&relation=accepted)",
    ].join("\n"),
    messageType: "chat",
  });

  assert.equal(formatted, "검색을 접수했어요.");
});

test("adds a human-readable Korean-local timestamp when chat history requests it", () => {
  const formatted = formatTalentMessageContentForLlmPrompt(
    {
      content: "지난 대화 내용",
      created_at: "2026-08-24T01:25:03.102495+00:00",
      messageType: "chat",
    },
    { includeCreatedAt: true }
  );

  assert.equal(formatted, "[8월 24일 10:25]\n지난 대화 내용");
  assert.doesNotMatch(formatted, /2026-08-24T/);
});

test("strips re-engagement UI action metadata from later LLM context", () => {
  const formatted = formatTalentMessageContentForLlmPrompt({
    content: `회사 질문을 바로 확인할 수 있어요.
[[CAREER_REENGAGEMENT_ACTIONS]]
{"actions":[{"label":"질문에 답하기","action":{"type":"open_pending_action","ref":"signedPayload.signedValue"}}]}
[[/CAREER_REENGAGEMENT_ACTIONS]]`,
    messageType: "chat",
  });

  assert.equal(formatted, "회사 질문을 바로 확인할 수 있어요.");
  assert.doesNotMatch(formatted, /signedPayload|open_pending_action/);
});
