import assert from "node:assert/strict";
import test from "node:test";
import { createCareerTurnProjection } from "./careerTurnProjection";
import type { CareerMessage } from "@/components/career/types";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";
import { toUiMessage } from "./careerHelpers";
import { latestChoiceMessageIndex, choiceRepliesByMessageId } from "@/lib/career/latestChoiceMessage";

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

const browser: CareerMessage = { id: 3, role: "assistant", content: "", messageType: "browser_session", createdAt: "2026-11-05T00:00:02Z", artifactReplyId: "invocation:a", browserSession: { sessionId: "browser-a" } };
const form: CareerMessage = { id: 4, role: "assistant", content: "", messageType: "career_form_presentation", createdAt: "2026-11-05T00:00:03Z", artifactReplyId: "invocation:a", careerForm: { formId: 40, revision: 1, kind: "suggestion", title: "필수 정보 확인", items: [], relatedRefs: [{ type: "browser_session", id: "browser-a" }] } };
const final: CareerMessage = { ...activity, id: 5, messageType: "chat", content: '답변[[CAREER_CHOICE_BUTTONS]]["진행"][[/CAREER_CHOICE_BUTTONS]]', workPending: false, createdAt: "2026-11-05T00:00:04Z" };

test("artifacts stay inside their producing turn in call order through streaming, final arrival and reload", () => {
  const project = createCareerTurnProjection();
  let rows = project([source, activity, browser, form], running);
  assert.deepEqual(rows.map(m => m.id), [1, 2]);
  assert.deepEqual(rows[1].workArtifacts?.map(m => m.id), [3, 4]);
  rows = project([source, activity, browser, form, final]);
  assert.deepEqual(rows.map(m => m.id), [1, 5]);
  assert.deepEqual(rows[1].workArtifacts?.map(m => m.id), [3, 4]);
  assert.equal(rows[1].workArtifacts?.[1].careerForm?.formId, 40);
  assert.equal(latestChoiceMessageIndex(rows), 1);
  assert.equal(choiceRepliesByMessageId([...rows, { ...source, id: 6, content: "진행" }]).get("5"), "진행");
  const reloaded = createCareerTurnProjection()([source, activity, browser, form, final]);
  assert.deepEqual(reloaded.map(m => m.id), rows.map(m => m.id));
  assert.deepEqual(reloaded[1].workArtifacts, rows[1].workArtifacts);
  assert.equal(project([source, activity, browser, final])[1].workArtifacts?.length, 1);
});

test("interleaved independent executions never acquire each other's artifacts", () => {
  const other = { ...activity, id: 6, workReplyId: "invocation:b" };
  const otherBrowser = { ...browser, id: 7, artifactReplyId: "invocation:b", browserSession: { sessionId: "browser-b" } };
  const rows = createCareerTurnProjection()([source, activity, other, otherBrowser, form, browser, final]);
  assert.deepEqual(rows.find(m => m.workReplyId === "invocation:a")?.workArtifacts?.map(m => m.id), [3, 4]);
  assert.deepEqual(rows.find(m => m.workReplyId === "invocation:b")?.workArtifacts?.map(m => m.id), [7]);
  assert.deepEqual(createCareerTurnProjection()([source, browser]).map(m => m.id), [1, 3]);
});

test("existing presentation request IDs recover ownership and explicitly related legacy browser cards", () => {
  const presentation = toUiMessage(toTalentMessageResponse({ id: 4, user_id: "owner", conversation_id: "conversation", role: "assistant", content: "", message_type: "career_form_presentation", created_at: form.createdAt, payload: { kind: "suggestion", formId: 40, revision: 1, items: [], relatedRefs: [{ type: "browser_session", id: "browser-a" }], requestId: "presentation:invocation:a:40:1" } }));
  assert.equal(presentation.artifactReplyId, "invocation:a");
  const rows = createCareerTurnProjection()([source, activity, { ...browser, artifactReplyId: undefined }, presentation, final]);
  assert.deepEqual(rows[1].workArtifacts?.map(m => m.id), [3, 4]);
});

test("delegate tool logs attach to the originating reply without creating another assistant turn", () => {
  const project=createCareerTurnProjection();
  const final={...activity,content:"자료를 확인하고 있어요.",messageType:"chat",workPending:false};
  const snapshot={latestMessageId:2,activeInvocationIds:["a","child"],activities:[{id:"child",ownerReplyId:"invocation:a",logs:["문서 확인 중"]}],turns:[final]};
  const rows=project([source,final],snapshot);
  assert.equal(rows.filter(m=>m.role==="assistant").length,1);
  assert.equal(rows[1].content,final.content);
  assert.deepEqual(rows[1].workBackgroundLogs,["문서 확인 중"]);
  assert.equal(rows[1].workPending,true);
  const done=project([source,final],{...snapshot,activeInvocationIds:[],activities:[]});
  assert.equal(done[1].workPending,false);
  assert.deepEqual(done[1].workBackgroundLogs,[]);
});
