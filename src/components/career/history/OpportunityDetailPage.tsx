import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { BareButton, MuteButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { useCareerCompanyProfile } from "@/hooks/career/useCareerCompanyProfile";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { OpportunityType } from "@/lib/opportunityType";
import { getMetaItems } from "../CareerHistoryPanel";
import { getCareerOpportunityTypeLabel } from "../opportunityTypeMeta";
import type { CareerHistoryOpportunity } from "../types";
import CompanyFactsGrid from "../company/CompanyFactsGrid";
import {
  CompanyHeader,
  useCareerCompanyDetail,
} from "../company/CareerCompanyPage";
import OpportunityAgentMessages from "./OpportunityAgentMessages";
import OpportunityDevelopmentMetrics from "./OpportunityDevelopmentMetrics";
import OpportunityPreferenceFit from "./OpportunityPreferenceFit";
import SimilarOpportunities from "./SimilarOpportunities";
import {
  getExternalOpportunityLabel,
  isCompanyOpportunity,
} from "./hiringPost";
import { formatOpportunityPostingDate } from "./opportunityPostingStatus";

function Row({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 md:grid-cols-[96px_minmax(0,1fr)] md:gap-5">
      <dt className="text-[13px] leading-6 text-neutral-muted">{label}</dt>
      <dd className="min-w-0 text-[14px] leading-[1.7] text-neutral-primary">
        {children}
      </dd>
    </div>
  );
}

/** One opportunity as its own page: the company first, then why Harper picked it and the posting. */
export default function OpportunityDetailPage({
  actions,
  backLabel,
  item,
  onBack,
  onOpenCompany,
  onOpenLink,
  onOpenSimilar,
}: {
  actions?: ReactNode;
  backLabel: string;
  item: CareerHistoryOpportunity;
  onBack: () => void;
  onOpenCompany?: (item: CareerHistoryOpportunity) => void;
  onOpenLink: (url: string) => void;
  /** Opens one of the similar opportunities shown under the posting. */
  onOpenSimilar?: (item: CareerHistoryOpportunity) => void;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const pageRef = useRef<HTMLElement>(null);
  const companyDbId = item.companyDbId ?? null;
  const profileQuery = useCareerCompanyProfile(companyDbId);
  const detailQuery = useCareerCompanyDetail(companyDbId);
  const company = detailQuery.data ?? null;
  const companyOpportunity = isCompanyOpportunity(item);
  const isInternal = item.isInternal || item.sourceType === "internal";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      pageRef.current?.focus({ preventScroll: true });
      pageRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [item.id]);

  const canOpenCompany = Boolean(
    onOpenCompany &&
    (item.companyDbId || item.companyHomepageUrl || item.companyLinkedinUrl)
  );
  const openCompany = canOpenCompany ? () => onOpenCompany?.(item) : undefined;
  const connectionLabel = !isInternal
    ? getExternalOpportunityLabel(item, t)
    : item.opportunityType === OpportunityType.IntroRequest
      ? getCareerOpportunityTypeLabel(item.opportunityType, t)
      : t(
          "career.history.new_opportunity_list.internal_connection_label",
          "Harper 연결"
        );
  const meta = [
    formatCareerLocation(item.location, locale),
    ...getMetaItems(item, t),
  ].filter(Boolean);
  const postedDate = formatOpportunityPostingDate(item.postedAt, locale);
  const deadlineDate = formatOpportunityPostingDate(item.expiresAt, locale);
  const postingUrl = item.externalJdUrl ?? item.href;
  const harperThought = [
    item.recommendationSummary?.trim(),
    item.recommendationNote?.trim() !== item.recommendationSummary?.trim()
      ? item.recommendationNote?.trim()
      : null,
  ].filter((value): value is string => Boolean(value));
  const concerns = item.recommendationConcerns ?? [];

  return (
    <section
      ref={pageRef}
      tabIndex={-1}
      aria-label={item.title}
      data-career-wide-page=""
      className="min-w-0 pb-10 text-neutral-primary outline-none"
    >
      <div className="mb-2 flex items-center">
        <MuteButton variant="transparent" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-4" />
          {backLabel}
        </MuteButton>
      </div>

      <CompanyHeader
        fallback={{
          description: item.companyDescription,
          logoUrl: item.companyLogoUrl,
          name: item.companyName,
        }}
        item={company}
        onOpenCompany={openCompany}
      />
      <CompanyFactsGrid
        className="mt-6"
        profile={profileQuery.data}
        basics={{
          employeeCountRange:
            company?.employeeCountRange ?? item.companyEmployeeCountRange,
          foundedYear: company?.foundedYear ?? item.companyFoundedYear,
          location: company?.location ?? item.companyHqLocation,
        }}
      />
      {openCompany ? (
        <BareButton
          type="button"
          onClick={openCompany}
          className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-neutral-primary hover:underline hover:underline-offset-4"
        >
          {t("career.company.page.open", "회사 정보 더 보기")}
          <ArrowRight aria-hidden className="size-4" />
        </BareButton>
      ) : null}

      <div className="mt-10">
        {!companyOpportunity ? (
          <>
            <div className="text-[12.5px] text-neutral-soft">
              {connectionLabel}
            </div>
            <h1 className="mt-1 text-[20px] font-semibold leading-snug tracking-[-0.02em]">
              {item.title}
            </h1>
            {meta.length > 0 ? (
              <p className="mt-1 text-[13px] text-neutral-muted">
                {meta.join(" · ")}
              </p>
            ) : null}
          </>
        ) : (
          <h1 className="sr-only">{item.companyName}</h1>
        )}
        {/* Every detail shows its buttons in one place, right under the title. */}
        {actions ? <div className="pt-4 empty:hidden">{actions}</div> : null}
      </div>

      <dl className="mt-8 space-y-6">
        {harperThought.length > 0 || item.recommendationReasons.length > 0 ? (
          <Row label={t("career.history.detail.harper_thought", "Harper 생각")}>
            <div className="space-y-2.5">
              {harperThought.map((text, index) => (
                <RichText
                  key={index}
                  className="break-keep"
                  variant="career"
                  typography="body"
                  content={text}
                />
              ))}
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
          </Row>
        ) : null}
        {concerns.length > 0 ? (
          <Row label={t("career.common.career.0z5xpdx", "지원전 검토 사항")}>
            <ul className="list-disc space-y-1.5 pl-5 marker:text-neutral-soft">
              {concerns.map((concern, index) => (
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
          </Row>
        ) : null}
        {item.roleSummary?.trim() ? (
          <Row
            label={t("career.profile.documents.call_note_key_points", "요약")}
          >
            <RichText
              className="break-keep"
              variant="career"
              typography="body"
              content={item.roleSummary}
            />
          </Row>
        ) : null}
        {(item.preferenceFit?.length ?? 0) > 0 ? (
          <Row label={t("career.history.detail.preference_fit", "원하는 조건")}>
            <OpportunityPreferenceFit
              items={item.preferenceFit}
              variant="detail"
            />
          </Row>
        ) : null}
        {item.description?.trim() ? (
          <Row label={t("career.common.career.0f24yir", "하는 일")}>
            <RichText
              className="break-keep"
              variant="career"
              typography="body"
              content={item.description}
            />
          </Row>
        ) : null}
        {postedDate || deadlineDate || postingUrl ? (
          <Row label={t("career.history.detail.posting", "공고")}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {postedDate ? (
                <span>
                  {t("career.history.detail.posted_on", "{date} 게시", {
                    values: { date: postedDate },
                  })}
                </span>
              ) : null}
              {deadlineDate ? (
                <span className="text-neutral-muted">
                  {t("career.history.detail.deadline_on", "{date} 마감", {
                    values: { date: deadlineDate },
                  })}
                </span>
              ) : null}
              {postingUrl ? (
                <BareButton
                  type="button"
                  onClick={() => onOpenLink(postingUrl)}
                  className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-action-strong"
                >
                  {t("career.common.career.0wohsg4", "원문 보기")}
                  <ArrowUpRight aria-hidden className="size-3.5" />
                </BareButton>
              ) : null}
              <OpportunityAgentMessages item={item} />
            </div>
          </Row>
        ) : null}
      </dl>

      {!isInternal && onOpenSimilar ? (
        <SimilarOpportunities item={item} onOpen={onOpenSimilar} />
      ) : null}

      {process.env.NODE_ENV === "development" ? (
        <OpportunityDevelopmentMetrics item={item} className="mt-6" />
      ) : null}
    </section>
  );
}
