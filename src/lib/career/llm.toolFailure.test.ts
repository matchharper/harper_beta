import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { formatCareerToolFailure } from "./toolFailure";
import { CareerCapabilityRuntime } from "./capabilities/runtime";

const tool = { type: "function" as const, function: {
  name: "use_browser", description: "Operate a browser",
  parameters: { type: "object", properties: { session_id: { type: "string" } } },
} };
const invalidId = "application-browser";
const missingId = "7c1e9a52-3b4d-4f6a-9e8b-2d5c1a7f0b93";

test("Career failure text retains actionable fields and redacts diagnostic envelopes", () => {
  const output = formatCareerToolFailure({ name: "use_browser", callId: "failed-call",
    input: { session_id: missingId, task: "Private application answers" },
    error: { message: "Browser session unavailable", code: "SESSION_MISSING", cause: { message: "Lookup failed" },
      response: { status: 404, data: { candidate: "Private profile" } }, stack: "Private server stack" },
    diagnostics: [{ error: new Error("Permission lookup incomplete"), source: "context_refresh" }],
  });
  assert.match(output, /Tool use_browser failed\. Call ID: failed-call/);
  assert.match(output, /Browser session unavailable/);
  assert.match(output, /SESSION_MISSING/);
  assert.match(output, /Lookup failed/);
  assert.match(output, /status: 404/);
  assert.match(output, /Permission lookup incomplete/);
  assert.ok(output.includes(missingId));
  assert.doesNotMatch(output, /Private|stack|Excluded|Accessor|"message"|"response"/);
});

for (const model of ["claude-sonnet-4-6", "gpt-6-luna"]) for (const streaming of [false, true]) {
  test(`${model} stream=${streaming} delivers readable failures and records them before a successful list`, async () => {
    const savedFetch = globalThis.fetch;
    const keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
    const savedKeys = keys.map(key => process.env[key]);
    keys.forEach(key => { process.env[key] = "test-key"; });
    let responsePrototype: any;
    let savedCreate: any;
    const requests: any[] = [];
    const nextContent = () => {
      const index = requests.length;
      return index < 4 ? [{ type: "tool_use" as const, id: `call-${index}`, name: "use_browser",
        input: index === 3 ? { action: "list" } : { action: "run", session_id: index === 1 ? invalidId : missingId } }]
        : [{ type: "text" as const, text: "The browser was not started." }];
    };
    globalThis.fetch = async (url, init) => {
      if (!String(url).includes("api.anthropic.com")) return Response.json([]);
      requests.push(JSON.parse(String(init?.body)));
      assert.ok(requests.length <= 4);
      const content = nextContent();
      const response = { id: `reply-${requests.length}`, model, content,
        stop_reason: requests.length < 4 ? "tool_use" : "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
      if (!streaming) return Response.json(response);
      const events = [
        { type: "message_start", message: response },
        ...content.flatMap((block, index) => [
          { type: "content_block_start", index, content_block: block }, { type: "content_block_stop", index },
        ]),
        { type: "message_delta", delta: { stop_reason: response.stop_reason }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        headers: { "Content-Type": "text/event-stream" },
      });
    };
    try {
      const { client } = await import("@/lib/llm/llm");
      responsePrototype = Object.getPrototypeOf(client.responses);
      savedCreate = responsePrototype.create;
      responsePrototype.create = async (body: any) => {
        requests.push(body);
        assert.ok(requests.length <= 4);
        const content = nextContent();
        const output = content.map(block => block.type === "tool_use"
          ? { type: "function_call", id: block.id, call_id: block.id, name: block.name, arguments: JSON.stringify(block.input) }
          : { type: "message", role: "assistant", content: [{ type: "output_text", text: block.text }] });
        const response = { id: `reply-${requests.length}`, model, status: "completed", output,
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
        if (!body.stream) return response;
        return (async function* () { yield { type: "response.completed", response }; })();
      };
      const { runCareerChatAssistant, runCareerChatAssistantStream } = await import("./llm");
      const runtime = new CareerCapabilityRuntime({
        mode: "full", eligibleTools: [tool], allowLoaders: false,
        promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "", talentContextSection: "" }),
      });
      const args = {
        primaryModel: model, messages: [{ role: "user" as const, content: "Prepare the application." }],
        systemBlocks: [{ text: "Use the available browser." }], tools: [tool], toolRuntime: runtime,
        executeTool: async ({ input }: { input: Record<string, unknown> }) => {
          if (input.action === "list") return { modelOutput: "No browser sessions or runs found." };
          z.object({ session_id: z.string().uuid() }).parse(input);
          throw new Error("Browser session unavailable");
        },
        onTextDelta: () => {}, usageLabel: "test:career-tool-failure",
      };
      assert.equal(await (streaming ? runCareerChatAssistantStream(args) : runCareerChatAssistant(args)), "The browser was not started.");
      const delivered = model.startsWith("claude")
        ? requests.flatMap(request => request.messages.flatMap((message: any) => Array.isArray(message.content)
          ? message.content.filter((block: any) => block.type === "tool_result").map((block: any) => block.content) : []))
        : requests.flatMap(request => request.input.filter((item: any) => item.type === "function_call_output").map((item: any) => item.output));
      assert.ok(delivered.some(text => text.includes("Input field session_id: must be a valid UUID.")));
      assert.ok(delivered.some(text => text.includes(`Provided session_id: ${invalidId}`)));
      assert.ok(delivered.some(text => text.includes(`Provided session_id: ${missingId}`)));
      assert.ok(delivered.some(text => text.includes("Browser session unavailable")));
      assert.ok(delivered.some(text => text.includes("No browser sessions or runs found.")));
      assert.doesNotMatch(delivered.join("\n"), /Excluded diagnostic|Accessor not evaluated|"issues"|"stack"|"message"/);
      assert.deepEqual(runtime.completedRecord().toolResults, [
        { name: "use_browser", successful: false, status: "failed" },
        { name: "use_browser", successful: false, status: "failed" },
        { name: "use_browser", successful: true },
      ]);
    } finally {
      globalThis.fetch = savedFetch;
      if (responsePrototype) responsePrototype.create = savedCreate;
      keys.forEach((key, index) => {
        if (savedKeys[index] === undefined) delete process.env[key];
        else process.env[key] = savedKeys[index];
      });
    }
  });
}
