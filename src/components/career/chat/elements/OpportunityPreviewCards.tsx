import { ArrowLeft, ArrowRight, Building2, ChevronRight } from "lucide-react";
import { Fragment, memo, useCallback, useMemo, useState } from "react";

import type { CareerHistoryOpportunity } from "@/components/career/types";
import { BareButton } from "@/components/ui/button";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { cn } from "@/lib/utils";

import { getOpportunityPostingStatus } from "../../history/opportunityPostingStatus";

const formatChatOpportunityWorkMode = (value: string | null) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  if (!normalized) return null;
  if (normalized === "remote") return "원격";
  if (normalized === "hybrid") return "하이브리드";
  if (normalized === "onsite" || normalized === "on_site") return "대면";
  return value.trim().replaceAll("_", " ");
};

const formatChatOpportunityEmploymentType = (value: string) => {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  if (!normalized) return null;
  if (normalized === "full_time") return "풀타임";
  if (normalized === "part_time") return "파트타임";
  if (normalized === "internship") return "인턴";
  if (normalized === "contract") return "계약직";
  if (normalized === "fractional") return "Fractional";
  return value.trim().replaceAll("_", " ");
};

const getChatOpportunityMetaItems = (item: CareerHistoryOpportunity) =>
  [
    item.location,
    formatChatOpportunityWorkMode(item.workMode),
    ...item.employmentTypes.map(formatChatOpportunityEmploymentType),
  ].filter(Boolean) as string[];

type OpportunityPreviewCardsProps = {
  items: CareerHistoryOpportunity[];
  onOpenOpportunity: (opportunity: CareerHistoryOpportunity) => void;
};

export const OpportunityPreviewCards = memo(function OpportunityPreviewCards({
  items,
  onOpenOpportunity,
}: OpportunityPreviewCardsProps) {
  const [activeItemState, setActiveItemState] = useState({
    index: 0,
    signature: "",
  });
  const itemSignature = useMemo(
    () => items.map((item) => item.id).join("|"),
    [items]
  );

  const activeIndex =
    activeItemState.signature === itemSignature ? activeItemState.index : 0;
  const activeItemIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));
  const item = items[activeItemIndex] ?? null;
  const hasMultipleItems = items.length > 1;

  const moveActiveItem = useCallback(
    (direction: -1 | 1) => {
      if (items.length <= 1) return;
      setActiveItemState((current) => {
        const currentIndex =
          current.signature === itemSignature ? current.index : 0;
        const next = currentIndex + direction;
        if (next < 0) {
          return {
            index: items.length - 1,
            signature: itemSignature,
          };
        }
        if (next >= items.length) {
          return {
            index: 0,
            signature: itemSignature,
          };
        }
        return {
          index: next,
          signature: itemSignature,
        };
      });
    },
    [itemSignature, items.length]
  );

  if (!item) return null;

  const postingStatus = getOpportunityPostingStatus(item);
  const metaItems = getChatOpportunityMetaItems(item);
  const summary =
    item.recommendationSummary?.trim() ||
    item.recommendationReasons[0] ||
    item.description ||
    item.companyDescription ||
    null;

  return (
    <div className="mt-1 mb-2 flex w-full max-w-[980px] flex-col gap-3">
      <ClickablePanel
        onActivate={() => {
          onOpenOpportunity(item);
        }}
        className="group relative flex cursor-pointer flex-col gap-4 rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-4 py-4 text-left transition-colors hover:border-neutral-400 hover:bg-bg-weak"
        aria-label={`${item.companyName} ${item.title} 공고 열기`}
      >
        {hasMultipleItems && (
          <div className="absolute top-3 right-3 z-10 hidden items-center gap-1 md:flex">
            <BareButton
              type="button"
              onClick={() => moveActiveItem(-1)}
              className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm bg-bg-weak text-neutral-muted hover:bg-bg-weak"
              aria-label="이전 공고"
              title="이전 공고"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </BareButton>
            <span className="min-w-8 text-center text-[11px] leading-none font-medium text-neutral-muted">
              {activeItemIndex + 1}/{items.length}
            </span>
            <BareButton
              type="button"
              onClick={() => moveActiveItem(1)}
              className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm bg-bg-weak text-neutral-muted hover:bg-bg-weak"
              aria-label="다음 공고"
              title="다음 공고"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </BareButton>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex w-full min-w-0 items-start gap-3">
            {item.companyLogoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.companyLogoUrl}
                  alt={item.companyName}
                  className="h-11 w-11 shrink-0 rounded-[8px] border border-neutral-1000-a05 bg-bg-default object-cover"
                />
              </>
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-black text-neutral-00">
                <Building2 className="h-4 w-4" />
              </div>
            )}

            <div className="min-w-0 flex-1 items-start justify-center w-full">
              <div className="mt-0.5 break-words text-[15px] font-medium text-neutral-primary">
                {item.title}
              </div>
              <div className="mt-0.5 flex flex-row flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-neutral-muted">
                <span className="whitespace-nowrap text-neutral-primary">
                  {item.companyName}
                </span>

                {metaItems.length > 0 &&
                  metaItems.map((meta) => (
                    <Fragment key={`${item.id}-${meta}`}>
                      <span className="whitespace-nowrap">·</span>
                      <span className="whitespace-nowrap">{meta}</span>
                    </Fragment>
                  ))}

                {postingStatus && metaItems.length > 0 && (
                  <span className="whitespace-nowrap">·</span>
                )}

                {postingStatus && (
                  <span
                    className={cn(
                      "whitespace-nowrap",
                      postingStatus.isExpired && "font-medium text-info"
                    )}
                  >
                    {postingStatus.label}
                  </span>
                )}
              </div>
            </div>

            {!hasMultipleItems && (
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-disabled transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-muted" />
            )}
          </div>

          {summary && (
            <div className="max-h-24 overflow-hidden text-[15px] leading-6 text-neutral-muted line-clamp-3 md:text-[13px]">
              {summary}
            </div>
          )}
        </div>
      </ClickablePanel>
    </div>
  );
});
