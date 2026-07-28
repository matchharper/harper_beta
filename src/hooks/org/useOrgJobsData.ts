import { useMemo } from "react";
import {
  useOrgBoard,
  useOrgBoardProfileLabels,
  useOrgTalentDetail,
} from "@/hooks/org/useOrg";

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
  const recommendationIds = useMemo(
    () => boardQuery.data?.items.map((item) => item.recommendationId) ?? [],
    [boardQuery.data?.items]
  );
  const profileLabelsQuery = useOrgBoardProfileLabels({
    enabled: boardQuery.isSuccess && Boolean(args.selectedRoleId),
    recommendationIds,
    workspaceId: args.workspaceId,
  });
  const board = useMemo(() => {
    if (!boardQuery.data || !profileLabelsQuery.data) return boardQuery.data;
    const labelsByTalentId = new Map(
      profileLabelsQuery.data.items.map(
        (item) => [item.talentId, item] as const
      )
    );
    return {
      ...boardQuery.data,
      items: boardQuery.data.items.map((item) => {
        const labels = labelsByTalentId.get(item.talentId);
        if (!labels) return item;
        return {
          ...item,
          talent: {
            ...item.talent,
            recentCompanies: labels.recentCompanies,
            recentSchools: labels.recentSchools,
          },
        };
      }),
    };
  }, [boardQuery.data, profileLabelsQuery.data]);

  return {
    board,
    boardQuery,
    profileLabelsError: profileLabelsQuery.isError,
    profileLabelsLoading:
      Boolean(args.selectedRoleId) &&
      recommendationIds.length > 0 &&
      profileLabelsQuery.isPending,
    profileLabelsQuery,
  };
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
