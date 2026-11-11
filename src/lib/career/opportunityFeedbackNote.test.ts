import assert from "node:assert/strict";
import test from "node:test";

import { formatTalentMessageContentForLlmPrompt, formatTalentMessageReferenceForLlm } from "./opportunityFeedbackNote";

test("a vague user message retains its observed screen context without rewriting the user's words", () => {
  const content = "여기는 어떤 일을 하는 곳이에요?";
  const message = { role: "user", content, payload: { viewedOpportunity: {
    roleId: "00000000-0000-4000-8000-000000000001", label: "Example · Engineer",
  } } };
  const formatted = formatTalentMessageContentForLlmPrompt(message);
  assert.ok(formatted.startsWith(content));
  assert.match(formatted, /Example · Engineer/);
  assert.match(formatted, /viewing is not acceptance or sharing consent/);
  assert.equal(message.content, content);
  assert.equal(formatTalentMessageContentForLlmPrompt({ ...message, payload: {} }), content);
});

test("browser cards remain visible to the model without passing viewer credentials", () => {
  const formatted = formatTalentMessageReferenceForLlm({
    content: "", message_type: "browser_session",
    payload: { session_id: "session-for-this-conversation", requestId: "internal-request" },
  });
  assert.match(formatted, /Browser session: session-for-this-conversation/);
  assert.doesNotMatch(formatted, /internal-request/);
});

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

test("adds a localized timestamp for old chat history", () => {
  const formatted = formatTalentMessageContentForLlmPrompt(
    {
      content: "지난 대화 내용",
      created_at: "2026-08-24T01:25:03.102495+00:00",
      messageType: "chat",
    },
    {
      includeCreatedAt: true,
      now: new Date("2026-09-14T00:00:00.000Z"),
      preferredLocale: "ko",
      timeZone: "Asia/Seoul",
    }
  );

  assert.equal(formatted, "[8월 24일 10:25]\n지난 대화 내용");
  assert.doesNotMatch(formatted, /2026-08-24T/);
});

test("does not prefix recent chat history with a time", () => {
  const formatted = formatTalentMessageContentForLlmPrompt(
    {
      content: "방금 보낸 내용",
      created_at: "2026-09-14T11:30:01.000Z",
      messageType: "chat",
    },
    {
      includeCreatedAt: true,
      now: new Date("2026-09-14T12:00:00.000Z"),
      preferredLocale: "ko",
      timeZone: "Asia/Seoul",
    }
  );

  assert.equal(formatted, "방금 보낸 내용");
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

test("a decline saved with the candidate's note lets the Career agent decide what reaches the company", () => {
  const base = { role: "user", content: "(Internal) Engineer at Example 제외됨", messageType: "opportunity_feedback_note" };
  const plain = formatTalentMessageContentForLlmPrompt(base);
  assert.doesNotMatch(plain, /contact_company/);
  const declined = { ...base, payload: { opportunityDecision: {
    decision: "decline", recommendationId: "rec-1", roleId: "role-1", note: "  회사에 감사하다고 전해 주세요.  ",
    // Older payloads may carry the picked options; they never reach the model.
    selectedReasons: ["역할이나 직무가 맞지 않아요"],
  } } };
  // The request being processed now (the Career inbox) carries the instruction.
  const formatted = formatTalentMessageContentForLlmPrompt(declined, { currentInput: true });
  assert.ok(formatted.startsWith(plain));
  assert.match(formatted, /Declined opportunity: rec-1; Role: role-1/);
  assert.match(formatted, /회사에 감사하다고 전해 주세요\.$/m);
  assert.doesNotMatch(formatted, /역할이나 직무가 맞지 않아요|Reasons the candidate selected/);
  assert.match(formatted, /contact_company and recommendationId=rec-1/);
  assert.match(formatted, /send nothing/);
  // Later turns read it as history: the saved fact and the note, no instruction to send.
  const history = formatTalentMessageContentForLlmPrompt(declined);
  assert.match(history, /Declined opportunity: rec-1; Role: role-1\. The decline and this note were saved earlier\./);
  assert.match(history, /회사에 감사하다고 전해 주세요\.$/m);
  assert.doesNotMatch(history, /contact_company|send that part|역할이나 직무가 맞지 않아요/);
  // No note: nothing about the decline or the company.
  const empty = formatTalentMessageContentForLlmPrompt({ ...base, payload: { opportunityDecision: {
    decision: "decline", recommendationId: "rec-1", roleId: "role-1", note: " ",
  } } }, { currentInput: true });
  assert.doesNotMatch(empty, /Declined opportunity|contact_company/);
});

test("only the Career inbox presents a decline note as the current request", async () => {
  const { formatCareerInboxMessages } = await import("./work/inbox");
  const message = { id: 7, role: "user", content: "(Internal) Engineer at Example 제외됨", message_type: "opportunity_feedback_note",
    payload: { opportunityDecision: { decision: "decline", recommendationId: "rec-1", roleId: "role-1", note: "감사 인사 전해 주세요" } },
    created_at: "2026-11-11T01:00:00Z" } as any;
  assert.match(formatCareerInboxMessages([message]), /contact_company and recommendationId=rec-1/);
});
