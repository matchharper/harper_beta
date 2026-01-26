// components/result/ResultBody.tsx
import React, { useMemo } from "react";
import CandidateViews from "@/components/CandidateViews";

type Props = {
  searchEnabled: boolean;
  items: any[];
  userId?: string;
  queryItem: any;
  isLoading: boolean;
  isQueryDetailLoading: boolean;
  pageIdx: number;
  pageIdxRaw: number;
  maxPrefetchPages: number;
  canPrev: boolean;
  canNext: boolean;
  isFetchingNextPage: boolean;
  runId: string;
  onRunMoreSearch: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  criterias: string[];
};

export default function ResultBody(props: Props) {
  const {
    searchEnabled,
    items,
    userId,
    queryItem,
    isLoading,
    isQueryDetailLoading,
    pageIdx,
    pageIdxRaw,
    maxPrefetchPages,
    canPrev,
    canNext,
    isFetchingNextPage,
    runId,
    onRunMoreSearch,
    onPrevPage,
    onNextPage,
    criterias,
  } = props;

  if (!searchEnabled) {
    return (
      <div className="w-full px-4 py-12 text-sm text-hgray600">
        대화를 마친 뒤 “검색하기”를 누르면 결과가 여기에 표시됩니다.
      </div>
    );
  }

  const isNoResultAtall = pageIdx === 0 && items.length === 0 && !isLoading;

  const isLessResultThan10 =
    pageIdx === 0 && items.length !== 0 && items.length < 10 && !isLoading;

  const isLessThan10 = items.length < 10 && !isLoading;

  return (
    <div className="flex flex-col w-full h-full">
      {userId && (
        <CandidateViews
          items={items}
          userId={userId}
          queryItem={queryItem}
          criterias={criterias ?? []}
        />
      )}
      {!isQueryDetailLoading &&
        !isLoading &&
        !isNoResultAtall &&
        !isLessResultThan10 &&
        !isLessThan10 && (
          <div className="flex items-center justify-center w-full py-16 flex-col">
            <div className="text-sm text-white">
              Page {pageIdx + 1}
              {isFetchingNextPage ? " (loading...)" : ""}
              {pageIdxRaw > maxPrefetchPages ? (
                <span className="ml-2 text-xgray400">
                  (capped to {maxPrefetchPages + 1})
                </span>
              ) : null}
            </div>

            <div className="flex items-center justify-center gap-1 flex-row mt-2">
              <button
                type="button"
                onClick={onPrevPage}
                disabled={!canPrev}
                className={`flex items-center justify-center px-8 minw-16 h-16 rounded-sm border border-xgray400 hover:opacity-90 ${
                  canPrev ? "cursor-pointer" : "opacity-40 cursor-not-allowed"
                }`}
              >
                Previous
              </button>

              <button
                type="button"
                onClick={onNextPage}
                disabled={!canNext || isFetchingNextPage}
                className={`flex items-center justify-center px-8 minw-16 h-16 bg-accenta1 text-black rounded-sm hover:opacity-90 ${
                  canNext && !isFetchingNextPage
                    ? "cursor-pointer"
                    : "opacity-40 cursor-not-allowed"
                }`}
              >
                <div>Search next 10 more</div>
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
