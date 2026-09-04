import assert from "node:assert/strict";
import test from "node:test";

import {
  ONBOARDING_QUESTION_CHECKLIST,
  ONBOARDING_QUESTION_MIN_COVERED_COUNT,
  getOnboardingAdditionalQuestionKeys,
  getOnboardingQuestionChecklist,
  getOnboardingQuestionInsightKeys,
  getOnboardingRequiredQuestionKeys,
} from "./insightChecklist";
import { TALENT_INTERVIEW_FINAL_STEP } from "./progress";

const EXPECTED_COMMON_KEYS = [
  "search_intensity",
  "location",
  "next_scope",
  "compensation",
  "cross_border_work_authorization",
  "language",
  "deal_breakers",
  "team_style_fit",
  "additional_question_one",
  "final_priority_confirmation",
];

test("uses one onboarding checklist for every profile location", () => {
  const contexts = [
    null,
    { location: "Seoul, South Korea" },
    { location: "Singapore" },
    { location: "Tokyo, Japan" },
    { location: "Sydney, Australia" },
    { location: "Hong Kong" },
    { location: "Jakarta, Indonesia" },
  ];

  for (const context of contexts) {
    assert.deepEqual(
      getOnboardingQuestionChecklist(context).map((item) => item.key),
      EXPECTED_COMMON_KEYS
    );
    assert.deepEqual(getOnboardingAdditionalQuestionKeys(context), [
      "additional_question_one",
    ]);
    assert.deepEqual(getOnboardingRequiredQuestionKeys(context), [
      "cross_border_work_authorization",
    ]);
  }
});

test("combines next role and must-haves into one checklist question", () => {
  const item = ONBOARDING_QUESTION_CHECKLIST.find(
    (candidate) => candidate.key === "next_scope"
  );
  assert.ok(item);
  assert.deepEqual(getOnboardingQuestionInsightKeys(item), [
    "next_scope",
    "must_haves",
  ]);
  assert.match(item.promptHint, /one natural question/);
});

test("requires all ten common checklist items before completion", () => {
  assert.equal(ONBOARDING_QUESTION_CHECKLIST.length, 10);
  assert.equal(ONBOARDING_QUESTION_MIN_COVERED_COUNT, 10);
  assert.equal(TALENT_INTERVIEW_FINAL_STEP, 9);
  assert.equal(
    TALENT_INTERVIEW_FINAL_STEP,
    ONBOARDING_QUESTION_CHECKLIST.length - 1
  );
});

test("global work authorization and language hints preserve the intended scope", () => {
  const workAuthorization = ONBOARDING_QUESTION_CHECKLIST.find(
    (item) => item.key === "cross_border_work_authorization"
  );
  const language = ONBOARDING_QUESTION_CHECKLIST.find(
    (item) => item.key === "language"
  );
  assert.ok(workAuthorization);
  assert.ok(language);
  assert.match(
    workAuthorization.promptHint,
    /other than that location country/
  );
  assert.match(
    workAuthorization.promptHint,
    /\[location-country\] 국적이신 거죠\?/
  );
  assert.match(workAuthorization.promptHint, /assertive wording/);
  assert.match(language.promptHint, /Hong Kong or Indonesia/);
  assert.match(language.promptHint, /Mandarin\/Putonghua and Cantonese/);
});
