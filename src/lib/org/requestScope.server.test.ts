import assert from "node:assert/strict";
import { test } from "node:test";
import { deferOrgResponseWork, memoOrgRequest, withOrgRequestScope } from "./requestScope.server";

test("deduplicates concurrent reads only within the same request and identity", async () => {
  let reads = 0;
  const read = (user: string) => memoOrgRequest(["role", user, "workspace", "role", "manage"], async () => ++reads);
  await withOrgRequestScope(async () => {
    assert.deepEqual(await Promise.all([read("a"), read("a")]), [1, 1]);
    assert.equal(await read("b"), 2);
  });
  await withOrgRequestScope(async () => { assert.equal(await read("a"), 3); });
  assert.equal(await read("a"), 4);
  assert.equal(await read("a"), 5);
});

test("rejected checks are not reused", async () => {
  await withOrgRequestScope(async () => {
    await assert.rejects(memoOrgRequest(["permission"], async () => { throw Error("denied"); }));
    assert.equal(await memoOrgRequest(["permission"], async () => "allowed"), "allowed");
  });
});

test("response work waits for scheduler and cannot reuse request authorization", async () => {
  const scheduled: Array<() => Promise<void>> = [];
  let reads = 0;
  const read = () => memoOrgRequest(["permission"], async () => ++reads);
  await withOrgRequestScope(async () => {
    await read();
    assert.equal(deferOrgResponseWork(async () => { await read(); }), true);
    assert.equal(reads, 1);
  }, run => scheduled.push(run));
  await scheduled[0]();
  assert.equal(reads, 2);
  assert.equal(deferOrgResponseWork(async () => {}), false);
});
