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
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { useCareerChat } from "@/hooks/career/useCareerChat";
import { useCareerChatAutoScroll } from "@/hooks/career/useCareerChatAutoScroll";
import { useCareerMessageHistory } from "@/hooks/career/useCareerMessageHistory";
import { useCareerOnboardingVoice } from "@/hooks/career/useCareerOnboardingVoice";
import { useCareerOpportunityRunSync } from "@/hooks/career/useCareerOpportunityRunSync";
import { useCareerProfile } from "@/hooks/career/useCareerProfile";
import { useCareerTalentInsights } from "@/hooks/career/useCareerTalentInsights";
import { useCareerTalentPreferences } from "@/hooks/career/useCareerTalentPreferences";
import { useCareerTalentSettings } from "@/hooks/career/useCareerTalentSettings";
import { useCareerSession } from "@/hooks/career/useCareerSession";
import { getErrorMessage, toUiMessage } from "@/hooks/career/careerHelpers";
import { useCareerHistoryState } from "@/hooks/career/useCareerHistoryState";
import { useCareerRuntimeActions } from "@/hooks/career/useCareerRuntimeActions";
import {
  useCareerAutomaticSessionReengagement,
  useCareerSessionReengagementState,
  type SessionReengagementPayload,
} from "@/hooks/career/useCareerSessionReengagement";
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
  const { fetchWithAuth } = useCareerApi();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeCompanyRoleCount, setActiveCompanyRoleCount] = useState(0);
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
  const companyFollowUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const {
    actionMessageId: sessionReengagementActionMessageId,
    automaticRunRef: sessionReengagementRef,
    clearAction: clearSessionReengagementAction,
    pending: sessionReengagementPending,
    recommendationStatus: sessionReengagementRecommendationStatus,
    setActionMessageId: setSessionReengagementActionMessageId,
    setPending: setSessionReengagementPending,
    setRecommendationStatus: setSessionReengagementRecommendationStatus,
    setThinkingLogs: setSessionReengagementThinkingLogs,
    thinkingLogs: sessionReengagementThinkingLogs,
  } = sessionReengagementState;
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
  const {
    conversation: messageConversation,
    messages: persistedMessages,
    isPending: messageHistoryPending,
    hasOlderMessages,
    loadOlderMessages,
    loadingOlderMessages,
    appendLatestMessagesToCache,
    removeMessagesFromCache,
  } = useCareerMessageHistory({
    conversationId: sessionConversationId,
    fetchWithAuth,
    enabled: !authLoading && Boolean(user),
    initialSessionPage: initialMessagePage,
    userId,
  });
  const conversationId =
    sessionConversationId ?? messageConversation?.id ?? null;
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
  const handleOpportunityRecommendationsChanged = useCallback(
    (roleId?: string | null) => {
      return refreshLatestHistoryOpportunitiesRef.current?.(roleId);
    },
    []
  );

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
    sessionPending: chatSessionPending,
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
          current_location: talentUser?.current_location ?? null,
          location: talentUser?.location ?? null,
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

  const isVoiceInteractionLocked =
    !user ||
    !conversationId ||
    chatSessionPending ||
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
    isVoiceToolExecuting,
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
      setSessionReengagementActionMessageId,
      setSessionReengagementPending,
      setSessionReengagementRecommendationStatus,
      setSessionReengagementThinkingLogs,
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
    sessionReengagementRef,
    userId,
  ]);

  useEffect(() => {
    if (!userId || !sessionData) return;
    hydrateSession(sessionData);
  }, [hydrateSession, sessionData, userId]);

  useCareerAutomaticSessionReengagement({
    conversationId,
    enqueueAssistantMessages,
    fetchWithAuth,
    onOpportunityRunChanged: setOpportunityRun,
    onTalentInsightsRefreshed: handleTalentInsightsRefreshedFromChat,
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
    opportunityRun,
    sessionPending,
    setOpportunityRun,
    stage,
    userId,
  });

  const historyLoading =
    historyOpportunities.length === 0 &&
    (historyInitialLoading || (!historyLoaded && activeTab === "history"));

  useCareerChatAutoScroll({
    conversationId,
    initialScrollPending: chatSessionPending,
    messageCount: messages.length,
    scrollRef,
    scrollTick,
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

  const chatPanelContextValue: CareerChatPanelCoreContextValue = useMemo(
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
      sessionPending: chatSessionPending,
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
      onStartConversationStarter: handleStartConversationStarter,
      onRunSessionReengagement: handleRunSessionReengagement,
      onUpdateHistoryOpportunityFeedback,
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
      activeThinkingLogs,
      activeRecommendationSearchStatus,
      cancelActiveRecommendationSearch,
      emailOnboardingToken,
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
      handleSubmitOnboardingInterest,
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
      chatSessionPending,
      showVoiceStartPrompt,
      stage,
      user,
    ]
  );

  const callContextValue: CareerCallContextValue = useMemo(
    () => ({
      callConnectionStatus: connectionStatus,
      callTranscriptEntries,
      isAssistantSpeaking,
      isVoiceToolExecuting,
      liveUserTranscriptPlacement,
      onEndCallMode: handleEndCallMode,
      onToggleVoiceMute: handleToggleVoiceMute,
      voiceMuted,
      voiceTranscript,
    }),
    [
      callTranscriptEntries,
      connectionStatus,
      handleEndCallMode,
      handleToggleVoiceMute,
      isAssistantSpeaking,
      isVoiceToolExecuting,
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
      isHistoryOpportunityPageFilterLoading,
      onLoadSavedStageHistoryOpportunityPages:
        loadSavedStageHistoryOpportunityPages,
      onLoadHistoryOpportunityByRoleId: loadHistoryOpportunityByRoleId,
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
      isHistoryOpportunityPageFilterLoading,
      loadHistoryOpportunityByRoleId,
      loadMoreHistoryOpportunities,
      loadSavedStageHistoryOpportunityPages,
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
      handleProfileLinkChange,
      handleRemoveProfileLink,
      handleRefreshTalentProfileSources,
      handleSaveTalentProfile,
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
      talentPreferences,
      talentPreferencesSaveError,
      talentPreferencesSaveInfo,
      talentPreferencesSavePending,
      talentPreferencesUpdatedAt,
      talentEducations,
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
      </CareerSidebarProvider>
    </CareerChatPanelProvider>
  );
};
