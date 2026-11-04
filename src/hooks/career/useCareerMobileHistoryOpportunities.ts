import { useCallback, useEffect, useMemo } from "react";
import { getSavedOpportunityManagementStatus } from "@/components/career/history/savedOpportunityStatus";
import {
  getHistoryOpportunityBucket,
  isSavedHistoryOpportunity,
} from "@/hooks/career/careerSessionData";
import {
  compareNewOpportunityHistoryOrder,
  compareSavedOpportunityHistoryOrder,
} from "@/lib/opportunityType";
import type {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityCounts,
  CareerHistoryOpportunityPageFilter,
  CareerHistoryOpportunityPageState,
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

export const getHistoryFiltersForJobsTab = (
  tab: CareerMobileHistoryJobsTab
): CareerHistoryOpportunityPageFilter[] => {
  if (tab === "saved") {
    return [{ historyTab: "saved", savedStage: "saved" }];
  }
  if (tab === "applied") {
    return [
      { historyTab: "saved", savedStage: "applied" },
      { historyTab: "saved", savedStage: "connected" },
      { historyTab: "saved", savedStage: "offer" },
    ];
  }
  if (tab === "connected") {
    return [{ historyTab: "saved", savedStage: "connected" }];
  }
  if (tab === "closed") {
    return [{ historyTab: "saved", savedStage: "closed" }];
  }
  if (tab === "hidden") {
    return [
      { historyTab: "saved", savedStage: "closed" },
      { historyTab: "saved", savedStage: "hidden" },
    ];
  }
  if (tab === "archived") {
    return [{ historyTab: "archived" }];
  }
  return [{ historyTab: "new" }];
};

export const getJobsTabTotal = (
  tab: CareerMobileHistoryJobsTab,
  counts: CareerHistoryOpportunityCounts
) => {
  if (tab === "new") return counts.new;
  if (tab === "saved") return counts.savedStages.saved;
  if (tab === "applied")
    return (
      counts.savedStages.applied +
      counts.savedStages.connected +
      (counts.savedStages.offer ?? 0)
    );
  if (tab === "connected") return counts.savedStages.connected;
  if (tab === "closed") return counts.savedStages.closed;
  if (tab === "hidden")
    return counts.savedStages.closed + counts.savedStages.hidden;
  return counts.archived;
};

export const isOpportunityInJobsTab = (
  item: CareerHistoryOpportunity,
  tab: CareerMobileHistoryJobsTab
) => {
  const bucket = getHistoryOpportunityBucket(item);
  if (tab === "new") return bucket === "new";
  if (tab === "archived") return bucket === "archived";
  if (!isSavedHistoryOpportunity(item)) return false;
  const status = getSavedOpportunityManagementStatus(item);
  if (tab === "saved") return status === "saved";
  if (tab === "applied")
    return status === "applied" || status === "connected" || status === "offer";
  if (tab === "hidden") return status === "closed" || status === "hidden";
  return status === tab;
};

const sortOpportunitiesForJobsTab =
  (tab: CareerMobileHistoryJobsTab) =>
  (left: CareerHistoryOpportunity, right: CareerHistoryOpportunity) => {
    if (tab === "new") {
      return compareNewOpportunityHistoryOrder(left, right);
    }

    return tab === "archived"
      ? compareRecommendedAtDesc(left, right)
      : compareSavedOpportunityHistoryOrder(left, right);
  };

export function useCareerMobileHistoryOpportunities(args: {
  enabled?: boolean;
  loadAllProgress?: boolean;
  historyUpdateError?: string;
  activeTab: CareerMobileHistoryJobsTab;
  historyLoading: boolean;
  historyOpportunities: CareerHistoryOpportunity[];
  historyOpportunityCounts: CareerHistoryOpportunityCounts;
  onLoadMoreHistoryOpportunities: (
    filter?: CareerHistoryOpportunityPageFilter
  ) => void | Promise<void>;
  onLoadSavedStageHistoryOpportunityPages: (
    stages: CareerOpportunitySavedStage[]
  ) => void | Promise<void>;
  getHistoryOpportunityPageFilterState: (
    filter: CareerHistoryOpportunityPageFilter
  ) => CareerHistoryOpportunityPageState | undefined;
}) {
  const {
    enabled = true,
    loadAllProgress = false,
    historyUpdateError = "",
    activeTab,
    historyLoading,
    historyOpportunities,
    historyOpportunityCounts,
    onLoadMoreHistoryOpportunities,
    onLoadSavedStageHistoryOpportunityPages,
    getHistoryOpportunityPageFilterState,
  } = args;
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
  const pages = useMemo(
    () =>
      filters.map((filter) => {
        const state = getHistoryOpportunityPageFilterState(filter);
        if (state) {
          return {
            filter,
            loading: state.loading,
            needsInitialPage: false,
            hasMore: state.nextOffset !== null,
          };
        }
        // Saved tabs always ask the server for their first page. Session counts
        // can be stale; after that the server cursor determines completion.
        if (filter.historyTab === "saved") {
          return {
            filter,
            loading: false,
            needsInitialPage: true,
            hasMore: true,
          };
        }
        const loadedCount = historyOpportunities.filter(
          (item) => getHistoryOpportunityBucket(item) === filter.historyTab
        ).length;
        const count = historyOpportunityCounts[filter.historyTab];
        return {
          filter,
          loading: false,
          needsInitialPage:
            loadedCount <
            Math.min(count, CAREER_MOBILE_HISTORY_INITIAL_PAGE_SIZE),
          hasMore: loadedCount < count,
        };
      }),
    [
      filters,
      getHistoryOpportunityPageFilterState,
      historyOpportunities,
      historyOpportunityCounts,
    ]
  );

  const requestPages = useCallback(
    async (requested: CareerHistoryOpportunityPageFilter[]) => {
      const stages: CareerOpportunitySavedStage[] = [];
      const requests: (void | Promise<void>)[] = [];
      for (const filter of requested) {
        if (
          filter.historyTab === "saved" &&
          filter.savedStage &&
          filter.savedStage !== "all"
        ) {
          stages.push(filter.savedStage);
        } else {
          requests.push(onLoadMoreHistoryOpportunities(filter));
        }
      }
      if (stages.length)
        requests.push(onLoadSavedStageHistoryOpportunityPages(stages));
      await Promise.all(requests);
    },
    [onLoadMoreHistoryOpportunities, onLoadSavedStageHistoryOpportunityPages]
  );

  const loadMore = useCallback(() => {
    if (!enabled || historyLoading) return;
    void requestPages(
      pages
        .filter((page) => page.hasMore && !page.loading)
        .map((page) => page.filter)
    );
  }, [enabled, historyLoading, pages, requestPages]);

  useEffect(() => {
    if (!enabled || historyLoading || historyUpdateError) return;
    const initial = pages.filter(
      (page) =>
        (page.needsInitialPage ||
          (loadAllProgress && activeTab === "applied" && page.hasMore)) &&
        !page.loading
    );
    if (initial.length) void requestPages(initial.map((page) => page.filter));
  }, [
    activeTab,
    enabled,
    historyLoading,
    historyUpdateError,
    loadAllProgress,
    pages,
    requestPages,
  ]);

  return {
    hasMore: pages.some((page) => page.hasMore),
    isLoading:
      enabled &&
      (historyLoading ||
        pages.some((page) => page.loading || page.needsInitialPage)),
    loadMore,
    opportunities,
    totalCount,
  };
}
