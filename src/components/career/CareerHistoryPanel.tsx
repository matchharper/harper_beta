import { ChevronRight, Loader2 } from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
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
import BeigeButton from "../ui/career/BeigeButton";
import CandidateCarousel from "../chat/LoadingComponent";

type HistoryTabId = "new" | "saved" | "archived";
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

const HISTORY_TABS: Array<{
  id: HistoryTabId;
  label: string;
  title: string;
  description: string[];
}> = [
  {
    id: "new",
    label: "새롭게 제안된 기회",
    title: "새롭게 제안된 기회",
    description: ["아직 평가하지 않은 기회들입니다."],
  },
  {
    id: "saved",
    label: "저장함",
    title: "저장함",
    description: ["제안된 기회를 저장하고, 단계별로 관리합니다."],
  },
  {
    id: "archived",
    label: "보관됨",
    title: "보관됨",
    description: [
      "거절 혹은 보류한 기회들입니다.",
      "리스트에서 다시 상세 내용을 확인하거나 복구할 수 있습니다.",
    ],
  },
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
  { id: "applied", label: "관심 표시함(지원함)" },
  { id: "connected", label: "연결됨" },
  { id: "closed", label: "종료됨" },
];

const formatEmploymentType = (value: string) => {
  if (value === "full_time") return "Full-time";
  if (value === "part_time") return "Part-time";
  if (value === "internship") return "Internship";
  if (value === "contract") return "Contract";
  if (value === "fractional") return "Fractional";
  return value.replaceAll("_", " ");
};

