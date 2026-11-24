import assert from "node:assert/strict";
import test from "node:test";
import { buildCareerConversationPromptPlan } from "./conversationPlan";
import { renderCareerBackgroundInvocation } from "../background/prompt";
import type { CareerBackgroundRun } from "../background/types";
import { buildCareerUiVocabulary } from "./mainPrompt2";
import { buildCareerMainPrompt } from "./mainPrompts";
import { AGENT_COLLABORATION_GUIDE } from "@/lib/agentContacts/guidance";
import { CAREER_OPTIONAL_FOLLOWUP_PROMPTS } from "./conversationSections";

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

test("the completed signup event supplies facts and the conversation guide appears once", () => {
  const event = renderCareerBackgroundInvocation({ trigger: "conversation_completed" } as CareerBackgroundRun);
  const { promptBlocks } = buildCareerConversationPromptPlan({
    ...base,
    includePostOnboardingConversationGuide: true,
    userChatTurnCount: 0,
    runtimeInstruction: event,
  });
  const guide = promptBlocks.find(block => block.key === "post_onboarding_conversation_guide")!.text;
  assert.equal(promptBlocks.map(block => block.text).join("\n").split(guide).length - 1, 1);
  assert.ok(promptBlocks.some(block => block.key === "dynamic_state" && block.text.includes(event)));
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
    assert.equal(plan.promptBlocks.some(block => block.key === "career_chat_display"), false);
  }
});

test("background correspondence receives collaboration context without live-conversation nudges", () => {
  const plan = buildCareerConversationPromptPlan({ ...base, backgroundInvocation: true, toolNames: ["contact_company", "suggest_form"] });
  const text = plan.promptBlocks.map(block => block.text).join("\n");
  assert.ok(text.includes(AGENT_COLLABORATION_GUIDE));
  assert.ok(!text.includes(CAREER_OPTIONAL_FOLLOWUP_PROMPTS.follow_up_header));
  assert.ok(!text.includes(CAREER_OPTIONAL_FOLLOWUP_PROMPTS.follow_up_question));
  assert.ok(plan.enabledToolNames.includes("suggest_form"));
  assert.ok(plan.enabledToolNames.includes("contact_company"));
});

test("the main web prompt loads the live workspace display contract", () => {
  const plan = buildCareerConversationPromptPlan(base);
  const display = plan.promptBlocks.find(block => block.key === "career_chat_display")!.text;
  for (const type of ["matching", "opportunities", "brief", "meetings", "automations", "actions"]) {
    assert.ok(display.includes(`"type":"${type}"`), type);
  }
});

test("workspace navigation is a chat display input, not the scheduled email's agent role", () => {
  for (const locale of ["ko", "en"]) {
    const args = { ...base, currentPreferences: { preferredLocale: locale } };
    const chat = buildCareerConversationPromptPlan(args);
    const scheduled = buildCareerConversationPromptPlan({ ...args, backgroundInvocation: true, scheduledWork: true });
    const vocabulary = buildCareerUiVocabulary(locale === "en" ? "English" : "Korean");
    assert.ok(chat.promptBlocks.find(b => b.key === "career_chat_display")!.text.includes(vocabulary));
    assert.ok(!chat.promptBlocks.find(b => b.key === "career_main")!.text.includes(vocabulary));
    assert.ok(!scheduled.promptBlocks.some(b => b.text.includes(vocabulary)));
    assert.equal(chat.promptBlocks.find(b => b.key === "career_main")!.text,
      scheduled.promptBlocks.find(b => b.key === "career_main")!.text);
  }
});


test("friendly chat replaces tone at its source and keeps the execution contract", () => {
  const professional = buildCareerConversationPromptPlan(base);
  const friendly = buildCareerConversationPromptPlan({ ...base, conversationVersion: "friendly" });
  const main = friendly.promptBlocks.find(b => b.key === "career_main")!.text;
  const original = professional.promptBlocks.find(b => b.key === "career_main")!.text;
  assert.equal(main.split("## Communication")[0], original.split("## Communication")[0]);
  assert.ok(main.includes("해요체"));
  assert.ok(original.includes("해요체"));
  assert.ok(original.includes("friendly personal chat"));
  assert.ok(!original.includes("Keep chat compact"));
  assert.ok(!professional.promptBlocks.find(b => b.key === "career_chat_display")!.text.includes("[[bubble]]"));
  assert.ok(!main.includes("Be warm, calm, professional and direct."));
  assert.ok(friendly.promptBlocks.find(b => b.key === "career_chat_display")!.text.includes("[[bubble]]"));
  for (const overrides of [{ channel: "voice" as const }, { backgroundInvocation: true }, { isOnboardingDone: false }]) {
    const plan = buildCareerConversationPromptPlan({ ...base, ...overrides, conversationVersion: "friendly" });
    assert.deepEqual(plan, buildCareerConversationPromptPlan({ ...base, ...overrides }));
  }
});

test("the first-contact guide applies until the person writes to Harper, in chat or a scheduled email", () => {
  const guideOf = (plan: ReturnType<typeof buildCareerConversationPromptPlan>) =>
    plan.promptBlocks.find(b => b.key === "post_onboarding_conversation_guide")?.text;
  const first = buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 0 });
  const later = buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 1 });
  const scheduled = buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 0, backgroundInvocation: true, scheduledWork: true });
  assert.ok(guideOf(first)?.includes("[[CALL]] shows the call button."));
  assert.equal(guideOf(later), undefined);
  assert.equal(guideOf(buildCareerConversationPromptPlan(base)), undefined);
  assert.ok(guideOf(scheduled)?.includes("This contact is an email."));
  assert.equal(guideOf(buildCareerConversationPromptPlan({ ...base, userChatTurnCount: 0, channel: "voice" as const })), undefined);
  assert.deepEqual(first.promptBlocks.find(b=>b.key==="career_main"),later.promptBlocks.find(b=>b.key==="career_main"));
});

test("the onboarding-completed reply is not shown its own work as another running search", () => {
  const status = { onboardingCompletedAt: "2026-10-31T00:55:00Z", activeRunCreatedAt: "2026-10-31T00:55:00Z", activeRunStatus: "handed_off" };
  const early = { ...base, gmailCapability: "not_connected" as const, userChatTurnCount: 3, opportunityStatus: status };
  const completed = buildCareerConversationPromptPlan({ ...early, includePostOnboardingConversationGuide: true });
  const text = completed.promptBlocks.map(block => block.text).join("\n");
  assert.ok(text.includes("onboardingCompletedAt"));
  assert.ok(!text.includes("activeOpportunitySearchStatus"));
  assert.equal(completed.promptBlocks.find(block => block.key === "gmail_capability")!.text, "## Gmail connection state\nGmail is not connected.");
  const later = buildCareerConversationPromptPlan(early);
  assert.ok(later.promptBlocks.map(block => block.text).join("\n").includes("activeOpportunitySearchStatus: handed_off"));
});
