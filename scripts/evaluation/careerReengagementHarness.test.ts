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
  assert.equal(args.messages.at(-1)?.role, "assistant");
});

for (const lastRole of ["assistant", "user"] as const) {
  test(`actual chatTurn keeps ${lastRole}-ended history without an invented user turn`, async () => {
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
      isOnboardingDone: true,
      preferredLocale: "ko",
    });
    const args = await captureReengagementTurnInput({
      recentMessages,
      structuredProfileText: "Synthetic profile",
      currentPreferences: {
        preferredLocale: "ko",
        profileVisibility: "open_to_matches",
      },
      proactiveContext: context,
    });
    assert.deepEqual(
      structuredClone(args.messages),
      recentMessages.map(({ role, content }) => ({ role, content }))
    );
    assert.ok(args.systemBlocks.some((block) => block.text.includes(context)));
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
  assert.equal(args.messages.length, fixture.recentMessages.length);
});
