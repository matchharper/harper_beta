import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOrgCompanyCriteriaEvaluations } from "./companyCriteriaEvaluations";

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
