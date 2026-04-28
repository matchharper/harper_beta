import React, { ReactNode } from "react";
import { CareerOpportunityType, type CareerHistoryOpportunity } from "../types";
import {
  getMetaItems,
  getOpportunityPanelTone,
  getOpportunityStatusLabel,
  getOpportunityTypeLabel,
} from "../CareerHistoryPanel";
import {
  getCareerCompanySectionTitle,
  getCareerOpportunityInfoTagMeta,
} from "../opportunityTypeMeta";
import { formatRelativeTime } from "@/lib/utils";
import CareerRichText from "../ui/CareerRichText";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CircleHelp,
  Dot,
} from "lucide-react";
import { careerCx, CareerInlinePanel } from "../ui/CareerPrimitives";
import { OpportunityType } from "@/lib/opportunityType";

export const OpportunityHeader = ({
  item,
  onOpenOpportunityInfo,
  extraComponent,
}: {
  item: CareerHistoryOpportunity;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  extraComponent?: ReactNode;
}) => {
  const postedAgo = formatRelativeTime(item.postedAt);
  const companyInfoLink = item.companyHomepageUrl ?? item.companyLinkedinUrl;
  const metaItems = getMetaItems(item);

  return (
    <div className="flex flex-row items-start justify-between w-full">
      <div className="flex flex-row items-start gap-4">
        {item.companyLogoUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.companyLogoUrl}
              alt={item.companyName}
              className="h-10 w-10 rounded-lg object-cover"
            />
          </>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-beige900 text-beige100">
            <Building2 className="h-4 w-4" />
          </div>
        )}

        <div className="flex flex-col items-start">
          <div className="text-[18px] font-medium text-beige900">
            {item.title}
          </div>
          <div className="mt-1 flex flex-row items-center gap-2 text-[14px] text-beige900/80">
            {companyInfoLink ? (
              <button
                type="button"
                onClick={() => window.open(companyInfoLink, "_blank")}
                className="decoration-dotted underline underline-offset-2 transition-colors hover:text-beige900"
              >
                {item.companyName}
              </button>
            ) : (
              <span>{item.companyName}</span>
            )}
            {item.location && <span>· {item.location}</span>}
          </div>
          {postedAgo && (
            <div className="mt-1 text-[14px] leading-6 text-beige900/60">
              {postedAgo}에 게시됨
            </div>
          )}
        </div>
      </div>

      <div className="flex self-stretch flex-col items-end justify-between gap-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {metaItems.map((meta) => (
            <HistoryMetaPill key={`${item.id}-${meta}`}>{meta}</HistoryMetaPill>
          ))}
          {extraComponent && extraComponent}
        </div>
        <HistoryOpportunityInfoTag
          item={item}
          onOpenInfo={onOpenOpportunityInfo}
        />
      </div>
    </div>
  );
};

const HistoryMetaPill = ({ children }: { children: ReactNode }) => (
  <span className="flex items-center justify-center rounded-full border border-beige900/10 bg-white/55 px-2.5 py-1 text-[12px] leading-5 text-beige900/80">
    {children}
  </span>
);

