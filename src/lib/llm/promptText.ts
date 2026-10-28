import { projectLlmDateTimes } from "./promptDateTime";

const labels: Record<string, string> = {
  companySummary: "회사 요약", companyHiringRequest: "회사 내부 채용 요청", careerUrl: "채용 페이지", source: "정보 출처",
  name: "이름", description: "설명", company: "회사 정보", about: "회사 소개",
  companyInformationDocument: "회사 소개 문서", companyFacts: "확인된 회사 정보",
  hiringBrief: "기존 비공개 채용 기준", existingCriteria: "기존 평가 기준",
  locationText: "근무지", workMode: "근무 형태", employmentTypes: "고용 형태", salaryRange: "보상",
  company_name: "회사명", company_description: "회사 설명", short_description: "회사 개요",
  pitch: "회사 소개", request: "요청", workspace_request: "회사 공통 채용 요청",
  founded_year: "설립 연도", employee_count_range: "팀원 수 범위", start: "하한", end: "상한",
  total_funding_raised: "누적 투자 유치액 (저장된 금액·통화)", main_investors: "주요 투자자",
  investors: "투자자", last_funding_stage: "최근 투자 단계", last_funding_round_description: "최근 투자 설명",
  specialities: "전문 분야", location: "소재지", funding_url: "투자 정보 출처",
  homepageUrl: "홈페이지", linkedinUrl: "LinkedIn", relatedLinks: "참고 링크",
  summary: "찾는 인재상", hardConditions: "필수 조건", criteria: "평가 기준", otherNotes: "기타 참고 사항",
  question: "질문", why: "질문 이유", chips: "선택지", label: "내용", status: "상태",
  freeText: "팀원의 답변 원문", chip: "선택한 답변", answer: "답변", importance: "중요도",
  signals: "등급별 판단 근거", excellent: "매우 잘 맞음", good: "잘 맞음", uncertain: "확인 필요", bad: "확인된 불일치",
  keywords: "검색 키워드", matchingTitles: "같은 업무의 직함", nearMissTitles: "구분할 인접 직함",
  id: "참조 ID", criterionId: "평가 기준 ID", conditionId: "필수 조건 ID", evidence: "확인 근거",
  ASKED: "이미 제시한 질문", DRAFTED: "새 질문 후보", ANSWERED: "이미 받은 답변",
  givenChips: "기존 선택지", context: "참고 맥락", role: "역할", members: "팀원",
};

/** Model-only readable projection. Authored strings and machine identifiers stay exact. */
export function formatPromptText(value: unknown): string {
  function render(item: unknown, depth: number): string {
    const indent = "  ".repeat(depth);
    if (item === null || item === undefined) return "미확인";
    if (typeof item === "boolean") return item ? "예" : "아니요";
    if (Array.isArray(item)) return item.length
      ? item.map((entry, index) => `${indent}- 항목 ${index} (0부터): ${render(entry, depth + 1)}`).join("\n")
      : "없음";
    if (typeof item === "object") return Object.entries(item)
      .map(([key, entry]) => `${indent}${labels[key] ?? key}: ${typeof entry === "object" && entry !== null && Object.keys(entry).length > 0 ? "\n" : ""}${render(entry, depth + 1)}`)
      .join("\n") || "없음";
    return String(item);
  }
  return render(projectLlmDateTimes(value), 0);
}

/** Prefer the tool's purpose-built model projection; never serialize the transport object as JSON. */
export function formatToolResultText(value: unknown): string {
  if (value && typeof value === "object" && "modelOutput" in value
    && typeof value.modelOutput === "string" && value.modelOutput.trim()) return value.modelOutput;
  return formatPromptText(value);
}
