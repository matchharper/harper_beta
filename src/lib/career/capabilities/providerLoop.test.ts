import assert from "node:assert/strict";
import test from "node:test";
import { CareerCapabilityRuntime } from "./runtime";
import {
  CAREER_CAPABILITY_LOADER as LOADER,
  CAREER_CORE_TOOLS,
} from "./registry";

const sse = (events: unknown[]) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "Content-Type": "text/event-stream" } }
  );

test("every provider and streaming path reassembles policies and schemas, rejects same-response unoffered tools, and hides loader UI", async () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: typeof fetch;
  globalThis.fetch = (...args) => mockFetch(...args);
  const keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"];
  const previous = keys.map((key) => process.env[key]);
  keys.forEach((key) => (process.env[key] = "test-key"));
  try {
    const { runCareerChatAssistant, runCareerChatAssistantStream } =
      await import("../llm");
    for (const provider of [
      "anthropic",
      "openai",
      "openrouter",
      "openrouter-fallback",
    ])
      for (const streaming of [false, true]) {
        const model =
          provider === "anthropic"
            ? "claude-sonnet-4-6"
            : provider === "openai"
              ? "gpt-5.6-terra"
              : "z-ai/glm-5.3-flash";
        const tools = [
          ...CAREER_CORE_TOOLS,
          "list_documents",
          "read_document",
          "generate_resume",
          "web_search",
          "open_url",
        ].map((name) => ({
          type: "function" as const,
          function: {
            name,
            description: name,
            parameters: { type: "object", properties: {} },
          },
        }));
        const runtime = new CareerCapabilityRuntime({
          mode: "progressive",
          eligibleTools: tools,
          promptArgs: () => ({
            channel: "chat",
            isOnboardingDone: true,
            profile: null,
            structuredProfileText: "",
            talentContextSection: "",
            currentPreferences: { preferredLocale: "ko" },
          }),
        });
        const initial = runtime.resolveStep(false);
        let requests = 0;
        const executed: string[] = [],
          ui: string[] = [];
        mockFetch = async (url, init) => {
          if (String(url).includes("/rest/v1/")) return Response.json([]);
          if (
            provider === "openrouter-fallback" &&
            String(url).includes("openrouter.ai")
          )
            return Response.json(
              { error: { message: "Invalid authentication", code: 401 } },
              { status: 401 }
            );
          const body = JSON.parse(String(init?.body));
          requests++;
          assert.ok(requests <= 5, `${provider}/${streaming}`);
          const offered = body.tools.map(
            (tool: any) => tool.name ?? tool.function?.name
          );
          assert.equal(offered.includes("generate_resume"), requests >= 2);
          assert.equal(offered.includes("web_search"), requests >= 4);
          const text = JSON.stringify(
            body.system ?? body.messages ?? body.input
          );
          assert.equal(
            text.includes("### Resume creation and revision"),
            requests >= 2
          );
          if (provider === "anthropic")
            assert.ok(
              (JSON.stringify(body).match(/"cache_control"/g) ?? []).length <= 4
            );
          if (requests === 2)
            assert.ok(
              JSON.stringify(body).includes("tool_not_offered"),
              "denied call is paired with an explicit result"
            );
          const names =
            requests === 1
              ? [LOADER, "generate_resume"]
              : requests === 2
                ? ["read_document", "generate_resume"]
                : requests === 3
                  ? [LOADER]
                  : requests === 4
                    ? ["web_search"]
                    : [];
          const calls = names.map((name, index) => ({
            id: `c-${requests}-${index}`,
            name,
            input:
              name === LOADER
                ? {
                    capabilityIds: [
                      requests === 1 ? "resume_authoring" : "web_research",
                    ],
                  }
                : {},
          }));
          const final = requests === 5;
          if (provider === "anthropic") {
            const content = final
              ? [{ type: "text", text: "done" }]
              : calls.map((call) => ({ type: "tool_use", ...call }));
            const response = {
              id: `m-${requests}`,
              model,
              content,
              stop_reason: final ? "end_turn" : "tool_use",
              usage: { input_tokens: 1, output_tokens: 1 },
            };
            return streaming
              ? sse([
                  { type: "message_start", message: response },
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
                    delta: { stop_reason: response.stop_reason },
                    usage: { output_tokens: 1 },
                  },
                  { type: "message_stop" },
                ])
              : Response.json(response);
          }
          if (provider === "openai" || provider === "openrouter-fallback") {
            const response = {
              id: `r-${requests}`,
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
                    arguments: JSON.stringify(call.input),
                  })),
              usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
            };
            return streaming
              ? sse([{ type: "response.completed", response }])
              : Response.json(response);
          }
          const message = {
            role: "assistant",
            content: final ? "done" : null,
            ...(final
              ? {}
              : {
                  tool_calls: calls.map((call, index) => ({
                    index,
                    id: call.id,
                    type: "function",
                    function: {
                      name: call.name,
                      arguments: JSON.stringify(call.input),
                    },
                  })),
                }),
          };
          return streaming
            ? sse([
                {
                  id: `r-${requests}`,
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
                id: `r-${requests}`,
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
          toolRuntime: runtime,
          tools: initial.tools,
          systemBlocks: initial.systemBlocks,
          messages: [
            {
              role: "user" as const,
              content: "이력서를 수정하고 최신 공개 자료도 확인해 줘.",
            },
          ],
          usageLabel: "test:career-progressive",
          executeTool: async ({ name }: { name: string }) => {
            executed.push(name);
            return { ok: true };
          },
          onToolStart: ({ name }: { name: string }) => {
            ui.push(name);
          },
          onToolDetected: ({ name }: { name: string }) => {
            ui.push(name);
          },
          onTextDelta: () => {},
        };
        assert.equal(
          await (streaming
            ? runCareerChatAssistantStream(args)
            : runCareerChatAssistant(args)),
          "done"
        );
        assert.deepEqual(executed, [
          "read_document",
          "generate_resume",
          "web_search",
        ]);
        assert.ok(!ui.includes(LOADER));
        assert.deepEqual(runtime.completedRecord().used, [
          "resume_authoring",
          "web_research",
        ]);
      }
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) =>
      previous[i] === undefined
        ? delete process.env[key]
        : (process.env[key] = previous[i])
    );
  }
});
