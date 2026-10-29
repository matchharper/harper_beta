import assert from "node:assert/strict";
import test from "node:test";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";
import { toUiMessage } from "@/hooks/career/careerHelpers";

test("the prepared application stays attached to its saved assistant reply after serialization and reload", () => {
  const row = {id: 25, conversation_id: "fixture", user_id: "owner", role: "assistant" as const,
    content: "지원에 필요한 내용을 준비했어요.", message_type: "chat", created_at: "2026-10-29T00:00:00Z",
    payload: {applicationReviewMessageId: 10}};
  const message = toUiMessage(toTalentMessageResponse(row));
  assert.equal(message.applicationReviewMessageId, 10);
  assert.equal(message.content, row.content);
  assert.equal(toUiMessage(toTalentMessageResponse({...row, payload: {}})).applicationReviewMessageId, undefined);
});

import { attachSavedApplicationReview } from "./presentation";

test("an older saved handoff uses its exact resume link while new explicit message references stay in place", () => {
  const base = {role: "assistant", createdAt: "2026-10-29T01:00:00Z"};
  const messages = [{...base, id: 20, content: "이력서를 준비했어요."},
    {...base, id: 21, content: "[지원 이력서](documentId:22222222-2222-4222-8222-222222222222)"}];
  const application = {messageId: 10, resumeDocumentId: "22222222-2222-4222-8222-222222222222", startedAt: "2026-10-29T00:00:00Z"};
  assert.equal(attachSavedApplicationReview(messages, application)[1].applicationReviewMessageId, 10);
  const current = [...messages, {...base,id:22,content:"수정했어요.",applicationReviewMessageId:10}];
  assert.equal(attachSavedApplicationReview(current, application), current);
});
