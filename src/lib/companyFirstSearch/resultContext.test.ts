import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanyMatchingResultContext } from "@/lib/companyFirstSearch/resultContext";

test("zero-result context gives semantic facts without prescribing final copy", () => {
  const result = buildCompanyMatchingResultContext({
    candidates: [],
    roles: [{ automaticSearchEnabled: true, id: "role-1", name: "Engineer" }],
    runStatus: "succeeded",
  });

  assert.match(result, /바로 소개해도 좋겠다고 확신할 만한 사람/);
  assert.match(result, /잘 맞는 사람이 전혀 없다는 뜻은 아니다/);
  assert.match(result, /본인이 회사를 먼저 보고 대화할지 정하길 원하기도/);
  assert.doesNotMatch(result, /0명/);
  assert.doesNotMatch(result, /company-first|Candidate-first|matching route/);
  assert.doesNotMatch(result, /실행 상태|응답 작성 범위|quota/);
  assert.doesNotMatch(result, /Hiring Brief|이 Role/);
  assert.doesNotMatch(result, /탐색 결과가 없습니다/);
});

test("selected context exposes only candidate-safe presentation facts", () => {
  const result = buildCompanyMatchingResultContext({
    candidates: [
      {
        headline: "Product engineer",
        name: "Alex",
        profileUrl: "https://example.com/profile",
        reason: "Built an adjacent product from zero to launch.",
        roleId: "role-1",
        roleName: "Founding Engineer",
        summary: "Early-stage full-stack ownership.",
      },
    ],
    roles: [
      {
        automaticSearchEnabled: false,
        id: "role-1",
        name: "Founding Engineer",
      },
    ],
    runStatus: "succeeded",
  });

  assert.match(result, /\[Alex\]\(https:\/\/example\.com\/profile\)/);
  assert.match(result, /아직 이 회사를 보거나 대화할 마음이 있는지 확인/);
  assert.match(result, /이 회사와 잘 맞을 수 있다고 본 이유/);
});
