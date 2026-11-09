import assert from "node:assert/strict";
import test from "node:test";
import { resolveCareerInterviewProgress } from "./onboardingInterviewProgress";

test("saved facts and turn counts do not establish completion or gate explicit manual completion", () => {
  for (const userChatCount of [0, 20]) {
    const args = { canForceComplete: true, checklistProgress: null, isOnboardingDone: false,
      talentInsights: { compensation: "Important, amount not given" }, userChatCount };
    const active = resolveCareerInterviewProgress(args);
    assert.equal(active.percent, 0);
    assert.equal(active.canForceComplete, true);
    const done = resolveCareerInterviewProgress({ ...args, isOnboardingDone: true });
    assert.equal(done.percent, 100);
    assert.equal(done.canForceComplete, false);
  }
});
