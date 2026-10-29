import test from "node:test";
import assert from "node:assert/strict";
import { createInspectionUsage, runInspectionDebug } from "./applicationFormInspection.server";
import { readInspectionStream, type InspectionStreamEvent } from "./applicationFormInspection";
import { inspectApplicationForm } from "@/lib/career/simulation/applicationFormInspection";
import type { ApplicationInspectionEvent } from "@/lib/career/simulation/applicationInspectionTrace";
import type { applicationStagehandRuntime, StagehandStatus } from "@/lib/career/simulation/applicationStagehandRuntime";

test("cost uses individual receipts once, includes cached tokens and leaves missing billing unknown", () => {
  const usage = createInspectionUsage();
  const receipt = { id: "response-1", model: "gpt-6-luna", usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 400 }, output_tokens: 100 } };
  usage.add([receipt]);
  const result = usage.add([receipt, { id: "response-2", model: "unknown-model", usage: { input_tokens: 20, output_tokens: 5 } }, { id: "failed-request" }]);
  assert.equal(result.requests, 3);
  assert.equal(result.unpricedRequests, 2);
  assert.equal(result.cachedInputTokens, 400);
  assert.equal(result.estimatedCostUsd, 0.000114);
  assert.equal(createInspectionUsage().snapshot().estimatedCostUsd, null);
  const pending = usage.add([], 4);
  assert.equal(pending.requests, 4);
  assert.equal(pending.unpricedRequests, 3);
});

test("stream preserves split Korean text and rejects a connection ending before its result", async () => {
  const encoded = new TextEncoder().encode('{"type":"log","event":{"at":"now","kind":"start","message":"조사 시작"}}\n{"type":"error","message":"중단"}');
  const events: InspectionStreamEvent[] = [];
  await readInspectionStream(new ReadableStream({ start(controller) {
    for (const byte of encoded) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } }), event => events.push(event));
  assert.equal(events[0].type === "log" && events[0].event.message, "조사 시작");
  await assert.rejects(readInspectionStream(new ReadableStream({ start(controller) { controller.close(); } }), () => {}), /최종 결과/);
});

function fixture(fail = false) {
  let stopped = false;
  const state: StagehandStatus = {
    status: fail ? "error" : "completed", error: fail ? "Observed browser failure" : undefined,
    sessionId: "browser", steps: 1, maxSteps: 100, required_actions: [],
    events: [{ sequence: 1, at: new Date().toISOString(), kind: "snapshot", message: "Read form" }],
    usage: [{ id: "request-1", model: "gpt-6-luna", usage: { input_tokens: 100, output_tokens: 20 } }],
    ...(fail ? {} : {
      snapshot: { url: "https://example.com/apply", title: "Form", text: "Resume required", elements: [{ ref: "1", tag: "input", type: "file", label: "Resume", requiredState: true, fileTypes: [".pdf"] }] },
      report: { status: "read", fieldRefs: ["1"], limitations: [], submission: { status: "supported", reason: "Public form" } },
    }),
  };
  const runtime: Pick<typeof applicationStagehandRuntime, "create" | "start" | "status" | "stop"> = {
    create: async (files, url, options) => {
      assert.deepEqual(files, []); assert.equal(options?.readOnly, true);
      return { name: "test", provider: "browserbase", readOnly: true, expiresAt: new Date().toISOString() };
    },
    start: async () => {},
    status: async () => state,
    stop: async () => { stopped = true; },
  };
  return { runtime, get stopped() { return stopped; } };
}

for (const fail of [false, true]) test(`production inspector emits incremental traces and cleans up (${fail ? "failure" : "success"})`, async () => {
  const f = fixture(fail), events: ApplicationInspectionEvent[] = [];
  const result = await inspectApplicationForm("https://example.com/apply", undefined, { stagehand: f.runtime, onEvent: event => events.push(event) });
  assert.equal(f.stopped, true);
  assert.equal(events.filter(e => e.kind === "snapshot").length, 1);
  assert.equal(events.filter(e => e.kind === "usage").length, 1);
  assert.equal(events.at(-1)?.message, "브라우저·실행 환경 정리 완료");
  assert.equal(result.status, fail ? "unavailable" : "read");
  if (!fail) assert.deepEqual(result.fields[0].fileTypes, [".pdf"]);
});

test("Ops runner exposes events before completion and does not create application sessions", async () => {
  const events: InspectionStreamEvent[] = [];
  const result = await runInspectionDebug("https://example.com/apply", new AbortController().signal, e => events.push(e), async (url, signal, deps) => {
    assert.equal(events[0].type, "started");
    deps?.onEvent?.({ at: new Date().toISOString(), kind: "snapshot", message: "Visible inputs" });
    assert.equal(events.at(-1)?.type, "log");
    return { status: "partial", url: String(url), checkedAt: new Date().toISOString(), fields: [], limitations: ["Conditional step unread"], submission: { status: "unknown", reason: "Incomplete access" } };
  });
  assert.equal(events.at(-1)?.type, "completed");
  assert.equal(result.form.status, "partial");
  assert.equal(result.usage.estimatedCostUsd, null);
});

test("an observer failure cannot turn a successful read into failure or skip cleanup", async () => {
  const f = fixture();
  const result = await inspectApplicationForm("https://example.com/apply", undefined, { stagehand: f.runtime, onEvent: () => { throw Error("Disconnected UI"); } });
  assert.equal(result.status, "read");
  assert.equal(f.stopped, true);
});
