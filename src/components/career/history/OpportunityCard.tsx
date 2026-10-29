import { ArrowUpRight, Building2, ChevronRight, Handshake } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { BareButton, MuteButton } from "@/components/ui/button";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import RichText from "@/components/ui/rich-text";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { formatEstimatedAnnualSalary } from "@/lib/career/estimatedSalary";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { getKnownCompanyDataText } from "@/lib/career/fundingStage";
import { OpportunityType } from "@/lib/opportunityType";
import { cn } from "@/lib/utils";
import { getMetaItems } from "../CareerHistoryPanel";
import { getCareerOpportunityTypeLabel } from "../opportunityTypeMeta";
import type { CareerHistoryOpportunity } from "../types";
import {
  formatEmployeeCountRange,
  formatFoundedYear,
} from "../watchlist/watchlistFormatters";
import EstimatedSalaryNotice from "./EstimatedSalaryNotice";
import OpportunityPreferenceFit from "./OpportunityPreferenceFit";

const DESCRIPTION_PREVIEW_HEIGHT = 280;
const DETAIL_SECTION_CLASS =
  "grid grid-cols-1 gap-3 md:grid-cols-[144px_minmax(0,1fr)] md:gap-x-6 pb-6";
const titleClass = "text-[13px] font-normal text-black";

// career-i18n-skip-next-line Source is translated by useCareerT below.
const INTERNAL_CONNECTION_LABEL = "Harper 연결 제안";

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
    <section className={DETAIL_SECTION_CLASS}>
      <h4 className={titleClass}>
        {t("career.common.career.0f24yir", "역할 설명")}
      </h4>
      <div className="min-w-0 space-y-3">
        <div className="relative">
          <div
            className={cn("overflow-hidden", !expanded && "max-h-[280px]")}
            id={contentId}
            ref={contentRef}
          >
            <RichText
              className="break-keep"
              variant="career"
              typography="body"
              content={item.description}
            />
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
      </div>
    </section>
  );
}

export default function OpportunityCard({
  item,
  expanded = true,
  onToggle,
  onOpenCompanyInfo,
  onOpenLink,
  collapsedActions,
  actions,
}: {
  item: CareerHistoryOpportunity;
  expanded?: boolean;
  onToggle?: () => void;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenLink?: (item: CareerHistoryOpportunity, url: string) => void;
  collapsedActions?: ReactNode;
  actions?: ReactNode;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const contentId = useId();
  const isInternal = item.isInternal || item.sourceType === "internal";
  const connectionLabel =
    item.opportunityType === OpportunityType.IntroRequest
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
  const postingUrl = item.externalJdUrl ?? item.href;
  const companyHq = formatCareerLocation(item.companyHqLocation, locale);
  const companyFunding = getKnownCompanyDataText(
    item.companyData?.totalFundingRaised
  );
  const companyFacts = [
    formatFoundedYear(item.companyFoundedYear ?? null, locale, t),
    companyHq ? `HQ ${companyHq}` : null,
    formatEmployeeCountRange(item.companyEmployeeCountRange, locale, t),
    companyFunding
      ? `${t("career.company.company_data.total_funding_raised_label", "총 투자")} ${companyFunding}`
      : null,
  ].filter(Boolean);

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
      <OpportunityCardHeader
        contentId={contentId}
        expanded={expanded}
        label={`${item.title} · ${item.companyName}`}
        onToggle={onToggle}
      >
        <span className="flex shrink-0 items-center gap-0.5">
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
          <span className="flex min-w-0 items-center gap-1.5">
            {!item.viewedAt ? (
              <span
                aria-hidden
                className="pointer-events-none size-1.5 shrink-0 rounded-full bg-action"
              />
            ) : null}
            <span className="block truncate text-[14px] font-normal md:font-medium leading-6 text-neutral-primary sm:text-[15px]">
              {item.title}
            </span>
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
              <span className="min-w-0 max-w-full whitespace-normal wrap-break-word">
                · {metaItems.join(" · ")}
              </span>
            ) : null}
          </div>
        </div>
        {!expanded ? collapsedActions : null}
        {onToggle ? (
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-neutral-soft transition-transform md:size-4",
              expanded && "rotate-90"
            )}
          />
        ) : null}
      </OpportunityCardHeader>
      {expanded ? (
        <div
          className="space-y-6 border-t border-neutral-1000-a05 px-4 pb-6 pt-5 sm:px-5"
          id={contentId}
        >
          {companyFacts.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2 text-[13px] leading-5 text-neutral-900 md:grid-cols-4">
              {companyFacts.map((fact, index) => (
                <li
                  key={index}
                  className="min-w-0 wrap-break-word rounded-md bg-neutral-50 px-3 py-3"
                >
                  {fact}
                </li>
              ))}
            </ul>
          ) : null}
          {item.recommendationNote ||
          item.recommendationSummary?.trim() ||
          item.recommendationReasons.length > 0 ||
          (item.recommendationConcerns?.length ?? 0) > 0 ? (
            <div className="text-[14px] leading-[22px] text-neutral-primary md:space-y-6">
              {item.recommendationSummary?.trim() ? (
                <section className={DETAIL_SECTION_CLASS}>
                  <h4 className={cn(titleClass, "hidden md:block")}>
                    {t("career.profile.documents.call_note_key_points", "요약")}
                  </h4>
                  <div className="min-w-0">
                    <RichText
                      className="break-keep"
                      variant="career"
                      typography="body"
                      content={item.recommendationSummary}
                    />
                  </div>
                </section>
              ) : null}
              {item.recommendationNote?.trim() ||
              item.recommendationReasons.length > 0 ? (
                <section className={cn(DETAIL_SECTION_CLASS)}>
                  <h4
                    className={cn(
                      titleClass,
                      !item.recommendationNote?.trim() && "hidden md:block"
                    )}
                  >
                    {t(
                      "career.history.new_opportunity_list.harper_opinion",
                      "Harper의 의견"
                    )}
                  </h4>
                  <div className="min-w-0 space-y-3">
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
          {process.env.NODE_ENV === "development" ? (
            <EstimatedSalaryNotice item={item} />
          ) : null}
          {actions}
        </div>
      ) : null}
    </article>
  );
}

function OpportunityCardHeader({
  children,
  contentId,
  expanded,
  label,
  onToggle,
}: {
  children: ReactNode;
  contentId: string;
  expanded: boolean;
  label: string;
  onToggle?: () => void;
}) {
  const className =
    "flex min-w-0 items-center gap-3 px-3 py-4 sm:gap-4 sm:px-4";
  return onToggle ? (
    <ClickablePanel
      aria-controls={contentId}
      aria-expanded={expanded}
      aria-label={label}
      className={cn(className, "cursor-pointer")}
      onActivate={onToggle}
    >
      {children}
    </ClickablePanel>
  ) : (
    <div className={className}>{children}</div>
  );
}
