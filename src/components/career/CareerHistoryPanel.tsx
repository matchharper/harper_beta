import {
  Archive,
  ArchiveX,
  ArrowRight,
  Ban,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  Columns3,
  FileCheck2,
  List,
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
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerInPageTabs, { type CareerInPageTabItem } from "./CareerInPageTabs";
import { PrimaryButton, BareButton } from "@/components/ui/button";
import { InlinePanel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import {
  CareerOpportunityType,
  type CareerHistoryOpportunity,
  type CareerHistoryOpportunityFeedback,
  type CareerHistoryOpportunityPageFilter,
  type CareerOpportunitySavedStage,
} from "./types";
import {
  EXTERNAL_ALREADY_APPLIED_FEEDBACK_REASON,
  getCareerDefaultSavedStage,
  getCareerNegativeActionLabel,
  getCareerOpportunityInfoCopy,
  getCareerOpportunityPanelToneClassName,
  getCareerOpportunitySortPriority,
  getCareerOpportunityTypeLabel,
  getCareerPositiveActionLabel,
  shouldCollectCareerPositiveFeedbackReason,
} from "./opportunityTypeMeta";
import {
  HistoryNegativeFeedbackModal,
  HistoryPositiveFeedbackModal,
  hasExternalAlreadyAppliedFeedbackReason,
  parseNegativeFeedbackReason,
  serializeNegativeFeedbackReason,
} from "./history/FeedbackModal";
import OpportunityListCard from "./history/OpportunityListCard";
import SavedOpportunityBoard, {
  type SavedOpportunityBoardStatus,
} from "./history/SavedOpportunityBoard";
import HistoryOpportunityDetailContent, {
  HistoryOpportunityInlinePage,
} from "./history/HistoryOpportunityDetailContent";
import HistoryOpportunityInfoModal from "./history/HistoryOppotunityInfoModal";
import HistoryShortcutPanel from "./history/HistoryShortcutPanel";
import CareerCompanyDetailDrawer from "./watchlist/CareerCompanyDetailDrawer";
import InternalConnectionOnboardingModal, {
  shouldBlockInternalConnectionAcceptance,
} from "./InternalConnectionOnboardingModal";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import React from "react";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { Tooltips } from "@/components/ui/tooltip";
import {
  canChangeCareerOpportunityManagementStatus,
  getSavedOpportunityStatusOptions,
  getSavedOpportunityStatusLabel,
  getCareerOpportunityManagementStatus,
  getSavedOpportunityManagementStatus,
  getSavedOpportunityStatusFromQuery,
  getSavedOpportunityStatusQueryValue,
  getSavedStageForManagementStatus,
  type CareerOpportunityManagementStatus,
  type SavedOpportunityManagementStatus,
} from "./history/savedOpportunityStatus";
import { useCareerT } from "@/i18n/useCareerT";
import {
  useCareerWorkspaceUiStore,
  type CareerSavedHistoryDisplayMode,
} from "@/store/useCareerWorkspaceUiStore";

type HistoryTabId = "new" | "saved" | "archived";
type HistoryDisplayTabId = "new" | "saved" | "hidden" | "archived";
type SavedHistoryDisplayMode = CareerSavedHistoryDisplayMode;

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

const getHistoryDisplayTabs = (t: ReturnType<typeof useCareerT>) => [
  {
    id: "new" as const,
    label: t("career.common.career_history_panel.02i826z", "새 포지션"),
  },
  {
    id: "saved" as const,
    label: t(
      "career.common.career_history_panel.saved_positions_tab",
      "저장한 포지션"
    ),
  },
  {
    id: "hidden" as const,
    label: t("career.common.career_history_panel.hidden_tab", "보관함"),
  },
];

const getSavedDisplayModeOptions = (t: ReturnType<typeof useCareerT>) =>
  [
    {
      icon: List,
      id: "list",
      label: t("career.common.career_history_panel.1n5k969", "리스트 보기"),
    },
    {
      icon: Columns3,
      id: "board",
      label: t("career.common.career_history_panel.1xfuqgb", "보드 보기"),
    },
  ] as const satisfies readonly {
    icon: typeof List;
    id: SavedHistoryDisplayMode;
    label: string;
  }[];

const compareRecommendedAtDesc = (
  left: CareerHistoryOpportunity,
  right: CareerHistoryOpportunity
) => Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt);

type CareerTHelper = ReturnType<typeof useCareerT>;

const fallbackCareerT: CareerTHelper = (_key, koSource) => koSource;

const formatEmploymentType = (value: string, tArg?: CareerTHelper) => {
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

const formatWorkMode = (value: string | null, tArg?: CareerTHelper) => {
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
  item.isInternal || item.sourceType === "internal"
    ? "connected"
    : getCareerDefaultSavedStage(item.opportunityType);

export const getResolvedSavedStage = (item: CareerHistoryOpportunity) =>
  item.savedStage ?? getDefaultSavedStage(item);

const isNewOpportunity = (item: CareerHistoryOpportunity) =>
  item.feedback === null;

const isSavedOpportunity = (item: CareerHistoryOpportunity) =>
  item.feedback === "positive";

const isArchivedOpportunity = (item: CareerHistoryOpportunity) =>
  item.feedback === "negative";

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
  t?: CareerTHelper
) => getCareerOpportunityTypeLabel(item.opportunityType, t);

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
    return t("career.common.career_history_panel.1vrs10j", "제외한 포지션");
  if (item.feedback === "positive") {
    return getSavedStageLabel(getResolvedSavedStage(item), item, t);
  }
  return null;
};

const shouldCollectPositiveReason = (item: CareerHistoryOpportunity) =>
  shouldCollectCareerPositiveFeedbackReason(item.opportunityType);

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

const isInteractiveTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    Boolean(target.closest("[contenteditable='true']"))
  );
};

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

const SAVED_BOARD_MIN_ITEMS_PER_COLUMN = 4;
const SAVED_BOARD_COLUMN_STATUSES = [
  "saved",
  "applied",
  "connected",
  "closed",
] as const satisfies readonly SavedOpportunityBoardStatus[];

