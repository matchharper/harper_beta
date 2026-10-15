import assert from "node:assert/strict";
import test from "node:test";

const sse = (events: unknown[]) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "Content-Type": "text/event-stream" } }
  );

test("Career tool budgets cover every provider, streaming mode, failures and batched calls", async () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: typeof fetch = async () => {
    throw new Error("Unexpected test request");
  };
  // SDK clients capture fetch when imported; route every request through the mock.
  globalThis.fetch = (...args) => mockFetch(...args);
  const keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"];
  const previousKeys = keys.map((key) => process.env[key]);
  keys.forEach((key) => {
    process.env[key] = "test-key";
  });
  try {
    const { runCareerChatAssistant, runCareerChatAssistantStream } =
      await import("./llm");
    for (const provider of [
      "anthropic",
      "openai",
      "openrouter",
      "openrouter-fallback",
    ]) {
      for (const streaming of [false, true]) {
        for (const hasResume of [false, true]) {
          for (const batchSize of [1, 3]) {
            const model =
              provider === "anthropic"
                ? "claude-sonnet-4-6"
                : provider === "openai"
                  ? "gpt-5.6-terra"
                  : "z-ai/glm-5.3-flash";
            const label = `${provider}, streaming=${streaming}, resume=${hasResume}, batch=${batchSize}`;
            const expected = hasResume
              ? 8
              : provider === "anthropic" && streaming
                ? 3
                : Math.min(3 * batchSize, 4);
            let executions = 0;
            let requests = 0;
            let sawUnknownDiagnostic = false;
            let sawAuthoredResult = false;
            mockFetch = async (url, init) => {
              if (
                provider === "openrouter-fallback" &&
                String(url).includes("openrouter.ai")
              ) {
                return Response.json(
                  {
                    error: {
                      message: "Missing Authentication header",
                      code: 401,
                    },
                  },
                  { status: 401 }
                );
              }
              const body = JSON.parse(String(init?.body));
              const delivered = JSON.stringify(body);
              if (delivered.includes("Synthetic unexpected error")) {
                assert.ok(delivered.includes("newProviderField"), label);
                assert.ok(!delivered.includes("[object Object]"), label);
                sawUnknownDiagnostic = true;
              }
              if (delivered.includes("기존 업무 안내 그대로")) {
                assert.ok(delivered.includes("기존 접수 원문 그대로"), label);
                sawAuthoredResult = true;
              }
              requests++;
              assert.ok(requests <= (hasResume ? 9 : 4), label);
              const final = !body.tools?.length;
              const calls = Array.from({ length: batchSize }, (_, index) => ({
                id: `call-${requests}-${index}`,
                name: "read_document",
                input: {},
              }));
              if (provider === "anthropic") {
                const content = final
                  ? [{ type: "text", text: "done" }]
                  : calls.map((call) => ({ type: "tool_use", ...call }));
                if (!streaming)
                  return Response.json({
                    id: `msg-${requests}`,
                    content,
                    stop_reason: final ? "end_turn" : "tool_use",
                    usage: { input_tokens: 1, output_tokens: 1 },
                  });
                return sse([
                  {
                    type: "message_start",
                    message: {
                      id: `msg-${requests}`,
                      model,
                      usage: { input_tokens: 1, output_tokens: 0 },
                    },
                  },
                  ...content.flatMap((block, index) => [
                    {
                      type: "content_block_start",
                      index,
                      content_block: block,
                    },
                    { type: "content_block_stop", index },
                  ]),
                  {
                    type: "message_delta",
                    delta: { stop_reason: final ? "end_turn" : "tool_use" },
                    usage: { output_tokens: 1 },
                  },
                  { type: "message_stop" },
                ]);
              }
              if (provider === "openai" || provider === "openrouter-fallback") {
                const response = {
                  id: `resp-${requests}`,
                  model,
                  status: "completed",
                  output: final
                    ? [
                        {
                          type: "message",
                          role: "assistant",
                          content: [{ type: "output_text", text: "done" }],
                        },
                      ]
                    : calls.map((call) => ({
                        type: "function_call",
                        call_id: call.id,
                        name: call.name,
                        arguments: "{}",
                      })),
                  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
                };
                return streaming
                  ? sse([
                      ...(final
                        ? [
                            {
                              type: "response.output_text.delta",
                              delta: "done",
                            },
                          ]
                        : []),
                      { type: "response.completed", response },
                    ])
                  : Response.json(response);
              }
              const toolCalls = calls.map((call, index) => ({
                index,
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: "{}" },
              }));
              const message = final
                ? { role: "assistant", content: "done" }
                : { role: "assistant", content: null, tool_calls: toolCalls };
              return streaming
                ? sse([
                    {
                      id: `chat-${requests}`,
                      model,
                      choices: [
                        {
                          index: 0,
                          delta: message,
                          finish_reason: final ? "stop" : "tool_calls",
                        },
                      ],
                    },
                  ])
                : Response.json({
                    id: `chat-${requests}`,
                    model,
                    choices: [
                      {
                        index: 0,
                        message,
                        finish_reason: final ? "stop" : "tool_calls",
                      },
                    ],
                  });
            };
            const args = {
              primaryModel: model,
              messages: [
                {
                  role: "user" as const,
                  content: "Read and update my document.",
                },
              ],
              systemBlocks: [
                { key: "tool_policy", text: "Use available tools." },
              ],
              tools: [
                "read_document",
                ...(hasResume ? ["generate_resume"] : []),
              ].map((name) => ({
                type: "function" as const,
                function: {
                  name,
                  description: name,
                  parameters: { type: "object", properties: {} },
                },
              })),
              executeTool: async () => {
                executions++;
                if (executions === 2)
                  throw { message: "Synthetic unexpected error", newProviderField: [2, 4], cause: { code: "E_NEW" } };
                return { ok: true, assistantInstruction: "기존 업무 안내 그대로", answerDraft: "기존 접수 원문 그대로" };
              },
              onToolStart: async () => { throw new Error("Progress display unavailable"); },
              onTextDelta: () => {},
              usageLabel: "test:career-tool-budget",
            };
            const result = await (streaming
              ? runCareerChatAssistantStream(args)
              : runCareerChatAssistant(args));
            assert.equal(result, "done", label);
            assert.equal(executions, expected, label);
            assert.ok(sawUnknownDiagnostic, label);
            assert.ok(sawAuthoredResult, label);
            const { EmailContinuationPending } = await import("@/lib/email/runtime/types");
            const control = new EmailContinuationPending("Continue this job later");
            executions = 0; requests = 0;
            await assert.rejects(streaming
              ? runCareerChatAssistantStream({ ...args, executeTool: async () => { executions++; throw control; } })
              : runCareerChatAssistant({ ...args, executeTool: async () => { executions++; throw control; } }), error => error === control, label);
            assert.equal(executions, 1, label);
            assert.equal(requests, 1, label);

          }
        }
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => {
      if (previousKeys[index] === undefined) delete process.env[key];
      else process.env[key] = previousKeys[index];
    });
  }
});
