import assert from "node:assert/strict";
import test from "node:test";
import type { OrgBoardText } from "./roleViews";
import { BoardTextSync, mergeBoardTexts } from "./boardTextSync";

const box = (id: string, extra: Partial<OrgBoardText> = {}): OrgBoardText => ({
  id,
  size: 24,
  text: "메모",
  x: 0,
  y: 0,
  ...extra,
});

/** A server that answers when told, so tests can order the replies. */
function fakeServer() {
  const calls: Array<{
    kind: "remove" | "save";
    reject: () => void;
    resolve: () => void;
    text: OrgBoardText | string;
  }> = [];
  const transport = {
    remove: (id: string) =>
      new Promise<void>((resolve, reject) =>
        calls.push({
          kind: "remove",
          reject: () => reject(new Error("x")),
          resolve,
          text: id,
        })
      ),
    save: (text: OrgBoardText) =>
      new Promise<void>((resolve, reject) =>
        calls.push({
          kind: "save",
          reject: () => reject(new Error("x")),
          resolve,
          text,
        })
      ),
  };
  return { calls, transport };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a box being typed in is not saved until typing ends", async () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardTextSync(transport, { retryDelays: [] });
  sync.create(box("a", { text: "" }), { hold: true });
  sync.update(box("a"), { text: "1차" }, { hold: true });
  sync.update(box("a"), { text: "1차 검토" }, { hold: true });
  assert.equal(calls.length, 0);
  sync.release("a");
  assert.equal(calls.length, 1);
  assert.equal((calls[0].text as OrgBoardText).text, "1차 검토");
});

test("changes made while a save is out go next, newest last", async () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardTextSync(transport, { retryDelays: [] });
  sync.update(box("a"), { x: 10 });
  sync.update(box("a"), { size: 32 });
  sync.update(box("a"), { y: 5 });
  assert.equal(calls.length, 1);
  calls[0].resolve();
  await settle();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].text, box("a", { size: 32, x: 10, y: 5 }));
});

test("a failed save keeps the box on screen and is tried again", async () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardTextSync(transport, { retryDelays: [] });
  sync.create(box("a"));
  calls[0].reject();
  await settle();
  assert.equal(sync.getSnapshot().get("a")?.failed, true);
  assert.deepEqual(mergeBoardTexts([], sync.getSnapshot()), [box("a")]);
  sync.retry("a");
  calls[1].resolve();
  await settle();
  assert.equal(sync.getSnapshot().get("a")?.failed, false);
});

test("a read from before the save does not take the box away", async () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardTextSync(transport, { retryDelays: [] });
  sync.create(box("a"));
  calls[0].resolve();
  await settle();
  // The refresh that left before the save shows no box yet.
  sync.reconcile([], Date.now());
  assert.deepEqual(mergeBoardTexts([], sync.getSnapshot()), [box("a")]);
  // Once the server has it, the server's copy is used.
  sync.reconcile([box("a", { updatedByName: "김" })], Date.now());
  assert.equal(sync.getSnapshot().size, 0);
});

test("a teammate's later delete shows once a read is clearly newer", async () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardTextSync(transport, { retryDelays: [] });
  sync.update(box("a"), { x: 3 });
  calls[0].resolve();
  await settle();
  sync.reconcile([], Date.now() + 10_000);
  assert.deepEqual(mergeBoardTexts([], sync.getSnapshot()), []);
});

test("deleting a box never sent asks nothing of the server", () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardTextSync(transport, { retryDelays: [] });
  sync.create(box("a", { text: "" }), { hold: true });
  sync.remove(box("a"));
  assert.equal(calls.length, 0);
  assert.equal(sync.getSnapshot().size, 0);
});

test("deleting a box whose first save is out deletes it after", async () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardTextSync(transport, { retryDelays: [] });
  sync.create(box("a"));
  sync.remove(box("a"));
  assert.deepEqual(mergeBoardTexts([], sync.getSnapshot()), []);
  calls[0].resolve();
  await settle();
  assert.equal(calls[1].kind, "remove");
});

test("closing the board saves what was being typed and drops empty boxes", () => {
  const { calls, transport } = fakeServer();
  const sync = new BoardTextSync(transport, { retryDelays: [] });
  sync.create(box("a", { text: "남길 메모" }), { hold: true });
  sync.create(box("b", { text: " " }), { hold: true });
  sync.releaseAll();
  assert.equal(calls.length, 1);
  assert.equal((calls[0].text as OrgBoardText).id, "a");
  assert.equal(sync.getSnapshot().has("b"), false);
});
