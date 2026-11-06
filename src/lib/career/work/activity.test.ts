import assert from "node:assert/strict";
import test from "node:test";
import {
  createCareerInvocationActivity,
  projectCareerWorkActivity,
} from "./activity";
import type { WorkScope } from "./store";
import type { CareerReplyCheckpoint } from "../capabilities/runtime";

test("progress survives overlapping callbacks, hides waits for a newer reply, and rejects a stale attempt", async () => {
  let row: any = {
    id: "invocation",
    user_id: "user",
    conversation_id: "conversation",
    status: "pending",
    result: {},
  };
  let activeClaim = "attempt-1";
  const scope = {
    userId: "user",
    conversationId: "conversation",
    admin: {
      async rpc(_name: string, args: any) {
        if (row.status !== "completed" && args.p_claim_id === activeClaim)
          row = { ...row, result: { ...row.result, ...args.p_patch } };
        return { error: null };
      },
    },
  } as unknown as WorkScope;
  assert.deepEqual(projectCareerWorkActivity(row), [
    { id: "invocation", logs: [] },
  ]);
  const first = createCareerInvocationActivity(scope, row.id);
  await first.start("attempt-1");
  first.record(["프로필 확인 중"]);
  first.record(["프로필 확인 중", "이력서 준비 중"]);
  await first.checkpoint({
    waitFor: [{ kind: "career_input", id: "newer-invocation" }],
  } as CareerReplyCheckpoint);
  assert.deepEqual(projectCareerWorkActivity(row), []);
  const resumed = createCareerInvocationActivity(scope, row.id);
  activeClaim = "attempt-2";
  await resumed.start("attempt-2");
  first.record(["늦게 도착한 이전 로그"]);
  await first.flush();
  assert.deepEqual(projectCareerWorkActivity(row), [
    { id: "invocation", logs: [], startedAt: row.result.activity.startedAt },
  ]);
  resumed.record(["지원 페이지 확인 중"]);
  await resumed.checkpoint({
    waitFor: [{ kind: "browser_run", id: "browser" }],
  } as CareerReplyCheckpoint);
  assert.deepEqual(projectCareerWorkActivity(row), [
    { id: "invocation", logs: ["지원 페이지 확인 중"], startedAt: row.result.activity.startedAt },
  ]);
  row = { ...row, status: "completed", result: {} };
  resumed.record(["완료 후 늦은 로그"]);
  await resumed.flush();
  assert.deepEqual(row.result, {});
});

test("projection excludes cleanup and private execution fields", () => {
  assert.deepEqual(
    projectCareerWorkActivity({ id: "cleanup", request: { cleanup: true } }),
    []
  );
  assert.deepEqual(
    projectCareerWorkActivity({
      id: "cleanup",
      request: { cleanup_browser_session: "browser" },
    }),
    []
  );
  const row = {
    id: "work",
    result: {
      activity: {
        logs: ["자료 확인 중", { private: "transcript" }],
        attemptId: "private",
      },
      last_error: "private",
    },
  };
  assert.deepEqual(projectCareerWorkActivity(row), [
    { id: "work", logs: ["자료 확인 중"] },
  ]);
});
