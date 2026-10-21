import assert from "node:assert/strict";
import test from "node:test";
import { getEncoding } from "js-tiktoken";
import {
  buildLiveBackendInstructions,
  buildLiveOnboardingContext,
} from "./liveOnboarding";
import { buildLiveFrontendInstructions } from "./voiceSessionInstructions";
import { buildLiveSessionUpdateEvents } from "./liveSessionUpdates";
import { buildCareerConversationPromptPlan } from "./prompts/conversationPlan";
import { renderCareerPromptBlocks } from "./prompts/promptUtils";
import { CAREER_ONBOARDING_GUIDANCE_PROMPT } from "./prompts/rawPrompts";
import { TALENT_ONBOARDING_DONE_MARKER } from "@/lib/talentOnboarding/completion";
import {
  getOnboardingRequiredQuestionKeys,
  ONBOARDING_FINAL_CONFIRMATION_KEY,
} from "@/lib/talentOnboarding/insightChecklist";

test("Live shares onboarding policy but leaves the transcript marker to Realtime/chat", () => {
  const plan = buildCareerConversationPromptPlan({
    channel: "voice",
    isOnboardingDone: false,
    profile: null,
    talentContextSection: "Synthetic saved facts",
    structuredProfileText: "Synthetic profile",
    toolNames: ["end_call"],
  });
  const frontend = buildLiveFrontendInstructions({
    initialResponseInstruction: "",
    responseLocale: "ko",
    onboardingContext: buildLiveOnboardingContext({}),
  });
  assert.ok(frontend.includes(CAREER_ONBOARDING_GUIDANCE_PROMPT));
  const backend = buildLiveBackendInstructions(plan);
  assert.ok(backend.includes(CAREER_ONBOARDING_GUIDANCE_PROMPT));
  assert.ok(backend.includes("Synthetic saved facts"));
  assert.ok(backend.includes("Synthetic profile"));
  assert.ok(!frontend.includes(TALENT_ONBOARDING_DONE_MARKER));
  assert.ok(!backend.includes(TALENT_ONBOARDING_DONE_MARKER));
  assert.ok(
    renderCareerPromptBlocks(plan.promptBlocks).includes(
      TALENT_ONBOARDING_DONE_MARKER
    )
  );
});

test("frontend snapshot projects only required progress and fits every coverage combination in one Live event", () => {
  const encoding = getEncoding("o200k_base");
  const keys = [
    ...getOnboardingRequiredQuestionKeys(),
    ONBOARDING_FINAL_CONFIRMATION_KEY,
  ];
  for (let mask = 0; mask < 2 ** keys.length; mask++) {
    const coverage = Object.fromEntries(
      keys
        .filter((_, i) => mask & (1 << i))
        .map((key) => [key, "covered" as const])
    );
    const context = buildLiveOnboardingContext({ checklistCoverage: coverage });
    assert.ok(encoding.encode(context).length <= 500);
    assert.ok(!context.includes("cross_border_work_authorization"));
    assert.ok(!context.includes("final_priority_confirmation"));
  }
  const context = buildLiveOnboardingContext({
    checklistCoverage: {
      search_intensity: "covered",
      location: "covered",
      next_scope: "covered",
    },
  });
  assert.ok(
    context.includes(
      "Topics not yet recorded as answered: 기대 보상 조건, 외국어 능력."
    )
  );
});

test("Live refresh updates backend and supplies compact frontend facts without forcing speech", () => {
  const context = buildLiveOnboardingContext({
    checklistCoverage: { compensation: "covered" },
  });
  const events = buildLiveSessionUpdateEvents(
    { instructions: "backend", onboardingContext: context },
    null,
    "progress-1"
  );
  assert.deepEqual(events, [
    {
      type: "session.update",
      session: {
        delegation: {
          type: "responses",
          responses: { instructions: "backend" },
        },
      },
    },
    {
      type: "session.thinking.append",
      event_id: "progress-1",
      delegation_id: null,
      content: context,
    },
  ]);
  assert.equal(
    buildLiveSessionUpdateEvents(
      { instructions: "new backend", onboardingContext: context },
      context,
      "progress-2"
    ).length,
    1
  );
  assert.equal(
    buildLiveSessionUpdateEvents(
      { instructions: "backend", onboardingContext: null },
      null,
      "progress-3"
    ).length,
    1
  );
});

test("other call purposes do not acquire onboarding frontend guidance", () => {
  const nonOnboardingPlan = buildCareerConversationPromptPlan({
    channel: "voice",
    isOnboardingDone: true,
    profile: null,
    talentContextSection: "",
    structuredProfileText: "",
  });
  assert.equal(
    buildLiveBackendInstructions(nonOnboardingPlan),
    renderCareerPromptBlocks(nonOnboardingPlan.promptBlocks)
  );
  const context = buildLiveOnboardingContext({});
  for (const args of [
    { initialResponseInstruction: "", responseLocale: "ko" },
    {
      initialResponseInstruction: "",
      responseLocale: "en",
      isMockInterview: true,
      onboardingContext: context,
    },
  ]) {
    assert.ok(
      !buildLiveFrontendInstructions(args).includes(
        CAREER_ONBOARDING_GUIDANCE_PROMPT
      )
    );
  }
});
