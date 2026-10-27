import { useMemo } from "react";
import { useOrgRoleInbox, type OrgRoleInboxFilters } from "./useOrgRoleInbox";
import { isOrgCandidateProfilePreview } from "@/lib/org/candidatePreview";
import type { OrgCandidateDetailResult } from "@/lib/org/candidatePreview";
import {
  useOrgBoard,
  useOrgBoardProfileLabels,
  useOrgTalentDetail,
} from "@/hooks/org/useOrg";

export function useOrgJobsBoardData(args: {
  selectedRoleId: string | null;
  workspaceId: string;
  inbox?: OrgRoleInboxFilters & { enabled: boolean };
}) {
  const fullBoardQuery = useOrgBoard({
    enabled: !args.inbox,
    roleId: args.selectedRoleId,
    workspaceId: args.workspaceId,
  });
  const inboxQuery = useOrgRoleInbox({
    workspaceId: args.workspaceId,
    roleId: args.selectedRoleId,
    stage: args.inbox?.stage ?? "pending_connection",
    sort: args.inbox?.sort ?? "latest",
    enabled: Boolean(args.inbox?.enabled),
  });
  const inboxBoard = useMemo(() => {
    const pages = inboxQuery.data?.pages;
    if (!pages?.length) return undefined;
    const seen = new Set<string>();
    return {
      ...pages[0],
      items: pages
        .flatMap((page) => page.items)
        .filter((item) => {
          if (seen.has(item.recommendationId)) return false;
          seen.add(item.recommendationId);
          return true;
        }),
    };
  }, [inboxQuery.data]);
  const boardQuery = args.inbox
    ? { ...inboxQuery, data: inboxBoard }
    : fullBoardQuery;
  const recommendationIds = useMemo(
    () => boardQuery.data?.items.map((item) => item.recommendationId) ?? [],
    [boardQuery.data?.items]
  );
  const profileLabelsQuery = useOrgBoardProfileLabels({
    enabled:
      !args.inbox && boardQuery.isSuccess && Boolean(args.selectedRoleId),
    recommendationIds,
    workspaceId: args.workspaceId,
  });
  const board = useMemo(() => {
    if (args.inbox || !boardQuery.data || !profileLabelsQuery.data)
      return boardQuery.data;
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
  }, [args.inbox, boardQuery.data, profileLabelsQuery.data]);

  return {
    board,
    boardQuery,
    inboxQuery: args.inbox ? inboxQuery : undefined,
    profileLabelsError: profileLabelsQuery.isError,
    profileLabelsLoading:
      !args.inbox &&
      Boolean(args.selectedRoleId) &&
      recommendationIds.length > 0 &&
      profileLabelsQuery.isPending,
    profileLabelsQuery,
  };
}

export function useOrgJobsDetailData(args: {
  batchDetail?: OrgCandidateDetailResult;
  batchLoading?: boolean;
  detailRecommendationId: string;
  detailRoleId: string;
  detailTalentId: string;
  workspaceId: string;
}) {
  const activeDetailTalentId = args.detailTalentId;
  const activeDetailRecommendationId = args.detailRecommendationId;
  const activeDetailRoleId = args.detailRoleId;
  const detailOpen = Boolean(activeDetailTalentId);
  const candidateQuery = useOrgTalentDetail({
    enabled: detailOpen && !args.batchLoading,
    // Navigation within a prepared batch is a cache read. Explicit mutation
    // invalidation still refreshes affected details and the batch normally.
    staleTime: args.batchDetail ? Infinity : undefined,
    initialData: args.batchDetail,
    recommendationId: activeDetailRecommendationId || null,
    roleId: activeDetailRoleId || null,
    talentId: activeDetailTalentId || null,
    workspaceId: args.workspaceId,
  });
  const profilePreview = isOrgCandidateProfilePreview(candidateQuery.data)
    ? candidateQuery.data
    : undefined;
  const detailQuery = {
    ...candidateQuery,
    data: isOrgCandidateProfilePreview(candidateQuery.data)
      ? undefined
      : candidateQuery.data,
  };

  return {
    activeDetailRecommendationId,
    activeDetailRoleId,
    activeDetailTalentId,
    detailOpen,
    detailQuery,
    profilePreview,
    selectedAcceptStageId: detailOpen ? ("connected" as const) : null,
  };
}
