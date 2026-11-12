import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerOpenForms } from "@/hooks/career/useCareerOpenForms";
import type { SimulationCardRequest } from "@/lib/career/simulation/session";
import CareerCompanyJobsDrawer from "./watchlist/CareerCompanyJobsDrawer";
import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/router";
import { useQueryClient } from "@tanstack/react-query";
import type {
  CareerInterviewProgress,
  CareerInternalOpportunityCallRequest,
  CareerMessagePayload,
  CareerOpportunityFeedbackFollowUpTrigger,
  CareerOpportunityRun,
  SessionResponse,
} from "@/components/career/types";
import {
  CareerChatPanelProvider,
  type CareerCallContextValue,
  type CareerChatPanelCoreContextValue,
} from "./CareerChatPanelContext";
import {
  CareerSidebarProvider,
  type CareerCompanyFollowActionResult,
  type CareerCompanyFollowContextValue,
  type CareerHistoryContextValue,
  type CareerProfileContextValue,
  type CareerWorkspaceContextValue,
} from "./CareerSidebarContext";
import { useEventCallback } from "@/hooks/useEventCallback";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { useCareerChat } from "@/hooks/career/useCareerChat";
import { useCareerChatAutoScroll } from "@/hooks/career/useCareerChatAutoScroll";
import { useCareerMessageHistory } from "@/hooks/career/useCareerMessageHistory";
import { getCareerBrowserTimeZone } from "@/lib/career/requestTimeZone";
import { useCareerOnboardingProgress } from "@/hooks/career/useCareerOnboardingProgress";
import { useCareerOnboardingVoice } from "@/hooks/career/useCareerOnboardingVoice";
import { useCareerOpportunityRunSync } from "@/hooks/career/useCareerOpportunityRunSync";
import { useCareerProfile } from "@/hooks/career/useCareerProfile";
import { useCareerTalentInsights } from "@/hooks/career/useCareerTalentInsights";
import { useCareerTalentContexts } from "@/hooks/career/useCareerTalentContexts";
import { useCareerTalentPreferences } from "@/hooks/career/useCareerTalentPreferences";
import { useCareerTalentSettings } from "@/hooks/career/useCareerTalentSettings";
import { useCareerSession } from "@/hooks/career/useCareerSession";
import { useCareerSavedLocale } from "@/hooks/career/useCareerSavedLocale";
import {
  isGmailCareerHistoryAnalysisRunning,
  useGmailIntegration,
} from "@/hooks/career/useGmailIntegration";
import { getErrorMessage, toUiMessage } from "@/hooks/career/careerHelpers";
import { useCareerHistoryState } from "@/hooks/career/useCareerHistoryState";
import {
  useCareerLiveSync,
  type CareerLiveSyncScope,
} from "@/hooks/career/useCareerLiveSync";
import { useCareerRuntimeActions } from "@/hooks/career/useCareerRuntimeActions";
import {
  useCareerAutomaticSessionReengagement,
  useCareerSessionReengagementState,
  type SessionReengagementPayload,
} from "@/hooks/career/useCareerSessionReengagement";
import { showOpportunityDiscoveryStartedToast } from "@/hooks/career/opportunityDiscoveryToast";
import { extractOpportunityRunMarkers } from "@/lib/opportunityDiscovery/messageMarker";
import {
  TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST,
  type TalentUserChatMessageType,
} from "@/lib/talentOnboarding/onboarding";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import { resolveCareerInterviewProgress } from "@/lib/career/onboardingInterviewProgress";
import {
  getCareerConversationStarter,
  type CareerConversationStarterId,
  type CareerConversationStarterMode,
} from "@/lib/career/prompts/conversationStarters";
import type { CareerCoachingActivity } from "@/lib/career/careerCoachingActivitySchema";
import type { CareerCoachingActivityUiAction } from "./chat/CareerCoachingActivityCard";
import type { CareerOpportunityMention } from "@/lib/career/opportunityMentionText";
import { useMessages } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import type { CareerWorkspaceTab } from "./CareerWorkspaceNav";
import ProfileSourceApplyConfirmModal, {
  type ProfileSourceApplyConfirmMode,
} from "./profile/ProfileSourceApplyConfirmModal";
import {
  clearPendingProfileSourceApplyConfirmation,
  hasPendingProfileSourceApplyConfirmation,
} from "@/lib/talentCapture/client";

const getCompletedOpportunityRunRefreshKey = (
  run: CareerOpportunityRun | null
) => {
  if (!run || run.inputLocked) return null;
  if (
    run.status !== "completed" &&
    run.status !== "partial" &&
    run.status !== "failed"
  ) {
    return null;
  }
  return `${run.id}:${run.status}:${run.completedAt ?? "terminal"}`;
};

const CAREER_COMPANY_FOLLOW_UP_DELAY_MS = 15_000;
const getDevCurrentDataJobPostingRecommendationPrompt = (
  t: ReturnType<typeof useCareerT>
) =>
  t(
    "career.common.career_flow_provider.0cjev5a",
    "지금까지 저장된 내 프로필, 선호, 최근 피드백 데이터를 기준으로 지금 검토할 만한 공개 채용 포지션을 추천해줘. 새로운 장기 선호는 저장하지 말고, 현재 데이터 기반으로 한 번만 찾아줘."
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
  talentBrief?: unknown;
  talentMemories?: unknown;
  talentContextsUpdatedAt?: unknown;
};