const getSavedBoardColumnFilter = (
  status: SavedOpportunityBoardStatus
): CareerHistoryOpportunityPageFilter => ({
  historyTab: "saved",
  savedStage: status,
});

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
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-bg-weak text-neutral-primary">
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
          toneClassName: "bg-black text-neutral-00",
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
    <section className="mt-6 overflow-hidden rounded-[8px] border border-neutral-1000-a05 bg-bg-floating shadow-sm">
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
  const historyDisplayTabs = useMemo(() => getHistoryDisplayTabs(t), [t]);
  const savedDisplayModeOptions = useMemo(
    () => getSavedDisplayModeOptions(t),
    [t]
  );
  const savedOpportunityStatusOptions = useMemo(
    () =>
      getSavedOpportunityStatusOptions(t, {
        includeAll: true,
      }),
    [t]
  );

  const logCareerEvent = useCareerLogEvent();
  const router = useRouter();
  const {
    stage,
    isOnboardingDone,
    opportunityRun,
    opportunityRunTriggerPending,
    callStartPending,
    onStartCallMode,
    onUseChatOnly,
    historyOpportunityCounts,
    historyOpportunities,
    historyLoading,
    historyLoadingMore,
    historyUpdatingOpportunityIds,
    historyUpdateError,
    onLoadMoreHistoryOpportunities,
    isHistoryOpportunityPageFilterLoading,
    onLoadSavedStageHistoryOpportunityPages,
    onLoadHistoryOpportunityByRoleId,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
    onUpdateHistoryOpportunityFeedback,
    onUpdateHistoryOpportunitySavedStage,
    onUpdateHistoryOpportunityTalentMemo,
  } = useCareerSidebarContext();
  const [activeTab, setActiveTab] = useState<HistoryTabId>("new");
  const [activeSavedStatus, setActiveSavedStatus] =
    useState<SavedOpportunityManagementStatus>("all");
  const savedDisplayMode = useCareerWorkspaceUiStore(
    (state) => state.savedHistoryDisplayMode
  );
  const setSavedDisplayMode = useCareerWorkspaceUiStore(
    (state) => state.setSavedHistoryDisplayMode
  );
  const [activeOpportunityId, setActiveOpportunityId] = useState<string | null>(
    null
  );
  const [autoAdvanceTargetIndex, setAutoAdvanceTargetIndex] = useState<
    number | null
  >(null);
  const feedbackAdvanceTargetIndexRef = useRef<number | null>(null);
  const feedbackRoleQueryIgnoreRef = useRef<string | null>(null);
  const activeOpportunityUrlSyncRequestedRef = useRef(false);
  const autoAdvanceRequestedRef = useRef(false);
  const wasHistoryLoadingMoreRef = useRef(false);
  const missingRoleIdRef = useRef<string | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [loadingRoleId, setLoadingRoleId] = useState<string | null>(null);
  const [modalOpportunityId, setModalOpportunityId] = useState<string | null>(
    null
  );
  const [infoOpportunityType, setInfoOpportunityType] =
    useState<CareerOpportunityType | null>(null);
  const [
    internalConnectionOnboardingOpportunityId,
    setInternalConnectionOnboardingOpportunityId,
  ] = useState<string | null>(null);
  const [positivePromptOpportunityId, setPositivePromptOpportunityId] =
    useState<string | null>(null);
  const [positivePromptDraft, setPositivePromptDraft] = useState("");
  const [negativePromptOpportunityId, setNegativePromptOpportunityId] =
    useState<string | null>(null);
  const [negativePromptSelectedOptions, setNegativePromptSelectedOptions] =
    useState<string[]>([]);
  const [negativePromptCustomReason, setNegativePromptCustomReason] =
    useState("");
  const [companyDetailCompanyDbId, setCompanyDetailCompanyDbId] = useState<
    number | null
  >(null);
  const currentHistoryTabQuery = router.query[HISTORY_TAB_QUERY_KEY];
  const currentSavedStageQuery = router.query[HISTORY_SAVED_STAGE_QUERY_KEY];
  const currentRoleQuery = router.query[HISTORY_ROLE_QUERY_KEY];

  const openChatTab = useCallback(
    (eventName = "click_history_empty_open_chat") => {
      logCareerEvent(eventName);
      const query: Record<string, string> = {};
      const invite = getQueryValue(router.query.invite);
      const mail = getQueryValue(router.query.mail);
      if (invite) query.invite = invite;
      if (mail) query.mail = mail;

      void router.push({
        pathname: "/career",
        query: Object.keys(query).length > 0 ? query : undefined,
      });
    },
    [logCareerEvent, router]
  );

  const openInternalConnectionOnboardingModal = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("view_history_internal_connection_onboarding_gate");
      setInternalConnectionOnboardingOpportunityId(item.id);
    },
    [logCareerEvent]
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

  const applyActiveTab = useCallback((nextTab: HistoryTabId) => {
    setActiveTab((current) => {
      if (current === nextTab) return current;
      feedbackAdvanceTargetIndexRef.current = null;
      activeOpportunityUrlSyncRequestedRef.current = false;
      autoAdvanceRequestedRef.current = false;
      wasHistoryLoadingMoreRef.current = false;
      setAutoAdvanceTargetIndex(null);
      return nextTab;
    });
  }, []);

  const updateHistoryLocation = useCallback(
    (
      nextTab: HistoryTabId,
      nextSavedStatus: SavedOpportunityManagementStatus,
      options?: {
        mode?: "push" | "replace";
        roleId?: string | null;
      }
    ) => {
      applyActiveTab(nextTab);
      setActiveSavedStatus(nextSavedStatus);

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
      delete query.tab;

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
    [
      applyActiveTab,
      currentHistoryTabQuery,
      currentRoleQuery,
      currentSavedStageQuery,
      router,
    ]
  );

  const clearHistoryRoleId = useCallback(() => {
    if (!router.isReady) return;
    if (!getNormalizedQueryValue(currentRoleQuery)) return;

    const query: Record<string, string | string[] | undefined> = {
      ...router.query,
    };
    delete query.tab;
    delete query[HISTORY_ROLE_QUERY_KEY];

    void router.replace(
      {
        pathname: getCareerHistoryLocationPathname(router.asPath),
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
  const { archivedItems, newItems, savedItemsByStage } = useMemo(() => {
    const nextNewItems: CareerHistoryOpportunity[] = [];
    const nextArchivedItems: CareerHistoryOpportunity[] = [];
    const nextSavedItemsByStage: Record<
      CareerOpportunitySavedStage,
      CareerHistoryOpportunity[]
    > = {
      saved: [],
      applied: [],
      connected: [],
      closed: [],
      hidden: [],
    };

    for (const item of sortedOpportunities) {
      if (isNewOpportunity(item)) {
        nextNewItems.push(item);
        continue;
      }

      if (isSavedOpportunity(item)) {
        const stage = getResolvedSavedStage(item);
        nextSavedItemsByStage[stage].push(item);
        continue;
      }

      if (isArchivedOpportunity(item)) {
        nextArchivedItems.push(item);
      }
    }

    nextNewItems.sort(
      (left, right) =>
        Number(right.isInternal) - Number(left.isInternal) ||
        getCareerOpportunitySortPriority(left.opportunityType) -
          getCareerOpportunitySortPriority(right.opportunityType) ||
        compareRecommendedAtDesc(left, right)
    );

    return {
      archivedItems: nextArchivedItems,
      newItems: nextNewItems,
      savedItemsByStage: nextSavedItemsByStage,
    };
  }, [sortedOpportunities]);
  const savedItems = useMemo(
    () =>
      [
        ...savedItemsByStage.saved,
        ...savedItemsByStage.applied,
        ...savedItemsByStage.connected,
        ...savedItemsByStage.closed,
        ...savedItemsByStage.hidden,
      ].sort(compareRecommendedAtDesc),
    [
      savedItemsByStage.saved,
      savedItemsByStage.applied,
      savedItemsByStage.connected,
      savedItemsByStage.closed,
      savedItemsByStage.hidden,
    ]
  );
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
  const newItemIndexById = useMemo(
    () => new Map(newItems.map((item, index) => [item.id, index])),
    [newItems]
  );

  useEffect(() => {
    if (!router.isReady) return;

    const nextActiveTab = getQueryValue(currentHistoryTabQuery);
    const nextSavedStatus = getSavedOpportunityStatusFromQuery(
      currentSavedStageQuery
    );

    applyActiveTab(isHistoryTabId(nextActiveTab) ? nextActiveTab : "new");
    setActiveSavedStatus(nextSavedStatus);
  }, [
    applyActiveTab,
    currentHistoryTabQuery,
    currentSavedStageQuery,
    router.isReady,
  ]);

  const activeIndex = activeOpportunityId
    ? (newItemIndexById.get(activeOpportunityId) ?? -1)
    : -1;

  const activeOpportunity = activeIndex >= 0 ? newItems[activeIndex] : null;
  const hasMoreNewOpportunities =
    newItems.length < historyOpportunityCounts.new;
  const canMoveNextOpportunity =
    activeIndex >= 0 &&
    (activeIndex < newItems.length - 1 || hasMoreNewOpportunities);
  const nextOpportunityPending =
    activeTab === "new" && autoAdvanceTargetIndex !== null;

  const modalOpportunity = useMemo(
    () =>
      modalOpportunityId
        ? (opportunityById.get(modalOpportunityId) ?? null)
        : null,
    [modalOpportunityId, opportunityById]
  );

  const internalConnectionOnboardingOpportunity = useMemo(
    () =>
      internalConnectionOnboardingOpportunityId
        ? (opportunityById.get(internalConnectionOnboardingOpportunityId) ??
          null)
        : null,
    [internalConnectionOnboardingOpportunityId, opportunityById]
  );

  const isCareerOnboardingComplete = isOnboardingDone || stage === "completed";
  const shouldGateInternalConnection = useCallback(
    (item: CareerHistoryOpportunity) =>
      shouldBlockInternalConnectionAcceptance(item, isCareerOnboardingComplete),
    [isCareerOnboardingComplete]
  );

  const positivePromptOpportunity = useMemo(
    () =>
      positivePromptOpportunityId
        ? (opportunityById.get(positivePromptOpportunityId) ?? null)
        : null,
    [opportunityById, positivePromptOpportunityId]
  );

  const negativePromptOpportunity = useMemo(
    () =>
      negativePromptOpportunityId
        ? (opportunityById.get(negativePromptOpportunityId) ?? null)
        : null,
    [negativePromptOpportunityId, opportunityById]
  );

  useEffect(() => {
    if (!router.isReady || !requestedRoleId || requestedOpportunity) return;
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

    if (isNewOpportunity(requestedOpportunity)) {
      setModalOpportunityId(null);
      setActiveOpportunityId(requestedOpportunity.id);
      updateHistoryLocation("new", activeSavedStatus, {
        mode: "replace",
        roleId,
      });
      return;
    }

    if (isSavedOpportunity(requestedOpportunity)) {
      const savedStatus =
        getSavedOpportunityManagementStatus(requestedOpportunity);
      setModalOpportunityId(requestedOpportunity.id);
      updateHistoryLocation("saved", savedStatus, {
        mode: "replace",
        roleId,
      });
      return;
    }

    if (isArchivedOpportunity(requestedOpportunity)) {
      setModalOpportunityId(requestedOpportunity.id);
      updateHistoryLocation("archived", activeSavedStatus, {
        mode: "replace",
        roleId,
      });
    }
  }, [
    activeSavedStatus,
    clearHistoryRoleId,
    requestedOpportunity,
    requestedRoleId,
    router.isReady,
    updateHistoryLocation,
  ]);

  useEffect(() => {
    if (!modalOpportunityId) return;
    if (!requestedRoleId) return;

    const currentModalOpportunity = opportunityById.get(modalOpportunityId);
    if (
      currentModalOpportunity &&
      getOpportunityUrlRoleId(currentModalOpportunity) === requestedRoleId
    ) {
      return;
    }

    setModalOpportunityId(null);
  }, [activeTab, modalOpportunityId, opportunityById, requestedRoleId]);

  useEffect(() => {
    if (!router.isReady || historyLoading || activeTab !== "new") return;

    if (requestedRoleId && !requestedOpportunity) return;

    if (
      requestedRoleId &&
      requestedOpportunity?.id !== activeOpportunity?.id &&
      feedbackRoleQueryIgnoreRef.current !== requestedRoleId &&
      !activeOpportunityUrlSyncRequestedRef.current
    ) {
      return;
    }

    const roleId = getOpportunityUrlRoleId(activeOpportunity);
    if (!roleId && !requestedRoleId) return;

    if (
      feedbackRoleQueryIgnoreRef.current &&
      feedbackRoleQueryIgnoreRef.current !== roleId
    ) {
      feedbackRoleQueryIgnoreRef.current = null;
    }

    activeOpportunityUrlSyncRequestedRef.current = false;
    updateHistoryLocation("new", activeSavedStatus, {
      mode: "replace",
      roleId,
    });
  }, [
    activeOpportunity,
    activeSavedStatus,
    activeTab,
    historyLoading,
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

  const moveActiveOpportunity = useCallback(
    (direction: -1 | 1) => {
      if (newItems.length === 0) return;
      logCareerEvent(
        direction > 0 ? "click_history_next" : "click_history_prev"
      );

      const baseIndex = activeIndex >= 0 ? activeIndex : 0;
      const nextIndex = Math.min(
        newItems.length - 1,
        Math.max(0, baseIndex + direction)
      );
      const nextOpportunityId = newItems[nextIndex]?.id ?? null;

      if (nextOpportunityId) {
        activeOpportunityUrlSyncRequestedRef.current = true;
        setActiveOpportunityId(nextOpportunityId);
      }
    },
    [activeIndex, logCareerEvent, newItems]
  );

  const loadNextOpportunityPage = useCallback(() => {
    if (
      !hasMoreNewOpportunities ||
      historyLoadingMore ||
      autoAdvanceRequestedRef.current
    ) {
      return;
    }
    autoAdvanceRequestedRef.current = true;
    activeOpportunityUrlSyncRequestedRef.current = true;
    setAutoAdvanceTargetIndex(newItems.length);
    void onLoadMoreHistoryOpportunities({ historyTab: "new" });
  }, [
    hasMoreNewOpportunities,
    historyLoadingMore,
    newItems.length,
    onLoadMoreHistoryOpportunities,
  ]);

  const handleMoveNextOpportunity = useCallback(() => {
    if (activeIndex < newItems.length - 1) {
      moveActiveOpportunity(1);
      return;
    }

    logCareerEvent("click_history_next");
    loadNextOpportunityPage();
  }, [
    activeIndex,
    logCareerEvent,
    loadNextOpportunityPage,
    moveActiveOpportunity,
    newItems.length,
  ]);

  useEffect(() => {
    if (newItems.length === 0) {
      setActiveOpportunityId(null);
      return;
    }

    if (activeOpportunityId && newItemIndexById.has(activeOpportunityId)) {
      return;
    }

    const feedbackAdvanceTargetIndex = feedbackAdvanceTargetIndexRef.current;
    feedbackAdvanceTargetIndexRef.current = null;

    if (feedbackAdvanceTargetIndex !== null) {
      if (feedbackAdvanceTargetIndex < newItems.length) {
        setActiveOpportunityId(
          newItems[feedbackAdvanceTargetIndex]?.id ?? null
        );
        return;
      }

      if (hasMoreNewOpportunities) {
        setAutoAdvanceTargetIndex(feedbackAdvanceTargetIndex);
        return;
      }

      setActiveOpportunityId(newItems[newItems.length - 1]?.id ?? null);
      return;
    }

    setActiveOpportunityId(newItems[0]?.id ?? null);
  }, [
    activeOpportunityId,
    hasMoreNewOpportunities,
    newItemIndexById,
    newItems,
  ]);

  useEffect(() => {
    const completedPageLoad =
      wasHistoryLoadingMoreRef.current && !historyLoadingMore;
    wasHistoryLoadingMoreRef.current = historyLoadingMore;

    if (autoAdvanceTargetIndex === null) return;

    if (newItems.length > autoAdvanceTargetIndex) {
      setActiveOpportunityId(newItems[autoAdvanceTargetIndex]?.id ?? null);
      setAutoAdvanceTargetIndex(null);
      autoAdvanceRequestedRef.current = false;
      return;
    }

    if (historyLoadingMore) return;

    if (hasMoreNewOpportunities) {
      if (autoAdvanceRequestedRef.current && !completedPageLoad) {
        return;
      }

      autoAdvanceRequestedRef.current = false;
      loadNextOpportunityPage();
      return;
    }

    setAutoAdvanceTargetIndex(null);
    autoAdvanceRequestedRef.current = false;
  }, [
    autoAdvanceTargetIndex,
    hasMoreNewOpportunities,
    historyLoadingMore,
    loadNextOpportunityPage,
    newItems,
  ]);

  const openUrl = useCallback((url: string | null | undefined) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const openHistoryLink = useCallback(
    (item: CareerHistoryOpportunity, url: string | null | undefined) => {
      if (!url) return;
      logCareerEvent(
        "click_history_open_jd",
        item.companyDbId != null ? { companyId: item.companyDbId } : undefined
      );
      void onMarkHistoryOpportunityClicked(item.id);
      openUrl(url);
    },
    [logCareerEvent, onMarkHistoryOpportunityClicked, openUrl]
  );

  const openHistoryCompanyInfo = useCallback(
    (item: CareerHistoryOpportunity) => {
      const fallbackUrl = item.companyHomepageUrl ?? item.companyLinkedinUrl;
      if (!item.companyDbId && !fallbackUrl) return;

      logCareerEvent(
        "click_history_open_company",
        item.companyDbId != null ? { companyId: item.companyDbId } : undefined
      );
      void onMarkHistoryOpportunityClicked(item.id);

      if (item.companyDbId) {
        setCompanyDetailCompanyDbId(item.companyDbId);
        return;
      }

      openUrl(fallbackUrl);
    },
    [logCareerEvent, onMarkHistoryOpportunityClicked, openUrl]
  );

  const requestPositiveFeedback = useCallback(
    (item: CareerHistoryOpportunity) => {
      setPositivePromptOpportunityId(item.id);
      setPositivePromptDraft(item.feedbackReason ?? "");
    },
    []
  );

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

  const rememberFeedbackAdvanceTarget = useCallback(
    (item: CareerHistoryOpportunity) => {
      if (activeTab !== "new") return;

      const itemIndex = newItemIndexById.get(item.id);
      if (typeof itemIndex === "number") {
        feedbackAdvanceTargetIndexRef.current = itemIndex;
        feedbackRoleQueryIgnoreRef.current = getOpportunityUrlRoleId(item);
      }
    },
    [activeTab, newItemIndexById]
  );

  const updateFeedbackForItem = useCallback(
    (
      item: CareerHistoryOpportunity,
      feedback: CareerHistoryOpportunityFeedback | null,
      options?: {
        feedbackReason?: string | null;
        savedStage?: CareerOpportunitySavedStage | null;
      }
    ) => {
      void onUpdateHistoryOpportunityFeedback(item.id, feedback, {
        feedbackReason: options?.feedbackReason ?? null,
        interactionSource: "position_tab",
        promptImmediately:
          feedback !== null &&
          activeTab === "new" &&
          item.feedback === null &&
          historyOpportunityCounts.new <= 1,
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

  const handleSavedStatusChange = useCallback(
    (
      item: CareerHistoryOpportunity,
      status: CareerOpportunityManagementStatus
    ) => {
      if (!canChangeCareerOpportunityManagementStatus(item)) return;
      if (getCareerOpportunityManagementStatus(item) === status) return;

      logCareerEvent(`click_history_saved_status_${status}`);

      if (status === "archived") {
        updateFeedbackForItem(item, "negative");
        return;
      }

      const savedStage = getSavedStageForManagementStatus(status);
      if (!savedStage) return;

      if (item.feedback === "positive") {
        void onUpdateHistoryOpportunitySavedStage(item.id, savedStage);
        return;
      }

      updateFeedbackForItem(item, "positive", { savedStage });
    },
    [
      logCareerEvent,
      onUpdateHistoryOpportunitySavedStage,
      updateFeedbackForItem,
    ]
  );

  const handlePositiveAction = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_history_positive");
      if (shouldGateInternalConnection(item)) {
        openInternalConnectionOnboardingModal(item);
        return;
      }

      if (shouldCollectPositiveReason(item)) {
        requestPositiveFeedback(item);
        return;
      }

      rememberFeedbackAdvanceTarget(item);
      updateFeedbackForItem(item, "positive", {
        savedStage: getDefaultSavedStage(item),
      });
    },
    [
      rememberFeedbackAdvanceTarget,
      logCareerEvent,
      openInternalConnectionOnboardingModal,
      requestPositiveFeedback,
      shouldGateInternalConnection,
      updateFeedbackForItem,
    ]
  );

  const handleNegativeAction = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_history_negative");
      requestNegativeFeedback(item);
    },
    [logCareerEvent, requestNegativeFeedback]
  );

  const handleSubmitPositivePrompt = useCallback(() => {
    if (!positivePromptOpportunity) return;

    logCareerEvent("click_history_submit_positive_reason");
    const feedbackReason = positivePromptDraft.trim();

    rememberFeedbackAdvanceTarget(positivePromptOpportunity);
    updateFeedbackForItem(positivePromptOpportunity, "positive", {
      feedbackReason: feedbackReason || null,
      savedStage: getDefaultSavedStage(positivePromptOpportunity),
    });
    setPositivePromptOpportunityId(null);
    setPositivePromptDraft("");
  }, [
    positivePromptDraft,
    positivePromptOpportunity,
    logCareerEvent,
    rememberFeedbackAdvanceTarget,
    updateFeedbackForItem,
  ]);

  const handleSubmitNegativePrompt = useCallback(() => {
    if (!negativePromptOpportunity) return;

    logCareerEvent("click_history_submit_negative_reason");
    const feedbackReason = serializeNegativeFeedbackReason({
      customReason: negativePromptCustomReason,
      item: negativePromptOpportunity,
      selectedOptions: negativePromptSelectedOptions,
    });

    rememberFeedbackAdvanceTarget(negativePromptOpportunity);
    if (hasExternalAlreadyAppliedFeedbackReason(negativePromptSelectedOptions)) {
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
    rememberFeedbackAdvanceTarget,
    updateFeedbackForItem,
  ]);

  useEffect(() => {
    if (
      activeTab !== "new" ||
      !activeOpportunity ||
      infoOpportunityType ||
      positivePromptOpportunity ||
      negativePromptOpportunity
    ) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isInteractiveTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();

      if (key === "arrowleft") {
        event.preventDefault();
        moveActiveOpportunity(-1);
        return;
      }

      if (key === "arrowright") {
        event.preventDefault();
        handleMoveNextOpportunity();
        return;
      }

      if (key === "t" || key === "ㅅ") {
        event.preventDefault();
        handlePositiveAction(activeOpportunity);
        return;
      }

      if (key === "s" || key === "ㄴ") {
        event.preventDefault();
        handleNegativeAction(activeOpportunity);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeOpportunity,
    activeTab,
    handleNegativeAction,
    handleMoveNextOpportunity,
    handlePositiveAction,
    infoOpportunityType,
    moveActiveOpportunity,
    negativePromptOpportunity,
    positivePromptOpportunity,
  ]);

  const tabs = useMemo<CareerInPageTabItem<HistoryDisplayTabId>[]>(
    () =>
      historyDisplayTabs.map(({ id, label }) => ({
        id,
        label,
        count: (() => {
          if (id === "new") return historyOpportunityCounts.new;
          if (id === "saved") {
            return (
              historyOpportunityCounts.savedStages.saved +
              historyOpportunityCounts.savedStages.applied +
              historyOpportunityCounts.savedStages.connected +
              historyOpportunityCounts.savedStages.closed
            );
          }
          return historyOpportunityCounts.savedStages.hidden;
        })(),
      })),
    [
      historyOpportunityCounts.new,
      historyOpportunityCounts.savedStages.applied,
      historyOpportunityCounts.savedStages.closed,
      historyOpportunityCounts.savedStages.connected,
      historyOpportunityCounts.savedStages.hidden,
      historyOpportunityCounts.savedStages.saved,
      historyDisplayTabs,
    ]
  );
  const activeDisplayTab: HistoryDisplayTabId =
    activeTab === "saved" && activeSavedStatus === "hidden"
      ? "hidden"
      : activeTab;

  const handleDisplayTabChange = useCallback(
    (nextTab: HistoryDisplayTabId) => {
      logCareerEvent(`click_history_tab_${nextTab}`);
      setModalOpportunityId(null);

      if (nextTab === "new") {
        updateHistoryLocation("new", activeSavedStatus, {
          roleId: getOpportunityUrlRoleId(activeOpportunity),
        });
        return;
      }
      if (nextTab === "saved") {
        updateHistoryLocation("saved", "all");
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

  const openModalForItem = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_history_open_detail");
      const roleId = getOpportunityUrlRoleId(item);
      setModalOpportunityId(item.id);

      if (isSavedOpportunity(item)) {
        updateHistoryLocation(
          "saved",
          getSavedOpportunityManagementStatus(item),
          {
            mode: "replace",
            roleId,
          }
        );
        return;
      }

      if (isArchivedOpportunity(item)) {
        updateHistoryLocation("archived", activeSavedStatus, {
          mode: "replace",
          roleId,
        });
      }
    },
    [activeSavedStatus, logCareerEvent, updateHistoryLocation]
  );

  const openOpportunityInfo = useCallback(
    (opportunityType: CareerOpportunityType) => {
      logCareerEvent(`click_history_open_opportunity_info_${opportunityType}`);
      setInfoOpportunityType(opportunityType);
    },
    [logCareerEvent]
  );

  const handleSavedStatusFilterChange = useCallback(
    (status: SavedOpportunityManagementStatus) => {
      logCareerEvent(`click_history_saved_filter_${status}`);
      setModalOpportunityId(null);
      updateHistoryLocation("saved", status);
    },
    [logCareerEvent, updateHistoryLocation]
  );

  const handleSavedDisplayModeChange = useCallback(
    (mode: SavedHistoryDisplayMode) => {
      logCareerEvent(`click_history_saved_view_${mode}`);
      setSavedDisplayMode(mode);
    },
    [logCareerEvent, setSavedDisplayMode]
  );

  const closeOpportunityModal = useCallback(() => {
    setModalOpportunityId(null);
    updateHistoryLocation(activeTab, activeSavedStatus, {
      mode: "replace",
      roleId: null,
    });
  }, [activeSavedStatus, activeTab, updateHistoryLocation]);

  const pendingOpportunityIds = useMemo(
    () => new Set(historyUpdatingOpportunityIds),
    [historyUpdatingOpportunityIds]
  );

  const savedManagementCounts: Record<
    SavedOpportunityManagementStatus,
    number
  > = useMemo(
    () => ({
      all:
        historyOpportunityCounts.savedStages.saved +
        historyOpportunityCounts.savedStages.applied +
        historyOpportunityCounts.savedStages.connected +
        historyOpportunityCounts.savedStages.closed,
      applied: historyOpportunityCounts.savedStages.applied,
      closed: historyOpportunityCounts.savedStages.closed,
      connected: historyOpportunityCounts.savedStages.connected,
      hidden: historyOpportunityCounts.savedStages.hidden,
      saved: historyOpportunityCounts.savedStages.saved,
    }),
    [
      historyOpportunityCounts.savedStages.applied,
      historyOpportunityCounts.savedStages.closed,
      historyOpportunityCounts.savedStages.connected,
      historyOpportunityCounts.savedStages.hidden,
      historyOpportunityCounts.savedStages.saved,
    ]
  );
  const savedManagementItems = useMemo(() => {
    return savedItems.filter((item) => {
      const status = getSavedOpportunityManagementStatus(item);
      if (activeSavedStatus === "all") return status !== "hidden";
      return status === activeSavedStatus;
    });
  }, [activeSavedStatus, savedItems]);
  const savedBoardItems = useMemo(
    () =>
      savedItems
        .filter(
          (item) => getSavedOpportunityManagementStatus(item) !== "hidden"
        )
        .sort(compareRecommendedAtDesc),
    [savedItems]
  );
  const savedBoardColumnLoadState = useMemo<
    Record<
      SavedOpportunityBoardStatus,
      {
        hasMore: boolean;
        loadedCount: number;
        loading: boolean;
        totalCount: number;
      }
    >
  >(
    () => ({
      saved: {
        hasMore: savedItemsByStage.saved.length < savedManagementCounts.saved,
        loadedCount: savedItemsByStage.saved.length,
        loading: isHistoryOpportunityPageFilterLoading(
          getSavedBoardColumnFilter("saved")
        ),
        totalCount: savedManagementCounts.saved,
      },
      applied: {
        hasMore:
          savedItemsByStage.applied.length < savedManagementCounts.applied,
        loadedCount: savedItemsByStage.applied.length,
        loading: isHistoryOpportunityPageFilterLoading(
          getSavedBoardColumnFilter("applied")
        ),
        totalCount: savedManagementCounts.applied,
      },
      connected: {
        hasMore:
          savedItemsByStage.connected.length < savedManagementCounts.connected,
        loadedCount: savedItemsByStage.connected.length,
        loading: isHistoryOpportunityPageFilterLoading(
          getSavedBoardColumnFilter("connected")
        ),
        totalCount: savedManagementCounts.connected,
      },
      closed: {
        hasMore: savedItemsByStage.closed.length < savedManagementCounts.closed,
        loadedCount: savedItemsByStage.closed.length,
        loading: isHistoryOpportunityPageFilterLoading(
          getSavedBoardColumnFilter("closed")
        ),
        totalCount: savedManagementCounts.closed,
      },
    }),
    [
      isHistoryOpportunityPageFilterLoading,
      savedItemsByStage.applied.length,
      savedItemsByStage.closed.length,
      savedItemsByStage.connected.length,
      savedItemsByStage.saved.length,
      savedManagementCounts.applied,
      savedManagementCounts.closed,
      savedManagementCounts.connected,
      savedManagementCounts.saved,
    ]
  );
  const loadMoreSavedBoardColumn = useCallback(
    (status: SavedOpportunityBoardStatus) => {
      const loadState = savedBoardColumnLoadState[status];
      if (!loadState.hasMore || loadState.loading) return;

      logCareerEvent(`click_history_board_load_more_${status}`);
      void onLoadMoreHistoryOpportunities(getSavedBoardColumnFilter(status));
    },
    [logCareerEvent, onLoadMoreHistoryOpportunities, savedBoardColumnLoadState]
  );
  const listItems =
    activeTab === "saved" ? savedManagementItems : archivedItems;
  const listTotal =
    activeTab === "saved"
      ? savedManagementCounts[activeSavedStatus]
      : activeTab === "archived"
        ? historyOpportunityCounts.archived
        : 0;
  const hasMoreListItems =
    (activeTab === "saved" || activeTab === "archived") &&
    listItems.length < listTotal;
  const activeListFilter =
    useMemo<CareerHistoryOpportunityPageFilter | null>(() => {
      if (activeTab === "archived") {
        return { historyTab: "archived" };
      }
      if (activeTab === "saved") {
        const savedStage = getSavedStageForManagementStatus(activeSavedStatus);
        return {
          historyTab: "saved",
          savedStage:
            activeSavedStatus === "all" ? "all" : (savedStage ?? undefined),
        };
      }
      return null;
    }, [activeSavedStatus, activeTab]);
  const loadMoreListItems = useCallback(() => {
    if (!activeListFilter || !hasMoreListItems || historyLoadingMore) return;
    void onLoadMoreHistoryOpportunities(activeListFilter);
  }, [
    activeListFilter,
    hasMoreListItems,
    historyLoadingMore,
    onLoadMoreHistoryOpportunities,
  ]);

  useEffect(() => {
    if (activeTab !== "saved" && activeTab !== "archived") return;
    if (
      activeTab === "saved" &&
      savedDisplayMode === "board" &&
      activeSavedStatus !== "hidden"
    ) {
      return;
    }
    if (listItems.length > 0) return;
    loadMoreListItems();
  }, [
    activeSavedStatus,
    activeTab,
    listItems.length,
    loadMoreListItems,
    savedDisplayMode,
  ]);

  useEffect(() => {
    if (
      activeTab !== "saved" ||
      activeSavedStatus === "hidden" ||
      savedDisplayMode !== "board"
    ) {
      return;
    }

    const statusesToLoad: SavedOpportunityBoardStatus[] = [];
    for (const status of SAVED_BOARD_COLUMN_STATUSES) {
      const loadState = savedBoardColumnLoadState[status];
      const targetCount = Math.min(
        loadState.totalCount,
        SAVED_BOARD_MIN_ITEMS_PER_COLUMN
      );
      if (
        targetCount === 0 ||
        loadState.loadedCount >= targetCount ||
        !loadState.hasMore ||
        loadState.loading
      ) {
        continue;
      }

      statusesToLoad.push(status);
    }

    if (statusesToLoad.length > 0) {
      void onLoadSavedStageHistoryOpportunityPages(statusesToLoad);
    }
  }, [
    activeSavedStatus,
    activeTab,
    onLoadSavedStageHistoryOpportunityPages,
    savedBoardColumnLoadState,
    savedDisplayMode,
  ]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMoreListItems || historyLoadingMore) return;

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
  }, [hasMoreListItems, historyLoadingMore, loadMoreListItems]);

  const isConversationCompleted = stage === "completed";
  const isOpportunitySearchActive =
    opportunityRunTriggerPending || Boolean(opportunityRun?.inputLocked);
  const emptyStateVariant: HistoryEmptyStateVariant = isOpportunitySearchActive
    ? "searching"
    : isConversationCompleted
      ? "matching"
      : "onboarding";

  if (historyLoading) {
    return (
      <section className="px-5 py-6">
        <div className="flex items-center gap-2 text-[15px] leading-6 text-neutral-muted">
          <Loader2 className="h-4 w-4 animate-spin text-neutral-primary" />
          {t(
            "career.common.career_history_panel.0s3czqf",
            "저장된 정보를 불러오는 중입니다..."
          )}
        </div>
      </section>
    );
  }

  if (!hasKnownHistoryOpportunities) {
    return (
      <HistoryEmptyStatePanel
        onOpenChat={openChatTab}
        variant={emptyStateVariant}
      />
    );
  }

  const showShortcutPanel = activeTab === "new" && Boolean(activeOpportunity);
  const activeSavedStatusCount = savedManagementCounts[activeSavedStatus];
  const showInlineOpportunityPage =
    activeTab !== "new" && Boolean(modalOpportunity);

  return (
    <div className="flex min-h-full flex-col">
      <div className="my-4 flex items-center justify-between gap-3">
        <CareerInPageTabs
          items={tabs}
          activeId={activeDisplayTab}
          onChange={handleDisplayTabChange}
        />
        <Tooltips
          text={t(
            "career.common.career_history_panel.archived_tooltip",
            "제외한 포지션"
          )}
        >
          <BareButton
            type="button"
            aria-label={"제외한 포지션"}
            onClick={() => handleDisplayTabChange("archived")}
            className={cn(
              "inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-neutral-1000-a05 px-2 text-[12px] font-medium transition-colors",
              activeDisplayTab === "archived"
                ? "bg-bg-floating text-neutral-primary"
                : "bg-bg-weak/80 text-neutral-muted hover:bg-bg-floating hover:text-neutral-primary"
            )}
          >
            <Archive className="h-3.5 w-3.5" />
            {/* {!historyOpportunityCounts.archived ? null : (
              <span className="hidden min-w-4 text-center md:inline">
                {historyOpportunityCounts.archived}
              </span>
            )} */}
          </BareButton>
        </Tooltips>
      </div>

      <div className="relative flex flex-1 flex-col gap-6">
        <div className={cn("min-w-0 flex-1", showShortcutPanel && "pb-24")}>
          {historyUpdateError && (
            <div className="mb-4 rounded-[8px] border border-critical/30 bg-critical-faded px-4 py-3 text-sm text-critical">
              {historyUpdateError}
            </div>
          )}

          {activeTab === "new" && activeOpportunity && (
            <>
              <HistoryOpportunityDetailContent
                item={activeOpportunity}
                canMovePrev={activeIndex > 0}
                canMoveNext={canMoveNextOpportunity}
                onOpenCompanyInfo={openHistoryCompanyInfo}
                onOpenLink={(url) => openHistoryLink(activeOpportunity, url)}
                onOpenOpportunityInfo={openOpportunityInfo}
                onMovePrev={() => moveActiveOpportunity(-1)}
                onMoveNext={handleMoveNextOpportunity}
              />
            </>
          )}

          {activeTab === "new" && !activeOpportunity && (
            <InlinePanel className="px-5 py-5">
              <div className="text-[14px] leading-6 text-neutral-soft">
                {t(
                  "career.common.career_history_panel.1h65j93",
                  "새로 받은 기회를 모두 검토했습니다."
                )}
              </div>
            </InlinePanel>
          )}

          {showInlineOpportunityPage && modalOpportunity && (
            <HistoryOpportunityInlinePage
              item={modalOpportunity}
              pending={pendingOpportunityIds.has(modalOpportunity.id)}
              savedStatus={getCareerOpportunityManagementStatus(
                modalOpportunity
              )}
              onBack={closeOpportunityModal}
              onOpenCompanyInfo={openHistoryCompanyInfo}
              onOpenLink={(url) => openHistoryLink(modalOpportunity, url)}
              onOpenOpportunityInfo={openOpportunityInfo}
              onSavedStatusChange={(status) =>
                handleSavedStatusChange(modalOpportunity, status)
              }
              onUpdateTalentMemo={(item, talentMemo) =>
                onUpdateHistoryOpportunityTalentMemo(item.id, talentMemo)
              }
            />
          )}

          {activeTab === "saved" && !showInlineOpportunityPage && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                {savedDisplayMode === "list" &&
                activeSavedStatus !== "hidden" ? (
                  <div className="min-w-0">
                    <ActionDropdown
                      align="start"
                      contentClassName="min-w-[180px]"
                      trigger={
                        <BareButton
                          type="button"
                          className="inline-flex h-8 min-w-[160px] items-center justify-between gap-2 rounded-md border border-neutral-1000-a05 bg-bg-floating px-2.5 text-[13px] font-medium text-neutral-primary transition-colors hover:border-neutral-400 hover:bg-bg-weak"
                        >
                          <span className="truncate">
                            {getSavedOpportunityStatusLabel(
                              activeSavedStatus,
                              t
                            )}
                          </span>
                          <span className="ml-auto flex shrink-0 items-center gap-1.5">
                            <span className="min-w-4 text-right text-[11px] font-medium tabular-nums text-neutral-muted">
                              {activeSavedStatusCount}
                            </span>
                            <ChevronDown className="h-4 w-4 text-neutral-muted" />
                          </span>
                        </BareButton>
                      }
                    >
                      {savedOpportunityStatusOptions.map((option) => {
                        const count = savedManagementCounts[option.id];
                        return (
                          <ActionDropdownItem
                            key={option.id}
                            className="flex min-w-[180px] items-center justify-between gap-4"
                            selected={option.id === activeSavedStatus}
                            onSelect={() =>
                              handleSavedStatusFilterChange(option.id)
                            }
                          >
                            <span className="truncate">{option.label}</span>
                            <span className="shrink-0 text-right text-[11px] font-medium tabular-nums text-neutral-muted">
                              {count}
                            </span>
                          </ActionDropdownItem>
                        );
                      })}
                    </ActionDropdown>
                  </div>
                ) : (
                  <div className="hidden md:block" />
                )}

                {activeSavedStatus !== "hidden" ? (
                  <div className="inline-flex h-9 w-fit items-center rounded-md border border-neutral-1000-a05 bg-bg-weak p-1">
                    {savedDisplayModeOptions.map((option) => {
                      const Icon = option.icon;
                      const active = option.id === savedDisplayMode;
                      return (
                        <BareButton
                          key={option.id}
                          type="button"
                          aria-label={option.label}
                          title={option.label}
                          onClick={() =>
                            handleSavedDisplayModeChange(option.id)
                          }
                          className={cn(
                            "inline-flex h-7 w-8 items-center justify-center rounded text-neutral-primary transition-colors",
                            active
                              ? "bg-black text-neutral-00"
                              : "text-neutral-muted hover:bg-bg-floating hover:text-neutral-primary"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </BareButton>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {(savedDisplayMode === "list" ||
                activeSavedStatus === "hidden") &&
                listItems.length > 0 && (
                  <div className="space-y-3 overflow-y-auto pr-1">
                    {listItems.map((item) => {
                      const savedStatus =
                        getCareerOpportunityManagementStatus(item);
                      return (
                        <OpportunityListCard
                          key={item.id}
                          item={item}
                          pending={pendingOpportunityIds.has(item.id)}
                          onOpenOpportunityInfo={openOpportunityInfo}
                          onOpenCompanyInfo={openHistoryCompanyInfo}
                          savedStatus={savedStatus}
                          onSavedStatusChange={(status) =>
                            handleSavedStatusChange(item, status)
                          }
                          onOpenDetail={() => openModalForItem(item)}
                        />
                      );
                    })}
                  </div>
                )}

              {(savedDisplayMode === "list" ||
                activeSavedStatus === "hidden") &&
                listItems.length === 0 && (
                  <InlinePanel className="px-5 py-5">
                    <div className="text-[14px] leading-6 text-neutral-muted">
                      {t(
                        "career.common.career_history_panel.1q435d3",
                        "이 상태에 해당하는 기회가 아직 없습니다."
                      )}
                    </div>
                  </InlinePanel>
                )}

              {savedDisplayMode === "board" &&
                activeSavedStatus !== "hidden" && (
                  <SavedOpportunityBoard
                    columnLoadState={savedBoardColumnLoadState}
                    counts={savedManagementCounts}
                    items={savedBoardItems}
                    pendingOpportunityIds={pendingOpportunityIds}
                    onLoadMoreColumn={loadMoreSavedBoardColumn}
                    onOpenDetail={openModalForItem}
                    onStatusChange={handleSavedStatusChange}
                  />
                )}

              {(savedDisplayMode === "list" ||
                activeSavedStatus === "hidden") &&
                hasMoreListItems && (
                  <div
                    ref={loadMoreSentinelRef}
                    className="flex min-h-12 items-center justify-center text-[13px] text-neutral-muted"
                  >
                    {historyLoadingMore ? (
                      <Loader2 className="h-4 w-4 animate-spin text-neutral-muted" />
                    ) : (
                      t(
                        "career.common.career_history_panel.01m9cc2",
                        "더 불러올 항목이 있습니다."
                      )
                    )}
                  </div>
                )}
            </div>
          )}

          {activeTab === "archived" &&
            !showInlineOpportunityPage &&
            listItems.length > 0 && (
              <div className="space-y-3 overflow-y-auto pr-1">
                {listItems.map((item) => (
                  <OpportunityListCard
                    key={item.id}
                    item={item}
                    pending={pendingOpportunityIds.has(item.id)}
                    onOpenOpportunityInfo={openOpportunityInfo}
                    onOpenCompanyInfo={openHistoryCompanyInfo}
                    savedStatus={getCareerOpportunityManagementStatus(item)}
                    onSavedStatusChange={(status) =>
                      handleSavedStatusChange(item, status)
                    }
                    onOpenDetail={() => openModalForItem(item)}
                  />
                ))}
              </div>
            )}

          {activeTab === "archived" &&
            !showInlineOpportunityPage &&
            listItems.length === 0 && (
              <div className="space-y-3">
                <InlinePanel className="px-5 py-5">
                  <div className="text-[14px] leading-6 text-neutral-soft">
                    {t(
                      "career.common.career_history_panel.0okcy6f",
                      "이 탭에 해당하는 기회가 아직 없습니다."
                    )}
                  </div>
                </InlinePanel>
              </div>
            )}

          {activeTab === "archived" &&
            !showInlineOpportunityPage &&
            hasMoreListItems && (
              <div
                ref={loadMoreSentinelRef}
                className="flex min-h-12 items-center justify-center text-[13px] text-neutral-soft"
              >
                {historyLoadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin text-neutral-muted" />
                ) : (
                  t(
                    "career.common.career_history_panel.01m9cc2",
                    "더 불러올 항목이 있습니다."
                  )
                )}
              </div>
            )}
        </div>
        {showShortcutPanel && activeOpportunity && (
          <div className="sticky -bottom-8 z-20 bg-bg-floating px-4 pb-3 pt-2">
            <HistoryShortcutPanel
              item={activeOpportunity}
              pending={pendingOpportunityIds.has(activeOpportunity.id)}
              onPositive={() => handlePositiveAction(activeOpportunity)}
              onNegative={() => handleNegativeAction(activeOpportunity)}
              activeIndex={activeIndex}
              canMoveNext={canMoveNextOpportunity}
              nextPending={nextOpportunityPending}
              onNext={handleMoveNextOpportunity}
              onPrev={() => moveActiveOpportunity(-1)}
            />
          </div>
        )}
      </div>

      <HistoryOpportunityInfoModal
        opportunityType={infoOpportunityType}
        onClose={() => setInfoOpportunityType(null)}
      />

      <InternalConnectionOnboardingModal
        open={Boolean(internalConnectionOnboardingOpportunity)}
        callPending={Boolean(callStartPending)}
        onClose={() => setInternalConnectionOnboardingOpportunityId(null)}
        onStartChat={startOnboardingChatFromGate}
        onStartCall={startOnboardingCallFromGate}
      />

      <CareerCompanyDetailDrawer
        companyDbId={companyDetailCompanyDbId}
        open={companyDetailCompanyDbId !== null}
        onClose={() => setCompanyDetailCompanyDbId(null)}
      />

      <HistoryPositiveFeedbackModal
        item={positivePromptOpportunity}
        draft={positivePromptDraft}
        pending={
          positivePromptOpportunity
            ? pendingOpportunityIds.has(positivePromptOpportunity.id)
            : false
        }
        onChangeDraft={setPositivePromptDraft}
        onClose={() => {
          setPositivePromptOpportunityId(null);
          setPositivePromptDraft("");
        }}
        onSubmit={handleSubmitPositivePrompt}
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
    </div>
  );
};

export default React.memo(CareerHistoryPanel);
