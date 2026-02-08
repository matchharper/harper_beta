// components/result/ResultBody.tsx
import React from "react";
import CandidateViews from "@/components/CandidateViews";
import { logger } from "@/utils/logger";
import { useMessages } from "@/i18n/useMessage";

type Props = {
  searchEnabled: boolean;
  items: any[];
  userId?: string;
  isLoading: boolean;
  pageIdx: number;
  pageIdxRaw: number;
  maxPrefetchPages: number;
  canPrev: boolean;
  canNext: boolean;
  isFetchingNextPage: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  criterias: string[];
  nextWillCharge: boolean;
};

export default function ResultBody(props: Props) {
  const { m } = useMessages();
  const {
    searchEnabled,
    items,
    userId,
    isLoading,
    pageIdx,
    pageIdxRaw,
    maxPrefetchPages,
    canPrev,
    canNext,
    isFetchingNextPage,
    onPrevPage,
    onNextPage,
    criterias,
    nextWillCharge,
  } = props;

  if (!searchEnabled) {
    return (
      <div className="w-full px-4 py-12 text-sm text-hgray600">
        {m.search.resultBody.emptyPrompt}
      </div>
    );
  }

  const isNoResultAtall = pageIdx === 0 && items.length === 0 && !isLoading;

  logger.log("nextWillCharge ", nextWillCharge)

  return (
    <div className="flex flex-col w-full h-full">
      <div className="w-full px-4">
        {userId && (
          <CandidateViews
            items={items}
            userId={userId}
            criterias={criterias}
          />
        )}
      </div>
      {
        !isLoading &&
        !isNoResultAtall && (
          <div className="flex items-center justify-center w-full py-16 flex-col">
            <div className="text-sm text-white">
              {m.search.resultBody.page.replace("{page}", String(pageIdx + 1))}
              {isFetchingNextPage ? m.search.resultBody.loadingSuffix : ""}
              {pageIdxRaw > maxPrefetchPages ? (
                <span className="ml-2 text-xgray400">
                  {m.search.resultBody.capped.replace(
                    "{cap}",
                    String(maxPrefetchPages + 1)
                  )}
                </span>
              ) : null}
            </div>

            <div className="flex items-center justify-center gap-1 flex-row mt-2 text-sm">
              <button
                type="button"
                onClick={onPrevPage}
                disabled={!canPrev}
                className={`flex items-center justify-center px-8 minw-16 h-16 rounded-sm border border-xgray400 hover:opacity-90 ${canPrev ? "cursor-pointer" : "opacity-40 cursor-not-allowed"
                  }`}
              >
                {m.search.resultBody.previous}
              </button>

              <button
                type="button"
                onClick={onNextPage}
                disabled={!canNext || isFetchingNextPage}
                className={`flex items-center justify-center px-8 minw-16 h-16 bg-accenta1 text-black rounded-sm hover:opacity-90 ${canNext && !isFetchingNextPage
                  ? "cursor-pointer"
                  : "opacity-40 cursor-not-allowed"
                  }`}
              >
                <div>
                  {m.search.resultBody.next}
                  {nextWillCharge
                    ? m.search.resultBody.credit.withCredit
                    : m.search.resultBody.credit.noCredit}
                </div>
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
