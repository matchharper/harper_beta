import assert from "node:assert/strict";
import test from "node:test";
import { createCareerAssistantMessageWriter } from "./assistantMessageWriter";
import {
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

function database() {
  const rows: TalentMessageRow[] = [];
  let failNextWrite = false;
  const admin = {
    from(name: string) {
      assert.equal(name, "talent_messages");
      let mutation: Record<string, unknown> | undefined;
      let insert = false;
      const predicates: Array<(row: any) => boolean> = [];
      const query: any = {
        select() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        eq(key: string, value: unknown) {
          predicates.push(
            (row) =>
              (key.startsWith("payload->>")
                ? row.payload?.[key.slice(10)]
                : row[key]) === value
          );
          return query;
        },
        insert(value: Record<string, unknown>) {
          insert = true;
          mutation = value;
          return query;
        },
        update(value: Record<string, unknown>) {
          mutation = value;
          return query;
        },
        async maybeSingle() {
          if (mutation && failNextWrite) { failNextWrite = false; return {data:null,error:new Error("temporary display write failure")}; }
          let row = rows.find((row) => predicates.every((test) => test(row)));
          if (insert) {
            row = {
              id: rows.length + 1,
              created_at: new Date().toISOString(),
              ...mutation,
            } as TalentMessageRow;
            rows.push(row);
          } else if (row && mutation) Object.assign(row, mutation);
          return { data: row ? structuredClone(row) : null, error: null };
        },
        single() {
          return query.maybeSingle();
        },
      };
      return query;
    },
  } as unknown as TalentAdminClient;
  return { admin, rows, failWrite() { failNextWrite = true; } };
}

test("tool-step prose, streamed continuation, and completion retain ordered activity and append one final reply with measured timing", async () => {
  const { admin, rows } = database();
  const writer = await createCareerAssistantMessageWriter({
    admin,
    userId: "user",
    conversationId: "conversation",
    replyId: "invocation:first",
    startedAt: new Date(Date.now() - 20_000).toISOString(),
  });
  await writer.delta("이력서를 확인할게요.", []);
  assert.equal(rows.length, 1);
  const first = toTalentMessageResponse(rows[0]);
  assert.equal(first.workPending, true);
  await writer.progress("이력서를 확인할게요.", []);
  await writer.logs(["이력서 읽는 중"]);
  await writer.delta("경험을 확인했어요.", ["이력서 읽는 중"]);
  await writer.progress("경험을 확인했어요.", ["이력서 읽는 중"]);
  const final = await writer.finish(
    "이 내용을 반영했어요.",
    ["이력서 읽는 중", "문서 수정 중"],
    { agentTurn: { completed: true } }
  );
  assert.ok(final);
  assert.equal(rows.length, 2);
  assert.notEqual(final.id, first.id);
  assert.equal(
    final.content,
    "이 내용을 반영했어요."
  );
  const response = toTalentMessageResponse(final);
  assert.deepEqual(response.workEvents?.map(event => event.text), ["이력서를 확인할게요.", "이력서 읽는 중", "경험을 확인했어요.", "문서 수정 중"]);
  assert.ok(response.workEvents?.every(event => Number.isFinite(Date.parse(event.createdAt!))));
  assert.equal(response.workEvents?.[0].chunks?.map(chunk => chunk.text).join(""), "이력서를 확인할게요.");
  assert.equal(response.workPending, false);
  assert.equal(response.workReplyId, first.workReplyId);
  assert.ok(
    Date.parse(response.workCompletedAt!) -
      Date.parse(response.workStartedAt!) >=
      20_000
  );
  assert.deepEqual(response.thinkingLogs, ["이력서 읽는 중", "문서 수정 중"]);
});

test("separate invocations remain separate and resumption appends only to its own message", async () => {
  const { admin, rows } = database();
  const scope = {
    admin,
    userId: "user",
    conversationId: "conversation",
    startedAt: new Date().toISOString(),
  };
  const first = await createCareerAssistantMessageWriter({
    ...scope,
    replyId: "first",
  });
  const second = await createCareerAssistantMessageWriter({
    ...scope,
    replyId: "second",
  });
  await first.progress("첫 요청을 확인했어요.", []);
  await second.finish("두 번째 요청을 마쳤어요.", []);
  await first.interrupt();
  const resumed = await createCareerAssistantMessageWriter({
    ...scope,
    replyId: "first",
  });
  await resumed.finish("첫 요청도 마쳤어요.", []);
  const finals = rows.filter(row => row.message_type === "chat");
  assert.equal(finals.length, 2);
  assert.equal(finals[0].content, "두 번째 요청을 마쳤어요.");
  assert.equal(finals[1].content, "첫 요청도 마쳤어요.");
  assert.equal(toTalentMessageResponse(finals[1]).workEvents?.[0].text, "첫 요청을 확인했어요.");
});

test("cancellation retains intermediate and partial output inside the stopped log", async () => {
  const { admin, rows } = database();
  let cancelled = false;
  const writer = await createCareerAssistantMessageWriter({
    admin,
    userId: "user",
    conversationId: "conversation",
    replyId: "first",
    startedAt: new Date().toISOString(),
    check: async () => {
      if (cancelled) throw new Error("Stopped");
    },
  });
  await writer.progress("내용을 확인할게요.", []);
  await writer.delta("아직 표시하지 않은 글", []);
  cancelled = true;
  await assert.rejects(writer.finish("보내면 안 되는 결과", []), /Stopped/);
  await writer.interrupt();
  assert.equal(rows[0].content, "");
  assert.equal(toTalentMessageResponse(rows[0]).workEvents?.[0].text, "내용을 확인할게요.");
  assert.equal(toTalentMessageResponse(rows[0]).workEvents?.at(-1)?.text, "아직 표시하지 않은 글");
  assert.equal(toTalentMessageResponse(rows[0]).workPending, false);
});


test("a failed display write recovers without replaying work, and late callbacks cannot reopen a finished turn", async () => {
  const db = database();
  const writer = await createCareerAssistantMessageWriter({ ...db, userId: "user", conversationId: "conversation", replyId: "a", startedAt: new Date().toISOString() });
  await writer.start();
  db.failWrite();
  await writer.progress("확인할게요.", []);
  await writer.logs(["자료 확인 중"]);
  const final = await writer.finish("완료했어요.", ["자료 확인 중"]);
  assert.equal(final?.content, "완료했어요.");
  assert.deepEqual(toTalentMessageResponse(final!).workEvents?.map(e => e.text), ["확인할게요.", "자료 확인 중"]);
  await writer.delta("늦게 도착한 글", []);
  await writer.logs(["늦게 도착한 로그"]);
  assert.equal(toTalentMessageResponse(db.rows[0]).workPending, false);
  assert.equal(db.rows.length, 2);
});

test("public delegate tool events persist with the conversation result without another assistant writer", async () => {
  const {admin,rows}=database();
  const writer=await createCareerAssistantMessageWriter({admin,userId:"user",conversationId:"conversation",replyId:"invocation:result",startedAt:new Date().toISOString()});
  const event={id:"delegate:private-execution:0",kind:"tool" as const,text:"프로필 확인 중"};
  const final=await writer.finish("검토 결과를 확인했어요.",[],undefined,[event,event]);
  assert.ok(final);
  assert.deepEqual(toTalentMessageResponse(final).workEvents,[event]);
  assert.equal(rows.filter(row=>row.message_type==="chat").length,1);
  const reloaded=await createCareerAssistantMessageWriter({admin,userId:"user",conversationId:"conversation",replyId:"invocation:result",startedAt:new Date().toISOString()});
  assert.equal((await reloaded.finish("검토 결과를 확인했어요.",[],undefined,[event]))?.id,final.id);
  assert.equal(rows.filter(row=>row.message_type==="chat").length,1);
});


test("a successful empty final reply retains tool observations for the next conversation input", async () => {
  const { formatTalentMessageContentForLlmPrompt } = await import("./opportunityFeedbackNote");
  const { admin, rows } = database();
  const writer = await createCareerAssistantMessageWriter({ admin, userId: "user", conversationId: "conversation", replyId: "empty-final", startedAt: new Date().toISOString() });
  await writer.progress("지원 정보를 확인하고 있어요.", []);
  const agentTurn = { record: { toolResults: [{ name: "use_browser", execution: {
    observedAt: new Date().toISOString(), input: 'action: run', output: "The application has 3 required consent questions. No submission occurred.",
  } }] } };
  const final = await writer.finish("", [], { agentTurn });
  assert.ok(final);
  assert.equal(rows.filter(row => row.message_type === "chat").length, 1);
  assert.equal(final.content, "");
  const input = formatTalentMessageContentForLlmPrompt(final);
  assert.match(input, /3 required consent questions/);
  assert.match(input, /No submission occurred/);
  assert.equal((input.match(/3 required consent questions/g) ?? []).length, 1);
  assert.equal((await writer.finish("", [], { agentTurn }))?.id, final.id, "replayed finalization reuses the receipt");
});

test("a host handoff keeps the original activity pending until the resumed turn finishes", async () => {
  const { admin, rows } = database();
  const scope = { admin, userId: "user", conversationId: "conversation", replyId: "long-browser", startedAt: "2026-11-08T12:00:00Z" };
  const first = await createCareerAssistantMessageWriter(scope);
  await first.progress("두 지원서를 준비할게요.", []);
  await first.suspend(["지원 정보 확인 중..."]);
  await first.interrupt(); // The exhausted host's finally must not finish it.
  let activity = toTalentMessageResponse(rows[0]);
  assert.equal(activity.workPending, true);
  assert.equal(activity.workCompletedAt, undefined);
  assert.equal(rows.length, 1);
  assert.equal(activity.workEvents?.at(-1)?.text, "지원 정보 확인 중...");
  const resumed = await createCareerAssistantMessageWriter({ ...scope, startedAt: "2026-11-08T12:08:00Z" });
  await resumed.start();
  await resumed.finish("검토할 지원서를 준비했어요.", []);
  activity = toTalentMessageResponse(rows[0]);
  assert.equal(activity.workPending, false);
  assert.equal(activity.workStartedAt, scope.startedAt);
  assert.equal(rows.filter(row => row.message_type === "chat").length, 1);
});
