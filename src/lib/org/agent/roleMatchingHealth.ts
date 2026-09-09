import type { Database, Json } from "@/types/database.types";

export type RoleMatchingHealthFitRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_fit"]["Row"],
  | "candidate_fit"
  | "company_fit"
  | "created_at"
  | "human_label"
  | "human_reason"
  | "id"
  | "label"
  | "last_evaluated_at"
  | "reason"
  | "recommend"
  | "reevaluation_criteria"
  | "role_fit"
  | "score"
  | "talent_id"
>;

export type RoleMatchingHealthRecommendationRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"],
  | "created_at"
  | "feedback"
  | "feedback_at"
  | "feedback_reason"
  | "fit_reasons"
  | "fit_summary"
  | "id"
  | "kind"
  | "opportunity_type"
  | "recommended_at"
  | "saved_stage"
  | "talent_id"
  | "updated_at"
  | "viewed_at"
>;

export type RoleMatchingHealthTalentContext = {
  headline: string | null;
  recentCompany: string | null;
  recentRole: string | null;
  talentId: string;
};

export type RoleMatchingHealthRole = {
  automaticMatchingEnabled: boolean | null;
  employmentTypes: string[];
  expiresAt: string | null;
  isExpired: boolean;
  location: string | null;
  name: string;
  salaryCurrency: string | null;
  salaryMax: number | null;
  salaryMin: number | null;
  salaryPeriod: string | null;
  salaryRange: string | null;
  status: string;
  updatedAt: string;
  workMode: string | null;
};

export type BuildRoleMatchingHealthArgs = {
  candidateContexts?: RoleMatchingHealthTalentContext[];
  fits: RoleMatchingHealthFitRow[];
  generatedAt: string;
  maxReasonSamples?: number;
  recommendations?: RoleMatchingHealthRecommendationRow[];
  role: RoleMatchingHealthRole;
};

export type OrgRoleMatchingHealthToolResult = string;

type DiagnosticGroupKey =
  | "candidateConstraint"
  | "companyCriteria"
  | "mutualFitNotSelected"
  | "roleRequirement";

type DiagnosticGroup = {
  description: string;
  key: DiagnosticGroupKey;
  rows: RoleMatchingHealthFitRow[];
  title: string;
};

const DEFAULT_MAX_REASON_SAMPLES = 12;
const MAX_DECLINE_REASON_SAMPLES = 8;
const MAX_RECOMMENDATION_EXAMPLES = 4;
const MAX_REASON_LENGTH = 1_000;

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value: unknown) {
  return text(value).toLowerCase();
}

function timestamp(value: unknown) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clip(value: unknown, maxLength: number) {
  const valueText = text(value);
  return valueText.length <= maxLength
    ? valueText
    : `${valueText.slice(0, maxLength - 1)}…`;
}

function latestRowsByTalent<T extends { talent_id: string }>(
  rows: T[],
  dateFor: (row: T) => unknown,
  idFor: (row: T) => unknown
) {
  const latest = new Map<string, T>();
  for (const row of [...rows].sort((left, right) => {
    const dateDifference = timestamp(dateFor(right)) - timestamp(dateFor(left));
    if (dateDifference !== 0) return dateDifference;
    return text(idFor(right)).localeCompare(text(idFor(left)));
  })) {
    if (!latest.has(row.talent_id)) latest.set(row.talent_id, row);
  }
  return latest;
}

function latestFits(rows: RoleMatchingHealthFitRow[]) {
  return [
    ...latestRowsByTalent(
      rows,
      (row) => row.last_evaluated_at || row.created_at,
      (row) => row.id
    ).values(),
  ];
}

function latestRecommendations(rows: RoleMatchingHealthRecommendationRow[]) {
  return [
    ...latestRowsByTalent(
      rows,
      (row) => row.recommended_at || row.created_at,
      (row) => row.id
    ).values(),
  ].sort(
    (left, right) =>
      timestamp(right.recommended_at || right.created_at) -
      timestamp(left.recommended_at || left.created_at)
  );
}

