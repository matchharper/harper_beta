import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CareerMockInterviewSession,
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
import { useCareerNetworkApplication } from "@/hooks/career/useCareerNetworkApplication";
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
  const startCallModeRef = useRef<(openingText?: string) => Promise<boolean>>(
    async () => false
  );
  const primeCallAudioPlaybackRef = useRef<() => void>(() => {});
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
  const [mockInterviewSession, setMockInterviewSession] =
    useState<CareerMockInterviewSession | null>(null);
  const [mockInterviewPending, setMockInterviewPending] = useState(false);
  const [companySnapshotPending, setCompanySnapshotPending] = useState(false);
  const [notificationsMarkingAsRead, setNotificationsMarkingAsRead] =
    useState(false);
  const [notificationsError, setNotificationsError] = useState("");

  const {
    conversationId,
    initialMessagePage,
    sessionPending,
    sessionError,
    loadSession,
    resetSessionState,
  } = useCareerSession({ fetchWithAuth, inviteToken, mail });

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
    enqueueAssistantTypewriter,
    applySessionConversation,
    sendChatMessage: sendChatMessageBase,
    resetChatState,
  } = useCareerChat({
    user,
    conversationId,
    sessionPending,
    fetchWithAuth,
    persistedMessages,
    onMockInterviewSessionChanged: setMockInterviewSession,
    onOpportunityRunChanged: setOpportunityRun,
    onMessagesChanged: appendLatestMessagesToCache,
  });

  const {
    historyLoaded,
    setHistoryLoaded,
    historyOpportunities,
    historyUpdateError,
    historyUpdatingOpportunityIds,
    hydrateHistoryOpportunities,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
    onSendHistoryOpportunityQuestion,
    onUpdateHistoryOpportunityFeedback,
    onUpdateHistoryOpportunitySavedStage,
    resetHistoryState,
  } = useCareerHistoryState({
    fetchWithAuth,
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
    networkApplication,
    networkApplicationUpdatedAt,
    networkApplicationSavePending,
    networkApplicationSaveError,
    networkApplicationSaveInfo,
    hasUnsavedNetworkApplicationChanges,
    applySessionNetworkState,
    onNetworkApplicationChange,
    onSaveNetworkApplication,
    onResetNetworkApplication,
    resetNetworkApplicationState,
  } = useCareerNetworkApplication({
    fetchWithAuth,
    user,
  });

  const {
    talentPreferences,
    talentPreferencesUpdatedAt,
    talentPreferencesSavePending,
    talentPreferencesSaveError,
    talentPreferencesSaveInfo,
    hasUnsavedTalentPreferencesChanges,
    applySessionTalentPreferences,
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
    onTalentInsightsChange,
    onSaveTalentInsights,
    onResetTalentInsights,
    resetTalentInsightsState,
  } = useCareerTalentInsights({
    fetchWithAuth,
    user,
  });

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
    async (args: { text: string; link?: string; onError?: () => void }) => {
      if (opportunityRun?.inputLocked) return;
      await sendChatMessageBase(args, {
        profilePending,
      });
    },
    [opportunityRun?.inputLocked, profilePending, sendChatMessageBase]
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

  const cacheAssistantMessages = useCallback(
    (rawMessages: unknown[]) => {
      const messagesToAdd = rawMessages.filter(
        (item): item is SessionResponse["messages"][number] => {
          if (!item || typeof item !== "object") return false;
          return "id" in item && "role" in item && "content" in item;
        }
      );

      appendLatestMessagesToCache(messagesToAdd);
    },
    [appendLatestMessagesToCache]
  );

  const {
    handleEndMockInterview,
    handlePrepareMockInterview,
    handleRunOpportunityDiscoveryTest,
    handleStartCompanySnapshot,
    handleStartMockInterview,
    resetRuntimeActionsState,
  } = useCareerRuntimeActions({
    cacheAssistantMessages,
    companySnapshotPending,
    conversationId,
    enqueueAssistantMessages,
    fetchWithAuth,
    handleStartCallMode: (openingText?: string) =>
      startCallModeRef.current(openingText),
    mockInterviewPending,
    mockInterviewSession,
    opportunityRun,
    opportunityRunTriggerPending,
    primeCallAudioPlayback: () => primeCallAudioPlaybackRef.current(),
    setCompanySnapshotPending,
    setChatError,
    setMockInterviewPending,
    setMockInterviewSession,
    setOpportunityRun,
    setOpportunityRunTriggerPending,
  });

  const {
    showVoiceStartPrompt,
    onboardingBeginPending,
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
    primeCallAudioPlayback,
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
    onMockInterviewSessionChanged: setMockInterviewSession,
    appendMessage,
    setChatError,
    setStage,
    enqueueAssistantTypewriter,
    onMessagesChanged: appendLatestMessagesToCache,
  });

  useEffect(() => {
    startCallModeRef.current = handleStartCallMode;
    primeCallAudioPlaybackRef.current = primeCallAudioPlayback;
  }, [handleStartCallMode, primeCallAudioPlayback]);

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
      applySessionNetworkState(payload);
      applySessionTalentPreferences(payload);
      applySessionTalentInsights(payload);
      applySessionPrompt(payload);
      hydrateHistoryOpportunities(payload.historyOpportunities);
      setRecentOpportunities(
        normalizeRecentOpportunities(payload.recentOpportunities)
      );
      setActiveCompanyRoleCount(
        Math.max(0, Number(payload.activeCompanyRoleCount ?? 0) || 0)
      );
      setNotifications(normalizeNotifications(payload.notifications));
      setNotificationsError("");
      setOpportunityRun(payload.opportunityRun ?? null);
      setMockInterviewSession(payload.mockInterviewSession ?? null);
    },
    [
      applySessionConversation,
      applySessionNetworkState,
      applySessionProfile,
      applySessionTalentInsights,
      applySessionTalentPreferences,
      applySessionPrompt,
      appendLatestMessagesToCache,
      hydrateHistoryOpportunities,
    ]
  );

  useEffect(() => {
    setHistoryLoaded(false);
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      resetSessionState();
      resetChatState();
      resetProfileState();
      resetNetworkApplicationState();
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
      return;
    }

    void (async () => {
      const payload = await loadSession();
      if (payload) {
        hydrateSession(payload);
      }
      setHistoryLoaded(true);
    })();
  }, [
    authLoading,
    hydrateSession,
    loadSession,
    resetChatState,
    resetNetworkApplicationState,
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
        if (nextRun && !nextRun.inputLocked) {
          const sessionPayload = await loadSession();
          if (!cancelled && sessionPayload) {
            hydrateSession(sessionPayload);
          }
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
    loadSession,
    opportunityRun?.inputLocked,
    userId,
  ]);

  const historyLoading =
    historyOpportunities.length === 0 && (!historyLoaded || sessionPending);

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
      chatPending,
      companySnapshotPending,
      opportunityRun,
      opportunitySearchLocked: Boolean(opportunityRun?.inputLocked),
      mockInterviewSession,
      mockInterviewPending,
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
      onPrepareMockInterview: handlePrepareMockInterview,
      onStartMockInterview: handleStartMockInterview,
      onEndMockInterview: handleEndMockInterview,
      onStartCompanySnapshot: handleStartCompanySnapshot,
      onLoadOlderMessages: handleLoadOlderMessages,
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
      authLoading,
      authError,
      authInfo,
      authPending,
      chatError,
      chatPending,
      companySnapshotPending,
      conversationId,
      handleAddProfileLink,
      handleEmailAuth,
      handleEndMockInterview,
      handleStartCompanySnapshot,
      handleGoogleLogin,
      handleProfileLinkChange,
      handleProfileSubmit,
      handlePrepareMockInterview,
      handleRemoveProfileLink,
      handleStartMockInterview,
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
      mockInterviewPending,
      mockInterviewSession,
      loadingOlderMessages,
      onUpdateHistoryOpportunityFeedback,
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
      recentOpportunities,
      historyOpportunities,
      historyLoading,
      historyUpdatingOpportunityIds,
      historyUpdateError,
      onUpdateHistoryOpportunityFeedback,
      onUpdateHistoryOpportunitySavedStage,
      onMarkHistoryOpportunityViewed,
      onMarkHistoryOpportunityClicked,
      onSendHistoryOpportunityQuestion,
      onPrepareMockInterview: handlePrepareMockInterview,
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
      networkApplication,
      networkApplicationUpdatedAt,
      talentPreferences,
      talentInsights,
      talentPreferencesUpdatedAt,
      talentInsightsUpdatedAt,
      networkApplicationSavePending,
      networkApplicationSaveError,
      networkApplicationSaveInfo,
      hasUnsavedNetworkApplicationChanges,
      talentPreferencesSavePending,
      talentPreferencesSaveError,
      talentPreferencesSaveInfo,
      hasUnsavedTalentPreferencesChanges,
      talentInsightsSavePending,
      talentInsightsSaveError,
      talentInsightsSaveInfo,
      hasUnsavedTalentInsightsChanges,
      onNetworkApplicationChange,
      onSaveNetworkApplication,
      onResetNetworkApplication,
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
      handleAddProfileLink,
      handleRunOpportunityDiscoveryTest,
      onAddBlockedCompany,
      hasUnsavedNetworkApplicationChanges,
      hasUnsavedTalentInsightsChanges,
      hasUnsavedTalentPreferencesChanges,
      hasUnsavedTalentSettingsChanges,
      handleLogout,
      handleProfileLinkChange,
      networkApplication,
      networkApplicationUpdatedAt,
      networkApplicationSaveError,
      networkApplicationSaveInfo,
      networkApplicationSavePending,
      notifications,
      notificationsError,
      notificationsMarkingAsRead,
      onResetNetworkApplication,
      onResetTalentInsights,
      onResetTalentPreferences,
      onResetTalentSettings,
      onSaveTalentInsights,
      onSaveTalentPreferences,
      onSaveTalentSettings,
      onTalentInsightsChange,
      onTalentPreferencesChange,
      onNetworkApplicationChange,
      onProfileVisibilityChange,
      onReloadTalentSettings,
      onOpenSettings,
      handleRemoveProfileLink,
      onRemoveBlockedCompany,
      markNotificationsRead,
      onSaveNetworkApplication,
      handleSaveTalentProfile,
      handlePrepareMockInterview,
      historyLoading,
      historyOpportunities,
      historyUpdateError,
      historyUpdatingOpportunityIds,
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
