import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenAIResponsesRequest } from "@/lib/llm/responsesChatAdapter";

process.env.OPENAI_API_KEY ||= "test-openai-key";

function asyncStream(items: unknown[]) {
  return (async function* () {
    for (const item of items) yield item;
  })();
}

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

test("runs career insight extraction and conversation summaries through Luna high", async () => {
  const [
    { client },
    { runCareerConversationSummary, runCareerInsightExtraction },
  ] = await Promise.all([import("@/lib/llm/llm"), import("@/lib/career/llm")]);
  const responsesPrototype = Object.getPrototypeOf(client.responses) as any;
  const originalCreate = responsesPrototype.create;
  const requests: Record<string, any>[] = [];
  responsesPrototype.create = async (body: Record<string, any>) => {
    requests.push(body);
    return {
      model: "gpt-5.6-luna",
      output: [
        {
          content: [{ text: '{"ok":true}', type: "output_text" }],
          role: "assistant",
          type: "message",
        },
      ],
      status: "completed",
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    };
  };

  try {
    await runCareerInsightExtraction({
      conversationMessages: [{ content: "I prefer Seoul.", role: "user" }],
      systemPrompt: "Extract JSON.",
    });
    await runCareerConversationSummary({
      systemPrompt: "Summarize JSON.",
      userPrompt: "Conversation.",
    });

    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.model, "gpt-5.6-luna");
      assert.deepEqual(request.reasoning, { effort: "high" });
      assert.deepEqual(request.text, { format: { type: "json_object" } });
    }
  } finally {
    responsesPrototype.create = originalCreate;
  }
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

test("runs the talent tool loop through Luna Responses with high reasoning", async () => {
  const [{ client }, { runTalentAssistantToolLoop }] = await Promise.all([
    import("@/lib/llm/llm"),
    import("@/lib/talentOnboarding/llm"),
  ]);
  const responsesPrototype = Object.getPrototypeOf(client.responses) as any;
  const originalCreate = responsesPrototype.create;
  const requests: Record<string, any>[] = [];
  responsesPrototype.create = async (body: Record<string, any>) => {
    requests.push(body);
    if (requests.length === 1) {
      return {
        id: "resp-tool-call",
        model: "gpt-5.6-luna",
        output: [
          { encrypted_content: "opaque", type: "reasoning" },
          {
            arguments: '{"kind":"instant","max_results":5}',
            call_id: "call-recommend",
            name: "recommend_job_postings",
            type: "function_call",
          },
        ],
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
      };
    }
    return {
      id: "resp-final",
      model: "gpt-5.6-luna",
      output: [
        {
          content: [{ text: "새 기회를 찾아봤어요.", type: "output_text" }],
          role: "assistant",
          type: "message",
        },
      ],
      status: "completed",
      usage: { input_tokens: 120, output_tokens: 10, total_tokens: 130 },
    };
  };

  try {
    const result = await runTalentAssistantToolLoop({
      executeTool: async () => ({ recommendationCount: 5 }),
      messages: [
        { content: "Use feedback and find roles.", role: "system" },
        { content: "Continue now.", role: "user" },
      ],
      modelConfig: {
        fallbackModel: "grok-4.3",
        primaryModel: "gpt-5.6-luna",
      },
      openAIResponsesReasoningEffort: "high",
      temperature: 0.55,
      tools: [
        {
          function: {
            description: "Find fresh recommendations.",
            name: "recommend_job_postings",
            parameters: {
              additionalProperties: false,
              properties: {
                kind: { type: "string" },
                max_results: { type: "number" },
              },
              required: ["kind", "max_results"],
              type: "object",
            },
          },
          type: "function",
        },
      ],
      usageLabel: "test:feedback-followup",
    });

    assert.equal(result, "새 기회를 찾아봤어요.");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].reasoning, { effort: "high" });
    assert.deepEqual(requests[1].reasoning, { effort: "high" });
    assert.ok(
      requests[1].input.some(
        (item: Record<string, unknown>) => item.type === "reasoning"
      )
    );
    assert.ok(
      requests[1].input.some(
        (item: Record<string, unknown>) =>
          item.type === "function_call_output" &&
          item.call_id === "call-recommend"
      )
    );
  } finally {
    responsesPrototype.create = originalCreate;
  }
});

test("streams Luna text while preserving Responses tool and reasoning output", async () => {
  const [{ client }, { runTalentAssistantToolLoop }] = await Promise.all([
    import("@/lib/llm/llm"),
    import("@/lib/talentOnboarding/llm"),
  ]);
  const responsesPrototype = Object.getPrototypeOf(client.responses) as any;
  const originalCreate = responsesPrototype.create;
  const requests: Record<string, any>[] = [];
  responsesPrototype.create = async (body: Record<string, any>) => {
    requests.push(body);
    if (requests.length === 1) {
      return asyncStream([
        {
          delta: '{"kind":',
          item_id: "function-item",
          output_index: 1,
          type: "response.function_call_arguments.delta",
        },
        {
          delta: '"instant"}',
          item_id: "function-item",
          output_index: 1,
          type: "response.function_call_arguments.delta",
        },
        {
          response: {
            id: "resp-tool-call",
            model: "gpt-5.6-luna",
            output: [
              {
                encrypted_content: "opaque",
                id: "reasoning-1",
                type: "reasoning",
              },
              {
                arguments: '{"kind":"instant"}',
                call_id: "call-recommend",
                id: "function-item",
                name: "recommend_job_postings",
                type: "function_call",
              },
            ],
            status: "completed",
            usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
          },
          type: "response.completed",
        },
      ]);
    }
    return asyncStream([
      { delta: "새 기회를 ", type: "response.output_text.delta" },
      { delta: "찾았어요.", type: "response.output_text.delta" },
      {
        response: {
          id: "resp-final",
          model: "gpt-5.6-luna",
          output: [
            {
              content: [{ text: "새 기회를 찾았어요.", type: "output_text" }],
              role: "assistant",
              type: "message",
            },
          ],
          status: "completed",
          usage: { input_tokens: 120, output_tokens: 10, total_tokens: 130 },
        },
        type: "response.completed",
      },
    ]);
  };
  const textDeltas: string[] = [];

  try {
    const result = await runTalentAssistantToolLoop({
      executeTool: async () => ({ recommendationCount: 5 }),
      messages: [{ content: "Find roles.", role: "user" }],
      modelConfig: {
        primaryModel: "gpt-5.6-luna",
      },
      onTextDelta: (delta) => {
        textDeltas.push(delta);
      },
      openAIResponsesReasoningEffort: "xhigh",
      tools: [
        {
          function: {
            description: "Find fresh recommendations.",
            name: "recommend_job_postings",
            parameters: { type: "object" },
          },
          type: "function",
        },
      ],
    });

    assert.equal(result, "새 기회를 찾았어요.");
  } finally {
    responsesPrototype.create = originalCreate;
  }

  assert.deepEqual(textDeltas, ["새 기회를 ", "찾았어요."]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].stream, true);
  assert.deepEqual(requests[0].reasoning, { effort: "xhigh" });
  assert.ok(
    requests[1].input.some(
      (item: Record<string, unknown>) =>
        item.type === "reasoning" && item.encrypted_content === "opaque"
    )
  );
  assert.ok(
    requests[1].input.some(
      (item: Record<string, unknown>) =>
        item.type === "function_call_output" &&
        item.call_id === "call-recommend"
    )
  );
});
