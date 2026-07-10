import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/router";
import type {
  CareerInterviewProgress,
  CareerInternalOpportunityCallRequest,
  CareerMessagePayload,
  CareerOnboardingChecklistProgress,
  CareerOpportunityFeedbackFollowUpTrigger,
  CareerOpportunityRun,
  CareerRecommendationSearchStatus,
  CareerRecentOpportunity,
  SessionResponse,
} from "@/components/career/types";
import {
  CareerChatPanelProvider,
  type CareerChatPanelContextValue,
} from "./CareerChatPanelContext";
import {
  CareerSidebarProvider,
  type CareerCompanyFollowActionResult,
  type CareerSidebarContextValue,
} from "./CareerSidebarContext";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { useCareerChat } from "@/hooks/career/useCareerChat";
import { useCareerMessageHistory } from "@/hooks/career/useCareerMessageHistory";
import { useCareerOnboardingVoice } from "@/hooks/career/useCareerOnboardingVoice";
import { useCareerProfile } from "@/hooks/career/useCareerProfile";
import { useCareerTalentInsights } from "@/hooks/career/useCareerTalentInsights";
import { useCareerTalentPreferences } from "@/hooks/career/useCareerTalentPreferences";
import { useCareerTalentSettings } from "@/hooks/career/useCareerTalentSettings";
import { useCareerSession } from "@/hooks/career/useCareerSession";
import { getErrorMessage, toUiMessage } from "@/hooks/career/careerHelpers";
import { normalizeRecentOpportunities } from "@/hooks/career/careerSessionData";
import { useCareerHistoryState } from "@/hooks/career/useCareerHistoryState";
import { useCareerRuntimeActions } from "@/hooks/career/useCareerRuntimeActions";
import { showOpportunityDiscoveryStartedToast } from "@/hooks/career/opportunityDiscoveryToast";
import { INSIGHT_CHECKLIST } from "@/lib/talentOnboarding/insightChecklist";
import {
  TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST,
  type TalentUserChatMessageType,
} from "@/lib/talentOnboarding/onboarding";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import {
  getCareerConversationStarter,
  type CareerConversationStarterId,
  type CareerConversationStarterMode,
} from "@/lib/career/prompts/conversationStarters";
import { CAREER_CHAT_ALLOWED_TOOLS_BY_ACTION } from "@/lib/career/chatToolPresets";
import { useMessages } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import type { CareerWorkspaceTab } from "./CareerWorkspaceNav";

const getCompletedOpportunityRunRefreshKey = (
  run: CareerOpportunityRun | null
) => {
  if (!run || run.inputLocked) return null;
  if (run.status !== "completed" && run.status !== "partial") return null;
  return `${run.id}:${run.completedAt ?? run.status}`;
};

const CAREER_COMPANY_FOLLOW_UP_DELAY_MS = 15_000;
const getDevCurrentDataJobPostingRecommendationPrompt = (
  t: ReturnType<typeof useCareerT>
) =>
  t(
    "career.common.career_flow_provider.0cjev5a",
    "지금까지 저장된 내 프로필, 선호, 최근 피드백 데이터를 기준으로 지금 검토할 만한 공개 채용 공고를 추천해줘. 새로운 장기 선호는 저장하지 말고, 현재 데이터 기반으로 한 번만 찾아줘."
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizePendingInternalOpportunityCallRequests = (
  callRequests: CareerInternalOpportunityCallRequest[] | null | undefined
) => {
  const seen = new Set<string>();
  return (callRequests ?? []).filter((callRequest) => {
    if (!callRequest?.id || seen.has(callRequest.id)) return false;
    seen.add(callRequest.id);
    return true;
  });
};

const normalizeOnboardingChecklistProgress = (
  value: unknown
): CareerOnboardingChecklistProgress | null => {
  if (!isRecord(value)) return null;

  const totalCount = Math.max(0, Number(value.totalCount ?? 0) || 0);
  const coveredCount = Math.max(0, Number(value.coveredCount ?? 0) || 0);
  const percent =
    typeof value.percent === "number"
      ? Math.max(0, Math.min(100, Math.round(value.percent)))
      : totalCount > 0
        ? Math.min(100, Math.round((coveredCount / totalCount) * 100))
        : 0;

  return {
    additionalCoveredCount: Math.max(
      0,
      Number(value.additionalCoveredCount ?? 0) || 0
    ),
    completed: value.completed === true,
    coveredCount,
    finalConfirmationCovered: value.finalConfirmationCovered === true,
    minCoveredCount: Math.max(0, Number(value.minCoveredCount ?? 0) || 0),
    percent,
    requiredQuestionsCovered: value.requiredQuestionsCovered === true,
    totalCount,
  };
};

type SessionReengagementPayload = {
  assistantMessage?: CareerMessagePayload | null;
  assistantMessages?: CareerMessagePayload[];
  deletedMessage?: {
    id?: number | string | null;
    message_type?: string | null;
    role?: string | null;
  } | null;
  insightUpdatedAt?: unknown;
  opportunityRun?: CareerOpportunityRun | null;
  preferencesUpdatedAt?: unknown;
  skipped?: boolean;
  talentInsights?: unknown;
  talentPreferences?: unknown;
};

type CareerSseEvent = {
  data: unknown;
  event: string;
};

const parseCareerSseEvent = (rawEvent: string): CareerSseEvent | null => {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  const rawData = dataLines.join("\n").trim();
  if (!rawData) return { event, data: null };

  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: rawData };
  }
};

const toRecommendationSearchStatus = (
  value: unknown
): CareerRecommendationSearchStatus | null => {
  if (!isRecord(value)) return null;
  const state = value.state;
  if (
    state !== "running" &&
    state !== "completed" &&
    state !== "error" &&
    state !== "stopped"
  ) {
    return null;
  }

  return {
    candidateCount:
      typeof value.candidateCount === "number" ? value.candidateCount : null,
    recommendationCount:
      typeof value.recommendationCount === "number"
        ? value.recommendationCount
        : null,
    state,
  };
};

type OnboardingManualCompletionPayload = {
  assistantMessage?: CareerMessagePayload | null;
  assistantMessages?: CareerMessagePayload[];
  error?: string;
  insightUpdatedAt?: unknown;
  opportunityDiscoveryQueued?: boolean;
  opportunityRun?: CareerOpportunityRun | null;
  progress?: {
    completed?: boolean;
  };
  talentInsights?: unknown;
};