const formatWorkMode = (value: string | null) => {
  if (value === "remote") return "Remote";
  if (value === "hybrid") return "Hybrid";
  if (value === "onsite") return "On-site";
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

const HistorySavedStageTabs = ({
  activeStage,
  counts,
  onChange,
}: {
  activeStage: SavedTabId;
  counts: Record<SavedTabId, number>;
  onChange: (stage: SavedTabId) => void;
}) => (
  <div className="flex flex-wrap items-center gap-2">
    {SAVED_TABS.map((tab, index) => (
      <Fragment key={tab.id}>
        <button
          type="button"
          onClick={() => onChange(tab.id)}
          className={careerCx(
            "rounded-full border px-3 py-1.5 text-sm transition-colors",
            activeStage === tab.id
              ? "border-beige900 bg-beige900 text-beige100"
              : "border-beige900/15 bg-white/55 text-beige900/65 hover:border-beige900/30 hover:text-beige900"
          )}
        >
          <span className="flex items-center gap-2">
            <span>{tab.label}</span>
            <span
              className={careerCx(
                "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none",
                activeStage === tab.id
                  ? "bg-beige100 text-beige900"
                  : "bg-beige900/8 text-beige900/55"
              )}
            >
              {counts[tab.id]}
            </span>
          </span>
        </button>
        {index < SAVED_TABS.length - 1 && (
          <ChevronRight className="h-4 w-4 text-beige900/35" />
        )}
      </Fragment>
    ))}
  </div>
);

const CareerHistoryPanel = () => {
  const router = useRouter();
  const {
    stage,
    userChatCount,
    historyOpportunities,
    historyLoading,
    historyUpdatingOpportunityIds,
    historyUpdateError,
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
  const {
    archivedItems,
    newItems,
    savedItems,
    savedItemsByStage,
    savedStageCounts,
  } = useMemo(() => {
    const nextNewItems: CareerHistoryOpportunity[] = [];
    const nextSavedItems: CareerHistoryOpportunity[] = [];
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
    const nextSavedStageCounts: Record<SavedTabId, number> = {
      saved: 0,
      applied: 0,
      connected: 0,
      closed: 0,
    };

    for (const item of sortedOpportunities) {
      if (isNewOpportunity(item)) {
        nextNewItems.push(item);
        continue;
      }

      if (isSavedOpportunity(item)) {
        const stage = getResolvedSavedStage(item);
        nextSavedItems.push(item);
        nextSavedItemsByStage[stage].push(item);
        nextSavedStageCounts[stage] += 1;
        continue;
      }

      if (isArchivedOpportunity(item)) {
        nextArchivedItems.push(item);
      }
    }

    nextNewItems.sort(
      (left, right) =>
        getCareerOpportunitySortPriority(left.opportunityType) -
          getCareerOpportunitySortPriority(right.opportunityType) ||
        compareRecommendedAtDesc(left, right)
    );

    return {
      archivedItems: nextArchivedItems,
      newItems: nextNewItems,
      savedItems: nextSavedItems,
      savedItemsByStage: nextSavedItemsByStage,
      savedStageCounts: nextSavedStageCounts,
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
    if (newItems.length === 0) {
      setActiveOpportunityId(null);
      return;
    }

    if (!activeOpportunityId || !newItemIndexById.has(activeOpportunityId)) {
      setActiveOpportunityId(newItems[0]?.id ?? null);
    }
  }, [activeOpportunityId, newItemIndexById, newItems]);

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
      setActiveTab("new");
      updateFeedbackForItem(item, null);
    },
    [updateFeedbackForItem]
  );

  const handlePositiveAction = useCallback(
    (item: CareerHistoryOpportunity) => {
      if (shouldCollectPositiveReason(item)) {
        requestPositiveFeedback(item);
        return;
      }

      updateFeedbackForItem(item, "positive", {
        savedStage: getDefaultSavedStage(item.opportunityType),
      });
    },
    [requestPositiveFeedback, updateFeedbackForItem]
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

    updateFeedbackForItem(positivePromptOpportunity, "positive", {
      feedbackReason: feedbackReason || null,
      savedStage: getDefaultSavedStage(
        positivePromptOpportunity.opportunityType
      ),
    });
    setPositivePromptOpportunityId(null);
    setPositivePromptDraft("");
  }, [positivePromptDraft, positivePromptOpportunity, updateFeedbackForItem]);

  const handleSubmitNegativePrompt = useCallback(() => {
    if (!negativePromptOpportunity) return;

    const feedbackReason = serializeNegativeFeedbackReason({
      customReason: negativePromptCustomReason,
      item: negativePromptOpportunity,
      selectedOptions: negativePromptSelectedOptions,
    });

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
        moveActiveOpportunity(1);
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
      HISTORY_TABS.map(({ id, label }) => ({
        id,
        label,
        count:
          id === "new"
            ? newItems.length
            : id === "saved"
              ? savedItems.length
              : archivedItems.length,
      })),
    [archivedItems.length, newItems.length, savedItems.length]
  );
  const activeSection =
    HISTORY_TABS.find((section) => section.id === activeTab) ?? HISTORY_TABS[0];
  const pendingOpportunityIds = useMemo(
    () => new Set(historyUpdatingOpportunityIds),
    [historyUpdatingOpportunityIds]
  );

  const listItems = activeTab === "saved" ? filteredSavedItems : archivedItems;
  const isConversationCompleted =
    stage === "completed" || userChatCount >= TALENT_INTERVIEW_FINAL_STEP;
  const emptyStateCopy = isConversationCompleted
    ? {
        body: (
          <>
            <div className="leading-7 text-beige900/80">
              대화해주셔서 감사합니다.
              <br />
              지금 내용을 바탕으로 맞는 팀과 포지션을 확인하고 있습니다.
              <br />
              연결이 진행되면 메일로 바로 안내드릴게요.
            </div>
          </>
        ),
        ctaLabel: null,
        heading: "Mathing in Progress...",
      }
    : {
        body: (
          <>
            <div className="leading-7 text-beige900/80">
              아직 맞는 기회를 추리는 중입니다.
              <br />
              몇 가지만 더 이야기해주시면 더 잘 맞는 포지션을
              <br />더 빠르게 찾을 수 있어요.
            </div>
            <div className="mt-6">
              대화를 이어주시면 내용을 바탕으로 순서대로 정리해 보여드릴게요.
            </div>
          </>
        ),
        ctaLabel: "대화 이어가기",
        heading: "Mathing in Progress...",
      };

  const OuterBox = ({ children }: { children: ReactNode }) => {
    return (
      <div>
        <div className="w-[280px] flex flex-col gap-2 pr-8 mt-2 mb-8">
          <h3 className="text-[28px] text-black font-normal font-hedvig leading-5">
            Opportunities
          </h3>
        </div>
        {children}
      </div>
    );
  };

  if (historyLoading) {
    return (
      <OuterBox>
        <section className="px-5 py-6">
          <div className="flex items-center gap-2 text-[15px] leading-6 text-beige900/55">
            <Loader2 className="h-4 w-4 animate-spin text-beige900" />
            저장된 정보를 불러오는 중입니다...
          </div>
        </section>
      </OuterBox>
    );
  }

  if (sortedOpportunities.length === 0) {
    return (
      <OuterBox>
        <section className="text-[15px] py-6 flex flex-row items-start justify-between">
          <div>
            {emptyStateCopy.body}
            <div className="mt-6 flex flex-col items-start justify-start gap-8">
              {emptyStateCopy.ctaLabel ? (
                <>
                  <div>원하는 방향이 있다면 지금 이어서 알려주세요.</div>
                  <BeigeButton
                    label={emptyStateCopy.ctaLabel}
                    size="md"
                    className="text-beige50"
                    variant="primary"
                    onClick={() => {
                      router.push("/career/chat");
                    }}
                  />
                </>
              ) : null}
            </div>
          </div>
          <div>
            <div className="text-beige900 text-2xl font-semibold font-hedvig">
              {emptyStateCopy.heading}
            </div>
          </div>
        </section>
      </OuterBox>
    );
  }

  return (
    <>
      <div className="mt-8 backdrop-blur">
        <CareerInPageTabs
          items={tabs}
          activeId={activeTab}
          onChange={(nextTab) => updateHistoryLocation(nextTab, activeSavedTab)}
        />
      </div>

      <div className="mt-6 flex flex-row gap-6 py-6">
        <div className="w-[264px] shrink-0 pr-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-medium leading-5">
              {activeSection.title}
            </h3>
            {activeSection.description.map((item, index) => (
              <p key={index} className="mt-1 text-sm font-normal text-black/70">
                {item}
              </p>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {activeTab === "new" && activeOpportunity && (
              <HistoryShortcutPanel
                item={activeOpportunity}
                pending={pendingOpportunityIds.has(activeOpportunity.id)}
                onPositive={() => handlePositiveAction(activeOpportunity)}
                onNegative={() => handleNegativeAction(activeOpportunity)}
                onQuestion={() => handleQuestionAction(activeOpportunity)}
                activeIndex={activeIndex}
                totalCount={newItems.length}
                onNext={() => moveActiveOpportunity(1)}
                onPrev={() => moveActiveOpportunity(-1)}
              />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {historyUpdateError && (
            <div className="mb-4 rounded-[8px] border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
              {historyUpdateError}
            </div>
          )}

          {activeTab === "new" && activeOpportunity && (
            <HistoryOpportunityDetailContent
              item={activeOpportunity}
              canMovePrev={activeIndex > 0}
              canMoveNext={activeIndex < newItems.length - 1}
              onOpenLink={(url) => openHistoryLink(activeOpportunity.id, url)}
              onOpenOpportunityInfo={setInfoOpportunityType}
              onMovePrev={() => moveActiveOpportunity(-1)}
              onMoveNext={() => moveActiveOpportunity(1)}
            />
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
              <HistorySavedStageTabs
                activeStage={activeSavedTab}
                counts={savedStageCounts}
                onChange={(nextStage) =>
                  updateHistoryLocation("saved", nextStage)
                }
              />

              {listItems.length > 0 && (
                <div className="max-h-[calc(100vh-300px)] space-y-3 overflow-y-auto pr-1">
                  {listItems.map((item) => (
                    <OpportunityListCard
                      key={item.id}
                      item={item}
                      pending={pendingOpportunityIds.has(item.id)}
                      showSavedStageSelect
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
            <div className="max-h-[calc(100vh-260px)] space-y-3 overflow-y-auto pr-1">
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
            <CareerInlinePanel className="px-5 py-5">
              <div className="text-[14px] leading-6 text-beige900/50">
                이 탭에 해당하는 기회가 아직 없습니다.
              </div>
            </CareerInlinePanel>
          )}
        </div>
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
    </>
  );
};

export default CareerHistoryPanel;
