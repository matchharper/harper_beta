import assert from "node:assert/strict";
import test from "node:test";
import { runToolCall, prepareToolDelivery, executeToolCall, reportToolDiagnostic, prepareNativeToolDelivery, observeToolCall } from "./toolExecution";
import { serializeToolResultForModel, TOOL_RUNTIME_CONTROL } from "./toolError";

test("source result and authored instructions stay unchanged while internal errors reach model content", async () => {
  const value = { ok: false, assistantInstruction: "기존 안내 그대로", answerDraft: "접수 문구 그대로", sentIds: [1] };
  const capture = await runToolCall(async () => { reportToolDiagnostic({ message: "socket closed", failedItems: [2, 3] }); return value; });
  assert.ok(capture.returned); assert.equal(capture.value, value);
  const output = JSON.parse(prepareToolDelivery(capture, value => JSON.stringify(value)));
  assert.equal(output.assistantInstruction, value.assistantInstruction);
  assert.equal(output.answerDraft, value.answerDraft);
  assert.deepEqual(output.sentIds, [1]);
  assert.match(output.additionalToolDiagnostics, /failedItems/);
  assert.equal("additionalToolDiagnostics" in value, false);
});
test("parallel calls and primitive outputs keep their own diagnostics", async () => {
  const captures = await Promise.all([1,2].map(id => runToolCall(async () => {
    await new Promise(resolve => setTimeout(resolve, 3 - id));
    reportToolDiagnostic({ message: `failure-${id}` }); return `authored-${id}`;
  })));
  captures.forEach((capture, i) => {
    const text = prepareToolDelivery(capture, value => String(value));
    assert.ok(text.startsWith(`authored-${i+1}`)); assert.match(text, new RegExp(`failure-${i+1}`));
    assert.ok(!text.includes(`failure-${2-i}`));
  });
});
test("unusual throws and control exceptions retain original identity; executor runs once", async () => {
  for (const error of [null, 0, { message: "new SDK failure", newField: [1] }, new Error("control")]) {
    let calls = 0;
    const capture = await runToolCall(async () => { calls++; throw error; });
    assert.ok(!capture.returned); assert.equal(capture.error, error); assert.equal(calls, 1);
    assert.equal(typeof prepareToolDelivery(capture, JSON.stringify), "string");
    try { await executeToolCall(async () => { throw error; }); assert.fail("must throw"); } catch (actual) { assert.equal(actual, error); }
  }
});
test("native images and blocks are retained without flattening", async () => {
  const blocks = [{ type: "image", data: "fixture" }, { type: "text", text: "원문" }];
  const capture = await runToolCall(async () => { reportToolDiagnostic("read failed"); return blocks; });
  const delivery = prepareNativeToolDelivery(capture, value => value);
  assert.equal(delivery.content, blocks); assert.match(delivery.diagnosticText!, /read failed/);
});
test("reusing a cached result does not keep old diagnostics", async () => {
  const result = { ok: true };
  await executeToolCall(async () => { reportToolDiagnostic("old failure"); return result; });
  assert.match(serializeToolResultForModel(result), /old failure/);
  await executeToolCall(async () => result);
  assert.ok(!serializeToolResultForModel(result).includes("old failure"));
});
test("formatter failure never replays an already completed write", async () => {
  let writes = 0;
  const capture = await runToolCall(async () => { writes++; return { secretDocument: "must not leak" }; });
  const text = prepareToolDelivery(capture, () => { throw { message: "formatter failure", custom: 1 }; });
  assert.equal(writes, 1); assert.match(text, /formatter failure/); assert.ok(!text.includes("must not leak"));
});

test("reporting failures do not block execution while typed continuation signals propagate", async () => {
  let writes = 0;
  await observeToolCall(() => { throw new Error("progress unavailable"); });
  await executeToolCall(async () => { writes++; return { ok: true }; });
  assert.equal(writes, 1);
  const error = Object.assign(new Error("continue later"), { [TOOL_RUNTIME_CONTROL]: true });
  await assert.rejects(observeToolCall(() => { throw error; }), actual => actual === error);
});

test("reported partial facts survive an eventual primitive throw", async () => {
  const capture = await runToolCall(async () => { reportToolDiagnostic({ savedIds: [1], message: "second item failed" }); throw "final failure"; });
  const output = prepareToolDelivery(capture, JSON.stringify);
  assert.match(output, /savedIds/); assert.match(output, /final failure/);
});

test("post-execution reporting failures preserve verified results and reach the model", async () => {
  const original = { ok: true, savedIds: [1], assistantInstruction: "기존 안내" };
  const capture = await runToolCall(async () => {
    await observeToolCall(() => { throw { message: "context refresh failed", code: "E_READ" }; });
    return original;
  });
  assert.ok(capture.returned); assert.equal(capture.value, original);
  const output = prepareToolDelivery(capture, JSON.stringify);
  assert.match(output, /savedIds/); assert.match(output, /E_READ/);
});
