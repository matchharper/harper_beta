import assert from "node:assert/strict";
import test from "node:test";
import type { OrgBoardPositions } from "./roleViews";
import { BoardCardSync } from "./boardCardSync";

/** A server that answers when told, so tests can order the replies. */
function fakeServer() {
  const calls: Array<{
    moved: OrgBoardPositions;
    placed: OrgBoardPositions;
    reject: () => void;
    resolve: () => void;
  }> = [];
  const transport = (change: {
    moved: OrgBoardPositions;
    placed: OrgBoardPositions;
  }) =>
    new Promise<void>((resolve, reject) =>
      calls.push({ ...change, reject: () => reject(new Error("x")), resolve })
    );
  return { calls, transport };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a move shows at once and is saved with the board's own spots", () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardCardSync(transport, { retryDelays: [] });
  sync.move({ a: { x: 10, y: 20 } }, { b: { x: 0, y: 0 }, a: { x: 1, y: 1 } });
  assert.deepEqual(sync.getSnapshot(), {
    a: { x: 10, y: 20 },
    b: { x: 0, y: 0 },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].moved, { a: { x: 10, y: 20 } });
  assert.deepEqual(calls[0].placed, { b: { x: 0, y: 0 } });
});

test("moves made while a save is out go next, latest spot only", async () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardCardSync(transport, { retryDelays: [] });
  sync.move({ a: { x: 1, y: 1 } });
  sync.move({ a: { x: 2, y: 2 }, c: { x: 3, y: 3 } });
  assert.equal(calls.length, 1);
  calls[0].resolve();
  await settle();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].moved, { a: { x: 2, y: 2 }, c: { x: 3, y: 3 } });
});

test("a card goes back to the server's copy once the server has it", async () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardCardSync(transport, { retryDelays: [] });
  sync.move({ a: { x: 5, y: 5 } }, { b: { x: 0, y: 0 } });
  // A read before the save landed keeps this person's spots.
  sync.reconcile({}, Date.now());
  assert.ok("a" in sync.getSnapshot());
  calls[0].resolve();
  await settle();
  // A teammate had placed b first: their spot wins.
  sync.reconcile({ a: { x: 5, y: 5 }, b: { x: 400, y: 0 } }, Date.now());
  assert.deepEqual(sync.getSnapshot(), {});
});

test("a teammate's later move shows once a read clearly follows the save", async () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardCardSync(transport, { retryDelays: [] });
  sync.move({ a: { x: 5, y: 5 } });
  calls[0].resolve();
  await settle();
  sync.reconcile({ a: { x: 90, y: 90 } }, Date.now());
  assert.ok("a" in sync.getSnapshot());
  sync.reconcile({ a: { x: 90, y: 90 } }, Date.now() + 10_000);
  assert.deepEqual(sync.getSnapshot(), {});
});

test("a failed save stays on screen and is tried again", async () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardCardSync(transport, { retryDelays: [1] });
  sync.move({ a: { x: 5, y: 5 } });
  calls[0].reject();
  await settle();
  sync.reconcile({}, Date.now() + 10_000);
  assert.deepEqual(sync.getSnapshot(), { a: { x: 5, y: 5 } });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].moved, { a: { x: 5, y: 5 } });
});
