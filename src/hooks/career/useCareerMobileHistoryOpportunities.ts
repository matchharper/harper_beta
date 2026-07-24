import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  getCareerDefaultSavedStage,
  getCareerOpportunitySortPriority,
} from "@/components/career/opportunityTypeMeta";
import { getSavedOpportunityManagementStatus } from "@/components/career/history/savedOpportunityStatus";
import { getHistoryOpportunityBucket } from "@/hooks/career/careerSessionData";
import type {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityCounts,
  CareerHistoryOpportunityPageFilter,
  CareerOpportunitySavedStage,
} from "@/components/career/types";

export type CareerMobileHistoryJobsTab =
  | "new"
  | "saved"
  | "applied"
  | "connected"
  | "closed"
  | "hidden"
  | "archived";

const CAREER_MOBILE_HISTORY_INITIAL_PAGE_SIZE = 10;

const compareRecommendedAtDesc = (
  left: CareerHistoryOpportunity,
  right: CareerHistoryOpportunity
) => Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt);

const getHistoryFiltersForJobsTab = (
  tab: CareerMobileHistoryJobsTab
): CareerHistoryOpportunityPageFilter[] => {
  if (tab === "saved") {
    return [{ historyTab: "saved", savedStage: "saved" }];
  }
  if (tab === "applied") {
    return [{ historyTab: "saved", savedStage: "applied" }];
  }
  if (tab === "connected") {
    return [{ historyTab: "saved", savedStage: "connected" }];
  }
  if (tab === "closed") {
    return [{ historyTab: "saved", savedStage: "closed" }];
  }
  if (tab === "hidden") {
    return [{ historyTab: "saved", savedStage: "hidden" }];
  }
  if (tab === "archived") {
    return [{ historyTab: "archived" }];
  }
  return [{ historyTab: "new" }];
};

const getHistoryFilterKey = (filter: CareerHistoryOpportunityPageFilter) =>
  filter.historyTab === "saved"
    ? `saved:${filter.savedStage ?? "all"}`
    : filter.historyTab;

const getJobsTabTotal = (
  tab: CareerMobileHistoryJobsTab,
  counts: CareerHistoryOpportunityCounts
) => {
  if (tab === "new") return counts.new;
  if (tab === "saved") return counts.savedStages.saved;
  if (tab === "applied") return counts.savedStages.applied;
  if (tab === "connected") return counts.savedStages.connected;
  if (tab === "closed") return counts.savedStages.closed;
  if (tab === "hidden") return counts.savedStages.hidden;
  return counts.archived;
};

const isOpportunityInJobsTab = (
  item: CareerHistoryOpportunity,
  tab: CareerMobileHistoryJobsTab
) => {
  const bucket = getHistoryOpportunityBucket(item);
  if (tab === "new") return bucket === "new";
  if (tab === "archived") return bucket === "archived";
  if (bucket !== "saved") return false;
  const status = getSavedOpportunityManagementStatus(item);
  if (tab === "saved") return status === "saved";
  return status === tab;
};

const getSavedStageLoadedCount = (
  items: CareerHistoryOpportunity[],
  stage: CareerOpportunitySavedStage
) =>
  items.filter(
    (item) =>
      getHistoryOpportunityBucket(item) === "saved" &&
      (item.savedStage ?? getCareerDefaultSavedStage(item.opportunityType)) ===
        stage
  ).length;

const getSavedOpenLoadedCount = (items: CareerHistoryOpportunity[]) =>
  items.filter((item) => {
    if (getHistoryOpportunityBucket(item) !== "saved") return false;
    const stage =
      item.savedStage ?? getCareerDefaultSavedStage(item.opportunityType);
    return stage !== "hidden";
  }).length;

const getFilterLoadedCount = (
  items: CareerHistoryOpportunity[],
  filter: CareerHistoryOpportunityPageFilter
) => {
  if (filter.historyTab === "new") {
    return items.filter((item) => getHistoryOpportunityBucket(item) === "new")
      .length;
  }
  if (filter.historyTab === "archived") {
    return items.filter(
      (item) => getHistoryOpportunityBucket(item) === "archived"
    ).length;
  }
  if (filter.savedStage === "all") return getSavedOpenLoadedCount(items);
  if (filter.savedStage)
    return getSavedStageLoadedCount(items, filter.savedStage);
  return items.filter((item) => getHistoryOpportunityBucket(item) === "saved")
    .length;
};

