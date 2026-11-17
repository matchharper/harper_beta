import assert from "node:assert/strict";
import test from "node:test";

// Clients are built at import time; the checks under test never reach them.
process.env.OPENAI_API_KEY ||= "test-only-not-used";
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";

const usage = { label: "t", model: "m", inputTokens: 1, outputTokens: 1, usd: 0, ms: 0, at: "" };

/** The QUESTIONS part of a system prompt: where the question card's own wording is set. */
function questionsPart(system: string) {
  const start = system.indexOf("QUESTIONS\n");
  assert.ok(start >= 0, "has a QUESTIONS part");
  const end = system.indexOf("\nPROBES", start);
  return system.slice(start, end < 0 ? undefined : end);
}

test("a member who chose English gets the role start question cards in English", async () => {
  const { buildDraftSystemPrompt, buildNextQuestionsOnlySystemPrompt } = await import("./prompts");
  for (const system of [buildDraftSystemPrompt("en"), buildNextQuestionsOnlySystemPrompt("en")]) {
    const part = questionsPart(system);
    assert.doesNotMatch(part, /Korean|해요체/, "no Korean-only wording for the card");
    assert.match(part, /English/);
    assert.match(part, /"Doesn't matter" \(remove_criterion\), "Nice to have", "Important", "Required"/);
  }
});

test("a Korean member's question prompts stay as they were", async () => {
  const { buildDraftSystemPrompt, buildNextQuestionsOnlySystemPrompt } = await import("./prompts");
  assert.equal(buildDraftSystemPrompt(), buildDraftSystemPrompt("ko"));
  assert.equal(buildNextQuestionsOnlySystemPrompt(), buildNextQuestionsOnlySystemPrompt("ko"));
  for (const system of [buildDraftSystemPrompt("ko"), buildNextQuestionsOnlySystemPrompt("ko")]) {
    const part = questionsPart(system);
    assert.match(part, /- why: one short Korean sentence explaining why Harper asks/);
    assert.match(part, /- chips: 4-5 short Korean answers/);
    assert.match(part, /"상관없음" \(remove_criterion\), "있으면 좋음", "중요", "필수"/);
    assert.match(part, /- Korean, polite 해요체, concise\./);
  }
});

test("chips filled for an English member, and a card made from Harper's English reply, are asked for in English", async () => {
  const { fillChips, questionCardFromReply } = await import("./chipGuard");
  const systems: Record<string, string> = {};
  const ask = (async (call: { label: string; system: string }) => {
    systems[call.label] = call.system;
    return {
      usage,
      data:
        call.label === "chip_fill"
          ? { chips: ["Yes, I'll share links", "No", "Use our team's profiles", "Not decided yet"] }
          : { asks: true, question: "Do you have reference profiles?", why: "", chips: ["Yes", "No"], reply: "Saved the criteria." },
    };
  }) as never;
  await fillChips({ question: "Do you have a salary range?", chips: ["Yes"], ask, language: "en" });
  assert.doesNotMatch(systems.chip_fill, /Korean/);
  assert.match(systems.chip_fill, /English/);
  const { card } = await questionCardFromReply({ reply: "Saved the criteria.\n\nDo you have reference profiles?", ask, language: "en" });
  assert.equal(card?.question, "Do you have reference profiles?");
  assert.doesNotMatch(systems.chat_question_card, /Korean/);
  assert.match(systems.chat_question_card, /English/);
  assert.doesNotMatch(systems.chip_fill, /Korean/, "the chips the card fills are English too");
});

test("without a language the chip prompts stay Korean", async () => {
  const { fillChips, questionCardFromReply } = await import("./chipGuard");
  const systems: Record<string, string> = {};
  const ask = (async (call: { label: string; system: string }) => {
    systems[call.label] = call.system;
    return {
      usage,
      data:
        call.label === "chip_fill"
          ? { chips: ["있어요", "없어요", "아직 정하지 않았어요", "협의 가능해요"] }
          : { asks: true, question: "참고할 프로필이 있나요?", why: "", chips: ["있어요"], reply: "" },
    };
  }) as never;
  await fillChips({ question: "연봉 범위가 있나요?", chips: ["있어요"], ask });
  assert.match(systems.chip_fill, /4-5 short Korean answers/);
  await questionCardFromReply({ reply: "참고할 프로필이 있나요?", ask });
  assert.match(systems.chat_question_card, /that ask as one short Korean question/);
});