export const CareerFlowProvider = ({
  activeTab,
  children,
  emailOnboardingToken,
  initialChatDraft,
  initialChatDraftKey,
  inviteToken,
  mail,
  onOpenSettings,
  settingsDataEnabled,
}: {
  activeTab: CareerWorkspaceTab;
  children: React.ReactNode;
  emailOnboardingToken?: string | null;
  initialChatDraft?: string | null;
  initialChatDraftKey?: string | null;
  inviteToken?: string | null;
  mail?: string | null;
  onOpenSettings: () => void;
  settingsDataEnabled?: boolean;
}) => {
  const t = useCareerT();
  const router = useRouter();
  const { locale } = useMessages();
  const {
    user,
    authLoading,
    authPending,
    authError,
    authInfo,
    handleGoogleLogin,
    handleEmailAuth,
    handleLogout,
  } = useCareerAuth();

  const userId = user?.id ?? null;
  const { fetchWithAuth } = useCareerApi();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeCompanyRoleCount, setActiveCompanyRoleCount] = useState(0);
  const [recentOpportunities, setRecentOpportunities] = useState<
    CareerRecentOpportunity[]
  >([]);
  const [opportunityRun, setOpportunityRun] =
    useState<CareerOpportunityRun | null>(null);
  const [onboardingChecklistProgress, setOnboardingChecklistProgress] =
    useState<CareerOnboardingChecklistProgress | null>(null);
  const [
    pendingInternalOpportunityCallRequest,
    setPendingInternalOpportunityCallRequest,
  ] = useState<CareerInternalOpportunityCallRequest | null>(null);
  const [
    pendingInternalOpportunityCallRequests,
    setPendingInternalOpportunityCallRequests,
  ] = useState<CareerInternalOpportunityCallRequest[]>([]);
  const [opportunityRunTriggerPending, setOpportunityRunTriggerPending] =
    useState(false);
  const [sessionReengagementTestPending, setSessionReengagementTestPending] =
    useState(false);
  const [forceCompletePending, setForceCompletePending] = useState(false);
  const completedOpportunityRunRefreshRef = useRef<string | null>(null);
  const emptyCompletedHistoryProbeRef = useRef<string | null>(null);
  const sessionReengagementRef = useRef<string | null>(null);
  const companyFollowUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [
    sessionReengagementActionMessageId,
    setSessionReengagementActionMessageId,
  ] = useState<string | null>(null);
  const sessionReengagementActionVersionRef = useRef(0);
  const [includeInitialHistory] = useState(() => activeTab === "history");
  const [sessionReengagementPending, setSessionReengagementPending] =
    useState(false);
  const [sessionReengagementThinkingLogs, setSessionReengagementThinkingLogs] =
    useState<string[]>([]);
  const [
    sessionReengagementRecommendationStatus,
    setSessionReengagementRecommendationStatus,
  ] = useState<CareerRecommendationSearchStatus | null>(null);
  const [
    opportunityFeedbackFollowUpPending,
    setOpportunityFeedbackFollowUpPending,
  ] = useState(false);
  const [
    opportunityFeedbackFollowUpTrigger,
    setOpportunityFeedbackFollowUpTrigger,
  ] = useState<CareerOpportunityFeedbackFollowUpTrigger | null>(null);
  const refreshLatestHistoryOpportunitiesRef = useRef<
    (() => void | Promise<void>) | null
  >(null);

  const cancelPendingCompanyFollowUp = useCallback(() => {
    if (!companyFollowUpTimerRef.current) return;
    clearTimeout(companyFollowUpTimerRef.current);
    companyFollowUpTimerRef.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelPendingCompanyFollowUp();
    },
    [cancelPendingCompanyFollowUp]
  );

  const clearSessionReengagementAction = useCallback(() => {
    sessionReengagementActionVersionRef.current += 1;
    setSessionReengagementPending(false);
    setSessionReengagementThinkingLogs([]);
    setSessionReengagementRecommendationStatus(null);
    setSessionReengagementActionMessageId(null);
  }, []);

  const appendSessionReengagementThinkingLog = useCallback(
    (message: string) => {
      const normalized = message.replace(/\s+/g, " ").trim();
      if (!normalized) return;

      setSessionReengagementThinkingLogs((current) => {
        const next =
          current[current.length - 1] === normalized
            ? current
            : [...current, normalized].slice(-12);
        return next;
      });
    },
    []
  );

  const handleCareerLogout = useCallback(async () => {
    await handleLogout();
    await router.replace("/");
  }, [handleLogout, router]);

  const {
    conversationId,
    initialMessagePage,
    sessionData,
    sessionPending,
    sessionError,
    loadSession,
    resetSessionState,
  } = useCareerSession({
    emailOnboardingToken,
    enabled: !authLoading && Boolean(userId),
    fetchWithAuth,
    inviteToken,
    locale,
    mail,
    opportunityLimit: includeInitialHistory ? 20 : 0,
    userId,
  });
  const {
    messages: persistedMessages,
    hasOlderMessages,
    loadOlderMessages,
    loadingOlderMessages,
    appendLatestMessagesToCache,
    removeMessagesFromCache,
  } = useCareerMessageHistory({
    conversationId,
    fetchWithAuth,
    enabled: !authLoading && Boolean(user),
    initialSessionPage: initialMessagePage,
  });

  const applyPersistedTalentPreferencesRef = useRef<
    ((preferences: unknown, updatedAt: unknown) => void) | null
  >(null);
  const applyPersistedTalentInsightsRef = useRef<
    ((insights: unknown, updatedAt: unknown) => void) | null
  >(null);
  const applyTalentProfileSnapshotRef = useRef<
    ((profile: SessionResponse["talentProfile"] | undefined) => void) | null
  >(null);
  const handleTalentPreferencesRefreshedFromChat = useCallback(
    (preferences: unknown, updatedAt: unknown) => {
      applyPersistedTalentPreferencesRef.current?.(preferences, updatedAt);
    },
    []
  );
  const handleTalentInsightsRefreshedFromChat = useCallback(
    (insights: unknown, updatedAt: unknown) => {
      applyPersistedTalentInsightsRef.current?.(insights, updatedAt);
    },
    []
  );
  const handleTalentProfileRefreshedFromChat = useCallback(
    (profile: SessionResponse["talentProfile"] | undefined) => {
      applyTalentProfileSnapshotRef.current?.(profile);
    },
    []
  );
  const handleOpportunityRecommendationsChanged = useCallback(() => {
    return refreshLatestHistoryOpportunitiesRef.current?.();
  }, []);

  const {
    stage,
    setStage,
    messages,
    scrollTick,
    appendMessage,
    chatPending,
    chatError,
    setChatError,
    assistantTyping,
    toolStatusMessage,
    activeThinkingLogs,
    activeRecommendationSearchStatus,
    cancelActiveRecommendationSearch,
    onboardingWrapupPending: chatOnboardingWrapupPending,
    thinkingLogsByMessageId,
    enqueueAssistantTypewriter,
    applySessionConversation,
    sendChatMessage: sendChatMessageBase,
    regenerateOnboardingWrapup,
    resetChatState,
  } = useCareerChat({
    user,
    conversationId,
    sessionPending,
    fetchWithAuth,
    persistedMessages,
    onOpportunityRunChanged: setOpportunityRun,
    onOpportunityRecommendationsChanged:
      handleOpportunityRecommendationsChanged,
    onTalentPreferencesRefreshed: handleTalentPreferencesRefreshedFromChat,
    onTalentInsightsRefreshed: handleTalentInsightsRefreshedFromChat,
    onTalentProfileRefreshed: handleTalentProfileRefreshedFromChat,
    onMessagesChanged: appendLatestMessagesToCache,
  });

  const replacePendingInternalOpportunityCallRequests = useCallback(
    (
      callRequests: CareerInternalOpportunityCallRequest[] | null | undefined
    ) => {
      const next =
        normalizePendingInternalOpportunityCallRequests(callRequests);
      setPendingInternalOpportunityCallRequests(next);
      setPendingInternalOpportunityCallRequest(next[0] ?? null);
    },
    []
  );

  const mergePendingInternalOpportunityCallRequest = useCallback(
    (callRequest: CareerInternalOpportunityCallRequest | null) => {
      if (!callRequest) return;
      setPendingInternalOpportunityCallRequest(callRequest);
      setPendingInternalOpportunityCallRequests((current) =>
        normalizePendingInternalOpportunityCallRequests([
          callRequest,
          ...current.filter((item) => item.id !== callRequest.id),
        ])
      );
    },
    []
  );

  const replacePendingInternalOpportunityCallRequest = useCallback(
    (callRequest: CareerInternalOpportunityCallRequest | null) => {
      replacePendingInternalOpportunityCallRequests(
        callRequest ? [callRequest] : []
      );
    },
    [replacePendingInternalOpportunityCallRequests]
  );

  const enqueueHistoryActionAssistantMessage = useCallback(
    (message: CareerMessagePayload) => {
      return (async () => {
        await enqueueAssistantTypewriter(toUiMessage(message));
        appendLatestMessagesToCache([message]);
      })();
    },
    [appendLatestMessagesToCache, enqueueAssistantTypewriter]
  );

  const appendHistoryActionUserMessage = useCallback(
    (message: CareerMessagePayload) => {
      appendMessage(toUiMessage(message));
      appendLatestMessagesToCache([message]);
    },
    [appendLatestMessagesToCache, appendMessage]
  );

  const handleOpportunityFeedbackFollowUpPendingChanged = useCallback(
    (state: {
      pending: boolean;
      trigger: CareerOpportunityFeedbackFollowUpTrigger | null;
    }) => {
      setOpportunityFeedbackFollowUpPending(state.pending);
      setOpportunityFeedbackFollowUpTrigger(state.trigger);
    },
    []
  );

  const requestCompanyFollowUp = useCallback(
    async (companyDbId: number) => {
      if (!conversationId) return;

      try {
        const response = await fetchWithAuth(
          "/api/talent/company-watchlist/follow-followup",
          {
            method: "POST",
            body: JSON.stringify({
              companyDbId,
              conversationId,
            }),
          }
        );
        const payload = (await response.json().catch(() => ({}))) as {
          assistantMessage?: CareerMessagePayload | null;
        } & Record<string, unknown>;

        if (!response.ok) {
          throw new Error(
            getErrorMessage(
              payload,
              t(
                "career.common.career_flow_provider.1z048f4",
                "회사 팔로우 후속 메시지를 만들지 못했습니다."
              )
            )
          );
        }

        if (payload.assistantMessage) {
          enqueueHistoryActionAssistantMessage(payload.assistantMessage);
        }
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : t(
                "career.common.career_flow_provider.1z048f4",
                "회사 팔로우 후속 메시지를 만들지 못했습니다."
              )
        );
      }
    },
    [
      conversationId,
      enqueueHistoryActionAssistantMessage,
      fetchWithAuth,
      setChatError,
      t,
    ]
  );

  const scheduleCompanyFollowUp = useCallback(
    (companyDbId: number) => {
      cancelPendingCompanyFollowUp();
      companyFollowUpTimerRef.current = setTimeout(() => {
        companyFollowUpTimerRef.current = null;
        void requestCompanyFollowUp(companyDbId);
      }, CAREER_COMPANY_FOLLOW_UP_DELAY_MS);
    },
    [cancelPendingCompanyFollowUp, requestCompanyFollowUp]
  );

  const historySessionPage =
    sessionData?.historyOpportunitiesIncluded === true
      ? {
          counts: sessionData.historyOpportunityCounts ?? null,
          items: sessionData.historyOpportunities ?? [],
          nextOffset: sessionData.nextOpportunityOffset ?? null,
        }
      : null;
  const historyDataEnabled = !authLoading && Boolean(userId && sessionData);
  const historyAutoLoad =
    activeTab === "history" || Boolean(historySessionPage);

  const {
    hasMoreHistoryOpportunities,
    historyLoaded,
    setHistoryLoaded,
    historyInitialLoading,
    historyOpportunityCounts,
    historyOpportunities,
    historyLoadingMore,
    historyUpdateError,
    historyUpdatingOpportunityIds,
    hydrateHistoryOpportunityCounts,
    hydrateHistoryOpportunities,
    isHistoryOpportunityPageFilterLoading,
    loadHistoryOpportunityByRoleId,
    loadMoreHistoryOpportunities,
    loadSavedStageHistoryOpportunityPages,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
    onUpdateHistoryOpportunityFeedback,
    onUpdateHistoryOpportunitySavedStage,
    onUpdateHistoryOpportunityTalentMemo,
    cancelPendingOpportunityFeedbackFollowUp,
    refreshLatestHistoryOpportunities,
    resetHistoryState,
  } = useCareerHistoryState({
    autoLoad: historyAutoLoad,
    conversationId,
    enabled: historyDataEnabled,
    fetchWithAuth,
    initialSessionPage: historySessionPage,
    onHistoryActionAssistantMessage: enqueueHistoryActionAssistantMessage,
    onHistoryActionUserMessage: appendHistoryActionUserMessage,
    onPendingInternalOpportunityCallRequestChanged:
      mergePendingInternalOpportunityCallRequest,
    onPendingInternalOpportunityCallRequestsChanged:
      replacePendingInternalOpportunityCallRequests,
    onOpportunityFeedbackFollowUpPendingChanged:
      handleOpportunityFeedbackFollowUpPendingChanged,
    userId,
  });

  useEffect(() => {
    refreshLatestHistoryOpportunitiesRef.current =
      refreshLatestHistoryOpportunities;
  }, [refreshLatestHistoryOpportunities]);

  const {
    resumeFile,
    setResumeFile,
    profileLinks,
    savedProfileLinks,
    profilePending,
    profileError,
    savedResumeFileName,
    savedResumeStoragePath,
    savedResumeDownloadUrl,
    profileSavePending,
    profileSaveError,
    profileSaveInfo,
    talentUser,
    talentExperiences,
    talentEducations,
    talentExtras,
    applySessionProfile,
    handleProfileSubmit: handleProfileSubmitBase,
    handleProfileLinkChange,
    handleRemoveProfileLink,
    handleAddProfileLink,
    applyTalentProfileSnapshot,
    handleSaveTalentProfile,
    handleRefreshTalentProfileSources,
    resetProfileState,
  } = useCareerProfile({
    user,
    conversationId,
    fetchWithAuth,
    setStage,
    appendMessage,
    enqueueAssistantTypewriter,
    setChatError,
    onMessagesChanged: appendLatestMessagesToCache,
  });

  const {
    talentPreferences,
    talentPreferencesUpdatedAt,
    talentPreferencesSavePending,
    talentPreferencesSaveError,
    talentPreferencesSaveInfo,
    hasUnsavedTalentPreferencesChanges,
    applySessionTalentPreferences,
    applyPersistedTalentPreferences,
    onTalentPreferencesChange,
    onSaveTalentPreferences,
    onResetTalentPreferences,
    resetTalentPreferencesState,
  } = useCareerTalentPreferences({
    fetchWithAuth,
    user,
  });

  const {
    talentInsights,
    talentInsightsUpdatedAt,
    talentInsightsSavePending,
    talentInsightsSaveError,
    talentInsightsSaveInfo,
    hasUnsavedTalentInsightsChanges,
    applySessionTalentInsights,
    applyPersistedTalentInsights,
    onTalentInsightsChange,
    onSaveTalentInsights,
    onResetTalentInsights,
    resetTalentInsightsState,
  } = useCareerTalentInsights({
    fetchWithAuth,
    user,
  });

  useEffect(() => {
    applyPersistedTalentPreferencesRef.current =
      applyPersistedTalentPreferences;
  }, [applyPersistedTalentPreferences]);
  useEffect(() => {
    applyPersistedTalentInsightsRef.current = applyPersistedTalentInsights;
  }, [applyPersistedTalentInsights]);
  useEffect(() => {
    applyTalentProfileSnapshotRef.current = applyTalentProfileSnapshot;
  }, [applyTalentProfileSnapshot]);

  const {
    settingsLoading,
    settingsSaving,
    settingsError,
    settingsUpdatedAt,
    profileVisibility,
    engagementTypes,
    blockedCompanies,
    hasUnsavedTalentSettingsChanges,
    onProfileVisibilityChange,
    onEngagementTypesChange,
    onAddBlockedCompany,
    onRemoveBlockedCompany,
    onSaveTalentSettings,
    onResetTalentSettings,
    onReloadTalentSettings,
  } = useCareerTalentSettings({
    enabled: settingsDataEnabled === true,
    userId,
    authLoading,
    fetchWithAuth,
  });

  const isVoiceInteractionLocked =
    !user ||
    !conversationId ||
    sessionPending ||
    stage === "profile" ||
    profilePending ||
    Boolean(opportunityRun?.inputLocked);

  const sendChatMessage = useCallback(
    async (args: {
      allowedToolNames?: readonly string[];
      channel?: "chat" | "voice";
      conversationStarterId?: CareerConversationStarterId;
      text: string;
      link?: string;
      messageType?: TalentUserChatMessageType;
      onError?: () => void;
    }) => {
      if (opportunityFeedbackFollowUpPending) return;
      clearSessionReengagementAction();
      cancelPendingCompanyFollowUp();
      cancelPendingOpportunityFeedbackFollowUp();
      await sendChatMessageBase(args, {
        profilePending,
      });
    },
    [
      cancelPendingCompanyFollowUp,
      cancelPendingOpportunityFeedbackFollowUp,
      clearSessionReengagementAction,
      opportunityFeedbackFollowUpPending,
      profilePending,
      sendChatMessageBase,
    ]
  );

  const handleRunCurrentDataJobPostingRecommendationTest =
    useCallback(async () => {
      if (
        !conversationId ||
        stage === "profile" ||
        chatPending ||
        assistantTyping
      ) {
        return;
      }

      await sendChatMessage({
        allowedToolNames:
          CAREER_CHAT_ALLOWED_TOOLS_BY_ACTION.currentDataJobPostingRecommendation,
        text: getDevCurrentDataJobPostingRecommendationPrompt(t),
      });
    }, [
      assistantTyping,
      chatPending,
      conversationId,
      sendChatMessage,
      stage,
      t,
    ]);

  const handleLoadOlderMessages = useCallback(async () => {
    await loadOlderMessages();
  }, [loadOlderMessages]);

  const enqueueAssistantMessages = useCallback(
    async (rawMessages: unknown[]) => {
      const messagesToAdd = rawMessages
        .filter((item): item is SessionResponse["messages"][number] => {
          if (!item || typeof item !== "object") return false;
          return "id" in item && "role" in item && "content" in item;
        })
        .map((item) => item);

      for (const message of messagesToAdd) {
        await enqueueAssistantTypewriter(toUiMessage(message));
      }
      appendLatestMessagesToCache(messagesToAdd);
    },
    [appendLatestMessagesToCache, enqueueAssistantTypewriter]
  );

  const completeOnboardingFromCurrentConversation = useCallback(
    async (args?: { regenerateWrapup?: boolean }) => {
      if (!conversationId || forceCompletePending || stage === "profile") {
        return false;
      }

      const regenerateWrapup = args?.regenerateWrapup === true;
      setForceCompletePending(true);
      setChatError("");
      try {
        const response = await fetchWithAuth(
          "/api/talent/onboarding/complete",
          {
            method: "POST",
            body: JSON.stringify({ conversationId, regenerateWrapup }),
          }
        );
        const payload = (await response
          .json()
          .catch(() => ({}))) as OnboardingManualCompletionPayload;

        if (!response.ok) {
          throw new Error(
            getErrorMessage(
              payload,
              t(
                "career.common.career_flow_provider.1tnnmyb",
                "커리어 인터뷰 종료에 실패했습니다."
              )
            )
          );
        }

        if (payload.opportunityRun) {
          setOpportunityRun(payload.opportunityRun);
        }
        if (payload.opportunityDiscoveryQueued) {
          showOpportunityDiscoveryStartedToast();
        }
        if ("talentInsights" in payload) {
          handleTalentInsightsRefreshedFromChat(
            payload.talentInsights,
            payload.insightUpdatedAt ?? null
          );
        }

        const assistantMessages = Array.isArray(payload.assistantMessages)
          ? payload.assistantMessages
          : payload.assistantMessage
            ? [payload.assistantMessage]
            : [];

        if (assistantMessages.length > 0) {
          await enqueueAssistantMessages(assistantMessages);
        }
        if (payload.progress?.completed) {
          setStage("completed");
        }

        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t(
                "career.common.career_flow_provider.16uupip",
                "커리어 인터뷰 종료 중 오류가 발생했습니다."
              );
        setChatError(message);
        return false;
      } finally {
        setForceCompletePending(false);
      }
    },
    [
      conversationId,
      enqueueAssistantMessages,
      fetchWithAuth,
      forceCompletePending,
      handleTalentInsightsRefreshedFromChat,
      setChatError,
      setStage,
      stage,
      t,
    ]
  );

  const handleForceCompleteOnboarding = useCallback(
    () => completeOnboardingFromCurrentConversation(),
    [completeOnboardingFromCurrentConversation]
  );

  const handleRunOnboardingCompletionTest = useCallback(
    () =>
      completeOnboardingFromCurrentConversation({
        regenerateWrapup: true,
      }),
    [completeOnboardingFromCurrentConversation]
  );

  const {
    handleRunOpportunityDiscoveryTest,
    handleRunPeriodicOpportunityDiscoveryTest,
    resetRuntimeActionsState,
  } = useCareerRuntimeActions({
    conversationId,
    fetchWithAuth,
    opportunityRun,
    opportunityRunTriggerPending,
    setChatError,
    setOpportunityRun,
    setOpportunityRunTriggerPending,
  });

  const {
    showVoiceStartPrompt,
    onboardingBeginPending,
    onboardingWrapupPending: voiceOnboardingWrapupPending,
    callStartPending,
    callWrapUpPending,
    onboardingPausePending,
    inputMode,
    voiceTranscript,
    liveUserTranscriptPlacement,
    voiceMuted,
    handleToggleVoiceMute,
    handleStartCallMode,
    handleEndCallMode,
    callTranscriptEntries,
    connectionStatus,
    handleUseChatOnly,
    handlePauseOnboarding,
    handleSubmitOnboardingInterest,
    handleContinueOnboardingConversation,
    applySessionPrompt,
    handleProfileSubmitSuccess,
    resetOnboardingState,
    isAssistantSpeaking,
  } = useCareerOnboardingVoice({
    user,
    userId,
    authLoading,
    conversationId,
    messages,
    fetchWithAuth,
    isVoiceInteractionLocked,
    isOnboardingDone:
      stage === "completed" || Boolean(talentPreferences?.isOnboardingDone),
    onSendChatMessage: sendChatMessage,
    onOpportunityRunChanged: setOpportunityRun,
    onTalentPreferencesRefreshed: handleTalentPreferencesRefreshedFromChat,
    onTalentInsightsRefreshed: handleTalentInsightsRefreshedFromChat,
    onTalentProfileRefreshed: handleTalentProfileRefreshedFromChat,
    onPendingInternalOpportunityCallRequestChanged:
      replacePendingInternalOpportunityCallRequest,
    onPendingInternalOpportunityCallRequestsChanged:
      replacePendingInternalOpportunityCallRequests,
    appendMessage,
    setChatError,
    setStage,
    talentInsights,
    enqueueAssistantTypewriter,
    onMessagesChanged: appendLatestMessagesToCache,
  });

  const handleStartCallModeFromUi = useCallback(
    async (args?: Parameters<typeof handleStartCallMode>[0]) => {
      clearSessionReengagementAction();
      return handleStartCallMode(args);
    },
    [clearSessionReengagementAction, handleStartCallMode]
  );

  const handleStartConversationStarter = useCallback(
    async (args: {
      mode: CareerConversationStarterMode;
      starterId: CareerConversationStarterId;
    }) => {
      clearSessionReengagementAction();
      const starter = getCareerConversationStarter(args.starterId, locale);
      if (!starter) return false;

      if (args.mode === "call") {
        return handleStartCallModeFromUi({
          conversationStarterId: starter.id,
          openingText: starter.callOpeningText,
        });
      }

      await sendChatMessage({
        conversationStarterId: starter.id,
        text: starter.chatMessage,
      });
      return true;
    },
    [
      clearSessionReengagementAction,
      handleStartCallModeFromUi,
      locale,
      sendChatMessage,
    ]
  );

  const handleRequestMoreOpenPositions = useCallback(async () => {
    clearSessionReengagementAction();
    await sendChatMessage({
      allowedToolNames: CAREER_CHAT_ALLOWED_TOOLS_BY_ACTION.moreOpenPositions,
      messageType: TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST,
      text: t(
        "career.common.career_flow_provider.request_more_open_positions",
        "다른 오픈 포지션 더 추천해줘"
      ),
    });
    return true;
  }, [clearSessionReengagementAction, sendChatMessage, t]);

  const handleUpdateCompanyFollow = useCallback(
    async (args: {
      action: "follow" | "unfollow";
      companyDbId: number;
      companyWorkspaceId?: string | null;
      source?: string | null;
    }): Promise<CareerCompanyFollowActionResult | null> => {
      if (!userId) return null;

      setChatError("");
      try {
        const response = await fetchWithAuth(
          "/api/talent/company-watchlist/follow",
          {
            method: "POST",
            body: JSON.stringify({
              action: args.action,
              companyDbId: args.companyDbId,
              companyWorkspaceId: args.companyWorkspaceId ?? null,
              conversationId,
              locale,
              source: args.source ?? "watchlist",
            }),
          }
        );
        const payload = (await response
          .json()
          .catch(() => ({}))) as CareerCompanyFollowActionResult &
          Record<string, unknown>;

        if (!response.ok) {
          throw new Error(
            getErrorMessage(
              payload,
              t(
                "career.common.career_flow_provider.19x0zaz",
                "회사 팔로우 상태를 변경하지 못했습니다."
              )
            )
          );
        }

        if (args.action === "unfollow") {
          cancelPendingCompanyFollowUp();
        } else if (payload.followUp?.delayed) {
          const followUpCompanyDbId = Number(
            payload.followUp.companyDbId ?? args.companyDbId
          );
          if (Number.isFinite(followUpCompanyDbId) && followUpCompanyDbId > 0) {
            scheduleCompanyFollowUp(Math.floor(followUpCompanyDbId));
          }
        }

        return payload;
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : t(
                "career.common.career_flow_provider.19x0zaz",
                "회사 팔로우 상태를 변경하지 못했습니다."
              )
        );
        return null;
      }
    },
    [
      cancelPendingCompanyFollowUp,
      conversationId,
      fetchWithAuth,
      locale,
      scheduleCompanyFollowUp,
      setChatError,
      t,
      userId,
    ]
  );

  const handleProfileSubmit = useCallback(async () => {
    await handleProfileSubmitBase(handleProfileSubmitSuccess);
  }, [handleProfileSubmitBase, handleProfileSubmitSuccess]);

  const hydrateSession = useCallback(
    (payload: SessionResponse) => {
      applySessionConversation(payload);
      appendLatestMessagesToCache(payload.messages ?? []);
      applySessionProfile(payload);
      applySessionTalentPreferences(payload);
      applySessionTalentInsights(payload);
      setOnboardingChecklistProgress(
        normalizeOnboardingChecklistProgress(
          payload.onboardingChecklistProgress
        )
      );
      applySessionPrompt(payload);
      if (payload.historyOpportunitiesIncluded === true) {
        hydrateHistoryOpportunities(
          payload.historyOpportunities,
          payload.nextOpportunityOffset ?? null,
          payload.historyOpportunityCounts ?? null
        );
      } else {
        hydrateHistoryOpportunityCounts(payload.historyOpportunityCounts);
      }
      setRecentOpportunities(
        normalizeRecentOpportunities(payload.recentOpportunities)
      );
      setActiveCompanyRoleCount(
        Math.max(0, Number(payload.activeCompanyRoleCount ?? 0) || 0)
      );
      setOpportunityRun(payload.opportunityRun ?? null);
      replacePendingInternalOpportunityCallRequests(
        Array.isArray(payload.pendingInternalOpportunityCallRequests)
          ? payload.pendingInternalOpportunityCallRequests
          : payload.pendingInternalOpportunityCallRequest
            ? [payload.pendingInternalOpportunityCallRequest]
            : []
      );
      const completedRunRefreshKey = getCompletedOpportunityRunRefreshKey(
        payload.opportunityRun ?? null
      );
      if (completedRunRefreshKey) {
        completedOpportunityRunRefreshRef.current = completedRunRefreshKey;
      }
    },
    [
      applySessionConversation,
      applySessionProfile,
      applySessionTalentInsights,
      applySessionTalentPreferences,
      applySessionPrompt,
      appendLatestMessagesToCache,
      hydrateHistoryOpportunityCounts,
      hydrateHistoryOpportunities,
      replacePendingInternalOpportunityCallRequests,
    ]
  );

  const handleRunSessionReengagement =
    useCallback(async (): Promise<boolean> => {
      if (
        !conversationId ||
        sessionReengagementPending ||
        sessionReengagementTestPending ||
        stage === "profile"
      ) {
        return false;
      }

      clearSessionReengagementAction();
      setSessionReengagementPending(true);
      setSessionReengagementThinkingLogs([]);
      setSessionReengagementRecommendationStatus(null);
      setChatError("");

      try {
        const response = await fetchWithAuth(
          "/api/talent/session/reengagement",
          {
            method: "POST",
            body: JSON.stringify({
              conversationId,
              userInitiated: true,
            }),
          }
        );
        const payload = (await response
          .json()
          .catch(() => ({}))) as SessionReengagementPayload;

        if (!response.ok) {
          throw new Error(
            getErrorMessage(
              payload,
              t(
                "career.common.career_flow_provider.resume_interview_error",
                "커리어 인터뷰 이어가기를 실행하지 못했습니다."
              )
            )
          );
        }

        if (payload.skipped) {
          return false;
        }

        if (payload.opportunityRun) {
          setOpportunityRun(payload.opportunityRun);
        }
        if ("talentPreferences" in payload) {
          handleTalentPreferencesRefreshedFromChat(
            payload.talentPreferences,
            payload.preferencesUpdatedAt ?? null
          );
        }
        if ("talentInsights" in payload) {
          handleTalentInsightsRefreshedFromChat(
            payload.talentInsights,
            payload.insightUpdatedAt ?? null
          );
        }

        const assistantMessages = Array.isArray(payload.assistantMessages)
          ? payload.assistantMessages
          : payload.assistantMessage
            ? [payload.assistantMessage]
            : [];

        if (assistantMessages.length > 0) {
          await enqueueAssistantMessages(assistantMessages);
          const lastAssistantMessage =
            assistantMessages[assistantMessages.length - 1];
          setSessionReengagementActionMessageId(
            String(lastAssistantMessage.id)
          );
        } else {
          const sessionPayload = await loadSession({ force: true });
          if (sessionPayload) {
            hydrateSession(sessionPayload);
          }
        }

        return true;
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : t(
                "career.common.career_flow_provider.resume_interview_error",
                "커리어 인터뷰 이어가기를 실행하지 못했습니다."
              )
        );
        return false;
      } finally {
        setSessionReengagementPending(false);
      }
    }, [
      clearSessionReengagementAction,
      conversationId,
      enqueueAssistantMessages,
      fetchWithAuth,
      handleTalentInsightsRefreshedFromChat,
      handleTalentPreferencesRefreshedFromChat,
      hydrateSession,
      loadSession,
      sessionReengagementPending,
      sessionReengagementTestPending,
      setChatError,
      stage,
      t,
    ]);

  const handleRunSessionReengagementTest = useCallback(
    async (options?: { deleteLatestMessage?: boolean }): Promise<void> => {
      if (
        !conversationId ||
        sessionReengagementTestPending ||
        stage === "profile"
      ) {
        return;
      }

      clearSessionReengagementAction();
      setSessionReengagementTestPending(true);
      setChatError("");
      const deleteLatestMessage = options?.deleteLatestMessage !== false;
      try {
        const response = await fetchWithAuth(
          "/api/talent/session/reengagement",
          {
            method: "POST",
            body: JSON.stringify({
              conversationId,
              ...(deleteLatestMessage ? { devDeleteLatestMessage: true } : {}),
              devForce: true,
            }),
          }
        );
        const payload = (await response
          .json()
          .catch(() => ({}))) as SessionReengagementPayload;

        if (!response.ok) {
          throw new Error(
            getErrorMessage(
              payload,
              // career-i18n-skip-next-line: dev controls text is intentionally Korean-only.
              "12시간 인사 테스트 실행에 실패했습니다."
            )
          );
        }
        if (payload.skipped) {
          // career-i18n-skip-next-line: dev controls text is intentionally Korean-only.
          throw new Error("12시간 인사 테스트가 스킵되었습니다.");
        }

        if (payload.opportunityRun) {
          setOpportunityRun(payload.opportunityRun);
        }
        if ("talentPreferences" in payload) {
          handleTalentPreferencesRefreshedFromChat(
            payload.talentPreferences,
            payload.preferencesUpdatedAt ?? null
          );
        }
        if ("talentInsights" in payload) {
          handleTalentInsightsRefreshedFromChat(
            payload.talentInsights,
            payload.insightUpdatedAt ?? null
          );
        }

        const deletedMessageId = payload.deletedMessage?.id;
        if (deletedMessageId != null) {
          removeMessagesFromCache([deletedMessageId]);
        }

        const sessionPayload = await loadSession({ force: true });
        if (sessionPayload) {
          hydrateSession(sessionPayload);
        } else {
          const assistantMessages = Array.isArray(payload.assistantMessages)
            ? payload.assistantMessages
            : payload.assistantMessage
              ? [payload.assistantMessage]
              : [];
          if (assistantMessages.length > 0) {
            await enqueueAssistantMessages(assistantMessages);
          }
        }
      } catch (error) {
        // career-i18n-skip-next-line: dev controls text is intentionally Korean-only.
        setChatError(
          error instanceof Error
            ? error.message
            : "12시간 인사 테스트 실행 중 오류가 발생했습니다."
        );
      } finally {
        setSessionReengagementTestPending(false);
      }
    },
    [
      clearSessionReengagementAction,
      conversationId,
      enqueueAssistantMessages,
      fetchWithAuth,
      handleTalentInsightsRefreshedFromChat,
      handleTalentPreferencesRefreshedFromChat,
      hydrateSession,
      loadSession,
      removeMessagesFromCache,
      sessionReengagementTestPending,
      setChatError,
      stage,
    ]
  );

  const loadSessionForCompletedOpportunityRun = useCallback(
    async (run: CareerOpportunityRun | null) => {
      const refreshKey = getCompletedOpportunityRunRefreshKey(run);
      if (!refreshKey) return null;
      if (completedOpportunityRunRefreshRef.current === refreshKey) {
        return null;
      }

      const sessionPayload = await loadSession({ force: true });
      if (sessionPayload) {
        completedOpportunityRunRefreshRef.current = refreshKey;
      }
      return sessionPayload;
    },
    [loadSession]
  );

  useEffect(() => {
    setHistoryLoaded(false);
  }, [setHistoryLoaded, userId]);

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      resetSessionState();
      resetChatState();
      resetProfileState();
      resetTalentPreferencesState();
      resetTalentInsightsState();
      resetOnboardingState();
      resetHistoryState();
      resetRuntimeActionsState();
      setRecentOpportunities([]);
      setActiveCompanyRoleCount(0);
      setOnboardingChecklistProgress(null);
      replacePendingInternalOpportunityCallRequests([]);
      clearSessionReengagementAction();
      sessionReengagementRef.current = null;
    }
  }, [
    authLoading,
    clearSessionReengagementAction,
    resetChatState,
    resetOnboardingState,
    resetProfileState,
    resetRuntimeActionsState,
    resetTalentInsightsState,
    resetTalentPreferencesState,
    resetSessionState,
    resetHistoryState,
    replacePendingInternalOpportunityCallRequests,
    userId,
  ]);

  useEffect(() => {
    if (!userId || !sessionData) return;
    hydrateSession(sessionData);
  }, [hydrateSession, sessionData, userId]);

  useEffect(() => {
    if (!userId || !conversationId || sessionPending || stage === "profile") {
      return;
    }

    const reengagementKey = `${userId}:${conversationId}`;
    if (sessionReengagementRef.current === reengagementKey) return;
    sessionReengagementRef.current = reengagementKey;
    clearSessionReengagementAction();
    const reengagementActionVersion =
      sessionReengagementActionVersionRef.current;

    let cancelled = false;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    const applyReengagementPayload = async (
      payload: SessionReengagementPayload
    ) => {
      if (cancelled || payload.skipped) return;

      if (payload.opportunityRun) {
        setOpportunityRun(payload.opportunityRun);
      }
      if ("talentPreferences" in payload) {
        handleTalentPreferencesRefreshedFromChat(
          payload.talentPreferences,
          payload.preferencesUpdatedAt ?? null
        );
      }
      if ("talentInsights" in payload) {
        handleTalentInsightsRefreshedFromChat(
          payload.talentInsights,
          payload.insightUpdatedAt ?? null
        );
      }

      const assistantMessages = Array.isArray(payload.assistantMessages)
        ? payload.assistantMessages
        : payload.assistantMessage
          ? [payload.assistantMessage]
          : [];

      if (assistantMessages.length > 0) {
        if (!cancelled) {
          setSessionReengagementPending(false);
          setSessionReengagementThinkingLogs([]);
          setSessionReengagementRecommendationStatus(null);
        }
        await enqueueAssistantMessages(assistantMessages);
        if (
          !cancelled &&
          sessionReengagementActionVersionRef.current ===
            reengagementActionVersion
        ) {
          const lastAssistantMessage =
            assistantMessages[assistantMessages.length - 1];
          setSessionReengagementActionMessageId(
            String(lastAssistantMessage.id)
          );
        }
      }
    };

    const consumeReengagementStream = async (response: Response) => {
      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;

      const handleStreamEvent = async ({ data, event }: CareerSseEvent) => {
        if (event === "tool_status") {
          const message =
            isRecord(data) && typeof data.message === "string"
              ? data.message
              : "";
          appendSessionReengagementThinkingLog(message);
          return;
        }

        if (event === "recommendation_search_status") {
          const status = toRecommendationSearchStatus(data);
          if (status) {
            setSessionReengagementRecommendationStatus(status);
          }
          return;
        }

        if (event === "reengagement_result") {
          await applyReengagementPayload(data as SessionReengagementPayload);
          return;
        }

        if (event === "error") {
          throw new Error(
            isRecord(data) && typeof data.error === "string"
              ? data.error
              : t(
                  "career.common.career_flow_provider.0750gye",
                  "12시간 인사 생성에 실패했습니다."
                )
          );
        }

        if (event === "done") {
          streamDone = true;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder
          .decode(value, { stream: true })
          .replace(/\r\n/g, "\n");
        let boundaryIndex = buffer.indexOf("\n\n");
        while (boundaryIndex >= 0) {
          const rawEvent = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          const parsedEvent = parseCareerSseEvent(rawEvent);
          if (parsedEvent) {
            await handleStreamEvent(parsedEvent);
          }
          boundaryIndex = buffer.indexOf("\n\n");
        }
      }

      const tail = buffer.trim();
      if (tail) {
        const parsedEvent = parseCareerSseEvent(tail);
        if (parsedEvent) {
          await handleStreamEvent(parsedEvent);
        }
      }

      if (!streamDone) {
        throw new Error(
          t(
            "career.common.career_flow_provider.06f4hcx",
            "12시간 인사 스트림이 완료되기 전에 종료되었습니다."
          )
        );
      }
    };

    const triggerReengagement = async () => {
      pendingTimer = setTimeout(() => {
        if (
          !cancelled &&
          sessionReengagementActionVersionRef.current ===
            reengagementActionVersion
        ) {
          setSessionReengagementPending(true);
        }
      }, 300);

      try {
        const response = await fetchWithAuth(
          "/api/talent/session/reengagement",
          {
            method: "POST",
            headers: {
              Accept: "text/event-stream",
            },
            body: JSON.stringify({ conversationId }),
          }
        );

        const contentType = response.headers.get("content-type") ?? "";
        if (
          response.ok &&
          response.body &&
          contentType.includes("text/event-stream")
        ) {
          await consumeReengagementStream(response);
          return;
        }

        const payload = (await response
          .json()
          .catch(() => ({}))) as SessionReengagementPayload;

        if (!response.ok || cancelled || payload.skipped) return;
        await applyReengagementPayload(payload);
      } catch (error) {
        console.error("[CareerFlowProvider] session re-engagement failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (pendingTimer) {
          clearTimeout(pendingTimer);
        }
        if (!cancelled) {
          setSessionReengagementPending(false);
          setSessionReengagementThinkingLogs([]);
          setSessionReengagementRecommendationStatus(null);
        }
      }
    };

    void triggerReengagement();

    return () => {
      cancelled = true;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
      }
      setSessionReengagementPending(false);
      setSessionReengagementThinkingLogs([]);
      setSessionReengagementRecommendationStatus(null);
    };
  }, [
    appendSessionReengagementThinkingLog,
    conversationId,
    clearSessionReengagementAction,
    enqueueAssistantMessages,
    fetchWithAuth,
    handleTalentInsightsRefreshedFromChat,
    handleTalentPreferencesRefreshedFromChat,
    sessionPending,
    stage,
    t,
    userId,
  ]);

  useEffect(() => {
    if (!userId || !opportunityRun?.inputLocked) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetchWithAuth(
          "/api/talent/opportunity-runs/latest"
        );
        const payload = (await response.json().catch(() => ({}))) as {
          run?: CareerOpportunityRun | null;
        };
        if (!response.ok || cancelled) return;

        const nextRun = payload.run ?? null;
        setOpportunityRun(nextRun);
        const sessionPayload =
          await loadSessionForCompletedOpportunityRun(nextRun);
        if (!cancelled && sessionPayload) {
          hydrateSession(sessionPayload);
        }
      } catch {
        // Keep the current lock state; the next poll can recover.
      }
    };

    const intervalId = window.setInterval(() => {
      void poll();
    }, 4000);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    fetchWithAuth,
    hydrateSession,
    loadSessionForCompletedOpportunityRun,
    opportunityRun?.inputLocked,
    userId,
  ]);

  useEffect(() => {
    if (
      !userId ||
      sessionPending ||
      stage !== "completed" ||
      opportunityRun?.inputLocked
    ) {
      return;
    }

    const probeKey = [
      userId,
      conversationId ?? "",
      opportunityRun?.id ?? "none",
      opportunityRun?.status ?? "none",
    ].join(":");
    if (emptyCompletedHistoryProbeRef.current === probeKey) return;
    emptyCompletedHistoryProbeRef.current = probeKey;

    let cancelled = false;
    const probeLatestRun = async () => {
      try {
        const response = await fetchWithAuth(
          "/api/talent/opportunity-runs/latest"
        );
        const payload = (await response.json().catch(() => ({}))) as {
          run?: CareerOpportunityRun | null;
        };
        if (!response.ok || cancelled) return;

        const nextRun = payload.run ?? null;
        setOpportunityRun(nextRun);

        const sessionPayload =
          await loadSessionForCompletedOpportunityRun(nextRun);
        if (!cancelled && sessionPayload) {
          hydrateSession(sessionPayload);
        }
      } catch {
        // The regular session load path can recover on the next navigation.
      }
    };

    void probeLatestRun();

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    fetchWithAuth,
    hydrateSession,
    loadSessionForCompletedOpportunityRun,
    opportunityRun?.id,
    opportunityRun?.inputLocked,
    opportunityRun?.status,
    sessionPending,
    stage,
    userId,
  ]);

  const historyLoading =
    historyOpportunities.length === 0 &&
    (historyInitialLoading ||
      (!historyLoaded && (sessionPending || activeTab === "history")));

  const initialScrollConversationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId || sessionPending || messages.length === 0) return;
    if (initialScrollConversationRef.current === conversationId) return;

    const el = scrollRef.current;
    if (!el) return;

    el.scrollTo({ top: el.scrollHeight });
    initialScrollConversationRef.current = conversationId;
  }, [conversationId, messages.length, sessionPending]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [scrollTick]);

  const userChatCount = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.role === "user" && (message.messageType ?? "chat") === "chat"
      ).length,
    [messages]
  );

  const answeredCount = useMemo(
    () => Math.min(userChatCount, TALENT_INTERVIEW_FINAL_STEP),
    [userChatCount]
  );
  const onboardingWrapupPending =
    chatOnboardingWrapupPending || voiceOnboardingWrapupPending;
  const isOnboardingDone =
    stage === "completed" || Boolean(talentPreferences?.isOnboardingDone);
  const sessionDataStage = sessionData?.conversation.stage;
  const sessionDataOnboardingDone =
    sessionDataStage === "completed" ||
    Boolean(sessionData?.talentPreferences?.isOnboardingDone);
  const sessionDataNeedsLocalHydration =
    Boolean(
      sessionData && stage === "profile" && sessionDataStage !== "profile"
    ) || Boolean(sessionDataOnboardingDone && !isOnboardingDone);
  const workspaceDataLoading = sessionPending || sessionDataNeedsLocalHydration;

  const progressPercent = Math.round(
    (answeredCount / TALENT_INTERVIEW_FINAL_STEP) * 100
  );
  const interviewProgress: CareerInterviewProgress = useMemo(() => {
    const insightTotalCount = INSIGHT_CHECKLIST.length;
    const insightFilledCount = INSIGHT_CHECKLIST.reduce((count, item) => {
      const value = talentInsights?.[item.key];
      return String(value ?? "").trim().length > 0 ? count + 1 : count;
    }, 0);
    const insightPercent =
      insightTotalCount > 0
        ? Math.min(
            100,
            Math.round((insightFilledCount / insightTotalCount) * 100)
          )
        : 0;
    const checklistPercent = onboardingChecklistProgress?.percent ?? 0;
    const displayProgressCandidates = [
      {
        filledCount: insightFilledCount,
        percent: insightPercent,
        totalCount: insightTotalCount,
      },
      onboardingChecklistProgress
        ? {
            filledCount: onboardingChecklistProgress.coveredCount,
            percent: checklistPercent,
            totalCount: onboardingChecklistProgress.totalCount,
          }
        : null,
      {
        filledCount: answeredCount,
        percent: progressPercent,
        totalCount: TALENT_INTERVIEW_FINAL_STEP,
      },
    ].filter(
      (
        item
      ): item is {
        filledCount: number;
        percent: number;
        totalCount: number;
      } => item !== null
    );
    const displayProgress = displayProgressCandidates.reduce((best, item) =>
      item.percent > best.percent ? item : best
    );
    const forceCompletePercent = Math.max(insightPercent, checklistPercent);

    return {
      canForceComplete:
        !isOnboardingDone && stage === "chat" && forceCompletePercent >= 85,
      filledCount: displayProgress.filledCount,
      percent: displayProgress.percent,
      remainingCount: Math.max(
        displayProgress.totalCount - displayProgress.filledCount,
        0
      ),
      totalCount: displayProgress.totalCount,
    };
  }, [
    answeredCount,
    isOnboardingDone,
    onboardingChecklistProgress,
    progressPercent,
    stage,
    talentInsights,
  ]);

  const chatPanelContextValue: CareerChatPanelContextValue = useMemo(
    () => ({
      user,
      conversationId,
      stage,
      messages,
      scrollRef,
      hasOlderMessages,
      loadingOlderMessages,
      authLoading,
      authPending,
      authError,
      authInfo,
      sessionPending,
      sessionError,
      isOnboardingDone,
      resumeFile,
      profileLinks,
      profilePending,
      profileError,
      chatError,
      assistantTyping,
      toolStatusMessage,
      activeThinkingLogs,
      activeRecommendationSearchStatus,
      onCancelActiveRecommendationSearch: cancelActiveRecommendationSearch,
      initialChatDraft: initialChatDraft?.trim() || undefined,
      initialChatDraftKey: initialChatDraftKey?.trim() || undefined,
      onboardingWrapupPending,
      thinkingLogsByMessageId,
      chatPending,
      sessionReengagementPending,
      sessionReengagementThinkingLogs,
      sessionReengagementRecommendationStatus,
      sessionReengagementActionMessageId,
      opportunityFeedbackFollowUpPending,
      opportunityFeedbackFollowUpTrigger,
      opportunityRun,
      opportunitySearchLocked: Boolean(opportunityRun?.inputLocked),
      historyUpdatingOpportunityIds,
      onboardingBeginPending: onboardingBeginPending || forceCompletePending,
      callStartPending,
      callWrapUpPending,
      onboardingPausePending,
      onGoogleLogin: handleGoogleLogin,
      onEmailAuth: handleEmailAuth,
      onResumeFileChange: setResumeFile,
      onProfileLinkChange: handleProfileLinkChange,
      onRemoveProfileLink: handleRemoveProfileLink,
      onAddProfileLink: handleAddProfileLink,
      onProfileSubmit: handleProfileSubmit,
      onSendChatMessage: sendChatMessage,
      onStartConversationStarter: handleStartConversationStarter,
      onRunSessionReengagement: handleRunSessionReengagement,
      onUpdateHistoryOpportunityFeedback,
      onLoadOlderMessages: handleLoadOlderMessages,
      onRegenerateOnboardingWrapup: regenerateOnboardingWrapup,
      forceCompletePending,
      interviewProgress,
      onForceCompleteOnboarding: handleForceCompleteOnboarding,
      showVoiceStartPrompt,
      onUseChatOnly: handleUseChatOnly,
      onPauseOnboarding: handlePauseOnboarding,
      onSubmitOnboardingInterest: handleSubmitOnboardingInterest,
      onContinueOnboardingConversation: handleContinueOnboardingConversation,
      inputMode,
      voiceTranscript,
      voiceMuted,
      onToggleVoiceMute: handleToggleVoiceMute,
      onStartCallMode: handleStartCallModeFromUi,
      onEndCallMode: handleEndCallMode,
      callTranscriptEntries,
      liveUserTranscriptPlacement,
      callConnectionStatus: connectionStatus,
      isAssistantSpeaking,
    }),
    [
      assistantTyping,
      activeThinkingLogs,
      activeRecommendationSearchStatus,
      cancelActiveRecommendationSearch,
      onboardingWrapupPending,
      authLoading,
      authError,
      authInfo,
      authPending,
      chatError,
      chatPending,
      thinkingLogsByMessageId,
      toolStatusMessage,
      sessionReengagementThinkingLogs,
      sessionReengagementRecommendationStatus,
      opportunityFeedbackFollowUpPending,
      opportunityFeedbackFollowUpTrigger,
      conversationId,
      handleAddProfileLink,
      handleEmailAuth,
      handleForceCompleteOnboarding,
      handleGoogleLogin,
      handleProfileLinkChange,
      handleProfileSubmit,
      handleRemoveProfileLink,
      handleRunSessionReengagement,
      historyUpdatingOpportunityIds,
      handleLoadOlderMessages,
      hasOlderMessages,
      handleContinueOnboardingConversation,
      handlePauseOnboarding,
      handleStartCallModeFromUi,
      handleStartConversationStarter,
      handleEndCallMode,
      callTranscriptEntries,
      liveUserTranscriptPlacement,
      connectionStatus,
      handleSubmitOnboardingInterest,
      handleToggleVoiceMute,
      handleUseChatOnly,
      inputMode,
      initialChatDraft,
      initialChatDraftKey,
      forceCompletePending,
      isOnboardingDone,
      interviewProgress,
      messages,
      loadingOlderMessages,
      onUpdateHistoryOpportunityFeedback,
      regenerateOnboardingWrapup,
      onboardingBeginPending,
      callStartPending,
      callWrapUpPending,
      onboardingPausePending,
      opportunityRun,
      profileError,
      profileLinks,
      profilePending,
      resumeFile,
      setResumeFile,
      sendChatMessage,
      sessionReengagementPending,
      sessionReengagementActionMessageId,
      sessionError,
      sessionPending,
      showVoiceStartPrompt,
      stage,
      user,
      voiceMuted,
      voiceTranscript,
      isAssistantSpeaking,
    ]
  );

  const sidebarContextValue: CareerSidebarContextValue = useMemo(
    () => ({
      user,
      conversationId,
      stage,
      isOnboardingDone,
      workspaceDataLoading,
      userChatCount,
      answeredCount,
      targetQuestions: TALENT_INTERVIEW_FINAL_STEP,
      progressPercent,
      onOpenSettings,
      onLogout: handleCareerLogout,
      activeCompanyRoleCount,
      opportunityRun,
      opportunityRunTriggerPending,
      onboardingCompletionTestPending: forceCompletePending,
      sessionReengagementTestPending,
      currentDataJobPostingRecommendationTestPending:
        chatPending || assistantTyping,
      onRunOnboardingCompletionTest: handleRunOnboardingCompletionTest,
      onRunCurrentDataJobPostingRecommendationTest:
        handleRunCurrentDataJobPostingRecommendationTest,
      onRunSessionReengagementTest: handleRunSessionReengagementTest,
      onRunPeriodicOpportunityDiscoveryTest:
        handleRunPeriodicOpportunityDiscoveryTest,
      onRunOpportunityDiscoveryTest: handleRunOpportunityDiscoveryTest,
      callStartPending,
      onStartCallMode: handleStartCallModeFromUi,
      onUseChatOnly: handleUseChatOnly,
      onStartConversationStarter: handleStartConversationStarter,
      onRequestMoreOpenPositions: handleRequestMoreOpenPositions,
      recentOpportunities,
      pendingInternalOpportunityCallRequest,
      pendingInternalOpportunityCallRequests,
      historyOpportunityCounts,
      historyOpportunities,
      historyLoading,
      historyLoadingMore,
      hasMoreHistoryOpportunities,
      historyUpdatingOpportunityIds,
      historyUpdateError,
      onLoadMoreHistoryOpportunities: loadMoreHistoryOpportunities,
      isHistoryOpportunityPageFilterLoading,
      onLoadSavedStageHistoryOpportunityPages:
        loadSavedStageHistoryOpportunityPages,
      onLoadHistoryOpportunityByRoleId: loadHistoryOpportunityByRoleId,
      onUpdateHistoryOpportunityFeedback,
      onUpdateHistoryOpportunitySavedStage,
      onUpdateHistoryOpportunityTalentMemo,
      onMarkHistoryOpportunityViewed,
      onMarkHistoryOpportunityClicked,
      onUpdateCompanyFollow: handleUpdateCompanyFollow,
      resumeFile,
      savedResumeFileName,
      savedResumeStoragePath,
      savedResumeDownloadUrl,
      profileLinks,
      savedProfileLinks,
      profileSavePending,
      profileSaveError,
      profileSaveInfo,
      onResumeFileChange: setResumeFile,
      onProfileLinkChange: handleProfileLinkChange,
      onAddProfileLink: handleAddProfileLink,
      onRemoveProfileLink: handleRemoveProfileLink,
      onSaveTalentProfile: handleSaveTalentProfile,
      onRefreshTalentProfileSources: handleRefreshTalentProfileSources,
      talentProfile: {
        talentUser,
        talentExperiences,
        talentEducations,
        talentExtras,
      },
      talentPreferences,
      talentInsights,
      talentPreferencesUpdatedAt,
      talentInsightsUpdatedAt,
      talentPreferencesSavePending,
      talentPreferencesSaveError,
      talentPreferencesSaveInfo,
      hasUnsavedTalentPreferencesChanges,
      talentInsightsSavePending,
      talentInsightsSaveError,
      talentInsightsSaveInfo,
      hasUnsavedTalentInsightsChanges,
      onTalentPreferencesChange,
      onSaveTalentPreferences,
      onResetTalentPreferences,
      onTalentInsightsChange,
      onSaveTalentInsights,
      onResetTalentInsights,
      settingsLoading,
      settingsSaving,
      settingsError,
      settingsUpdatedAt,
      profileVisibility,
      engagementTypes,
      blockedCompanies,
      hasUnsavedTalentSettingsChanges,
      onProfileVisibilityChange,
      onEngagementTypesChange,
      onAddBlockedCompany,
      onRemoveBlockedCompany,
      onSaveTalentSettings,
      onResetTalentSettings,
      onReloadTalentSettings,
    }),
    [
      answeredCount,
      activeCompanyRoleCount,
      assistantTyping,
      blockedCompanies,
      callStartPending,
      chatPending,
      conversationId,
      engagementTypes,
      handleAddProfileLink,
      handleRunPeriodicOpportunityDiscoveryTest,
      handleRunOpportunityDiscoveryTest,
      handleRequestMoreOpenPositions,
      handleStartConversationStarter,
      handleStartCallModeFromUi,
      handleUseChatOnly,
      onAddBlockedCompany,
      onEngagementTypesChange,
      hasUnsavedTalentInsightsChanges,
      hasUnsavedTalentPreferencesChanges,
      hasUnsavedTalentSettingsChanges,
      handleCareerLogout,
      handleProfileLinkChange,
      handleRunOnboardingCompletionTest,
      handleRunCurrentDataJobPostingRecommendationTest,
      forceCompletePending,
      onResetTalentInsights,
      onResetTalentPreferences,
      onResetTalentSettings,
      onSaveTalentInsights,
      onSaveTalentPreferences,
      onSaveTalentSettings,
      onTalentInsightsChange,
      onTalentPreferencesChange,
      onProfileVisibilityChange,
      onReloadTalentSettings,
      onOpenSettings,
      handleRemoveProfileLink,
      handleUpdateCompanyFollow,
      onRemoveBlockedCompany,
      handleSaveTalentProfile,
      handleRefreshTalentProfileSources,
      handleRunSessionReengagementTest,
      hasMoreHistoryOpportunities,
      historyOpportunityCounts,
      historyLoading,
      historyLoadingMore,
      historyOpportunities,
      historyUpdateError,
      historyUpdatingOpportunityIds,
      pendingInternalOpportunityCallRequest,
      pendingInternalOpportunityCallRequests,
      isOnboardingDone,
      isHistoryOpportunityPageFilterLoading,
      loadHistoryOpportunityByRoleId,
      loadMoreHistoryOpportunities,
      loadSavedStageHistoryOpportunityPages,
      profileLinks,
      profileVisibility,
      profileSaveError,
      profileSaveInfo,
      profileSavePending,
      progressPercent,
      recentOpportunities,
      resumeFile,
      savedProfileLinks,
      savedResumeDownloadUrl,
      savedResumeFileName,
      savedResumeStoragePath,
      sessionReengagementTestPending,
      settingsError,
      settingsLoading,
      settingsSaving,
      settingsUpdatedAt,
      setResumeFile,
      stage,
      talentInsights,
      talentInsightsSaveError,
      talentInsightsSaveInfo,
      talentInsightsSavePending,
      talentInsightsUpdatedAt,
      talentPreferences,
      talentPreferencesSaveError,
      talentPreferencesSaveInfo,
      talentPreferencesSavePending,
      talentPreferencesUpdatedAt,
      userChatCount,
      workspaceDataLoading,
      onMarkHistoryOpportunityClicked,
      onMarkHistoryOpportunityViewed,
      onUpdateHistoryOpportunityFeedback,
      onUpdateHistoryOpportunitySavedStage,
      onUpdateHistoryOpportunityTalentMemo,
      opportunityRun,
      opportunityRunTriggerPending,
      talentEducations,
      talentExperiences,
      talentExtras,
      talentUser,
      user,
    ]
  );

  return (
    <CareerChatPanelProvider value={chatPanelContextValue}>
      <CareerSidebarProvider value={sidebarContextValue}>
        {children}
      </CareerSidebarProvider>
    </CareerChatPanelProvider>
  );
};
