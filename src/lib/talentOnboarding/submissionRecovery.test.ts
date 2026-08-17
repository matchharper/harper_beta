import assert from "node:assert/strict";
import test from "node:test";
import { isTalentOnboardingSubmissionCommitted } from "./submissionRecovery";

test("recognizes a committed submission from the first message", () => {
  assert.equal(
    isTalentOnboardingSubmissionCommitted({
      conversation: { stage: "profile" },
      hasFirstSubmission: true,
      needsOnboarding: true,
    }),
    true
  );
});

test("recognizes a committed submission from the conversation stage", () => {
  assert.equal(
    isTalentOnboardingSubmissionCommitted({
      conversation: { stage: "chat" },
      hasFirstSubmission: false,
      needsOnboarding: true,
    }),
    true
  );
});

test("keeps the form open when the submission was not committed", () => {
  assert.equal(
    isTalentOnboardingSubmissionCommitted({
      conversation: { stage: "profile" },
      hasFirstSubmission: false,
      needsOnboarding: true,
    }),
    false
  );
});

test("does not treat a saved message as complete while profile ingestion is processing", () => {
  assert.equal(
    isTalentOnboardingSubmissionCommitted({
      conversation: {
        profileIngestionStatus: "processing",
        stage: "chat",
      },
      hasFirstSubmission: true,
      needsOnboarding: true,
    }),
    false
  );
});
