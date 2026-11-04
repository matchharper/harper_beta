import assert from "node:assert/strict";
import test from "node:test";
import { formatBrowserToolResult, USE_BROWSER_TOOL } from "./tool";
import type { ExternalOperation } from "../externalOperations/store";

const executionId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const requestedUrl = "https://example.com/careers/researcher";
const observedUrl = "https://example.com/application/questions";
const authorization = "이 이력서로 지원서를 작성하고 제출 직전까지 진행해줘.";
const delegatedTask = [
  "Complete the application. Execution instructions:",
  "1. Stop before final submission or sending email.",
  "2. Attach the selected original resume.",
  "3. Use the supplied contact details.",
  "4. Preserve the candidate's actual experience.",
  "5. Draft answers from the available material.",
  "6. Hand off the browser if user login is needed.",
  "7. Inspect the entered fields and attachments.",
].join("\n");

function operation(needsUser: boolean): ExternalOperation {
  return {
    id: executionId,
    user_id: "00000000-0000-4000-8000-000000000003",
    conversation_id: "00000000-0000-4000-8000-000000000004",
    parent_id: sessionId,
    kind: "browser_run",
    idempotency_key: "projection-test",
    status: needsUser ? "completed" : "running",
    revision: needsUser ? 3 : 2,
    request: {
      task: delegatedTask,
      url: requestedUrl,
      role_refs: ["external:researcher"],
      authorization: [{ id: 42, content: authorization }],
    },
    result: needsUser
      ? {
          summary: "The name and resume are present; the sign-in screen is open.",
          evidence: ["Resume attachment visible"],
          url: observedUrl,
          needsUser: true,
        }
      : { observation_scheduled: true },
    provider_refs: { liveUrl: "https://viewer.example.com/?token=private" },
    created_at: "2026-10-29T00:00:00Z",
    updated_at: "2026-10-29T00:01:02Z",
  };
}

for (const native of [false, true]) {
  test(`${native ? "Anthropic" : "OpenAI"} receives browser observations without repeated execution instructions`, async (t) => {
    const keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
    const savedKeys = keys.map((key) => process.env[key]);
    keys.forEach((key) => { process.env[key] = "test-key"; });
    const model = native ? "claude-haiku-5-5" : "gpt-6.1-sol";
    let requests = 0;
    const delivered: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.ok(String(url).includes(native ? "api.anthropic.com" : "api.openai.com"));
      const body = JSON.parse(String(init?.body));
      requests++;
      assert.ok(requests <= 3);
      if (requests === 3) {
        delivered.push(...(native
          ? body.messages.flatMap((message: any) => Array.isArray(message.content)
              ? message.content.filter((block: any) => block.type === "tool_result").map((block: any) => block.content)
              : [])
          : body.input.filter((item: any) => item.type === "function_call_output").map((item: any) => item.output)));
      }
      const input = requests === 1
        ? { action: "run", url: requestedUrl, task: delegatedTask }
        : { action: "read", execution_id: executionId };
      if (native) {
        const content = requests === 3
          ? [{ type: "text", text: "로그인이 필요합니다." }]
          : [{ type: "tool_use", id: `call-${requests}`, name: "use_browser", input }];
        const response = { id: `reply-${requests}`, model, content,
          stop_reason: requests === 3 ? "end_turn" : "tool_use",
          usage: { input_tokens: 1, output_tokens: 1 } };
        const events = [
          { type: "message_start", message: response },
          ...content.flatMap((block, index) => [
            { type: "content_block_start", index, content_block: block },
            { type: "content_block_stop", index },
          ]),
          { type: "message_delta", delta: { stop_reason: response.stop_reason }, usage: { output_tokens: 1 } },
          { type: "message_stop" },
        ];
        return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      const response = { id: `reply-${requests}`, model, status: "completed",
        output: requests === 3
          ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "로그인이 필요합니다." }] }]
          : [{ type: "function_call", call_id: `call-${requests}`, name: "use_browser", arguments: JSON.stringify(input) }],
        usage: { input_tokens: 1, output_tokens: 1 } };
      return new Response(`data: ${JSON.stringify({ type: "response.completed", response })}\n\n`, {
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    t.mock.method(console, "warn", () => {});
    t.mock.method(console, "log", () => {});
    try {
      const { runCareerChatAssistantStream } = await import("../llm");
      await runCareerChatAssistantStream({
        primaryModel: model,
        systemBlocks: [{ text: "Continue the application with the browser." }],
        messages: [{ role: "user", content: authorization }],
        tools: [{ type: "function", function: USE_BROWSER_TOOL }],
        executeTool: async ({ input }) => {
          const row = operation(input.action === "read");
          return { operation: row, modelOutput: formatBrowserToolResult([row]) };
        },
        onTextDelta: () => {},
        usageLabel: "test:browser-result-projection",
      });
      assert.equal(requests, 3);
      assert.equal(delivered.length, 2);
      for (const text of delivered) {
        assert.ok(text.includes(`execution_id: ${executionId}`));
        assert.ok(text.includes(`session_id: ${sessionId}`));
        assert.ok(text.includes(`Requested page: ${requestedUrl}`));
        assert.ok(text.includes("Role references: external:researcher"));
        assert.ok(text.includes(`User message 42: ${authorization}`));
        for (const instruction of delegatedTask.split("\n")) assert.ok(!text.includes(instruction));
        assert.ok(!text.includes("token=private"));
      }
      assert.ok(delivered[0].includes("status: running; revision: 2"));
      assert.ok(!delivered[0].includes("Completion will resume this conversation automatically"));
      assert.ok(delivered[1].includes("status: completed; revision: 3"));
      assert.ok(delivered[1].includes(`Observed page: ${observedUrl}`));
      assert.ok(delivered[1].includes("The name and resume are present; the sign-in screen is open."));
      assert.ok(delivered[1].includes("Browser agent observation: Resume attachment visible"));
      assert.ok(delivered[1].includes("The run reports a human interaction requirement."));
    } finally {
      keys.forEach((key, index) => {
        if (savedKeys[index] === undefined) delete process.env[key];
        else process.env[key] = savedKeys[index];
      });
    }
  });
}
