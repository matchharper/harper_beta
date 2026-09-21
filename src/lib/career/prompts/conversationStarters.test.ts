import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_CONVERSATION_STARTER_IDS,
  getCareerConversationStarter,
} from "./conversationStarters";
import { buildCareerConversationPromptPlan } from "./conversationPlan";

test("career coaching replaces preference update and closes with useful support", () => {
  assert.ok(CAREER_CONVERSATION_STARTER_IDS.includes("career_coaching"));
  assert.deepEqual([...CAREER_CONVERSATION_STARTER_IDS], [
    "career_coaching",
    "match_quality",
    "career_check_in",
  ]);

  const korean = getCareerConversationStarter("career_coaching", "ko");
  const english = getCareerConversationStarter("career_coaching", "en");
  const staleClient = getCareerConversationStarter("preference_update", "ko");

  assert.equal(korean?.id, "career_coaching");
  assert.equal(staleClient?.id, "career_coaching");
  assert.match(korean?.callOpeningText ?? "", /실제로 고민하는 문제/);
  assert.match(korean?.turnInstruction ?? "", /Harper가 앞으로 실제로 어떻게 도울지/);
  assert.match(korean?.turnInstruction ?? "", /동의를 받는 것/);
  assert.match(korean?.turnInstruction ?? "", /일기 쓰기/);
  assert.match(korean?.turnInstruction ?? "", /만들어내지 말고/);
  assert.match(korean?.turnInstruction ?? "", /매 턴 하나씩 저장하지 않는다/);
  assert.match(korean?.turnInstruction ?? "", /인사만 하고 tool을 호출하지 않으면/);
  assert.match(korean?.turnInstruction ?? "", /판단 가치가 큰 행동 하나/);
  assert.match(english?.turnInstruction ?? "", /concrete proposal/i);
  assert.match(english?.turnInstruction ?? "", /meaningless homework/i);
});

test("career coaching uses focused voice rules instead of generic probing", () => {
  const plan = buildCareerConversationPromptPlan({
    channel: "voice",
    conversationMode: "career_coaching",
    currentPreferences: { preferredLocale: "ko" },
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    talentContextSection: "",
    toolNames: ["end_call", "write_talent_context"],
  });
  const voiceRules = plan.promptBlocks.find(
    (block) => block.key === "voice_call_rules"
  );
  const modeInstruction = plan.promptBlocks.find(
    (block) => block.key === "call_mode_instruction"
  );

  assert.ok(voiceRules);
  assert.ok(modeInstruction);
  assert.doesNotMatch(voiceRules.text, /사용자가 짧게 답하거나 멈추면/);
  assert.match(modeInstruction.text, /동의를 기다리는 턴에는 통화를 끝내지 않는다/);
});

test("career check-in is a registered call starter with localized guidance", () => {
  assert.ok(CAREER_CONVERSATION_STARTER_IDS.includes("career_check_in"));

  const korean = getCareerConversationStarter("career_check_in", "ko");
  const english = getCareerConversationStarter("career_check_in", "en");

  assert.equal(korean?.id, "career_check_in");
  assert.match(korean?.callOpeningText ?? "", /여러 가지를 알려줬다는 점/);
  assert.match(korean?.callOpeningText ?? "", /과거 사실 두 가지/);
  assert.match(korean?.callOpeningText ?? "", /현재 이직·구직 의향/);
  assert.match(korean?.callOpeningText ?? "", /달라진 점이 없다고 말해도/);
  assert.match(korean?.turnInstruction ?? "", /한 번에 질문 하나만/);
  assert.match(korean?.turnInstruction ?? "", /종료 제안에 명확히 동의/);
  assert.match(korean?.turnInstruction ?? "", /end_call tool/);
  assert.match(english?.callOpeningText ?? "", /warm catch-up/i);
  assert.match(english?.turnInstruction ?? "", /clearly accepts/);
});

test("unknown check-in starter ids fail closed", () => {
  assert.equal(getCareerConversationStarter("career_check_in_v2", "ko"), null);
});
