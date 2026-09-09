import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_CONVERSATION_STARTER_IDS,
  getCareerConversationStarter,
} from "./conversationStarters";

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
