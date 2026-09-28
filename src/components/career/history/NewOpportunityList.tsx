import {
  ArrowUpRight,
  Building2,
  ChevronRight,
  Handshake,
  Loader2,
  ThumbsDown,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BareButton, MuteButton } from "@/components/ui/button";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import RichText from "@/components/ui/rich-text";
import {
  SectionDescription,
  SectionHeader,
} from "@/components/ui/section-header";
import { Tooltips } from "@/components/ui/tooltip";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { formatCareerDate } from "@/lib/career/dateFormat";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { OpportunityType } from "@/lib/opportunityType";
import { cn } from "@/lib/utils";
import { getMetaItems } from "../CareerHistoryPanel";
import {
  getCareerNegativeActionLabel,
  getCareerOpportunityTypeLabel,
  getCareerPositiveActionIcon,
  getCareerPositiveActionLabel,
} from "../opportunityTypeMeta";
import type { CareerHistoryOpportunity } from "../types";
import OpportunityPreferenceFit from "./OpportunityPreferenceFit";

type OpportunityAction = (item: CareerHistoryOpportunity) => void;

type NewOpportunityListProps = {
  expandedOpportunityId?: string | null;
  hasMore?: boolean;
  internalCount?: number;
  items: readonly CareerHistoryOpportunity[];
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onNegative: OpportunityAction;
  onOpenCompanyInfo?: OpportunityAction;
  onOpenLink?: (item: CareerHistoryOpportunity, url: string) => void;
  onPositive: OpportunityAction;
  onToggleOpportunity: OpportunityAction;
  pendingOpportunityIds?: ReadonlySet<string>;
  totalCount?: number;
};

const DESCRIPTION_PREVIEW_HEIGHT = 280;
// Harper의 연결 섹션과 카드에 표시하는 한국어 문구는 여기에서 수정합니다.
// career-i18n-skip-next-line Source is translated by useCareerT below.
const INTERNAL_CONNECTION_LABEL = "Harper 연결 제안";
// career-i18n-skip-next-line Source is translated by useCareerT below.
const INTERNAL_CONNECTION_DESCRIPTION =
  "Harper가 회사와의 연결을 도와드리는 기회입니다. 최대한 수락/거절 의사를 표시해 주세요.";
const DATE_LABEL_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  ko: new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }),
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }),
};

function PositiveActionIconView({
  icon: Icon,
  className = "size-4",
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return <Icon aria-hidden className={className} />;
}

function OpportunityDescription({ item }: { item: CareerHistoryOpportunity }) {
  const t = useCareerT();
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () =>
      setTruncated(content.scrollHeight > DESCRIPTION_PREVIEW_HEIGHT + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [item.description]);

  if (!item.description?.trim()) return null;

  return (
    <section className="space-y-3">
      <h4 className="text-[13px] font-medium text-neutral-muted">
        {t("career.common.career.0f24yir", "역할 설명")}
      </h4>
      <div className="relative">
        <div
          className={cn(
            "overflow-hidden text-[14px] leading-6",
            !expanded && "max-h-[280px]"
          )}
          id={contentId}
          ref={contentRef}
        >
          <RichText variant="career" content={item.description} />
        </div>
        {!expanded && truncated ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-b from-transparent to-white" />
        ) : null}
      </div>
      {truncated ? (
        <MuteButton
          aria-controls={contentId}
          aria-expanded={expanded}
          className="underline underline-offset-4"
          onClick={() => setExpanded((current) => !current)}
          size="sm"
          variant="transparent"
        >
          {expanded
            ? t(
                "career.history.opportunity_recommendation_preview.collapse",
                "접기"
              )
            : t(
                "career.history.opportunity_recommendation_preview.show_more",
                "더보기"
              )}
        </MuteButton>
      ) : null}
    </section>
  );
}

