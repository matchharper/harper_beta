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
  CareerMessagePayload,
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
  type CareerCompanyRecommendationResult,
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
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import {
  getCareerConversationStarter,
  type CareerConversationStarterId,
  type CareerConversationStarterMode,
} from "@/lib/career/conversationStarters";

const getCompletedOpportunityRunRefreshKey = (
  run: CareerOpportunityRun | null
) => {
  if (!run || run.inputLocked) return null;
  if (run.status !== "completed" && run.status !== "partial") return null;
  return `${run.id}:${run.completedAt ?? run.status}`;
};

const CAREER_COMPANY_FOLLOW_UP_DELAY_MS = 15_000;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toRecommendationSearchStatus = (
  value: unknown
): CareerRecommendationSearchStatus | null => {
  if (!isRecord(value)) return null;
  const state = value.state;
  if (state !== "running" && state !== "completed" && state !== "error") {
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
  children,
  emailOnboardingToken,
  inviteToken,
  mail,
  onOpenSettings,
}: {
  children: React.ReactNode;
  emailOnboardingToken?: string | null;
  inviteToken?: string | null;
  mail?: string | null;
  onOpenSettings: () => void;
}) => {
  const router = useRouter();
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
  const [sessionReengagementPending, setSessionReengagementPending] =
    useState(false);
  const [sessionReengagementThinkingLogs, setSessionReengagementThinkingLogs] =
    useState<string[]>([]);
  const [
    sessionReengagementRecommendationStatus,
    setSessionReengagementRecommendationStatus,
  ] = useState<CareerRecommendationSearchStatus | null>(null);
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
    mail,
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

  const enqueueHistoryActionAssistantMessage = useCallback(
    (message: CareerMessagePayload) => {
      void (async () => {
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
              "회사 팔로우 후속 메시지를 만들지 못했습니다."
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
            : "회사 팔로우 후속 메시지를 만들지 못했습니다."
        );
      }
    },
    [
      conversationId,
      enqueueHistoryActionAssistantMessage,
      fetchWithAuth,
      setChatError,
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
    hydrateHistoryOpportunities,
    loadHistoryOpportunityByRoleId,
    loadMoreHistoryOpportunities,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
    onSendHistoryOpportunityQuestion,
    onUpdateHistoryOpportunityFeedback,
    onUpdateHistoryOpportunitySavedStage,
    onUpdateHistoryOpportunityTalentMemo,
    cancelPendingOpportunityFeedbackFollowUp,
    refreshLatestHistoryOpportunities,
    resetHistoryState,
  } = useCareerHistoryState({
    conversationId,
    enabled: !authLoading && Boolean(userId && sessionData),
    fetchWithAuth,
    initialSessionPage: sessionData
      ? {
          counts: sessionData.historyOpportunityCounts ?? null,
          items: sessionData.historyOpportunities ?? [],
          nextOffset: sessionData.nextOpportunityOffset ?? null,
        }
      : null,
    onHistoryActionAssistantMessage: enqueueHistoryActionAssistantMessage,
    onHistoryActionUserMessage: appendHistoryActionUserMessage,
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
    blockedCompanies,
    hasUnsavedTalentSettingsChanges,
    onProfileVisibilityChange,
    onAddBlockedCompany,
    onRemoveBlockedCompany,
    onSaveTalentSettings,
    onResetTalentSettings,
    onReloadTalentSettings,
  } = useCareerTalentSettings({
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
      channel?: "chat" | "voice";
      conversationStarterId?: CareerConversationStarterId;
      text: string;
      link?: string;
      onError?: () => void;
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
            getErrorMessage(payload, "커리어 인터뷰 종료에 실패했습니다.")
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
            : "커리어 인터뷰 종료 중 오류가 발생했습니다.";
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
    voiceListening,
    voiceMuted,
    voiceError,
    assistantAudioBusy,
    voicePrimaryPressed,
    handleVoicePrimaryAction,
    handleToggleVoiceMute,
    handleStartVoiceCall,
    handleStartCallMode,
    handleEndCallMode,
    callTranscriptEntries,
    connectionStatus,
    handleUseChatOnly,
    handlePauseOnboarding,
    handleSubmitOnboardingInterest,
    handleContinueOnboardingConversation,
    handleSwitchToTextMode,
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
      const starter = getCareerConversationStarter(args.starterId);
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
    [clearSessionReengagementAction, handleStartCallModeFromUi, sendChatMessage]
  );

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
            getErrorMessage(payload, "회사 팔로우 상태를 변경하지 못했습니다.")
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
            : "회사 팔로우 상태를 변경하지 못했습니다."
        );
        return null;
      }
    },
    [
      cancelPendingCompanyFollowUp,
      conversationId,
      fetchWithAuth,
      scheduleCompanyFollowUp,
      setChatError,
      userId,
    ]
  );

  const handleGenerateCompanyRecommendations = useCallback(
    async (args?: {
      forceRefresh?: boolean;
      limit?: number;
      request?: string | null;
    }): Promise<CareerCompanyRecommendationResult | null> => {
      if (!userId) return null;

      setChatError("");
      try {
        const response = await fetchWithAuth(
          "/api/talent/company-watchlist/recommendations",
          {
            method: "POST",
            body: JSON.stringify({
              conversationId,
              forceRefresh: args?.forceRefresh === true,
              limit: args?.limit ?? 24,
              request: args?.request ?? null,
            }),
          }
        );
        const payload = (await response
          .json()
          .catch(() => ({}))) as CareerCompanyRecommendationResult &
          Record<string, unknown>;

        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "추천 회사를 만들지 못했습니다.")
          );
        }

        return payload;
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : "추천 회사를 만들지 못했습니다."
        );
        return null;
      }
    },
    [conversationId, fetchWithAuth, setChatError, userId]
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
      applySessionPrompt(payload);
      hydrateHistoryOpportunities(
        payload.historyOpportunities,
        payload.nextOpportunityOffset ?? null,
        payload.historyOpportunityCounts ?? null
      );
      setRecentOpportunities(
        normalizeRecentOpportunities(payload.recentOpportunities)
      );
      setActiveCompanyRoleCount(
        Math.max(0, Number(payload.activeCompanyRoleCount ?? 0) || 0)
      );
      setOpportunityRun(payload.opportunityRun ?? null);
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
      hydrateHistoryOpportunities,
    ]
  );

  const handleRunSessionReengagementTest =
    useCallback(async (options?: {
      deleteLatestMessage?: boolean;
    }): Promise<void> => {
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
            getErrorMessage(payload, "6시간 인사 테스트 실행에 실패했습니다.")
          );
        }
        if (payload.skipped) {
          throw new Error("6시간 인사 테스트가 스킵되었습니다.");
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
        setChatError(
          error instanceof Error
            ? error.message
            : "6시간 인사 테스트 실행 중 오류가 발생했습니다."
        );
      } finally {
        setSessionReengagementTestPending(false);
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
      removeMessagesFromCache,
      sessionReengagementTestPending,
      setChatError,
      stage,
    ]);

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
    userId,
  ]);

  useEffect(() => {
    if (!userId || !sessionData) return;
    hydrateSession(sessionData);
    setHistoryLoaded(true);
  }, [hydrateSession, sessionData, setHistoryLoaded, userId]);

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
              : "6시간 인사 생성에 실패했습니다."
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
        throw new Error("6시간 인사 스트림이 완료되기 전에 종료되었습니다.");
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
    (historyInitialLoading || (!historyLoaded && sessionPending));

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
    el.scrollTo({ top: el.scrollHeight });
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

  const progressPercent = Math.round(
    (answeredCount / TALENT_INTERVIEW_FINAL_STEP) * 100
  );
  const interviewProgress: CareerInterviewProgress = useMemo(() => {
    const totalCount = INSIGHT_CHECKLIST.length;
    const filledCount = INSIGHT_CHECKLIST.reduce((count, item) => {
      const value = talentInsights?.[item.key];
      return String(value ?? "").trim().length > 0 ? count + 1 : count;
    }, 0);
    const percent =
      totalCount > 0
        ? Math.min(100, Math.round((filledCount / totalCount) * 100))
        : 0;

    return {
      canForceComplete: !isOnboardingDone && stage === "chat" && percent >= 85,
      filledCount,
      percent,
      remainingCount: Math.max(totalCount - filledCount, 0),
      totalCount,
    };
  }, [isOnboardingDone, stage, talentInsights]);

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
      onboardingWrapupPending,
      thinkingLogsByMessageId,
      chatPending,
      sessionReengagementPending,
      sessionReengagementThinkingLogs,
      sessionReengagementRecommendationStatus,
      sessionReengagementActionMessageId,
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
      onUpdateHistoryOpportunityFeedback,
      onLoadOlderMessages: handleLoadOlderMessages,
      onRegenerateOnboardingWrapup: regenerateOnboardingWrapup,
      forceCompletePending,
      interviewProgress,
      onForceCompleteOnboarding: handleForceCompleteOnboarding,
      showVoiceStartPrompt,
      onStartVoiceCall: handleStartVoiceCall,
      onUseChatOnly: handleUseChatOnly,
      onPauseOnboarding: handlePauseOnboarding,
      onSubmitOnboardingInterest: handleSubmitOnboardingInterest,
      onContinueOnboardingConversation: handleContinueOnboardingConversation,
      inputMode,
      voiceTranscript,
      voiceListening,
      voiceMuted,
      voiceError,
      assistantAudioBusy,
      voicePrimaryPressed,
      onVoicePrimaryAction: handleVoicePrimaryAction,
      onToggleVoiceMute: handleToggleVoiceMute,
      onSwitchToTextMode: handleSwitchToTextMode,
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
      conversationId,
      handleAddProfileLink,
      handleEmailAuth,
      handleForceCompleteOnboarding,
      handleGoogleLogin,
      handleProfileLinkChange,
      handleProfileSubmit,
      handleRemoveProfileLink,
      historyUpdatingOpportunityIds,
      handleLoadOlderMessages,
      hasOlderMessages,
      handleContinueOnboardingConversation,
      handlePauseOnboarding,
      handleStartVoiceCall,
      handleStartCallModeFromUi,
      handleStartConversationStarter,
      handleEndCallMode,
      callTranscriptEntries,
      liveUserTranscriptPlacement,
      connectionStatus,
      handleSwitchToTextMode,
      handleSubmitOnboardingInterest,
      handleToggleVoiceMute,
      handleUseChatOnly,
      handleVoicePrimaryAction,
      inputMode,
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
      voiceError,
      assistantAudioBusy,
      voiceListening,
      voiceMuted,
      voicePrimaryPressed,
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
      onRunOnboardingCompletionTest: handleRunOnboardingCompletionTest,
      onRunSessionReengagementTest: handleRunSessionReengagementTest,
      onRunPeriodicOpportunityDiscoveryTest:
        handleRunPeriodicOpportunityDiscoveryTest,
      onRunOpportunityDiscoveryTest: handleRunOpportunityDiscoveryTest,
      callStartPending,
      onStartCallMode: handleStartCallModeFromUi,
      onUseChatOnly: handleUseChatOnly,
      onStartConversationStarter: handleStartConversationStarter,
      recentOpportunities,
      historyOpportunityCounts,
      historyOpportunities,
      historyLoading,
      historyLoadingMore,
      hasMoreHistoryOpportunities,
      historyUpdatingOpportunityIds,
      historyUpdateError,
      onLoadMoreHistoryOpportunities: loadMoreHistoryOpportunities,
      onLoadHistoryOpportunityByRoleId: loadHistoryOpportunityByRoleId,
      onUpdateHistoryOpportunityFeedback,
      onUpdateHistoryOpportunitySavedStage,
      onUpdateHistoryOpportunityTalentMemo,
      onMarkHistoryOpportunityViewed,
      onMarkHistoryOpportunityClicked,
      onUpdateCompanyFollow: handleUpdateCompanyFollow,
      onGenerateCompanyRecommendations: handleGenerateCompanyRecommendations,
      onSendHistoryOpportunityQuestion,
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
      blockedCompanies,
      hasUnsavedTalentSettingsChanges,
      onProfileVisibilityChange,
      onAddBlockedCompany,
      onRemoveBlockedCompany,
      onSaveTalentSettings,
      onResetTalentSettings,
      onReloadTalentSettings,
    }),
    [
      answeredCount,
      activeCompanyRoleCount,
      blockedCompanies,
      callStartPending,
      conversationId,
      handleAddProfileLink,
      handleRunPeriodicOpportunityDiscoveryTest,
      handleRunOpportunityDiscoveryTest,
      handleStartConversationStarter,
      handleStartCallModeFromUi,
      handleUseChatOnly,
      onAddBlockedCompany,
      hasUnsavedTalentInsightsChanges,
      hasUnsavedTalentPreferencesChanges,
      hasUnsavedTalentSettingsChanges,
      handleCareerLogout,
      handleGenerateCompanyRecommendations,
      handleProfileLinkChange,
      handleRunOnboardingCompletionTest,
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
      isOnboardingDone,
      loadHistoryOpportunityByRoleId,
      loadMoreHistoryOpportunities,
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
      onMarkHistoryOpportunityClicked,
      onMarkHistoryOpportunityViewed,
      onSendHistoryOpportunityQuestion,
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