export const CareerFlowProvider = ({
  activeTab,
  children,
  emailOnboardingToken,
  initialChatDraft,
  initialChatDraftKey,
  initialChatOpportunityMention,
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
  initialChatOpportunityMention?: CareerOpportunityMention | null;
  inviteToken?: string | null;
  mail?: string | null;
  onOpenSettings: () => void;
  settingsDataEnabled?: boolean;
}) => {
  const t = useCareerT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { locale } = useMessages();
  const sessionReengagementState = useCareerSessionReengagementState();
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
  const gmailIntegration = useGmailIntegration(userId);
  const { fetchWithAuth } = useCareerApi();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeCompanyRoleCount, setActiveCompanyRoleCount] = useState(0);
  const [opportunityRun, setOpportunityRun] =
    useState<CareerOpportunityRun | null>(null);
  const [unlinkedOpportunityRuns, setUnlinkedOpportunityRuns] = useState<
    CareerOpportunityRun[]
  >([]);
  const [preparedChatDraft, setPreparedChatDraft] = useState<{
    key: string;
    opportunityMention: CareerOpportunityMention;
    text: string;
  } | null>(null);
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
  const [profileSourceApplyConfirmMode, setProfileSourceApplyConfirmMode] =
    useState<ProfileSourceApplyConfirmMode | null>(null);
  const [profileSourceApplyPending, setProfileSourceApplyPending] =
    useState(false);
  const completedOpportunityRunRefreshRef = useRef<string | null>(null);
  const gmailAnalysisMessageRefreshRef = useRef<string | null>(null);
  const gmailAnalysisObservedRunningRef = useRef(false);
  const companyFollowUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const {
    actionMessageId: sessionReengagementActionMessageId,
    actionVersionRef: sessionReengagementActionVersionRef,
    automaticRunRef: sessionReengagementRef,
    clearAction: clearSessionReengagementAction,
    pending: sessionReengagementPending,
    readResponse: readSessionReengagementResponse,
    streamMessage: sessionReengagementStreamMessage,
    recommendationStatus: sessionReengagementRecommendationStatus,
    setActionMessageId: setSessionReengagementActionMessageId,
    setPending: setSessionReengagementPending,
    setRecommendationStatus: setSessionReengagementRecommendationStatus,
    setThinkingLogs: setSessionReengagementThinkingLogs,
    thinkingLogs: sessionReengagementThinkingLogs,
  } = sessionReengagementState;
  const wasReengagementPending = useRef(false);
  useEffect(() => {
    if (wasReengagementPending.current && !sessionReengagementPending) {
      void queryClient.invalidateQueries({ queryKey: ["career-action-items"] });
    }
    wasReengagementPending.current = sessionReengagementPending;
  }, [queryClient, sessionReengagementPending]);
  const [
    opportunityFeedbackFollowUpPending,
    setOpportunityFeedbackFollowUpPending,
  ] = useState(false);
  const [
    opportunityFeedbackFollowUpTrigger,
    setOpportunityFeedbackFollowUpTrigger,
  ] = useState<CareerOpportunityFeedbackFollowUpTrigger | null>(null);
  const refreshLatestHistoryOpportunitiesRef = useRef<
    ((roleId?: string | null) => void | Promise<void>) | null
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

  const handleCareerLogout = useCallback(async () => {
    await handleLogout();
    await router.replace("/");
  }, [handleLogout, router]);

  const {
    conversationId: sessionConversationId,
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
    opportunityLimit: 0,
    userId,
  });
  useCareerSavedLocale(sessionData?.preferredLocale);
  const {
    conversation: messageConversation,
    messages: persistedMessages,
    isPending: messageHistoryPending,
    hasOlderMessages,
    loadOlderMessages,
    loadingOlderMessages,
    invalidateMessageHistory,
    appendLatestMessagesToCache,
    removeMessagesFromCache,
    updateOpportunityRunsInCache,
  } = useCareerMessageHistory({
    conversationId: sessionConversationId,
    fetchWithAuth,
    enabled: !authLoading && Boolean(user),
    initialSessionPage: initialMessagePage,
    userId,
  });
  const conversationId =
    sessionConversationId ?? messageConversation?.id ?? null;
  const {
    onboardingChecklistProgress,
    applyProgress: applyOnboardingChecklistProgress,
    hydrateProgress: hydrateOnboardingChecklistProgress,
    resetProgress: resetOnboardingChecklistProgress,
  } = useCareerOnboardingProgress({
    userId,
  });
  const handleOnboardingChecklistProgressRefreshed = useCallback(
    (progress: unknown) => {
      applyOnboardingChecklistProgress(progress);
    },
    [applyOnboardingChecklistProgress]
  );
  const messageHistoryReady =
    Boolean(messageConversation) &&
    (!messageHistoryPending || persistedMessages.length > 0);
  const messageConversationCanResolveOnboarding =
    messageConversation?.stage === "completed";
  const sessionUnresolved =
    sessionPending || Boolean(sessionError && !sessionData);
  const chatSessionPending =
    sessionUnresolved &&
    (!messageHistoryReady || !messageConversationCanResolveOnboarding);

  const applyPersistedTalentPreferencesRef = useRef<
    ((preferences: unknown, updatedAt: unknown) => void) | null
  >(null);
  const applyPersistedTalentInsightsRef = useRef<
    ((insights: unknown, updatedAt: unknown) => void) | null
  >(null);
  const applyPersistedTalentContextsRef = useRef<
    | ((payload: {
        talentBrief?: unknown;
        talentContextsUpdatedAt?: unknown;
        talentMemories?: unknown;
      }) => void)
    | null
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
  const handleTalentContextsRefreshedFromChat = useCallback(
    (payload: {
      talentBrief?: unknown;
      talentContextsUpdatedAt?: unknown;
      talentMemories?: unknown;
    }) => {
      applyPersistedTalentContextsRef.current?.(payload);
    },
    []
  );
  const handleTalentProfileRefreshedFromChat = useCallback(
    (profile: SessionResponse["talentProfile"] | undefined) => {
      applyTalentProfileSnapshotRef.current?.(profile);
    },
    []
  );
  const handleOpportunityRecommendationsChanged = useCallback(
    (roleId?: string | null) => {
      return refreshLatestHistoryOpportunitiesRef.current?.(roleId);
    },
    []
  );
  const careerCoachingCallReadyRef = useRef<
    ((activity: CareerCoachingActivity) => Promise<void>) | null
  >(null);
  const handleCareerCoachingCallReady = useCallback(
    async (activity: CareerCoachingActivity) => {
      await careerCoachingCallReadyRef.current?.(activity);
    },
    []
  );
  const { data: openWork } = useCareerOpenForms(conversationId);
  const handleRequestAdmitted = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["career-open-forms", conversationId] }),
    [queryClient, conversationId]
  );

  const {
    stage,
    setStage,
    messages,
    scrollTick,
    sentMessageTick,
    appendMessage,
    removeMessages,
    chatPending,
    chatAdmissionPending,
    chatError,
    setChatError,
    assistantTyping,
    toolStatusMessage,
    activeThinkingLogs,
    activeRecommendationSearchStatus,
    cancelActiveChat,
    canStopChat,
    stopPending,
    onboardingWrapupPending: chatOnboardingWrapupPending,
    thinkingLogsByMessageId,
    enqueueAssistantTypewriter,
    applySessionConversation,
    sendChatMessage: sendChatMessageBase,
    regenerateOnboardingWrapup,
    resetChatState,
  } = useCareerChat({
    isOnboardingDone: Boolean(sessionData?.talentPreferences?.isOnboardingDone),
    user,
    conversationId,
    sessionPending: chatSessionPending,
    fetchWithAuth,
    onCareerCoachingCallReady: handleCareerCoachingCallReady,
    persistedMessages,
    onOpportunityRunChanged: setOpportunityRun,
    onOpportunityRecommendationsChanged:
      handleOpportunityRecommendationsChanged,
    onTalentPreferencesRefreshed: handleTalentPreferencesRefreshedFromChat,
    onTalentInsightsRefreshed: handleTalentInsightsRefreshedFromChat,
    onTalentContextsRefreshed: handleTalentContextsRefreshedFromChat,
    onOnboardingChecklistProgressRefreshed:
      handleOnboardingChecklistProgressRefreshed,
    onTalentProfileRefreshed: handleTalentProfileRefreshedFromChat,
    onMessagesChanged: appendLatestMessagesToCache,
    onRequestAdmitted: handleRequestAdmitted,
    hasDurableWork: openWork?.canStop,
    hasActiveInputTurn: openWork?.hasActiveInputTurn,
  });

  const visibleUnlinkedOpportunityRuns = useMemo(() => {
    const linkedRunIds = new Set<string>();
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const marker of extractOpportunityRunMarkers(message.content)) {
        linkedRunIds.add(marker.runId.toLowerCase());
      }
    }

    return unlinkedOpportunityRuns.filter(
      (run) => !linkedRunIds.has(run.id.toLowerCase())
    );
  }, [messages, unlinkedOpportunityRuns]);

  useEffect(() => {
    if (sessionData || !messageConversation) return;
    if (sessionPending && messageConversation.stage !== "completed") return;
    setStage(messageConversation.stage);
  }, [messageConversation, sessionData, sessionPending, setStage]);

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

  const prepareChatDraft = useCallback(
    (args: { opportunityMention: CareerOpportunityMention; text: string }) => {
      setPreparedChatDraft({
        ...args,
        key: `history-role-action:${args.opportunityMention.roleId}:${Date.now()}`,
      });
    },
    []
  );

  const showSameCompanyRoles = useCareerWorkspaceUiStore(
    (state) => state.setCompanyJobsOpportunity
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
  const historyDataEnabled = !authLoading && Boolean(userId);
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
    getHistoryOpportunityPageFilterState,
    isHistoryOpportunityPageFilterLoading,
    loadHistoryOpportunityByRoleId,
    loadMoreHistoryOpportunities,
    loadSavedStageHistoryOpportunityPages,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
    onChangeInternalHistoryOpportunityDecision,
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
    talentDocuments,
    applySessionProfile,
    handleProfileSubmit: handleProfileSubmitBase,
    handleProfileLinkChange,
    handleRemoveProfileLink,
    handleAddProfileLink,
    applyTalentProfileSnapshot,
    handleSaveTalentProfile,
    handleRefreshTalentProfileSources,
    handleUploadTalentDocument,
    handleUpdateTalentDocument,
    handleDeleteTalentDocument,
    handleCallNoteSaved,
    handleReadTalentCallNote,
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
    onOnboardingChecklistProgressRefreshed:
      handleOnboardingChecklistProgressRefreshed,
    user,
  });

  const {
    talentBrief,
    talentMemories,
    talentContextsUpdatedAt,
    talentContextsSavePending,
    talentContextsSaveError,
    talentContextsSaveInfo,
    talentMemoriesHasMore,
    talentMemoriesLoaded,
    talentMemoriesLoadPending,
    applySessionTalentContexts,
    applyPersistedTalentContexts,
    loadTalentMemories,
    mutateTalentContexts,
    resetTalentContextsState,
  } = useCareerTalentContexts({ fetchWithAuth, user });

  useEffect(() => {
    applyPersistedTalentPreferencesRef.current =
      applyPersistedTalentPreferences;
  }, [applyPersistedTalentPreferences]);
  useEffect(() => {
    applyPersistedTalentInsightsRef.current = applyPersistedTalentInsights;
  }, [applyPersistedTalentInsights]);
  useEffect(() => {
    applyPersistedTalentContextsRef.current = applyPersistedTalentContexts;
  }, [applyPersistedTalentContexts]);
  useEffect(() => {
    applyTalentProfileSnapshotRef.current = applyTalentProfileSnapshot;
  }, [applyTalentProfileSnapshot]);

  const handleUpdateAccountProfile = useCallback(
    (profile: {
      email: string | null;
      name: string | null;
      user_id: string;
    }) => {
      applyTalentProfileSnapshot({
        talentUser: {
          user_id: profile.user_id || talentUser?.user_id || userId || "",
          email: profile.email,
          name: profile.name,
          profile_picture: talentUser?.profile_picture ?? null,
          headline: talentUser?.headline ?? null,
          bio: talentUser?.bio ?? null,
          location: talentUser?.location ?? null,
          current_location: talentUser?.current_location ?? null,
        },
        talentExperiences,
        talentEducations,
        talentExtras,
      });
    },
    [
      applyTalentProfileSnapshot,
      talentEducations,
      talentExperiences,
      talentExtras,
      talentUser,
      userId,
    ]
  );

  const {
    settingsLoading,
    settingsSaving,
    settingsError,
    settingsUpdatedAt,
    preferredLocale,
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

  const handleAccountSubscriptionsUpdated = useCallback(
    (args: {
      harperEnabled: boolean;
      preferences: Parameters<typeof applyPersistedTalentPreferences>[0];
      preferencesUpdatedAt: string | null;
    }) => {
      applyPersistedTalentPreferences(
        args.preferences,
        args.preferencesUpdatedAt
      );
      void onReloadTalentSettings();
    },
    [applyPersistedTalentPreferences, onReloadTalentSettings]
  );

  const isVoiceInteractionLocked =
    !user ||
    !conversationId ||
    chatSessionPending ||
    stage === "profile" ||
    profilePending ||
    Boolean(opportunityRun?.inputLocked);

  const sendChatMessage = useCallback(
    async (args: {
      channel?: "chat" | "voice";
      simulationAction?:SimulationCardRequest;
      formResponseMessageId?: number;
      coachingActivityAction?: {
        action: "start" | "end";
        activityMessageId: number;
        channel?: "chat" | "call";
        expectedRevision: number;
      };
      conversationStarterId?: CareerConversationStarterId;
      text: string;
      link?: string;
      messageType?: TalentUserChatMessageType;
      opportunityMentions?: CareerOpportunityMention[];
      viewedRoleId?: string;
      onError?: () => void;
      onSuccess?: () => void;
    }) => {
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

  const handleDeleteMessage = useEventCallback(
    async (messageId: string | number): Promise<boolean> => {
      const parsedMessageId = Number(messageId);
      if (
        !conversationId ||
        !Number.isSafeInteger(parsedMessageId) ||
        parsedMessageId <= 0
      ) {
        return false;
      }

      setChatError("");
      try {
        const response = await fetchWithAuth("/api/talent/messages", {
          method: "DELETE",
          body: JSON.stringify({
            conversationId,
            messageId: parsedMessageId,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;

        if (!response.ok) {
          throw new Error(
            getErrorMessage(
              payload,
              t("ui.1xeaoum", "메시지를 삭제하지 못했습니다.")
            )
          );
        }

        const hiddenFormId = typeof payload.hiddenFormId === "number" ? payload.hiddenFormId : null;
        const deletedMessageIds = Array.isArray(payload.deletedMessageIds)
          ? payload.deletedMessageIds.filter((id): id is number => typeof id === "number")
          : [parsedMessageId];
        const removedIds = hiddenFormId
          ? [...new Set([parsedMessageId, ...[...messages, ...persistedMessages].filter((message) => message.careerForm?.formId === hiddenFormId || message.formResponse?.formId === hiddenFormId).map((message) => Number(message.id))])]
          : deletedMessageIds;
        removeMessagesFromCache(removedIds);
        removeMessages(removedIds);
        return true;
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : t("ui.1xeaoum", "메시지를 삭제하지 못했습니다.")
        );
        return false;
      }
    }
  );

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
        if ("talentBrief" in payload || "talentMemories" in payload) {
          handleTalentContextsRefreshedFromChat({
            talentBrief: payload.talentBrief,
            talentContextsUpdatedAt:
              payload.talentContextsUpdatedAt ?? payload.insightUpdatedAt,
            talentMemories: payload.talentMemories,
          });
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
      handleTalentContextsRefreshedFromChat,
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
    activeMockInterviewDisplay,
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
    isVoiceToolExecuting,
    voiceActiveToolNames,
    idleWarningVisible,
    acknowledgeIdleWarning,
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
    canForceCompleteOnboarding: stage === "chat",
    onboardingChecklistProgress,
    onSendChatMessage: sendChatMessage,
    onOpportunityRunChanged: setOpportunityRun,
    onTalentPreferencesRefreshed: handleTalentPreferencesRefreshedFromChat,
    onTalentInsightsRefreshed: handleTalentInsightsRefreshedFromChat,
    onTalentContextsRefreshed: handleTalentContextsRefreshedFromChat,
    onOnboardingChecklistProgressRefreshed:
      handleOnboardingChecklistProgressRefreshed,
    onTalentProfileRefreshed: handleTalentProfileRefreshedFromChat,
    onPendingInternalOpportunityCallRequestChanged:
      replacePendingInternalOpportunityCallRequest,
    onPendingInternalOpportunityCallRequestsChanged:
      replacePendingInternalOpportunityCallRequests,
    onCallNoteSaved: handleCallNoteSaved,
    appendMessage,
    setChatError,
    setStage,
    talentInsights,
    enqueueAssistantTypewriter,
    onMessagesChanged: appendLatestMessagesToCache,
  });

  const handleStartCallModeFromUi = useEventCallback(
    async (args?: Parameters<typeof handleStartCallMode>[0]) => {
      clearSessionReengagementAction();
      return handleStartCallMode(args);
    }
  );

  useEffect(() => {
    careerCoachingCallReadyRef.current = async (activity) => {
      await handleStartCallModeFromUi({
        careerCoachingActivityMessageId: activity.messageId,
        careerCoachingActivityRevision: activity.revision,
      });
    };
    return () => {
      careerCoachingCallReadyRef.current = null;
    };
  }, [handleStartCallModeFromUi]);

  const handleStartConversationStarter = useCallback(
    async (args: {
      mode: CareerConversationStarterMode;
      starterId: CareerConversationStarterId;
    }) => {
      clearSessionReengagementAction();
      const starter = getCareerConversationStarter(args.starterId, locale);
      if (!starter) return false;

      if (starter.id === "career_coaching") {
        await sendChatMessage({ text: starter.chatMessage });
        return true;
      }

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

  const handleUpdateCareerCoachingActivity = useCallback(
    async (args: {
      action: CareerCoachingActivityUiAction;
      activity: CareerCoachingActivity;
    }) => {
      if (!conversationId) return false;
      const { action, activity } = args;
      const text =
        action.action === "start"
          ? action.channel === "call"
            ? t("career.coaching.action_start_call", "“{topic}” 주제로 코칭 대화를 통화로 시작할게요.", { values: { topic: activity.topic } })
            : t("career.coaching.action_start_chat", "채팅으로 진행할게요.")
          : activity.status === "suggested"
            ? t("career.coaching.action_dismiss", "이 코칭 제안은 지금은 넘길게요.")
            : t("career.coaching.action_end", "이 코칭 대화는 여기서 마칠게요.");
      await sendChatMessage({
        coachingActivityAction: {
          action: action.action,
          activityMessageId: activity.messageId,
          ...(action.action === "start" ? { channel: action.channel } : {}),
          expectedRevision: activity.revision,
        },
        text,
      });
      return true;
    },
    [conversationId, sendChatMessage, t]
  );

  const handleRequestMoreOpenPositions = useCallback(async () => {
    clearSessionReengagementAction();
    await sendChatMessage({
      messageType: TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST,
      text: t(
        "career.common.career_flow_provider.request_more_open_positions",
        "다른 오픈 포지션 더 추천해줘"
      ),
    });
    return true;
  }, [clearSessionReengagementAction, sendChatMessage, t]);

  const logCompanyEvent = useCareerLogEvent();
  const handleUpdateCompanyFollow = useCallback(
    async (args: {
      action: "follow" | "unfollow";
      companyDbId: number;
      companyWorkspaceId?: string | null;
      source?: string | null;
    }): Promise<CareerCompanyFollowActionResult | null> => {
      if (!userId) return null;

      logCompanyEvent(`click_company_${args.action}`, { companyId: args.companyDbId });
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
      logCompanyEvent,
      scheduleCompanyFollowUp,
      setChatError,
      t,
      userId,
    ]
  );

  const handleProfileSubmit = useCallback(async () => {
    const saved = await handleProfileSubmitBase(handleProfileSubmitSuccess);
    if (saved) {
      setProfileSourceApplyConfirmMode("saved_sources");
    }
  }, [handleProfileSubmitBase, handleProfileSubmitSuccess]);

  useEffect(() => {
    if (!userId || !hasPendingProfileSourceApplyConfirmation()) return;
    const timeoutId = window.setTimeout(
      () => setProfileSourceApplyConfirmMode("saved_sources"),
      0
    );
    return () => window.clearTimeout(timeoutId);
  }, [userId]);

  const closeProfileSourceApplyConfirmation = useCallback(() => {
    if (profileSourceApplyPending) return;
    clearPendingProfileSourceApplyConfirmation();
    setProfileSourceApplyConfirmMode(null);
  }, [profileSourceApplyPending]);

  const confirmProfileSourceApply = useCallback(async () => {
    if (profileSourceApplyPending) return;
    setProfileSourceApplyPending(true);
    const applied = await handleRefreshTalentProfileSources();
    setProfileSourceApplyPending(false);
    if (applied) {
      clearPendingProfileSourceApplyConfirmation();
      setProfileSourceApplyConfirmMode(null);
    }
  }, [handleRefreshTalentProfileSources, profileSourceApplyPending]);

  const hydrateSession = useCallback(
    (payload: SessionResponse) => {
      applySessionConversation(payload);
      appendLatestMessagesToCache(payload.messages ?? []);
      applySessionProfile(payload);
      applySessionTalentPreferences(payload);
      applySessionTalentInsights(payload);
      applySessionTalentContexts(payload);
      hydrateOnboardingChecklistProgress(payload.onboardingChecklistProgress);
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
      setActiveCompanyRoleCount(
        Math.max(0, Number(payload.activeCompanyRoleCount ?? 0) || 0)
      );
      setOpportunityRun(payload.opportunityRun ?? null);
      setUnlinkedOpportunityRuns(payload.unlinkedOpportunityRuns ?? []);
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
      applySessionTalentContexts,
      applySessionTalentPreferences,
      applySessionPrompt,
      appendLatestMessagesToCache,
      hydrateHistoryOpportunityCounts,
      hydrateHistoryOpportunities,
      hydrateOnboardingChecklistProgress,
      replacePendingInternalOpportunityCallRequests,
    ]
  );

  const syncCareerWorkspace = useCallback(
    async (scopes: CareerLiveSyncScope[]) => {
      const refreshAll = scopes.includes("all");
      const refreshMessages = refreshAll || scopes.includes("messages");
      const refreshHistory = refreshAll || scopes.includes("opportunities");
      const refreshRuns = refreshAll || scopes.includes("runs");
      await Promise.all([
        refreshMessages ? invalidateMessageHistory() : Promise.resolve(),
        refreshHistory
          ? refreshLatestHistoryOpportunities()
          : Promise.resolve(),
        refreshRuns
          ? fetchWithAuth("/api/talent/opportunity-runs/latest")
              .then(async (response) => {
                const payload = (await response.json().catch(() => ({}))) as {
                  run?: CareerOpportunityRun | null;
                };
                if (response.ok) setOpportunityRun(payload.run ?? null);
              })
              .catch(() => undefined)
          : Promise.resolve(),
      ]);
    },
    [
      fetchWithAuth,
      invalidateMessageHistory,
      refreshLatestHistoryOpportunities,
      setOpportunityRun,
    ]
  );

  useCareerLiveSync({
    enabled: !authLoading && Boolean(userId),
    onSync: syncCareerWorkspace,
    userId,
  });

  useEffect(() => {
    if (isGmailCareerHistoryAnalysisRunning(gmailIntegration.analysisStatus)) {
      gmailAnalysisObservedRunningRef.current = true;
      return;
    }
    if (gmailIntegration.analysisStatus !== "completed") {
      gmailAnalysisObservedRunningRef.current = false;
      return;
    }

    const refreshKey = gmailIntegration.analysisUpdatedAt;
    if (
      !gmailAnalysisObservedRunningRef.current ||
      !refreshKey ||
      gmailAnalysisMessageRefreshRef.current === refreshKey
    ) {
      return;
    }

    gmailAnalysisObservedRunningRef.current = false;
    gmailAnalysisMessageRefreshRef.current = refreshKey;
    void loadSession({ force: true }).then((payload) => {
      if (payload) {
        hydrateSession(payload);
        return;
      }
      void invalidateMessageHistory();
    });
  }, [
    gmailIntegration.analysisStatus,
    gmailIntegration.analysisUpdatedAt,
    hydrateSession,
    invalidateMessageHistory,
    loadSession,
  ]);

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
      const actionVersion = sessionReengagementActionVersionRef.current;
      const isCurrentAction = () => sessionReengagementActionVersionRef.current === actionVersion;
      setSessionReengagementPending(true);
      setSessionReengagementThinkingLogs([]);
      setSessionReengagementRecommendationStatus(null);
      setChatError("");

      try {
        const response = await fetchWithAuth(
          "/api/talent/session/reengagement",
          {
            method: "POST",
            headers: { Accept: "text/event-stream" },
            body: JSON.stringify({
              conversationId,
              timeZone: getCareerBrowserTimeZone(),
              userInitiated: true,
            }),
          }
        );
        const payload = await readSessionReengagementResponse(
          response, appendLatestMessagesToCache, isCurrentAction
        );
        if (!isCurrentAction()) return false;

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
        if ("talentBrief" in payload || "talentMemories" in payload) {
          handleTalentContextsRefreshedFromChat(payload);
        }
        if (typeof payload.hiddenExpiredExternalOpportunityCount === "number" && payload.hiddenExpiredExternalOpportunityCount > 0) {
          await refreshLatestHistoryOpportunities();
        }

        const assistantMessages = Array.isArray(payload.assistantMessages)
          ? payload.assistantMessages
          : payload.assistantMessage
            ? [payload.assistantMessage]
            : [];

        if (assistantMessages.length > 0) {
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
        if (isCurrentAction()) {
          setSessionReengagementPending(false);
          setSessionReengagementThinkingLogs([]);
          setSessionReengagementRecommendationStatus(null);
        }
      }
    }, [
      clearSessionReengagementAction,
      conversationId,
      appendLatestMessagesToCache,
      readSessionReengagementResponse,
      sessionReengagementActionVersionRef,
      fetchWithAuth,
      handleTalentInsightsRefreshedFromChat,
      handleTalentContextsRefreshedFromChat,
      refreshLatestHistoryOpportunities,
      handleTalentPreferencesRefreshedFromChat,
      hydrateSession,
      loadSession,
      sessionReengagementPending,
      sessionReengagementTestPending,
      setChatError,
      setSessionReengagementActionMessageId,
      setSessionReengagementPending,
      setSessionReengagementRecommendationStatus,
      setSessionReengagementThinkingLogs,
      stage,
      t,
    ]);

  const handleRunSessionReengagementTest = useCallback(
    async (options?: { deleteRecentMessages?: boolean }): Promise<void> => {
      if (
        !conversationId ||
        sessionReengagementTestPending ||
        stage === "profile"
      ) {
        return;
      }

      const deleteRecentMessages = options?.deleteRecentMessages !== false;
      if (!deleteRecentMessages) {
        clearSessionReengagementAction();
        setSessionReengagementPending(true);
      }
      const actionVersion = sessionReengagementActionVersionRef.current;
      const isCurrentAction = () => sessionReengagementActionVersionRef.current === actionVersion;
      setSessionReengagementTestPending(true);
      setChatError("");
      try {
        const response = await fetchWithAuth(
          "/api/talent/session/reengagement",
          {
            method: "POST",
            ...(deleteRecentMessages ? {} : { headers: { Accept: "text/event-stream" } }),
            body: JSON.stringify({
              conversationId,
              ...(deleteRecentMessages
                ? { devDeleteRecentMessages: true }
                : { devForce: true, timeZone: getCareerBrowserTimeZone() }),
            }),
          }
        );
        const payload = deleteRecentMessages
          ? ((await response.json().catch(() => ({}))) as SessionReengagementPayload)
          : await readSessionReengagementResponse(response, appendLatestMessagesToCache, isCurrentAction);
        if (!deleteRecentMessages && !isCurrentAction()) return;

        if (!response.ok) {
          throw new Error(
            getErrorMessage(
              payload,
              // career-i18n-skip-next-line: dev controls text is intentionally Korean-only.
              deleteRecentMessages
                ? "최근 메시지 삭제에 실패했습니다."
                : "12시간 인사 테스트 실행에 실패했습니다."
            )
          );
        }
        if (deleteRecentMessages) {
          removeMessagesFromCache(payload.deletedMessageIds ?? []);
          return;
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
        if ("talentBrief" in payload || "talentMemories" in payload) {
          handleTalentContextsRefreshedFromChat(payload);
        }
        if (typeof payload.hiddenExpiredExternalOpportunityCount === "number" && payload.hiddenExpiredExternalOpportunityCount > 0) {
          await refreshLatestHistoryOpportunities();
        }
      } catch (error) {
        // career-i18n-skip-next-line: dev controls text is intentionally Korean-only.
        setChatError(
          error instanceof Error
            ? error.message
            : deleteRecentMessages
              ? "최근 메시지 삭제 중 오류가 발생했습니다."
              : "12시간 인사 테스트 실행 중 오류가 발생했습니다."
        );
      } finally {
        setSessionReengagementTestPending(false);
        if (!deleteRecentMessages && isCurrentAction()) {
          setSessionReengagementPending(false);
          setSessionReengagementThinkingLogs([]);
          setSessionReengagementRecommendationStatus(null);
        }
      }
    },
    [
      clearSessionReengagementAction,
      conversationId,
      appendLatestMessagesToCache,
      readSessionReengagementResponse,
      sessionReengagementActionVersionRef,
      fetchWithAuth,
      handleTalentInsightsRefreshedFromChat,
      handleTalentContextsRefreshedFromChat,
      refreshLatestHistoryOpportunities,
      handleTalentPreferencesRefreshedFromChat,
      removeMessagesFromCache,
      sessionReengagementTestPending,
      setChatError,
      setSessionReengagementPending,
      setSessionReengagementThinkingLogs,
      setSessionReengagementRecommendationStatus,
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
      resetTalentContextsState();
      resetOnboardingState();
      resetHistoryState();
      resetRuntimeActionsState();
      setActiveCompanyRoleCount(0);
      setUnlinkedOpportunityRuns([]);
      resetOnboardingChecklistProgress();
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
    resetTalentContextsState,
    resetTalentPreferencesState,
    resetSessionState,
    resetHistoryState,
    resetOnboardingChecklistProgress,
    replacePendingInternalOpportunityCallRequests,
    sessionReengagementRef,
    userId,
  ]);

  useEffect(() => {
    if (!userId || !sessionData) return;
    hydrateSession(sessionData);
  }, [hydrateSession, sessionData, userId]);

  useCareerAutomaticSessionReengagement({
    conversationId,
    appendAssistantMessages: appendLatestMessagesToCache,
    fetchWithAuth,
    onHistoryOpportunitiesChanged: refreshLatestHistoryOpportunities,
    onOpportunityRunChanged: setOpportunityRun,
    onTalentInsightsRefreshed: handleTalentInsightsRefreshedFromChat,
    onTalentContextsRefreshed: handleTalentContextsRefreshedFromChat,
    onTalentPreferencesRefreshed: handleTalentPreferencesRefreshedFromChat,
    sessionPending,
    stage,
    state: sessionReengagementState,
    userId,
  });

  useCareerOpportunityRunSync({
    conversationId,
    fetchWithAuth,
    hydrateSession,
    loadSessionForCompletedOpportunityRun,
    messages,
    opportunityRun,
    sessionPending,
    setOpportunityRun,
    setUnlinkedOpportunityRuns,
    stage,
    unlinkedOpportunityRuns: visibleUnlinkedOpportunityRuns,
    updateOpportunityRunsInCache,
    userId,
  });

  const historyLoading =
    historyOpportunities.length === 0 &&
    (historyInitialLoading || (!historyLoaded && activeTab === "history"));

  const timelineMessages = useMemo(
    () => sessionReengagementStreamMessage ? [...messages, sessionReengagementStreamMessage] : messages,
    [messages, sessionReengagementStreamMessage]
  );

  useCareerChatAutoScroll({
    preserveReadingPosition: messages.some(m=>m.applicationActivity || m.messageType === "application_activity" || m.simulationSession),
    conversationId,
    initialScrollPending: chatSessionPending,
    messageCount: timelineMessages.length,
    sentMessageTick,
    scrollRef,
    scrollTick: scrollTick + (sessionReengagementStreamMessage?.content.length ?? 0),
  });

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
  const workspaceDataLoading =
    sessionUnresolved || sessionDataNeedsLocalHydration;

  const progressPercent = Math.round(
    (answeredCount / TALENT_INTERVIEW_FINAL_STEP) * 100
  );
  const interviewProgress: CareerInterviewProgress = useMemo(
    () =>
      resolveCareerInterviewProgress({
        canForceComplete: stage === "chat",
        checklistProgress: onboardingChecklistProgress,
        isOnboardingDone,
        talentInsights,
        userChatCount,
      }),
    [
      isOnboardingDone,
      onboardingChecklistProgress,
      stage,
      talentInsights,
      userChatCount,
    ]
  );

  const handleSimulationAction = useEventCallback(
    async (action: SimulationCardRequest, text: string) => {
      const source = messages.find(
        (message) => Number(message.id) === action.sessionMessageId,
      );
      const offer = source?.applicationStartOffer;
      let session = source?.simulationSession;
      if (!offer && !session) {
        const response = await fetchWithAuth(
          `/api/talent/simulation?sessionMessageId=${action.sessionMessageId}`,
        );
        if (response.ok) session = (await response.json()).session ?? undefined;
      }
      const roleName = offer?.roleName ?? session?.roleName;
      const roleId =
        offer?.roleId ??
        session?.activity?.roleId ??
        (session?.roleRef.startsWith("role:")
          ? session.roleRef.slice(5)
          : undefined);
      const documentId =
        action.documentId ?? offer?.selectedDocumentId ?? session?.documentId;
      const documentLabel = t(
        "career.application.review.resumeFile",
        "이력서 열기",
      );
      await sendChatMessage({
        text: [
          roleName,
          text,
          documentId ? `[${documentLabel}](documentId:${documentId})` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        ...(roleName && roleId
          ? { opportunityMentions: [{ roleId, label: roleName }] }
          : {}),
      });
    },
  );

  const chatPanelContextValue: CareerChatPanelCoreContextValue = useMemo(
    () => ({
      user,
      conversationId,
      stage,
      messages: timelineMessages,
      scrollRef,
      hasOlderMessages,
      loadingOlderMessages,
      authLoading,
      authPending,
      authError,
      authInfo,
      sessionPending: chatSessionPending,
      sessionError,
      isOnboardingDone,
      resumeFile,
      profileLinks,
      profilePending,
      profileError,
      chatError,
      assistantTyping: assistantTyping || Boolean(sessionReengagementStreamMessage),
      toolStatusMessage,
      activeThinkingLogs,
      activeRecommendationSearchStatus,
      onCancelActiveRecommendationSearch: cancelActiveChat,
      onCancelChat: cancelActiveChat,
      canStopChat,
      stopPending,
      initialChatDraft:
        preparedChatDraft?.text.trim() || initialChatDraft?.trim() || undefined,
      initialChatDraftKey:
        preparedChatDraft?.key || initialChatDraftKey?.trim() || undefined,
      initialChatOpportunityMention:
        preparedChatDraft?.opportunityMention ??
        initialChatOpportunityMention ??
        undefined,
      initialChatDraftReplace: Boolean(preparedChatDraft),
      onboardingWrapupPending,
      thinkingLogsByMessageId,
      chatPending,
      chatAdmissionPending,
      sessionReengagementPending,
      sessionReengagementThinkingLogs,
      sessionReengagementRecommendationStatus,
      sessionReengagementActionMessageId,
      opportunityFeedbackFollowUpPending,
      opportunityFeedbackFollowUpTrigger,
      opportunityRun,
      unlinkedOpportunityRuns: visibleUnlinkedOpportunityRuns,
      opportunitySearchLocked: Boolean(opportunityRun?.inputLocked),
      historyUpdatingOpportunityIds,
      emailOnboardingToken: emailOnboardingToken?.trim() || undefined,
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
      onPrepareChatDraft: prepareChatDraft,
      onShowSameCompanyRoles: showSameCompanyRoles,
      onStartConversationStarter: handleStartConversationStarter,
      onSimulationAction: handleSimulationAction,
      onUpdateCareerCoachingActivity: handleUpdateCareerCoachingActivity,
      onRunSessionReengagement: handleRunSessionReengagement,
      onUpdateHistoryOpportunityFeedback,
      onDeleteMessage: conversationId ? handleDeleteMessage : undefined,
      onLoadOlderMessages: handleLoadOlderMessages,
      onRegenerateOnboardingWrapup: regenerateOnboardingWrapup,
      forceCompletePending,
      interviewProgress,
      onForceCompleteOnboarding: handleForceCompleteOnboarding,
      showVoiceStartPrompt: !chatSessionPending && showVoiceStartPrompt,
      onUseChatOnly: handleUseChatOnly,
      onPauseOnboarding: handlePauseOnboarding,
      onSubmitOnboardingInterest: handleSubmitOnboardingInterest,
      onContinueOnboardingConversation: handleContinueOnboardingConversation,
      inputMode,
      onStartCallMode: handleStartCallModeFromUi,
    }),
    [
      assistantTyping,
      sessionReengagementStreamMessage,
      timelineMessages,
      activeThinkingLogs,
      activeRecommendationSearchStatus,
      cancelActiveChat,
      canStopChat,
      stopPending,
      emailOnboardingToken,
      onboardingWrapupPending,
      authLoading,
      authError,
      authInfo,
      authPending,
      chatError,
      chatPending,
      chatAdmissionPending,
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
      handleSimulationAction,
      handleUpdateCareerCoachingActivity,
      handleSubmitOnboardingInterest,
      handleUseChatOnly,
      inputMode,
      initialChatDraft,
      initialChatDraftKey,
      initialChatOpportunityMention,
      preparedChatDraft,
      prepareChatDraft,
      forceCompletePending,
      isOnboardingDone,
      interviewProgress,
      loadingOlderMessages,
      onUpdateHistoryOpportunityFeedback,
      handleDeleteMessage,
      regenerateOnboardingWrapup,
      onboardingBeginPending,
      callStartPending,
      callWrapUpPending,
      onboardingPausePending,
      opportunityRun,
      visibleUnlinkedOpportunityRuns,
      profileError,
      profileLinks,
      profilePending,
      resumeFile,
      setResumeFile,
      sendChatMessage,
      showSameCompanyRoles,
      sessionReengagementPending,
      sessionReengagementActionMessageId,
      sessionError,
      chatSessionPending,
      showVoiceStartPrompt,
      stage,
      user,
    ]
  );

  const callContextValue: CareerCallContextValue = useMemo(
    () => ({
      mockInterviewDisplay: activeMockInterviewDisplay,
      callConnectionStatus: connectionStatus,
      callTranscriptEntries,
      isAssistantSpeaking,
      isVoiceToolExecuting,
      voiceActiveToolNames,
      idleWarningVisible,
      onAcknowledgeIdleWarning: acknowledgeIdleWarning,
      liveUserTranscriptPlacement,
      onEndCallMode: handleEndCallMode,
      onToggleVoiceMute: handleToggleVoiceMute,
      voiceMuted,
      voiceTranscript,
    }),
    [
      activeMockInterviewDisplay,
      callTranscriptEntries,
      connectionStatus,
      handleEndCallMode,
      handleToggleVoiceMute,
      isAssistantSpeaking,
      isVoiceToolExecuting,
      voiceActiveToolNames,
      idleWarningVisible,
      acknowledgeIdleWarning,
      liveUserTranscriptPlacement,
      voiceMuted,
      voiceTranscript,
    ]
  );

  const workspaceContextValue: CareerWorkspaceContextValue = useMemo(
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
      pendingInternalOpportunityCallRequest,
      pendingInternalOpportunityCallRequests,
    }),
    [
      activeCompanyRoleCount,
      answeredCount,
      assistantTyping,
      callStartPending,
      chatPending,
      conversationId,
      forceCompletePending,
      handleCareerLogout,
      handleRequestMoreOpenPositions,
      handleRunCurrentDataJobPostingRecommendationTest,
      handleRunOnboardingCompletionTest,
      handleRunOpportunityDiscoveryTest,
      handleRunPeriodicOpportunityDiscoveryTest,
      handleRunSessionReengagementTest,
      handleStartCallModeFromUi,
      handleStartConversationStarter,
      handleUseChatOnly,
      isOnboardingDone,
      onOpenSettings,
      opportunityRun,
      opportunityRunTriggerPending,
      pendingInternalOpportunityCallRequest,
      pendingInternalOpportunityCallRequests,
      progressPercent,
      sessionReengagementTestPending,
      stage,
      user,
      userChatCount,
      workspaceDataLoading,
    ]
  );

  const companyFollowContextValue: CareerCompanyFollowContextValue = useMemo(
    () => ({
      onUpdateCompanyFollow: handleUpdateCompanyFollow,
      user,
    }),
    [handleUpdateCompanyFollow, user]
  );

  const historyContextValue: CareerHistoryContextValue = useMemo(
    () => ({
      historyOpportunityCounts,
      historyOpportunities,
      historyLoading,
      historyLoadingMore,
      hasMoreHistoryOpportunities,
      historyUpdatingOpportunityIds,
      historyUpdateError,
      onLoadMoreHistoryOpportunities: loadMoreHistoryOpportunities,
      getHistoryOpportunityPageFilterState,
      isHistoryOpportunityPageFilterLoading,
      onLoadSavedStageHistoryOpportunityPages:
        loadSavedStageHistoryOpportunityPages,
      onLoadHistoryOpportunityByRoleId: loadHistoryOpportunityByRoleId,
      onRefreshHistoryOpportunities: refreshLatestHistoryOpportunities,
      onChangeInternalHistoryOpportunityDecision,
      onUpdateHistoryOpportunityFeedback,
      onUpdateHistoryOpportunitySavedStage,
      onUpdateHistoryOpportunityTalentMemo,
      onMarkHistoryOpportunityViewed,
      onMarkHistoryOpportunityClicked,
    }),
    [
      hasMoreHistoryOpportunities,
      historyLoading,
      historyLoadingMore,
      historyOpportunities,
      historyOpportunityCounts,
      historyUpdateError,
      historyUpdatingOpportunityIds,
      getHistoryOpportunityPageFilterState,
      isHistoryOpportunityPageFilterLoading,
      loadHistoryOpportunityByRoleId,
      loadMoreHistoryOpportunities,
      loadSavedStageHistoryOpportunityPages,
      refreshLatestHistoryOpportunities,
      onChangeInternalHistoryOpportunityDecision,
      onMarkHistoryOpportunityClicked,
      onMarkHistoryOpportunityViewed,
      onUpdateHistoryOpportunityFeedback,
      onUpdateHistoryOpportunitySavedStage,
      onUpdateHistoryOpportunityTalentMemo,
    ]
  );

  const profileContextValue: CareerProfileContextValue = useMemo(
    () => ({
      user,
      resumeFile,
      savedResumeFileName,
      savedResumeStoragePath,
      savedResumeDownloadUrl,
      talentDocuments,
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
      onUploadTalentDocument: handleUploadTalentDocument,
      onUpdateTalentDocument: handleUpdateTalentDocument,
      onDeleteTalentDocument: handleDeleteTalentDocument,
      onReadTalentCallNote: handleReadTalentCallNote,
      onUpdateAccountProfile: handleUpdateAccountProfile,
      onRefreshTalentProfileSources: handleRefreshTalentProfileSources,
      talentProfile: {
        talentUser,
        talentExperiences,
        talentEducations,
        talentExtras,
      },
      talentPreferences,
      talentInsights,
      talentBrief,
      talentMemories,
      talentContextsUpdatedAt,
      talentContextsSavePending,
      talentContextsSaveError,
      talentContextsSaveInfo,
      talentMemoriesHasMore,
      talentMemoriesLoaded,
      talentMemoriesLoadPending,
      loadTalentMemories,
      mutateTalentContexts,
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
      onAccountSubscriptionsUpdated: handleAccountSubscriptionsUpdated,
      onTalentInsightsChange,
      onSaveTalentInsights,
      onResetTalentInsights,
      settingsLoading,
      settingsSaving,
      settingsError,
      settingsUpdatedAt,
      preferredLocale,
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
      blockedCompanies,
      engagementTypes,
      handleAddProfileLink,
      handleAccountSubscriptionsUpdated,
      handleDeleteTalentDocument,
      handleReadTalentCallNote,
      handleProfileLinkChange,
      handleRemoveProfileLink,
      handleRefreshTalentProfileSources,
      handleSaveTalentProfile,
      handleUpdateTalentDocument,
      handleUploadTalentDocument,
      handleUpdateAccountProfile,
      hasUnsavedTalentInsightsChanges,
      hasUnsavedTalentPreferencesChanges,
      hasUnsavedTalentSettingsChanges,
      onAddBlockedCompany,
      onEngagementTypesChange,
      onProfileVisibilityChange,
      onReloadTalentSettings,
      onRemoveBlockedCompany,
      onResetTalentInsights,
      onResetTalentPreferences,
      onResetTalentSettings,
      onSaveTalentInsights,
      onSaveTalentPreferences,
      onSaveTalentSettings,
      onTalentInsightsChange,
      onTalentPreferencesChange,
      profileLinks,
      preferredLocale,
      profileVisibility,
      profileSaveError,
      profileSaveInfo,
      profileSavePending,
      resumeFile,
      savedProfileLinks,
      savedResumeDownloadUrl,
      savedResumeFileName,
      savedResumeStoragePath,
      settingsError,
      settingsLoading,
      settingsSaving,
      settingsUpdatedAt,
      setResumeFile,
      talentInsights,
      talentInsightsSaveError,
      talentInsightsSaveInfo,
      talentInsightsSavePending,
      talentInsightsUpdatedAt,
      talentBrief,
      talentMemories,
      talentContextsUpdatedAt,
      talentContextsSavePending,
      talentContextsSaveError,
      talentContextsSaveInfo,
      talentMemoriesHasMore,
      talentMemoriesLoaded,
      talentMemoriesLoadPending,
      loadTalentMemories,
      mutateTalentContexts,
      talentPreferences,
      talentPreferencesSaveError,
      talentPreferencesSaveInfo,
      talentPreferencesSavePending,
      talentPreferencesUpdatedAt,
      talentEducations,
      talentDocuments,
      talentExperiences,
      talentExtras,
      talentUser,
      user,
    ]
  );

  return (
    <CareerChatPanelProvider
      callValue={callContextValue}
      value={chatPanelContextValue}
    >
      <CareerSidebarProvider
        companyFollowValue={companyFollowContextValue}
        historyValue={historyContextValue}
        profileValue={profileContextValue}
        value={workspaceContextValue}
      >
        {children}
        <CareerCompanyJobsDrawer />
        <ProfileSourceApplyConfirmModal
          mode={profileSourceApplyConfirmMode}
          pending={profileSourceApplyPending}
          onCancel={closeProfileSourceApplyConfirmation}
          onConfirm={confirmProfileSourceApply}
        />
      </CareerSidebarProvider>
    </CareerChatPanelProvider>
  );
};
