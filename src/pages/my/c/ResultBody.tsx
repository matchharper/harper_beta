// components/result/ResultBody.tsx
import React from "react";
import CandidateViews from "@/components/CandidateViews";
import { useMessages } from "@/i18n/useMessage";
import { SearchSource } from "@/lib/search/source";
import { BareButton } from "@/components/ui/button";

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
      <div className="w-full px-4 py-12 text-sm text-neutral-muted">
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
            <div className="flex rounded-2xl pl-1 bg-transparent backdrop-blur-md">
              <div className="flex flex-col gap-4 px-2 py-0 md:flex-row md:items-center md:justify-between">
                {/* Left: page label (small, muted) */}
                <div className="flex items-center gap-2 text-sm text-neutral-muted">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-black/40" />
                    {m.search.resultBody.page.replace(
                      "{page}",
                      String(pageIdx + 1)
                    )}
                  </span>

                  {isFetchingNextPage ? (
                    <span className="text-neutral-muted">
                      {m.search.resultBody.loadingSuffix}
                    </span>
                  ) : null}

                  {pageIdxRaw > maxPrefetchPages ? (
                    <span className="ml-2 text-neutral-disabled">
                      {m.search.resultBody.capped.replace(
                        "{cap}",
                        String(maxPrefetchPages + 1)
                      )}
                    </span>
                  ) : null}
                </div>

                {/* Right: controls */}
                <div className="flex text-[13px] items-center justify-between gap-2 md:justify-end">
                  <BareButton
                    type="button"
                    onClick={onPrevPage}
                    disabled={!canPrev}
                    className={[
                      "inline-flex items-center justify-center",
                      "h-11 px-4 md:px-5 rounded-xl",
                      "border border-neutral-1000-a05 bg-bg-floating",
                      " text-neutral-primary",
                      "transition",
                      canPrev
                        ? "hover:bg-bg-weak hover:border-neutral-1000-a10 active:scale-[0.99]"
                        : "opacity-40 cursor-not-allowed",
                    ].join(" ")}
                  >
                    <span className="mr-2 text-neutral-muted">←</span>
                    {m.search.resultBody.previous}
                  </BareButton>

                  <div className="hidden md:block w-px h-8 bg-bg-weak" />

                  <BareButton
                    type="button"
                    onClick={onNextPage}
                    disabled={!canNext || isFetchingNextPage}
                    className={[
                      "inline-flex items-center justify-center",
                      "h-11 px-4 md:px-5 rounded-xl",
                      "bg-black text-neutral-00",
                      "font-medium",
                      "transition",
                      canNext && !isFetchingNextPage
                        ? "hover:brightness-95 active:scale-[0.99]"
                        : "opacity-40 cursor-not-allowed",
                    ].join(" ")}
                  >
                    {m.search.resultBody.next}
                    <span className="ml-2 text-neutral-00/60">→</span>
                  </BareButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
