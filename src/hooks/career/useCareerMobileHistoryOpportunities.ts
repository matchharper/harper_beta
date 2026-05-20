import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  getCareerDefaultSavedStage,
  getCareerOpportunitySortPriority,
} from "@/components/career/opportunityTypeMeta";
import type {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityCounts,
  CareerHistoryOpportunityPageFilter,
} from "@/components/career/types";

export type CareerMobileHistoryJobsTab =
  | "new"
  | "saved"
  | "archived"
  | "connected";

const compareRecommendedAtDesc = (
  left: CareerHistoryOpportunity,
  right: CareerHistoryOpportunity
) => Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt);

const getResolvedSavedStage = (item: CareerHistoryOpportunity) =>
  item.savedStage ?? getCareerDefaultSavedStage(item.opportunityType);

const getHistoryFilterForJobsTab = (
  tab: CareerMobileHistoryJobsTab
): CareerHistoryOpportunityPageFilter => {
  if (tab === "saved") {
    return { historyTab: "saved", savedStage: "saved" };
  }
  if (tab === "connected") {
    return { historyTab: "saved", savedStage: "connected" };
  }
  if (tab === "archived") {
    return { historyTab: "archived" };
  }
  return { historyTab: "new" };
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
  if (tab === "archived") return counts.archived;
  return (
    counts.savedStages.applied +
    counts.savedStages.connected +
    counts.savedStages.closed
  );
};

const isOpportunityInJobsTab = (
  item: CareerHistoryOpportunity,
  tab: CareerMobileHistoryJobsTab
) => {
  if (tab === "new") return item.feedback === null;
  if (tab === "archived") return item.feedback === "negative";
  if (item.feedback !== "positive") return false;

  const savedStage = getResolvedSavedStage(item);
  if (tab === "connected") return savedStage !== "saved";
  return savedStage === "saved";
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
  const filter = useMemo(
    () => getHistoryFilterForJobsTab(activeTab),
    [activeTab]
  );
  const filterKey = useMemo(() => getHistoryFilterKey(filter), [filter]);
  const totalCount = getJobsTabTotal(activeTab, historyOpportunityCounts);
  const opportunities = useMemo(
    () =>
      historyOpportunities
        .filter((item) => isOpportunityInJobsTab(item, activeTab))
        .sort(sortOpportunitiesForJobsTab(activeTab)),
    [activeTab, historyOpportunities]
  );
  const hasMore = opportunities.length < totalCount;

  const loadMore = useCallback(() => {
    if (!hasMore || historyLoading || historyLoadingMore) return;
    void onLoadMoreHistoryOpportunities(filter);
  }, [
    filter,
    hasMore,
    historyLoading,
    historyLoadingMore,
    onLoadMoreHistoryOpportunities,
  ]);

  useEffect(() => {
    if (!hasMore || opportunities.length > 0) return;
    if (historyLoading || historyLoadingMore) return;
    if (requestedInitialPageKeysRef.current.has(filterKey)) return;

    requestedInitialPageKeysRef.current.add(filterKey);
    void onLoadMoreHistoryOpportunities(filter);
  }, [
    filter,
    filterKey,
    hasMore,
    historyLoading,
    historyLoadingMore,
    onLoadMoreHistoryOpportunities,
    opportunities.length,
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
