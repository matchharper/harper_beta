import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { SessionResponse } from "@/components/career/types";
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
import { useCareerTalentPreferences } from "@/hooks/career/useCareerTalentPreferences";
import { useCareerTalentSettings } from "@/hooks/career/useCareerTalentSettings";
import { useCareerSession } from "@/hooks/career/useCareerSession";
import { TALENT_ONBOARDING_COMPLETION_TARGET } from "@/lib/talentOnboarding/progress";

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
    networkApplicationSavePending,
    networkApplicationSaveError,
    networkApplicationSaveInfo,
    applySessionNetworkState,
    onNetworkApplicationChange,
    onSaveNetworkApplication,
    resetNetworkApplicationState,
  } = useCareerNetworkApplication({
    fetchWithAuth,
    user,
  });

  const {
    talentPreferences,
    talentPreferencesSavePending,
    talentPreferencesSaveError,
    talentPreferencesSaveInfo,
    applySessionTalentPreferences,
    onTalentPreferencesChange,
    onSaveTalentPreferences,
    resetTalentPreferencesState,
  } = useCareerTalentPreferences({
    fetchWithAuth,
    user,
  });

  const {
    settingsLoading,
    settingsSaving,
    settingsError,
    profileVisibility,
    blockedCompanies,
    onProfileVisibilityChange,
    onAddBlockedCompany,
    onRemoveBlockedCompany,
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

  const hydrateSession = useCallback(
    (payload: SessionResponse) => {
      applySessionConversation(payload);
      applySessionProfile(payload);
      applySessionNetworkState(payload);
      applySessionTalentPreferences(payload);
      applySessionPrompt(payload);
    },
    [
      applySessionConversation,
      applySessionNetworkState,
      applySessionProfile,
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
      resetOnboardingState();
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
      talentPreferences,
      networkApplicationSavePending,
      networkApplicationSaveError,
      networkApplicationSaveInfo,
      talentPreferencesSavePending,
      talentPreferencesSaveError,
      talentPreferencesSaveInfo,
      onNetworkApplicationChange,
      onSaveNetworkApplication,
      onTalentPreferencesChange,
      onSaveTalentPreferences,
      settingsLoading,
      settingsSaving,
      settingsError,
      profileVisibility,
      blockedCompanies,
      onProfileVisibilityChange,
      onAddBlockedCompany,
      onRemoveBlockedCompany,
      onReloadTalentSettings,
    }),
    [
      answeredCount,
      blockedCompanies,
      handleAddProfileLink,
      onAddBlockedCompany,
      handleLogout,
      handleProfileLinkChange,
      networkApplication,
      networkApplicationSaveError,
      networkApplicationSaveInfo,
      networkApplicationSavePending,
      onSaveTalentPreferences,
      onTalentPreferencesChange,
      onNetworkApplicationChange,
      onProfileVisibilityChange,
      onReloadTalentSettings,
      onOpenSettings,
      handleRemoveProfileLink,
      onRemoveBlockedCompany,
      onSaveNetworkApplication,
      handleSaveTalentProfile,
      profileLinks,
      profileVisibility,
      profileSaveError,
      profileSaveInfo,
      profileSavePending,
      progressPercent,
      resumeFile,
      savedProfileLinks,
      savedResumeDownloadUrl,
      savedResumeFileName,
      savedResumeStoragePath,
      settingsError,
      settingsLoading,
      settingsSaving,
      setResumeFile,
      stage,
      talentPreferences,
      talentPreferencesSaveError,
      talentPreferencesSaveInfo,
      talentPreferencesSavePending,
      userChatCount,
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
