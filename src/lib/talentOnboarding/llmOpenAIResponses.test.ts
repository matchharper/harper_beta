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
    model: "gpt-6-luna",
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
      model: "gpt-6-luna",
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
      assert.equal(request.model, "gpt-6-luna");
      assert.deepEqual(request.reasoning, { effort: "high" });
      assert.deepEqual(request.text, { format: { type: "json_object" } });
    }
  } finally {
    responsesPrototype.create = originalCreate;
  }
});

test("runs call note analysis through Luna low with a strict schema", async () => {
  const [{ client }, { runCareerCallNoteAnalysis }] = await Promise.all([
    import("@/lib/llm/llm"),
    import("@/lib/career/llm"),
  ]);
  const responsesPrototype = Object.getPrototypeOf(client.responses) as any;
  const originalCreate = responsesPrototype.create;
  const captured: { request: Record<string, any> | null } = { request: null };
  responsesPrototype.create = async (body: Record<string, any>) => {
    captured.request = body;
    return {
      model: "gpt-6-luna",
      output: [
        {
          content: [
            {
              text: JSON.stringify({
                should_create: true,
                title: "보상 기준 정리",
                key_points: ["기본급을 우선한다."],
              }),
              type: "output_text",
            },
          ],
          role: "assistant",
          type: "message",
        },
      ],
      status: "completed",
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    };
  };

  try {
    const result = await runCareerCallNoteAnalysis({
      systemPrompt: "Judge the call.",
      userPrompt: "User: 기본급이 중요해요.",
    });

    assert.match(result, /보상 기준 정리/);
    assert.ok(captured.request);
    assert.equal(captured.request.model, "gpt-6-luna");
    assert.deepEqual(captured.request.reasoning, { effort: "low" });
    assert.equal(captured.request.text?.format?.type, "json_schema");
    assert.equal(
      captured.request.text?.format?.name,
      "career_call_note_analysis"
    );
    assert.equal(captured.request.text?.format?.strict, true);
  } finally {
    responsesPrototype.create = originalCreate;
  }
});

test("preserves GPT-6 Luna explicit cache breakpoints and structured output", () => {
  const schema = {
    properties: { evaluations: { items: {}, type: "array" } },
    required: ["evaluations"],
    type: "object",
  };
  const requestBody = buildOpenAIResponsesRequest({
    model: "gpt-6-luna",
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
        model: "gpt-6-luna",
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
      model: "gpt-6-luna",
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
        fallbackModel: "gpt-4.1-mini",
        primaryModel: "gpt-6-luna",
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
            model: "gpt-6-luna",
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
          model: "gpt-6-luna",
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
        primaryModel: "gpt-6-luna",
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

test("completion metadata preserves provider truncation instead of losing the finish reason", async () => {
  const [{ client }, { runTalentAssistantCompletion }] = await Promise.all([
    import("@/lib/llm/llm"), import("./llm"),
  ]);
  const prototype = Object.getPrototypeOf(client.responses) as any;
  const original = prototype.create;
  prototype.create = async () => ({
    model: "gpt-6-luna", status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: '{"summary":"cut' }] }],
    usage: { input_tokens: 100, output_tokens: 6500, total_tokens: 6600 },
  });
  try {
    let observed: unknown;
    await runTalentAssistantCompletion({ primaryModel: "gpt-6-luna", openAIResponsesReasoningEffort: "medium", messages: [{ role: "user", content: "JSON" }], onCompletionMetadata: value => { observed = value; } });
    assert.deepEqual(observed, { model: "gpt-6-luna", finishReason: "length", completionTokens: 6500 });
  } finally { prototype.create = original; }
});

test("Responses tool loop sends structured unexpected errors back to the model", async () => {
  const [{ client }, { runTalentAssistantToolLoop }] = await Promise.all([
    import("@/lib/llm/llm"), import("./llm"),
  ]);
  const prototype = Object.getPrototypeOf(client.responses) as any;
  const original = prototype.create;
  const requests: any[] = [];
  prototype.create = async (body: any) => {
    requests.push(body);
    return { id: `response-${requests.length}`, model: "gpt-6-luna", status: "completed",
      output: requests.length === 1
        ? [{ type: "function_call", name: "read_talent_context", call_id: "error-call", arguments: "{}" }]
        : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "확인하지 못했어요." }] }],
    };
  };
  const tools = [{ type: "function" as const, function: { name: "read_talent_context", description: "Read context", parameters: { type: "object", properties: {} } } }];
  const { CareerCapabilityRuntime } = await import("@/lib/career/capabilities/runtime");
  const runtime = new CareerCapabilityRuntime({ mode: "progressive", eligibleTools: tools,
    promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "", talentContextSection: "" }),
  });
  try {
    await runTalentAssistantToolLoop({
      toolRuntime: runtime,
      messages: [{ role: "user", content: "저장된 내용을 확인해줘" }],
      modelConfig: { primaryModel: "gpt-6-luna", fallbackModel: "gpt-4.1-mini" },
      openAIResponsesReasoningEffort: "high",
      executeTool: async () => { throw { message: "read failed", code: "NEW_DB_CODE", details: "remote unavailable" }; },
      tools,
    });
    const sent = requests[1].input.find((item: any) => item.type === "function_call_output").output;
    // Explicit cache sends tool results as text parts so the last one can carry a breakpoint.
    const output = Array.isArray(sent) ? sent.map((part: any) => part.text).join("") : sent;
    assert.match(output, /NEW_DB_CODE/);
    assert.match(output, /remote unavailable/);
    assert.ok(!output.includes("[object Object]"));
    const receipt = runtime.completedRecord().toolResults?.find(result => result.name === "read_talent_context");
    assert.equal(receipt?.successful, false);
    assert.equal(receipt?.execution?.output, output, "the next conversation receives the same failure details as this completion");
  } finally { prototype.create = original; }
});

