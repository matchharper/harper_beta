import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createSlackTaskProgress } from "./slackTaskProgress";

function fixture(fail?: string, intervalMs?: number) {
  const calls: { method: string; body: Record<string, any> }[] = [];
  const errors: unknown[] = [];
  const progress = createSlackTaskProgress({
    channelId: "C1", threadTs: "1.0", teamId: "T1", userId: "U1",
    intervalMs,
    call: async (method, body) => {
      calls.push({ method, body });
      if (method === fail) throw new Error("Slack unavailable");
      return { ts: "2.0" };
    },
    onError: error => { errors.push(error); },
  });
  return { progress, calls, errors };
}

test("working tasks finish in one collapsible plan without exposing debug data", async () => {
  const { progress, calls } = fixture();
  progress.update({ id: "response", label: "답변 작성 중", status: "running" });
  await Promise.resolve();
  progress.update({ id: "read-1", label: "정보 확인 중", status: "running", arguments: { secret: "private" } });
  progress.update({ id: "read-1", label: "정보 확인 완료", status: "done" });
  await progress.finish(true);
  assert.deepEqual(calls.map(call => call.method), ["chat.startStream", "chat.stopStream"]);
  assert.equal(calls[0].body.task_display_mode, "plan");
  assert.equal(calls[0].body.recipient_user_id, "U1");
  assert.equal(calls[0].body.chunks[0].status, "in_progress");
  assert.deepEqual(calls[1].body.chunks.map((task: any) => task.status), ["complete", "complete"]);
  assert.equal(calls[1].body.ts, "2.0");
  assert.ok(!JSON.stringify(calls).includes("private"));
  progress.update({ id: "late", label: "late", status: "running" });
  await progress.finish(true);
  assert.equal(calls.length, 2);
});

test("cancellation closes in-flight work but preserves completed tasks and errors", async () => {
  const { progress, calls } = fixture();
  progress.update({ id: "response", label: "답변 작성 중", status: "running" });
  progress.update({ id: "a", label: "확인 완료", status: "done" });
  progress.update({ id: "b", label: "조회 실패", status: "error" });
  await progress.finish(false);
  assert.deepEqual(calls.at(-1)?.body.chunks.map((task: any) => task.status), ["error", "complete", "error"]);
});

test("unsupported streams fail open and do not retry ambiguous creation", async () => {
  const { progress, calls, errors } = fixture("chat.startStream");
  progress.update({ id: "response", label: "작업 중", status: "running" });
  await progress.finish(true);
  assert.equal(errors.length, 1);
  assert.equal(calls.length, 1);
});

test("stop failure is contained so final reply delivery remains independent", async () => {
  const { progress, errors } = fixture("chat.stopStream");
  progress.update({ id: "response", label: "작업 중", status: "running" });
  await progress.finish(true);
  assert.equal(errors.length, 1);
});

test("live updates coalesce and an append failure still closes the known stream", async () => {
  const { progress, calls, errors } = fixture("chat.appendStream", 1);
  progress.update({ id: "response", label: "작업 중", status: "running" });
  await delay(5);
  progress.update({ id: "lookup", label: "정보 확인 중", status: "running" });
  progress.update({ id: "lookup", label: "정보 확인 완료", status: "done" });
  await delay(5);
  await progress.finish(true);
  assert.deepEqual(calls.map(call => call.method), ["chat.startStream", "chat.appendStream", "chat.stopStream"]);
  assert.equal(calls[1].body.chunks.length, 1);
  assert.equal(calls[1].body.chunks[0].status, "complete");
  assert.equal(errors.length, 1);
});
