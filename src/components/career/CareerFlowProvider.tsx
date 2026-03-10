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
import { useCareerOnboardingVoice } from "@/hooks/career/useCareerOnboardingVoice";
import { useCareerProfile } from "@/hooks/career/useCareerProfile";
import { useCareerTalentSettings } from "@/hooks/career/useCareerTalentSettings";
import { useCareerSession } from "@/hooks/career/useCareerSession";

const TARGET_QUESTIONS = 5;

export const CareerFlowProvider = ({ children }: { children: React.ReactNode }) => {
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
    sessionPending,
    sessionError,
    loadSession,
    resetSessionState,
  } = useCareerSession({ fetchWithAuth });

  const {
    stage,
    setStage,
    messages,
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
  });

  const {
    resumeFile,
    setResumeFile,
    profileLinks,
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

  const isComposerLocked =
    !user ||
    !conversationId ||
    sessionPending ||
    stage === "profile" ||
    profilePending ||
    chatPending ||
    assistantTyping;

  const sendChatMessage = useCallback(
    async (args: { text: string; link?: string; onError?: () => void }) => {
      await sendChatMessageBase(args, {
        profilePending,
      });
    },
    [profilePending, sendChatMessageBase]
  );

  const {
    showVoiceStartPrompt,
    onboardingBeginPending,
    inputMode,
    voiceTranscript,
    voiceListening,
    voiceMuted,
    voiceError,
    handleVoicePrimaryAction,
    handleToggleVoiceMute,
    handleStartVoiceCall,
    handleUseChatOnly,
    handleSwitchToTextMode,
    applySessionPrompt,
    handleProfileSubmitSuccess,
    resetOnboardingState,
  } = useCareerOnboardingVoice({
    user,
    userId,
    authLoading,
    conversationId,
    fetchWithAuth,
    isComposerLocked,
    onSendChatMessage: sendChatMessage,
    setChatError,
    setStage,
    enqueueAssistantTypewriter,
  });

  const handleProfileSubmit = useCallback(async () => {
    await handleProfileSubmitBase(handleProfileSubmitSuccess);
  }, [handleProfileSubmitBase, handleProfileSubmitSuccess]);

  const hydrateSession = useCallback(
    (payload: SessionResponse) => {
      applySessionConversation(payload);
      applySessionProfile(payload);
      applySessionPrompt(payload);
    },
    [applySessionConversation, applySessionProfile, applySessionPrompt]
  );

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      resetSessionState();
      resetChatState();
      resetProfileState();
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
    resetOnboardingState,
    resetProfileState,
    resetSessionState,
    userId,
  ]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [assistantTyping, chatPending, messages, profilePending, sessionPending]);

  const answeredCount = useMemo(
    () =>
      Math.min(
        messages.filter(
          (message) =>
            message.role === "user" &&
            (message.messageType ?? "chat") === "chat"
        ).length,
        TARGET_QUESTIONS
      ),
    [messages]
  );

  const progressPercent = Math.round((answeredCount / TARGET_QUESTIONS) * 100);

  const chatPanelContextValue: CareerChatPanelContextValue = useMemo(
    () => ({
      user,
      conversationId,
      stage,
      messages,
      scrollRef,
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
      onGoogleLogin: handleGoogleLogin,
      onEmailAuth: handleEmailAuth,
      onResumeFileChange: setResumeFile,
      onProfileLinkChange: handleProfileLinkChange,
      onRemoveProfileLink: handleRemoveProfileLink,
      onAddProfileLink: handleAddProfileLink,
      onProfileSubmit: handleProfileSubmit,
      onSendChatMessage: sendChatMessage,
      showVoiceStartPrompt,
      onStartVoiceCall: handleStartVoiceCall,
      onUseChatOnly: handleUseChatOnly,
      inputMode,
      voiceTranscript,
      voiceListening,
      voiceMuted,
      voiceError,
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
      handleStartVoiceCall,
      handleSwitchToTextMode,
      handleToggleVoiceMute,
      handleUseChatOnly,
      handleVoicePrimaryAction,
      inputMode,
      messages,
      onboardingBeginPending,
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
      voiceListening,
      voiceMuted,
      voiceTranscript,
    ]
  );

  const sidebarContextValue: CareerSidebarContextValue = useMemo(
    () => ({
      user,
      stage,
      answeredCount,
      targetQuestions: TARGET_QUESTIONS,
      progressPercent,
      onLogout: handleLogout,
      resumeFile,
      savedResumeFileName,
      savedResumeStoragePath,
      savedResumeDownloadUrl,
      profileLinks,
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
      onProfileVisibilityChange,
      onReloadTalentSettings,
      handleRemoveProfileLink,
      onRemoveBlockedCompany,
      handleSaveTalentProfile,
      profileLinks,
      profileVisibility,
      profileSaveError,
      profileSaveInfo,
      profileSavePending,
      progressPercent,
      resumeFile,
      savedResumeDownloadUrl,
      savedResumeFileName,
      savedResumeStoragePath,
      settingsError,
      settingsLoading,
      settingsSaving,
      setResumeFile,
      stage,
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
