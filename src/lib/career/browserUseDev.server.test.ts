import test from "node:test";
import assert from "node:assert/strict";
import { browserUseAgents } from "./simulation/browserUseAgents";
import { runBrowserUseDev, type BrowserUseDevEvent } from "./browserUseDev.server";

const run = { id: "run", sessionId: "session", status: "running" };

test("dev preview returns only the answer and cleans up its own browser", async (t) => {
  const events: BrowserUseDevEvent[] = [];
  t.mock.method(browserUseAgents, "createRun", async () => run);
  t.mock.method(browserUseAgents, "status", async () => ({ status: "completed" }));
  t.mock.method(browserUseAgents, "livePreview", async () => "https://live.browser-use.com/session/test");
  t.mock.method(browserUseAgents, "result", async () => ({ ...run, status: "completed", output: JSON.stringify({ text: "Example Domain" }) }));
  const stop = t.mock.method(browserUseAgents, "stop", async () => {});
  await runBrowserUseDev("Open example.com", new AbortController().signal, (event) => events.push(event));
  assert.deepEqual(events.map((event) => event.type), ["preview", "result", "done"]);
  assert.deepEqual(events[1], { type: "result", text: "Example Domain" });
  assert.deepEqual(stop.mock.calls[0].arguments, [{ runId: "run", sessionId: "session" }, false]);
});

test("closing during dispatch still cleans up the run once its IDs arrive", async (t) => {
  const abort = new AbortController();
  t.mock.method(browserUseAgents, "createRun", async () => { abort.abort(); return run; });
  const stop = t.mock.method(browserUseAgents, "stop", async () => {});
  const events: BrowserUseDevEvent[] = [];
  await runBrowserUseDev("Open example.com", abort.signal, (event) => events.push(event));
  assert.equal(stop.mock.callCount(), 1);
  assert.deepEqual(events.map((event) => event.type), ["error", "done"]);
});

test("provider failures and cleanup failures are surfaced without retrying dispatch", async (t) => {
  const create = t.mock.method(browserUseAgents, "createRun", async () => run);
  t.mock.method(browserUseAgents, "status", async () => { throw new Error("provider unavailable"); });
  t.mock.method(browserUseAgents, "livePreview", async () => null);
  t.mock.method(browserUseAgents, "stop", async () => { throw new Error("cleanup unavailable"); });
  t.mock.method(console, "error", () => {});
  const events: BrowserUseDevEvent[] = [];
  await runBrowserUseDev("Open example.com", new AbortController().signal, (event) => events.push(event));
  assert.equal(create.mock.callCount(), 1);
  assert.deepEqual(events.map((event) => event.type), ["error", "error", "done"]);
  assert.deepEqual(events[0], { type: "error", message: "provider unavailable" });
});
