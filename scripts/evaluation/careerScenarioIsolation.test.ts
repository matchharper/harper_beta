import assert from "node:assert/strict";
import test from "node:test";
import { assertScenarioInputsOwned, CareerScenarioInputConflict } from "./careerScenarioIsolation";

test("owned followups are allowed but a new account message stops before execution", () => {
  const owned = new Set([10, 12]);
  assert.doesNotThrow(() => assertScenarioInputsOwned([{ id: 10 }, { id: 12 }], owned));
  assert.throws(() => assertScenarioInputsOwned([{ id: 10 }, { id: 11 }], owned), CareerScenarioInputConflict);
});

test("concurrent account input escapes the model tool loop instead of inviting retries", async t => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  t.after(() => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  });
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    if (String(url).includes("/rest/v1/")) return Response.json([]);
    requests++;
    assert.equal(requests, 1, "a conflict must not become another model completion");
    return Response.json({ id: "probe", model: "gpt-6.1-terra", status: "completed",
      output: [{ type: "function_call", name: "read_document", call_id: "read", arguments: "{}" }],
      usage: { input_tokens: 1, output_tokens: 1 } });
  });
  const { runCareerChatAssistant } = await import("../../src/lib/career/llm");
  await assert.rejects(runCareerChatAssistant({ primaryModel: "gpt-6.1-terra",
    systemBlocks: [{ key: "test", text: "Use the available read tool.", cacheable: false }],
    messages: [{ role: "user", content: "Read the document." }],
    tools: [{ type: "function", function: { name: "read_document", description: "Read a document", parameters: { type: "object", properties: {} } } }],
    executeTool: async () => {
      assertScenarioInputsOwned([{ id: 10 }, { id: 11 }], new Set([10]));
      throw new Error("Must not execute after the foreign input");
    }, usageLabel: "test:scenario-input-conflict",
  }), CareerScenarioInputConflict);
  assert.equal(requests, 1);
});
