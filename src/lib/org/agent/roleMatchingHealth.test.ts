import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrgRoleMatchingHealthToolResult,
  getRoleMatchingHealthContextTalentIds,
  parseOrgRoleMatchingHealthFocus,
} from "@/lib/org/agent/roleMatchingHealth";

type BuildArgs = Parameters<typeof buildOrgRoleMatchingHealthToolResult>[0];
type Fit = BuildArgs["fits"][number];
type Recommendation = NonNullable<BuildArgs["recommendations"]>[number];

const evaluatedAt = "2026-09-08T06:00:00.000Z";

function fit(talentId: string, overrides: Partial<Fit> = {}): Fit {
  return {
    candidate_fit: "fit",
    company_fit: "fit",
    created_at: evaluatedAt,
    human_label: null,
    human_reason: null,
    id: `fit-${talentId}`,
    label: "fit",
    last_evaluated_at: evaluatedAt,
    reason: "역할, 후보자 선호, 회사 기준이 모두 잘 맞는다.",
    recommend: true,
    reevaluation_criteria: null,
    role_fit: "fit",
    score: 90,
    talent_id: talentId,
    ...overrides,
  };
}

function recommendation(
  talentId: string,
  overrides: Partial<Recommendation> = {}
): Recommendation {
  return {
    created_at: evaluatedAt,
    feedback: null,
    feedback_at: null,
    feedback_reason: null,
    fit_reasons: [],
    fit_summary: null,
    id: `recommendation-${talentId}`,
    kind: "match",
    opportunity_type: "internal_recommendation",
    recommended_at: evaluatedAt,
    saved_stage: null,
    talent_id: talentId,
    updated_at: evaluatedAt,
    ...overrides,
  };
}

function role(overrides: Partial<BuildArgs["role"]> = {}): BuildArgs["role"] {
  return {
    automaticMatchingEnabled: true,
    employmentTypes: ["full_time"],
    expiresAt: null,
    isExpired: false,
    location: "Seoul",
    name: "Backend Engineer",
    salaryCurrency: "KRW",
    salaryMax: 150_000_000,
    salaryMin: 100_000_000,
    salaryPeriod: "year",
    salaryRange: null,
    status: "active",
    updatedAt: "2026-09-08T05:00:00.000Z",
    workMode: "hybrid",
    ...overrides,
  };
}

function build(overrides: Partial<BuildArgs> = {}) {
  return buildOrgRoleMatchingHealthToolResult({
    fits: [],
    generatedAt: "2026-09-08T08:00:00.000Z",
    role: role(),
    ...overrides,
  });
}

