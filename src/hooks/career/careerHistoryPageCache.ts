import type { InfiniteData } from "@tanstack/react-query";
import type {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityPageFilter,
} from "@/components/career/types";
import {
  getDefaultSavedStage,
  getHistoryOpportunityBucket,
} from "@/hooks/career/careerSessionData";

type CareerHistoryPageLike = {
  items: CareerHistoryOpportunity[];
};

const isHistoryOpportunityInFilter = (
  item: CareerHistoryOpportunity,
  filter: CareerHistoryOpportunityPageFilter
) => {
  const bucket = getHistoryOpportunityBucket(item);
  if (filter.historyTab !== "saved") return bucket === filter.historyTab;
  if (bucket !== "saved") return false;

  const stage = item.savedStage ?? getDefaultSavedStage(item);
  if (filter.savedStage === "all") return stage !== "hidden";
  if (filter.savedStage) return stage === filter.savedStage;
  return true;
};

export const getLoadedHistoryFilterCount = <
  TPage extends CareerHistoryPageLike,
>(
  current: InfiniteData<TPage, number> | undefined,
  filter: CareerHistoryOpportunityPageFilter
) => {
  const seen = new Set<string>();
  let loadedCount = 0;

  for (const page of current?.pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (isHistoryOpportunityInFilter(item, filter)) {
        loadedCount += 1;
      }
    }
  }

  return loadedCount;
};

export const getLoadedHistoryFilterPageOffset = <
  TPage extends CareerHistoryPageLike,
>(
  current: InfiniteData<TPage, number> | undefined,
  filter: CareerHistoryOpportunityPageFilter,
  pageSize: number
) =>
  Math.floor(getLoadedHistoryFilterCount(current, filter) / pageSize) *
  pageSize;

export const mergeRefreshedHistoryFirstPage = <
  TPage extends CareerHistoryPageLike,
>(
  current: InfiniteData<TPage, number> | undefined,
  refreshedPage: TPage
): InfiniteData<TPage, number> => {
  if (!current || current.pages.length === 0) {
    return {
      pages: [refreshedPage],
      pageParams: [0],
    };
  }

  // The refreshed page is filtered and partial, while the initial session page
  // can contain every history bucket. Absence from the refresh is not deletion.
  const refreshedIds = new Set(refreshedPage.items.map((item) => item.id));
  const preservedItems = current.pages[0].items.filter(
    (item) => !refreshedIds.has(item.id)
  );

  return {
    pages: [
      {
        ...refreshedPage,
        items: [...refreshedPage.items, ...preservedItems],
      },
      ...current.pages.slice(1),
    ],
    pageParams: current.pageParams.length > 0 ? current.pageParams : [0],
  };
};
