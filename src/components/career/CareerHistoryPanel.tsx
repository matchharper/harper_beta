import {
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  MessageSquareText,
  Search,
  Sparkles,
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
import { showToast } from "@/components/toast/toast";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerInPageTabs from "./CareerInPageTabs";
import {
  CareerInlinePanel,
  CareerSecondaryButton,
  careerCx,
} from "./ui/CareerPrimitives";
import {
  CareerOpportunityType,
  type CareerHistoryOpportunity,
  type CareerHistoryOpportunityFeedback,
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
import OpportunityListCard from "./history/OpportunityListCard";
import HistoryOpportunityDetailContent from "./history/HistoryOpportunityDetailContent";
import HistoryOpportunityInfoModal from "./history/HistoryOppotunityInfoModal";
import OpportunityDetailModal from "./history/OpportunityDetailModal";
import HistoryShortcutPanel from "./history/HistoryShortcutPanel";
import { BeigeButton } from "@/components/ui/beige/button";
import React from "react";

type HistoryTabId = "new" | "saved" | "archived";
type HistoryDisplayTabId = "new" | "tracking" | "applied" | "archived";
type SavedTabId = CareerOpportunitySavedStage;

const HISTORY_TAB_QUERY_KEY = "historyTab";
const HISTORY_SAVED_STAGE_QUERY_KEY = "savedStage";

const isHistoryTabId = (value: unknown): value is HistoryTabId =>
  value === "new" || value === "saved" || value === "archived";

const isSavedTabId = (value: unknown): value is SavedTabId =>
  value === "saved" ||
  value === "applied" ||
  value === "connected" ||
  value === "closed";

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const HISTORY_DISPLAY_TABS: Array<{
  id: HistoryDisplayTabId;
  label: string;
}> = [
  { id: "new", label: "새 포지션" },
  { id: "tracking", label: "추적 중" },
  { id: "applied", label: "지원함" },
  { id: "archived", label: "보관함" },
];

const compareRecommendedAtDesc = (
  left: CareerHistoryOpportunity,
  right: CareerHistoryOpportunity
) => Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt);

export const SAVED_TABS: Array<{
  id: SavedTabId;
  label: string;
}> = [
  { id: "saved", label: "저장됨" },
  { id: "applied", label: "연결 수락함 / 지원함" },
  { id: "connected", label: "연결됨" },
  { id: "closed", label: "종료됨" },
];

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
  return "저장됨";
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

const clampPercent = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

const HistoryEmptyStateDetail = ({
  body,
  icon,
  title,
}: {
  body: string;
  icon: ReactNode;
  title: string;
}) => (
  <div className="flex items-start gap-3">
    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-beige500 text-beige900/70">
      {icon}
    </span>
    <div>
      <div className="text-[13px] font-medium leading-5 text-beige900">
        {title}
      </div>
      <div className="mt-1 text-[12px] leading-5 text-beige900/50">{body}</div>
    </div>
  </div>
);

const HistoryEmptyStatePanel = ({
  answeredCount,
  onOpenChat,
  progressPercent,
  targetQuestions,
  variant,
}: {
  answeredCount: number;
  onOpenChat: () => void;
  progressPercent: number;
  targetQuestions: number;
  variant: HistoryEmptyStateVariant;
}) => {
  const normalizedProgress = clampPercent(progressPercent);
  const answeredLabel = Math.max(0, Math.min(answeredCount, targetQuestions));

  const config =
    variant === "searching"
      ? {
          actionLabel: null,
          details: [
            {
              body: "대화, 프로필, 링크에서 역할 선호와 강한 신호를 추려요.",
              icon: <Sparkles className="h-3.5 w-3.5" />,
              title: "후보자 신호 정리",
            },
            {
              body: "Harper 네트워크와 외부 포지션을 함께 비교하고 있어요.",
              icon: <Search className="h-3.5 w-3.5" />,
              title: "기회 스캔",
            },
            {
              body: "적합도가 높은 순서로 새 포지션 탭에 보여드릴게요.",
              icon: <Target className="h-3.5 w-3.5" />,
              title: "추천 정렬",
            },
          ],
          eyebrow: "추천 탐색 중",
          icon: <Loader2 className="h-5 w-5 animate-spin" />,
          sideTitle: "지금 진행 중인 일",
          title: "Harper가 맞는 기회를 찾고 있습니다.",
          toneClassName: "bg-beige900 text-beige50",
          body: (
            <>
              추천을 만들기 위해 프로필과 대화 내용을 기준으로 기회를 비교하고
              있습니다. 완료되면 이 화면의{" "}
              <span className="font-medium">새 포지션</span>에 바로 표시됩니다.
            </>
          ),
        }
      : variant === "onboarding"
        ? {
            actionLabel: "대화 이어가기",
            details: [
              {
                body: "역할, 팀 규모, 근무 방식 같은 핵심 조건을 더 확인합니다.",
                icon: <MessageSquareText className="h-3.5 w-3.5" />,
                title: "몇 가지 답변 필요",
              },
              {
                body: "응답이 충분해지면 Harper가 자동으로 추천 탐색을 시작해요.",
                icon: <Sparkles className="h-3.5 w-3.5" />,
                title: "추천 준비",
              },
              {
                body: "완료 후에는 새 포지션, 추적 중, 지원함 상태로 관리됩니다.",
                icon: <CheckCircle2 className="h-3.5 w-3.5" />,
                title: "히스토리 생성",
              },
            ],
            eyebrow: "온보딩 미완료",
            icon: <MessageSquareText className="h-5 w-5" />,
            sideTitle: "추천 전에 필요한 것",
            title: "아직 추천 후보를 정리하지 않았습니다.",
            toneClassName: "bg-beige700/10 text-beige700",
            body: (
              <>
                Harper가 좋은 기회를 고르려면 선호와 현재 상황을 조금 더 알아야
                합니다. 대화를 이어가면 추천 가능한 신호가 충분해지는 시점에
                포지션을 정리합니다.
              </>
            ),
          }
        : {
            actionLabel: null,
            details: [
              {
                body: "대화 내용은 충분히 모였고, 추천 후보를 좁히는 중입니다.",
                icon: <CheckCircle2 className="h-3.5 w-3.5" />,
                title: "온보딩 완료",
              },
              {
                body: "조건에 맞지 않는 포지션은 보여드리지 않도록 걸러냅니다.",
                icon: <Target className="h-3.5 w-3.5" />,
                title: "적합도 검토",
              },
              {
                body: "새 추천이 생기면 이 화면과 메일로 확인할 수 있습니다.",
                icon: <Sparkles className="h-3.5 w-3.5" />,
                title: "결과 대기",
              },
            ],
            eyebrow: "추천 준비 중",
            icon: <Search className="h-5 w-5" />,
            sideTitle: "다음 단계",
            title: "기회를 찾고 있습니다.",
            toneClassName: "bg-beige700/10 text-beige700",
            body: (
              <>
                대화해주셔서 감사합니다. 지금 내용을 바탕으로 맞는 팀과 포지션을
                확인하고 있습니다. 연결 가능한 기회가 준비되면 바로
                안내드릴게요.
              </>
            ),
          };

  return (
    <section className="overflow-hidden rounded-[8px] border border-beige900/10 bg-white shadow-[0_16px_48px_rgba(46,23,6,0.08)]">
      <div className="grid gap-8 px-6 py-7 lg:grid-cols-[minmax(0,1fr)_240px] lg:px-8 lg:py-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={careerCx(
                "inline-flex h-11 w-11 items-center justify-center rounded-[8px]",
                config.toneClassName
              )}
            >
              {config.icon}
            </span>
            <span className="inline-flex h-8 items-center rounded-full border border-beige900/10 bg-beige50 px-3 text-[12px] font-medium text-beige900/55">
              {config.eyebrow}
            </span>
          </div>

          <h4 className="mt-6 max-w-[640px] font-hedvig text-[20px] font-medium leading-none text-beige900 sm:text-[24px]">
            {config.title}
          </h4>
          <p className="mt-4 max-w-[640px] text-sm leading-7 text-beige900/65">
            {config.body}
          </p>

          {variant === "searching" && (
            <div className="mt-7 flex max-w-[520px] items-center gap-3 border-y border-beige900/10 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-beige50 text-beige900">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="text-[13px] leading-6 text-beige900/60">
                탐색이 끝나면 새 포지션 탭이 자동으로 채워집니다. 화면을 떠나도
                백그라운드에서 계속 진행됩니다.
              </div>
            </div>
          )}

          {config.actionLabel && (
            <div className="mt-7">
              <BeigeButton
                label={config.actionLabel}
                icon={<MessageSquareText className="h-4 w-4" />}
                size="md"
                variant="primary"
                onClick={onOpenChat}
              />
            </div>
          )}
        </div>

        <div className="border-t border-beige900/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-1">
          <div className="text-[11px] font-medium text-beige900/35">
            {config.sideTitle}
          </div>
          <div className="mt-5 space-y-5">
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
      </div>
    </section>
  );
};

