import { ArrowUpRight, Building2, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BareButton, MuteButton } from "@/components/ui/button";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import RichText from "@/components/ui/rich-text";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { formatEstimatedAnnualSalary } from "@/lib/career/estimatedSalary";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { OpportunityType } from "@/lib/opportunityType";
import { cn } from "@/lib/utils";
import { getMetaItems } from "../CareerHistoryPanel";
import { getCareerOpportunityTypeLabel } from "../opportunityTypeMeta";
import type { CareerHistoryOpportunity } from "../types";
import {
  formatEmployeeCountRange,
  formatFoundedYear,
} from "../watchlist/watchlistFormatters";
import OpportunityDevelopmentMetrics from "./OpportunityDevelopmentMetrics";
import { getExternalOpportunityLabel, isCompanyOpportunity } from "./hiringPost";
import { formatOpportunityPostingDate } from "./opportunityPostingStatus";
import OpportunityPreferenceFit from "./OpportunityPreferenceFit";
import { CareerAnimatedRegion } from "../CareerAnimatedRegion";
import OpportunityAgentMessages from "./OpportunityAgentMessages";

const DESCRIPTION_PREVIEW_HEIGHT = 280;
const DETAIL_SECTION_CLASS = "career-opportunity-detail-section";
const FACT_LIST_CLASS =
  "career-opportunity-facts text-[13px] leading-5 text-neutral-900";
const FACT_BOX_CLASS =
  "min-w-0 wrap-break-word rounded-control bg-bg-weak px-3 py-3";
const titleClass = "text-[13px] font-normal text-neutral-primary";

// career-i18n-skip-next-line Source is translated by useCareerT below.
const INTERNAL_CONNECTION_LABEL = "Harper 연결";

function OpportunityDescription({
  item,
  full = false,
}: {
  item: CareerHistoryOpportunity;
  /** Shows the whole description without the preview height and "더보기". */
  full?: boolean;
}) {
  const t = useCareerT();
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const truncated = !full && contentHeight > DESCRIPTION_PREVIEW_HEIGHT;

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => setContentHeight(content.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [item.description]);

  if (!item.description?.trim()) return null;

  return (
    <section className={DETAIL_SECTION_CLASS}>
      <h4 className={titleClass}>
        {t("career.common.career.0f24yir", "하는 일")}
      </h4>
      <div className="min-w-0">
        <div
          id={contentId}
          className={cn(
            "overflow-clip motion-safe:transition-[max-height] motion-safe:duration-200 motion-safe:ease-out",
            truncated &&
              !expanded &&
              "[mask-image:linear-gradient(to_bottom,black_calc(100%-2.25rem),transparent_calc(100%-0.375rem))]"
          )}
          style={
            full
              ? undefined
              : {
                  maxHeight: expanded
                    ? contentHeight
                    : DESCRIPTION_PREVIEW_HEIGHT,
                }
          }
          onFocusCapture={(event) => {
            if (
              !expanded &&
              truncated &&
              event.target.getBoundingClientRect().bottom >
                event.currentTarget.getBoundingClientRect().bottom
            ) {
              setExpanded(true);
            }
          }}
        >
          <div ref={contentRef} className="flow-root">
            <RichText
              className="break-keep"
              variant="career"
              typography="body"
              content={item.description}
            />
          </div>
        </div>
        {truncated ? (
          <MuteButton
            aria-controls={contentId}
            aria-expanded={expanded}
            className="mt-1 gap-1"
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
            <ChevronDown
              aria-hidden
              className={cn(
                "size-3.5 motion-safe:transition-transform motion-safe:duration-200",
                expanded && "rotate-180"
              )}
            />
          </MuteButton>
        ) : null}
      </div>
    </section>
  );
}

