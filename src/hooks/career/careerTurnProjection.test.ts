import assert from "node:assert/strict";
import test from "node:test";
import { createCareerTurnProjection, projectCareerInputDelivery } from "./careerTurnProjection";
import type { CareerMessage } from "@/components/career/types";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";
import { toUiMessage } from "./careerHelpers";
import { latestChoiceMessageIndex, choiceRepliesByMessageId } from "@/lib/career/latestChoiceMessage";
import { createCareerMessageMerger } from "./careerMessageMerge";

const source: CareerMessage = { id: 1, role: "user", content: "확인해줘", createdAt: "2026-11-05T00:00:00Z", messageType: "chat" };
const activity: CareerMessage = { id: 2, role: "assistant", content: "", createdAt: "2026-11-05T00:00:01Z", messageType: "career_turn_activity", workReplyId: "invocation:a", workPending: true, workEvents: [{ id: "message:0", kind: "message", text: "확인할게요." }] };
const running = { latestMessageId: 1, activeInvocationIds: ["a"], activities: [{ id: "a", startedAt: activity.createdAt, logs: [] }] };

test("queued inputs stay below running output until the model receives the whole batch", () => {
  const project = createCareerTurnProjection();
  const inputs = [3, 4].map(id => ({ ...source, id, clientRequestId: `request-${id}`, turnPending: true,
    content: `추가 요청 ${id}`, createdAt: `2026-11-05T00:00:0${id}Z` }));
  const history = [source, activity, ...inputs];
  const waiting = { ...running, latestMessageId: 4, pendingInputMessageIds: [3, 4] };
  let rows = project(projectCareerInputDelivery(history, waiting), waiting);
  assert.deepEqual(rows.map(message => message.id), [1, 2, 3, 4]);
  assert.ok(rows.slice(-2).every(message => message.inputPending));
  assert.equal(rows.filter(message => message.workPending).length, 1);
  assert.equal(rows[1].workPending, true, "queued input cannot split the active work yet");
  assert.deepEqual(createCareerTurnProjection()(projectCareerInputDelivery(history, waiting), waiting), rows, "reload preserves the queue");

  const received = { ...waiting, pendingInputMessageIds: [] };
  rows = project(projectCareerInputDelivery(history, received), received);
  assert.ok(rows.every(message => !message.inputPending));
  assert.deepEqual(rows.filter(message => message.role === "user").map(message => message.id), [1, 3, 4]);
  assert.equal(rows.at(-1)?.workPending, true, "the continuation now follows the accepted inputs");
});

test("optimistic inputs survive old snapshots and Stop clears the waiting style", () => {
  const optimistic = { ...source, id: "temp-user-local", inputPending: true };
  const saved = { ...source, id: 3, turnPending: true, inputPending: true };
  const old = { ...running, pendingInputMessageIds: [] };
  assert.equal(projectCareerInputDelivery([optimistic], old)[0].inputPending, true);
  assert.equal(projectCareerInputDelivery([saved], old)[0].inputPending, true);
  assert.equal(projectCareerInputDelivery([saved])[0].inputPending, true);
  assert.equal(projectCareerInputDelivery([{ ...saved, turnStopped: true }], { ...old, pendingInputMessageIds: [3] })[0].inputPending, false);
  assert.equal(projectCareerInputDelivery([saved], { ...old, latestMessageId: 3 })[0].inputPending, false);
});