test("Career tool loop keeps each step's cached prefix and sends changing blocks after it", async () => {
  const [{ client }, { runTalentAssistantToolLoop }] = await Promise.all([
    import("@/lib/llm/llm"),
    import("@/lib/talentOnboarding/llm"),
  ]);
  const responsesPrototype = Object.getPrototypeOf(client.responses) as any;
  const originalCreate = responsesPrototype.create;
  const requests: Record<string, any>[] = [];
  const replies = [
    [{ type: "function_call", call_id: "c1", name: "web_search", arguments: "{\"query\":\"a\"}" }],
    [{ type: "function_call", call_id: "c2", name: "web_search", arguments: "{\"query\":\"b\"}" }],
    [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] }],
  ];
  responsesPrototype.create = async (body: Record<string, any>) => {
    requests.push(structuredClone(body));
    return { model: "gpt-6.1-terra", output: replies[requests.length - 1], status: "completed",
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
  };
  let note = "Matching note v1";
  const step = () => ({
    tools: [{ type: "function", function: { name: "web_search", description: "Search", parameters: { type: "object", properties: {} } } }],
    systemBlocks: [
      { key: "career_main", text: "Stable instructions", cacheable: true },
      { key: "profile_context", text: "Profile", cacheable: true },
      { key: "dynamic_state", text: "Runtime state" },
      { key: "current_time", text: "현재 시각: Nov 18, 19:06" },
      { key: "matching_work_note", text: note, placement: "after_conversation" as const },
    ],
  });
  const runtime: any = {
    maxToolLoops: 5, maxToolCalls: 5,
    resumedMessages: () => undefined,
    resolveStep: step,
    runCompletion: (_step: unknown, _input: unknown, work: () => unknown) => work(),
    claimCall: () => null,
    isInternalTool: () => false,
    shouldDeferToolCall: async () => false,
    recordResult: async () => { note = "Matching note v2 after an edit"; },
    shouldFinishAfterTool: () => false,
  };
  try {
    const text = await runTalentAssistantToolLoop({
      executeTool: async () => ({ modelOutput: "result" }),
      messages: [{ role: "system", content: "placeholder" }, { role: "user", content: "Find roles" }],
      modelConfig: { primaryModel: "gpt-6.1-terra", fallbackModel: "gpt-6.1-terra" } as any,
      openAIResponsesReasoningEffort: "medium",
      toolRuntime: runtime,
      tools: step().tools as any,
    });
    assert.equal(text, "done");
    assert.equal(requests.length, 3);
    const withoutMarks = (items: any[]) => JSON.parse(JSON.stringify(items, (key, value) => key === "prompt_cache_breakpoint" ? undefined : value));
    for (const [index, request] of requests.entries()) {
      assert.deepEqual(request.prompt_cache_options, { mode: "explicit", ttl: "30m" });
      const input = request.input as any[];
      // The note changes between steps but always follows the last breakpoint.
      const last = input.at(-1);
      assert.equal(last.role, "developer");
      assert.equal(last.content, index === 0 ? "Matching note v1" : "Matching note v2 after an edit");
      assert.ok(!JSON.stringify(input.slice(0, -1)).includes("Matching note"));
      if (index === 0) continue;
      // Everything the previous step sent before its trailing note is an exact prefix here.
      const previous = requests[index - 1].input.slice(0, -1);
      assert.deepEqual(withoutMarks(input.slice(0, previous.length)), withoutMarks(previous));
      const readEnd = input[previous.length - 1];
      const marked = Array.isArray(readEnd.output) ? readEnd.output.at(-1) : readEnd.content.at(-1);
      assert.deepEqual(marked.prompt_cache_breakpoint, { mode: "explicit" });
    }
    // Time is the last system text; the profile prefix keeps its own breakpoint.
    const system = requests[0].input[0].content;
    assert.equal(system.map((part: any) => part.text).join(""), "Stable instructions\n\nProfile\n\nRuntime state\n\n현재 시각: Nov 18, 19:06");
    assert.deepEqual(system.map((part: any) => Boolean(part.prompt_cache_breakpoint)), [true, false]);
    assert.match(requests[2].input.at(-1).content, /Matching note v2/);
  } finally {
    responsesPrototype.create = originalCreate;
  }
});
