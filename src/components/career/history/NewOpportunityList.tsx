import NewOpportunityCard from "./NewOpportunityCard";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Typography } from "@/components/ui/typography";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "../CareerSidebarContext";
import type { CareerHistoryOpportunity } from "../types";

import {
  assignHistoryFeedbackVariant,
  HISTORY_FEEDBACK_EXPERIMENT,
  HISTORY_FEEDBACK_VIEW_EVENT,
} from "@/lib/career/historyFeedbackExperiment";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { Tooltips } from "@/components/ui/tooltip";

type OpportunityAction = (item: CareerHistoryOpportunity) => void;

type NewOpportunityListProps = {
  expandedOpportunityId?: string | null;
  hasMore?: boolean;
  items: readonly CareerHistoryOpportunity[];
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onApply: OpportunityAction;
  onNegative: OpportunityAction;
  onKeep: OpportunityAction;
  onOpenCompanyInfo?: OpportunityAction;
  onOpenLink?: (item: CareerHistoryOpportunity, url: string) => void;
  onPositive: OpportunityAction;
  onToggleOpportunity: OpportunityAction;
  pendingOpportunityIds?: ReadonlySet<string>;
  totalCount?: number;
};

export default function NewOpportunityList({
  expandedOpportunityId,
  hasMore = false,
  items,
  loadingMore = false,
  onApply,
  onLoadMore,
  onNegative,
  onKeep,
  onOpenCompanyInfo,
  onOpenLink,
  onPositive,
  onToggleOpportunity,
  pendingOpportunityIds,
  totalCount,
}: NewOpportunityListProps) {
  const t = useCareerT();
  const { talentPreferences } = useCareerProfileContext();
  const { user } = useCareerSidebarContext();
  const feedbackVariant = assignHistoryFeedbackVariant(user?.id);
  const logCareerEvent = useCareerLogEvent();
  const viewedOpportunities = useRef(new Set<string>());
  const expandedItem = items.find((item) => item.id === expandedOpportunityId);
  useEffect(() => {
    if (
      !user?.id ||
      !expandedItem ||
      expandedItem.isInternal ||
      expandedItem.sourceType !== "external" ||
      expandedItem.feedback !== null
    )
      return;
    const key = `${user.id}:${expandedItem.id}`;
    if (viewedOpportunities.current.has(key)) return;
    viewedOpportunities.current.add(key);
    logCareerEvent(HISTORY_FEEDBACK_VIEW_EVENT, {
      experiment: HISTORY_FEEDBACK_EXPERIMENT,
      variant: feedbackVariant,
      opportunityId: expandedItem.id,
    });
  }, [expandedItem, feedbackVariant, logCareerEvent, user?.id]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sections = useMemo(() => {
    const orderedItems = [...items].sort(
      (a, b) => Date.parse(b.recommendedAt) - Date.parse(a.recommendedAt)
    );
    return [
      {
        kind: "internal",
        items: orderedItems.filter(
          (item) => item.isInternal || item.sourceType === "internal"
        ),
      },
      {
        kind: "external",
        items: orderedItems.filter(
          (item) => !item.isInternal && item.sourceType !== "internal"
        ),
      },
    ];
  }, [items]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loadingMore || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "360px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <div className="space-y-6 pb-6">
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <section key={section.kind} className="space-y-3">
            <div className="space-y-2 px-2">
              <Tooltips
                text={
                  section.kind === "internal"
                    ? t(
                        "career.history.new_opportunity_list.response_description",
                        "저장/거절/연결 요청 등 가능한 모든 추천에 응답을 해주실수록 더 좋은 기회가 전달될 확률이 높아집니다."
                      )
                    : ""
                }
              >
                <Typography variant="caption">
                  {section.kind === "internal"
                    ? t(
                        "career.history.new_opportunity_list.needs_response",
                        "답이 필요해요"
                      )
                    : t(
                        "career.history.new_opportunity_list.open_positions",
                        "직접 지원"
                      )}
                </Typography>
              </Tooltips>
            </div>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NewOpportunityCard
                  feedbackVariant={feedbackVariant}
                  expanded={expandedOpportunityId === item.id}
                  item={item}
                  key={item.id}
                  onApply={onApply}
                  onNegative={onNegative}
                  onKeep={onKeep}
                  onOpenCompanyInfo={onOpenCompanyInfo}
                  onOpenLink={onOpenLink}
                  onPositive={onPositive}
                  onToggleOpportunity={onToggleOpportunity}
                  pending={Boolean(pendingOpportunityIds?.has(item.id))}
                />
              ))}
            </div>
          </section>
        ))}
      {items.length === 0 ? (
        <p className="py-5 text-[14px] leading-6 text-neutral-muted">
          {totalCount ? (
            t(
              "career.common.career_history_panel.0s3czqf",
              "저장된 정보를 불러오는 중입니다..."
            )
          ) : (
            <>
              {t(
                "career.history.new_opportunity_list.no_open_positions",
                "새로 찾은 기회가 없습니다."
              )}
              {talentPreferences?.getExternalRecommendation === false ? (
                <span className="mt-2 block">
                  {t(
                    "career.history.new_opportunity_list.external_recommendations_off",
                    "직접 지원 기회 받기가 꺼져 있어요. Harper에게 요청하면 채용 페이지에서 지원할 수 있는 기회도 찾아드려요."
                  )}
                </span>
              ) : null}
            </>
          )}
        </p>
      ) : null}
      {hasMore && onLoadMore ? (
        <div
          className="flex min-h-12 items-center justify-center"
          ref={sentinelRef}
        >
          <MuteButton
            disabled={loadingMore}
            onClick={onLoadMore}
            variant="transparent"
          >
            {loadingMore ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : null}
            {t(
              "career.history.opportunity_recommendation_preview.show_more",
              "더보기"
            )}
          </MuteButton>
        </div>
      ) : null}
    </div>
  );
}
