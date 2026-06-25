import React, { ReactNode, useState } from "react";
import { CareerOpportunityType, type CareerHistoryOpportunity } from "../types";
import {
  getMetaItems,
  getOpportunityPanelTone,
  getOpportunityStatusLabel,
  getOpportunityTypeLabel,
} from "../CareerHistoryPanel";
import { getCareerCompanySectionTitle } from "../opportunityTypeMeta";
import RichText from "@/components/ui/rich-text";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronRight,
  Dot,
  EllipsisVertical,
  FileText,
  HeartHandshake,
  Loader2,
  MapPin,
  StickyNote,
} from "lucide-react";
import { InlinePanel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { OpportunityType } from "@/lib/opportunityType";
import { Badge } from "@/components/ui/badge";
import { getOpportunityPostingStatus } from "./opportunityPostingStatus";
import OpportunityPreferenceFit from "./OpportunityPreferenceFit";
import { BareButton } from "@/components/ui/button";
import { useMessages } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import {
  getCareerOpportunityManagementStatusLabel,
  getCareerOpportunityManagementStatusOptions,
  type CareerOpportunityManagementStatus,
} from "./savedOpportunityStatus";

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
    <div className="w-full">
      <div className="mb-4 flex w-fit flex-wrap items-center gap-2">
        <HistoryOpportunityInfoTag
          item={item}
          onOpenInfo={onOpenOpportunityInfo}
        />
        <HistoryOpportunityStatusTag item={item} />
      </div>

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
            <div className="wrap-break-word text-[16px] font-medium leading-tight sm:text-lg">
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
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {detailMetaItems.map((meta, index) => (
                  <span
                    key={`${item.id}-detail-meta-${index}`}
                    className="inline-flex min-w-0 items-center gap-x-1 text-[13px] text-neutral-primary sm:text-[14px]"
                  >
                    {meta.label === "location" ? (
                      <MapPin className="h-3 w-3" />
                    ) : (
                      <span className="shrink-0 mr-1">·</span>
                    )}
                    <span className="min-w-0 wrap-break-word">
                      {meta.value}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {extraComponent && (
          <div className="absolute right-[-8px] top-[-8px]">
            {extraComponent}
          </div>
        )}
      </div>
    </div>
  );
};

export const HistoryOpportunityOverview = ({
  className,
  item,
  onOpenCompanyInfo,
  onOpenLink,
  onOpenOpportunityInfo,
}: {
  className?: string;
  item: CareerHistoryOpportunity;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenLink: (url: string) => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
}) => {
  const t = useCareerT();
  const roleLink = item.href;
  const recommendationSummary = item.recommendationSummary?.trim() ?? "";
  const recommendationConcerns = item.recommendationConcerns ?? [];
  const hasRecommendationContent =
    Boolean(recommendationSummary) || item.recommendationReasons.length > 0;
  const hasStandaloneJdButton = Boolean(roleLink) && !hasRecommendationContent;

  return (
    <div className={cn("flex w-full flex-col items-start", className)}>
      <OpportunityHeader
        item={item}
        onOpenCompanyInfo={onOpenCompanyInfo}
        onOpenOpportunityInfo={onOpenOpportunityInfo}
      />

      {hasRecommendationContent && (
        <div className="mt-6 flex w-full flex-col gap-3 rounded-xl border border-neutral-1000-a05 bg-bg-floating p-3 text-[13px] leading-6 text-neutral-primary shadow-sm sm:rounded-2xl sm:p-4 sm:text-sm">
          <div className="flex w-full flex-row items-center justify-between gap-3 text-neutral-muted">
            <div className="min-w-0">
              {t("career.common.career.1xe09ft", "Harper가 요약한 정보")}
            </div>
            <div className="shrink-0">
              {roleLink && (
                <BareButton
                  type="button"
                  onClick={() => onOpenLink(roleLink)}
                  className="flex cursor-pointer flex-row items-center gap-1 underline underline-offset-4 hover:text-neutral-primary"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  {t("career.common.career.0wohsg4", "JD 확인하기")}
                </BareButton>
              )}
            </div>
          </div>
          <div className="mt-1 h-[1px] w-full bg-neutral-1000-a05" />
          <div className="flex flex-col gap-3 py-2">
            {recommendationSummary && <div>{recommendationSummary}</div>}
            {item.recommendationReasons.map((reason, index) => (
              <div
                key={`${item.id}-${index}`}
                className="flex w-full flex-row items-start justify-start gap-1"
              >
                <Dot className="mt-0.5 h-5 w-5 min-w-5" />
                <div
                  className="min-w-0 text-sm"
                  dangerouslySetInnerHTML={{ __html: reason }}
                />
              </div>
            ))}
            {recommendationConcerns.map((concern, index) => (
              <div
                key={`${item.id}-concern-${index}`}
                className="flex w-full flex-row items-start justify-start gap-1"
              >
                <Dot className="mt-0.5 h-5 w-5 min-w-5" />
                <div className="min-w-0">
                  {t("career.common.career.0z5xpdx", "불안 요소 :")} {concern}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasStandaloneJdButton && (
        <BareButton
          type="button"
          onClick={() => {
            if (roleLink) onOpenLink(roleLink);
          }}
          className="mt-5 bg-neutral-200 hover:bg-neutral-300 inline-flex min-h-10 items-center justify-center w-full gap-2 rounded-md px-4 text-[13px] font-normal"
        >
          {t("career.common.career.0wohsg4", "JD 확인하기")}
          <ArrowUpRight className="h-4 w-4" />
        </BareButton>
      )}

      <OpportunityPreferenceFit
        className="mt-4"
        items={item.preferenceFit}
        variant="detail"
      />
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

const HistoryOpportunityAdditionalDetails = ({
  className,
  includeSource = false,
  item,
  onOpenCompanyInfo,
  onOpenLink,
}: {
  className?: string;
  includeSource?: boolean;
  item: CareerHistoryOpportunity;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenLink: (url: string) => void;
}) => {
  const t = useCareerT();
  const companyInfoLink = item.companyHomepageUrl ?? item.companyLinkedinUrl;
  const canOpenCompanyInfo = Boolean(item.companyDbId || companyInfoLink);
  const sourceLink = item.externalJdUrl ?? item.href;

  return (
    <div
      className={cn(
        "flex flex-col gap-8 text-[14px] font-normal text-neutral-primary sm:text-[15px]",
        className
      )}
    >
      <div className="space-y-2">
        <HistorySectionTitle
          icon={<Building2 className="h-4 w-4" />}
          title={
            includeSource
              ? t(
                  "career.history.opportunity_detail_content.company_source",
                  "회사 / 출처"
                )
              : getCareerCompanySectionTitle(item.opportunityType, t)
          }
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
            t("career.common.career.083cky2", "아직 회사 설명이 없습니다.")}
        </div>
      </div>

      <div className="space-y-2">
        <HistorySectionTitle
          icon={<FileText className="h-4 w-4" />}
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
  );
};

const OpportunityManagementStatusDropdown = ({
  disabled,
  status,
  onChange,
}: {
  disabled: boolean;
  status: CareerOpportunityManagementStatus;
  onChange: (value: CareerOpportunityManagementStatus) => void;
}) => {
  const t = useCareerT();
  const options = getCareerOpportunityManagementStatusOptions(t);
  const statusLabel = getCareerOpportunityManagementStatusLabel(status, t);

  return (
    <ActionDropdown
      align="end"
      contentClassName="min-w-[190px]"
      trigger={
        <BareButton
          type="button"
          aria-label={t(
            "career.history.opportunity_detail_content.status_menu",
            "{status} 상태 변경",
            { values: { status: statusLabel } }
          )}
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-neutral-200 text-neutral-primary transition-colors hover:bg-neutral-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <EllipsisVertical className="h-4 w-4" />
        </BareButton>
      }
    >
      {options.map((option) => (
        <ActionDropdownItem
          key={option.id}
          selected={option.id === status}
          disabled={disabled}
          onSelect={() => onChange(option.id)}
        >
          {option.label}
        </ActionDropdownItem>
      ))}
    </ActionDropdown>
  );
};

const HistoryOpportunityMemoSection = ({
  item,
  onUpdateTalentMemo,
  pending,
}: {
  item: CareerHistoryOpportunity;
  onUpdateTalentMemo?: (
    item: CareerHistoryOpportunity,
    talentMemo: string | null
  ) => void | Promise<void>;
  pending: boolean;
}) => {
  const t = useCareerT();
  const [editState, setEditState] = useState<{
    draft: string;
    itemId: string;
  } | null>(null);
  const talentMemo = item.talentMemo?.trim() ?? "";
  const canEdit = Boolean(onUpdateTalentMemo);
  const editing = editState?.itemId === item.id;
  const draft = editing ? editState.draft : (item.talentMemo ?? "");

  if (!canEdit && !talentMemo) return null;

  const handleSubmit = () => {
    if (!onUpdateTalentMemo) return;
    const nextMemo = draft.trim() || null;
    void Promise.resolve(onUpdateTalentMemo(item, nextMemo)).then(() => {
      setEditState(null);
    });
  };

  return (
    <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[14px] font-medium leading-5 text-neutral-primary">
          <StickyNote className="h-4 w-4" />
          <span>
            {t("career.history.opportunity_detail_content.memo", "내 메모")}
          </span>
        </div>
        {canEdit && !editing && (
          <BareButton
            type="button"
            onClick={() =>
              setEditState({ draft: item.talentMemo ?? "", itemId: item.id })
            }
            disabled={pending}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-neutral-1000-a05 bg-bg-floating px-2.5 text-[13px] font-medium text-neutral-primary transition-colors hover:border-neutral-400 hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-60"
          >
            <StickyNote className="h-3.5 w-3.5" />
            {talentMemo
              ? t(
                  "career.history.opportunity_detail_content.edit_memo",
                  "메모 수정"
                )
              : t(
                  "career.history.opportunity_detail_content.add_memo",
                  "메모 추가하기"
                )}
          </BareButton>
        )}
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <UiTextarea
            value={draft}
            onChange={(event) =>
              setEditState({ draft: event.target.value, itemId: item.id })
            }
            disabled={pending}
            placeholder={t(
              "career.history.feedback_modal.12volkp",
              "이 포지션에 대해 기억해둘 내용이나 확인할 점을 적어주세요."
            )}
            className="min-h-[128px]"
          />
          <div className="flex items-center justify-end gap-2">
            <BareButton
              type="button"
              onClick={() => {
                setEditState(null);
              }}
              disabled={pending}
              className="inline-flex min-h-8 items-center rounded-md px-3 text-[13px] font-medium text-neutral-muted transition-colors hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("career.settings.career_settings_modal.0jiry9t", "취소")}
            </BareButton>
            <BareButton
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md bg-black px-3 text-[13px] font-medium text-neutral-00 transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("career.history.feedback_modal.1xp6hfy", "저장")}
            </BareButton>
          </div>
        </div>
      ) : talentMemo ? (
        <div className="mt-3 whitespace-pre-wrap text-[14px] leading-6 text-neutral-primary">
          {talentMemo}
        </div>
      ) : null}
    </section>
  );
};

export const HistoryOpportunityInlinePage = ({
  className,
  item,
  onBack,
  onOpenCompanyInfo,
  onOpenLink,
  onOpenOpportunityInfo,
  onSavedStatusChange,
  onUpdateTalentMemo,
  pending,
  savedStatus,
}: {
  className?: string;
  item: CareerHistoryOpportunity;
  onBack: () => void;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenLink: (url: string) => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  onSavedStatusChange?: (value: CareerOpportunityManagementStatus) => void;
  onUpdateTalentMemo?: (
    item: CareerHistoryOpportunity,
    talentMemo: string | null
  ) => void | Promise<void>;
  pending: boolean;
  savedStatus?: CareerOpportunityManagementStatus;
}) => {
  const t = useCareerT();
  const [detailState, setDetailState] = useState<{
    itemId: string;
    open: boolean;
  } | null>(null);
  const showDetails =
    detailState?.itemId === item.id ? detailState.open : false;

  return (
    <section className={cn("min-w-0 pb-8 text-neutral-primary", className)}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex min-w-0 items-center gap-1 text-[13px] leading-5 text-neutral-muted">
          <BareButton
            type="button"
            onClick={onBack}
            className="shrink-0 font-medium text-neutral-muted transition-colors hover:text-neutral-primary"
          >
            {t("career.common.career_workspace_screen.0jpahnv", "포지션")}
          </BareButton>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-soft" />
          <span
            className="min-w-0 truncate font-medium text-neutral-primary"
            title={item.title}
          >
            {item.title}
          </span>
        </nav>

        {savedStatus && onSavedStatusChange ? (
          <div className="flex max-w-full justify-start sm:justify-end">
            <OpportunityManagementStatusDropdown
              disabled={pending}
              status={savedStatus}
              onChange={onSavedStatusChange}
            />
          </div>
        ) : null}
      </div>

      <HistoryOpportunityOverview
        item={item}
        onOpenCompanyInfo={onOpenCompanyInfo}
        onOpenLink={onOpenLink}
        onOpenOpportunityInfo={onOpenOpportunityInfo}
      />

      <HistoryOpportunityMemoSection
        item={item}
        pending={pending}
        onUpdateTalentMemo={onUpdateTalentMemo}
      />

      <div className="mt-6 border-t border-neutral-1000-a05 pt-5">
        <BareButton
          type="button"
          onClick={() =>
            setDetailState({ itemId: item.id, open: !showDetails })
          }
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-neutral-1000-a05 bg-bg-floating px-3 text-[13px] font-medium text-neutral-primary transition-colors hover:border-neutral-400 hover:bg-bg-weak"
        >
          {showDetails
            ? t(
                "career.history.opportunity_detail_content.hide_detail",
                "상세보기 접기"
              )
            : t(
                "career.history.opportunity_detail_content.show_detail",
                "상세보기"
              )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-neutral-muted transition-transform",
              showDetails && "rotate-180"
            )}
          />
        </BareButton>
      </div>

      {showDetails && (
        <HistoryOpportunityAdditionalDetails
          item={item}
          includeSource
          onOpenCompanyInfo={onOpenCompanyInfo}
          onOpenLink={onOpenLink}
          className="mt-5"
        />
      )}
    </section>
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
          <div className="flex w-full flex-col items-start justify-between rounded-2xl bg-bg-floating px-5 py-4">
            <HistoryOpportunityOverview
              item={item}
              onOpenCompanyInfo={onOpenCompanyInfo}
              onOpenLink={onOpenLink}
              onOpenOpportunityInfo={onOpenOpportunityInfo}
            />
          </div>

          <HistoryOpportunityAdditionalDetails
            item={item}
            onOpenCompanyInfo={onOpenCompanyInfo}
            onOpenLink={onOpenLink}
            className="px-5 pb-4"
          />
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
    ? "bg-primary-faded text-primary"
    : "bg-bg-weak text-neutral-primary";

  return (
    <Badge
      onClick={() => onOpenInfo(item.opportunityType)}
      icon={
        isConnectionOpportunity ? (
          <HeartHandshake className="h-3.5 w-3.5 text-primary" />
        ) : undefined
      }
      className={`flex shrink-0 flex-row items-center gap-2 text-xs md:text-[13px] transition-colors hover:opacity-90 ${textColor}`}
    >
      {label}
    </Badge>
  );
};

export const HistoryOpportunityStatusTag = ({
  item,
}: {
  item: CareerHistoryOpportunity;
}) => {
  const t = useCareerT();
  const label = getOpportunityStatusLabel(item, t);

  if (!label) return null;

  return (
    <Badge className="flex shrink-0 flex-row items-center gap-2 bg-bg-weak text-xs text-neutral-muted md:text-[13px]">
      {label}
    </Badge>
  );
};
