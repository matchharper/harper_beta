import assert from "node:assert/strict";
import test from "node:test";
import { buildCareerConversationPromptPlan } from "./prompts/conversationPlan";
import { buildLiveBackendInstructions, buildLiveOnboardingContext } from "./liveOnboarding";
import { buildLiveFrontendInstructions } from "./voiceSessionInstructions";
import { buildCareerRealtimeRecentConversationSection } from "./prompts/realtimeRecentConversation";
import { buildLiveSessionUpdateEvents } from "./liveSessionUpdates";
import { buildCareerInsightExtractionOnlyPrompt } from "./prompts/cases/insightExtractionPrompts";

test("old covered flags cannot hide topic purposes or change text/voice decisions", () => {
  for (const channel of ["chat", "voice"] as const) {
    const input = {
      channel, isOnboardingDone: false, profile: null,
      structuredProfileText: "Backend engineer",
      talentContextSection: "Compensation matters; desired level has not been provided.",
      currentPreferences: { preferredLocale: "ko" }, toolNames: channel === "voice" ? ["end_call"] : [],
      requestTime: new Date("2026-11-08T07:00:00Z"),
    };
    const fresh = buildCareerConversationPromptPlan(input);
    const stale = buildCareerConversationPromptPlan({ ...input, onboardingChecklistCoverage: { compensation: "covered", final_priority_confirmation: "covered" } });
    assert.deepEqual(stale.promptBlocks, fresh.promptBlocks);
    assert.ok(stale.promptBlocks.some(b => b.text.includes("compensation level or range")));
    if (channel === "voice") assert.equal(buildLiveBackendInstructions(stale), buildLiveBackendInstructions(fresh));
  }
});

test("voice reply writer gets the real facts and history; the audio interface does not get a second interview brief", () => {
  const answer = "기대 보상은 연 기본급 1억 2천만원입니다. 현재 연봉은 비공개예요.";
  const history = buildCareerRealtimeRecentConversationSection([
    { role: "assistant", content: "Earlier context ".repeat(250) },
    { role: "user", content: answer },
  ]);
  const context = buildLiveOnboardingContext({
    structuredProfileText: "Backend engineer",
    talentContextSection: "한국 근무만 희망, 영어 기술 회의 가능",
    recentConversationSection: history,
    checklistCoverage: { compensation: "covered" },
  });
  const frontend = buildLiveFrontendInstructions({ initialResponseInstruction: "", responseLocale: "ko", onboardingContext: context });
  const backend = buildLiveBackendInstructions(buildCareerConversationPromptPlan({
    channel: "voice", isOnboardingDone: false, profile: null,
    structuredProfileText: "Backend engineer",
    talentContextSection: "한국 근무만 희망, 영어 기술 회의 가능",
    recentConversationSection: history,
    currentPreferences: { preferredLocale: "ko" }, toolNames: ["end_call"],
  }));
  assert.ok(backend.includes(answer));
  assert.ok(backend.includes("한국 근무만 희망, 영어 기술 회의 가능"));
  assert.ok(backend.includes("Backend engineer"));
  assert.ok(!frontend.includes("Backend engineer"));
  assert.ok(!context.includes("Topics already answered"));
  assert.ok(!frontend.includes("## 온보딩 목적"));
  assert.ok(backend.includes("## 온보딩 목적"), "the conversational writer owns question selection");
  assert.ok(!context.includes("What to understand for the first opportunity search"));

});

test("storage extractor does not receive or produce a conversation-completion checklist", () => {
  assert.equal(
    buildCareerInsightExtractionOnlyPrompt({ currentChecklistCoverage: {} }),
    buildCareerInsightExtractionOnlyPrompt({ currentChecklistCoverage: { compensation: "covered" } }),
  );
  assert.ok(!buildCareerInsightExtractionOnlyPrompt({}).includes("covered_onboarding_checklist"));
});


test("saved onboarding context updates the reasoning backend without replaying speaker history", () => {
  const events = buildLiveSessionUpdateEvents({ instructions: "Current saved facts and latest answers", onboardingContext: "Long conversation ".repeat(1000) }, null, "update");
  assert.deepEqual(events, [{ type: "session.update", session: { delegation: { type: "responses", responses: { instructions: "Current saved facts and latest answers" } } } }]);
});
