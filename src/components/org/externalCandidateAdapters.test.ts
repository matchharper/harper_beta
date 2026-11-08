import assert from "node:assert/strict";
import test from "node:test";
import type { ExternalCandidateView } from "@/lib/org/agent/externalSourcing";
import {
  externalBoardItem,
  externalCriteriaOrder,
  externalCriterionName,
  externalProfileDetail,
} from "./externalCandidateAdapters";

const person = (id: string, criteria: ExternalCandidateView["criteria"]): ExternalCandidateView => ({
  id, name: id, headline: null, currentCompany: null, location: null, linkedinUrl: null, career: [], reason: "",
  experiences: [], educations: [], criteria, evidence: [], contact: "none", contactConfirmed: false, intro: null,
  companyDecision: null, shownAt: "2026-11-01T00:00:00Z",
});

test("outside candidates follow the Role's current criteria by short name", () => {
  assert.equal(externalCriterionName("LLM 운영: 서비스에서 모델을 운영해 봤는지"), "LLM 운영");
  assert.equal(externalCriterionName("TypeScript"), "TypeScript");
  const a = person("a", [
    { name: "근무 지역: 서울", fitness: "good", content: "" },
    { name: "TypeScript: 큰 코드베이스", fitness: "excellent", content: "3년 썼어요." },
    { name: "LLM 운영: 모델 운영 경험", fitness: "limited", content: "" },
  ]);
  const b = person("b", [{ name: "경력 연차: 5년 이상", fitness: "good", content: "" }]);

  // The Role's order; the judge's extra criteria (work location, years) are left out.
  const order = externalCriteriaOrder([a, b], ["LLM 운영", "TypeScript", "디자인 협업"]);
  assert.deepEqual(order, ["LLM 운영", "TypeScript", "디자인 협업"]);
  const item = externalBoardItem(a, "role", order);
  assert.deepEqual(
    item.criteriaEvaluations.map(({ name, fitness, content }) => [name, fitness, content]),
    [
      ["LLM 운영", "limited", "모델 운영 경험"],
      ["TypeScript", "excellent", "3년 썼어요."],
    ],
    "short names in the Role's order; the full text stays when there is no quote"
  );
  assert.deepEqual(externalBoardItem(b, "role", order).criteriaEvaluations, []);
  assert.deepEqual(
    externalProfileDetail(a, order).criteriaEvaluations?.map((evaluation) => evaluation.name),
    ["LLM 운영", "TypeScript"]
  );

  // Without the Role's criteria: every shown person's, by short name, in the order they appear.
  assert.deepEqual(externalCriteriaOrder([a, b]), ["근무 지역", "TypeScript", "LLM 운영", "경력 연차"]);
});
