import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanyMatchingResultContext } from "@/lib/companyFirstSearch/resultContext";

test("zero-result context gives semantic facts without prescribing final copy", () => {
  const result = buildCompanyMatchingResultContext({
    candidates: [],
    roles: [{ automaticSearchEnabled: true, id: "role-1", introSearchDate: ["Mon", "Wed", "Fri"], introSearchTime: 9, name: "Engineer" }],
    runStatus: "succeeded",
  });

  assert.match(result, /바로 소개해도 좋겠다고 확신할 만한 사람/);
  assert.match(result, /잘 맞는 사람이 전혀 없다는 뜻은 아니다/);
  assert.match(result, /본인이 회사를 먼저 보고 대화할지 정하길 원하기도/);
  assert.match(result, /Mon, Wed, Fri 09:00 Asia\/Seoul/);
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
  assert.match(result, /일반 선제 제안은 후보자의 관심을 아직 확인하지 않았다/);
  assert.match(result, /이 회사와 잘 맞을 수 있다고 본 이유/);
});

test("first delivered result includes verified schedule and a missing compensation fact", () => {
  const result = buildCompanyMatchingResultContext({
    candidates: [],
    firstDelivery: true,
    roles: [{
      automaticSearchEnabled: true,
      id: "role-1",
      introSearchDate: ["Tue", "Thu"],
      introSearchTime: 15,
      name: "Platform Engineer",
      request: "분산 시스템 운영 경험을 우선합니다.",
      salary: null,
    }],
    runStatus: "succeeded",
  });
  assert.match(result, /첫 후보 검색 결과/);
  assert.match(result, /Tue, Thu 15:00 Asia\/Seoul/);
  assert.match(result, /보상 범위: 아직 확인되지 않음/);
  assert.match(result, /분산 시스템 운영 경험/);
});

test("company result uses stored TLDR and safe Harper Note without repeating the legacy summary", () => {
  const result=buildCompanyMatchingResultContext({
    candidates:[{name:"Alex",headline:"Engineer",profileUrl:"https://example.com/profile",
      roleId:"role-1",roleName:"Engineer",summary:"Legacy summary",reason:"Legacy reason",
      tldr:"Owned implementation and operations.",harperNote:"The experience spans building and sustaining the product."}],
    roles:[{automaticSearchEnabled:false,id:"role-1",name:"Engineer"}],runStatus:"succeeded",
  });
  assert.ok(result.includes("Owned implementation and operations."));
  assert.ok(result.includes("The experience spans building and sustaining the product."));
  assert.ok(!result.includes("Legacy summary") && !result.includes("Legacy reason"));
});

test("capacity facts stop candidate outreach while preserving company review and role scope", () => {
  const result = buildCompanyMatchingResultContext({
    candidates: [], requestedByCompany: false,
    roles: [{ automaticSearchEnabled: true, id: "role-1", name: "Engineer" }],
    runStatus: "succeeded", candidateOutreachPauses: [
      { roleId: "role-1", pendingCount: 14, maxPendingTalents: 10 },
      { roleId: "other-role", pendingCount: 99, maxPendingTalents: 9 },
    ],
  });
  assert.match(result, /연결 대기 14명/);
  assert.match(result, /상한 10명/);
  assert.match(result, /회사에 먼저 후보를 제안하는 검토에는 적용하지 않는다/);
  assert.match(result, /회사가 새 검색을 직접 요청한 결과는 아니다/);
  assert.doesNotMatch(result, /99명/);
});

test("explicit review request is known interest without invented acceptance", () => {
  const result = buildCompanyMatchingResultContext({
    candidates: [{ candidateRequestedReview: true, headline: "Engineer", name: "Alex",
      profileUrl: "https://example.com/profile", reason: "Relevant product work",
      roleId: "role-1", roleName: "Engineer", summary: "Product ownership" }],
    roles: [{ automaticSearchEnabled: true, id: "role-1", name: "Engineer" }],
    runStatus: "succeeded",
  });
  assert.match(result, /후보자 본인이 이 역할의 우선 검토를 요청했다/);
  assert.match(result, /역할 수락이나 회사의 Intro 요청은 아니다/);
});
