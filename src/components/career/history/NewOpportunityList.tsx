import NewOpportunityCard from "./NewOpportunityCard";
// import CareerMatchingList from "./CareerMatchingList";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MuteButton } from "@/components/ui/button";
import {
  SectionDescription,
  SectionHeader,
} from "@/components/ui/section-header";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages, type Locale } from "@/i18n/useMessage";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "../CareerSidebarContext";
import { formatCareerDate } from "@/lib/career/dateFormat";
import type { CareerHistoryOpportunity } from "../types";

import {
  assignHistoryFeedbackVariant,
  HISTORY_FEEDBACK_EXPERIMENT,
  HISTORY_FEEDBACK_VIEW_EVENT,
} from "@/lib/career/historyFeedbackExperiment";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";

type OpportunityAction = (item: CareerHistoryOpportunity) => void;

type NewOpportunityListProps = {
  expandedOpportunityId?: string | null;
  hasMore?: boolean;
  internalCount?: number;
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

// Harper의 연결 섹션과 카드에 표시하는 한국어 문구는 여기에서 수정합니다.
// career-i18n-skip-next-line Source is translated by useCareerT below.
const INTERNAL_CONNECTION_DESCRIPTION = "Harper가 회사에 직접 연결하는 기회예요.";

const DATE_LABEL_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  ko: new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }),
  en: new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }),
};
const RELATIVE_DATE_LABEL_FORMATTERS: Record<Locale, Intl.RelativeTimeFormat> =
  {
    ko: new Intl.RelativeTimeFormat("ko-KR", { numeric: "auto" }),
    en: new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }),
  };

function getDateGroups(
  items: readonly CareerHistoryOpportunity[],
  locale: Locale,
  today: Date
) {
  const todayKey = formatCareerDate(today, locale);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatCareerDate(yesterday, locale);
  const groups = new Map<
    string,
    { key: string; label: string; opportunities: CareerHistoryOpportunity[] }
  >();
  for (const item of [...items].sort(
    (a, b) => Date.parse(b.recommendedAt) - Date.parse(a.recommendedAt)
  )) {
    const key =
      formatCareerDate(item.recommendedAt, locale) ?? item.recommendedAt;
    const date = new Date(item.recommendedAt);
    const relativeDay = key === todayKey ? 0 : key === yesterdayKey ? -1 : null;
    const relativeLabel =
      relativeDay === null
        ? null
        : RELATIVE_DATE_LABEL_FORMATTERS[locale].format(relativeDay, "day");
    const label = relativeLabel
      ? relativeLabel.charAt(0).toLocaleUpperCase(locale) +
        relativeLabel.slice(1)
      : Number.isNaN(date.getTime())
        ? key
        : DATE_LABEL_FORMATTERS[locale].format(date);
    const group = groups.get(key);
    if (group) group.opportunities.push(item);
    else groups.set(key, { key, label, opportunities: [item] });
  }
  return [...groups.values()];
}

export default function NewOpportunityList({
  expandedOpportunityId,
  hasMore = false,
  internalCount,
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
  const { locale } = useMessages();
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
  const listId = useId();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);
    const timeout = window.setTimeout(
      () => setToday(new Date()),
      nextMidnight.getTime() - Date.now()
    );
    return () => window.clearTimeout(timeout);
  }, [today]);
  const sections = useMemo(() => {
    const internalItems = items.filter(
      (item) => item.isInternal || item.sourceType === "internal"
    );
    const externalItems = items.filter(
      (item) => !item.isInternal && item.sourceType !== "internal"
    );
    const currentInternalCount = internalCount ?? internalItems.length;
    return [
      {
        key: "internal",
        title: t(
          "career.history.new_opportunity_list.harper_suggestions",
          "Harper 연결"
        ),
        empty: t(
          "career.history.new_opportunity_list.no_suggestions",
          "Harper가 회사에 직접 연결하는 기회예요."
        ),
        description:
          currentInternalCount > 0
            ? t(
                "career.history.new_opportunity_list.internal_connection_description",
                INTERNAL_CONNECTION_DESCRIPTION
              )
            : null,
        count: currentInternalCount,
        groups:
          internalItems.length > 0
            ? [
                {
                  key: "internal",
                  label: null,
                  opportunities: [...internalItems].sort(
                    (a, b) =>
                      Date.parse(b.recommendedAt) - Date.parse(a.recommendedAt)
                  ),
                },
              ]
            : [],
      },
      {
        key: "external",
        title: t("career.history.new_opportunity_list.open_positions", "직접 지원"),
        empty: t(
          "career.history.new_opportunity_list.no_open_positions",
          "새로 찾은 기회가 없습니다."
        ),
        description: null,
        count:
          totalCount !== undefined && internalCount !== undefined
            ? Math.max(0, totalCount - internalCount)
            : externalItems.length,
        groups: getDateGroups(externalItems, locale, today),
      },
    ];
  }, [internalCount, items, locale, t, today, totalCount]);

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
    <div className="space-y-10 pb-6 pt-5">
      {sections.map((section) => (
        <section
          className="space-y-5"
          key={section.key}
          aria-labelledby={`new-opportunities-${listId}-${section.key}`}
        >
          <SectionHeader>
            <div className="flex items-center justify-between gap-3">
              <h2
                className="flex items-center gap-2.5 text-base md:text-[16px] font-medium leading-7 text-neutral-primary"
                id={`new-opportunities-${listId}-${section.key}`}
              >
                {section.title}
                <span className="text-[13px] font-normal tabular-nums text-neutral-muted">
                  {section.count}
                </span>
              </h2>
              {/* {section.key === "external" ? (
                <CareerMatchingList
                  userId={user?.id}
                  onApply={onApply}
                  onNegative={onNegative}
                  onPositive={onPositive}
                  onKeep={onKeep}
                  onOpenCompanyInfo={onOpenCompanyInfo}
                  onOpenLink={onOpenLink}
                  pendingOpportunityIds={pendingOpportunityIds}
                />
              ) : null} */}
            </div>
            {section.description ? (
              <SectionDescription tone="muted">
                {section.description}
              </SectionDescription>
            ) : null}
          </SectionHeader>
          {section.groups.length > 0 ? (
            section.groups.map((group) => (
              <div className="space-y-3" key={group.key}>
                {group.label ? (
                  <h3 className="text-[14px] font-normal mt-1 leading-4 text-neutral-muted">
                    {group.label}
                  </h3>
                ) : null}
                <div className="space-y-1.5">
                  {group.opportunities.map((item) => (
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
              </div>
            ))
          ) : (
            <p className="text-[14px] leading-6 text-neutral-muted">
              {section.count > 0 ? (
                t(
                  "career.common.career_history_panel.0s3czqf",
                  "저장된 정보를 불러오는 중입니다..."
                )
              ) : (
                <>
                  {section.empty}
                  {section.key === "external" &&
                  talentPreferences?.getExternalRecommendation === false ? (
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
          )}
        </section>
      ))}
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
