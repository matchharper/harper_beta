import assert from "node:assert/strict";
import test from "node:test";

import {
  groupInternalFitHoldQuestionCandidates,
  hasExplicitInternalFitReevaluationTopic,
  INTERNAL_FIT_REEVALUATION_TOPICS,
  normalizeInternalFitReevaluationTopic,
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

test("legacy location topics normalize into location", () => {
  assert.equal(
    normalizeInternalFitReevaluationTopic({
      topic: "location_feasibility",
      summary: "Confirm relocation to Singapore.",
    }),
    "location"
  );
  assert.equal(
    normalizeInternalFitReevaluationTopic({
      summary: "한국 외에 취업 비자나 sponsorship이 가능한 국가가 있나요?",
    }),
    "work_authorization"
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
    topic: index === 0 ? "location_scope" : "location",
    summary: `Confirm whether ${country} is in scope.`,
  },
  fitId: `fit-${index}`,
  summary: `Confirm whether ${country} is in scope.`,
}));

test("country-specific holds become one Korean location question and answer group", () => {
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
  assert.match(grouped[0].summary, /국가·지역/);
  assert.match(grouped[0].summary, /알려주실 수 있나요\?/);
});

test("English locale receives the English grouped location question", () => {
  const [grouped] = groupInternalFitHoldQuestionCandidates(
    locationCandidates,
    "en-US"
  );

  assert.match(grouped.summary, /which countries or regions/i);
  assert.doesNotMatch(grouped.summary, /국가|지역/);
});

test("a single criterion also becomes a localized user-facing question", () => {
  const [grouped] = groupInternalFitHoldQuestionCandidates(
    [
      {
        criteria: {
          topic: "work_authorization",
          summary: "Confirm the candidate's legal work status.",
        },
        fitId: "fit-authorization",
        summary: "Confirm the candidate's legal work status.",
      },
    ],
    "ko"
  );

  assert.match(grouped.summary, /알려주실 수 있나요\?/);
  assert.doesNotMatch(grouped.summary, /Confirm the candidate/);
});

test("location and work authorization remain separate groups", () => {
  const grouped = groupInternalFitHoldQuestionCandidates([
    {
      criteria: { topic: "location", summary: "Confirm Japan interest." },
      fitId: "fit-location",
      summary: "Confirm Japan interest.",
    },
    {
      criteria: {
        topic: "work_authorization",
        summary: "Confirm Japan work authorization.",
      },
      fitId: "fit-authorization",
      summary: "Confirm Japan work authorization.",
    },
  ]);

  assert.deepEqual(
    grouped.map((group) => group.topic),
    ["location", "work_authorization"]
  );
});
