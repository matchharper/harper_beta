import assert from "node:assert/strict";
import test from "node:test";
import { createCareerTurnProjection } from "./careerTurnProjection";
import type { CareerMessage } from "@/components/career/types";

const source: CareerMessage = { id: 1, role: "user", content: "확인해줘", createdAt: "2026-11-05T00:00:00Z", messageType: "chat" };
const activity: CareerMessage = { id: 2, role: "assistant", content: "", createdAt: "2026-11-05T00:00:01Z", messageType: "career_turn_activity", workReplyId: "invocation:a", workPending: true, workEvents: [{ id: "message:0", kind: "message", text: "확인할게요." }] };
const running = { latestMessageId: 1, activeInvocationIds: ["a"], activities: [{ id: "a", startedAt: activity.createdAt, logs: [] }] };
test("admission, first output, concurrent input, final-before-completion poll and reload have one stable turn", () => {
  const project = createCareerTurnProjection();
  assert.equal(project([source], running)[1].workReplyId, activity.workReplyId);
  const input = { ...source, id: 3, content: "추가 요청", createdAt: "2026-11-05T00:00:02Z" };
  assert.deepEqual(project([source, activity, input], { ...running, latestMessageId: 3 }).map(m => m.workReplyId ?? m.id), [1, "invocation:a", 3]);
  const final = { ...activity, id: 4, messageType: "chat", content: "완료했어요.", workPending: false };
  let result = project([source, activity, input, final], { ...running, latestMessageId: 4 });
  assert.equal(result.length, 3);
  assert.equal(result[1].content, "완료했어요.");
  assert.equal(result[1].workPending, false);
  result = project([source, activity, input], running); // late history cannot restore the spinner or erase final
  assert.equal(result[1].content, final.content);
  assert.equal(result[1].workPending, false);
  assert.equal(createCareerTurnProjection()([input, final]).find(m => m.workReplyId)?.workEvents?.[0].text, "확인할게요.");
});
test("stop settles the same row even if executor dies before display cleanup", () => {
  const project = createCareerTurnProjection();
  project([source, activity], running);
  const stopped = { latestMessageId: 2, activeInvocationIds: [], activities: [] };
  const first = project([source, activity], stopped)[1];
  assert.equal(first.workPending, false);
  const second = project([source, activity], stopped)[1];
  assert.equal(second.workCompletedAt, first.workCompletedAt);
  assert.deepEqual(second.workEvents, activity.workEvents);
});
test("independent invocations stay separate", () => {
  const other = { ...activity, id: 3, workReplyId: "invocation:b" };
  assert.equal(createCareerTurnProjection()([source, activity, other]).length, 3);
});


test("activity arriving after a concurrent input retains the already observed position", () => {
  const project = createCareerTurnProjection();
  project([source], running);
  const input = {...source, id:3, createdAt:"2026-11-05T00:00:02Z"};
  assert.deepEqual(project([source, input, {...activity, id:4, createdAt:"2026-11-05T00:00:03Z"}], running).map(m => m.workReplyId ?? m.id), [1,"invocation:a",3]);
});


test("reloading during a long run reads its activity even when it is outside the current history page", () => {
  const later = {...source,id:40,createdAt:"2026-11-05T00:01:00Z"};
  const result = createCareerTurnProjection()([later], {...running, latestMessageId:40, turns:[activity]});
  assert.equal(result[0].workReplyId, "invocation:a");
  assert.deepEqual(result[0].workEvents, activity.workEvents);
});
