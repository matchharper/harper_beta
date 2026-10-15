import assert from "node:assert/strict";
import test from "node:test";
import { buildCareerConversationPromptPlan } from "./prompts/conversationPlan";
import { CAREER_CAPABILITY_LOADER } from "./capabilities/registry";

const sse = (events: unknown[]) => new Response(
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
  { headers: { "Content-Type": "text/event-stream" } }
);

for (const streaming of [false, true])
for (const hasMemory of [false, true])
for (const hasInitialPolicy of [false, true]) {
  test(`native cache prefix survives policy ${hasInitialPolicy ? "replacement" : "insertion"} (stream=${streaming}, memory=${hasMemory})`, async () => {
    const originalFetch = globalThis.fetch;
    const keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
    const previous = keys.map((key) => process.env[key]);
    keys.forEach((key) => { process.env[key] = "test-key"; });
    const requests: any[] = [];
    const tools = [CAREER_CAPABILITY_LOADER, "read_document", "generate_resume"].map((name) => ({
      type: "function" as const,
      function: { name, description: name, parameters: { type: "object" } },
    }));
    const plan = buildCareerConversationPromptPlan({
      channel: "chat", isOnboardingDone: true, profile: null,
      structuredProfileText: "Complete confirmed profile.",
      talentContextSection: hasMemory ? "Search Brief\n[1] Remote\nRelevant memories\n[2] Confirmed project." : "",
      simulationAvailability: "inactive", gmailCapability: "available",
      toolNames: hasInitialPolicy ? tools.map((tool) => tool.function.name) : [],
    });
    globalThis.fetch = async (url, init) => {
      if (String(url).includes("/rest/v1/")) return Response.json([]);
      assert.equal(String(url), "https://api.anthropic.com/v1/messages");
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      assert.ok(requests.length <= 2);
      const first = requests.length === 1;
      const content = first
        ? [{ type: "tool_use", id: "read-fixture", name: "read_document", input: {} }]
        : [{ type: "text", text: "Prepared." }];
      const response = {
        id: `fixture-${requests.length}`, model: "claude-sonnet-5-5", content,
        stop_reason: first ? "tool_use" : "end_turn",
        usage: { input_tokens: 100, output_tokens: 10 },
      };
      return streaming ? sse([
        { type: "message_start", message: response },
        ...content.flatMap((block, index) => [
          { type: "content_block_start", index, content_block: block },
          { type: "content_block_stop", index },
        ]),
        { type: "message_delta", delta: { stop_reason: response.stop_reason }, usage: { output_tokens: 10 } },
        { type: "message_stop" },
      ]) : Response.json(response);
    };
    try {
      const { runCareerChatAssistant, runCareerChatAssistantStream } = await import("./llm");
      const args = {
        primaryModel: "claude-sonnet-5-5", tools, systemBlocks: plan.promptBlocks,
        messages: [{ role: "user" as const, content: "Read the selected document." }],
        executeTool: async () => ({ ok: true }), onTextDelta: () => {},
        usageLabel: "test:career-cache-prefix",
      };
      assert.equal(await (streaming ? runCareerChatAssistantStream(args) : runCareerChatAssistant(args)), "Prepared.");
      assert.equal(requests.length, 2);
      const profile = plan.promptBlocks.find((b) => b.key === "profile_context")!.text;
      const memory = plan.promptBlocks.find((b) => b.key === "future_matching_insights")?.text;
      const cachedPrefix = (request: any) => {
        const indices = request.system.flatMap((block: any, index: number) => block.cache_control ? [index] : []);
        assert.equal(indices.length, hasMemory ? 2 : 1);
        assert.equal(request.system[indices[0]].text, profile);
        if (hasMemory) assert.equal(request.system[indices[1]].text, memory);
        assert.equal((JSON.stringify(request).match(/"cache_control"/g) ?? []).length, hasMemory ? 4 : 3);
        return request.system.slice(0, indices.at(-1)! + 1);
      };
      assert.deepEqual(cachedPrefix(requests[0]), cachedPrefix(requests[1]));
      assert.ok(requests[1].system.some((block: any) => block.text.includes("Tools executed in this user turn")));
      for (const block of plan.promptBlocks.filter((b) => b.key !== "tool_policy")) {
        for (const request of requests) {
          assert.equal(request.system.filter((b: any) => b.text === block.text).length, 1, block.key);
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
      keys.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key];
        else process.env[key] = previous[index];
      });
    }
  });
}