test("returns a plain-text role snapshot and deduplicates candidates by their latest record", () => {
  const result = build({
    candidateContexts: [
      {
        headline: null,
        recentCompany: "Toss Payments",
        recentRole: "Backend Engineer",
        talentId: "candidate-constraint",
      },
    ],
    fits: [
      fit("same-candidate", {
        id: "older-fit",
        last_evaluated_at: "2026-09-07T06:00:00.000Z",
        recommend: true,
      }),
      fit("same-candidate", {
        candidate_fit: "middle",
        id: "newer-fit",
        last_evaluated_at: "2026-09-08T07:00:00.000Z",
        reason: "보상 기대 수준에 차이가 있다.",
        recommend: false,
      }),
      fit("candidate-constraint", {
        candidate_fit: "unfit",
        reason:
          "초기 팀 합류 의사는 맞지만 희망 연봉 2억 원과 현재 범위에 차이가 있다.",
        recommend: false,
      }),
      fit("all-unfit", {
        candidate_fit: "unfit",
        company_fit: "unfit",
        reason: "회사에 도움이 되지 않는 전부 부적합 사유",
        recommend: false,
        role_fit: "unfit",
        score: 5,
      }),
    ],
  });

  assert.equal(typeof result, "string");
  assert.match(result, /Role: Backend Engineer/);
  assert.match(result, /자동 매칭: 켜짐/);
  assert.match(result, /회사에 등록된 보상 범위: KRW 100000000–150000000 year/);
  assert.match(result, /적합도 판단 기록이 있는 고유 후보자: 3명/);
  assert.match(result, /현재 추천 대상으로 저장된 고유 후보자: 0명/);
  assert.match(result, /후보자 조건에서 막힌 근접 후보: 2명/);
  assert.match(result, /최근 등록 경력: Toss Payments · Backend Engineer/);
  assert.match(result, /\[후보자 금액 비공개\]/);
  assert.doesNotMatch(result, /2억 원/);
  assert.doesNotMatch(result, /전부 부적합 사유/);
  assert.doesNotMatch(
    result,
    /candidate-constraint|same-candidate|all-unfit|older-fit|newer-fit/
  );
  assert.doesNotMatch(result, /"disclosure"|"analysis"|\{/);
});

test("surfaces distinct actionable near-match groups without treating all-unfit rows as advice", () => {
  const result = build({
    fits: [
      fit("candidate", {
        candidate_fit: "middle",
        reason: "후보자는 완전 원격을 선호하지만 Role은 하이브리드다.",
        recommend: false,
      }),
      fit("company", {
        company_fit: "ambiguous",
        reason: "회사가 요구한 B2B 규모 경험의 충족 여부가 불확실하다.",
        recommend: false,
      }),
      fit("role", {
        reason: "필수 자격증 보유 여부를 한 번 확인해야 한다.",
        recommend: false,
        role_fit: "hold",
      }),
      fit("aligned", {
        reason: "세 관점은 모두 맞지만 별도 추천 선택 근거는 기록되지 않았다.",
        recommend: false,
      }),
      fit("all-unfit", {
        candidate_fit: "unfit",
        company_fit: "unfit",
        reason: "무관한 탈락 사유",
        recommend: false,
        role_fit: "unfit",
      }),
    ],
  });

  assert.match(result, /후보자 조건에서 막힌 근접 후보: 1명/);
  assert.match(result, /회사 기준에서 막힌 근접 후보: 1명/);
  assert.match(result, /역할 요건에서 막힌 근접 후보: 1명/);
  assert.match(result, /상호 적합 판단 후 미선택 후보: 1명/);
  assert.match(result, /비추천 사유라고 단정할 수는 없음/);
  assert.doesNotMatch(result, /무관한 탈락 사유/);
});

test("keeps an empty near-match group to one count line", () => {
  const result = build();
  const emptyGroup = result.slice(
    result.indexOf("상호 적합 판단 후 미선택 후보: 0명"),
    result.indexOf("[후보자 거절 이유]") >= 0
      ? result.indexOf("[후보자 거절 이유]")
      : result.indexOf("[정확성 경계]")
  );

  assert.match(emptyGroup, /^상호 적합 판단 후 미선택 후보: 0명/m);
  assert.doesNotMatch(emptyGroup, /의미:|근거 예시:|제공할 수 있는 근거/);
});

test("reports recommendation records and feedback without claiming delivery or inferring no-response", () => {
  const result = build({
    candidateContexts: [
      {
        headline: null,
        recentCompany: "Example Labs",
        recentRole: "Product Engineer",
        talentId: "declined",
      },
    ],
    fits: [fit("selected-without-record")],
    recommendations: [
      recommendation("same-talent", {
        feedback: "dislike",
        feedback_reason: "더 오래된 추천의 거절 사유",
        id: "older-recommendation",
        recommended_at: "2026-09-07T06:00:00.000Z",
        updated_at: "2026-09-08T09:00:00.000Z",
      }),
      recommendation("same-talent", {
        feedback: "like",
        id: "newer-recommendation",
        recommended_at: "2026-09-08T07:00:00.000Z",
        updated_at: "2026-09-08T07:00:00.000Z",
      }),
      recommendation("declined", {
        feedback: "dislike",
        feedback_at: "2026-09-08T07:10:00.000Z",
        feedback_reason: "지금은 더 큰 역할 범위를 원한다.",
        fit_reasons: ["제품 개발과 고객 delivery 경험이 맞는다."],
      }),
      recommendation("no-response"),
    ],
  });

  assert.match(result, /공식 추천 기록이 있는 고유 후보자: 3명/);
  assert.match(result, /후보자 긍정 반응: 1명/);
  assert.match(result, /후보자 거절 반응: 1명/);
  assert.match(result, /후보자 반응 기록 없음: 1명/);
  assert.match(result, /공식 추천 기록은 없는 후보자: 1명/);
  assert.match(
    result,
    /최근 등록 경력: Example Labs · Product Engineer \/ 기록된 거절 이유: 지금은 더 큰 역할 범위를 원한다\./
  );
  assert.doesNotMatch(result, /더 오래된 추천의 거절 사유/);
  assert.match(result, /실제 전달됐다고 단정하지 않는다/);
  assert.match(result, /후보자 반응 기록이 없다는 것은 거절이 아니다/);
  assert.doesNotMatch(result, /열람/);
  assert.doesNotMatch(result, /연결 제안 나간 사람/);
});

test("omits the decline-reason section when no decline has a recorded reason", () => {
  const result = build({
    recommendations: [
      recommendation("declined-without-reason", { feedback: "dislike" }),
      recommendation("no-response"),
    ],
  });

  assert.match(result, /후보자 거절 반응: 1명/);
  assert.doesNotMatch(result, /\[후보자 거절 이유\]/);
  assert.doesNotMatch(result, /기록된 거절 이유 없음/);
});

test("does not reuse axis reasons after a human override", () => {
  const result = build({
    fits: [
      fit("human-reviewed", {
        candidate_fit: "middle",
        human_label: "fit",
        human_reason: null,
        reason: "사람이 판단을 바꿨으므로 진단에 쓰면 안 되는 예전 모델 이유",
        recommend: false,
      }),
    ],
  });

  assert.match(result, /후보자 조건에서 막힌 근접 후보: 0명/);
  assert.doesNotMatch(result, /예전 모델 이유/);
});

test("requests profile context only for surfaced evidence and recommendation examples", () => {
  const ids = getRoleMatchingHealthContextTalentIds({
    fits: [
      fit("candidate-friction", {
        candidate_fit: "middle",
        reason: "근무 방식 차이",
      }),
      fit("company-friction", {
        company_fit: "unfit",
        reason: "회사 기준 차이",
      }),
      fit("all-unfit", {
        candidate_fit: "unfit",
        company_fit: "unfit",
        reason: "관련 없는 이유",
        role_fit: "unfit",
      }),
    ],
    recommendations: [
      recommendation("declined", {
        feedback: "dislike",
        feedback_reason: "역할 범위 차이",
      }),
      recommendation("accepted", { feedback: "like" }),
    ],
  });

  assert.deepEqual(ids.sort(), [
    "accepted",
    "candidate-friction",
    "company-friction",
    "declined",
  ]);
});

test("places disclosure, uncertainty, and actionability rules directly in the text", () => {
  const result = build();

  assert.match(result, /회사 답변 작성 지침/);
  assert.match(result, /정확한 인원 수, 비율/);
  assert.match(result, /개인적 사유나 단순한 후보자 약점은 언급하지 않는다/);
  assert.match(result, /현재 재직 중이라고 단정하지 않는다/);
  assert.match(result, /후보자 금액은 비공개 상태로 유지/);
  assert.match(result, /근거가 없는 단계는 일어났다고 말하지 않는다/);
  assert.match(result, /원인을 만들어내지 말고/);
});

test("supports four explicit read focuses and rejects unknown ones", () => {
  assert.equal(parseOrgRoleMatchingHealthFocus("overview"), "overview");
  assert.equal(parseOrgRoleMatchingHealthFocus("near_matches"), "near_matches");
  assert.equal(
    parseOrgRoleMatchingHealthFocus("matching_coverage"),
    "matching_coverage"
  );
  assert.equal(
    parseOrgRoleMatchingHealthFocus("candidate_feedback"),
    "candidate_feedback"
  );
  assert.equal(parseOrgRoleMatchingHealthFocus("recommendation_history"), null);
  assert.equal(parseOrgRoleMatchingHealthFocus("recommendable_now"), null);
});

test("near-matches focus returns only actionable near-match evidence", () => {
  const result = build({
    fits: [
      fit("candidate", {
        candidate_fit: "middle",
        reason: "근무 방식 차이",
      }),
    ],
    focus: "near_matches",
    recommendations: [
      recommendation("declined", {
        feedback: "dislike",
        feedback_reason: "후보자의 실제 거절 사유",
      }),
    ],
  });

  assert.match(result, /\[아쉽게 매칭되지 않은 근접 후보\]/);
  assert.match(result, /후보자 조건에서 막힌 근접 후보: 1명/);
  assert.match(result, /근무 방식 차이/);
  assert.doesNotMatch(result, /후보자의 실제 거절 사유/);
  assert.doesNotMatch(result, /최근 공식 추천 기록 예시/);
});

test("matching-coverage focus states that the full pool denominator is unknown", () => {
  const result = build({
    fits: [fit("evaluated")],
    focus: "matching_coverage",
  });

  assert.match(result, /\[매칭 판단 범위와 최신성\]/);
  assert.match(result, /전체 후보 Pool 규모: 이 데이터 소스에서는 확인할 수 없음/);
  assert.match(result, /전체 후보 Pool 크기나 전체 검토 완료를 뜻하지 않는다/);
  assert.doesNotMatch(result, /근접 후보|후보자 거절 이유/);
});

test("candidate-feedback focus returns recorded decline reasons without recommendation history", () => {
  const result = build({
    focus: "candidate_feedback",
    recommendations: [
      recommendation("declined", {
        feedback: "dislike",
        feedback_reason: "근무 방식이 맞지 않는다.",
      }),
      recommendation("accepted", { feedback: "like" }),
    ],
  });

  assert.match(result, /\[후보자 거절 반응\]/);
  assert.match(result, /거절 이유까지 기록된 고유 후보자: 1명/);
  assert.match(result, /\[기록된 거절 이유\]/);
  assert.match(result, /근무 방식이 맞지 않는다/);
  assert.doesNotMatch(result, /최근 공식 추천 기록 예시|추천 근거/);
});

test("focused context lookup does not fetch unrelated candidate profiles", () => {
  const fits = [
    fit("near-match", {
      candidate_fit: "middle",
      reason: "보상 조건 차이",
    }),
  ];
  const recommendations = [
    recommendation("declined", {
      feedback: "dislike",
      feedback_reason: "근무 방식 차이",
    }),
    recommendation("accepted", { feedback: "like" }),
  ];

  assert.deepEqual(
    getRoleMatchingHealthContextTalentIds({
      fits,
      focus: "near_matches",
      recommendations,
    }),
    ["near-match"]
  );
  assert.deepEqual(
    getRoleMatchingHealthContextTalentIds({
      fits,
      focus: "candidate_feedback",
      recommendations,
    }),
    ["declined"]
  );
  assert.deepEqual(
    getRoleMatchingHealthContextTalentIds({
      fits,
      focus: "matching_coverage",
      recommendations,
    }),
    []
  );
});
