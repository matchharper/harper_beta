// components/result/ResultBody.tsx
import React from "react";
import CandidateViews from "@/components/CandidateViews";
import { useMessages } from "@/i18n/useMessage";
import { SearchSource } from "@/lib/searchSource";

type Props = {
  searchEnabled: boolean;
  items: any[];
  userId?: string;
  isLoading: boolean;
  isSearchInProgress: boolean;
  pageIdx: number;
  pageIdxRaw: number;
  maxPrefetchPages: number;
  canPrev: boolean;
  canNext: boolean;
  isFetchingNextPage: boolean;
  isStreaming: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  criterias: string[];
  sourceType: SearchSource;
};

export default function ResultBody(props: Props) {
  const { m } = useMessages();
  const {
    searchEnabled,
    items,
    userId,
    isLoading,
    isSearchInProgress,
    pageIdx,
    pageIdxRaw,
    maxPrefetchPages,
    canPrev,
    canNext,
    isFetchingNextPage,
    isStreaming,
    onPrevPage,
    onNextPage,
    criterias,
    sourceType,
  } = props;

  if (!searchEnabled) {
    return (
      <div className="w-full px-4 py-12 text-sm text-beige900/55">
        {m.search.resultBody.emptyPrompt}
      </div>
    );
  }

  const isNoResultAtall = pageIdx === 0 && items.length === 0 && !isLoading;

  return (
    <div className="flex flex-col w-full h-full relative">
      <div className="w-full px-0">
        {userId && (
          <CandidateViews
            items={items}
            userId={userId}
            criterias={criterias}
            showShortlistMemo={true}
            showMarkFilter={true}
            isSelectionDisabled={isSearchInProgress}
            indexStart={pageIdx * 10}
            sourceType={sourceType}
          />
        )}
      </div>
      {!isLoading && !isNoResultAtall && (
        <div className={["w-full absolute z-30 bottom-12 left-0"].join(" ")}>
          {/* subtle separator + glass background */}
          <div className="px-4 pb-1 flex items-center justify-center">
            {/* shadow-[0_12px_40px_rgba(0,0,0,0.45)] */}
            <div className="flex rounded-2xl pl-1 bg-black/0 backdrop-blur-md">
              <div className="flex flex-col gap-4 px-2 py-0 md:flex-row md:items-center md:justify-between">
                {/* Left: page label (small, muted) */}
                <div className="flex items-center gap-2 text-sm text-beige900/55">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-beige900/40" />
                    {m.search.resultBody.page.replace(
                      "{page}",
                      String(pageIdx + 1)
                    )}
                  </span>

                  {isFetchingNextPage ? (
                    <span className="text-beige900/50">
                      {m.search.resultBody.loadingSuffix}
                    </span>
                  ) : null}

                  {pageIdxRaw > maxPrefetchPages ? (
                    <span className="ml-2 text-beige900/35">
                      {m.search.resultBody.capped.replace(
                        "{cap}",
                        String(maxPrefetchPages + 1)
                      )}
                    </span>
                  ) : null}
                </div>

                {/* Right: controls */}
                <div className="flex text-[13px] items-center justify-between gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={onPrevPage}
                    disabled={!canPrev}
                    className={[
                      "inline-flex items-center justify-center",
                      "h-11 px-4 md:px-5 rounded-xl",
                      "border border-beige900/8 bg-beige500/55",
                      " text-beige900/80",
                      "transition",
                      canPrev
                        ? "hover:bg-beige500/70 hover:border-beige900/15 active:scale-[0.99]"
                        : "opacity-40 cursor-not-allowed",
                    ].join(" ")}
                  >
                    <span className="mr-2 text-beige900/60">←</span>
                    {m.search.resultBody.previous}
                  </button>

                  <div className="hidden md:block w-px h-8 bg-beige900/10" />

                  <button
                    type="button"
                    onClick={onNextPage}
                    disabled={!canNext || isFetchingNextPage}
                    className={[
                      "inline-flex items-center justify-center",
                      "h-11 px-4 md:px-5 rounded-xl",
                      "bg-beige900 text-beige100",
                      "font-medium",
                      "transition",
                      canNext && !isFetchingNextPage
                        ? "hover:brightness-95 active:scale-[0.99]"
                        : "opacity-40 cursor-not-allowed",
                    ].join(" ")}
                  >
                    {m.search.resultBody.next}
                    <span className="ml-2 text-beige100/60">→</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
