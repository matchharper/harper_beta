export enum OpportunityType {
  ExternalJd = "external_jd",
  InternalRecommendation = "internal_recommendation",
  IntroRequest = "intro_request",
}

export const OPPORTUNITY_TYPES = Object.values(
  OpportunityType
) as OpportunityType[];

const OPPORTUNITY_TYPE_SORT_PRIORITY: Record<OpportunityType, number> = {
  [OpportunityType.ExternalJd]: 2,
  [OpportunityType.InternalRecommendation]: 1,
  [OpportunityType.IntroRequest]: 0,
};

export const isOpportunityType = (value: unknown): value is OpportunityType =>
  OPPORTUNITY_TYPES.includes(value as OpportunityType);

export const getOpportunityTypeSortPriority = (
  opportunityType: OpportunityType
) => OPPORTUNITY_TYPE_SORT_PRIORITY[opportunityType];

type NewOpportunityHistoryOrderItem = {
  id: string;
  isInternal: boolean;
  opportunityType: OpportunityType;
  recommendedAt: string;
};

export const compareNewOpportunityHistoryOrder = (
  left: NewOpportunityHistoryOrderItem,
  right: NewOpportunityHistoryOrderItem
) =>
  Number(right.isInternal) - Number(left.isInternal) ||
  getOpportunityTypeSortPriority(left.opportunityType) -
    getOpportunityTypeSortPriority(right.opportunityType) ||
  Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt) ||
  left.id.localeCompare(right.id);

export const paginateNewOpportunityHistory = <
  T extends NewOpportunityHistoryOrderItem,
>(
  items: readonly T[],
  offset: number,
  limit: number
) => {
  const orderedItems = [...items].sort(compareNewOpportunityHistoryOrder);
  const pageItems = orderedItems.slice(offset, offset + limit);

  return {
    items: pageItems,
    nextOffset:
      offset + pageItems.length < orderedItems.length
        ? offset + pageItems.length
        : null,
  };
};

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