function hasHumanOverride(row: RoleMatchingHealthFitRow) {
  return Boolean(text(row.human_label));
}

function isCandidateConstraint(row: RoleMatchingHealthFitRow) {
  return (
    !hasHumanOverride(row) &&
    normalized(row.role_fit) === "fit" &&
    normalized(row.company_fit) === "fit" &&
    ["middle", "unfit"].includes(normalized(row.candidate_fit))
  );
}

function isCompanyCriteriaConstraint(row: RoleMatchingHealthFitRow) {
  return (
    !hasHumanOverride(row) &&
    normalized(row.role_fit) === "fit" &&
    normalized(row.candidate_fit) === "fit" &&
    ["ambiguous", "unfit"].includes(normalized(row.company_fit))
  );
}

function isRoleRequirementConstraint(row: RoleMatchingHealthFitRow) {
  return (
    !hasHumanOverride(row) &&
    normalized(row.candidate_fit) === "fit" &&
    normalized(row.company_fit) === "fit" &&
    ["hold", "ambiguous", "unfit"].includes(normalized(row.role_fit))
  );
}

function isMutualFitNotSelected(row: RoleMatchingHealthFitRow) {
  return (
    !hasHumanOverride(row) &&
    normalized(row.role_fit) === "fit" &&
    normalized(row.candidate_fit) === "fit" &&
    normalized(row.company_fit) === "fit" &&
    row.recommend !== true
  );
}

function redactCandidateAmounts(value: unknown) {
  return text(value)
    .replace(
      /(?:₩|\$|USD|KRW)\s*\d[\d,.]*(?:\s*[kKmM])?/gi,
      "[후보자 금액 비공개]"
    )
    .replace(
      /\d[\d,.]*(?:\s*[-~–]\s*\d[\d,.]*)?\s*(?:억|천만|백만|만)\s*원?/g,
      "[후보자 금액 비공개]"
    )
    .replace(
      /\d[\d,.]*\s*[kKmM]\b(?:\s*(?:USD|KRW))?/g,
      "[후보자 금액 비공개]"
    )
    .replace(/\d[\d,.]*\s*원/g, "[후보자 금액 비공개]")
    .replace(
      /\[후보자 금액 비공개\](?:\s*(?:[-~–]|에서|부터|까지|,)?\s*\[후보자 금액 비공개\])+/g,
      "[후보자 금액 비공개]"
    );
}

function fitReason(row: RoleMatchingHealthFitRow) {
  const source = hasHumanOverride(row) ? row.human_reason : row.reason;
  return clip(redactCandidateAmounts(source), MAX_REASON_LENGTH);
}