test("an idle send stays normal through admission, history replacement and startup", () => {
  const merge = createCareerMessageMerger();
  const optimistic = { ...source, id: "temp-user-first", clientRequestId: "first", inputPending: false };
  const saved = { ...source, clientRequestId: "first", turnPending: true };
  for (const rows of [[optimistic], [saved], merge([saved], [optimistic])]) {
    assert.ok(projectCareerInputDelivery(rows).every(message => !message.inputPending));
    assert.ok(projectCareerInputDelivery(rows, { latestMessageId: 1, pendingInputMessageIds: [] })
      .every(message => !message.inputPending));
  }
  const queued = { ...optimistic, inputPending: true };
  const merged = merge([saved], [queued]);
  assert.equal(merged[0].id, saved.id);
  assert.equal(projectCareerInputDelivery(merged, { latestMessageId: 0, pendingInputMessageIds: [] })[0].inputPending, true);
  assert.equal(projectCareerInputDelivery(merged, { latestMessageId: 1, pendingInputMessageIds: [] })[0].inputPending, false);
});
test("admission, first output, concurrent input, final-before-completion poll and reload have one stable turn", () => {
  const project = createCareerTurnProjection();
  assert.equal(project([source], running)[1].workReplyId, activity.workReplyId);
  const input = { ...source, id: 3, content: "추가 요청", createdAt: "2026-11-05T00:00:02Z" };
  assert.deepEqual(project([source, activity, input], { ...running, latestMessageId: 3 }).map(m => m.workReplyId ?? m.id), [1, "invocation:a", 3, "invocation:a"]);
  const final = { ...activity, id: 4, createdAt: "2026-11-05T00:00:03Z", workStartedAt: activity.createdAt, messageType: "chat", content: "완료했어요.", workPending: false };
  let result = project([source, activity, input, final], { ...running, latestMessageId: 4 });
  assert.equal(result.length, 4);
  assert.equal(result[3].content, "완료했어요.");
  assert.equal(result[1].workPending, false);
  result = project([source, activity, input], running); // late history cannot restore the spinner or erase final
  assert.equal(result[3].content, final.content);
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
  assert.deepEqual(project([source, input, {...activity, id:4, createdAt:"2026-11-05T00:00:03Z"}], running).map(m => m.workReplyId ?? m.id), [1,"invocation:a",3,"invocation:a"]);
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

test("an older work poll cannot hide streamed text while the reply is live", () => {
  const project = createCareerTurnProjection();
  const partial = { ...activity, workEvents: [{ id: "message:0", kind: "message" as const, text: "네" }] };
  const live: CareerMessage = { ...partial, id: "live:invocation:a", typingMode: "stream" };
  const continued = {
    ...live,
    workEvents: [{ id: "message:0", kind: "message" as const, text: "네 좋아요.\n\n다음 문장이에요." }],
  };
  const oldPoll = { ...running, turns: [partial] };

  assert.equal(project([source, live], oldPoll)[1].workEvents?.[0].text, "네");
  const visible = project([source, continued], oldPoll)[1];
  assert.deepEqual(visible.workEvents, continued.workEvents);
  assert.equal(project([source, continued], { latestMessageId: 1, activeInvocationIds: [] })[1].workPending, true);

  const stopped = { ...partial, workPending: false, workCompletedAt: final.createdAt };
  assert.equal(project([source, continued], { ...running, turns: [stopped] })[1].workPending, false);
  assert.equal(project([source, continued], { ...running, turns: [partial, final] })[1].content, final.content);

  const recover = createCareerTurnProjection();
  recover([source, continued], oldPoll);
  const resumed = { ...activity, workEvents: [{ id: "message:0", kind: "message" as const, text: "이어서 확인했어요." }] };
  assert.deepEqual(recover([source, { ...continued, typingMode: undefined }], { ...running, turns: [resumed] })[1].workEvents, resumed.workEvents);
  recover([source, continued], oldPoll);
  assert.deepEqual(recover([source], { ...running, turns: [resumed] })[1].workEvents, resumed.workEvents);
});

test("explicit deletion clears the retained final reply and Worked segments despite late polls", () => {
  const project = createCareerTurnProjection();
  const input = { ...source, id: 6, createdAt: "2026-11-05T00:00:02Z" };
  const other = { ...final, id: 7, workReplyId: "invocation:b" };
  const history = [source, activity, browser, input, final, other];
  const snapshot = { ...running, latestMessageId: 7, turns: [activity, final] };
  assert.ok(project(history, snapshot).some(message => message.id === final.id));
  for (const messages of [history, [source, input, other]]) {
    const result = project(messages, snapshot, [final.workReplyId!]);
    assert.deepEqual(result.map(message => message.id), [1, 6, 7]);
    assert.ok(result.every(message => message.workReplyId !== final.workReplyId));
  }
  assert.deepEqual(createCareerTurnProjection()([source, input, other]).map(message => message.id), [1, 6, 7]);
});

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


test("concurrent inputs partition logs, artifacts and the final reply identically after reload", () => {
  const at = (second: number) => `2026-11-05T00:00:0${second}Z`;
  const inputs = [2, 4].map(second => ({ ...source, id: 10 + second, content: `input ${second}`, createdAt: at(second) }));
  const events = [1, 3, 5].map(second => ({ id: `tool:${second}`, kind: "tool" as const, text: `log ${second}`, createdAt: at(second) }));
  const runningMessage = { ...activity, workStartedAt: at(1), workEvents: events };
  const answer = { ...runningMessage, id: 20, content: "중단했어요.", messageType: "chat", workPending: false, createdAt: at(6), workCompletedAt: at(6) };
  const card = { ...browser, createdAt: at(3) };
  const project = createCareerTurnProjection();
  project([source, runningMessage, ...inputs, card]);
  const history = [source, runningMessage, ...inputs, card, answer];
  const result = project(history);
  assert.deepEqual(result.map(row => row.content), [source.content, "", "input 2", "", "input 4", "중단했어요."]);
  assert.deepEqual(result.filter(row => row.workReplyId).map(row => row.workEvents?.map(event => event.text)), [["log 1"], ["log 3"], ["log 5"]]);
  assert.equal(result[3].workArtifacts?.[0].id, card.id);
  assert.ok(result.every(row => !row.workPending));
  assert.deepEqual(createCareerTurnProjection()(history), result);
  assert.deepEqual(project(history, { latestMessageId: 20, activeInvocationIds: [], turns: [runningMessage] }), result);
});

test("a streamed message freezes its prefix above input and continues below it", () => {
  const input = { ...source, id: 3, createdAt: "2026-11-05T00:00:02Z" };
  const message = { ...activity, workEvents: [{ id: "message:0", kind: "message" as const, text: "이전이후", createdAt: activity.createdAt, chunks: [
    { text: "이전", createdAt: activity.createdAt },
    { text: "이후", createdAt: "2026-11-05T00:00:03Z" },
  ] }] };
  const rows = createCareerTurnProjection()([source, message, input]);
  assert.equal(rows[1].workEvents?.[0].text, "이전");
  assert.equal(rows[1].workPending, false);
  assert.equal(rows[2].id, input.id);
  assert.equal(rows[3].workEvents?.[0].text, "이후");
  assert.equal(rows[3].workPending, true);
  assert.notEqual(rows[1].workSegmentId, rows[3].workSegmentId);

  const stopped = createCareerTurnProjection()([source, {
    ...message, workPending: false, workCompletedAt: "2026-11-05T00:00:04Z",
  }, { ...input, turnStopped: true }]);
  assert.deepEqual(stopped.filter(row => row.id === activity.id), [stopped.at(-1)]);
  assert.equal(stopped.at(-1)?.workEvents?.[0].text, "이후");
});
