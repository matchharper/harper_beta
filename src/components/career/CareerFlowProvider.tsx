import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityFeedback,
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
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import { TALENT_ONBOARDING_COMPLETION_TARGET } from "@/lib/talentOnboarding/progress";

const normalizeRecentOpportunities = (
  value: SessionResponse["recentOpportunities"]
): CareerRecentOpportunity[] => {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is CareerRecentOpportunity => {
    if (!item || typeof item !== "object") return false;
    if (typeof item.id !== "string" || !item.id.trim()) return false;
    if (typeof item.title !== "string" || !item.title.trim()) return false;
    if (typeof item.companyName !== "string" || !item.companyName.trim()) {
      return false;
    }
    if (item.kind !== "match" && item.kind !== "recommendation") return false;
    if (typeof item.matchedAt !== "string" || Number.isNaN(Date.parse(item.matchedAt))) {
      return false;
    }
    return true;
  });
};

const normalizeHistoryOpportunities = (
  value: SessionResponse["historyOpportunities"]
): CareerHistoryOpportunity[] => {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is CareerHistoryOpportunity => {
    if (!item || typeof item !== "object") return false;
    if (typeof item.id !== "string" || !item.id.trim()) return false;
    if (typeof item.roleId !== "string" || !item.roleId.trim()) return false;
    if (typeof item.title !== "string" || !item.title.trim()) return false;
    if (typeof item.companyName !== "string" || !item.companyName.trim()) {
      return false;
    }
    if (item.kind !== "match" && item.kind !== "recommendation") return false;
    if (item.sourceType !== "internal" && item.sourceType !== "external") {
      return false;
    }
    if (typeof item.recommendedAt !== "string") return false;
    if (Number.isNaN(Date.parse(item.recommendedAt))) return false;
    if (!Array.isArray(item.employmentTypes)) return false;
    if (!Array.isArray(item.recommendationReasons)) return false;
    if (typeof item.isAccepted !== "boolean") return false;
    if (typeof item.isInternal !== "boolean") return false;
    if (
      item.feedback !== null &&
      item.feedback !== "tracked" &&
      item.feedback !== "dont_know" &&
      item.feedback !== "not_for_me"
    ) {
      return false;
    }
    return true;
  });
};

const normalizeNotifications = (
  value: SessionResponse["notifications"]
): CareerTalentNotification[] => {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is CareerTalentNotification => {
    if (!item || typeof item !== "object") return false;
    if (typeof item.id !== "number" || !Number.isFinite(item.id)) return false;
    if (typeof item.createdAt !== "string" || Number.isNaN(Date.parse(item.createdAt))) {
      return false;
    }
    if (item.message !== null && typeof item.message !== "string") return false;
    return typeof item.isRead === "boolean";
  });
};

