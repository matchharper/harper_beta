import { useOrgBoard, useOrgTalentDetail } from "@/hooks/org/useOrg";

export function useOrgJobsBoardData(args: {
  nameQuery: string;
  recommendedFromDate: string;
  recommendedToDate: string;
  selectedRoleId: string | null;
  workspaceId: string;
}) {
  const boardQuery = useOrgBoard({
    query: args.selectedRoleId ? args.nameQuery : "",
    recommendedFromDate: args.selectedRoleId ? args.recommendedFromDate : "",
    recommendedToDate: args.selectedRoleId ? args.recommendedToDate : "",
    roleId: args.selectedRoleId,
    workspaceId: args.workspaceId,
  });

  return { boardQuery };
}

export function useOrgJobsDetailData(args: {
  detailRecommendationId: string;
  detailRoleId: string;
  detailTalentId: string;
  workspaceId: string;
}) {
  const activeDetailTalentId = args.detailTalentId;
  const activeDetailRecommendationId = args.detailRecommendationId;
  const activeDetailRoleId = args.detailRoleId;
  const detailOpen = Boolean(activeDetailTalentId);
  const detailQuery = useOrgTalentDetail({
    enabled: detailOpen,
    recommendationId: activeDetailRecommendationId || null,
    roleId: activeDetailRoleId || null,
    talentId: activeDetailTalentId || null,
    workspaceId: args.workspaceId,
  });

  return {
    activeDetailRecommendationId,
    activeDetailRoleId,
    activeDetailTalentId,
    detailOpen,
    detailQuery,
    selectedAcceptStageId: detailOpen ? ("connected" as const) : null,
  };
}
