import assert from "node:assert/strict";
import test from "node:test";
import { latestRequests, type LatestHandlers } from "./latestRequest";

/** A request whose answer comes when the test says. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** What useGtmAction keeps: the loading flag, the last error and the last result. */
function screen() {
  const state = { loading: false, error: null as string | null, result: null as string | null };
  const on: LatestHandlers<string> = {
    start: () => { state.loading = true; state.error = null; },
    result: (value) => { state.result = value; },
    error: (caught) => { state.error = String(caught); },
    done: () => { state.loading = false; },
  };
  return { state, on };
}

test("a slow earlier answer never lands over a newer one, and does not end the newer one's loading", async () => {
  const runLatest = latestRequests();
  const { state, on } = screen();
  const slow = deferred<string>();
  const fast = deferred<string>();
  const first = runLatest(() => slow.promise, on);
  const second = runLatest(() => fast.promise, on);
  fast.resolve("newer");
  assert.equal(await second, "newer");
  assert.deepEqual(state, { loading: false, error: null, result: "newer" });
  slow.resolve("older");
  // The superseded request resolves to null, so a caller acting on what run returns ignores it too.
  assert.equal(await first, null);
  assert.deepEqual(state, { loading: false, error: null, result: "newer" });
});

test("while the newest is still out, an older answer changes nothing and loading stays on", async () => {
  const runLatest = latestRequests();
  const { state, on } = screen();
  const old = deferred<string>();
  const now = deferred<string>();
  const first = runLatest(() => old.promise, on);
  const second = runLatest(() => now.promise, on);
  old.resolve("older");
  assert.equal(await first, null);
  assert.deepEqual(state, { loading: true, error: null, result: null });
  now.resolve("newer");
  assert.equal(await second, "newer");
  assert.deepEqual(state, { loading: false, error: null, result: "newer" });
});

test("an older request's error is dropped too; the newest one's error is shown", async () => {
  const runLatest = latestRequests();
  const { state, on } = screen();
  const old = deferred<string>();
  const now = deferred<string>();
  const first = runLatest(() => old.promise, on);
  const second = runLatest(() => now.promise, on);
  now.resolve("newer");
  await second;
  old.reject(new Error("늦은 오류"));
  assert.equal(await first, null);
  assert.deepEqual(state, { loading: false, error: null, result: "newer" });
  const third = runLatest(() => Promise.reject(new Error("새 오류")), on);
  assert.equal(await third, null);
  assert.deepEqual(state, { loading: false, error: "Error: 새 오류", result: "newer" });
});

test("each caller counts its own requests", async () => {
  const a = latestRequests();
  const b = latestRequests();
  const one = screen();
  const two = screen();
  const slow = deferred<string>();
  const first = a(() => slow.promise, one.on);
  await b(() => Promise.resolve("b"), two.on);
  slow.resolve("a");
  assert.equal(await first, "a");
  assert.deepEqual([one.state.result, two.state.result], ["a", "b"]);
});
