import assert from "node:assert/strict";
import test from "node:test";
import { resolveCareerInterviewProgress } from "./onboardingInterviewProgress";

const checklistProgress = {
  additionalCoveredCount: 0,
  completed: false,
  coveredCount: 3,
  finalConfirmationCovered: false,
  minCoveredCount: 10,
  percent: 33,
  requiredQuestionsCovered: false,
  totalCount: 9,
};

test("uses the authoritative checklist snapshot when it is available", () => {
  const progress = resolveCareerInterviewProgress({
    canForceComplete: false,
    checklistProgress,
    isOnboardingDone: false,
    talentInsights: {
      compensation: "filled",
      deal_breakers: "filled",
      location: "filled",
      must_haves: "filled",
      next_scope: "filled",
      search_intensity: "filled",
      team_style_fit: "filled",
    },
    userChatCount: 10,
  });

  assert.deepEqual(progress, {
    canForceComplete: false,
    filledCount: 3,
    percent: 33,
    remainingCount: 6,
    totalCount: 9,
  });
});

test("reflects each newer checklist snapshot without a page reload", () => {
  const progress = resolveCareerInterviewProgress({
    canForceComplete: false,
    checklistProgress: {
      ...checklistProgress,
      coveredCount: 4,
      percent: 44,
    },
    isOnboardingDone: false,
    talentInsights: null,
    userChatCount: 0,
  });

  assert.equal(progress.filledCount, 4);
  assert.equal(progress.percent, 44);
  assert.equal(progress.remainingCount, 5);
});

test("falls back to live client signals only before a checklist snapshot exists", () => {
  const progress = resolveCareerInterviewProgress({
    canForceComplete: false,
    checklistProgress: null,
    isOnboardingDone: false,
    talentInsights: null,
    userChatCount: 4,
  });

  assert.equal(progress.filledCount, 4);
  assert.equal(progress.percent, 44);
  assert.equal(progress.totalCount, 9);
});
