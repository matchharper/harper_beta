import assert from "node:assert/strict";
import test from "node:test";
import {
  assignHistoryFeedbackVariant,
  HISTORY_FEEDBACK_EXPERIMENT,
  HISTORY_FEEDBACK_VIEW_EVENT,
  HISTORY_FEEDBACK_SAVED_EVENT,
} from "../career/historyFeedbackExperiment";
import {
  buildHistoryFeedbackExperiment,
  type HistoryFeedbackLog,
} from "./historyFeedbackExperiment";

const userA = "9c8c103b-5cba-4d37-8b9e-4525e7a0f258";
const log = (
  user: string,
  opportunityId: string,
  feedback?: string
): HistoryFeedbackLog => ({
  user_id: user,
  type: feedback ? HISTORY_FEEDBACK_SAVED_EVENT : HISTORY_FEEDBACK_VIEW_EVENT,
  created_at: "2026-10-28T10:00:00.000Z",
  meta_data: {
    experiment: HISTORY_FEEDBACK_EXPERIMENT,
    variant: assignHistoryFeedbackVariant(user),
    opportunityId,
    ...(feedback ? { feedback } : {}),
  },
});

test("allocation stays fixed for an account and splits UUID users approximately equally", () => {
  assert.equal(
    assignHistoryFeedbackVariant(userA),
    assignHistoryFeedbackVariant(` ${userA.toUpperCase()} `)
  );
  const users = Array.from(
    { length: 10000 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
  );
  const treatment = users.filter(
    (id) => assignHistoryFeedbackVariant(id) === "save_hide"
  ).length;
  assert.ok(treatment > 4700 && treatment < 5300, `B users: ${treatment}`);
});

test("counts unique viewed recommendations and either saved feedback, excluding clicks and unviewed cards", () => {
  const rows = [
    log(userA, "positive"),
    log(userA, "positive"),
    log(userA, "positive", "positive"),
    log(userA, "positive", "negative"),
    log(userA, "negative"),
    log(userA, "negative", "negative"),
    log(userA, "no-feedback"),
    log(userA, "unopened", "positive"),
    {
      ...log(userA, "no-feedback", "negative"),
      type: "career_click_history_negative",
    },
    log(userA, "no-feedback", "keep"),
    log("excluded", "excluded"),
    log("excluded", "excluded", "positive"),
    { ...log(userA, "wrong-experiment"), meta_data: { experiment: "other" } },
  ];
  const result = buildHistoryFeedbackExperiment(rows, new Set(["excluded"]));
  const variant = result.variants.find(
    (v) => v.id === assignHistoryFeedbackVariant(userA)
  )!;
  assert.deepEqual(variant.primary, {
    numerator: 2,
    denominator: 3,
    rate: 2 / 3,
  });
  assert.equal(result.metricLayout, "summary");
  assert.deepEqual(
    variant.summaryMetrics?.map((m) => m.value),
    [3, 2, 2 / 3]
  );
  assert.equal(variant.metrics.length, 0);
});

test("isolates users, variants and experiment versions; no views is an undefined rate", () => {
  const otherUser = "e25ee10a-939f-4af0-afb4-e81ef72b9091";
  const rows = [log(userA, "same"), log(otherUser, "same", "positive")];
  const wrongVariant = log(userA, "override");
  wrongVariant.meta_data = {
    experiment: HISTORY_FEEDBACK_EXPERIMENT,
    opportunityId: "override",
    variant:
      assignHistoryFeedbackVariant(userA) === "thumbs" ? "save_hide" : "thumbs",
  };
  const result = buildHistoryFeedbackExperiment([...rows, wrongVariant]);
  assert.equal(
    result.variants.reduce((sum, v) => sum + v.primary.denominator, 0),
    1
  );
  assert.equal(
    result.variants.reduce((sum, v) => sum + v.primary.numerator, 0),
    0
  );
  assert.ok(
    buildHistoryFeedbackExperiment([]).variants.every(
      (v) => v.primary.rate === null
    )
  );
});
