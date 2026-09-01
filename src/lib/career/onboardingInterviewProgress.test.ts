import assert from "node:assert/strict";
import test from "node:test";
import { resolveCareerInterviewProgress } from "./onboardingInterviewProgress";

const checklistProgress = {
  additionalCoveredCount: 0,
  completed: false,
  coveredCount: 3,
  finalConfirmationCovered: false,
  minCoveredCount: 8,
  percent: 30,
  requiredQuestionsCovered: false,
  totalCount: 10,
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
    percent: 30,
    remainingCount: 7,
    totalCount: 10,
  });
});

test("reflects each newer checklist snapshot without a page reload", () => {
  const progress = resolveCareerInterviewProgress({
    canForceComplete: false,
    checklistProgress: {
      ...checklistProgress,
      coveredCount: 4,
      percent: 40,
    },
    isOnboardingDone: false,
    talentInsights: null,
    userChatCount: 0,
  });

  assert.equal(progress.filledCount, 4);
  assert.equal(progress.percent, 40);
  assert.equal(progress.remainingCount, 6);
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
  assert.equal(progress.percent, 40);
  assert.equal(progress.totalCount, 10);
});
