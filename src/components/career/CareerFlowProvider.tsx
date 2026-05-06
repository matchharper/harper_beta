import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CareerMessagePayload,
  CareerOpportunityRun,
  CareerRecentOpportunity,
  CareerTalentNotification,
  SessionResponse,
} from "@/components/career/types";
import {
  CareerChatPanelProvider,
  type CareerChatPanelContextValue,
} from "./CareerChatPanelContext";
import {
  CareerSidebarProvider,
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
import {
  normalizeNotifications,
  normalizeRecentOpportunities,
} from "@/hooks/career/careerSessionData";
import { useCareerHistoryState } from "@/hooks/career/useCareerHistoryState";
import { useCareerRuntimeActions } from "@/hooks/career/useCareerRuntimeActions";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";

const getCompletedOpportunityRunRefreshKey = (
  run: CareerOpportunityRun | null
) => {
  if (!run || run.inputLocked) return null;
  if (run.status !== "completed" && run.status !== "partial") return null;
  return `${run.id}:${run.completedAt ?? run.status}`;
};

export const CareerFlowProvider = ({
  children,
  inviteToken,
  mail,
  onOpenSettings,
}: {
  children: React.ReactNode;
  inviteToken?: string | null;
  mail?: string | null;
  onOpenSettings: () => void;
}) => {
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
  const [notifications, setNotifications] = useState<
    CareerTalentNotification[]
  >([]);
  const [opportunityRun, setOpportunityRun] =
    useState<CareerOpportunityRun | null>(null);
  const [opportunityRunTriggerPending, setOpportunityRunTriggerPending] =
    useState(false);
  const [notificationsMarkingAsRead, setNotificationsMarkingAsRead] =
    useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const completedOpportunityRunRefreshRef = useRef<string | null>(null);
  const emptyCompletedHistoryProbeRef = useRef<string | null>(null);

  const {
    conversationId,
    initialMessagePage,
    sessionData,
    sessionPending,
    sessionError,
    loadSession,
    resetSessionState,
  } = useCareerSession({
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
    onTalentPreferencesRefreshed: handleTalentPreferencesRefreshedFromChat,
    onTalentInsightsRefreshed: handleTalentInsightsRefreshedFromChat,
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
    loadMoreHistoryOpportunities,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
    onSendHistoryOpportunityQuestion,
    onUpdateHistoryOpportunityFeedback,
    onUpdateHistoryOpportunitySavedStage,
    cancelPendingOpportunityFeedbackFollowUp,
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
    handleSaveTalentProfile,
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

  const {
    settingsLoading,
    settingsSaving,
    settingsError,
    settingsSaveInfo,
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
      text: string;
      link?: string;
      onError?: () => void;
    }) => {
      cancelPendingOpportunityFeedbackFollowUp();
      await sendChatMessageBase(args, {
        profilePending,
      });
    },
    [
      cancelPendingOpportunityFeedbackFollowUp,
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

  const { handleRunOpportunityDiscoveryTest, resetRuntimeActionsState } =
    useCareerRuntimeActions({
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
    onboardingPausePending,
    inputMode,
    voiceTranscript,
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
    onSendChatMessage: sendChatMessage,
    onOpportunityRunChanged: setOpportunityRun,
    appendMessage,
    setChatError,
    setStage,
    enqueueAssistantTypewriter,
    onMessagesChanged: appendLatestMessagesToCache,
  });

  const handleProfileSubmit = useCallback(async () => {
    await handleProfileSubmitBase(handleProfileSubmitSuccess);
  }, [handleProfileSubmitBase, handleProfileSubmitSuccess]);

  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications]
  );

  const markNotificationsRead = useCallback(async () => {
    if (
      !userId ||
      notificationsMarkingAsRead ||
      unreadNotificationCount === 0
    ) {
      return;
    }

    const previousNotifications = notifications;
    setNotificationsError("");
    setNotificationsMarkingAsRead(true);
    setNotifications((current) =>
      current.map((notification) =>
        notification.isRead ? notification : { ...notification, isRead: true }
      )
    );

    try {
      const response = await fetchWithAuth("/api/talent/notifications", {
        method: "PATCH",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "알림 읽음 처리에 실패했습니다.")
        );
      }
    } catch (error) {
      setNotifications(previousNotifications);
      setNotificationsError(
        error instanceof Error
          ? error.message
          : "알림 읽음 처리에 실패했습니다."
      );
    } finally {
      setNotificationsMarkingAsRead(false);
    }
  }, [
    fetchWithAuth,
    notifications,
    notificationsMarkingAsRead,
    unreadNotificationCount,
    userId,
  ]);

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
      setNotifications(normalizeNotifications(payload.notifications));
      setNotificationsError("");
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
      setNotifications([]);
      setNotificationsMarkingAsRead(false);
      setNotificationsError("");
    }
  }, [
    authLoading,
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

  const progressPercent = Math.round(
    (answeredCount / TALENT_INTERVIEW_FINAL_STEP) * 100
  );

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
      opportunityRun,
      opportunitySearchLocked: Boolean(opportunityRun?.inputLocked),
      historyUpdatingOpportunityIds,
      onboardingBeginPending,
      callStartPending,
      onboardingPausePending,
      onGoogleLogin: handleGoogleLogin,
      onEmailAuth: handleEmailAuth,
      onResumeFileChange: setResumeFile,
      onProfileLinkChange: handleProfileLinkChange,
      onRemoveProfileLink: handleRemoveProfileLink,
      onAddProfileLink: handleAddProfileLink,
      onProfileSubmit: handleProfileSubmit,
      onSendChatMessage: sendChatMessage,
      onUpdateHistoryOpportunityFeedback,
      onLoadOlderMessages: handleLoadOlderMessages,
      onRegenerateOnboardingWrapup: regenerateOnboardingWrapup,
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
      onStartCallMode: handleStartCallMode,
      onEndCallMode: handleEndCallMode,
      callTranscriptEntries,
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
      conversationId,
      handleAddProfileLink,
      handleEmailAuth,
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
      handleStartCallMode,
      handleEndCallMode,
      callTranscriptEntries,
      connectionStatus,
      handleSwitchToTextMode,
      handleSubmitOnboardingInterest,
      handleToggleVoiceMute,
      handleUseChatOnly,
      handleVoicePrimaryAction,
      inputMode,
      messages,
      loadingOlderMessages,
      onUpdateHistoryOpportunityFeedback,
      regenerateOnboardingWrapup,
      onboardingBeginPending,
      callStartPending,
      onboardingPausePending,
      opportunityRun,
      profileError,
      profileLinks,
      profilePending,
      resumeFile,
      setResumeFile,
      sendChatMessage,
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
      stage,
      userChatCount,
      answeredCount,
      targetQuestions: TALENT_INTERVIEW_FINAL_STEP,
      progressPercent,
      onOpenSettings,
      onLogout: handleLogout,
      activeCompanyRoleCount,
      opportunityRun,
      opportunityRunTriggerPending,
      onRunOpportunityDiscoveryTest: handleRunOpportunityDiscoveryTest,
      callStartPending,
      onStartCallMode: handleStartCallMode,
      recentOpportunities,
      historyOpportunityCounts,
      historyOpportunities,
      historyLoading,
      historyLoadingMore,
      hasMoreHistoryOpportunities,
      historyUpdatingOpportunityIds,
      historyUpdateError,
      onLoadMoreHistoryOpportunities: loadMoreHistoryOpportunities,
      onUpdateHistoryOpportunityFeedback,
      onUpdateHistoryOpportunitySavedStage,
      onMarkHistoryOpportunityViewed,
      onMarkHistoryOpportunityClicked,
      onSendHistoryOpportunityQuestion,
      notifications,
      unreadNotificationCount,
      notificationsMarkingAsRead,
      notificationsError,
      onMarkNotificationsRead: markNotificationsRead,
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
      settingsSaveInfo,
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
      handleAddProfileLink,
      handleRunOpportunityDiscoveryTest,
      handleStartCallMode,
      onAddBlockedCompany,
      hasUnsavedTalentInsightsChanges,
      hasUnsavedTalentPreferencesChanges,
      hasUnsavedTalentSettingsChanges,
      handleLogout,
      handleProfileLinkChange,
      notifications,
      notificationsError,
      notificationsMarkingAsRead,
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
      onRemoveBlockedCompany,
      markNotificationsRead,
      handleSaveTalentProfile,
      hasMoreHistoryOpportunities,
      historyOpportunityCounts,
      historyLoading,
      historyLoadingMore,
      historyOpportunities,
      historyUpdateError,
      historyUpdatingOpportunityIds,
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
      settingsError,
      settingsLoading,
      settingsSaveInfo,
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
      unreadNotificationCount,
      userChatCount,
      onMarkHistoryOpportunityClicked,
      onMarkHistoryOpportunityViewed,
      onSendHistoryOpportunityQuestion,
      onUpdateHistoryOpportunityFeedback,
      onUpdateHistoryOpportunitySavedStage,
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
