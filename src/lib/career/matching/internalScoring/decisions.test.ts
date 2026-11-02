import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  buildRequest,
  parseAssessment,
  evaluateStage,
  internalScoringContract as contract,
} from "./decisions";
import { evaluationText, inputFingerprint, type Row } from "./evidence";
export const sample: Row = {
  talentId: "candidate",
  profile: {
    profile: { name: "홍길동", location: "서울", current_location: null },
    experiences: [
      {
        company: "한글\ncompany",
        start_date: "2021-01-02",
        end_date: null,
        description: "제품 개발\nsecond line",
      },
      {
        startDate: "2025-01-01T01:23:45+00:00",
        endDate: "2026-01-01T12:20:00",
        title: "엔지니어",
      },
    ],
    educations: [],
    extra: [{ text: "원문 그대로", numericEvidence: 0.000001 }],
  },
  role: {
    role_id: "role",
    name: "FDE",
    description: "기존 JD",
    location_text: "서울",
    salary_min: 70000000,
    salary_max: 90000000.5,
    request: "고객 현장에서 개발\n필수와 우대 분리",
    criteria: [
      { name: "개발", criteria: "필수: 제품 구현" },
      { name: "소통", criterionDefinition: "우대: 고객 협업" },
    ],
    company_name: "회사",
    company_description: "제품",
  },
  companyMemory: [
    {
      ref: "a",
      scope: "role",
      content: "전체 원문",
      revision: 3,
      updated_at: "2026-11-02T01:02:03.123456+00:00",
    },
  ],
  searchBrief: [
    {
      ref: "b",
      id: "hidden",
      label: "지역",
      content: "서울 선호, 이주 협의 가능",
      revision: 2,
    },
  ],
  behaviorContext: "참고 해석",
  behaviorContextVersion: 4,
  inputContractVersion: "worker_behavior_v1",
  sourceProfileId: "profile",
  sourceProfileRevision: 2,
  evidenceScope: "default",
};
export const answer = (request: Row, exclude = false) => ({
  model: contract.MODEL,
  usage: { input_tokens: 100, output_tokens: 10 },
  answers: request.questions.map((q: Row) =>
    q.type === "choice"
      ? { name: q.name, type: q.type, choice: exclude ? "exclude" : "continue" }
      : {
          name: q.name,
          type: q.type,
          score: 2.4,
          probabilities: [4, 3, 2, 1, 0].map((value) => ({
            value,
            probability: value === 2 ? 0.6 : 0.1,
          })),
        }
  ),
});

test("both stage payloads, assessments and fingerprint equal original Python Worker", () => {
  for (const source of [
    sample,
    { ...sample, role: { ...sample.role, criteria: [], salary_min: null } },
  ]) {
    const requests = [1, 2].map((stage) =>
      buildRequest(
        stage as 1 | 2,
        evaluationText(
          source,
          stage as 1 | 2,
          new Date("2026-11-02T15:30:00Z")
        ),
        source.role.criteria
      )
    );
    const responses = requests.map((r) => answer(r));
    const oracle = spawnSync(
      "python3",
      [
        resolve("src/lib/career/matching/internalScoring/workerParity.py"),
        resolve("../harper_worker"),
      ],
      { input: JSON.stringify({ source, responses }), encoding: "utf8" }
    );
    assert.equal(oracle.status, 0, oracle.stderr);
    const expected = JSON.parse(oracle.stdout);
    assert.deepEqual(requests, expected.requests);
    assert.deepEqual(
      responses.map((r, i) =>
        parseAssessment((i + 1) as 1 | 2, r, source.role.criteria)
      ),
      expected.assessments
    );
    assert.equal(inputFingerprint(source), expected.fingerprint);
  }
});
test("400-question chunking and transport retries preserve all criterion evidence", async () => {
  const source = {
    ...sample,
    role: {
      ...sample.role,
      criteria: Array.from({ length: 399 }, (_, i) => ({
        name: `criterion ${i}`,
        criteria: `original ${i}`,
      })),
    },
  };
  const sizes: number[] = [];
  let calls = 0;
  const result = await evaluateStage(source, 2, {
    apiKey: "test",
    wait: async () => {},
    fetch: async (_url, init) => {
      const req = JSON.parse(String(init?.body));
      calls++;
      if (calls === 1)
        return new Response("retry", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      sizes.push(req.questions.length);
      assert.match(req.input[1].content, /original 398/);
      return Response.json(answer(req));
    },
  });
  assert.deepEqual(sizes, [400, 2]);
  assert.equal(result.assessment.criteria.length, 399);
  assert.equal(result.attempts, 3);
  assert.equal(result.usage.input_tokens, 200);
});
test("stage 1 exclusion and invalid/refusal responses retain Worker semantics", () => {
  const request = buildRequest(1, "source");
  assert.equal(
    parseAssessment(1, answer(request, true)).proceedToStage2,
    false
  );
  const raw = answer(request);
  raw.answers.push(raw.answers[0]);
  assert.throws(() => parseAssessment(1, raw), /duplicated/);
  assert.throws(
    () => parseAssessment(2, { answers: [] }, sample.role.criteria),
    /coverage/
  );
});