const CareerHistoryPanel = () => {
  const router = useRouter();
  const {
    stage,
    answeredCount,
    progressPercent,
    opportunityRun,
    opportunityRunTriggerPending,
    historyOpportunityCounts,
    historyOpportunities,
    historyLoading,
    historyLoadingMore,
    hasMoreHistoryOpportunities,
    historyUpdatingOpportunityIds,
    historyUpdateError,
    onLoadMoreHistoryOpportunities,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
    onUpdateHistoryOpportunityFeedback,
    onUpdateHistoryOpportunitySavedStage,
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
  const autoAdvanceRequestedRef = useRef(false);
  const wasHistoryLoadingMoreRef = useRef(false);
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

  const openChatTab = useCallback(() => {
    const query: Record<string, string> = {};
    const invite = getQueryValue(router.query.invite);
    const mail = getQueryValue(router.query.mail);
    if (invite) query.invite = invite;
    if (mail) query.mail = mail;

    void router.push({
      pathname: "/career/chat",
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  }, [router]);

  const updateHistoryLocation = useCallback(
    (nextTab: HistoryTabId, nextSavedStage: SavedTabId) => {
      setActiveTab(nextTab);
      setActiveSavedTab(nextSavedStage);

      if (!router.isReady) return;

      const normalizedHistoryTab = getQueryValue(currentHistoryTabQuery);
      const normalizedSavedStage = getQueryValue(currentSavedStageQuery);

      if (
        normalizedHistoryTab === nextTab &&
        normalizedSavedStage === nextSavedStage
      ) {
        return;
      }

      void router.push(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            [HISTORY_TAB_QUERY_KEY]: nextTab,
            [HISTORY_SAVED_STAGE_QUERY_KEY]: nextSavedStage,
          },
        },
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [currentHistoryTabQuery, currentSavedStageQuery, router]
  );

  const sortedOpportunities = useMemo(
    () => [...historyOpportunities].sort(compareRecommendedAtDesc),
    [historyOpportunities]
  );
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
  const filteredSavedItems = savedItemsByStage[activeSavedTab];
  const opportunityById = useMemo(
    () => new Map(sortedOpportunities.map((item) => [item.id, item])),
    [sortedOpportunities]
  );
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

  useEffect(() => {
    setModalOpportunityId(null);
  }, [activeTab]);

  const activeIndex = activeOpportunityId
    ? (newItemIndexById.get(activeOpportunityId) ?? -1)
    : -1;

  const activeOpportunity = activeIndex >= 0 ? newItems[activeIndex] : null;
  const canMoveNextOpportunity =
    activeIndex >= 0 &&
    (activeIndex < newItems.length - 1 || hasMoreHistoryOpportunities);
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
        setActiveOpportunityId(nextOpportunityId);
      }
    },
    [activeIndex, newItems]
  );

  const loadNextOpportunityPage = useCallback(() => {
    if (
      !hasMoreHistoryOpportunities ||
      historyLoadingMore ||
      autoAdvanceRequestedRef.current
    ) {
      return;
    }
    autoAdvanceRequestedRef.current = true;
    setAutoAdvanceTargetIndex(newItems.length);
    void onLoadMoreHistoryOpportunities();
  }, [
    hasMoreHistoryOpportunities,
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

      if (hasMoreHistoryOpportunities) {
        setAutoAdvanceTargetIndex(feedbackAdvanceTargetIndex);
        return;
      }

      setActiveOpportunityId(newItems[newItems.length - 1]?.id ?? null);
      return;
    }

    setActiveOpportunityId(newItems[0]?.id ?? null);
  }, [
    activeOpportunityId,
    hasMoreHistoryOpportunities,
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

    if (hasMoreHistoryOpportunities) {
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
    hasMoreHistoryOpportunities,
    historyLoadingMore,
    loadNextOpportunityPage,
    newItems,
  ]);

  useEffect(() => {
    feedbackAdvanceTargetIndexRef.current = null;
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
      updateHistoryLocation("new", activeSavedTab);
      updateFeedbackForItem(item, null);
    },
    [activeSavedTab, updateFeedbackForItem, updateHistoryLocation]
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
      }
      handlePositiveAction(item);
    },
    [handlePositiveAction]
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
      handleNegativeAction(item);
    },
    [handleNegativeAction]
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
      handleQuestionAction(item);
    },
    [handleQuestionAction]
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
          if (id === "tracking") {
            return historyOpportunityCounts.savedStages.saved;
          }
          if (id === "applied") {
            return historyOpportunityCounts.savedStages.applied;
          }
          return historyOpportunityCounts.archived;
        })(),
      })),
    [
      historyOpportunityCounts.archived,
      historyOpportunityCounts.new,
      historyOpportunityCounts.savedStages.applied,
      historyOpportunityCounts.savedStages.saved,
    ]
  );
  const activeDisplayTab: HistoryDisplayTabId =
    activeTab === "saved"
      ? activeSavedTab === "applied"
        ? "applied"
        : "tracking"
      : activeTab;

  const handleDisplayTabChange = useCallback(
    (nextTab: HistoryDisplayTabId) => {
      if (nextTab === "new") {
        updateHistoryLocation("new", activeSavedTab);
        return;
      }
      if (nextTab === "tracking") {
        updateHistoryLocation("saved", "saved");
        return;
      }
      if (nextTab === "applied") {
        updateHistoryLocation("saved", "applied");
        return;
      }
      updateHistoryLocation("archived", activeSavedTab);
    },
    [activeSavedTab, updateHistoryLocation]
  );
  const pendingOpportunityIds = useMemo(
    () => new Set(historyUpdatingOpportunityIds),
    [historyUpdatingOpportunityIds]
  );

  const listItems = activeTab === "saved" ? filteredSavedItems : archivedItems;
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

  if (sortedOpportunities.length === 0) {
    return (
      <HistoryEmptyStatePanel
        answeredCount={answeredCount}
        onOpenChat={openChatTab}
        progressPercent={progressPercent}
        targetQuestions={TALENT_INTERVIEW_FINAL_STEP}
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
                      showSavedStageSelect
                      action={
                        <CareerSecondaryButton
                          onClick={() => handleRestoreAction(item)}
                          disabled={pendingOpportunityIds.has(item.id)}
                          className="h-9 gap-2 px-3"
                        >
                          {pendingOpportunityIds.has(item.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArchiveRestore className="h-4 w-4" />
                          )}
                          새 기회로 되돌리기
                        </CareerSecondaryButton>
                      }
                      onOpenOpportunityInfo={setInfoOpportunityType}
                      onSavedStageChange={(stage) => {
                        void onUpdateHistoryOpportunitySavedStage(
                          item.id,
                          stage
                        );
                      }}
                      onOpenDetail={() => setModalOpportunityId(item.id)}
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
            </div>
          )}

          {activeTab === "archived" && listItems.length > 0 && (
            <div className="space-y-3 overflow-y-auto pr-1">
              {listItems.map((item) => (
                <OpportunityListCard
                  key={item.id}
                  item={item}
                  pending={pendingOpportunityIds.has(item.id)}
                  action={
                    <CareerSecondaryButton
                      onClick={() => handleRestoreAction(item)}
                      disabled={pendingOpportunityIds.has(item.id)}
                      className="h-9 gap-2 px-3"
                    >
                      {pendingOpportunityIds.has(item.id) && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      복구하기
                    </CareerSecondaryButton>
                  }
                  onOpenOpportunityInfo={setInfoOpportunityType}
                  onOpenDetail={() => setModalOpportunityId(item.id)}
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
        onClose={() => setModalOpportunityId(null)}
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