export const CareerFlowProvider = ({
  children,
  inviteToken,
  onOpenSettings,
}: {
  children: React.ReactNode;
  inviteToken?: string | null;
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
  const [recentOpportunities, setRecentOpportunities] = useState<
    CareerRecentOpportunity[]
  >([]);
  const [historyOpportunities, setHistoryOpportunities] = useState<
    CareerHistoryOpportunity[]
  >([]);
  const [historyUpdatingRoleIds, setHistoryUpdatingRoleIds] = useState<string[]>(
    []
  );
  const [historyUpdateError, setHistoryUpdateError] = useState("");
  const [notifications, setNotifications] = useState<CareerTalentNotification[]>(
    []
  );
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
  } = useCareerSession({ fetchWithAuth, inviteToken });

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
    onMessagesChanged: appendLatestMessagesToCache,
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
    profilePending;

  const sendChatMessage = useCallback(
    async (args: { text: string; link?: string; onError?: () => void }) => {
      await sendChatMessageBase(args, {
        profilePending,
      });
    },
    [profilePending, sendChatMessageBase]
  );

  const handleLoadOlderMessages = useCallback(async () => {
    await loadOlderMessages();
  }, [loadOlderMessages]);

  const {
    showVoiceStartPrompt,
    onboardingBeginPending,
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
    handleUseChatOnly,
    handlePauseOnboarding,
    handleSubmitOnboardingInterest,
    handleContinueOnboardingConversation,
    handleSwitchToTextMode,
    applySessionPrompt,
    handleProfileSubmitSuccess,
    resetOnboardingState,
  } = useCareerOnboardingVoice({
    user,
    userId,
    authLoading,
    conversationId,
    messages,
    fetchWithAuth,
    isVoiceInteractionLocked,
    onSendChatMessage: sendChatMessage,
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

  const updateHistoryOpportunityLocally = useCallback(
    (
      roleId: string,
      updater: (
        current: CareerHistoryOpportunity
      ) => CareerHistoryOpportunity
    ) => {
      setHistoryOpportunities((current) =>
        current.map((item) => (item.roleId === roleId ? updater(item) : item))
      );
    },
    []
  );

  const restoreHistoryOpportunity = useCallback(
    (roleId: string, previousItem: CareerHistoryOpportunity) => {
      setHistoryOpportunities((current) =>
        current.map((item) => (item.roleId === roleId ? previousItem : item))
      );
    },
    []
  );

  const beginHistoryUpdate = useCallback((roleId: string) => {
    setHistoryUpdateError("");
    setHistoryUpdatingRoleIds((current) =>
      current.includes(roleId) ? current : [...current, roleId]
    );
  }, []);

  const endHistoryUpdate = useCallback((roleId: string) => {
    setHistoryUpdatingRoleIds((current) =>
      current.filter((item) => item !== roleId)
    );
  }, []);

  const patchHistoryOpportunity = useCallback(
    async (body: {
      action: "feedback" | "view" | "click";
      feedback?: CareerHistoryOpportunityFeedback;
      roleId: string;
    }) => {
      const response = await fetchWithAuth("/api/talent/opportunities", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "기회 상태를 업데이트하지 못했습니다.")
        );
      }
    },
    [fetchWithAuth]
  );

  const onUpdateHistoryOpportunityFeedback = useCallback(
    async (roleId: string, feedback: CareerHistoryOpportunityFeedback) => {
      const normalizedRoleId = roleId.trim();
      if (!normalizedRoleId) return;

      const previousItem = historyOpportunities.find(
        (item) => item.roleId === normalizedRoleId
      );
      if (!previousItem) return;
      const now = new Date().toISOString();

      beginHistoryUpdate(normalizedRoleId);
      updateHistoryOpportunityLocally(normalizedRoleId, (item) => ({
        ...item,
        dismissedAt: feedback === "not_for_me" ? now : null,
        feedback,
        feedbackAt: now,
      }));

      try {
        await patchHistoryOpportunity({
          action: "feedback",
          feedback,
          roleId: normalizedRoleId,
        });
      } catch (error) {
        restoreHistoryOpportunity(normalizedRoleId, previousItem);
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : "기회 상태를 업데이트하지 못했습니다."
        );
      } finally {
        endHistoryUpdate(normalizedRoleId);
      }
    },
    [
      beginHistoryUpdate,
      endHistoryUpdate,
      historyOpportunities,
      patchHistoryOpportunity,
      restoreHistoryOpportunity,
      updateHistoryOpportunityLocally,
    ]
  );

  const onMarkHistoryOpportunityViewed = useCallback(
    async (roleId: string) => {
      const normalizedRoleId = roleId.trim();
      if (!normalizedRoleId) return;

      const currentItem = historyOpportunities.find(
        (item) => item.roleId === normalizedRoleId
      );
      if (!currentItem || currentItem.viewedAt) return;
      const now = new Date().toISOString();

      updateHistoryOpportunityLocally(normalizedRoleId, (item) => ({
        ...item,
        viewedAt: now,
      }));

      try {
        await patchHistoryOpportunity({
          action: "view",
          roleId: normalizedRoleId,
        });
      } catch (error) {
        restoreHistoryOpportunity(normalizedRoleId, currentItem);
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : "기회 상태를 업데이트하지 못했습니다."
        );
      }
    },
    [
      historyOpportunities,
      patchHistoryOpportunity,
      restoreHistoryOpportunity,
      updateHistoryOpportunityLocally,
    ]
  );

  const onMarkHistoryOpportunityClicked = useCallback(
    async (roleId: string) => {
      const normalizedRoleId = roleId.trim();
      if (!normalizedRoleId) return;

      const currentItem = historyOpportunities.find(
        (item) => item.roleId === normalizedRoleId
      );
      if (!currentItem || currentItem.clickedAt) return;
      const now = new Date().toISOString();

      updateHistoryOpportunityLocally(normalizedRoleId, (item) => ({
        ...item,
        clickedAt: now,
      }));

      try {
        await patchHistoryOpportunity({
          action: "click",
          roleId: normalizedRoleId,
        });
      } catch (error) {
        restoreHistoryOpportunity(normalizedRoleId, currentItem);
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : "기회 상태를 업데이트하지 못했습니다."
        );
      }
    },
    [
      historyOpportunities,
      patchHistoryOpportunity,
      restoreHistoryOpportunity,
      updateHistoryOpportunityLocally,
    ]
  );

  const markNotificationsRead = useCallback(async () => {
    if (!userId || notificationsMarkingAsRead || unreadNotificationCount === 0) {
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
      applySessionProfile(payload);
      applySessionNetworkState(payload);
      applySessionTalentPreferences(payload);
      applySessionTalentInsights(payload);
      applySessionPrompt(payload);
      setHistoryOpportunities(
        normalizeHistoryOpportunities(payload.historyOpportunities)
      );
      setHistoryUpdatingRoleIds([]);
      setHistoryUpdateError("");
      setRecentOpportunities(normalizeRecentOpportunities(payload.recentOpportunities));
      setNotifications(normalizeNotifications(payload.notifications));
      setNotificationsError("");
    },
    [
      applySessionConversation,
      applySessionNetworkState,
      applySessionProfile,
      applySessionTalentInsights,
      applySessionTalentPreferences,
      applySessionPrompt,
    ]
  );

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
      setRecentOpportunities([]);
      setHistoryOpportunities([]);
      setHistoryUpdatingRoleIds([]);
      setHistoryUpdateError("");
      setNotifications([]);
      setNotificationsMarkingAsRead(false);
      setNotificationsError("");
      return;
    }

    void (async () => {
      const payload = await loadSession();
      if (!payload) return;
      hydrateSession(payload);
    })();
  }, [
    authLoading,
    hydrateSession,
    loadSession,
    resetChatState,
    resetNetworkApplicationState,
    resetOnboardingState,
    resetProfileState,
    resetTalentInsightsState,
    resetTalentPreferencesState,
    resetSessionState,
    userId,
  ]);

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
    () => Math.min(userChatCount, TALENT_ONBOARDING_COMPLETION_TARGET),
    [userChatCount]
  );

  const progressPercent = Math.round(
    (answeredCount / TALENT_ONBOARDING_COMPLETION_TARGET) * 100
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
      onboardingBeginPending,
      onboardingPausePending,
      onGoogleLogin: handleGoogleLogin,
      onEmailAuth: handleEmailAuth,
      onResumeFileChange: setResumeFile,
      onProfileLinkChange: handleProfileLinkChange,
      onRemoveProfileLink: handleRemoveProfileLink,
      onAddProfileLink: handleAddProfileLink,
      onProfileSubmit: handleProfileSubmit,
      onSendChatMessage: sendChatMessage,
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
    }),
    [
      assistantTyping,
      authLoading,
      authError,
      authInfo,
      authPending,
      chatError,
      chatPending,
      conversationId,
      handleAddProfileLink,
      handleEmailAuth,
      handleGoogleLogin,
      handleProfileLinkChange,
      handleProfileSubmit,
      handleRemoveProfileLink,
      handleLoadOlderMessages,
      hasOlderMessages,
      handleContinueOnboardingConversation,
      handlePauseOnboarding,
      handleStartVoiceCall,
      handleSwitchToTextMode,
      handleSubmitOnboardingInterest,
      handleToggleVoiceMute,
      handleUseChatOnly,
      handleVoicePrimaryAction,
      inputMode,
      messages,
      loadingOlderMessages,
      onboardingBeginPending,
      onboardingPausePending,
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
    ]
  );

  const sidebarContextValue: CareerSidebarContextValue = useMemo(
    () => ({
      user,
      stage,
      userChatCount,
      answeredCount,
      targetQuestions: TALENT_ONBOARDING_COMPLETION_TARGET,
      progressPercent,
      onOpenSettings,
      onLogout: handleLogout,
      recentOpportunities,
      historyOpportunities,
      historyUpdatingRoleIds,
      historyUpdateError,
      onUpdateHistoryOpportunityFeedback,
      onMarkHistoryOpportunityViewed,
      onMarkHistoryOpportunityClicked,
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
      blockedCompanies,
      handleAddProfileLink,
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
      historyOpportunities,
      historyUpdateError,
      historyUpdatingRoleIds,
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
      onUpdateHistoryOpportunityFeedback,
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