const HistorySectionTitle = ({
  icon,
  title,
  openText,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  openText?: string;
  onClick?: () => void;
}) => (
  <div className="flex w-full flex-row items-center justify-between">
    <div className="flex items-center gap-2 text-[14px] font-medium leading-5 text-beige900">
      {icon}
      <span>{title}</span>
    </div>
    {openText && onClick && (
      <button
        type="button"
        onClick={onClick}
        className="flex flex-row items-center gap-2 text-sm text-beige900/60 transition-colors hover:text-beige900/80"
      >
        {openText}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);

const HistoryDetailArrowButton = ({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-label={direction === "prev" ? "이전 기회" : "다음 기회"}
    onClick={onClick}
    className={careerCx(
      "absolute top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-beige900/15 bg-white/85 text-beige900/70 shadow-[0_8px_24px_rgba(37,20,6,0.1)] transition-colors hover:border-beige900/30 hover:text-beige900",
      direction === "prev" ? "left-4" : "right-4"
    )}
  >
    {direction === "prev" && <ArrowLeft className="h-4 w-4" />}
    {direction === "next" && <ArrowRight className="h-4 w-4" />}
  </button>
);

const HistoryOpportunityDetailContent = ({
  item,
  canMoveNext = false,
  canMovePrev = false,
  onOpenLink,
  onOpenOpportunityInfo,
  onMoveNext,
  onMovePrev,
}: {
  item: CareerHistoryOpportunity;
  canMoveNext?: boolean;
  canMovePrev?: boolean;
  onOpenLink: (url: string) => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  onMoveNext?: () => void;
  onMovePrev?: () => void;
}) => {
  const companyInfoLink = item.companyHomepageUrl ?? item.companyLinkedinUrl;
  const roleLink = item.href;
  const recommendationSummary = item.recommendationSummary?.trim() ?? "";
  const recommendationConcerns = item.recommendationConcerns ?? [];

  return (
    <div className="space-y-4">
      <div className="relative">
        {canMovePrev && onMovePrev && (
          <HistoryDetailArrowButton direction="prev" onClick={onMovePrev} />
        )}
        {canMoveNext && onMoveNext && (
          <HistoryDetailArrowButton direction="next" onClick={onMoveNext} />
        )}
        <CareerInlinePanel
          className={careerCx(
            "rounded-[8px] p-1",
            getOpportunityPanelTone(item)
          )}
        >
          <div className="flex w-full flex-col items-start justify-between rounded-[8px] border border-beige200 bg-beige50 px-5 py-6">
            <OpportunityHeader
              item={item}
              onOpenOpportunityInfo={onOpenOpportunityInfo}
            />

            {recommendationSummary ? (
              <div className="mt-4 w-full rounded-[8px] border border-beige900/10 bg-white/65 px-4 py-3 text-sm leading-6 text-beige900/90">
                {recommendationSummary}
              </div>
            ) : null}

            {item.recommendationReasons.length > 0 && (
              <div className="mt-4 w-full space-y-2">
                {item.recommendationReasons.map((reason, index) => (
                  <div
                    key={`${item.id}-${index}`}
                    className="flex w-full flex-row items-center justify-start gap-1"
                  >
                    <Dot className="h-5 w-5" />
                    <div
                      className="text-sm text-beige900"
                      dangerouslySetInnerHTML={{ __html: reason }}
                    />
                  </div>
                ))}
              </div>
            )}

            {recommendationConcerns.length > 0 && (
              <div className="mt-4 w-full space-y-2">
                {recommendationConcerns.map((concern, index) => (
                  <div
                    key={`${item.id}-concern-${index}`}
                    className="flex w-full flex-row items-start justify-start gap-2 rounded-[8px] border border-[#d6c6a4] bg-[#fbf4e8] px-3 py-3"
                  >
                    <Dot className="mt-[2px] h-4 w-4 text-[#9a7b39]" />
                    <div className="text-sm leading-6 text-beige900/80">
                      {concern}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-8 px-5 py-5 font-inter text-[15px] font-normal text-black/80">
            <div className="space-y-2">
              <HistorySectionTitle
                icon={<Building2 className="h-4 w-4" />}
                title={getCareerCompanySectionTitle(item.opportunityType)}
                openText={companyInfoLink ? "링크 열기" : undefined}
                onClick={
                  companyInfoLink
                    ? () => onOpenLink(companyInfoLink)
                    : undefined
                }
              />
              <div className="h-[1px] w-full bg-beige900/10" />
              <div className="text-sm leading-6">
                {item.companyDescription?.trim() ||
                  "아직 회사 설명이 없습니다."}
              </div>
            </div>

            <div className="space-y-2">
              <HistorySectionTitle
                icon={<></>}
                title="역할 설명"
                openText={roleLink ? "JD 열기" : undefined}
                onClick={roleLink ? () => onOpenLink(roleLink) : undefined}
              />
              <div className="h-[1px] w-full bg-beige900/10" />
              {item.description?.trim() ? (
                <CareerRichText content={item.description} />
              ) : (
                <div className="text-sm leading-6">
                  아직 상세 역할 설명이 정리되지 않았습니다.
                </div>
              )}
            </div>
          </div>
        </CareerInlinePanel>
      </div>
    </div>
  );
};

export default HistoryOpportunityDetailContent;

export const HistoryOpportunityInfoTag = ({
  item,
  onOpenInfo,
}: {
  item: CareerHistoryOpportunity;
  onOpenInfo: (type: CareerOpportunityType) => void;
}) => {
  const label = getOpportunityTypeLabel(item);
  const infoTagMeta = getCareerOpportunityInfoTagMeta(item.opportunityType);
  const LeadingIcon = infoTagMeta.icon;
  const textColor =
    item.opportunityType === OpportunityType.IntroRequest
      ? "text-xprimary"
      : "text-beige900/80";

  if (!infoTagMeta.interactive) {
    return (
      <div className={`flex flex-row items-center gap-2 text-sm ${textColor}`}>
        <LeadingIcon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenInfo(item.opportunityType)}
      className={`flex flex-row items-center gap-2 text-sm decoration-dotted underline underline-offset-2 transition-colors hover:opacity-90 ${textColor}`}
    >
      <LeadingIcon className="h-3.5 w-3.5" />
      <span>{label}</span>
      {infoTagMeta.showHelpIcon ? <CircleHelp className="h-3.5 w-3.5" /> : null}
    </button>
  );
};