function jsonTextList(value: Json) {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

function candidateDescription(
  context: RoleMatchingHealthTalentContext | undefined
) {
  if (!context) return "";
  const company = clip(context.recentCompany, 120);
  const role = clip(context.recentRole, 160);
  if (company && role) return `최근 등록 경력: ${company} · ${role}`;
  if (company || role) return `최근 등록 경력: ${company || role}`;
  const headline = clip(context.headline, 220);
  return headline ? `프로필 소개: ${headline}` : "";
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function sortFits(rows: RoleMatchingHealthFitRow[]) {
  return [...rows].sort((left, right) => {
    const scoreDifference = right.score - left.score;
    if (scoreDifference !== 0) return scoreDifference;
    return (
      timestamp(right.last_evaluated_at || right.created_at) -
      timestamp(left.last_evaluated_at || left.created_at)
    );
  });
}

function diagnosticGroups(rows: RoleMatchingHealthFitRow[]): DiagnosticGroup[] {
  return [
    {
      description:
        "역할 수행 가능성과 회사 기준은 맞지만 후보자의 선호·조건과 차이가 있는 경우",
      key: "candidateConstraint",
      rows: sortFits(rows.filter(isCandidateConstraint)),
      title: "후보자 조건에서 막힌 근접 후보",
    },
    {
      description:
        "역할 수행 가능성과 후보자 선호는 맞지만 현재 회사 기준 충족 여부가 낮거나 불확실한 경우",
      key: "companyCriteria",
      rows: sortFits(rows.filter(isCompanyCriteriaConstraint)),
      title: "회사 기준에서 막힌 근접 후보",
    },
    {
      description:
        "후보자 선호와 회사 기준은 맞지만 역할의 필수 요건에서 차이 또는 확인할 사실이 있는 경우",
      key: "roleRequirement",
      rows: sortFits(rows.filter(isRoleRequirementConstraint)),
      title: "역할 요건에서 막힌 근접 후보",
    },
    {
      description:
        "세 관점 모두 긍정적으로 판단됐지만 현재 추천 대상으로 선택되지 않은 경우. 제공된 근거가 비추천 사유라고 단정할 수는 없음",
      key: "mutualFitNotSelected",
      rows: sortFits(rows.filter(isMutualFitNotSelected)),
      title: "상호 적합 판단 후 미선택 후보",
    },
  ];
}

function samplesSize(
  samples: Map<DiagnosticGroupKey, RoleMatchingHealthFitRow[]>
) {
  return [...samples.values()].reduce((sum, rows) => sum + rows.length, 0);
}

function balancedSamples(
  groups: DiagnosticGroup[],
  limit: number
): Map<DiagnosticGroupKey, RoleMatchingHealthFitRow[]> {
  const samples = new Map<DiagnosticGroupKey, RoleMatchingHealthFitRow[]>(
    groups.map((group) => [group.key, []])
  );
  for (let index = 0; samplesSize(samples) < limit; index += 1) {
    let added = false;
    for (const group of groups) {
      const row = group.rows[index];
      if (!row || !fitReason(row)) continue;
      samples.get(group.key)?.push(row);
      added = true;
      if (samplesSize(samples) >= limit) break;
    }
    if (!added) break;
  }
  return samples;
}

function formatFitSamples(args: {
  contextByTalentId: Map<string, RoleMatchingHealthTalentContext>;
  rows: RoleMatchingHealthFitRow[];
}) {
  const reasons = unique(
    args.rows.map((row) => {
      const reason = fitReason(row);
      if (!reason) return "";
      const description = candidateDescription(
        args.contextByTalentId.get(row.talent_id)
      );
      return description ? `${description} / 판단 근거: ${reason}` : reason;
    })
  );
  return reasons.length > 0
    ? reasons.map((reason) => `- ${reason}`).join("\n")
    : "- 제공할 수 있는 근거 예시 없음";
}

function isPositiveFeedback(row: RoleMatchingHealthRecommendationRow) {
  return ["like", "positive"].includes(normalized(row.feedback));
}

function isNegativeFeedback(row: RoleMatchingHealthRecommendationRow) {
  return ["dislike", "negative"].includes(normalized(row.feedback));
}

function recommendationResponse(row: RoleMatchingHealthRecommendationRow) {
  if (isPositiveFeedback(row)) return "긍정 반응 기록 있음";
  if (isNegativeFeedback(row)) return "거절 반응 기록 있음";
  return "후보자 반응 기록 없음";
}

function recommendationReason(row: RoleMatchingHealthRecommendationRow) {
  const parts = unique([
    clip(redactCandidateAmounts(row.fit_summary), 500),
    ...jsonTextList(row.fit_reasons).map((reason) =>
      clip(redactCandidateAmounts(reason), 500)
    ),
  ]);
  return clip(parts.join("; "), MAX_REASON_LENGTH);
}

function formatRecommendationExamples(args: {
  contextByTalentId: Map<string, RoleMatchingHealthTalentContext>;
  recommendations: RoleMatchingHealthRecommendationRow[];
}) {
  const lines = args.recommendations
    .slice(0, MAX_RECOMMENDATION_EXAMPLES)
    .map((recommendation) => {
      const description = candidateDescription(
        args.contextByTalentId.get(recommendation.talent_id)
      );
      const reason = recommendationReason(recommendation);
      return [
        description || "익명 후보자",
        `추천 기록 시각: ${recommendation.recommended_at}`,
        recommendationResponse(recommendation),
        `열람 기록: ${recommendation.viewed_at ? "있음" : "없음"}`,
        reason ? `추천 근거: ${reason}` : "",
      ]
        .filter(Boolean)
        .join(" / ");
    });
  return lines.length > 0
    ? lines.map((line) => `- ${line}`).join("\n")
    : "- 공식 추천 기록 없음";
}

function formatDeclineReasons(args: {
  contextByTalentId: Map<string, RoleMatchingHealthTalentContext>;
  recommendations: RoleMatchingHealthRecommendationRow[];
}) {
  const reasons = unique(
    args.recommendations
      .filter(isNegativeFeedback)
      .map((recommendation) => {
        const reason = clip(
          redactCandidateAmounts(recommendation.feedback_reason),
          MAX_REASON_LENGTH
        );
        if (!reason) return "";
        const description = candidateDescription(
          args.contextByTalentId.get(recommendation.talent_id)
        );
        return description
          ? `${description} / 기록된 거절 이유: ${reason}`
          : reason;
      })
      .filter(Boolean)
  ).slice(0, MAX_DECLINE_REASON_SAMPLES);
  return reasons.length > 0
    ? reasons.map((reason) => `- ${reason}`).join("\n")
    : "- 기록된 거절 이유 없음";
}

function companySalary(role: RoleMatchingHealthRole) {
  const range = text(role.salaryRange);
  if (range) return range;
  if (role.salaryMin === null && role.salaryMax === null) return "등록 정보 없음";
  const currency = text(role.salaryCurrency);
  const period = text(role.salaryPeriod);
  const bounds =
    role.salaryMin !== null && role.salaryMax !== null
      ? `${role.salaryMin}–${role.salaryMax}`
      : role.salaryMin !== null
        ? `${role.salaryMin} 이상`
        : `${role.salaryMax} 이하`;
  return [currency, bounds, period].filter(Boolean).join(" ");
}

function valueOrMissing(value: unknown) {
  return text(value) || "등록 정보 없음";
}

function automaticMatching(value: boolean | null) {
  if (value === true) return "켜짐";
  if (value === false) return "꺼짐";
  return "설정 기록 없음";
}

function latestEvaluationAt(rows: RoleMatchingHealthFitRow[]) {
  const value = rows.reduce((latest, row) => {
    const candidate = row.last_evaluated_at || row.created_at;
    return timestamp(candidate) > timestamp(latest) ? candidate : latest;
  }, "");
  return value || "판단 기록 없음";
}

export function getRoleMatchingHealthContextTalentIds(args: {
  fits: RoleMatchingHealthFitRow[];
  maxReasonSamples?: number;
  recommendations?: RoleMatchingHealthRecommendationRow[];
}) {
  const maxReasonSamples = Math.max(
    0,
    Math.min(30, args.maxReasonSamples ?? DEFAULT_MAX_REASON_SAMPLES)
  );
  const fits = latestFits(args.fits);
  const groups = diagnosticGroups(fits);
  const diagnosticSamples = balancedSamples(groups, maxReasonSamples);
  const diagnosticTalentIds = [...diagnosticSamples.values()]
    .flat()
    .map((row) => row.talent_id);
  const recommendations = latestRecommendations(args.recommendations ?? []);
  const recommendationTalentIds = recommendations
    .slice(0, MAX_RECOMMENDATION_EXAMPLES)
    .map((row) => row.talent_id);
  const declinedTalentIds = recommendations
    .filter(isNegativeFeedback)
    .filter((row) => text(row.feedback_reason))
    .slice(0, MAX_DECLINE_REASON_SAMPLES)
    .map((row) => row.talent_id);
  return Array.from(
    new Set([
      ...diagnosticTalentIds,
      ...recommendationTalentIds,
      ...declinedTalentIds,
    ])
  );
}

/** Returns the plain-text evidence supplied to the company-side LLM. */
export function buildOrgRoleMatchingHealthToolResult(
  args: BuildRoleMatchingHealthArgs
): OrgRoleMatchingHealthToolResult {
  const maxReasonSamples = Math.max(
    0,
    Math.min(30, args.maxReasonSamples ?? DEFAULT_MAX_REASON_SAMPLES)
  );
  const fits = latestFits(args.fits);
  const recommendations = latestRecommendations(args.recommendations ?? []);
  const recommendationTalentIds = new Set(
    recommendations.map((row) => row.talent_id)
  );
  const selectedFits = fits.filter((row) => row.recommend === true);
  const selectedWithoutRecommendation = selectedFits.filter(
    (row) => !recommendationTalentIds.has(row.talent_id)
  );
  const positiveResponses = recommendations.filter(isPositiveFeedback);
  const negativeResponses = recommendations.filter(isNegativeFeedback);
  const noRecordedResponses = recommendations.filter(
    (row) => !isPositiveFeedback(row) && !isNegativeFeedback(row)
  );
  const viewedRecommendations = recommendations.filter((row) => row.viewed_at);
  const roleUpdatedAt = timestamp(args.role.updatedAt);
  const fitsAfterRoleUpdate =
    roleUpdatedAt > 0
      ? fits.filter(
          (row) =>
            timestamp(row.last_evaluated_at || row.created_at) >= roleUpdatedAt
        )
      : null;
  const employmentTypes = args.role.employmentTypes.map(text).filter(Boolean);
  const contextByTalentId = new Map(
    (args.candidateContexts ?? []).map((context) => [
      context.talentId,
      context,
    ])
  );
  const groups = diagnosticGroups(fits);
  const samples = balancedSamples(groups, maxReasonSamples);
  const groupSections = groups.flatMap((group) => [
    `${group.title}: ${group.rows.length}명`,
    `의미: ${group.description}`,
    "근거 예시:",
    formatFitSamples({
      contextByTalentId,
      rows: samples.get(group.key) ?? [],
    }),
    "",
  ]);

  return [
    "[Role 및 운영 상태]",
    `Role: ${text(args.role.name) || "이름 없음"}`,
    `저장된 상태: ${valueOrMissing(args.role.status)}`,
    `만료 표시: ${args.role.isExpired ? "만료됨" : "만료되지 않음"}`,
    `만료 예정 시각: ${valueOrMissing(args.role.expiresAt)}`,
    `자동 매칭: ${automaticMatching(args.role.automaticMatchingEnabled)}`,
    `근무 위치: ${valueOrMissing(args.role.location)}`,
    `근무 방식: ${valueOrMissing(args.role.workMode)}`,
    `고용 형태: ${
      employmentTypes.length > 0
        ? employmentTypes.join(", ")
        : "등록 정보 없음"
    }`,
    `회사에 등록된 보상 범위: ${companySalary(args.role)}`,
    `Role 최종 수정 시각: ${args.role.updatedAt}`,
    "",
    "[조회 기준]",
    `결과 생성 시각: ${args.generatedAt}`,
    "같은 후보자의 기록이 여러 개면 가장 최근 판단과 가장 최근 공식 추천 기록 하나만 사용함.",
    `가장 최근 적합도 판단 시각: ${latestEvaluationAt(fits)}`,
    ...(fitsAfterRoleUpdate === null
      ? ["Role 수정 시각과 적합도 판단 시각의 선후 관계: 비교할 수 없음"]
      : [
          `Role 최종 수정 시각과 같거나 그 이후에 판단된 후보자: ${fitsAfterRoleUpdate.length}명`,
          `Role 최종 수정 시각보다 앞서 판단된 후보자: ${fits.length - fitsAfterRoleUpdate.length}명`,
        ]),
    "",
    "[현재 매칭 현황 — 회사 답변용 내부 근거]",
    `적합도 판단 기록이 있는 고유 후보자: ${fits.length}명`,
    `현재 추천 대상으로 저장된 고유 후보자: ${selectedFits.length}명`,
    `이 Role의 공식 추천 기록이 있는 고유 후보자: ${recommendations.length}명`,
    `공식 추천 기록 중 후보자 긍정 반응: ${positiveResponses.length}명`,
    `공식 추천 기록 중 후보자 거절 반응: ${negativeResponses.length}명`,
    `공식 추천 기록 중 후보자 반응 기록 없음: ${noRecordedResponses.length}명`,
    `공식 추천 기록 중 열람 기록 있음: ${viewedRecommendations.length}명`,
    `현재 추천 대상으로 저장됐지만 이 Role의 공식 추천 기록은 없는 후보자: ${selectedWithoutRecommendation.length}명`,
    "",
    "[최근 공식 추천 기록 예시]",
    formatRecommendationExamples({
      contextByTalentId,
      recommendations,
    }),
    "",
    "[회사 조정 또는 추가 확인으로 달라질 수 있는 근접 후보]",
    ...groupSections,
    "[후보자 거절 이유]",
    formatDeclineReasons({
      contextByTalentId,
      recommendations,
    }),
    "",
    "[정확성 경계]",
    "- 적합도 판단 기록은 후보자에게 연락했거나 Role을 보여줬다는 뜻이 아니다.",
    "- 현재 추천 대상으로 저장됐다는 것은 평가 단계의 선택 기록이다. 추천 발송 예약이나 전달 완료를 뜻하지 않으며, 공식 추천 기록이 없다고 해서 처리 실패라고 단정하지 않는다.",
    "- 공식 추천 기록은 Role 추천이 생성됐다는 사실만 뜻한다. 별도의 발송 성공 기록이 없으므로 이메일·메시지가 실제 전달됐다고 단정하지 않는다.",
    "- 열람 기록이 없다는 것은 보지 않았다는 증거가 아니며, 후보자 반응 기록이 없다는 것은 거절이 아니다.",
    "- 후보자의 긍정 반응은 후보자 측 의사만 뜻한다. 회사에 후보자 정보가 공유됐거나 연결이 시작됐다는 뜻이 아니다.",
    "- 상호 적합 판단 후 미선택 후보의 판단 근거는 비추천 사유가 아닐 수 있다. 별도 근거 없이 미선택 원인을 추정하지 않는다.",
    "- Role 수정 전의 판단 기록은 현재 Role 조건을 반영했다고 단정하지 않는다. 수정 이후 판단 기록의 범위를 함께 확인한다.",
    "- 표본이 적거나 근거가 서로 다르면 Role 전체의 반복 패턴이라고 일반화하지 않는다.",
    "",
    "[회사 답변 작성 지침]",
    "- 회사의 실제 질문에 답하는 데 필요한 사실만 골라 사용한다. 이 결과를 항목별로 낭독하지 않는다.",
    "- 정확한 인원 수, 비율, 내부 평가명, 점수, 식별자, 데이터 필드명을 회사에 말하지 않는다. 규모와 흐름은 정성적으로 설명한다.",
    "- 회사가 채용 조건을 조정하거나 판단하는 데 도움이 되는 반복적이고 조정 가능한 이유를 우선한다. 도움이 되지 않는 개인적 사유나 단순한 후보자 약점은 언급하지 않는다.",
    "- 후보자의 이름·연락처·정확한 희망 보상·사적인 조건은 말하지 않는다. 꼭 도움이 될 때만 최근 등록 경력이나 프로필 소개를 가볍게 언급하고, 현재 재직 중이라고 단정하지 않는다.",
    "- 회사가 직접 등록한 Role 조건과 보상 범위는 정확히 말해도 되지만, 후보자 금액은 비공개 상태로 유지하고 차이의 방향이나 조정 가능성만 자연스럽게 설명한다.",
    "- 기록된 판단 근거와 거절 이유를 후보자의 직접 발언처럼 인용하지 말고, 회사에 유용한 의미만 신중하게 요약한다.",
    "- 공식 추천 생성, 전달, 열람, 후보자 반응, 회사 공유와 연결 진행을 서로 구분한다. 근거가 없는 단계는 일어났다고 말하지 않는다.",
    "- 데이터가 없거나 충분하지 않으면 원인을 만들어내지 말고, 현재 확인 가능한 범위가 제한적이라고 솔직하게 말한다.",
  ].join("\n");
}
