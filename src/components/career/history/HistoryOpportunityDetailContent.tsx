import React, { ReactNode } from "react";
import { CareerOpportunityType, type CareerHistoryOpportunity } from "../types";
import {
  getMetaItems,
  getOpportunityPanelTone,
  getOpportunityTypeLabel,
} from "../CareerHistoryPanel";
import { getCareerCompanySectionTitle } from "../opportunityTypeMeta";
import RichText from "@/components/ui/rich-text";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Dot,
  HeartHandshake,
  MapPin,
} from "lucide-react";
import { InlinePanel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { OpportunityType } from "@/lib/opportunityType";
import OpportunityPreferenceFit from "./OpportunityPreferenceFit";
import { Badge } from "@/components/ui/badge";
import { getOpportunityPostingStatus } from "./opportunityPostingStatus";
import { BareButton } from "@/components/ui/button";
import { useMessages } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";

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
  const t = useCareerT();
  const { locale } = useMessages();
  const postingStatus = getOpportunityPostingStatus(item, locale, t);
  const companyInfoLink = item.companyHomepageUrl ?? item.companyLinkedinUrl;
  const canOpenCompanyInfo = Boolean(
    onOpenCompanyInfo || item.companyDbId || companyInfoLink
  );
  const metaItems: { label: string; value: string | null }[] = getMetaItems(
    item,
    t
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
      className={cn(
        "flex w-full flex-col gap-3 relative",
        !stacked && "sm:flex-row sm:items-start sm:justify-between"
      )}
    >
      <div className="flex min-w-0 w-full flex-row items-start gap-3 sm:gap-4">
        {item.companyLogoUrl ? (
          <div className="shrink-0 flex p-1 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-default">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.companyLogoUrl}
              alt={item.companyName}
              className="h-10 w-10 rounded-lg object-cover"
            />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-neutral-00">
            <Building2 className="h-4 w-4" />
          </div>
        )}

        <div className="flex min-w-0 flex-col items-start w-full">
          <div className="wrap-break-word text-lg font-medium leading-tight">
            {item.title}
          </div>
          <div className="mt-2 flex w-full min-w-0 flex-wrap items-center justify-between text-sm">
            {canOpenCompanyInfo ? (
              <BareButton
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
                className="min-w-0 wrap-break-word text-left decoration-dotted underline underline-offset-2 text-neutral-primary font-medium text-[14px] transition-colors hover:text-neutral-primary"
              >
                {item.companyName}
              </BareButton>
            ) : (
              <span className="min-w-0 wrap-break-word">
                {item.companyName}
              </span>
            )}
            {postingStatus ? (
              <div
                className={cn(
                  "text-xs",
                  postingStatus.isExpired
                    ? "font-medium text-info"
                    : "text-neutral-muted"
                )}
              >
                {postingStatus.label}
              </div>
            ) : (
              <></>
            )}
          </div>
          <div className="flex flex-row items-center justify-between w-full mt-2 text-sm font-normal">
            <div className="flex flex-row items-center gap-x-2">
              {detailMetaItems.map((meta, index) => (
                <span
                  key={`${item.id}-detail-meta-${index}`}
                  className="inline-flex min-w-0 items-center gap-x-1 text-neutral-primary text-[14px]"
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
    <div className="flex items-center gap-2 text-[14px] font-medium leading-5 text-neutral-primary">
      {icon}
      <span>{title}</span>
    </div>
    {openText && onClick && (
      <BareButton
        type="button"
        onClick={onClick}
        className="flex flex-row items-center gap-2 text-sm text-neutral-muted transition-colors hover:text-neutral-muted"
      >
        {openText}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </BareButton>
    )}
  </div>
);

const HistoryDetailArrowButton = ({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) => {
  const t = useCareerT();

  return (
    <BareButton
      type="button"
      aria-label={
        direction === "prev"
          ? t("career.common.career.0madjab", "이전 기회")
          : t("career.common.career.18neuzv", "다음 기회")
      }
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-1000-a10 bg-bg-floating text-neutral-muted transition-colors hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary",
        direction === "prev" ? "left-4" : "right-4"
      )}
    >
      {direction === "prev" && <ArrowLeft className="h-4 w-4" />}
      {direction === "next" && <ArrowRight className="h-4 w-4" />}
    </BareButton>
  );
};

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
  const t = useCareerT();

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
        <InlinePanel
          className={cn("rounded-2xl p-1", getOpportunityPanelTone(item))}
        >
          <div className="flex w-full flex-col items-start justify-between rounded-2xl bg-bg-floating px-5 py-6">
            <OpportunityHeader
              item={item}
              onOpenCompanyInfo={onOpenCompanyInfo}
              onOpenOpportunityInfo={onOpenOpportunityInfo}
            />

            {(recommendationSummary ||
              item.recommendationReasons.length > 0) && (
              <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-4 text-sm text-neutral-primary shadow-sm">
                <div className="w-full flex flex-row items-center justify-between text-neutral-muted">
                  <div>
                    {t("career.common.career.1xe09ft", "Harper가 요약한 정보")}
                  </div>
                  <div>
                    {roleLink && (
                      <BareButton
                        type="button"
                        onClick={() => onOpenLink(roleLink)}
                        className="underline underline-offset-4 cursor-pointer hover:text-neutral-primary flex flex-row items-center gap-1"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                        {t("career.common.career.0wohsg4", "JD 확인하기")}
                      </BareButton>
                    )}
                  </div>
                </div>
                <div className="h-[1px] mt-1 w-full bg-neutral-1000-a05" />
                <div className="flex flex-col gap-3 py-2">
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
                      <div>
                        {t("career.common.career.0z5xpdx", "불안 요소 :")}{" "}
                        {concern}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-8 px-5 pb-4 text-[15px] font-normal text-neutral-primary">
            <OpportunityPreferenceFit
              items={item.preferenceFit}
              variant="detail"
            />
            <div className="space-y-2">
              <HistorySectionTitle
                icon={<Building2 className="h-4 w-4" />}
                title={getCareerCompanySectionTitle(item.opportunityType, t)}
                openText={
                  canOpenCompanyInfo
                    ? item.companyDbId
                      ? t("career.common.career.0ol21b2", "회사 정보")
                      : t("career.common.career.09c4j2c", "링크 열기")
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
              <div className="h-px w-full bg-neutral-1000-a05" />
              <div className="text-sm leading-6">
                {item.companyDescription?.trim() ||
                  t(
                    "career.common.career.083cky2",
                    "아직 회사 설명이 없습니다."
                  )}
              </div>
            </div>

            <div className="space-y-2">
              <HistorySectionTitle
                icon={<></>}
                title={t("career.common.career.0f24yir", "역할 설명")}
              />
              <div className="h-px w-full bg-neutral-1000-a05" />
              {item.description?.trim() ? (
                <RichText content={item.description} />
              ) : (
                <div className="text-sm leading-6">
                  {t(
                    "career.common.career.1ugn5p7",
                    "아직 상세 역할 설명이 정리되지 않았습니다."
                  )}
                </div>
              )}
            </div>
          </div>
        </InlinePanel>
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
  const t = useCareerT();
  const label = getOpportunityTypeLabel(item, t);
  const isConnectionOpportunity =
    item.opportunityType === OpportunityType.InternalRecommendation ||
    item.opportunityType === OpportunityType.IntroRequest;
  const textColor = isConnectionOpportunity
    ? "bg-black text-neutral-00"
    : "bg-bg-weak text-neutral-primary";

  return (
    <Badge
      onClick={() => onOpenInfo(item.opportunityType)}
      icon={
        isConnectionOpportunity ? (
          <HeartHandshake className="h-3.5 w-3.5 text-neutral-00" />
        ) : undefined
      }
      className={`flex shrink-0 flex-row items-center gap-2 text-[13px] transition-colors hover:opacity-90 ${textColor}`}
    >
      {label}
    </Badge>
  );
};
