import assert from "node:assert/strict";
import test from "node:test";
import { clearNewRolePending, clearStartPending, markNewRolePending, markStartPending, mayStartFromJd, newRolePendingUntil, START_PENDING_MS, startPendingUntil } from "./startPending";

test("only a first message the quick JD read can take starts the loading line (20+ characters, no link, no file)", () => {
  assert.equal(mayStartFromJd("# 데이터 엔지니어\n- Spark 실무 경험 3년 이상", 0), true);
  assert.equal(mayStartFromJd("백엔드 엔지니어", 0), false, "a title only");
  assert.equal(mayStartFromJd("이 공고 읽어 주세요 https://example.com/jobs/1", 0), false, "a link");
  assert.equal(mayStartFromJd("# 데이터 엔지니어\n- Spark 실무 경험 3년 이상", 1), false, "a file");
});

test("the loading line lasts 30 s from the role's creation in this tab, and not for other roles", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  markStartPending(storage, "role-a", 1_000);
  assert.equal(startPendingUntil(storage, "role-a"), 1_000 + START_PENDING_MS);
  assert.equal(startPendingUntil(storage, "role-b"), null);
  assert.equal(startPendingUntil(null, "role-a"), null, "no storage: the chat shows as before");
});

test("the server's answer that the message was not a JD ends the loading line for that role only", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  markStartPending(storage, "role-a", 1_000);
  markStartPending(storage, "role-b", 1_000);
  clearStartPending(storage, "role-a");
  assert.equal(startPendingUntil(storage, "role-a"), null);
  assert.equal(startPendingUntil(storage, "role-b"), 1_000 + START_PENDING_MS);
});

test("the new-role page waits per workspace, for 30 s at most, until cleared", () => {
  assert.equal(newRolePendingUntil("w1"), null);
  markNewRolePending("w1", 1_000);
  assert.equal(newRolePendingUntil("w1"), 1_000 + START_PENDING_MS);
  assert.equal(newRolePendingUntil("w2"), null, "another workspace is not waiting");
  clearNewRolePending("w1");
  assert.equal(newRolePendingUntil("w1"), null);
});