export function OpportunityFacts({
  item,
  section,
}: {
  item: CareerHistoryOpportunity;
  section?: "role" | "company";
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const postedDate = formatOpportunityPostingDate(item.postedAt, locale);
  const deadlineDate = formatOpportunityPostingDate(item.expiresAt, locale);
  const companyHq = formatCareerLocation(item.companyHqLocation, locale);
  const companyFacts = [
    formatFoundedYear(item.companyFoundedYear ?? null, locale, t),
    companyHq
      ? `${t("career.company.headquarters", "본사")} ${companyHq}`
      : null,
    formatEmployeeCountRange(item.companyEmployeeCountRange, locale, t),
  ].filter(Boolean);

  const showDates = section !== "company" && Boolean(postedDate || deadlineDate);
  const showCompany = section !== "role" && companyFacts.length > 0;
  if (!showDates && !showCompany) return null;

  return (
    <div className="space-y-2">
      {showDates ? (
        <ul className={FACT_LIST_CLASS}>
          {postedDate ? (
            <li className={FACT_BOX_CLASS}>
              {t("career.history.views.posted", "게시일")}{" "}
              <time dateTime={item.postedAt ?? undefined}>{postedDate}</time>
            </li>
          ) : null}
          {deadlineDate ? (
            <li className={cn(FACT_BOX_CLASS, postedDate && "col-start-2")}>
              <span className="font-medium">
                {t("career.history.views.deadline", "마감일")}
              </span>{" "}
              <time dateTime={item.expiresAt ?? undefined}>{deadlineDate}</time>
            </li>
          ) : null}
        </ul>
      ) : null}
      {showCompany ? (
        <ul className={FACT_LIST_CLASS}>
          {companyFacts.map((fact, index) => (
            <li key={index} className={FACT_BOX_CLASS}>
              {fact}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function OpportunityRoleInformation({
  item,
  factsSection,
  fullDescription,
  onOpenLink,
}: {
  item: CareerHistoryOpportunity;
  factsSection?: "role";
  fullDescription?: boolean;
  onOpenLink?: (url: string) => void;
}) {
  const t = useCareerT();
  const postingUrl = item.externalJdUrl ?? item.href;
  return (
    <>
      <OpportunityFacts item={item} section={factsSection} />
      {item.recommendationNote ||
      item.recommendationSummary ||
      item.roleSummary?.trim() ||
      item.recommendationReasons.length > 0 ||
      (item.recommendationConcerns?.length ?? 0) > 0 ? (
        <div className="text-[14px] leading-[22px] text-neutral-primary md:space-y-6">
          {item.roleSummary?.trim() ? (
            <section className={DETAIL_SECTION_CLASS}>
              <h4 className={titleClass}>
                {t("career.profile.documents.call_note_key_points", "요약")}
              </h4>
              <div className="min-w-0">
                <RichText
                  className="break-keep"
                  variant="career"
                  typography="body"
                  content={item.roleSummary}
                />
              </div>
            </section>
          ) : null}
          {item.recommendationNote?.trim() ||
          item.recommendationSummary?.trim() ||
          item.recommendationReasons.length > 0 ? (
            <section className={cn(DETAIL_SECTION_CLASS)}>
              <h4
                className={cn(
                  titleClass,
                  !item.recommendationNote?.trim() &&
                    !item.recommendationSummary?.trim() &&
                    "hidden md:block"
                )}
              >
                {t("career.history.harper_memo", "Harper 메모")}
              </h4>
              <div className="min-w-0 space-y-3">
                {item.recommendationSummary?.trim() &&
                item.recommendationSummary !== item.recommendationNote ? (
                  <RichText
                    variant="career"
                    typography="body"
                    content={item.recommendationSummary}
                  />
                ) : null}
                {item.recommendationNote?.trim() ? (
                  <RichText
                    className="break-keep"
                    variant="career"
                    typography="description"
                    content={item.recommendationNote}
                  />
                ) : null}
                {item.recommendationReasons.length > 0 ? (
                  <ul className="list-disc space-y-1.5 pl-5 marker:text-neutral-soft">
                    {item.recommendationReasons.map((reason, index) => (
                      <li key={index}>
                        <RichText
                          className="break-keep"
                          variant="career"
                          typography="body"
                          content={reason}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ) : null}
          {(item.recommendationConcerns?.length ?? 0) > 0 ? (
            <section
              className={cn(DETAIL_SECTION_CLASS, "text-neutral-primary")}
            >
              <h4 className={titleClass}>
                {t("career.common.career.0z5xpdx", "지원전 검토 사항")}
              </h4>
              <ul className="min-w-0 list-disc space-y-1.5 pl-5 marker:text-neutral-soft">
                {item.recommendationConcerns?.map((concern, index) => (
                  <li key={index}>
                    <RichText
                      className="break-keep"
                      variant="career"
                      typography="body"
                      content={concern}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
      <OpportunityDescription item={item} full={fullDescription} />
      <OpportunityPreferenceFit items={item.preferenceFit} variant="icons" />
      <div className="flex flex-wrap items-center gap-2">
        {postingUrl && onOpenLink ? (
          <MuteButton
            className="underline underline-offset-4"
            onClick={() => onOpenLink(postingUrl)}
            variant="transparent"
            size="sm"
          >
            {t("career.common.career.0wohsg4", "원문 보기")}
            <ArrowUpRight aria-hidden className="size-3.5" />
          </MuteButton>
        ) : null}
        <OpportunityAgentMessages item={item} />
      </div>
      {process.env.NODE_ENV === "development" ? (
        <OpportunityDevelopmentMetrics item={item} />
      ) : null}
    </>
  );
}

export default function OpportunityCard({
  item,
  expanded = true,
  onToggle,
  onOpenDetail,
  onOpenCompanyInfo,
  onOpenLink,
  collapsedActions,
  collapsedFooter,
  headerFooter,
  titleClassName,
  titleAdornment,
  showUnreadIndicator = true,
  actions,
}: {
  item: CareerHistoryOpportunity;
  expanded?: boolean;
  onToggle?: () => void;
  onOpenDetail?: () => void;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenLink?: (item: CareerHistoryOpportunity, url: string) => void;
  collapsedActions?: ReactNode;
  collapsedFooter?: ReactNode;
  headerFooter?: ReactNode;
  titleClassName?: string;
  titleAdornment?: ReactNode;
  showUnreadIndicator?: boolean;
  actions?: ReactNode;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const contentId = useId();
  const isInternal = item.isInternal || item.sourceType === "internal";
  const companyLogo = (
    <span className="career-opportunity-logo">
      {item.companyLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="size-full object-contain"
          loading="lazy"
          src={item.companyLogoUrl}
        />
      ) : (
        <Building2 aria-hidden className="size-3.5 text-neutral-muted" />
      )}
    </span>
  );
  const companyOpportunity = isCompanyOpportunity(item);
  const connectionLabel = !isInternal
    ? getExternalOpportunityLabel(item, t)
    : item.opportunityType === OpportunityType.IntroRequest
      ? getCareerOpportunityTypeLabel(item.opportunityType, t)
      : t(
          "career.history.new_opportunity_list.internal_connection_label",
          INTERNAL_CONNECTION_LABEL
        );
  const metaItems = [
    formatCareerLocation(item.location, locale),
    ...getMetaItems(item, t),
    process.env.NODE_ENV === "development" &&
    !expanded &&
    item.estimatedAnnualSalary
      ? t("career.history.estimated_salary.range", "{range} (추정)", {
          values: {
            range: formatEstimatedAnnualSalary(
              item.estimatedAnnualSalary,
              locale
            ),
          },
        })
      : null,
  ].filter(Boolean);
  const canOpenCompany = Boolean(
    onOpenCompanyInfo &&
    (item.companyDbId || item.companyHomepageUrl || item.companyLinkedinUrl)
  );

  return (
    <article
      className={cn(
        "career-opportunity-card group relative rounded-opportunity border-(length:--opportunity-border-width) border-opportunity-border text-opportunity-foreground transition-colors",
        expanded
          ? "bg-opportunity-expanded bg-opportunity-image shadow-(--shadow-opportunity) backdrop-blur-opportunity"
          : "bg-opportunity",
        !expanded && (onToggle || onOpenDetail) && "cursor-pointer"
      )}
      data-opportunity-id={item.id}
      data-expanded={expanded}
    >
      <OpportunityCardHeader
        footer={
          <div className="career-opportunity-footer">
            <div className="min-w-0">
              {metaItems.length > 0 && (
                <span className="career-opportunity-meta">
                  {metaItems.join(" · ")}
                </span>
              )}
              {headerFooter ?? (!expanded ? collapsedFooter : null)}
            </div>
            {!expanded && collapsedActions ? (
              <div
                className="career-opportunity-actions"
                data-career-card-action="true"
              >
                {collapsedActions}
              </div>
            ) : null}
          </div>
        }
        contentId={contentId}
        expanded={expanded}
        label={companyOpportunity ? item.companyName : `${item.title} · ${item.companyName}`}
        onToggle={onToggle}
        onOpenDetail={onOpenDetail}
      >
        <div className="career-opportunity-heading">
          <div className="career-opportunity-company">
            {companyLogo}
            {canOpenCompany ? (
              <BareButton
                type="button"
                className="career-opportunity-company-link"
                onClick={() => onOpenCompanyInfo?.(item)}
              >
                {item.companyName}
              </BareButton>
            ) : (
              <span className="min-w-0 wrap-break-word">
                {item.companyName}
              </span>
            )}
            {showUnreadIndicator && !item.viewedAt ? (
              <span
                aria-hidden
                className="pointer-events-none size-1 shrink-0 rounded-full bg-action"
              />
            ) : null}
          </div>
          <span
            className={cn(
              "career-opportunity-type",
              isInternal &&
                item.opportunityType !== OpportunityType.IntroRequest
                ? "text-black"
                : "text-(--career-ink-soft)"
            )}
          >
            {connectionLabel}
          </span>
          <span className="career-opportunity-role">
            <span className={cn("career-opportunity-title", titleClassName, companyOpportunity && "line-clamp-2")}>
              {/* A company opportunity has no role title; its line says why to approach it. */}
              {companyOpportunity ? item.recommendationSummary ?? item.companyDescription ?? "" : item.title}
            </span>
            {titleAdornment}
          </span>
        </div>
        {onToggle && !onOpenDetail ? (
          <ChevronRight
            aria-hidden
            className={cn(
              "career-opportunity-chevron size-3.5 shrink-0 text-neutral-soft transition-transform",
              expanded && "rotate-90"
            )}
          />
        ) : null}
      </OpportunityCardHeader>
      <CareerAnimatedRegion open={expanded}>
        <div className="career-opportunity-content space-y-6" id={contentId}>
          <OpportunityRoleInformation
            item={item}
            onOpenLink={onOpenLink ? (url) => onOpenLink(item, url) : undefined}
          />
          {actions}
        </div>
      </CareerAnimatedRegion>
    </article>
  );
}

function OpportunityCardHeader({
  children,
  footer,
  contentId,
  expanded,
  label,
  onToggle,
  onOpenDetail,
}: {
  children: ReactNode;
  footer?: ReactNode;
  contentId: string;
  expanded: boolean;
  label: string;
  onToggle?: () => void;
  onOpenDetail?: () => void;
}) {
  const rowClassName = "relative flex min-w-0 items-center gap-2";
  const className = cn(
    "career-opportunity-header min-w-0",
    !footer && rowClassName
  );
  const content = footer ? (
    <>
      <div className={rowClassName}>{children}</div>
      {footer}
    </>
  ) : (
    children
  );
  const onActivate = onOpenDetail ?? onToggle;
  return onActivate ? (
    <ClickablePanel
      aria-controls={onOpenDetail ? undefined : contentId}
      aria-expanded={onOpenDetail ? undefined : expanded}
      aria-label={label}
      className={cn(className, "cursor-pointer")}
      onActivate={onActivate}
    >
      {content}
    </ClickablePanel>
  ) : (
    <div className={className}>{content}</div>
  );
}
