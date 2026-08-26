import assert from "node:assert/strict";
import test from "node:test";

import { formatOpportunityFeedbackPromptContext } from "./activityEvents";

test("adds fit summary and saved-state boundaries to feedback-only context", () => {
  const prompt = formatOpportunityFeedbackPromptContext([
    {
      action: "negative",
      createdAt: "2026-08-26T01:02:03.000Z",
      eventId: "event-1",
      fitSummary:
        "AI 업무 자동화 제품을 만드는 초기 팀의 Product Engineer 역할.",
      hasFeedbackReason: true,
      operationalFeedbackKinds: [],
      summary:
        'User disliked external opportunity "Product Engineer" at "Acme". Feedback reason: 역할이나 직무가 맞지 않아요.',
    },
  ]);

  assert.match(prompt, /Role fit summary \(opportunity context only\)/);
  assert.match(prompt, /persistent hard preference or filter was saved/);
  assert.match(prompt, /noReason=0/);
  assert.doesNotMatch(prompt, /Operational feedback exception/);
});

test("adds operational guidance only when a fixed reason is present", () => {
  const operationalPrompt = formatOpportunityFeedbackPromptContext([
    {
      action: "positive",
      createdAt: "2026-08-26T01:02:03.000Z",
      eventId: "event-2",
      fitSummary: null,
      hasFeedbackReason: true,
      operationalFeedbackKinds: ["already_applied"],
      summary:
        'User liked external opportunity "Engineer" at "Acme". Feedback reason: 이미 지원했던 회사/역할입니다..',
    },
  ]);
  const ordinaryPrompt = formatOpportunityFeedbackPromptContext([
    {
      action: "positive",
      createdAt: "2026-08-26T01:02:03.000Z",
      eventId: "event-3",
      hasFeedbackReason: false,
      summary: 'User liked external opportunity "Engineer" at "Beta".',
    },
  ]);

  assert.match(operationalPrompt, /Operational feedback exception/);
  assert.match(operationalPrompt, /neither positive nor negative preference/);
  assert.match(operationalPrompt, /Never tell the user to apply again/);
  assert.match(operationalPrompt, /one light sentence/);
  assert.doesNotMatch(ordinaryPrompt, /Operational feedback exception/);
  assert.doesNotMatch(ordinaryPrompt, /Never tell the user to apply again/);
  assert.match(ordinaryPrompt, /noReason=1/);
});
