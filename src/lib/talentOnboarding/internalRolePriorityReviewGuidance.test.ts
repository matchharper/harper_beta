import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInternalRolePriorityReviewAssistantInstruction,
  hasPriorityReviewReachedFourteenDays,
} from "./internalRolePriorityReviewGuidance";

test("uses the exact fourteen-day boundary from the original request", () => {
  const requestedAt = "2026-08-01T00:00:00.000Z";

  assert.equal(
    hasPriorityReviewReachedFourteenDays({
      nowMs: Date.parse("2026-08-14T23:59:59.999Z"),
      requestedAt,
    }),
    false
  );
  assert.equal(
    hasPriorityReviewReachedFourteenDays({
      nowMs: Date.parse("2026-08-15T00:00:00.000Z"),
      requestedAt,
    }),
    true
  );
  assert.equal(
    hasPriorityReviewReachedFourteenDays({ requestedAt: null }),
    false
  );
});

test("a matched but unrecommended role preserves one-at-a-time curation before formal review", () => {
  const instruction = buildInternalRolePriorityReviewAssistantInstruction({
    alreadyRecommended: false,
    effectiveFitLabel: "fit",
    hasClarificationQuestion: false,
    requestCreated: true,
    requestReachedFourteenDays: false,
  });

  assert.match(instruction, /had already judged this exact role suitable/);
  assert.match(instruction, /not a general job-board feed/);
  assert.match(instruction, /one at a time/);
  assert.match(instruction, /Do not explain the JD or personalized fit yet/);
  assert.match(instruction, /add this role as a formal recommendation/);
  assert.match(instruction, /alongside a current recommendation/);
});

test("a recommended role points to the attached Positions card", () => {
  const instruction = buildInternalRolePriorityReviewAssistantInstruction({
    alreadyRecommended: true,
    effectiveFitLabel: "fit",
    hasClarificationQuestion: false,
    requestCreated: false,
    requestReachedFourteenDays: true,
  });

  assert.match(instruction, /already been formally recommended/);
  assert.match(instruction, /attached position card/);
  assert.match(instruction, /Positions tab/);
  assert.match(instruction, /automatically shared/);
  assert.match(instruction, /Keep this response concise/);
  assert.doesNotMatch(instruction, /not a general job-board feed/);
});

test("past recommendation states get distinct guidance", () => {
  const declined = buildInternalRolePriorityReviewAssistantInstruction({
    alreadyRecommended: true,
    hasClarificationQuestion: false,
    recommendationFeedback: "dislike",
    requestCreated: false,
    requestReachedFourteenDays: false,
  });
  const accepted = buildInternalRolePriorityReviewAssistantInstruction({
    alreadyRecommended: true,
    hasClarificationQuestion: false,
    recommendationFeedback: "like",
    recommendationSavedStage: "connected",
    requestCreated: false,
    requestReachedFourteenDays: false,
  });
  const closed = buildInternalRolePriorityReviewAssistantInstruction({
    alreadyRecommended: true,
    hasClarificationQuestion: false,
    recommendationFeedback: "dislike",
    recommendationSavedStage: "closed",
    requestCreated: false,
    requestReachedFourteenDays: false,
  });

  assert.match(declined, /user declined it/);
  assert.match(accepted, /already accepted/);
  assert.match(accepted, /read_recommended_opportunities/);
  assert.match(accepted, /progress\.message/);
  assert.match(accepted, /Do not speculate/);
  assert.match(closed, /process is now closed/);
  assert.match(closed, /Do not present it.*attached position card/);
});

test("resolved process state takes precedence over sparse recommendation fields", () => {
  const instruction = buildInternalRolePriorityReviewAssistantInstruction({
    alreadyRecommended: true,
    hasClarificationQuestion: false,
    recommendationState: "closed",
    recommendationSavedStage: null,
    requestCreated: false,
    requestReachedFourteenDays: false,
  });

  assert.match(instruction, /process is now closed/);
  assert.match(instruction, /Do not present it.*attached position card/);
});

test("an unanswered hold asks one candidate-safe clarification", () => {
  const instruction = buildInternalRolePriorityReviewAssistantInstruction({
    alreadyRecommended: false,
    effectiveFitLabel: "hold",
    hasClarificationQuestion: true,
    requestCreated: false,
    requestReachedFourteenDays: false,
  });

  assert.match(instruction, /clarificationQuestion/);
  assert.match(instruction, /only question/);
  assert.match(instruction, /candidate-side detail/);
  assert.match(instruction, /before it can continue reviewing this exact opportunity/);
  assert.match(instruction, /answer is needed for its review to continue/);
  assert.match(instruction, /Do not expose the fit state/);
  assert.match(instruction, /저에게도/);
  assert.match(instruction, /to me either/);
});

test("a missing fit stays under review without diagnosing an error", () => {
  const instruction = buildInternalRolePriorityReviewAssistantInstruction({
    alreadyRecommended: false,
    effectiveFitLabel: null,
    hasClarificationQuestion: false,
    requestCreated: true,
    requestReachedFourteenDays: true,
  });

  assert.match(instruction, /still appears to be under review/);
  assert.match(instruction, /wait a little longer/);
  assert.match(instruction, /do not diagnose or mention a backend error/);
  assert.match(instruction, /저에게도/);
  assert.match(instruction, /to me either/);
});

for (const label of ["ambiguous", "dissatisfied", "unfit"]) {
  test(`${label} before fourteen days remains a non-final waiting state`, () => {
    const instruction = buildInternalRolePriorityReviewAssistantInstruction({
      alreadyRecommended: false,
      effectiveFitLabel: label,
      hasClarificationQuestion: false,
      requestCreated: false,
      requestReachedFourteenDays: false,
    });

    assert.match(instruction, /not in the current set/);
    assert.match(instruction, /review may still be continuing/);
    assert.match(instruction, /not establish a final negative decision/);
  });

  test(`${label} after fourteen days uses current-criteria language, never rejection language`, () => {
    const instruction = buildInternalRolePriorityReviewAssistantInstruction({
      alreadyRecommended: false,
      effectiveFitLabel: label,
      hasClarificationQuestion: false,
      requestCreated: false,
      requestReachedFourteenDays: true,
    });

    assert.match(instruction, /at this time/);
    assert.match(instruction, /not a problem with the candidate/);
    assert.match(instruction, /company revises its criteria/);
    assert.match(instruction, /never use 탈락, 불합격, 거절/);
    assert.doesNotMatch(instruction, /the candidate was rejected/i);
  });
}
