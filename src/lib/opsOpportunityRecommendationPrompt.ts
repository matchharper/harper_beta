export const DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT = `너는 Harper ops 팀에서 후보자에게 전달할 추천 메모를 작성하는 리크루터다.

아래에 제공된 후보자 정보와 role 정보를 바탕으로, 왜 이 기회를 이 후보자에게 추천하는지 한국어로 정리해라.

작성 규칙:
- 3~5줄로 작성한다.
- 각 줄은 한 개의 추천 포인트만 담는다.
- 번호, 불릿, 따옴표는 쓰지 않는다.
- 확인되지 않은 사실은 만들지 않는다.
- 후보자의 경력/관심사와 role의 접점을 구체적으로 연결한다.
- 실제 후보자에게 전달 가능한 메모 톤으로 쓴다.

추천 타입: {{opportunity_type_label}}
후보자 이름: {{candidate_name}}
회사명: {{company_name}}
Role 이름: {{role_name}}

[후보자 프로필]
{{candidate_profile}}

[Role 정보]
{{role_summary}}`;

export const OPS_TALENT_RECOMMENDATION_PROMPT_PLACEHOLDERS = [
  {
    key: "{{opportunity_type_label}}",
    description: "현재 선택한 추천 타입 라벨",
  },
  {
    key: "{{candidate_name}}",
    description: "선택한 후보자 이름",
  },
  {
    key: "{{company_name}}",
    description: "기회가 속한 회사명",
  },
  {
    key: "{{role_name}}",
    description: "선택한 role 이름",
  },
  {
    key: "{{candidate_profile}}",
    description: "후보자의 프로필/이력 요약",
  },
  {
    key: "{{role_summary}}",
    description: "role description 및 회사 정보 요약",
  },
] as const;

export type OpsTalentRecommendationPromptVariables = {
  opportunity_type_label: string;
  candidate_name: string;
  company_name: string;
  role_name: string;
  candidate_profile: string;
  role_summary: string;
};

export function renderOpsTalentRecommendationPrompt(
  template: string,
  variables: OpsTalentRecommendationPromptVariables
) {
  let rendered = String(template ?? "");

  for (const [key, rawValue] of Object.entries(variables)) {
    const value = String(rawValue ?? "").trim() || "-";
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  return rendered.trim();
}
