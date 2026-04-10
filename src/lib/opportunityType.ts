export enum OpportunityType {
  ExternalJd = "external_jd",
  InternalRecommendation = "internal_recommendation",
  IntroRequest = "intro_request",
}

export const OPPORTUNITY_TYPES = Object.values(
  OpportunityType
) as OpportunityType[];

export const isOpportunityType = (value: unknown): value is OpportunityType =>
  OPPORTUNITY_TYPES.includes(value as OpportunityType);

export const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  [OpportunityType.ExternalJd]: "하퍼가 발견한 기회",
  [OpportunityType.InternalRecommendation]: "Harper의 연결 제안",
  [OpportunityType.IntroRequest]: "직접 연결 요청",
};

export const OPPORTUNITY_TYPE_SHORT_LABEL: Record<OpportunityType, string> = {
  [OpportunityType.ExternalJd]: "Web Sourced",
  [OpportunityType.InternalRecommendation]: "회사 추천",
  [OpportunityType.IntroRequest]: "Intro 요청",
};
