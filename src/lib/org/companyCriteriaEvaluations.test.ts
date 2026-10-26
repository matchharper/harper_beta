import assert from "node:assert/strict";
import test from "node:test";

import { companyCriterionFitnessLabel, companyCriterionScoreLabel, isCompanyPresentationFromPreviousBrief, normalizeOrgCompanyCriteriaEvaluations, normalizeOrgCompanyPresentation } from "./companyCriteriaEvaluations";

test("preserves stored zero and fractional scores without deriving missing scores", () => {
  const scores = [0, 48.5, 66.24999999999999, undefined, null, "75", NaN, Infinity];
  const values = normalizeOrgCompanyCriteriaEvaluations(scores.map((score) => ({
    name: "Criterion", content: "Recorded evidence", fitness: "good", score,
  })));
  assert.deepEqual(values.slice(0, 3).map((item) => item.score), scores.slice(0, 3));
  for (const item of values.slice(3)) assert.equal(Object.hasOwn(item, "score"), false);
  assert.deepEqual(values.map((item) => companyCriterionScoreLabel(item.score)), [
    "0/100", "48.5/100", "66.25/100", null, null, null, null, null,
  ]);
});

test("presentation age compares exact Brief versions and leaves missing history unknown", () => {
  assert.equal(isCompanyPresentationFromPreviousBrief("old", "current"), true);
  assert.equal(isCompanyPresentationFromPreviousBrief("same", "same"), false);
  assert.equal(isCompanyPresentationFromPreviousBrief(undefined, "current"), undefined);
  assert.equal(isCompanyPresentationFromPreviousBrief("old", null), undefined);
});

test("normalizes stored company criteria evaluations in their saved order", () => {
  assert.deepEqual(
    normalizeOrgCompanyCriteriaEvaluations([
      {
        name: "  AI 시스템 구현 역량 ",
        fitness: "EXCELLENT",
        content: "  모델 설계부터 서빙까지 직접 수행했습니다. ",
      },
      {
        name: "글로벌 협업 커뮤니케이션",
        fitness: "uncertain",
        content: "영어권 고객과 협업한 근거는 아직 확인되지 않습니다.",
      },
    ]),
    [
      {
        name: "AI 시스템 구현 역량",
        fitness: "excellent",
        content: "모델 설계부터 서빙까지 직접 수행했습니다.",
      },
      {
        name: "글로벌 협업 커뮤니케이션",
        fitness: "uncertain",
        content: "영어권 고객과 협업한 근거는 아직 확인되지 않습니다.",
      },
    ]
  );
});

test("drops incomplete entries and treats unknown fitness as uncertain", () => {
  assert.deepEqual(
    normalizeOrgCompanyCriteriaEvaluations([
      null,
      { name: "", fitness: "good", content: "근거" },
      { name: "기준", fitness: "great", content: "간접 근거만 있습니다." },
    ]),
    [
      {
        name: "기준",
        fitness: "uncertain",
        content: "간접 근거만 있습니다.",
      },
    ]
  );
});

test("returns an empty list for a missing or non-array value", () => {
  assert.deepEqual(normalizeOrgCompanyCriteriaEvaluations(null), []);
  assert.deepEqual(normalizeOrgCompanyCriteriaEvaluations({}), []);
});

test("company report exposes only shareable presentation fields", () => {
  assert.deepEqual(normalizeOrgCompanyPresentation({
    tldr: "Built a production API.", harper_note: "Prefers architecture ownership.",
    finalFit: "good", criteriaEvaluations: [{ name: "Ownership", fitness: "good", content: "Operated the API.", criterionDefinition: "Internal definition" }],
    selectionReason: "Internal judgment", searchBrief: ["Private context"], recommendationId: "private",
  }), {
    tldr: "Built a production API.", harperNote: "Prefers architecture ownership.", finalFit: "good",
    criteriaEvaluations: [{ name: "Ownership", fitness: "good", content: "Operated the API." }],
  });
});

test("public recommendation reason stays exact and is never inferred for legacy reports", () => {
  const reason = "직접 구축한 재무 모델이 근거예요. ".repeat(150) + "상업 협상의 책임 범위는 확인이 필요해요.";
  const report = { tldr: "Summary", recommendationReason: reason, selectionReason: "Private selector rationale" };
  assert.equal(normalizeOrgCompanyPresentation(report)?.recommendationReason, reason);
  assert.equal(Object.hasOwn(normalizeOrgCompanyPresentation({ tldr: "Legacy", selectionReason: "Private" })!, "recommendationReason"), false);
  assert.equal(Object.hasOwn(normalizeOrgCompanyPresentation({ tldr: "Invalid", recommendationReason: 42 })!, "recommendationReason"), false);
});

test("missing report stays absent and empty Note is valid", () => {
  assert.equal(normalizeOrgCompanyPresentation({ selectionReason: "Private" }), null);
  assert.deepEqual(normalizeOrgCompanyPresentation({ tldr: "API work.", harperNote: "", finalFit: "unsupported", criteriaEvaluations: [] }),
    { tldr: "API work.", harperNote: "", finalFit: null, criteriaEvaluations: [] });
});


test("Decisions labels survive presentation normalization without a new rating", () => {
  for (const fitness of ["excellent", "good", "uncertain", "limited", "conflict"] as const) {
    const [row] = normalizeOrgCompanyCriteriaEvaluations([{name: "Criterion", content: "Evidence", fitness, score: 52}]);
    assert.equal(row.fitness, fitness);
    assert.ok(companyCriterionFitnessLabel(row.fitness, "ko"));
    assert.ok(companyCriterionFitnessLabel(row.fitness, "en"));
  }
});
