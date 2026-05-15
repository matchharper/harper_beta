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
import { useQueryClient } from "@tanstack/react-query";
import { showToast } from "@/components/toast/toast";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import { useCompanyModalStore } from "@/store/useModalStore";
import CareerInPageTabs from "./CareerInPageTabs";
import {
  CareerInlinePanel,
  CareerPrimaryButton,
  careerCx,
} from "./ui/CareerPrimitives";
import {
  CareerOpportunityType,
  type CareerHistoryOpportunity,
  type CareerHistoryOpportunityFeedback,
  type CareerHistoryOpportunityPageFilter,
  type CareerOpportunitySavedStage,
} from "./types";
import {
  getCareerAppliedSavedStageLabel,
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
  HistoryQuestionModal,
  parseNegativeFeedbackReason,
  serializeNegativeFeedbackReason,
} from "./history/FeedbackModal";
import OpportunityListCard, {
  getFeedbackForStatusDropdownValue,
} from "./history/OpportunityListCard";
import HistoryOpportunityDetailContent from "./history/HistoryOpportunityDetailContent";
import HistoryOpportunityInfoModal from "./history/HistoryOppotunityInfoModal";
import OpportunityDetailModal from "./history/OpportunityDetailModal";
import HistoryShortcutPanel from "./history/HistoryShortcutPanel";
import React from "react";

type HistoryTabId = "new" | "saved" | "archived";
type HistoryDisplayTabId = "new" | "saved" | "archived" | "connected";
type SavedTabId = CareerOpportunitySavedStage;

const HISTORY_TAB_QUERY_KEY = "historyTab";
const HISTORY_SAVED_STAGE_QUERY_KEY = "savedStage";
const HISTORY_ROLE_QUERY_KEY = "id";
const CAREER_HISTORY_PATHNAME = "/career/history";

const isHistoryTabId = (value: unknown): value is HistoryTabId =>
  value === "new" || value === "saved" || value === "archived";

const isSavedTabId = (value: unknown): value is SavedTabId =>
  value === "saved" ||
  value === "applied" ||
  value === "connected" ||
  value === "closed";

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getNormalizedQueryValue = (value: string | string[] | undefined) =>
  String(getQueryValue(value) ?? "").trim();

