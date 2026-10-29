import OpportunityCard from "./OpportunityCard";
import {
  Archive,
  Bookmark,
  Handshake,
  Loader2,
  ThumbsDown,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatedHandshake } from "@/components/ui/animated-handshake";
import { MuteButton } from "@/components/ui/button";
import {
  SectionDescription,
  SectionHeader,
} from "@/components/ui/section-header";
import { Tooltips } from "@/components/ui/tooltip";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages, type Locale } from "@/i18n/useMessage";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "../CareerSidebarContext";
import { formatCareerDate } from "@/lib/career/dateFormat";
import { cn } from "@/lib/utils";
import {
  getCareerNegativeActionLabel,
  getCareerPositiveActionIcon,
  getCareerPositiveActionLabel,
} from "../opportunityTypeMeta";
import type { CareerHistoryOpportunity } from "../types";
import { OpportunitySwipeRow } from "./OpportunitySwipeRow";

import {
  assignHistoryFeedbackVariant,
  HISTORY_FEEDBACK_EXPERIMENT,
  HISTORY_FEEDBACK_VIEW_EVENT,
  type HistoryFeedbackVariant,
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
const INTERNAL_CONNECTION_DESCRIPTION =
  "Harper가 회사와의 연결을 도와드리는 기회입니다.";

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

function PositiveActionIconView({
  icon: Icon,
  className = "size-4",
}: {
  icon: LucideIcon;
  className?: string;
}) {
  if (Icon === Handshake) return <AnimatedHandshake className={className} />;
  return <Icon aria-hidden className={className} />;
}

function NewOpportunityCard({
  feedbackVariant = "thumbs",
  expanded,
  item,
  onApply,
  onNegative,
  onKeep,
  onOpenCompanyInfo,
  onOpenLink,
  onPositive,
  onToggleOpportunity,
  pending,
}: Pick<
  NewOpportunityListProps,
  | "onApply"
  | "onNegative"
  | "onKeep"
  | "onOpenCompanyInfo"
  | "onOpenLink"
  | "onPositive"
  | "onToggleOpportunity"
> & {
  feedbackVariant: HistoryFeedbackVariant;
  expanded: boolean;
  item: CareerHistoryOpportunity;
  pending: boolean;
}) {
  const t = useCareerT();
  const isInternal = item.isInternal || item.sourceType === "internal";
  const saveHide = !isInternal && feedbackVariant === "save_hide";
  const PositiveActionIcon = saveHide
    ? Bookmark
    : getCareerPositiveActionIcon(item.opportunityType);
  const NegativeActionIcon = saveHide ? Archive : ThumbsDown;
  const positiveLabel = saveHide
    ? t("career.common.save", "저장")
    : getCareerPositiveActionLabel(item.opportunityType, t);
  const negativeLabel = saveHide
    ? t("career.history.feedback_actions.hide_tooltip", "목록에서 숨기기")
    : getCareerNegativeActionLabel(item.opportunityType, t);
  const positiveTooltip = saveHide
    ? t("career.company.jobs.save", "저장하기")
    : positiveLabel;
  const negativeTooltip = negativeLabel;
  const actionClass = "py-2.5 rounded-sm font-normal md:font-light text-sm";

  return (
    <OpportunitySwipeRow
      disabled={pending || expanded}
      positive={{
        label: positiveLabel,
        icon: (
          <PositiveActionIconView
            icon={PositiveActionIcon}
            className="size-5"
          />
        ),
        onSelect: () => onPositive(item),
      }}
      negative={{
        label: negativeLabel,
        icon: <NegativeActionIcon aria-hidden className="size-5" />,
        onSelect: () => onNegative(item),
      }}
    >
      <OpportunityCard
        item={item}
        expanded={expanded}
        onToggle={() => onToggleOpportunity(item)}
        onOpenCompanyInfo={onOpenCompanyInfo}
        onOpenLink={onOpenLink}
        collapsedActions={
          <div
            className={cn(
              "flex shrink-0 items-center gap-0 md:gap-1 opacity-100 transition-opacity md:[@media(hover:hover)]:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
              pending && "md:[@media(hover:hover)]:opacity-100"
            )}
          >
            {isInternal ? (
              <Tooltips
                text={t(
                  "career.history.keep.tooltip",
                  "가능한 모든 추천에 응답을 해주실수록 더 좋은 기회가 전달될 확률이 높아집니다. 이 선택은 회사에 전달되지 않습니다."
                )}
              >
                <MuteButton
                  disabled={pending}
                  variant="transparent"
                  aria-label={t(
                    "career.history.keep.action",
                    "저장하고 나중에 결정"
                  )}
                  onClick={() => onKeep(item)}
                >
                  <Bookmark aria-hidden className="size-3.5 md:size-4" />
                </MuteButton>
              </Tooltips>
            ) : null}
            <Tooltips text={negativeTooltip}>
              <MuteButton
                aria-label={`${item.title}: ${negativeTooltip}`}
                disabled={pending}
                onClick={() => onNegative(item)}
                variant="transparent"
              >
                <NegativeActionIcon
                  aria-hidden
                  className="size-3.5 md:size-4"
                />
              </MuteButton>
            </Tooltips>
            <Tooltips text={positiveTooltip}>
              <MuteButton
                aria-label={`${item.title}: ${positiveTooltip}`}
                disabled={pending}
                onClick={() => onPositive(item)}
                variant="transparent"
              >
                {pending ? (
                  <Loader2
                    aria-hidden
                    className="size-3.5 md:size-4 animate-spin"
                  />
                ) : (
                  <PositiveActionIconView
                    icon={PositiveActionIcon}
                    className="size-3.5 md:size-4"
                  />
                )}
              </MuteButton>
            </Tooltips>
          </div>
        }
        actions={
          <div className="grid grid-cols-2 items-center gap-2 pt-4 md:grid-cols-3 max-md:[&>button:last-child:nth-child(odd)]:col-start-2">
            {isInternal ? (
              <Tooltips
                text={t(
                  "career.history.keep.tooltip",
                  "가능한 모든 추천에 응답을 해주실수록 더 좋은 기회가 전달될 확률이 높아집니다. 이 선택은 회사에 전달되지 않습니다."
                )}
              >
                <MuteButton
                  disabled={pending}
                  onClick={() => onKeep(item)}
                  size="md"
                  variant="neutral"
                  className={actionClass}
                >
                  <Bookmark aria-hidden className="size-3.5" />
                  {t("career.history.keep.action", "저장하고 나중에 결정")}
                </MuteButton>
              </Tooltips>
            ) : null}
            <MuteButton
              disabled={pending}
              onClick={() => onNegative(item)}
              size="md"
              className={actionClass}
            >
              <NegativeActionIcon aria-hidden className="size-3.5 stroke-0.5" />
              {negativeLabel}
            </MuteButton>
            <MuteButton
              disabled={pending}
              onClick={() => onPositive(item)}
              size="md"
              variant={isInternal ? "primary" : "dark"}
              className={actionClass}
            >
              {pending ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
              ) : (
                <PositiveActionIconView
                  icon={PositiveActionIcon}
                  className="size-3.5"
                />
              )}
              {positiveLabel}
            </MuteButton>
            {!isInternal ? (
              <MuteButton
                disabled={pending}
                onClick={() => onApply(item)}
                size="md"
                variant="primary"
                className={actionClass}
              >
                {t("career.history.external_application.apply", "지원하기")}
              </MuteButton>
            ) : null}
          </div>
        }
      />
    </OpportunitySwipeRow>
  );
}

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
          "Harper의 연결"
        ),
        empty: t(
          "career.history.new_opportunity_list.no_suggestions",
          "Harper를 통해서 연결되는 기회입니다."
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
        title: t("career.history.new_opportunity_list.open_positions", "Jobs"),
        empty: t(
          "career.history.new_opportunity_list.no_open_positions",
          "새로 추천된 포지션이 없습니다."
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
            <h2
              className="flex items-center gap-2.5 text-base md:text-[16px] font-medium leading-7 text-neutral-primary"
              id={`new-opportunities-${listId}-${section.key}`}
            >
              {section.title}
              <span className="text-[13px] font-normal tabular-nums text-neutral-muted">
                {section.count}
              </span>
            </h2>
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
                        "현재 외부 포지션의 추천이 꺼져있습니다. Harper에게 요청하시면, 주기적으로 직접 지원하실만한 외부 공고를 찾아서 전달드립니다."
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
