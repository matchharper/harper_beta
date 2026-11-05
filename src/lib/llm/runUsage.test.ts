import { test } from "node:test";
import assert from "node:assert/strict";
import { withLlmUsageContext } from "./usageContext";
import { addLlmCallToRunUsage, companyRunUsageJson, createCompanyRunUsage, mergeRunUsage } from "./runUsage";

test("model calls inside a company run add to its usage, nested contexts included", async () => {
  const totals = createCompanyRunUsage();
  const response = { usage: { prompt_tokens: 1000, completion_tokens: 200 } };
  await addLlmCallToRunUsage("gpt-6-luna", response); // outside any run: ignored
  await withLlmUsageContext({ requestId: "job", companyRunUsage: totals }, async () => {
    await addLlmCallToRunUsage("gpt-6-luna", response);
    await withLlmUsageContext({ requestId: "nested" }, () => addLlmCallToRunUsage("unknown-model-x", response));
  });
  assert.equal(totals.calls, 2);
  assert.equal(totals.inputTokens, 2000);
  assert.equal(totals.outputTokens, 400);
  assert.equal(totals.unpricedCalls, 1);
  assert.ok(totals.costUsd > 0);
  assert.deepEqual(totals.models, ["gpt-6-luna", "unknown-model-x"]);
  const stored = companyRunUsageJson(totals, 1234.4);
  assert.equal(stored.costComplete, false);
  assert.equal(stored.elapsedMs, 1234);
});

test("a retried run keeps the usage of its earlier attempts", () => {
  const first = mergeRunUsage(null, companyRunUsageJson({ ...createCompanyRunUsage(), calls: 1, costUsd: 0.1,
    inputTokens: 10, models: ["a"] }, 100));
  assert.equal(first.attempts, 1);
  const second = mergeRunUsage(first, companyRunUsageJson({ ...createCompanyRunUsage(), calls: 2, costUsd: 0.2,
    inputTokens: 5, models: ["b"], unpricedCalls: 1 }, 50));
  assert.equal(second.attempts, 2);
  assert.equal(second.calls, 3);
  assert.equal(second.costUsd, 0.3);
  assert.equal(second.inputTokens, 15);
  assert.equal(second.elapsedMs, 150);
  assert.equal(second.costComplete, false);
  assert.deepEqual(second.models, ["a", "b"]);
});