const getNormalizedPathname = (path: string) =>
  path.split(/[?#]/)[0]?.replace(/\/+$/, "") || "/career";

const getOpportunityUrlRoleId = (item: CareerHistoryOpportunity | null) =>
  String(item?.roleId ?? "").trim();

const HISTORY_DISPLAY_TABS: Array<{
  id: HistoryDisplayTabId;
  label: string;
}> = [
  { id: "new", label: "새 포지션" },
  { id: "saved", label: "저장함" },
  { id: "archived", label: "선호하지 않음" },
  { id: "connected", label: "연결됨" },
];

const compareRecommendedAtDesc = (
  left: CareerHistoryOpportunity,
  right: CareerHistoryOpportunity
) => Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt);

const formatEmploymentType = (value: string) => {
  if (value === "full_time") return "";
  if (value === "part_time") return "파트타임";
  if (value === "internship") return "인턴";
  if (value === "contract") return "계약직";
  if (value === "fractional") return "Fractional";
  return value.replaceAll("_", " ");
};

const formatWorkMode = (value: string | null) => {
  if (value === "remote") return "원격근무";
  if (value === "hybrid") return "대면 + 원격";
  if (value === "onsite") return "대면근무";
  return value;
};

const getDefaultSavedStage = (opportunityType: CareerOpportunityType) =>
  getCareerDefaultSavedStage(opportunityType);

export const getResolvedSavedStage = (item: CareerHistoryOpportunity) =>
  item.savedStage ?? getDefaultSavedStage(item.opportunityType);

const isNewOpportunity = (item: CareerHistoryOpportunity) =>
  item.feedback === null;

const isSavedOpportunity = (item: CareerHistoryOpportunity) =>
  item.feedback === "positive";

const isArchivedOpportunity = (item: CareerHistoryOpportunity) =>
  item.feedback === "negative";

export const getPositiveActionLabel = (item: CareerHistoryOpportunity) =>
  getCareerPositiveActionLabel(item.opportunityType);

export const getNegativeActionLabel = (item: CareerHistoryOpportunity) =>
  getCareerNegativeActionLabel(item.opportunityType);

export const getOpportunityTypeLabel = (item: CareerHistoryOpportunity) =>
  getCareerOpportunityTypeLabel(item.opportunityType);

export const getOpportunityInfoCopy = (
  opportunityType: CareerOpportunityType
) => getCareerOpportunityInfoCopy(opportunityType);

export const getSavedStageLabel = (
  stage: CareerOpportunitySavedStage,
  item: CareerHistoryOpportunity
) => {
  if (stage === "applied") {
    return getCareerAppliedSavedStageLabel(item.opportunityType);
  }
  if (stage === "connected") return "연결됨";
  if (stage === "closed") return "종료됨";
  return "저장함";
};

export const getOpportunityStatusLabel = (item: CareerHistoryOpportunity) => {
  if (item.feedback === "negative") return "보관됨";
  if (item.feedback === "positive") {
    return getSavedStageLabel(getResolvedSavedStage(item), item);
  }
  return null;
};

const shouldCollectPositiveReason = (item: CareerHistoryOpportunity) =>
  shouldCollectCareerPositiveFeedbackReason(item.opportunityType);

export const getMetaItems = (item: CareerHistoryOpportunity) =>
  [
    formatWorkMode(item.workMode),
    ...item.employmentTypes.map(formatEmploymentType),
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
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={careerCx(
      "flex min-h-[40px] w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm leading-5 transition-colors disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
  >
    <span className="flex items-center gap-2">
      {icon}
      <span>{label}</span>
    </span>
    {hint ? <span className="text-[12px]">{hint}</span> : null}
  </button>
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
  <div className="px-2 flex min-w-0 gap-3 border-t border-beige900/10 py-4 first:border-t-0 xl:block xl:border-t-0 xl:py-0 xl:pl-4 xl:first:pl-0">
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-beige500 text-beige900">
      {icon}
    </span>
    <div className="min-w-0 xl:mt-3">
      <div className="text-[13px] font-medium leading-5 text-beige900">
        {title}
      </div>
      <div className="mt-1.5 text-[12px] leading-5 text-beige900/55">
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
  const config =
    variant === "searching"
      ? {
          actionLabel: null,
          details: [
            {
              body: "프로필과 대화에서 강한 경력 신호를 정리합니다.",
              icon: <FileCheck2 className="h-3.5 w-3.5" />,
              title: "신호 정리",
            },
            {
              body: "네트워크와 공개 포지션을 같은 기준으로 비교합니다.",
              icon: <Search className="h-3.5 w-3.5" />,
              title: "포지션 탐색",
            },
            {
              body: "조건에 맞는 포지션만 새 목록에 남깁니다.",
              icon: <Target className="h-3.5 w-3.5" />,
              title: "적합도 정렬",
            },
          ],
          eyebrow: "탐색 진행 중",
          icon: <Loader2 className="h-5 w-5 animate-spin" />,
          title: "좋은 기회를 찾고 있습니다.",
          toneClassName: "bg-beige900 text-beige50",
          nextStep: "검토가 끝난 포지션은 새 포지션 탭에 바로 표시됩니다.",
          body: (
            <>
              기준에 맞는 포지션만 남기고 있습니다. 준비되면 새 포지션에
              표시됩니다.
            </>
          ),
        }
      : variant === "onboarding"
        ? {
            actionLabel: "Harper와 대화하기",
            details: [
              {
                body: "다음에 맡고 싶은 역할과 레벨을 확인합니다.",
                icon: <BriefcaseBusiness className="h-3.5 w-3.5" />,
                title: "희망 역할",
              },
              {
                body: "지역, 근무 형태, 보상 기준을 정합니다.",
                icon: <MapPin className="h-3.5 w-3.5" />,
                title: "근무 조건",
              },
              {
                body: "관심 없는 산업, 회사 유형, 역할을 제외합니다.",
                icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
                title: "제외 기준",
              },
            ],
            eyebrow: "첫 추천 준비",
            icon: <ClipboardCheck className="h-5 w-5" />,
            title: "어떤 기회에 열려계신지 알려주세요..",
            toneClassName: "bg-beige700/10 text-beige700",
            nextStep:
              "대화를 통해 기준을 확인하면 첫 포지션 탐색을 시작합니다.",
            body: (
              <>
                경력/이력은 확인했습니다.
                <br />
                희망 역할, 근무 방식, 제외 조건 등을 알려주시면 첫 추천을 시작할
                수 있습니다.
              </>
            ),
          }
        : {
            actionLabel: null,
            details: [
              {
                body: "저장된 경력과 선호 기준을 함께 확인합니다.",
                icon: <FileCheck2 className="h-3.5 w-3.5" />,
                title: "자료 검토",
              },
              {
                body: "조건과 맞지 않는 역할은 추천에서 제외합니다.",
                icon: <Target className="h-3.5 w-3.5" />,
                title: "후보 압축",
              },
              {
                body: "첫 추천이 준비되면 새 포지션에 표시됩니다.",
                icon: <ListChecks className="h-3.5 w-3.5" />,
                title: "결과 정리",
              },
            ],
            eyebrow: "검토 진행 중",
            icon: <Search className="h-5 w-5" />,
            title: "첫 추천 후보를 검토하고 있습니다.",
            toneClassName: "bg-beige700/10 text-beige700",
            nextStep:
              "첫 추천이 준비되면 새 포지션 탭에서 바로 검토할 수 있습니다.",
            body: (
              <>
                대화에서 정리한 기준으로 실제로 보낼 만한 역할만 남기고
                있습니다.
              </>
            ),
          };

  return (
    <section className="mt-6 overflow-hidden rounded-[8px] border border-beige900/10 bg-white/70">
      <div className="min-w-0 px-5 py-6 md:px-7 xl:px-8">
        <h4 className="mt-0 max-w-[640px] text-[16px] font-medium leading-7 text-beige900 sm:text-[18px]">
          {config.title}
        </h4>
        <p className="mt-3 max-w-[620px] text-[14px] leading-6 text-beige900/65">
          {config.body}
        </p>

        {config.actionLabel && (
          <div className="mt-4">
            <CareerPrimaryButton onClick={onOpenChat} className="gap-2">
              {config.actionLabel}
              <ArrowRight className="h-4 w-4" />
            </CareerPrimaryButton>
          </div>
        )}

        <div className="mt-7 w-full grid xl:grid-cols-3 xl:divide-x xl:divide-beige900/10">
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const openCompanyModal = useCompanyModalStore((s) => s.handleOpenCompany);
  const {
    stage,
    opportunityRun,
    opportunityRunTriggerPending,
    historyOpportunityCounts,
    historyOpportunities,
    historyLoading,
    historyLoadingMore,
    historyUpdatingOpportunityIds,
    historyUpdateError,
    onLoadMoreHistoryOpportunities,
    onLoadHistoryOpportunityByRoleId,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
    onUpdateHistoryOpportunityFeedback,
    onSendHistoryOpportunityQuestion,
  } = useCareerSidebarContext();
  const [activeTab, setActiveTab] = useState<HistoryTabId>("new");
  const [activeSavedTab, setActiveSavedTab] = useState<SavedTabId>("saved");
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
  const [positivePromptOpportunityId, setPositivePromptOpportunityId] =
    useState<string | null>(null);
  const [positivePromptDraft, setPositivePromptDraft] = useState("");
  const [negativePromptOpportunityId, setNegativePromptOpportunityId] =
    useState<string | null>(null);
  const [negativePromptSelectedOptions, setNegativePromptSelectedOptions] =
    useState<string[]>([]);
  const [negativePromptCustomReason, setNegativePromptCustomReason] =
    useState("");
  const [questionPromptOpportunityId, setQuestionPromptOpportunityId] =
    useState<string | null>(null);
  const [questionPromptDraft, setQuestionPromptDraft] = useState("");
  const currentHistoryTabQuery = router.query[HISTORY_TAB_QUERY_KEY];
  const currentSavedStageQuery = router.query[HISTORY_SAVED_STAGE_QUERY_KEY];
  const currentRoleQuery = router.query[HISTORY_ROLE_QUERY_KEY];

  const openChatTab = useCallback(() => {
    const query: Record<string, string> = {};
    const invite = getQueryValue(router.query.invite);
    const mail = getQueryValue(router.query.mail);
    if (invite) query.invite = invite;
    if (mail) query.mail = mail;

    void router.push({
      pathname: "/career",
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  }, [router]);

  const updateHistoryLocation = useCallback(
    (
      nextTab: HistoryTabId,
      nextSavedStage: SavedTabId,
      options?: {
        mode?: "push" | "replace";
        roleId?: string | null;
      }
    ) => {
      setActiveTab(nextTab);
      setActiveSavedTab(nextSavedStage);

      if (!router.isReady) return;

      const normalizedHistoryTab = getQueryValue(currentHistoryTabQuery);
      const normalizedSavedStage = getQueryValue(currentSavedStageQuery);
      const normalizedRoleId = getNormalizedQueryValue(currentRoleQuery);
      const nextRoleId = String(options?.roleId ?? "").trim();
      const isOnHistoryPath =
        getNormalizedPathname(router.asPath) === CAREER_HISTORY_PATHNAME;

      if (
        isOnHistoryPath &&
        normalizedHistoryTab === nextTab &&
        normalizedSavedStage === nextSavedStage &&
        normalizedRoleId === nextRoleId
      ) {
        return;
      }

      const query: Record<string, string | string[] | undefined> = {
        ...router.query,
        [HISTORY_TAB_QUERY_KEY]: nextTab,
        [HISTORY_SAVED_STAGE_QUERY_KEY]: nextSavedStage,
      };
      delete query.tab;

      if (nextRoleId) {
        query[HISTORY_ROLE_QUERY_KEY] = nextRoleId;
      } else {
        delete query[HISTORY_ROLE_QUERY_KEY];
      }

      const nextLocation = {
        pathname: CAREER_HISTORY_PATHNAME,
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
    delete query.tab;
    delete query[HISTORY_ROLE_QUERY_KEY];

    void router.replace(
      {
        pathname: CAREER_HISTORY_PATHNAME,
        query,
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [currentRoleQuery, router]);

  useEffect(() => {
    if (!router.isReady) return;
    if (getNormalizedPathname(router.asPath) === CAREER_HISTORY_PATHNAME) {
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
      SavedTabId,
      CareerHistoryOpportunity[]
    > = {
      saved: [],
      applied: [],
      connected: [],
      closed: [],
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
  const connectedSavedItems = useMemo(
    () =>
      [
        ...savedItemsByStage.applied,
        ...savedItemsByStage.connected,
        ...savedItemsByStage.closed,
      ].sort(compareRecommendedAtDesc),
    [
      savedItemsByStage.applied,
      savedItemsByStage.connected,
      savedItemsByStage.closed,
    ]
  );
  const filteredSavedItems =
    activeSavedTab === "saved" ? savedItemsByStage.saved : connectedSavedItems;
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
    const nextSavedTab = getQueryValue(currentSavedStageQuery);

    setActiveTab(isHistoryTabId(nextActiveTab) ? nextActiveTab : "new");
    setActiveSavedTab(isSavedTabId(nextSavedTab) ? nextSavedTab : "saved");
  }, [currentHistoryTabQuery, currentSavedStageQuery, router.isReady]);

  useEffect(() => {
    if (!modalOpportunityId) return;
    if (sortedOpportunityIds.has(modalOpportunityId)) return;
    setModalOpportunityId(null);
  }, [modalOpportunityId, sortedOpportunityIds]);

  useEffect(() => {
    if (!positivePromptOpportunityId) return;
    if (sortedOpportunityIds.has(positivePromptOpportunityId)) {
      return;
    }
    setPositivePromptOpportunityId(null);
    setPositivePromptDraft("");
  }, [positivePromptOpportunityId, sortedOpportunityIds]);

  useEffect(() => {
    if (!negativePromptOpportunityId) return;
    if (sortedOpportunityIds.has(negativePromptOpportunityId)) {
      return;
    }
    setNegativePromptOpportunityId(null);
    setNegativePromptSelectedOptions([]);
    setNegativePromptCustomReason("");
  }, [negativePromptOpportunityId, sortedOpportunityIds]);

  useEffect(() => {
    if (!questionPromptOpportunityId) return;
    if (sortedOpportunityIds.has(questionPromptOpportunityId)) {
      return;
    }
    setQuestionPromptOpportunityId(null);
    setQuestionPromptDraft("");
  }, [questionPromptOpportunityId, sortedOpportunityIds]);

  const activeIndex = activeOpportunityId
    ? (newItemIndexById.get(activeOpportunityId) ?? -1)
    : -1;

  const activeOpportunity = activeIndex >= 0 ? newItems[activeIndex] : null;
  const hasMoreNewOpportunities = newItems.length < historyOpportunityCounts.new;
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

  const questionPromptOpportunity = useMemo(
    () =>
      questionPromptOpportunityId
        ? (opportunityById.get(questionPromptOpportunityId) ?? null)
        : null,
    [opportunityById, questionPromptOpportunityId]
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
      updateHistoryLocation("new", activeSavedTab, {
        mode: "replace",
        roleId,
      });
      return;
    }

    if (isSavedOpportunity(requestedOpportunity)) {
      const savedStage = getResolvedSavedStage(requestedOpportunity);
      setModalOpportunityId(requestedOpportunity.id);
      updateHistoryLocation("saved", savedStage, {
        mode: "replace",
        roleId,
      });
      return;
    }

    if (isArchivedOpportunity(requestedOpportunity)) {
      setModalOpportunityId(requestedOpportunity.id);
      updateHistoryLocation("archived", activeSavedTab, {
        mode: "replace",
        roleId,
      });
    }
  }, [
    activeSavedTab,
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
    updateHistoryLocation("new", activeSavedTab, {
      mode: "replace",
      roleId,
    });
  }, [
    activeOpportunity,
    activeSavedTab,
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
    [activeIndex, newItems]
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

    loadNextOpportunityPage();
  }, [
    activeIndex,
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

  useEffect(() => {
    feedbackAdvanceTargetIndexRef.current = null;
    activeOpportunityUrlSyncRequestedRef.current = false;
    setAutoAdvanceTargetIndex(null);
    autoAdvanceRequestedRef.current = false;
    wasHistoryLoadingMoreRef.current = false;
  }, [activeTab]);

  const openUrl = useCallback((url: string | null | undefined) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const openHistoryLink = useCallback(
    (opportunityId: string, url: string | null | undefined) => {
      if (!url) return;
      void onMarkHistoryOpportunityClicked(opportunityId);
      openUrl(url);
    },
    [onMarkHistoryOpportunityClicked, openUrl]
  );

  const openHistoryCompanyInfo = useCallback(
    (item: CareerHistoryOpportunity) => {
      const fallbackUrl = item.companyHomepageUrl ?? item.companyLinkedinUrl;
      if (!item.companyDbId && !fallbackUrl) return;

      void onMarkHistoryOpportunityClicked(item.id);

      if (item.companyDbId) {
        void openCompanyModal({
          companyId: item.companyDbId,
          fallbackUrl,
          openWhenIncomplete: true,
          queryClient,
          tone: "career",
        });
        return;
      }

      openUrl(fallbackUrl);
    },
    [onMarkHistoryOpportunityClicked, openCompanyModal, openUrl, queryClient]
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

  const requestQuestionPrompt = useCallback(
    (item: CareerHistoryOpportunity) => {
      setQuestionPromptOpportunityId(item.id);
      setQuestionPromptDraft("");
    },
    []
  );

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
        savedStage:
          feedback === "positive"
            ? (options?.savedStage ?? getResolvedSavedStage(item))
            : null,
      });
    },
    [onUpdateHistoryOpportunityFeedback]
  );

  const handleRestoreAction = useCallback(
    (item: CareerHistoryOpportunity) => {
      setModalOpportunityId(null);
      setActiveOpportunityId(item.id);
      updateHistoryLocation("new", activeSavedTab, {
        roleId: getOpportunityUrlRoleId(item),
      });
      updateFeedbackForItem(item, null);
    },
    [activeSavedTab, updateFeedbackForItem, updateHistoryLocation]
  );

  const handleStatusDropdownChange = useCallback(
    (
      item: CareerHistoryOpportunity,
      value: Parameters<typeof getFeedbackForStatusDropdownValue>[0]
    ) => {
      const next = getFeedbackForStatusDropdownValue(value);

      if (next.feedback === null) {
        handleRestoreAction(item);
        return;
      }

      updateFeedbackForItem(item, next.feedback, {
        savedStage: next.savedStage,
      });
    },
    [handleRestoreAction, updateFeedbackForItem]
  );

  const handlePositiveAction = useCallback(
    (item: CareerHistoryOpportunity) => {
      if (shouldCollectPositiveReason(item)) {
        requestPositiveFeedback(item);
        return;
      }

      rememberFeedbackAdvanceTarget(item);
      updateFeedbackForItem(item, "positive", {
        savedStage: getDefaultSavedStage(item.opportunityType),
      });
    },
    [
      rememberFeedbackAdvanceTarget,
      requestPositiveFeedback,
      updateFeedbackForItem,
    ]
  );

  const handleModalPositiveAction = useCallback(
    (item: CareerHistoryOpportunity) => {
      if (shouldCollectPositiveReason(item)) {
        setModalOpportunityId(null);
        clearHistoryRoleId();
      }
      handlePositiveAction(item);
    },
    [clearHistoryRoleId, handlePositiveAction]
  );

  const handleNegativeAction = useCallback(
    (item: CareerHistoryOpportunity) => {
      requestNegativeFeedback(item);
    },
    [requestNegativeFeedback]
  );

  const handleModalNegativeAction = useCallback(
    (item: CareerHistoryOpportunity) => {
      setModalOpportunityId(null);
      clearHistoryRoleId();
      handleNegativeAction(item);
    },
    [clearHistoryRoleId, handleNegativeAction]
  );

  const handleQuestionAction = useCallback(
    (item: CareerHistoryOpportunity) => {
      requestQuestionPrompt(item);
    },
    [requestQuestionPrompt]
  );

  const handleModalQuestionAction = useCallback(
    (item: CareerHistoryOpportunity) => {
      setModalOpportunityId(null);
      clearHistoryRoleId();
      handleQuestionAction(item);
    },
    [clearHistoryRoleId, handleQuestionAction]
  );

  const handleSubmitPositivePrompt = useCallback(() => {
    if (!positivePromptOpportunity) return;

    const feedbackReason = positivePromptDraft.trim();

    rememberFeedbackAdvanceTarget(positivePromptOpportunity);
    updateFeedbackForItem(positivePromptOpportunity, "positive", {
      feedbackReason: feedbackReason || null,
      savedStage: getDefaultSavedStage(
        positivePromptOpportunity.opportunityType
      ),
    });
    setPositivePromptOpportunityId(null);
    setPositivePromptDraft("");
  }, [
    positivePromptDraft,
    positivePromptOpportunity,
    rememberFeedbackAdvanceTarget,
    updateFeedbackForItem,
  ]);

  const handleSubmitNegativePrompt = useCallback(() => {
    if (!negativePromptOpportunity) return;

    const feedbackReason = serializeNegativeFeedbackReason({
      customReason: negativePromptCustomReason,
      item: negativePromptOpportunity,
      selectedOptions: negativePromptSelectedOptions,
    });

    rememberFeedbackAdvanceTarget(negativePromptOpportunity);
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
    rememberFeedbackAdvanceTarget,
    updateFeedbackForItem,
  ]);

  const handleSubmitQuestionPrompt = useCallback(async () => {
    if (!questionPromptOpportunity || !questionPromptDraft.trim()) return;

    const didSend = await onSendHistoryOpportunityQuestion(
      questionPromptOpportunity.id,
      questionPromptDraft.trim()
    );

    if (!didSend) return;

    showToast({
      message: "질문을 등록했습니다. 답변이 오면 메일로 알려드리겠습니다.",
      variant: "white",
    });
    setQuestionPromptOpportunityId(null);
    setQuestionPromptDraft("");
  }, [
    onSendHistoryOpportunityQuestion,
    questionPromptDraft,
    questionPromptOpportunity,
  ]);

  useEffect(() => {
    if (
      activeTab !== "new" ||
      !activeOpportunity ||
      infoOpportunityType ||
      positivePromptOpportunity ||
      negativePromptOpportunity ||
      questionPromptOpportunity
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

      if (key === "a" || key === "ㅁ") {
        event.preventDefault();
        handleQuestionAction(activeOpportunity);
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
    handleQuestionAction,
    moveActiveOpportunity,
    negativePromptOpportunity,
    positivePromptOpportunity,
    questionPromptOpportunity,
  ]);

  const tabs = useMemo(
    () =>
      HISTORY_DISPLAY_TABS.map(({ id, label }) => ({
        id,
        label,
        count: (() => {
          if (id === "new") return historyOpportunityCounts.new;
          if (id === "saved") {
            return historyOpportunityCounts.savedStages.saved;
          }
          if (id === "connected") {
            return (
              historyOpportunityCounts.savedStages.applied +
              historyOpportunityCounts.savedStages.connected +
              historyOpportunityCounts.savedStages.closed
            );
          }
          return historyOpportunityCounts.archived;
        })(),
      })),
    [
      historyOpportunityCounts.archived,
      historyOpportunityCounts.new,
      historyOpportunityCounts.savedStages.applied,
      historyOpportunityCounts.savedStages.closed,
      historyOpportunityCounts.savedStages.connected,
      historyOpportunityCounts.savedStages.saved,
    ]
  );
  const activeDisplayTab: HistoryDisplayTabId =
    activeTab === "saved"
      ? activeSavedTab === "saved"
        ? "saved"
        : "connected"
      : activeTab;

  const handleDisplayTabChange = useCallback(
    (nextTab: HistoryDisplayTabId) => {
      setModalOpportunityId(null);

      if (nextTab === "new") {
        updateHistoryLocation("new", activeSavedTab, {
          roleId: getOpportunityUrlRoleId(activeOpportunity),
        });
        return;
      }
      if (nextTab === "saved") {
        updateHistoryLocation("saved", "saved");
        return;
      }
      if (nextTab === "connected") {
        updateHistoryLocation("saved", "connected");
        return;
      }
      updateHistoryLocation("archived", activeSavedTab);
    },
    [activeOpportunity, activeSavedTab, updateHistoryLocation]
  );

  const openModalForItem = useCallback(
    (item: CareerHistoryOpportunity) => {
      const roleId = getOpportunityUrlRoleId(item);
      setModalOpportunityId(item.id);

      if (isSavedOpportunity(item)) {
        updateHistoryLocation("saved", getResolvedSavedStage(item), {
          mode: "replace",
          roleId,
        });
        return;
      }

      if (isArchivedOpportunity(item)) {
        updateHistoryLocation("archived", activeSavedTab, {
          mode: "replace",
          roleId,
        });
      }
    },
    [activeSavedTab, updateHistoryLocation]
  );

  const closeOpportunityModal = useCallback(() => {
    setModalOpportunityId(null);
    updateHistoryLocation(activeTab, activeSavedTab, {
      mode: "replace",
      roleId: null,
    });
  }, [activeSavedTab, activeTab, updateHistoryLocation]);

  const pendingOpportunityIds = useMemo(
    () => new Set(historyUpdatingOpportunityIds),
    [historyUpdatingOpportunityIds]
  );

  const listItems = activeTab === "saved" ? filteredSavedItems : archivedItems;
  const listTotal =
    activeTab === "saved"
      ? activeDisplayTab === "connected"
        ? historyOpportunityCounts.savedStages.applied +
          historyOpportunityCounts.savedStages.connected +
          historyOpportunityCounts.savedStages.closed
        : historyOpportunityCounts.savedStages.saved
      : activeTab === "archived"
        ? historyOpportunityCounts.archived
        : 0;
  const hasMoreListItems =
    (activeTab === "saved" || activeTab === "archived") &&
    listItems.length < listTotal;
  const activeListFilter = useMemo<CareerHistoryOpportunityPageFilter | null>(
    () => {
      if (activeTab === "archived") {
        return { historyTab: "archived" };
      }
      if (activeTab === "saved") {
        return {
          historyTab: "saved",
          savedStage: activeDisplayTab === "connected" ? "connected" : "saved",
        };
      }
      return null;
    },
    [activeDisplayTab, activeTab]
  );
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
    if (listItems.length > 0) return;
    loadMoreListItems();
  }, [activeTab, listItems.length, loadMoreListItems]);

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
        <div className="flex items-center gap-2 text-[15px] leading-6 text-beige900/55">
          <Loader2 className="h-4 w-4 animate-spin text-beige900" />
          저장된 정보를 불러오는 중입니다...
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

  return (
    <div className="flex min-h-full flex-col">
      <div className="my-4">
        <CareerInPageTabs
          items={tabs}
          activeId={activeDisplayTab}
          onChange={handleDisplayTabChange}
        />
      </div>

      <div className="relative flex flex-1 flex-col gap-6">
        <div
          className={careerCx("min-w-0 flex-1", showShortcutPanel && "pb-24")}
        >
          {historyUpdateError && (
            <div className="mb-4 rounded-[8px] border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
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
                onOpenLink={(url) => openHistoryLink(activeOpportunity.id, url)}
                onOpenOpportunityInfo={setInfoOpportunityType}
                onMovePrev={() => moveActiveOpportunity(-1)}
                onMoveNext={handleMoveNextOpportunity}
              />
            </>
          )}

          {activeTab === "new" && !activeOpportunity && (
            <CareerInlinePanel className="px-5 py-5">
              <div className="text-[14px] leading-6 text-beige900/50">
                새로 받은 기회를 모두 검토했습니다.
              </div>
            </CareerInlinePanel>
          )}

          {activeTab === "saved" && (
            <div className="space-y-4">
              {listItems.length > 0 && (
                <div className="space-y-3 overflow-y-auto pr-1">
                  {listItems.map((item) => (
                    <OpportunityListCard
                      key={item.id}
                      item={item}
                      pending={pendingOpportunityIds.has(item.id)}
                      showStatusSelect
                      onOpenOpportunityInfo={setInfoOpportunityType}
                      onOpenCompanyInfo={openHistoryCompanyInfo}
                      onStatusChange={(value) =>
                        handleStatusDropdownChange(item, value)
                      }
                      onOpenDetail={() => openModalForItem(item)}
                    />
                  ))}
                </div>
              )}

              {listItems.length === 0 && (
                <CareerInlinePanel className="px-5 py-5">
                  <div className="text-[14px] leading-6 text-beige900/50">
                    이 단계에 해당하는 기회가 아직 없습니다.
                  </div>
                </CareerInlinePanel>
              )}

              {hasMoreListItems && (
                <div
                  ref={loadMoreSentinelRef}
                  className="flex min-h-12 items-center justify-center text-[13px] text-beige900/45"
                >
                  {historyLoadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin text-beige900/55" />
                  ) : (
                    "더 불러올 항목이 있습니다."
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "archived" && listItems.length > 0 && (
            <div className="space-y-3 overflow-y-auto pr-1">
              {listItems.map((item) => (
                <OpportunityListCard
                  key={item.id}
                  item={item}
                  pending={pendingOpportunityIds.has(item.id)}
                  showStatusSelect
                  onOpenOpportunityInfo={setInfoOpportunityType}
                  onOpenCompanyInfo={openHistoryCompanyInfo}
                  onStatusChange={(value) =>
                    handleStatusDropdownChange(item, value)
                  }
                  onOpenDetail={() => openModalForItem(item)}
                />
              ))}
            </div>
          )}

          {activeTab === "archived" && listItems.length === 0 && (
            <div className="space-y-3">
              <CareerInlinePanel className="px-5 py-5">
                <div className="text-[14px] leading-6 text-beige900/50">
                  이 탭에 해당하는 기회가 아직 없습니다.
                </div>
              </CareerInlinePanel>
            </div>
          )}

          {activeTab === "archived" && hasMoreListItems && (
            <div
              ref={loadMoreSentinelRef}
              className="flex min-h-12 items-center justify-center text-[13px] text-beige900/45"
            >
              {historyLoadingMore ? (
                <Loader2 className="h-4 w-4 animate-spin text-beige900/55" />
              ) : (
                "더 불러올 항목이 있습니다."
              )}
            </div>
          )}
        </div>
        {showShortcutPanel && activeOpportunity && (
          <div className="sticky -bottom-8 z-20 -mx-4 bg-beige50 px-4 pb-3 pt-2 border-t border-beige900/10">
            <HistoryShortcutPanel
              item={activeOpportunity}
              pending={pendingOpportunityIds.has(activeOpportunity.id)}
              onPositive={() => handlePositiveAction(activeOpportunity)}
              onNegative={() => handleNegativeAction(activeOpportunity)}
              onQuestion={() => handleQuestionAction(activeOpportunity)}
              activeIndex={activeIndex}
              canMoveNext={canMoveNextOpportunity}
              nextPending={nextOpportunityPending}
              onNext={handleMoveNextOpportunity}
              onPrev={() => moveActiveOpportunity(-1)}
            />
          </div>
        )}
      </div>

      <OpportunityDetailModal
        open={Boolean(modalOpportunity && activeTab !== "new")}
        item={modalOpportunity}
        pending={
          modalOpportunity
            ? pendingOpportunityIds.has(modalOpportunity.id)
            : false
        }
        onClose={closeOpportunityModal}
        onOpenCompanyInfo={openHistoryCompanyInfo}
        onOpenLink={(url) => {
          if (!modalOpportunity) return;
          openHistoryLink(modalOpportunity.id, url);
        }}
        onOpenOpportunityInfo={setInfoOpportunityType}
        onPositive={() => {
          if (!modalOpportunity) return;
          handleModalPositiveAction(modalOpportunity);
        }}
        onNegative={() => {
          if (!modalOpportunity) return;
          handleModalNegativeAction(modalOpportunity);
        }}
        onQuestion={() => {
          if (!modalOpportunity) return;
          handleModalQuestionAction(modalOpportunity);
        }}
        onRestore={
          modalOpportunity?.feedback === "positive"
            ? () => handleRestoreAction(modalOpportunity)
            : undefined
        }
      />

      <HistoryOpportunityInfoModal
        opportunityType={infoOpportunityType}
        onClose={() => setInfoOpportunityType(null)}
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

      <HistoryQuestionModal
        item={questionPromptOpportunity}
        draft={questionPromptDraft}
        pending={
          questionPromptOpportunity
            ? pendingOpportunityIds.has(questionPromptOpportunity.id)
            : false
        }
        onChangeDraft={setQuestionPromptDraft}
        onClose={() => {
          setQuestionPromptOpportunityId(null);
          setQuestionPromptDraft("");
        }}
        onSubmit={handleSubmitQuestionPrompt}
      />
    </div>
  );
};

export default React.memo(CareerHistoryPanel);