function NewOpportunityCard({
  expanded,
  item,
  onNegative,
  onOpenCompanyInfo,
  onOpenLink,
  onPositive,
  onToggleOpportunity,
  pending,
}: Pick<
  NewOpportunityListProps,
  | "onNegative"
  | "onOpenCompanyInfo"
  | "onOpenLink"
  | "onPositive"
  | "onToggleOpportunity"
> & {
  expanded: boolean;
  item: CareerHistoryOpportunity;
  pending: boolean;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const contentId = useId();
  const PositiveActionIcon = getCareerPositiveActionIcon(item.opportunityType);
  const isInternal = item.isInternal || item.sourceType === "internal";
  const connectionLabel =
    item.opportunityType === OpportunityType.IntroRequest
      ? getCareerOpportunityTypeLabel(item.opportunityType, t)
      : t(
          "career.history.new_opportunity_list.internal_connection_label",
          INTERNAL_CONNECTION_LABEL
        );
  const positiveLabel = getCareerPositiveActionLabel(item.opportunityType, t);
  const negativeLabel = getCareerNegativeActionLabel(item.opportunityType, t);
  const metaItems = [
    formatCareerLocation(item.location, locale),
    ...getMetaItems(item, t),
  ].filter(Boolean);
  const canOpenCompany = Boolean(
    onOpenCompanyInfo &&
    (item.companyDbId || item.companyHomepageUrl || item.companyLinkedinUrl)
  );
  const postingUrl = item.externalJdUrl ?? item.href;

  return (
    <article
      className={cn(
        "group relative rounded-lg border border-neutral-1000-a05/50 transition-colors",
        expanded ? "bg-white" : "bg-neutral-50"
      )}
      data-opportunity-id={item.id}
    >
      {isInternal ? (
        <Badge
          className="pointer-events-none absolute left-[2px] top-[-4px] z-10 bg-primary-faded text-primary"
          icon={<Handshake aria-hidden />}
          size="sm"
          variant="faded"
        >
          {connectionLabel}
        </Badge>
      ) : null}
      <ClickablePanel
        aria-controls={contentId}
        aria-expanded={expanded}
        aria-label={`${item.title} · ${item.companyName}`}
        className="flex min-w-0 cursor-pointer items-center gap-3 px-3 py-4 sm:gap-4 sm:px-4"
        onActivate={() => onToggleOpportunity(item)}
      >
        <span className="flex shrink-0 items-center gap-0.5">
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-neutral-soft transition-transform md:hidden",
              expanded && "rotate-90"
            )}
          />
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md md:rounded-lg bg-white sm:size-11">
            {item.companyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="size-full object-contain"
                loading="lazy"
                src={item.companyLogoUrl}
              />
            ) : (
              <Building2 aria-hidden className="size-5 text-neutral-muted" />
            )}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-normal md:font-medium leading-6 text-neutral-primary sm:text-[15px]">
            {item.title}
          </span>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1 text-[12px] font-normal leading-5 text-neutral-muted sm:text-[13px]">
            {canOpenCompany ? (
              <BareButton
                type="button"
                className="min-w-0 max-w-full shrink-0 whitespace-normal wrap-break-word text-left font-medium text-neutral-primary underline decoration-dotted underline-offset-2 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
                onClick={() => onOpenCompanyInfo?.(item)}
              >
                {item.companyName}
              </BareButton>
            ) : (
              <span className="min-w-0 max-w-full shrink-0 whitespace-normal wrap-break-word">
                {item.companyName}
              </span>
            )}
            {expanded ? (
              metaItems.map((meta, index) => (
                <span
                  className="min-w-0 max-w-full whitespace-normal wrap-break-word"
                  key={index}
                >
                  · {meta}
                </span>
              ))
            ) : metaItems.length > 0 ? (
              <span className="min-w-0 max-w-full truncate">
                · {metaItems.join(" · ")}
              </span>
            ) : null}
          </div>
        </div>
        {!expanded ? (
          <div
            className={cn(
              "flex shrink-0 items-center gap-0 md:gap-1 opacity-100 transition-opacity md:[@media(hover:hover)]:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
              pending && "md:[@media(hover:hover)]:opacity-100"
            )}
          >
            <Tooltips text={negativeLabel}>
              <MuteButton
                aria-label={`${item.title}: ${negativeLabel}`}
                disabled={pending}
                onClick={() => onNegative(item)}
                variant="transparent"
              >
                <ThumbsDown aria-hidden className="size-3.5 md:size-4" />
              </MuteButton>
            </Tooltips>
            <Tooltips text={positiveLabel}>
              <MuteButton
                aria-label={`${item.title}: ${positiveLabel}`}
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
        ) : null}
        <ChevronRight
          aria-hidden
          className={cn(
            "hidden size-4 shrink-0 text-neutral-soft transition-transform md:block",
            expanded && "rotate-90"
          )}
        />
      </ClickablePanel>
      {expanded ? (
        <div
          className="space-y-6 border-t border-neutral-1000-a05 px-4 pb-4 pt-5 sm:px-5 sm:pb-5"
          id={contentId}
        >
          {item.recommendationSummary?.trim() ||
          item.recommendationReasons.length > 0 ||
          (item.recommendationConcerns?.length ?? 0) > 0 ? (
            <div className="space-y-3 text-[14px] leading-6 text-neutral-primary">
              {item.recommendationSummary?.trim() ? (
                <RichText
                  variant="career"
                  content={item.recommendationSummary}
                />
              ) : null}
              {item.recommendationReasons.length > 0 ? (
                <ul className="list-disc space-y-1.5 pl-5 marker:text-neutral-soft">
                  {item.recommendationReasons.map((reason, index) => (
                    <li key={index}>
                      <RichText variant="career" content={reason} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {(item.recommendationConcerns?.length ?? 0) > 0 ? (
                <div className="space-y-2 text-neutral-muted">
                  <h4 className="text-[13px] font-medium">
                    {t("career.common.career.0z5xpdx", "지원전 검토 사항")}
                  </h4>
                  <ul className="list-disc space-y-1.5 pl-5 marker:text-neutral-soft">
                    {item.recommendationConcerns?.map((concern, index) => (
                      <li key={index}>
                        <RichText variant="career" content={concern} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          <OpportunityDescription item={item} />
          <OpportunityPreferenceFit
            items={item.preferenceFit}
            variant="icons"
          />
          {postingUrl && onOpenLink ? (
            <div className="flex flex-wrap items-center gap-2">
              <MuteButton
                className="underline underline-offset-4"
                onClick={() => onOpenLink(item, postingUrl)}
                variant="transparent"
                size="sm"
              >
                {t("career.common.career.0wohsg4", "JD 확인하기")}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </MuteButton>
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-2 border-t border-neutral-1000-a05 pt-4">
            <MuteButton
              disabled={pending}
              onClick={() => onNegative(item)}
              size="lg"
            >
              <ThumbsDown aria-hidden className="size-4" />
              {negativeLabel}
            </MuteButton>
            <MuteButton
              disabled={pending}
              onClick={() => onPositive(item)}
              size="lg"
              variant={isInternal ? "primary" : "dark"}
            >
              {pending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <PositiveActionIconView icon={PositiveActionIcon} />
              )}
              {positiveLabel}
            </MuteButton>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function getDateGroups(
  items: readonly CareerHistoryOpportunity[],
  locale: Locale
) {
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
    const label = Number.isNaN(date.getTime())
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
  onLoadMore,
  onNegative,
  onOpenCompanyInfo,
  onOpenLink,
  onPositive,
  onToggleOpportunity,
  pendingOpportunityIds,
  totalCount,
}: NewOpportunityListProps) {
  const t = useCareerT();
  const { locale } = useMessages();
  const listId = useId();
  const sentinelRef = useRef<HTMLDivElement>(null);
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
        title: t(
          "career.history.new_opportunity_list.open_positions",
          "오픈된 포지션들"
        ),
        empty: t(
          "career.history.new_opportunity_list.no_open_positions",
          "새로 추천된 포지션이 없습니다."
        ),
        description: null,
        count:
          totalCount !== undefined && internalCount !== undefined
            ? Math.max(0, totalCount - internalCount)
            : externalItems.length,
        groups: getDateGroups(externalItems, locale),
      },
    ];
  }, [internalCount, items, locale, t, totalCount]);

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
                      expanded={expandedOpportunityId === item.id}
                      item={item}
                      key={item.id}
                      onNegative={onNegative}
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
              {section.count > 0
                ? t(
                    "career.common.career_history_panel.0s3czqf",
                    "저장된 정보를 불러오는 중입니다..."
                  )
                : section.empty}
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
