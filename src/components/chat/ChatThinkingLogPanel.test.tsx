import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ChatThinkingLogPanel,
  formatChatWorkDuration,
} from "@/components/chat/ChatThinkingLogPanel";
import { getChatTurnStartedAt } from "@/components/chat/ChatTimeline";

test("formats completed work duration in compact English units", () => {
  assert.equal(
    formatChatWorkDuration(
      "2026-09-23T00:00:00.000Z",
      "2026-09-23T00:08:04.000Z"
    ),
    "8m 4s"
  );
  assert.equal(
    formatChatWorkDuration(
      "2026-09-23T00:00:00.000Z",
      "2026-09-23T01:02:03.000Z"
    ),
    "1h 2m 3s"
  );
  assert.equal(
    formatChatWorkDuration(
      "2026-09-23T00:00:01.000Z",
      "2026-09-23T00:00:00.000Z"
    ),
    null
  );
});

test("uses the nearest preceding user message as the turn start", () => {
  const messages = [
    {
      createdAt: "2026-09-23T00:00:00.000Z",
      role: "user",
    },
    {
      createdAt: "2026-09-23T00:01:00.000Z",
      role: "assistant",
    },
    {
      createdAt: "2026-09-23T00:02:00.000Z",
      role: "assistant",
    },
  ];

  assert.equal(
    getChatTurnStartedAt(messages, 2),
    "2026-09-23T00:00:00.000Z"
  );
});

test("keeps Thinking until a tool starts", () => {
  const html = renderToStaticMarkup(
    <ChatThinkingLogPanel
      active
      hasToolWork={false}
      logs={[{ label: "응답 생성 중", status: "running" }]}
    />
  );

  assert.match(html, />Thinking</);
  assert.doesNotMatch(html, />Working</);
});

test("shows Working during tool execution and Worked with elapsed time after completion", () => {
  const workingHtml = renderToStaticMarkup(
    <ChatThinkingLogPanel
      active
      hasToolWork
      logs={[{ label: "회사 정보 확인 중", status: "running" }]}
    />
  );
  const workedHtml = renderToStaticMarkup(
    <ChatThinkingLogPanel
      completedAt="2026-09-23T00:08:04.000Z"
      hasToolWork
      logs={[{ label: "회사 정보 확인 완료", status: "done" }]}
      startedAt="2026-09-23T00:00:00.000Z"
    />
  );

  assert.match(workingHtml, />Working</);
  assert.match(workedHtml, /Worked · 8m 4s/);
});
