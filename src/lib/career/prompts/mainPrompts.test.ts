import assert from "node:assert/strict";
import test from "node:test";
import { buildCareerConversationPromptPlan } from "./conversationPlan";
import { buildCareerMainPrompt } from "./mainPrompts";

const base = {
  channel: "chat" as const,
  isOnboardingDone: true,
  profile: null,
  structuredProfileText: "Confirmed backend experience.",
  talentContextSection: "Search Brief: remote preferred.",
  currentPreferences: { preferredLocale: "ko" },
  requestTime: new Date("2026-10-31T01:00:00Z"),
};

test("normal chat keeps one main contract across tool, profile, Gmail, search and coaching state", () => {
  const baseline = buildCareerConversationPromptPlan(base);
  const main = baseline.promptBlocks.find(block => block.key === "career_main")!;
  assert.equal(main.text, buildCareerMainPrompt({ outputLanguage: "Korean", positionsTabLabel: "새 기회" }));
  const withState = buildCareerConversationPromptPlan({
    ...base,
    profile: { resume_file_name: "resume.pdf" },
    toolNames: ["manage_career_coaching_activity", "record_internal_fit_reevaluation_information", "read_document"],
    gmailCapability: "not_connected",
    isConversationCompletedOpportunityRunActive: true,
    opportunityStatus: { isInitialSearchRunning: true, activeRunStatus: "running" },
    activeInternalFitHoldQuestion: { fitId: "fit-fixture", summary: "Confirm project ownership." } as any,
    careerCoachingActivity: {
      messageId: 7, revision: 2, status: "suggested", topic: "Next role",
      agenda: ["Compare scope"], channel: null, plannedMinutes: null, suggestedMinutes: 15,
    } as any,
    postOnboardingContext: { entryOpportunity: {
      companyName: "Fixture company", roleTitle: "Engineer", verifiedActiveRoleId: "role-fixture",
    } } as any,
  });
  assert.deepEqual(withState.promptBlocks.find(block => block.key === "career_main"), main);
  assert.equal(withState.toolPolicy, "");
  assert.deepEqual(withState.promptBlocks.filter(block => block.cacheable).map(block => block.key),
    ["career_main", "career_chat_display", "profile_context", "future_matching_insights"]);
  const context = withState.promptBlocks.filter(block => !block.cacheable).map(block => block.text).join("\n");
  assert.doesNotMatch(context, /fit-fixture|Confirm project ownership|Private matching clarification/);
  for (const fact of ["Gmail is not connected", "running", "Next role", "role-fixture"]) {
    assert.ok(context.includes(fact), fact);
  }
});

test("explicit trigger context accompanies the same normal contract", () => {
  const baseline = buildCareerConversationPromptPlan(base);
  const event = "Saved external feedback for role-fixture: positive. No new user message.";
  const triggered = buildCareerConversationPromptPlan({ ...base, runtimeInstruction: event });
  assert.deepEqual(triggered.promptBlocks.filter(block => block.key !== "dynamic_state"),
    baseline.promptBlocks.filter(block => block.key !== "dynamic_state"));
  assert.ok(triggered.promptBlocks.find(block => block.key === "dynamic_state")!.text.includes(event));
});

test("onboarding, voice and background calls retain their separate contracts", () => {
  for (const overrides of [
    { isOnboardingDone: false },
    { channel: "voice" as const },
    { backgroundInvocation: true },
  ]) {
    const plan = buildCareerConversationPromptPlan({ ...base, ...overrides });
    assert.equal(plan.promptBlocks.some(block => block.key === "career_main"), false);
    assert.ok(plan.promptBlocks.some(block => block.key === "chat_core"));
  }
});


test("friendly chat replaces tone at its source and keeps the execution contract", () => {
  const professional = buildCareerConversationPromptPlan(base);
  const friendly = buildCareerConversationPromptPlan({ ...base, conversationVersion: "friendly" });
  const main = friendly.promptBlocks.find(b => b.key === "career_main")!.text;
  const original = professional.promptBlocks.find(b => b.key === "career_main")!.text;
  assert.equal(main.split("## Communication")[0], original.split("## Communication")[0]);
  assert.ok(main.includes("해요체"));
  assert.ok(!main.includes("Be warm, calm, professional and direct."));
  assert.ok(friendly.promptBlocks.find(b => b.key === "career_chat_display")!.text.includes("[[bubble]]"));
  for (const overrides of [{ channel: "voice" as const }, { backgroundInvocation: true }, { isOnboardingDone: false }]) {
    const plan = buildCareerConversationPromptPlan({ ...base, ...overrides, conversationVersion: "friendly" });
    assert.deepEqual(plan, buildCareerConversationPromptPlan({ ...base, ...overrides }));
  }
});
