import React, { ReactNode } from "react";
import { CareerOpportunityType, type CareerHistoryOpportunity } from "../types";
import {
  getMetaItems,
  getOpportunityPanelTone,
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
  MapPin,
} from "lucide-react";
import { careerCx, CareerInlinePanel } from "../ui/CareerPrimitives";
import { OpportunityType } from "@/lib/opportunityType";
import OpportunityPreferenceFit from "./OpportunityPreferenceFit";

export const OpportunityHeader = ({
  item,
  layout = "responsive",
  onOpenCompanyInfo,
  onOpenOpportunityInfo,
  extraComponent,
}: {
  item: CareerHistoryOpportunity;
  layout?: "responsive" | "stacked";
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  extraComponent?: ReactNode;
}) => {
  const postedAgo = formatRelativeTime(item.postedAt);
  const companyInfoLink = item.companyHomepageUrl ?? item.companyLinkedinUrl;
  const canOpenCompanyInfo = Boolean(
    onOpenCompanyInfo || item.companyDbId || companyInfoLink
  );
  const metaItems: { label: string; value: string | null }[] = getMetaItems(
    item
  ).map((meta) => ({
    label: meta,
    value: meta,
  }));
  const detailMetaItems = [
    {
      label: "location",
      value: item.location,
    },
    ...metaItems,
  ].filter(
    (meta): meta is { label: string; value: string } =>
      typeof meta.value === "string" && meta.value.trim().length > 0
  );
  const stacked = layout === "stacked";

  return (
    <div
      className={careerCx(
        "flex w-full flex-col gap-3 relative",
        !stacked && "sm:flex-row sm:items-start sm:justify-between"
      )}
    >
      <div className="flex min-w-0 w-full flex-row items-start gap-3 sm:gap-4">
        {item.companyLogoUrl ? (
          <div className="shrink-0 flex p-1 items-center justify-center rounded-lg border border-beige900/10 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.companyLogoUrl}
              alt={item.companyName}
              className="h-10 w-10 rounded-lg object-cover"
            />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-beige900 text-beige100">
            <Building2 className="h-4 w-4" />
          </div>
        )}

        <div className="flex min-w-0 flex-col items-start w-full">
          <div className="wrap-break-word text-lg font-medium leading-tight">
            {item.title}
          </div>
          <div className="mt-2 flex w-full min-w-0 flex-wrap items-center justify-between text-sm">
            {canOpenCompanyInfo ? (
              <button
                type="button"
                onClick={() => {
                  if (onOpenCompanyInfo) {
                    onOpenCompanyInfo(item);
                    return;
                  }
                  if (companyInfoLink) {
                    window.open(
                      companyInfoLink,
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }
                }}
                className="min-w-0 wrap-break-word text-left decoration-dotted underline underline-offset-2 text-black/90 font-medium text-[14px] transition-colors hover:text-black"
              >
                {item.companyName}
              </button>
            ) : (
              <span className="min-w-0 wrap-break-word">
                {item.companyName}
              </span>
            )}
            {postedAgo ? (
              <div className="text-xs text-black/60">{postedAgo}에 게시됨</div>
            ) : (
              <></>
            )}
          </div>
          <div className="flex flex-row items-center justify-between w-full mt-2 text-sm font-normal">
            <div className="flex flex-row items-center gap-x-2">
              {detailMetaItems.map((meta, index) => (
                <span
                  key={`${item.id}-detail-meta-${index}`}
                  className="inline-flex min-w-0 items-center gap-x-1 text-black/90 text-[14px]"
                >
                  {meta.label === "location" ? (
                    <MapPin className="h-3 w-3" />
                  ) : (
                    <span className="shrink-0 mr-1">·</span>
                  )}
                  <span className="min-w-0 wrap-break-word">{meta.value}</span>
                </span>
              ))}
            </div>
            <HistoryOpportunityInfoTag
              item={item}
              onOpenInfo={onOpenOpportunityInfo}
            />
          </div>
        </div>
      </div>

      {extraComponent && (
        <div className="absolute right-[-8px] top-[-8px]">{extraComponent}</div>
      )}
    </div>
  );
};

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
  onOpenCompanyInfo,
  onOpenLink,
  onOpenOpportunityInfo,
  onMoveNext,
  onMovePrev,
}: {
  item: CareerHistoryOpportunity;
  canMoveNext?: boolean;
  canMovePrev?: boolean;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenLink: (url: string) => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  onMoveNext?: () => void;
  onMovePrev?: () => void;
}) => {
  const companyInfoLink = item.companyHomepageUrl ?? item.companyLinkedinUrl;
  const canOpenCompanyInfo = Boolean(item.companyDbId || companyInfoLink);
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
          className={careerCx("rounded-2xl p-1", getOpportunityPanelTone(item))}
        >
          <div className="flex w-full flex-col items-start justify-between rounded-2xl bg-beige50 px-5 py-6">
            <OpportunityHeader
              item={item}
              onOpenCompanyInfo={onOpenCompanyInfo}
              onOpenOpportunityInfo={onOpenOpportunityInfo}
            />

            <div className="mt-8 flex flex-col gap-3 text-sm text-black">
              {recommendationSummary && <div>{recommendationSummary}</div>}
              {item.recommendationReasons.map((reason, index) => (
                <div
                  key={`${item.id}-${index}`}
                  className="flex w-full flex-row items-center justify-start gap-1"
                >
                  <Dot className="h-5 w-5 min-w-5" />
                  <div
                    className="text-sm"
                    dangerouslySetInnerHTML={{ __html: reason }}
                  />
                </div>
              ))}
              {recommendationConcerns.map((concern, index) => (
                <div
                  key={`${item.id}-concern-${index}`}
                  className="flex w-full flex-row items-center justify-start gap-1"
                >
                  <Dot className="h-5 w-5 min-w-5" />
                  <div>불안 요소 : {concern}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-8 px-5 py-4 font-inter text-[15px] font-normal text-black/80">
            <div className="space-y-3">
              {roleLink && (
                <button
                  type="button"
                  onClick={() => onOpenLink(roleLink)}
                  className="flex min-h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-beige900 px-4 py-3 text-sm font-medium text-beige50 transition-opacity hover:opacity-95"
                >
                  JD 확인하기
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              )}
              <OpportunityPreferenceFit
                items={item.preferenceFit}
                variant="detail"
              />
            </div>
            <div className="space-y-2">
              <HistorySectionTitle
                icon={<Building2 className="h-4 w-4" />}
                title={getCareerCompanySectionTitle(item.opportunityType)}
                openText={
                  canOpenCompanyInfo
                    ? item.companyDbId
                      ? "회사 정보"
                      : "링크 열기"
                    : undefined
                }
                onClick={
                  canOpenCompanyInfo
                    ? () => {
                        if (onOpenCompanyInfo) {
                          onOpenCompanyInfo(item);
                          return;
                        }
                        if (companyInfoLink) onOpenLink(companyInfoLink);
                      }
                    : undefined
                }
              />
              <div className="h-px w-full bg-beige900/10" />
              <div className="text-sm leading-6">
                {item.companyDescription?.trim() ||
                  "아직 회사 설명이 없습니다."}
              </div>
            </div>

            <div className="space-y-2">
              <HistorySectionTitle icon={<></>} title="역할 설명" />
              <div className="h-px w-full bg-beige900/10" />
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

export default React.memo(HistoryOpportunityDetailContent);

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
      : "text-black/80";

  if (!infoTagMeta.interactive) {
    return (
      <div
        className={`flex shrink-0 flex-row items-center gap-2 text-[13px] ${textColor}`}
      >
        <LeadingIcon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenInfo(item.opportunityType)}
      className={`flex shrink-0 flex-row items-center gap-2 text-[13px] decoration-dotted underline underline-offset-2 transition-colors hover:opacity-90 ${textColor}`}
    >
      <LeadingIcon className="h-3.5 w-3.5" />
      <span>{label}</span>
      {infoTagMeta.showHelpIcon && <CircleHelp className="h-3.5 w-3.5" />}
    </button>
  );
};
