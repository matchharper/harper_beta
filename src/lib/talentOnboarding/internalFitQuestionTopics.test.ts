import assert from "node:assert/strict";
import test from "node:test";

import {
  groupInternalFitHoldQuestionCandidates,
  hasExplicitInternalFitReevaluationTopic,
  INTERNAL_FIT_REEVALUATION_TOPICS,
} from "./internalFitQuestionTopics";

test("the topic contract has nine topics and one combined location topic", () => {
  assert.equal(INTERNAL_FIT_REEVALUATION_TOPICS.length, 9);
  assert.ok(INTERNAL_FIT_REEVALUATION_TOPICS.includes("location"));
  assert.ok(INTERNAL_FIT_REEVALUATION_TOPICS.includes("work_authorization"));
  assert.equal(
    INTERNAL_FIT_REEVALUATION_TOPICS.includes("location_scope" as never),
    false
  );
  assert.equal(
    INTERNAL_FIT_REEVALUATION_TOPICS.includes("location_feasibility" as never),
    false
  );
});

test("only the nine current topics count as explicit direct-question topics", () => {
  assert.equal(
    hasExplicitInternalFitReevaluationTopic({ topic: "location" }),
    true
  );
  assert.equal(
    hasExplicitInternalFitReevaluationTopic({ topic: "location_scope" }),
    false
  );
  assert.equal(
    hasExplicitInternalFitReevaluationTopic({
      summary: "Confirm whether Singapore is in scope.",
    }),
    false
  );
});

const locationCandidates = [
  "Indonesia",
  "Hong Kong",
  "Vietnam",
  "Thailand",
  "Singapore",
].map((country, index) => ({
  criteria: {
    topic: "location",
    question: `Would you consider working in ${country}?`,
  },
  fitId: `fit-${index}`,
  summary: `Would you consider working in ${country}?`,
}));

test("country-specific holds keep the first LLM question and one answer group", () => {
  const grouped = groupInternalFitHoldQuestionCandidates(
    locationCandidates,
    "ko-KR"
  );

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].topic, "location");
  assert.deepEqual(grouped[0].fitIds, [
    "fit-0",
    "fit-1",
    "fit-2",
    "fit-3",
    "fit-4",
  ]);
  assert.equal(grouped[0].summary, "Would you consider working in Indonesia?");
});

test("locale does not rewrite an LLM-authored question", () => {
  const [grouped] = groupInternalFitHoldQuestionCandidates(
    locationCandidates,
    "en-US"
  );

  assert.equal(grouped.summary, "Would you consider working in Indonesia?");
});

test("a single criterion keeps the LLM-authored question verbatim", () => {
  const question = "현재 일본에서 근무할 수 있는 취업 자격이 있으신가요?";
  const [grouped] = groupInternalFitHoldQuestionCandidates(
    [
      {
        criteria: {
          topic: "work_authorization",
          question,
        },
        fitId: "fit-authorization",
        summary: question,
      },
    ],
    "ko"
  );

  assert.equal(grouped.summary, question);
});

test("location and work authorization remain separate groups", () => {
  const grouped = groupInternalFitHoldQuestionCandidates([
    {
      criteria: {
        topic: "location",
        question: "Would you consider working in Japan?",
      },
      fitId: "fit-location",
      summary: "Would you consider working in Japan?",
    },
    {
      criteria: {
        topic: "work_authorization",
        question: "Do you have authorization to work in Japan?",
      },
      fitId: "fit-authorization",
      summary: "Do you have authorization to work in Japan?",
    },
  ]);

  assert.deepEqual(
    grouped.map((group) => group.topic),
    ["location", "work_authorization"]
  );
});
