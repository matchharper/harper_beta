import assert from "node:assert/strict";
import test from "node:test";

import { shouldUseCareerRealtimeOnboarding } from "./realtimeCallScope";

test("an open internal opportunity call never falls into onboarding mode", () => {
  assert.equal(
    shouldUseCareerRealtimeOnboarding({
      hasConversationStarter: false,
      hasInternalOpportunityCall: true,
      isOnboardingDone: false,
    }),
    false
  );
});

test("a requested conversation topic remains focused before onboarding completion", () => {
  assert.equal(
    shouldUseCareerRealtimeOnboarding({
      hasConversationStarter: true,
      hasInternalOpportunityCall: false,
      isOnboardingDone: false,
    }),
    false
  );
});

test("an ordinary incomplete call still uses onboarding mode", () => {
  assert.equal(
    shouldUseCareerRealtimeOnboarding({
      hasConversationStarter: false,
      hasInternalOpportunityCall: false,
      isOnboardingDone: false,
    }),
    true
  );
});
