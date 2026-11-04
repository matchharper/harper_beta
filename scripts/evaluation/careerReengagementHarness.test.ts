import assert from "node:assert/strict";
import test from "node:test";
import { captureReengagementTurnInput } from "./careerReengagementHarness";
import { buildCareerSessionStartTurnInstruction } from "@/lib/career/prompts";

test("actual chatTurn selects the streaming provider when the transport accepts deltas", async () => {
  const deltas: string[] = [];
  const args = await captureReengagementTurnInput({
    recentMessages: [{ id: 1, role: "assistant", content: "다음에 이어서 봐요.", message_type: "chat" }],
    structuredProfileText: "Synthetic profile",
    currentPreferences: { preferredLocale: "ko", profileVisibility: "open_to_matches" },
    proactiveContext: "User returned after 12 hours.",
    onTextDelta: delta => { deltas.push(delta); },
  });
  assert.deepEqual(deltas, ["stream boundary"]);
  assert.equal(args.temperature, 0.8);
  assert.equal(args.messages.at(-1)?.role, "user");
  assert.match(args.messages.at(-1)!.content, /Application event/);
});

for (const isOnboardingDone of [true, false]) for (const lastRole of ["assistant", "user"] as const) {
  test(`actual chatTurn preserves ${lastRole}-ended history and opens a separate return event (onboarded=${isOnboardingDone})`, async () => {
    const recentMessages = [
      {
        id: 1,
        role: "user",
        content: "다음 주 면접 준비를 하고 싶어요.",
        message_type: "chat",
      },
      {
        id: 2,
        role: "assistant",
        content: "프로젝트 경험부터 같이 정리해 볼 수 있어요.",
        message_type: "chat",
      },
      ...(lastRole === "user"
        ? [
            {
              id: 3,
              role: "user",
              content: "네, 다음에 이어서 해요.",
              message_type: "chat",
            },
          ]
        : []),
    ];
    const context = buildCareerSessionStartTurnInstruction({
      currentAccessAt: "2026-11-02T03:00:00Z",
      previousChatAt: "2026-10-31T03:00:00Z",
      idleMs: 48 * 60 * 60 * 1000,
      isOnboardingDone,
      preferredLocale: "ko",
    });
    const args = await captureReengagementTurnInput({
      recentMessages,
      isOnboardingDone,
      structuredProfileText: "Synthetic profile",
      currentPreferences: {
        preferredLocale: "ko",
        profileVisibility: "open_to_matches",
      },
      proactiveContext: context,
    });
    assert.deepEqual(
      structuredClone(args.messages.slice(0, -1)),
      recentMessages.map(({ role, content }) => ({ role, content }))
    );
    assert.equal(args.messages.length, recentMessages.length + 1);
    assert.equal(args.messages.at(-1)?.role, "user");
    assert.match(args.messages.at(-1)!.content, /not a user-authored message or new authorization/);
    assert.ok(args.messages.at(-1)!.content.endsWith(context));
    assert.ok(!args.systemBlocks.some((block) => block.text.includes(context)));
    assert.equal(args.primaryModel, "gpt-6.1-sol");
    assert.equal(args.openAIResponsesReasoningEffort, "high");
  });
}

test("actual return turn preloads recommendation tools, handbook and candidate facts at the first model call", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "synthetic-test-key";
  const { readFileSync } = await import("node:fs");
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../../docs/evaluation/career-session-reengagement/cases-v2.json",
        import.meta.url
      ),
      "utf8"
    )
  ).cases[0];
  const args = await captureReengagementTurnInput({
    ...fixture,
    currentPreferences: {
      preferredLocale: "ko",
      profileVisibility: "open_to_matches",
    },
    proactiveContext: buildCareerSessionStartTurnInstruction(fixture),
  });
  const names = args.tools.map((tool) => tool.function.name);
  for (const name of [
    "upsert_opportunities",
    "search_opportunities",
    "read_matching",
    "get_role_context",
  ])
    assert.ok(names.includes(name), name);
  assert.ok(
    args.systemBlocks.some(
      (block) => block.key === "handbook:opportunity_search"
    )
  );
  const text = args.systemBlocks.map((block) => block.text).join("\n");
  assert.match(text, /Synthetic Team 10/);
  assert.match(text, /Last completed search/);
  assert.match(text, /synthetic-list-v1/);
  assert.equal(args.messages.length, fixture.recentMessages.length + 1);
});

test("native Haiku receives a new return event in streaming and non-streaming requests", async (t) => {
  process.env.OPENAI_API_KEY ||= "fixture-key";
  process.env.ANTHROPIC_API_KEY ||= "fixture-key";
  const { runCareerChatAssistant, runCareerChatAssistantStream } = await import("@/lib/career/llm");
  const { CLAUDE_HAIKU_MODEL } = await import("@/lib/llm/modelConfig");
  const context = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-11-04T01:37:00Z",
    previousChatAt: "2026-11-03T09:29:00Z",
    idleMs: 16 * 60 * 60 * 1000,
    isOnboardingDone: true,
    preferredLocale: "ko",
  });
  for (const streaming of [false, true]) {
    for (const lastRole of ["assistant", "user"] as const) {
      const args = await captureReengagementTurnInput({
        recentMessages: [{ id: 1, role: lastRole, content: "다음에 이어서 봐요.", message_type: "chat" }],
        structuredProfileText: "Synthetic profile",
        currentPreferences: { preferredLocale: "ko" },
        proactiveContext: context,
        assistantModel: CLAUDE_HAIKU_MODEL,
        onTextDelta: streaming ? () => {} : undefined,
      });
      let requests = 0;
      const reply = "다시 만나서 반가워요.";
      const mock = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).includes("/rest/v1/")) return Response.json([]);
        assert.equal(String(url), "https://api.anthropic.com/v1/messages");
        const body = JSON.parse(String(init?.body));
        requests++;
        assert.equal(body.model, CLAUDE_HAIKU_MODEL);
        assert.equal(Boolean(body.stream), streaming);
        assert.deepEqual(body.messages, structuredClone(args.messages));
        assert.equal(body.messages.at(-1).role, "user");
        assert.ok(body.messages.at(-1).content.endsWith(context));
        assert.ok(!body.system.some((block: { text: string }) => block.text.includes(context)));
        const response = {
          id: "return-event", model: CLAUDE_HAIKU_MODEL,
          content: [{ type: "text", text: reply }], stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        };
        if (!streaming) return Response.json(response);
        return new Response([
          { type: "message_start", message: { ...response, content: [] } },
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: reply } },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
          { type: "message_stop" },
        ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), {
          headers: { "content-type": "text/event-stream" },
        });
      });
      try {
        let visible = "";
        const modelArgs = { ...args, onToolStart: undefined, usageLabel: "test:session-return-event" };
        const output = await (streaming
          ? runCareerChatAssistantStream({ ...modelArgs, onTextDelta: delta => { visible += delta; } })
          : runCareerChatAssistant(modelArgs));
        assert.equal(output, reply);
        if (streaming) assert.equal(visible, reply);
        assert.equal(requests, 1, "No prefill error or fallback request");
      } finally {
        mock.mock.restore();
      }
    }
  }
});
