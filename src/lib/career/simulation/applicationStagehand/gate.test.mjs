import test from "node:test";
import assert from "node:assert/strict";
import { SubmissionGate } from "./gate.mjs";
function fixture(fail = false) {
  let sent = 0,
    aborted = 0,
    item;
  const gate = new SubmissionGate((value) => {
    item = value;
  });
  const route = {
    request: () => ({
      url: () => "https://example.com/apply",
      method: () => "POST",
      postDataBuffer: () => Buffer.from('{"name":"Example"}'),
      headers: () => ({ "content-type": "application/json" }),
    }),
    continue: async () => {
      sent++;
      if (fail) throw Error("disconnected");
    },
    abort: async () => {
      aborted++;
    },
  };
  return {
    gate,
    route,
    hold: () =>
      gate.hold(route, {
        url: "https://example.com/form",
        fields: [{ label: "Name", value: "Example" }],
      }),
    get item() {
      return item;
    },
    get sent() {
      return sent;
    },
    get aborted() {
      return aborted;
    },
  };
}
test("holds exact request until approval, rejects changed scope, duplicate approval does not send twice", async () => {
  const f = fixture(),
    waiting = f.hold();
  assert.equal(f.sent, 0);
  const request = f.item;
  await assert.rejects(
    f.gate.resolve({ ...request, bodyHash: "changed" }, true)
  );
  assert.equal(f.sent, 0);
  assert.equal((await f.gate.resolve(request, true)).executed, true);
  await waiting;
  assert.equal((await f.gate.resolve(request, true)).executed, true);
  assert.equal(f.sent, 1);
  await assert.rejects(f.gate.resolve(request, false));
});
test("decline stops this attempt and prevents a later request", async () => {
  const f = fixture(),
    waiting = f.hold();
  await f.gate.resolve(f.item, false);
  await waiting;
  await f.hold();
  assert.equal(f.sent, 0);
  assert.equal(f.aborted, 2);
});
test("connection failure after approval cannot replay a possibly sent request", async () => {
  const f = fixture(true),
    waiting = f.hold(),
    request = f.item;
  await assert.rejects(f.gate.resolve(request, true), /uncertain/);
  await waiting;
  await assert.rejects(f.gate.resolve(request, true), /not be replayed/);
  assert.equal(f.sent, 1);
});
test("cleanup rejects a pending request", async () => {
  const f = fixture(),
    waiting = f.hold();
  await f.gate.close();
  await waiting;
  assert.equal(f.sent, 0);
  assert.equal(f.aborted, 1);
});
