import assert from "node:assert/strict";
import test from "node:test";
import { buildCareerConversationPromptPlan } from "./prompts/conversationPlan";

// What the caller (chatTurn.ts) passes after onboarding only for an entry from a Harper outreach mail.
const ENTRY = "Entry from a link in a Harper outreach email that went to a different address. The email offered career help, no postings.";
const has = (plan: ReturnType<typeof buildCareerConversationPromptPlan>) => plan.promptBlocks.some((block) => block.text.includes(ENTRY));
const base = {
  channel: "chat" as const, isOnboardingDone: true, profile: null, currentPreferences: { preferredLocale: "ko" as const },
  structuredProfileText: "Backend engineer", talentContextSection: "",
  toolNames: [], requestTime: new Date("2026-11-23T09:00:00Z"), officialJobSignupIntentPrompt: ENTRY,
};

test("after onboarding, a mail's entry record is read in the first chat turns (why they came), not later", () => {
  assert.ok(has(buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 1 })));
  assert.ok(!has(buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 40 })));
  // Not in a background run, and nothing without a record.
  assert.ok(!has(buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 1, backgroundInvocation: true })));
  assert.ok(!has(buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 1, officialJobSignupIntentPrompt: null })));
});

test("during onboarding the entry record is read as before", () => {
  assert.ok(has(buildCareerConversationPromptPlan({ ...base, isOnboardingDone: false, userChatTurnCount: 1 })));
});