const getFilterTotal = (
  filter: CareerHistoryOpportunityPageFilter,
  counts: CareerHistoryOpportunityCounts
) => {
  if (filter.historyTab === "new") return counts.new;
  if (filter.historyTab === "archived") return counts.archived;
  if (filter.savedStage === "all") {
    return Math.max(0, counts.saved - counts.savedStages.hidden);
  }
  if (filter.savedStage) return counts.savedStages[filter.savedStage];
  return counts.saved;
};

const sortOpportunitiesForJobsTab =
  (tab: CareerMobileHistoryJobsTab) =>
  (left: CareerHistoryOpportunity, right: CareerHistoryOpportunity) => {
    if (tab === "new") {
      return (
        Number(right.isInternal) - Number(left.isInternal) ||
        getCareerOpportunitySortPriority(left.opportunityType) -
          getCareerOpportunitySortPriority(right.opportunityType) ||
        compareRecommendedAtDesc(left, right)
      );
    }

    return compareRecommendedAtDesc(left, right);
  };

export function useCareerMobileHistoryOpportunities(args: {
  activeTab: CareerMobileHistoryJobsTab;
  historyLoading: boolean;
  historyLoadingMore: boolean;
  historyOpportunities: CareerHistoryOpportunity[];
  historyOpportunityCounts: CareerHistoryOpportunityCounts;
  onLoadMoreHistoryOpportunities: (
    filter?: CareerHistoryOpportunityPageFilter
  ) => void | Promise<void>;
}) {
  const {
    activeTab,
    historyLoading,
    historyLoadingMore,
    historyOpportunities,
    historyOpportunityCounts,
    onLoadMoreHistoryOpportunities,
  } = args;
  const requestedInitialPageKeysRef = useRef<Set<string>>(new Set());
  const filters = useMemo(
    () => getHistoryFiltersForJobsTab(activeTab),
    [activeTab]
  );
  const totalCount = getJobsTabTotal(activeTab, historyOpportunityCounts);
  const opportunities = useMemo(
    () =>
      historyOpportunities
        .filter((item) => isOpportunityInJobsTab(item, activeTab))
        .sort(sortOpportunitiesForJobsTab(activeTab)),
    [activeTab, historyOpportunities]
  );
  const nextLoadFilter = useMemo(
    () =>
      filters.find(
        (candidate) =>
          getFilterLoadedCount(historyOpportunities, candidate) <
          getFilterTotal(candidate, historyOpportunityCounts)
      ) ?? null,
    [filters, historyOpportunities, historyOpportunityCounts]
  );
  const hasMore = Boolean(nextLoadFilter);

  const loadMore = useCallback(() => {
    if (!nextLoadFilter || historyLoading || historyLoadingMore) return;
    void onLoadMoreHistoryOpportunities(nextLoadFilter);
  }, [
    historyLoading,
    historyLoadingMore,
    nextLoadFilter,
    onLoadMoreHistoryOpportunities,
  ]);

  useEffect(() => {
    if (
      !hasMore ||
      opportunities.length >=
        Math.min(totalCount, CAREER_MOBILE_HISTORY_INITIAL_PAGE_SIZE)
    ) {
      return;
    }
    if (historyLoading || historyLoadingMore) return;

    const filterToLoad = filters.find((candidate) => {
      const filterKey = getHistoryFilterKey(candidate);
      return (
        !requestedInitialPageKeysRef.current.has(filterKey) &&
        getFilterLoadedCount(historyOpportunities, candidate) <
          getFilterTotal(candidate, historyOpportunityCounts)
      );
    });
    if (!filterToLoad) return;

    requestedInitialPageKeysRef.current.add(getHistoryFilterKey(filterToLoad));
    void onLoadMoreHistoryOpportunities(filterToLoad);
  }, [
    filters,
    hasMore,
    historyLoading,
    historyLoadingMore,
    historyOpportunities,
    historyOpportunityCounts,
    onLoadMoreHistoryOpportunities,
    opportunities.length,
    totalCount,
  ]);

  return {
    hasMore,
    isLoading:
      historyLoading ||
      historyLoadingMore ||
      (totalCount > 0 && opportunities.length === 0),
    loadMore,
    opportunities,
    totalCount,
  };
}
