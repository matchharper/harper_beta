import assert from "node:assert/strict";
import test from "node:test";
import { buildCareerConversationPromptPlan } from "./prompts/conversationPlan";
import { CareerCapabilityRuntime } from "./capabilities/runtime";
import { CAREER_CAPABILITY_LOADER, CAREER_CORE_TOOLS } from "./capabilities/registry";

const sse = (events: unknown[]) => new Response(
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
  { headers: { "Content-Type": "text/event-stream" } }
);

const fixtureTool = (name: string) => ({
  type: "function" as const,
  function: { name, description: name, parameters: { type: "object", properties: {} } },
});

// The API renders a string message and one text block the same way.
const withoutCacheMarks = (messages: any[]) =>
  JSON.parse(JSON.stringify(
    messages.map((message) => typeof message.content === "string" ? { ...message, content: [{ type: "text", text: message.content }] } : message),
    (key, field) => key === "cache_control" ? undefined : field
  ));

type Captured = { body: any; headers: Record<string, string> };

/** Replies with the next scripted content; `[]` means an empty text answer. */
async function runFixture(args: {
  model: string;
  replies: Array<Array<{ name: string; input?: Record<string, unknown> }> | string>;
  run: (llm: typeof import("./llm"), streaming: boolean) => Promise<string>;
  streaming: boolean;
}) {
  const originalFetch = globalThis.fetch;
  const keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
  const previous = keys.map((key) => process.env[key]);
  keys.forEach((key) => { process.env[key] = "test-key"; });
  const requests: Captured[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/rest/v1/")) return Response.json([]);
    assert.equal(String(url), "https://api.anthropic.com/v1/messages");
    requests.push({ body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> });
    const reply = args.replies[requests.length - 1] ?? "Done.";
    const content = typeof reply === "string"
      ? (reply ? [{ type: "text", text: reply }] : [])
      : reply.map((call, index) => ({ type: "tool_use", id: `call-${requests.length}-${index}`, name: call.name, input: call.input ?? {} }));
    const response = {
      id: `fixture-${requests.length}`, model: args.model, content,
      stop_reason: typeof reply === "string" ? "end_turn" : "tool_use",
      usage: { input_tokens: 100, output_tokens: 10 },
    };
    return args.streaming ? sse([
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
    const text = await args.run(await import("./llm"), args.streaming);
    return { requests, text };
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
}

// Each later step must resend the earlier request unchanged and only add to its end.
function assertPrefixKept(requests: Captured[]) {
  for (const [index, request] of requests.entries()) {
    assert.ok((JSON.stringify(request.body).match(/"cache_control"/g) ?? []).length <= 4, `marks in request ${index + 1}`);
    assert.ok(JSON.stringify(request.body.messages.at(-1)).includes("cache_control"), `moving mark in request ${index + 1}`);
    if (index === 0) continue;
    const before = requests[index - 1].body;
    assert.deepEqual(request.body.tools, before.tools, `tools of request ${index + 1}`);
    assert.deepEqual(request.body.system, before.system, `system of request ${index + 1}`);
    assert.deepEqual(
      withoutCacheMarks(request.body.messages.slice(0, before.messages.length)),
      withoutCacheMarks(before.messages),
      `messages of request ${index + 1}`
    );
  }
}

function progressiveRuntime() {
  const tools = [...CAREER_CORE_TOOLS, "list_documents", "read_document", "generate_resume"].map(fixtureTool);
  return new CareerCapabilityRuntime({
    mode: "progressive",
    eligibleTools: tools,
    promptArgs: () => ({
      channel: "chat", isOnboardingDone: true, profile: null,
      structuredProfileText: "Complete confirmed profile.", talentContextSection: "",
      currentPreferences: { preferredLocale: "ko" },
    }),
  });
}

const progressiveReplies = [
  [{ name: CAREER_CAPABILITY_LOADER, input: { capabilityIds: ["resume_authoring"] } }],
  [{ name: "generate_resume" }],
  "Prepared.",
];

const runProgressive = (runtime: CareerCapabilityRuntime, model: string, onSystemBlocks?: (blocks: unknown) => void) =>
  (llm: typeof import("./llm"), streaming: boolean) => {
    const initial = runtime.resolveStep(false);
    onSystemBlocks?.(initial.systemBlocks);
    const args = {
      primaryModel: model, toolRuntime: runtime, tools: initial.tools, systemBlocks: initial.systemBlocks,
      messages: [{ role: "user" as const, content: "이력서를 고쳐 줘." }],
      executeTool: async () => ({ ok: true }), onTextDelta: () => {},
      usageLabel: "test:career-cache-prefix",
    };
    return streaming ? llm.runCareerChatAssistantStream(args) : llm.runCareerChatAssistant(args);
  };

for (const streaming of [false, true])
for (const hasMemory of [false, true])
for (const hasInitialPolicy of [false, true]) {
  test(`whole request prefix survives policy ${hasInitialPolicy ? "replacement" : "insertion"} (stream=${streaming}, memory=${hasMemory})`, async () => {
    const tools = [CAREER_CAPABILITY_LOADER, "read_document", "generate_resume"].map(fixtureTool);
    const plan = buildCareerConversationPromptPlan({
      channel: "chat", isOnboardingDone: true, profile: null,
      structuredProfileText: "Complete confirmed profile.",
      talentContextSection: hasMemory ? "Search Brief\n[1] Remote\nRelevant memories\n[2] Confirmed project." : "",
      simulationAvailability: "inactive", gmailCapability: "available",
      toolNames: hasInitialPolicy ? tools.map((tool) => tool.function.name) : [],
    });
    const { requests, text } = await runFixture({
      model: "claude-sonnet-5-5", streaming,
      replies: [[{ name: "read_document" }], "Prepared."],
      run: (llm, stream) => {
        const args = {
          primaryModel: "claude-sonnet-5-5", tools, systemBlocks: plan.promptBlocks,
          messages: [{ role: "user" as const, content: "Read the selected document." }],
          executeTool: async () => ({ ok: true }), onTextDelta: () => {},
          usageLabel: "test:career-cache-prefix",
        };
        return stream ? llm.runCareerChatAssistantStream(args) : llm.runCareerChatAssistant(args);
      },
    });
    assert.equal(text, "Prepared.");
    assert.equal(requests.length, 2);
    assertPrefixKept(requests);
    for (const request of requests) {
      assert.equal(request.headers["anthropic-beta"], "mid-conversation-tool-changes-2026-07-01");
      const profile = plan.promptBlocks.find((b) => b.key === "profile_context")!.text;
      const marked = request.body.system.filter((block: any) => block.cache_control);
      const named = (key: string, text: string) => `<section name="${key}">\n${text}\n</section>`;
      assert.deepEqual(marked.map((block: any) => block.text), [
        named("profile_context", profile),
        ...(hasMemory ? [named("future_matching_insights", plan.promptBlocks.find((b) => b.key === "future_matching_insights")!.text)] : []),
      ]);
      assert.equal(request.body.tools.filter((tool: any) => tool.cache_control).length, 1);
    }
    const note = requests[1].body.messages.at(-1);
    assert.equal(note.role, "system");
    assert.ok(JSON.stringify(note).includes("Tools executed in this user turn"));
  });
}

for (const streaming of [false, true]) {
  test(`loaded tools are revealed without changing the tool list (stream=${streaming})`, async () => {
    let firstSystem: unknown;
    const { requests, text } = await runFixture({
      model: "claude-sonnet-5-5", streaming, replies: progressiveReplies,
      run: runProgressive(progressiveRuntime(), "claude-sonnet-5-5", (blocks) => { firstSystem = blocks; }),
    });
    assert.equal(text, "Prepared.");
    assert.equal(requests.length, 3);
    assertPrefixKept(requests);
    const generate = requests[0].body.tools.find((tool: any) => tool.name === "generate_resume");
    assert.equal(generate.defer_loading, true);
    assert.equal(requests[0].body.tools.find((tool: any) => tool.name === CAREER_CAPABILITY_LOADER).defer_loading, undefined);
    assert.ok(!JSON.stringify(firstSystem).includes("### Resume creation and revision"));
    const note = requests[1].body.messages.at(-1);
    assert.equal(note.role, "system");
    assert.ok(note.content.some((block: any) => block.type === "tool_addition" && block.tool.name === "generate_resume"));
    assert.ok(JSON.stringify(note).includes("### Resume creation and revision"));
  });

  test(`a tool redefined mid-answer starts the prefix over (stream=${streaming})`, async () => {
    let redefine = false;
    const base = [CAREER_CAPABILITY_LOADER, "read_document", "manage_simulation_session"].map(fixtureTool);
    const plan = buildCareerConversationPromptPlan({
      channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "Complete confirmed profile.",
      talentContextSection: "", simulationAvailability: "inactive", gmailCapability: "available",
      toolNames: base.map((tool) => tool.function.name),
    });
    const runtime = new CareerCapabilityRuntime({
      mode: "full",
      eligibleTools: base,
      getEligibleTools: () => redefine
        ? base.map((tool) => tool.function.name === "manage_simulation_session" ? { ...tool, function: { ...tool.function, description: "resume the active application" } } : tool)
        : base,
      promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "Complete confirmed profile.", talentContextSection: "" }),
    });
    const { requests, text } = await runFixture({
      model: "claude-sonnet-5-5", streaming,
      replies: [[{ name: "read_document" }], [{ name: "read_document" }], "Done."],
      run: (llm, stream) => {
        const initial = runtime.resolveStep(false);
        const args = {
          primaryModel: "claude-sonnet-5-5", toolRuntime: runtime, tools: initial.tools, systemBlocks: plan.promptBlocks,
          messages: [{ role: "user" as const, content: "Continue my application." }],
          executeTool: async () => { redefine = true; return { ok: true }; }, onTextDelta: () => {},
          usageLabel: "test:career-cache-prefix",
        };
        return stream ? llm.runCareerChatAssistantStream(args) : llm.runCareerChatAssistant(args);
      },
    });
    assert.equal(text, "Done.");
    assert.equal(requests.length, 3);
    const description = (request: Captured) => request.body.tools.find((tool: any) => tool.name === "manage_simulation_session").description;
    assert.equal(description(requests[0]), "manage_simulation_session");
    assert.equal(description(requests[1]), "resume the active application");
    assert.ok(requests[1].body.messages.every((message: any) => message.role !== "system"));
    assertPrefixKept(requests.slice(1));
  });

  test(`empty answer recovery drops tool references and ends on the system note (stream=${streaming})`, async () => {
    const { requests } = await runFixture({
      model: "claude-sonnet-5-5", streaming, replies: [...progressiveReplies.slice(0, 2), "", "Recovered."],
      run: runProgressive(progressiveRuntime(), "claude-sonnet-5-5"),
    });
    assert.equal(requests.length, 4);
    const recovery = requests[3].body;
    assert.equal(recovery.tools, undefined);
    assert.equal(requests[3].headers["anthropic-beta"], undefined);
    assert.ok(!/"tool_(addition|removal)"/.test(JSON.stringify(recovery.messages)));
    assert.equal(recovery.messages.at(-1).role, "system");
    assert.ok(JSON.stringify(recovery.messages.at(-1)).includes("no visible user-facing text"));
  });

  test(`final answer after the tool budget keeps the tools with tool_choice none (stream=${streaming})`, async () => {
    const tools = [CAREER_CAPABILITY_LOADER, "read_document"].map(fixtureTool);
    const plan = buildCareerConversationPromptPlan({
      channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "Complete confirmed profile.",
      talentContextSection: "", simulationAvailability: "inactive", gmailCapability: "available",
      toolNames: tools.map((tool) => tool.function.name),
    });
    const { requests, text } = await runFixture({
      model: "claude-sonnet-5-5", streaming,
      replies: [[{ name: "read_document" }], [{ name: "read_document" }], [{ name: "read_document" }], "Final."],
      run: (llm, stream) => {
        const args = {
          primaryModel: "claude-sonnet-5-5", tools, systemBlocks: plan.promptBlocks,
          messages: [{ role: "user" as const, content: "Read it three times." }],
          executeTool: async () => ({ ok: true }), onTextDelta: () => {},
          usageLabel: "test:career-cache-prefix",
        };
        return stream ? llm.runCareerChatAssistantStream(args) : llm.runCareerChatAssistant(args);
      },
    });
    assert.equal(text, "Final.");
    assert.equal(requests.length, 4);
    assertPrefixKept(requests);
    const final = requests[3].body;
    assert.deepEqual(final.tool_choice, { type: "none" });
    assert.equal(final.messages.at(-1).role, "system");
    assert.ok(JSON.stringify(final.messages.at(-1)).includes("Callable tools in this continuation: none"));
    if (!streaming) assert.ok(JSON.stringify(final.messages.at(-1)).includes("Tool call budget is exhausted"));
  });

  test(`models without mid-conversation tool changes keep the earlier request shape (stream=${streaming})`, async () => {
    const { requests, text } = await runFixture({
      model: "claude-haiku-5-5", streaming, replies: progressiveReplies,
      run: runProgressive(progressiveRuntime(), "claude-haiku-5-5"),
    });
    assert.equal(text, "Prepared.");
    assert.equal(requests.length, 3);
    for (const request of requests) {
      assert.equal(request.headers["anthropic-beta"], undefined);
      assert.ok(!JSON.stringify(request.body).includes("defer_loading"));
      assert.ok(request.body.messages.every((message: any) => message.role !== "system"));
      assert.ok(!JSON.stringify(request.body.messages).includes("cache_control"));
    }
    assert.ok(!requests[0].body.tools.some((tool: any) => tool.name === "generate_resume"));
    assert.ok(requests[1].body.tools.some((tool: any) => tool.name === "generate_resume"));
  });
}
