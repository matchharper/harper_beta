import { useCareerWorkspaceNavigation } from "./CareerWorkspaceNavigationContext";
import ProgressOpportunityList from "./history/ProgressOpportunityList";
import { useOpportunityStatusChange } from "@/hooks/career/useOpportunityStatusChange";
import { useEventCallback } from "@/hooks/useEventCallback";
import type { CareerInternalOpportunityDecisionAction } from "@/lib/career/internalOpportunityDecision";
import {
  ArrowRight,
  BriefcaseBusiness,
  ClipboardCheck,
  FileCheck2,
  ListChecks,
  Loader2,
  MapPin,
  Search,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";
import {
  useCareerHistoryContext,
  useCareerSidebarContext,
} from "./CareerSidebarContext";
import CareerOpportunityTabs from "./history/CareerOpportunityTabs";
import { PrimaryButton, BareButton, MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InlinePanel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import {
  CareerOpportunityType,
  type CareerHistoryOpportunity,
  type CareerHistoryOpportunityFeedback,
  type CareerOpportunitySavedStage,
} from "./types";
import {
  EXTERNAL_ALREADY_APPLIED_FEEDBACK_REASON,
  getCareerDefaultSavedStageForOpportunity,
  getCareerNegativeActionLabel,
  getCareerOpportunityInfoCopy,
  getCareerOpportunityPanelToneClassName,
  getCareerOpportunityTypeLabel,
  getCareerPositiveActionLabel,
} from "./opportunityTypeMeta";
import {
  compareNewOpportunityHistoryOrder,
} from "@/lib/opportunityType";
import {
  HistoryNegativeFeedbackModal,
  hasExternalAlreadyAppliedFeedbackReason,
  parseNegativeFeedbackReason,
  serializeNegativeFeedbackReason,
} from "./history/FeedbackModal";
import OpportunityListCard from "./history/OpportunityListCard";
import { HistoryOpportunityInlinePage } from "./history/HistoryOpportunityDetailContent";
import HistoryOpportunityInfoModal from "./history/HistoryOppotunityInfoModal";
import NewOpportunityList from "./history/NewOpportunityList";
import ExternalOpportunityApplyModal from "./history/ExternalOpportunityApplyModal";
import CareerCompanyDetailDrawer from "./watchlist/CareerCompanyDetailDrawer";
import InternalConnectionAcceptanceModal from "./InternalConnectionAcceptanceModal";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import React from "react";
import {
  canChangeCareerOpportunityManagementStatus,
  getMyOpportunityTab,
  getMyOpportunityTabs,
  getCareerOpportunityManagementStatus,
  getSavedOpportunityManagementStatus,
  getSavedOpportunityStatusFromQuery,
  getSavedOpportunityStatusQueryValue,
  getSavedStageForManagementStatus,
  type CareerOpportunityManagementStatus,
  type SavedOpportunityManagementStatus,
} from "./history/savedOpportunityStatus";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import SavedOpportunityList from "./history/SavedOpportunityList";
import { getJobsTabTotal, useCareerMobileHistoryOpportunities } from "@/hooks/career/useCareerMobileHistoryOpportunities";
import {
  InternalOpportunityDecisionChangeModal,
  type InternalOpportunityDecisionChangeRequest,
} from "./history/InternalOpportunityDecisionActions";
import { getHistoryOpportunityBucket, isSavedHistoryOpportunity } from "@/hooks/career/careerSessionData";
import CareerJobLinkImportButton from "./history/CareerJobLinkImportButton";
import OpportunitySearch from "./history/OpportunitySearch";
type HistoryTabId = "new" | "saved" | "archived";
type HistoryDisplayTabId = "new" | "saved" | "applied" | "hidden" | "archived";

const HISTORY_TAB_QUERY_KEY = "historyTab";
const HISTORY_SAVED_STAGE_QUERY_KEY = "savedStage";
const HISTORY_ROLE_QUERY_KEY = "id";
const CAREER_HISTORY_PATHNAME = "/career/history";
const CAREER_PREVIEW_PATHNAME = "/career/preview";

const isHistoryTabId = (value: unknown): value is HistoryTabId =>
  value === "new" || value === "saved" || value === "archived";

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getNormalizedQueryValue = (value: string | string[] | undefined) =>
  String(getQueryValue(value) ?? "").trim();

const getNormalizedPathname = (path: string) =>
  path.split(/[?#]/)[0]?.replace(/\/+$/, "") || "/career";

const getCareerHistoryLocationPathname = (path: string) =>
  getNormalizedPathname(path) === CAREER_PREVIEW_PATHNAME
    ? CAREER_PREVIEW_PATHNAME
    : CAREER_HISTORY_PATHNAME;

const isCareerHistoryPanelPathname = (path: string) => {
  const pathname = getNormalizedPathname(path);
  return (
    pathname === CAREER_HISTORY_PATHNAME || pathname === CAREER_PREVIEW_PATHNAME
  );
};

const getOpportunityUrlRoleId = (item: CareerHistoryOpportunity | null) =>
  String(item?.roleId ?? "").trim();

const compareRecommendedAtDesc = (
  left: CareerHistoryOpportunity,
  right: CareerHistoryOpportunity
) => Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt);

type CareerTHelper = ReturnType<typeof useCareerT>;

const fallbackCareerT: CareerTHelper = (_key, koSource) => koSource;

export const formatEmploymentType = (value: string, tArg?: CareerTHelper) => {
  const t = tArg ?? fallbackCareerT;
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  if (!normalized) return null;
  if (normalized === "full_time")
    return t("career.onboarding.onboarding.166o9pn", "풀타임");
  if (normalized === "part_time")
    return t("career.common.career_history_panel.090irfh", "파트타임");
  if (normalized === "internship")
    return t("career.common.career_history_panel.0sbhtqh", "인턴");
  if (normalized === "contract")
    return t("career.common.career_history_panel.1rvnrzl", "계약직");
  if (normalized === "fractional") return "Fractional";
  return value.trim().replaceAll("_", " ");
};

export const formatWorkMode = (value: string | null, tArg?: CareerTHelper) => {
  const t = tArg ?? fallbackCareerT;
  if (value === "remote")
    return t("career.common.career_history_panel.0gesjui", "원격근무");
  if (value === "hybrid")
    return t("career.common.career_history_panel.0taw0z7", "대면 + 원격");
  if (value === "onsite")
    return t("career.common.career_history_panel.06sq5fd", "대면근무");
  return value;
};

const getDefaultSavedStage = (item: CareerHistoryOpportunity) =>
  getCareerDefaultSavedStageForOpportunity(item);

export const getResolvedSavedStage = (item: CareerHistoryOpportunity) =>
  item.savedStage ?? getDefaultSavedStage(item);

const isNewOpportunity = (item: CareerHistoryOpportunity) =>
  getHistoryOpportunityBucket(item) === "new";

const isSavedOpportunity = isSavedHistoryOpportunity;

const isArchivedOpportunity = (item: CareerHistoryOpportunity) =>
  getHistoryOpportunityBucket(item) === "archived";

export const getPositiveActionLabel = (
  item: CareerHistoryOpportunity,
  t?: CareerTHelper
) => getCareerPositiveActionLabel(item.opportunityType, t);

export const getNegativeActionLabel = (
  item: CareerHistoryOpportunity,
  t?: CareerTHelper
) => getCareerNegativeActionLabel(item.opportunityType, t);

export const getOpportunityTypeLabel = (
  item: CareerHistoryOpportunity,
  t: CareerTHelper = fallbackCareerT
) =>
  item.hiringPost && !item.isInternal
    ? t(
        "career.history.hiring_post.label",
        // career-i18n-skip-next-line: localized fallback for exported helper.
        "채용 글"
      )
    : item.isUserAdded
    ? t(
        "career.history.job_link_import.source_label",
        // career-i18n-skip-next-line: localized fallback for exported helper.
        "직접 추가한 기회"
      )
    : getCareerOpportunityTypeLabel(item.opportunityType, t);

export const getOpportunityInfoCopy = (
  opportunityType: CareerOpportunityType,
  t?: CareerTHelper
) => getCareerOpportunityInfoCopy(opportunityType, t);

export const getSavedStageLabel = (
  stage: CareerOpportunitySavedStage,
  item: CareerHistoryOpportunity,
  tArg?: CareerTHelper
) => {
  const t = tArg ?? fallbackCareerT;
  if (stage === "applied") {
    return t("career.common.career_history_panel.applied", "지원함");
  }
  if (stage === "connected")
    return t("career.common.career_history_panel.0y27adb", "진행중");
  if (stage === "closed")
    return t("career.common.career_history_panel.1hsndwk", "진행 종료");
  if (stage === "hidden")
    return t("career.common.career_history_panel.1aylp85", "보관함");
  return t("career.common.career_history_panel.interested_status", "관심 있음");
};

export const getOpportunityStatusLabel = (
  item: CareerHistoryOpportunity,
  tArg?: CareerTHelper
) => {
  const t = tArg ?? fallbackCareerT;
  if (item.feedback === "negative")
    return t("career.common.career_history_panel.1vrs10j", "숨긴 포지션");
  if (isSavedHistoryOpportunity(item)) {
    return getSavedStageLabel(getResolvedSavedStage(item), item, t);
  }
  return null;
};

export const getMetaItems = (
  item: CareerHistoryOpportunity,
  t?: CareerTHelper
) =>
  [
    formatWorkMode(item.workMode, t),
    ...item.employmentTypes.map((value) => formatEmploymentType(value, t)),
  ].filter(Boolean) as string[];

export const getOpportunityPanelTone = (item: CareerHistoryOpportunity) =>
  getCareerOpportunityPanelToneClassName(item.opportunityType);

export const HistoryFeedbackButton = ({
  className,
  disabled,
  hint,
  icon,
  label,
  onClick,
}: {
  className: string;
  disabled: boolean;
  hint?: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <BareButton
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "flex min-h-[40px] w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm leading-5 transition-colors disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
  >
    <span className="flex items-center gap-2">
      {icon}
      <span>{label}</span>
    </span>
    {hint ? <span className="text-[12px]">{hint}</span> : null}
  </BareButton>
);

type HistoryEmptyStateVariant = "onboarding" | "searching" | "matching";

const HistoryEmptyStateDetail = ({
  body,
  icon,
  title,
}: {
  body: string;
  icon: ReactNode;
  title: string;
}) => (
  <div className="px-2 flex min-w-0 gap-3 border-t border-neutral-1000-a05 py-4 first:border-t-0 xl:block xl:border-t-0 xl:py-0 xl:pl-4 xl:first:pl-0">
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-weak text-neutral-primary">
      {icon}
    </span>
    <div className="min-w-0 xl:mt-3">
      <div className="text-[13px] font-medium leading-5 text-neutral-primary">
        {title}
      </div>
      <div className="mt-1.5 text-[12px] leading-5 text-neutral-muted">
        {body}
      </div>
    </div>
  </div>
);

const HistoryEmptyStatePanel = ({
  onOpenChat,
  variant,
}: {
  onOpenChat: () => void;
  variant: HistoryEmptyStateVariant;
}) => {
  const t = useCareerT();

  const config =
    variant === "searching"
      ? {
          actionLabel: null,
          details: [
            {
              body: t(
                "career.common.career_history_panel.0rwgnws",
                "프로필과 대화에서 강한 경력 신호를 정리합니다."
              ),
              icon: <FileCheck2 className="h-3.5 w-3.5" />,
              title: t(
                "career.common.career_history_panel.0cxzeie",
                "신호 정리"
              ),
            },
            {
              body: t(
                "career.common.career_history_panel.0fw7sr6",
                "네트워크와 공개 포지션을 같은 기준으로 비교합니다."
              ),
              icon: <Search className="h-3.5 w-3.5" />,
              title: t(
                "career.common.career_history_panel.06l333i",
                "포지션 탐색"
              ),
            },
            {
              body: t(
                "career.common.career_history_panel.12v6hq4",
                "조건에 맞는 포지션만 새 목록에 남깁니다."
              ),
              icon: <Target className="h-3.5 w-3.5" />,
              title: t(
                "career.common.career_history_panel.0xu63p6",
                "적합도 정렬"
              ),
            },
          ],
          eyebrow: t(
            "career.common.career_history_panel.0s6myeq",
            "탐색 진행 중"
          ),
          icon: <Loader2 className="h-5 w-5 animate-spin" />,
          title: t(
            "career.common.career_history_panel.00rerkr",
            "좋은 기회를 찾고 있습니다."
          ),
          toneClassName: "bg-surface-inverse text-neutral-00",
          nextStep: t(
            "career.common.career_history_panel.1p6gpzi",
            "검토가 끝난 포지션은 새 포지션 탭에 바로 표시됩니다."
          ),
          body: (
            <>
              {t(
                "career.common.career_history_panel.1ijllph",
                "기준에 맞는 포지션만 남기고 있습니다. 준비되면 새 포지션에 표시됩니다."
              )}
            </>
          ),
        }
      : variant === "onboarding"
        ? {
            actionLabel: t(
              "career.common.career_history_panel.11oeye3",
              "Harper와 대화하기"
            ),
            details: [
              {
                body: t(
                  "career.common.career_history_panel.0jj9mjx",
                  "다음에 맡고 싶은 역할과 레벨을 확인합니다."
                ),
                icon: <BriefcaseBusiness className="h-3.5 w-3.5" />,
                title: t(
                  "career.common.career_history_panel.0496lr7",
                  "희망 역할"
                ),
              },
              {
                body: t(
                  "career.common.career_history_panel.0qv04k8",
                  "지역, 근무 형태, 보상 기준을 정합니다."
                ),
                icon: <MapPin className="h-3.5 w-3.5" />,
                title: t(
                  "career.common.career_history_panel.13mr3sj",
                  "근무 조건"
                ),
              },
              {
                body: t(
                  "career.common.career_history_panel.0shxyyt",
                  "관심 없는 산업, 회사 유형, 역할을 제외합니다."
                ),
                icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
                title: t(
                  "career.common.career_history_panel.0wrwhc3",
                  "제외 기준"
                ),
              },
            ],
            eyebrow: t(
              "career.common.career_history_panel.0mo6t6e",
              "첫 추천 준비"
            ),
            icon: <ClipboardCheck className="h-5 w-5" />,
            title: t(
              "career.common.career_history_panel.0gfcdit",
              "어떤 기회에 열려계신지 알려주세요.."
            ),
            toneClassName: "bg-bg-weak text-neutral-muted",
            nextStep: t(
              "career.common.career_history_panel.0pes81b",
              "대화를 통해 기준을 확인하면 첫 포지션 탐색을 시작합니다."
            ),
            body: (
              <>
                {t(
                  "career.common.career_history_panel.1knq1rh",
                  "경력/이력은 확인했습니다."
                )}
                <br />
                {t(
                  "career.common.career_history_panel.0kl8zzx",
                  "희망 역할, 근무 방식, 제외 조건 등을 알려주시면 첫 추천을 시작할 수 있습니다."
                )}
              </>
            ),
          }
        : {
            actionLabel: null,
            details: [
              {
                body: t(
                  "career.common.career_history_panel.05lg6gq",
                  "저장된 경력과 선호 기준을 함께 확인합니다."
                ),
                icon: <FileCheck2 className="h-3.5 w-3.5" />,
                title: t(
                  "career.common.career_history_panel.0iymhpv",
                  "자료 검토"
                ),
              },
              {
                body: t(
                  "career.common.career_history_panel.0eamanf",
                  "조건과 맞지 않는 역할은 추천에서 제외합니다."
                ),
                icon: <Target className="h-3.5 w-3.5" />,
                title: t(
                  "career.common.career_history_panel.0boi6up",
                  "후보 압축"
                ),
              },
              {
                body: t(
                  "career.common.career_history_panel.0p8wa8t",
                  "첫 추천이 준비되면 새 포지션에 표시됩니다."
                ),
                icon: <ListChecks className="h-3.5 w-3.5" />,
                title: t(
                  "career.common.career_history_panel.11est1e",
                  "결과 정리"
                ),
              },
            ],
            eyebrow: t(
              "career.common.career_history_panel.0fhjm3n",
              "검토 진행 중"
            ),
            icon: <Search className="h-5 w-5" />,
            title: t(
              "career.common.career_history_panel.02jvl2x",
              "첫 추천 후보를 검토하고 있습니다."
            ),
            toneClassName: "bg-bg-weak text-neutral-muted",
            nextStep: t(
              "career.common.career_history_panel.1ge5j94",
              "첫 추천이 준비되면 새 포지션 탭에서 바로 검토할 수 있습니다."
            ),
            body: (
              <>
                {t(
                  "career.common.career_history_panel.17505te",
                  "대화에서 정리한 기준으로 실제로 보낼 만한 역할만 남기고 있습니다."
                )}
              </>
            ),
          };

  return (
    <section className="career-glass mt-6 overflow-hidden">
      <div className="min-w-0 px-5 py-6 md:px-7 xl:px-8">
        <h4 className="mt-0 max-w-[640px] text-[16px] font-medium leading-7 text-neutral-primary sm:text-[18px]">
          {config.title}
        </h4>
        <p className="mt-3 max-w-[620px] text-[14px] leading-6 text-neutral-muted">
          {config.body}
        </p>

        {config.actionLabel && (
          <div className="mt-4">
            <PrimaryButton onClick={onOpenChat} className="gap-2">
              {config.actionLabel}
              <ArrowRight className="h-4 w-4" />
            </PrimaryButton>
          </div>
        )}

        <div className="mt-7 w-full grid xl:grid-cols-3 xl:divide-x xl:divide-neutral-1000-a05">
          {config.details.map((detail) => (
            <HistoryEmptyStateDetail
              key={detail.title}
              body={detail.body}
              icon={detail.icon}
              title={detail.title}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const CareerHistoryPanel = () => {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const router = useRouter();
  const {
    user,
    stage,
    isOnboardingDone,
    opportunityRun,
    opportunityRunTriggerPending,
    callStartPending,
    onStartCallMode,
    onUseChatOnly,
  } = useCareerSidebarContext();
  const {
    historyOpportunityCounts,
    historyOpportunities,
    historyLoading,
    historyLoadingMore,
    historyUpdatingOpportunityIds,
    historyUpdateError,
    onLoadMoreHistoryOpportunities,
    onLoadSavedStageHistoryOpportunityPages,
    getHistoryOpportunityPageFilterState,
    onLoadHistoryOpportunityByRoleId,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
    onChangeInternalHistoryOpportunityDecision,
    onUpdateHistoryOpportunityFeedback,
    onUpdateHistoryOpportunitySavedStage,
    onUpdateHistoryOpportunityTalentMemo,
  } = useCareerHistoryContext();
  const setDesktopRoleActionOpportunity = useCareerWorkspaceUiStore(
    (state) => state.setDesktopRoleActionOpportunity
  );
  const feedbackRoleQueryIgnoreRef = useRef<string | null>(null);
  const missingRoleIdRef = useRef<string | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [loadingRoleId, setLoadingRoleId] = useState<string | null>(null);
  const [infoOpportunityType, setInfoOpportunityType] =
    useState<CareerOpportunityType | null>(null);
  const [externalApplyOpportunity, setExternalApplyOpportunity] =
    useState<CareerHistoryOpportunity | null>(null);
  const [
    internalConnectionAcceptanceOpportunity,
    setInternalConnectionAcceptanceOpportunity,
  ] = useState<CareerHistoryOpportunity | null>(null);
  const [negativePromptOpportunityId, setNegativePromptOpportunityId] =
    useState<string | null>(null);
  const [negativePromptSelectedOptions, setNegativePromptSelectedOptions] =
    useState<string[]>([]);
  const [negativePromptCustomReason, setNegativePromptCustomReason] =
    useState("");
  const [internalDecisionChangeRequest, setInternalDecisionChangeRequest] =
    useState<InternalOpportunityDecisionChangeRequest | null>(null);
  const [companyDetailCompanyDbId, setCompanyDetailCompanyDbId] = useState<
    number | null
  >(null);
  const [companyDetailOpportunity, setCompanyDetailOpportunity] =
    useState<CareerHistoryOpportunity | null>(null);
  const currentHistoryTabQuery = router.query[HISTORY_TAB_QUERY_KEY];
  const currentSavedStageQuery = router.query[HISTORY_SAVED_STAGE_QUERY_KEY];
  const currentRoleQuery = router.query[HISTORY_ROLE_QUERY_KEY];
  const requestedHistoryTab = getQueryValue(currentHistoryTabQuery);
  const activeTab: HistoryTabId = isHistoryTabId(requestedHistoryTab)
    ? requestedHistoryTab
    : "new";
  const activeSavedStatus = getSavedOpportunityStatusFromQuery(
    currentSavedStageQuery
  );

  const workspaceNavigation = useCareerWorkspaceNavigation();
  const openChatTab = useCallback(
    (eventName = "click_history_empty_open_chat") => {
      logCareerEvent(eventName);
      if (workspaceNavigation) { workspaceNavigation.openChat(); return; }
      const query: Record<string, string> = {};
      const invite = getQueryValue(router.query.invite);
      const mail = getQueryValue(router.query.mail);
      if (invite) query.invite = invite;
      if (mail) query.mail = mail;

      void router.push({
        pathname: "/career/chat",
        query: Object.keys(query).length > 0 ? query : undefined,
      });
    },
    [logCareerEvent, router, workspaceNavigation]
  );

  const startOnboardingChatFromGate = useCallback(() => {
    logCareerEvent("click_history_internal_connection_onboarding_chat");
    onUseChatOnly?.();
    openChatTab("navigate_history_internal_connection_onboarding_chat");
    window.setTimeout(() => {
      const composer = document.getElementById(
        "career-chat-composer"
      ) as HTMLTextAreaElement | null;
      composer?.focus();
    }, 150);
  }, [logCareerEvent, onUseChatOnly, openChatTab]);

  const startOnboardingCallFromGate = useCallback(() => {
    logCareerEvent("click_history_internal_connection_onboarding_call");
    openChatTab("navigate_history_internal_connection_onboarding_call");
    void onStartCallMode?.();
  }, [logCareerEvent, onStartCallMode, openChatTab]);

  const updateHistoryLocation = useCallback(
    (
      nextTab: HistoryTabId,
      nextSavedStatus: SavedOpportunityManagementStatus,
      options?: {
        mode?: "push" | "replace";
        roleId?: string | null;
      }
    ) => {
      if (!router.isReady) return;

      const normalizedHistoryTab = getQueryValue(currentHistoryTabQuery);
      const normalizedSavedStage = getQueryValue(currentSavedStageQuery);
      const nextSavedStageQuery =
        getSavedOpportunityStatusQueryValue(nextSavedStatus);
      const normalizedRoleId = getNormalizedQueryValue(currentRoleQuery);
      const nextRoleId = String(options?.roleId ?? "").trim();
      const nextPathname = getCareerHistoryLocationPathname(router.asPath);
      const isOnHistoryPath =
        getNormalizedPathname(router.asPath) === nextPathname;

      if (
        isOnHistoryPath &&
        normalizedHistoryTab === nextTab &&
        normalizedSavedStage === nextSavedStageQuery &&
        normalizedRoleId === nextRoleId
      ) {
        return;
      }

      const query: Record<string, string | string[] | undefined> = {
        ...router.query,
        [HISTORY_TAB_QUERY_KEY]: nextTab,
        [HISTORY_SAVED_STAGE_QUERY_KEY]: nextSavedStageQuery,
      };
      if (nextPathname === CAREER_PREVIEW_PATHNAME) {
        query.tab = "history";
      } else {
        delete query.tab;
      }

      if (nextRoleId) {
        query[HISTORY_ROLE_QUERY_KEY] = nextRoleId;
      } else {
        delete query[HISTORY_ROLE_QUERY_KEY];
      }

      const nextLocation = {
        pathname: nextPathname,
        query,
      };

      if (options?.mode === "replace") {
        void router.replace(nextLocation, undefined, {
          shallow: true,
          scroll: false,
        });
        return;
      }

      void router.push(nextLocation, undefined, {
        shallow: true,
        scroll: false,
      });
    },
    [currentHistoryTabQuery, currentRoleQuery, currentSavedStageQuery, router]
  );

  const clearHistoryRoleId = useCallback(() => {
    if (!router.isReady) return;
    if (!getNormalizedQueryValue(currentRoleQuery)) return;

    const query: Record<string, string | string[] | undefined> = {
      ...router.query,
    };
    const pathname = getCareerHistoryLocationPathname(router.asPath);
    if (pathname === CAREER_PREVIEW_PATHNAME) {
      query.tab = "history";
    } else {
      delete query.tab;
    }
    delete query[HISTORY_ROLE_QUERY_KEY];

    void router.replace(
      {
        pathname,
        query,
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [currentRoleQuery, router]);

  useEffect(() => {
    if (!router.isReady) return;
    if (isCareerHistoryPanelPathname(router.asPath)) {
      return;
    }

    const query: Record<string, string | string[] | undefined> = {
      ...router.query,
    };
    delete query.tab;

    void router.replace(
      {
        pathname: CAREER_HISTORY_PATHNAME,
        query,
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [router]);

  const sortedOpportunities = useMemo(
    () => [...historyOpportunities].sort(compareRecommendedAtDesc),
    [historyOpportunities]
  );
  const hasKnownHistoryOpportunities =
    sortedOpportunities.length > 0 || historyOpportunityCounts.total > 0;
  const archivedItems = useMemo(() => sortedOpportunities.filter(isArchivedOpportunity), [sortedOpportunities]);
  const newItems = useMemo(() => sortedOpportunities.filter(isNewOpportunity).sort(compareNewOpportunityHistoryOrder), [sortedOpportunities]);
  const opportunityById = useMemo(
    () => new Map(sortedOpportunities.map((item) => [item.id, item])),
    [sortedOpportunities]
  );
  const opportunityByRoleId = useMemo(() => {
    const next = new Map<string, CareerHistoryOpportunity>();

    for (const item of sortedOpportunities) {
      const roleId = getOpportunityUrlRoleId(item);
      if (roleId && !next.has(roleId)) {
        next.set(roleId, item);
      }
    }

    return next;
  }, [sortedOpportunities]);
  const requestedRoleId = getNormalizedQueryValue(currentRoleQuery);
  const requestedOpportunity = requestedRoleId
    ? (opportunityByRoleId.get(requestedRoleId) ?? null)
    : null;
  const sortedOpportunityIds = useMemo(
    () => new Set(sortedOpportunities.map((item) => item.id)),
    [sortedOpportunities]
  );
  const activeOpportunity =
    activeTab === "new" &&
    requestedOpportunity &&
    isNewOpportunity(requestedOpportunity)
      ? requestedOpportunity
      : null;
  const hasMoreNewOpportunities =
    newItems.length < historyOpportunityCounts.new;

  // The URL is the single source of truth for saved/archived detail visibility.
  // Keeping a second local selection here leaves the detail open when browser
  // Back removes `id` from the URL.
  const modalOpportunity =
    activeTab === "saved" &&
    requestedOpportunity &&
    isSavedOpportunity(requestedOpportunity)
      ? requestedOpportunity
      : activeTab === "archived" &&
          requestedOpportunity &&
          isArchivedOpportunity(requestedOpportunity)
        ? requestedOpportunity
        : null;

  const desktopRoleActionOpportunity = companyDetailOpportunity
    ? (opportunityById.get(companyDetailOpportunity.id) ??
      companyDetailOpportunity)
    : activeTab === "new"
      ? activeOpportunity
      : modalOpportunity;
  const desktopRoleActionScope =
    companyDetailCompanyDbId !== null ? "company" : "role";

  useEffect(() => {
    setDesktopRoleActionOpportunity(
      desktopRoleActionOpportunity,
      desktopRoleActionScope
    );
  }, [
    desktopRoleActionOpportunity,
    desktopRoleActionScope,
    setDesktopRoleActionOpportunity,
  ]);

  useEffect(
    () => () => setDesktopRoleActionOpportunity(null),
    [setDesktopRoleActionOpportunity]
  );

  useEffect(() => {
    if (activeTab !== "new" || !requestedRoleId || !requestedOpportunity)
      return;
    if (feedbackRoleQueryIgnoreRef.current !== requestedRoleId) return;
    if (isNewOpportunity(requestedOpportunity)) return;
    updateHistoryLocation("new", activeSavedStatus, {
      mode: "replace",
      roleId: null,
    });
  }, [
    activeSavedStatus,
    activeTab,
    requestedOpportunity,
    requestedRoleId,
    updateHistoryLocation,
  ]);

  const isCareerOnboardingComplete = isOnboardingDone || stage === "completed";

  const negativePromptOpportunity = useMemo(
    () =>
      negativePromptOpportunityId
        ? (opportunityById.get(negativePromptOpportunityId) ?? null)
        : null,
    [negativePromptOpportunityId, opportunityById]
  );

  useEffect(() => {
    if (
      !router.isReady ||
      !requestedRoleId ||
      requestedOpportunity?.activityTimelineLoaded
    ) {
      return;
    }
    if (historyLoading) return;

    if (missingRoleIdRef.current === requestedRoleId) {
      clearHistoryRoleId();
      return;
    }

    if (loadingRoleId === requestedRoleId) return;

    let cancelled = false;
    setLoadingRoleId(requestedRoleId);

    void (async () => {
      try {
        const item = await onLoadHistoryOpportunityByRoleId(requestedRoleId);

        if (cancelled) return;

        if (item) {
          missingRoleIdRef.current = null;
          return;
        }

        missingRoleIdRef.current = requestedRoleId;
        clearHistoryRoleId();
      } catch {
        if (cancelled) return;
        missingRoleIdRef.current = requestedRoleId;
        clearHistoryRoleId();
      } finally {
        if (!cancelled) {
          setLoadingRoleId((current) =>
            current === requestedRoleId ? null : current
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    clearHistoryRoleId,
    historyLoading,
    loadingRoleId,
    onLoadHistoryOpportunityByRoleId,
    requestedOpportunity,
    requestedRoleId,
    router.isReady,
  ]);

  useEffect(() => {
    if (!router.isReady || !requestedRoleId || !requestedOpportunity) return;

    missingRoleIdRef.current = null;

    if (
      feedbackRoleQueryIgnoreRef.current === requestedRoleId &&
      requestedOpportunity.feedback !== null
    ) {
      return;
    }

    const roleId = getOpportunityUrlRoleId(requestedOpportunity);
    if (!roleId) {
      clearHistoryRoleId();
      return;
    }

    if (activeTab === "archived" && isArchivedOpportunity(requestedOpportunity)) {
      return;
    }

    if (isNewOpportunity(requestedOpportunity)) {
      updateHistoryLocation("new", activeSavedStatus, {
        mode: "replace",
        roleId,
      });
      return;
    }

    if (isSavedOpportunity(requestedOpportunity)) {
      const savedStatus =
        getSavedOpportunityManagementStatus(requestedOpportunity);
      updateHistoryLocation("saved", savedStatus, {
        mode: "replace",
        roleId,
      });
      return;
    }

    if (isArchivedOpportunity(requestedOpportunity)) {
      updateHistoryLocation("archived", activeSavedStatus, {
        mode: "replace",
        roleId,
      });
    }
  }, [
    activeSavedStatus,
    activeTab,
    clearHistoryRoleId,
    requestedOpportunity,
    requestedRoleId,
    router.isReady,
    updateHistoryLocation,
  ]);

  useEffect(() => {
    if (
      activeTab !== "new" ||
      !activeOpportunity ||
      activeOpportunity.viewedAt
    ) {
      return;
    }

    void onMarkHistoryOpportunityViewed(activeOpportunity.id);
  }, [activeOpportunity, activeTab, onMarkHistoryOpportunityViewed]);

  useEffect(() => {
    if (activeTab === "new" || !modalOpportunity || modalOpportunity.viewedAt) {
      return;
    }

    void onMarkHistoryOpportunityViewed(modalOpportunity.id);
  }, [activeTab, modalOpportunity, onMarkHistoryOpportunityViewed]);

  const openUrl = useCallback((url: string | null | undefined) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const openHistoryLink = useEventCallback(
    (item: CareerHistoryOpportunity, url: string | null | undefined) => {
      if (!url) return;
      logCareerEvent(
        "click_history_open_jd",
        item.companyDbId != null ? { companyId: item.companyDbId } : undefined,
      );
      void onMarkHistoryOpportunityClicked(item.id);
      openUrl(url);
    },
  );

  const openHistoryCompanyInfo = useEventCallback(
    (item: CareerHistoryOpportunity) => {
      const fallbackUrl = item.companyHomepageUrl ?? item.companyLinkedinUrl;
      if (!item.companyDbId && !fallbackUrl) return;

      logCareerEvent(
        "click_history_open_company",
        item.companyDbId != null ? { companyId: item.companyDbId } : undefined,
      );
      void onMarkHistoryOpportunityClicked(item.id);

      if (item.companyDbId) {
        setCompanyDetailOpportunity(item);
        setCompanyDetailCompanyDbId(item.companyDbId);
        return;
      }

      openUrl(fallbackUrl);
    },
  );

  const closeCompanyDetail = useCallback(() => {
    setCompanyDetailCompanyDbId(null);
    setCompanyDetailOpportunity(null);
  }, []);

  const requestNegativeFeedback = useCallback(
    (item: CareerHistoryOpportunity) => {
      const parsedReason = parseNegativeFeedbackReason(item);
      setNegativePromptOpportunityId(item.id);
      setNegativePromptSelectedOptions(parsedReason.selectedOptions);
      setNegativePromptCustomReason(parsedReason.customReason);
    },
    []
  );

  const toggleNegativeFeedbackOption = useCallback((value: string) => {
    setNegativePromptSelectedOptions((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }, []);

  const updateFeedbackForItem = useCallback(
    (
      item: CareerHistoryOpportunity,
      feedback: CareerHistoryOpportunityFeedback | null,
      options?: {
        feedbackReason?: string | null;
        savedStage?: CareerOpportunitySavedStage | null;
        promptImmediately?: boolean;
      }
    ) => {
      if (activeTab === "new" && feedback !== null) {
        feedbackRoleQueryIgnoreRef.current = getOpportunityUrlRoleId(item);
      }
      return onUpdateHistoryOpportunityFeedback(item.id, feedback, {
        fallbackOpportunity: item,
        feedbackReason: options?.feedbackReason ?? null,
        interactionSource: "position_tab",
        promptImmediately:
          options?.promptImmediately ??
          (feedback !== null &&
            activeTab === "new" &&
            item.feedback === null &&
            historyOpportunityCounts.new <= 1),
        savedStage:
          feedback === "positive"
            ? (options?.savedStage ?? getResolvedSavedStage(item))
            : null,
      });
    },
    [
      activeTab,
      historyOpportunityCounts.new,
      onUpdateHistoryOpportunityFeedback,
    ]
  );

  const handleApplyOpportunity = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_history_external_apply", {
        roleId: item.roleId,
        opportunityId: item.id,
      });
      setExternalApplyOpportunity(item);
    },
    [logCareerEvent],
  );
  const handleKeepOpportunity = useEventCallback(
    (item: CareerHistoryOpportunity) => {
      return updateFeedbackForItem(item, "keep");
    },
  );
  const handleInternalDecisionAction = useCallback(
    (
      item: CareerHistoryOpportunity,
      action: CareerInternalOpportunityDecisionAction,
    ) => setInternalDecisionChangeRequest({ action, item }),
    [],
  );

  const handleSavedStatusChange = useOpportunityStatusChange({
    update: onUpdateHistoryOpportunitySavedStage,
    navigate: (status, item) => {
      const target = getMyOpportunityTab(status);
      updateHistoryLocation("saved", target, {mode: "replace", roleId: target === "applied" && getNormalizedQueryValue(currentRoleQuery) ? item.roleId : null});
    },
    openChat: () => openChatTab("click_history_offer"),
  });

  const handlePositiveAction = useEventCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_history_positive");
      if (item.sourceType === "internal") {
        logCareerEvent("view_history_internal_connection_acceptance_modal");
        setInternalConnectionAcceptanceOpportunity(item);
        return;
      }

      return updateFeedbackForItem(item, "positive", {
        savedStage: getDefaultSavedStage(item),
      });
    },
  );

  const handleNegativeAction = useEventCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_history_negative");
      requestNegativeFeedback(item);
    },
  );

  const handleSubmitNegativePrompt = useCallback(() => {
    if (!negativePromptOpportunity) return;

    logCareerEvent("click_history_submit_negative_reason");
    const feedbackReason = serializeNegativeFeedbackReason({
      customReason: negativePromptCustomReason,
      item: negativePromptOpportunity,
      selectedOptions: negativePromptSelectedOptions,
    });

    if (
      hasExternalAlreadyAppliedFeedbackReason(negativePromptSelectedOptions)
    ) {
      updateFeedbackForItem(negativePromptOpportunity, "positive", {
        feedbackReason: EXTERNAL_ALREADY_APPLIED_FEEDBACK_REASON,
        savedStage: "closed",
      });
      setNegativePromptOpportunityId(null);
      setNegativePromptSelectedOptions([]);
      setNegativePromptCustomReason("");
      return;
    }

    updateFeedbackForItem(negativePromptOpportunity, "negative", {
      feedbackReason,
    });
    setNegativePromptOpportunityId(null);
    setNegativePromptSelectedOptions([]);
    setNegativePromptCustomReason("");
  }, [
    negativePromptCustomReason,
    negativePromptOpportunity,
    negativePromptSelectedOptions,
    logCareerEvent,
    updateFeedbackForItem,
  ]);

  const activeDisplayTab: HistoryDisplayTabId = activeTab === "saved"
    ? getMyOpportunityTab(activeSavedStatus)
    : activeTab;

  const handleDisplayTabChange = useCallback(
    (nextTab: HistoryDisplayTabId) => {
      logCareerEvent(`click_history_tab_${nextTab}`);

      if (nextTab === "new") {
        updateHistoryLocation("new", activeSavedStatus, {
          roleId: getOpportunityUrlRoleId(activeOpportunity),
        });
        return;
      }
      if (nextTab === "saved") {
        updateHistoryLocation("saved", "saved");
        return;
      }
      if (nextTab === "applied") {
        updateHistoryLocation("saved", "applied");
        return;
      }
      if (nextTab === "hidden") {
        updateHistoryLocation("saved", "hidden");
        return;
      }
      updateHistoryLocation("archived", activeSavedStatus);
    },
    [
      activeOpportunity,
      activeSavedStatus,
      logCareerEvent,
      updateHistoryLocation,
    ]
  );

  const handleToggleNewOpportunity = useEventCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_history_toggle_new_opportunity");
      feedbackRoleQueryIgnoreRef.current = null;
      updateHistoryLocation("new", activeSavedStatus, {
        roleId: activeOpportunity?.id === item.id ? null : item.roleId,
      });
    },
  );

  const loadMoreNewOpportunities = useCallback(() => {
    if (!hasMoreNewOpportunities || historyLoadingMore) return;
    void onLoadMoreHistoryOpportunities({ historyTab: "new" });
  }, [
    hasMoreNewOpportunities,
    historyLoadingMore,
    onLoadMoreHistoryOpportunities,
  ]);

  const openModalForItem = useEventCallback((item: CareerHistoryOpportunity) => {
    logCareerEvent("click_history_open_detail");
    const roleId = getOpportunityUrlRoleId(item);

    if (activeTab === "archived" && isArchivedOpportunity(item)) {
      updateHistoryLocation("archived", activeSavedStatus, {
        mode: "push",
        roleId,
      });
      return;
    }

    if (isSavedOpportunity(item)) {
      updateHistoryLocation("saved", getSavedOpportunityManagementStatus(item), {
        mode: "push",
        roleId,
      });
      return;
    }

    if (isArchivedOpportunity(item)) {
      updateHistoryLocation("archived", activeSavedStatus, {
        mode: "push",
        roleId,
      });
    }
  });

  const openOpportunityInfo = useEventCallback(
    (opportunityType: CareerOpportunityType) => {
      logCareerEvent(`click_history_open_opportunity_info_${opportunityType}`);
      setInfoOpportunityType(opportunityType);
    },
  );

  const closeOpportunityModal = useCallback(() => {
    updateHistoryLocation(activeTab, activeSavedStatus, {
      mode: "replace",
      roleId: null,
    });
  }, [activeSavedStatus, activeTab, updateHistoryLocation]);

  const handleInternalDecisionChangeConfirm = useCallback(
    async (request: InternalOpportunityDecisionChangeRequest) => {
      logCareerEvent(
        `click_history_internal_decision_${request.action}_confirm`
      );
      const changed = await onChangeInternalHistoryOpportunityDecision(
        request.item.id,
        request.action,
        request.reason
      );
      if (!changed) return false;

      setInternalDecisionChangeRequest(null);
      if (
        request.action === "revert" &&
        modalOpportunity?.id === request.item.id
      ) {
        closeOpportunityModal();
      }
      return true;
    },
    [
      closeOpportunityModal,
      logCareerEvent,
      modalOpportunity,
      onChangeInternalHistoryOpportunityDecision,
    ]
  );

  const pendingOpportunityIds = useMemo(
    () => new Set(historyUpdatingOpportunityIds),
    [historyUpdatingOpportunityIds]
  );

  const {
    opportunities: listItems,
    hasMore: hasMoreListItems,
    isLoading: listLoading,
    loadMore: loadMoreListItems,
  } = useCareerMobileHistoryOpportunities({
    loadAllProgress: true,
    historyUpdateError,
    enabled: activeTab !== "new",
    activeTab: activeDisplayTab,
    historyLoading,
    historyOpportunities,
    historyOpportunityCounts,
    onLoadMoreHistoryOpportunities,
    onLoadSavedStageHistoryOpportunityPages,
    getHistoryOpportunityPageFilterState,
  });
  const listInitialLoading = listItems.length === 0 && !historyUpdateError && listLoading;

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMoreListItems || listLoading || historyUpdateError) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreListItems();
        }
      },
      { rootMargin: "360px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreListItems, listLoading, historyUpdateError, loadMoreListItems]);

  const isConversationCompleted = stage === "completed";
  const isOpportunitySearchActive =
    opportunityRunTriggerPending || Boolean(opportunityRun?.inputLocked);
  const emptyStateVariant: HistoryEmptyStateVariant = isOpportunitySearchActive
    ? "searching"
    : isConversationCompleted
      ? "matching"
      : "onboarding";

  const searchScope = activeTab === "new" ? "new" : "mine";
  const historyNavigation = (
    <CareerOpportunityTabs
      activeTab={activeDisplayTab}
      counts={{
        new: getJobsTabTotal("new", historyOpportunityCounts),
        applied: getJobsTabTotal("applied", historyOpportunityCounts),
        saved: getJobsTabTotal("saved", historyOpportunityCounts),
      }}
      onChange={handleDisplayTabChange}
      className="my-4"
      actions={
        <OpportunitySearch
          key={searchScope}
          scope={searchScope}
          userId={user?.id}
          items={historyOpportunities}
          complete={!historyLoading && (searchScope === "new"
            ? !hasMoreNewOpportunities
            : historyOpportunities.filter(isSavedOpportunity).length >= historyOpportunityCounts.saved &&
              archivedItems.length >= historyOpportunityCounts.archived)}
          onSelect={(item) => {
            if (searchScope === "new") {
              feedbackRoleQueryIgnoreRef.current = null;
              updateHistoryLocation("new", activeSavedStatus, { roleId: item.roleId });
              return;
            }
            updateHistoryLocation(
              isSavedHistoryOpportunity(item) ? "saved" : "archived",
              item.savedStage ?? "all",
              { roleId: item.roleId }
            );
          }}
        />
      }
    />
  );

  if (historyLoading && activeTab === "new") {
    return (
      <div className="flex min-h-full flex-col">
        {historyNavigation}
        <section className="px-5 py-6">
          <div className="flex items-center gap-2 text-[15px] leading-6 text-neutral-muted">
            <Loader2 className="h-4 w-4 animate-spin text-neutral-primary" />
            {t(
              "career.common.career_history_panel.0s3czqf",
              "저장된 정보를 불러오는 중입니다..."
            )}
          </div>
        </section>
      </div>
    );
  }

  if (activeTab === "new" && !hasKnownHistoryOpportunities && !historyUpdateError) {
    return (
      <div className="flex min-h-full flex-col">
        {historyNavigation}
        <div className="my-4 flex justify-end">
          <CareerJobLinkImportButton />
        </div>
        <HistoryEmptyStatePanel
          onOpenChat={openChatTab}
          variant={emptyStateVariant}
        />
      </div>
    );
  }

  const showInlineOpportunityPage =
    activeTab !== "new" && Boolean(modalOpportunity);

  return (
    <div className="flex min-h-full flex-col">
      {!showInlineOpportunityPage && historyNavigation}

      <div className="relative flex flex-1 flex-col gap-6">
        <div className="min-w-0 flex-1">
          {historyUpdateError && (
            <div className="mb-4 rounded-md border border-critical/30 bg-critical-faded px-4 py-3 text-sm text-critical">
              {historyUpdateError}
            </div>
          )}

          {activeTab === "new" && (
            <NewOpportunityList
              expandedOpportunityId={activeOpportunity?.id}
              hasMore={hasMoreNewOpportunities}
              items={newItems}
              loadingMore={historyLoadingMore}
              onApply={handleApplyOpportunity}
              onLoadMore={loadMoreNewOpportunities}
              onNegative={handleNegativeAction}
              onKeep={handleKeepOpportunity}
              onOpenCompanyInfo={openHistoryCompanyInfo}
              onOpenLink={openHistoryLink}
              onPositive={handlePositiveAction}
              onToggleOpportunity={handleToggleNewOpportunity}
              pendingOpportunityIds={pendingOpportunityIds}
              totalCount={historyOpportunityCounts.new}
            />
          )}

          {showInlineOpportunityPage && modalOpportunity && (
            <HistoryOpportunityInlinePage
              item={modalOpportunity}
              onOpenChat={() => openChatTab("click_history_apply_with_harper")}
              pending={pendingOpportunityIds.has(modalOpportunity.id)}
              savedStatus={getCareerOpportunityManagementStatus(
                modalOpportunity
              )}
              onBack={closeOpportunityModal}
              backLabel={getMyOpportunityTabs(t).find(({ id }) => id === activeDisplayTab)?.label ??
                (activeTab === "archived"
                  ? t("career.history.saved_opportunity_status.archived", "숨긴 포지션")
                  : t("career.history.back_to_list", "전체 목록"))}
              onStartMockInterview={
                onStartCallMode
                  ? async (request) => {
                      const started = await onStartCallMode(request);
                      if (started) openChatTab("start_mock_interview");
                      return started;
                    }
                  : undefined
              }
              onOpenCompanyInfo={openHistoryCompanyInfo}
              onOpenLink={(url) => openHistoryLink(modalOpportunity, url)}
              onApply={() => {
                logCareerEvent("click_history_external_apply");
                setExternalApplyOpportunity(modalOpportunity);
              }}
              onInternalDecisionAction={(action) =>
                setInternalDecisionChangeRequest({
                  action,
                  item: modalOpportunity,
                })
              }
              onSavedStatusChange={(status) =>
                handleSavedStatusChange(modalOpportunity, status)
              }
              onUpdateTalentMemo={(item, talentMemo) =>
                onUpdateHistoryOpportunityTalentMemo(item.id, talentMemo)
              }
              onKeepDecision={(action) => {
                if (action === "accept") handlePositiveAction(modalOpportunity);
                else if (action === "decline")
                  handleNegativeAction(modalOpportunity);
              }}
              roleActionsOnDesktop={false}
            />
          )}

          {activeTab !== "new" && !showInlineOpportunityPage && (
            <div className="space-y-4">
              {activeDisplayTab === "saved" ? (
                <div className="flex justify-end"><CareerJobLinkImportButton /></div>
              ) : null}
              {listInitialLoading && activeDisplayTab !== "applied" ? (
                <div className="grid grid-cols-1 gap-3" aria-busy="true">
                  <Skeleton className="h-36 w-full rounded-lg" />
                  <Skeleton className="h-36 w-full rounded-lg" />
                </div>
              ) : null}
              {activeDisplayTab === "applied" ? (
                <ProgressOpportunityList items={listItems} loading={listLoading || hasMoreListItems} pendingOpportunityIds={pendingOpportunityIds} onOpenDetail={openModalForItem} onStatusChange={handleSavedStatusChange} />
              ) : listItems.length > 0 ? activeDisplayTab === "saved" ? (
                <SavedOpportunityList items={listItems} pendingOpportunityIds={pendingOpportunityIds} onOpenDetail={openModalForItem} onApply={(item) => item.isInternal ? handlePositiveAction(item) : handleApplyOpportunity(item)} />
              ) : (
                <div className={cn("grid items-stretch gap-3", "grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]")}>
                  {listItems.map((item) => (
                    <OpportunityListCard
                      key={item.id}
                      item={item}
                      pending={pendingOpportunityIds.has(item.id)}
                      onOpenOpportunityInfo={openOpportunityInfo}
                      onOpenCompanyInfo={openHistoryCompanyInfo}
                      onInternalDecisionAction={handleInternalDecisionAction}
                      savedStatus={getCareerOpportunityManagementStatus(item)}
                      onSavedStatusChange={handleSavedStatusChange}
                      onOpenDetail={openModalForItem}
                    />
                  ))}
                </div>
              ) : !listInitialLoading && !historyUpdateError ? (
                <InlinePanel className="px-5 py-5">
                  <div className="text-[14px] leading-6 text-neutral-muted">
                    {t("career.common.career_history_panel.0okcy6f", "이 탭에 해당하는 기회가 아직 없습니다.")}
                  </div>
                </InlinePanel>
              ) : null}
              {hasMoreListItems ? (
                <div ref={loadMoreSentinelRef} className="flex min-h-12 items-center justify-center text-[13px] text-neutral-muted">
                  {listLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : historyUpdateError ? (
                    <MuteButton size="sm" onClick={loadMoreListItems}>{t("career.tasks.retry", "다시 불러오기")}</MuteButton>
                  ) : t("career.common.career_history_panel.01m9cc2", "더 불러올 항목이 있습니다.")}
                </div>
              ) : null}
            </div>
          )}

        </div>
      </div>

      <HistoryOpportunityInfoModal
        opportunityType={infoOpportunityType}
        onClose={() => setInfoOpportunityType(null)}
      />

      {externalApplyOpportunity ? (
        <ExternalOpportunityApplyModal
          key={externalApplyOpportunity.id}
          item={externalApplyOpportunity}
          pending={pendingOpportunityIds.has(externalApplyOpportunity.id)}
          error={historyUpdateError}
          onClose={() => setExternalApplyOpportunity(null)}
          onSave={(savedStage) => {
            logCareerEvent(
              savedStage === "applied"
                ? "click_history_external_apply_directly"
                : "click_history_external_apply_with_harper",
              {
                roleId: externalApplyOpportunity.roleId,
                opportunityId: externalApplyOpportunity.id,
              }
            );
            return onUpdateHistoryOpportunitySavedStage(
              externalApplyOpportunity.id,
              savedStage,
              externalApplyOpportunity
            );
          }}
          onApplied={() => updateHistoryLocation("saved", "applied", {
            roleId: getOpportunityUrlRoleId(externalApplyOpportunity),
          })}
          onOpenLink={(url) => openHistoryLink(externalApplyOpportunity, url)}
          onOpenChat={() => {
            feedbackRoleQueryIgnoreRef.current = null;
            updateHistoryLocation("saved", "saved", {
              roleId: requestedRoleId,
            });
          }}
        />
      ) : null}

      <InternalConnectionAcceptanceModal
        item={internalConnectionAcceptanceOpportunity}
        isOnboardingComplete={isCareerOnboardingComplete}
        pending={
          internalConnectionAcceptanceOpportunity
            ? pendingOpportunityIds.has(
                internalConnectionAcceptanceOpportunity.id
              )
            : false
        }
        callPending={Boolean(callStartPending)}
        onClose={() => setInternalConnectionAcceptanceOpportunity(null)}
        onAccept={(feedbackReason) => {
          if (!internalConnectionAcceptanceOpportunity) return;
          logCareerEvent("click_history_submit_internal_connection_acceptance");
          return updateFeedbackForItem(
            internalConnectionAcceptanceOpportunity,
            "positive",
            {
              feedbackReason,
              savedStage: getDefaultSavedStage(
                internalConnectionAcceptanceOpportunity
              ),
            }
          );
        }}
        onStartChat={startOnboardingChatFromGate}
        onStartCall={startOnboardingCallFromGate}
      />

      <CareerCompanyDetailDrawer
        companyDbId={companyDetailCompanyDbId}
        open={companyDetailCompanyDbId !== null}
        onClose={closeCompanyDetail}
        onOpenChat={() => {
          closeCompanyDetail();
          openChatTab("click_history_company_open_chat");
        }}
        opportunity={companyDetailOpportunity}
      />

      <HistoryNegativeFeedbackModal
        item={negativePromptOpportunity}
        customReason={negativePromptCustomReason}
        selectedOptions={negativePromptSelectedOptions}
        pending={
          negativePromptOpportunity
            ? pendingOpportunityIds.has(negativePromptOpportunity.id)
            : false
        }
        onChangeCustomReason={setNegativePromptCustomReason}
        onToggleOption={toggleNegativeFeedbackOption}
        onClose={() => {
          setNegativePromptOpportunityId(null);
          setNegativePromptSelectedOptions([]);
          setNegativePromptCustomReason("");
        }}
        onSubmit={handleSubmitNegativePrompt}
      />

      {internalDecisionChangeRequest ? (
        <InternalOpportunityDecisionChangeModal
          error={historyUpdateError}
          request={internalDecisionChangeRequest}
          onClose={() => setInternalDecisionChangeRequest(null)}
          onConfirm={handleInternalDecisionChangeConfirm}
        />
      ) : null}
    </div>
  );
};

export default React.memo(CareerHistoryPanel);
