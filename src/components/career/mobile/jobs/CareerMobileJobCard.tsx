"use client";

import Image from "next/image";
import React from "react";
import { Building2, Dot, MapPin } from "lucide-react";
import type {
  CareerHistoryOpportunity,
  CareerOpportunityType,
} from "@/components/career/types";
import { getMetaItems } from "@/components/career/CareerHistoryPanel";
import {
  getKnownCompanyDataText,
  HistoryOpportunityFundingStageText,
  HistoryOpportunityInfoTag,
} from "@/components/career/history/HistoryOpportunityDetailContent";
import { getOpportunityPostingStatus } from "@/components/career/history/opportunityPostingStatus";
import {
  canChangeCareerOpportunityManagementStatus,
  type CareerOpportunityManagementStatus,
} from "@/components/career/history/savedOpportunityStatus";
import { CareerMobileJobStatusDropdown } from "@/components/career/mobile/jobs/CareerMobileJobStatusDropdown";
import { BareButton } from "@/components/ui/button";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { InlinePanel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { InternalOpportunityDecisionMenu } from "@/components/career/history/InternalOpportunityDecisionActions";
import type { CareerInternalOpportunityDecisionAction } from "@/lib/career/internalOpportunityDecision";
import { normalizeHarperPublicImageUrl } from "@/lib/imageUrl";

type CareerMobileJobCardProps = {
  item: CareerHistoryOpportunity;
  pending: boolean;
  status: CareerOpportunityManagementStatus;
  onOpenDetail: () => void;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo?: (type: CareerOpportunityType) => void;
  onInternalDecisionAction?: (
    action: CareerInternalOpportunityDecisionAction
  ) => void;
  onStatusChange?: (status: CareerOpportunityManagementStatus) => void;
};

export const CareerMobileJobCard = React.memo(function CareerMobileJobCard({
  item,
  pending,
  status,
  onOpenDetail,
  onOpenCompanyInfo,
  onOpenOpportunityInfo,
  onInternalDecisionAction,
  onStatusChange,
}: CareerMobileJobCardProps) {
  const t = useCareerT();
  const { locale } = useMessages();
  const postingStatus = getOpportunityPostingStatus(item, locale, t);
  const recommendationSummary = item.recommendationSummary?.trim() ?? "";
  const recommendationReasons = item.recommendationReasons.slice(0, 2);
  const recommendationConcerns = (item.recommendationConcerns ?? []).slice(
    0,
    1
  );
  const companyInfoLink = item.companyHomepageUrl ?? item.companyLinkedinUrl;
  const companyLogoSrc = normalizeHarperPublicImageUrl(item.companyLogoUrl);
  const canChangeStatus = canChangeCareerOpportunityManagementStatus(item);
  const canOpenCompanyInfo = Boolean(
    onOpenCompanyInfo && (item.companyDbId || companyInfoLink)
  );
  const lastFundingStage = getKnownCompanyDataText(
    item.companyData?.lastFundingStage
  );
  const detailMetaItems = [
    {
      label: "location",
      value: formatCareerLocation(item.location, locale),
    },
    ...getMetaItems(item, t).map((meta) => ({
      label: meta,
      value: meta,
    })),
  ].filter(
    (meta): meta is { label: string; value: string } =>
      typeof meta.value === "string" && meta.value.trim().length > 0
  );

  return (
    <InlinePanel className="relative rounded-[8px] border border-neutral-1000-a05 bg-bg-floating p-4 transition-colors active:bg-bg-weak">
      <div className="absolute right-2 top-2 z-10">
        {item.isInternal && onInternalDecisionAction ? (
          <InternalOpportunityDecisionMenu
            onCard
            item={item}
            pending={pending}
            onAction={onInternalDecisionAction}
          />
        ) : onStatusChange && canChangeStatus ? (
          <CareerMobileJobStatusDropdown
            disabled={pending}
            status={status}
            onChange={onStatusChange}
          />
        ) : null}
      </div>
      <ClickablePanel
        onActivate={onOpenDetail}
        className="min-w-0 cursor-pointer text-left"
      >
        <article className="min-w-0">
          <div className="w-fit mb-3">
            {onOpenOpportunityInfo && (
              <HistoryOpportunityInfoTag
                item={item}
                onOpenInfo={onOpenOpportunityInfo}
              />
            )}
          </div>
          <header className="flex items-start gap-3">
            <div className="flex shrink-0 items-center justify-center rounded-md border border-neutral-1000-a05 bg-bg-floating p-1">
              {companyLogoSrc ? (
                <Image
                  src={companyLogoSrc}
                  alt={item.companyName}
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-neutral-00">
                  <Building2 className="h-4 w-4" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="wrap-break-word text-[15px] font-medium leading-tight text-neutral-primary pr-4">
                {item.title}
              </h3>
              <div className="mt-2 flex min-w-0 flex-row flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[13px]">
                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1">
                  {canOpenCompanyInfo ? (
                    <BareButton
                      type="button"
                      onClick={() => onOpenCompanyInfo?.(item)}
                      className="min-w-0 wrap-break-word text-left text-[14px] font-medium text-neutral-primary decoration-dotted underline underline-offset-2 transition-colors duration-200 hover:text-primary"
                    >
                      {item.companyName}
                    </BareButton>
                  ) : (
                    <span className="min-w-0 wrap-break-word text-[14px] font-medium text-neutral-primary">
                      {item.companyName}
                    </span>
                  )}
                  <HistoryOpportunityFundingStageText
                    lastFundingStage={lastFundingStage}
                  />
                </div>
                {postingStatus ? (
                  <span
                    className={cn(
                      "shrink-0 text-[12px] leading-4",
                      postingStatus.isExpired
                        ? "font-medium text-info"
                        : "text-neutral-muted"
                    )}
                  >
                    {postingStatus.label}
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          <div className="mt-3 flex w-full flex-col items-start gap-2 text-[13px] font-normal text-neutral-primary">
            <div className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1.5">
              {detailMetaItems.map((meta, index) => (
                <span
                  key={`${item.id}-mobile-meta-${index}`}
                  className="inline-flex min-w-0 items-center gap-x-1"
                >
                  {meta.label === "location" ? (
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span className="shrink-0">·</span>
                  )}
                  <span className="min-w-0 wrap-break-word">{meta.value}</span>
                </span>
              ))}
            </div>
          </div>

          {recommendationSummary ||
          recommendationReasons.length > 0 ||
          recommendationConcerns.length > 0 ? (
            <div className="mt-4 space-y-3 text-[13px] leading-5 text-neutral-primary">
              {recommendationSummary ? (
                <div>{recommendationSummary}</div>
              ) : null}
              {recommendationReasons.map((reason, index) => (
                <div
                  key={`${item.id}-mobile-reason-${index}`}
                  className="flex items-start gap-1"
                >
                  <Dot className="mt-1 h-4 w-4 min-w-4 text-neutral-soft" />
                  <div
                    className="line-clamp-2 min-w-0"
                    dangerouslySetInnerHTML={{ __html: reason }}
                  />
                </div>
              ))}
              {recommendationConcerns.map((concern, index) => (
                <div
                  key={`${item.id}-mobile-concern-${index}`}
                  className="flex items-start gap-1"
                >
                  <Dot className="mt-1 h-4 w-4 min-w-4 text-neutral-soft" />
                  <div className="min-w-0 text-neutral-muted">
                    {t(
                      "career.history.opportunity_list_card.0l12x89",
                      "주의 요소 :"
                    )}{" "}
                    {concern}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      </ClickablePanel>
    </InlinePanel>
  );
});
