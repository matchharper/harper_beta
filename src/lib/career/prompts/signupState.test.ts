import assert from "node:assert/strict";
import test from "node:test";
import { buildCareerConversationPromptPlan } from "./conversationPlan";

const base = {
  channel: "chat" as const,
  isOnboardingDone: true,
  profile: null,
  structuredProfileText: "Name only.",
  talentContextSection: "",
  currentPreferences: { preferredLocale: "ko" },
  requestTime: new Date("2026-11-24T01:00:00Z"),
  backgroundInvocation: true,
  scheduledWork: true,
};
const textOf = (plan: ReturnType<typeof buildCareerConversationPromptPlan>) =>
  plan.promptBlocks.map(block => block.text).join("\n");

test("first contact before signup states the unfinished form once, inside the first-contact guide", () => {
  const plan = buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 0, signupFinished: false });
  const guide = plan.promptBlocks.find(block => block.key === "post_onboarding_conversation_guide")!.text;
  assert.match(guide, /left before finishing the short signup form/);
  assert.doesNotMatch(guide, /They joined through a short signup form/);
  assert.equal(plan.promptBlocks.some(block => block.key === "signup_unfinished"), false);
  assert.equal(textOf(plan).split("Opening Career takes them back to that form").length - 1, 1);
});

test("later turns before signup keep the fact; finished signups never see it", () => {
  const replying = buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 1, signupFinished: false });
  assert.equal(replying.promptBlocks.some(block => block.key === "post_onboarding_conversation_guide"), false);
  assert.match(replying.promptBlocks.find(block => block.key === "signup_unfinished")!.text, /not finished Harper's short signup form/);

  for (const signupFinished of [true, undefined]) {
    const first = buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 0, signupFinished });
    assert.match(first.promptBlocks.find(block => block.key === "post_onboarding_conversation_guide")!.text, /They joined through a short signup form/);
    const later = buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 2, signupFinished });
    assert.doesNotMatch(textOf(first) + textOf(later), /signup form; Career chat|not finished Harper's short signup form/);
  }
});

test("no prompt calls the external discovery reservation opted-in", () => {
  const plan = buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 0, signupFinished: false });
  assert.doesNotMatch(textOf(plan), /opted-in/i);
});
