import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenAIResponsesRequest } from "@/lib/llm/responsesChatAdapter";

test("builds Luna Responses requests with high reasoning and JSON mode", () => {
  const requestBody = buildOpenAIResponsesRequest({
    model: "gpt-5.6-luna",
    reasoningEffort: "high",
    requestBody: {
      messages: [{ content: "Return JSON", role: "user" }],
      response_format: { type: "json_object" },
    },
  });

  assert.deepEqual(requestBody.reasoning, { effort: "high" });
  assert.deepEqual(requestBody.text, {
    format: { type: "json_object" },
  });
  assert.deepEqual(requestBody.input, [
    { content: "Return JSON", role: "user" },
  ]);
});

test("preserves GPT-5.6 explicit cache breakpoints and structured output", () => {
  const schema = {
    properties: { evaluations: { items: {}, type: "array" } },
    required: ["evaluations"],
    type: "object",
  };
  const requestBody = buildOpenAIResponsesRequest({
    model: "gpt-5.6-luna",
    reasoningEffort: "high",
    requestBody: {
      messages: [
        {
          content: [
            {
              prompt_cache_breakpoint: { mode: "explicit" },
              text: "Stable instructions",
              type: "input_text",
            },
          ],
          role: "system",
        },
        { content: "Changing candidate batch", role: "user" },
      ],
      prompt_cache_key: "career-job-fit:v2:s01",
      prompt_cache_options: { mode: "explicit", ttl: "30m" },
      response_format: {
        json_schema: { name: "evaluations", schema, strict: true },
        type: "json_schema",
      },
    },
  });

  assert.equal(requestBody.prompt_cache_key, "career-job-fit:v2:s01");
  assert.deepEqual(requestBody.prompt_cache_options, {
    mode: "explicit",
    ttl: "30m",
  });
  assert.deepEqual(
    (requestBody.input[0] as any).content[0].prompt_cache_breakpoint,
    { mode: "explicit" }
  );
  assert.equal((requestBody.input[0] as any).content[0].type, "input_text");
  assert.equal(
    (requestBody.input[1] as any).content,
    "Changing candidate batch"
  );
  assert.deepEqual(requestBody.text, {
    format: {
      name: "evaluations",
      schema,
      strict: true,
      type: "json_schema",
    },
  });
});
