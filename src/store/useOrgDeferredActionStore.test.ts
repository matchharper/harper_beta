import assert from "node:assert/strict";
import { before, test } from "node:test";

// A small window: timers and the leave-page listener, nothing else.
const listeners = new Set<unknown>();
type Store = typeof import("./useOrgDeferredActionStore");
let store: Store;

before(async () => {
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener: (type: string, listener: unknown) => {
      if (type === "beforeunload") listeners.add(listener);
    },
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    removeEventListener: (type: string, listener: unknown) => {
      if (type === "beforeunload") listeners.delete(listener);
    },
    setTimeout: (run: () => void, ms: number) => setTimeout(run, ms),
  };
  store = await import("./useOrgDeferredActionStore");
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const state = () => store.useOrgDeferredActionStore.getState();

test("undo within the window means the decision never runs", async () => {
  let ran = false;
  const id = state().schedule({
    delayMs: 20,
    recommendationIds: ["r1"],
    run: async () => {
      ran = true;
    },
    stage: "process_stopped",
  });
  assert.equal(state().deferredStages.get("r1"), "process_stopped");
  assert.equal(listeners.size, 1);
  assert.equal(state().cancel(id), true);
  await wait(40);
  assert.equal(ran, false);
  assert.equal(state().deferredStages.has("r1"), false);
  assert.equal(listeners.size, 0);
});

test("once sent, it cannot be undone and leaving warns until it ends", async () => {
  let finish: () => void = () => undefined;
  const id = state().schedule({
    delayMs: 10,
    recommendationIds: ["r2", "r3"],
    run: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  });
  await wait(30);
  // Running: too late to undo, and closing the tab would cut it.
  assert.equal(state().cancel(id), false);
  assert.equal(listeners.size, 1);
  assert.equal(state().deferredStages.has("r2"), true);
  finish();
  await wait(10);
  assert.equal(listeners.size, 0);
  assert.equal(state().deferredStages.has("r2"), false);
});
