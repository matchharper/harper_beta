import type { InternalCallChatSubmission } from "@/lib/career/internalCallAnswers";
import type { SimulationCardRequest } from "@/lib/career/simulation/session";
import type { User } from "@supabase/supabase-js";
import React, { createContext, useContext, useMemo, useState } from "react";
import { BrowserSessionProvider } from "./BrowserSessionDock";
import type {
  CallLiveTranscriptPlacement,
  CallTranscriptEntry,
  CareerCallStartRequest,
  CareerMockInterviewCallDisplay,
  CareerInputMode,
  CareerHistoryOpportunity,
  CareerHistoryOpportunityFeedback,
  CareerInterviewProgress,
  CareerMessage,
  CareerOpportunityFeedbackFollowUpTrigger,
  CareerOpportunityRun,
  CareerOpportunitySavedStage,
  CareerRecommendationSearchStatus,
  CareerStage,
} from "./types";
import type { TalentOnboardingInterestOptionId } from "@/lib/talentOnboarding/onboarding";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/prompts/conversationStarters";
import type { TalentUserChatMessageType } from "@/lib/talentOnboarding/onboarding";
import type { CareerOpportunityMention } from "@/lib/career/opportunityMentionText";
import type {
  CareerPendingAction,
  CareerPendingActionReference,
} from "@/lib/career/pendingActions";
import type { CareerCoachingActivity } from "@/lib/career/careerCoachingActivitySchema";
import type { CareerCoachingActivityUiAction } from "@/components/career/chat/CareerCoachingActivityCard";
import type { CareerTasksSnapshot } from "@/lib/career/taskItems";

export type CareerChatPanelContextValue = {
  user: User | null;
  conversationId: string | null;
  stage: CareerStage;
  messages: CareerMessage[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;

  authLoading: boolean;
  authPending: boolean;
  authError: string;
  authInfo: string;

  sessionPending: boolean;
  sessionError: string;
  isOnboardingDone: boolean;

  resumeFile: File | null;
  profileLinks: string[];
  profilePending: boolean;
  profileError: string;

  chatError: string;
  assistantTyping: boolean;
  toolStatusMessage: string;
  activeThinkingLogs: string[];
  activeRecommendationSearchStatus: CareerRecommendationSearchStatus | null;
  onCancelActiveRecommendationSearch?: () => void;
  onCancelChat?: () => void;
  canStopChat?: boolean;
  stopPending?: boolean;
  initialChatDraft?: string;
  initialChatDraftKey?: string;
  initialChatOpportunityMention?: CareerOpportunityMention;
  initialChatDraftReplace?: boolean;
  onboardingWrapupPending: boolean;
  thinkingLogsByMessageId: Record<string, string[]>;
  chatPending: boolean;
  chatAdmissionPending?: boolean;
  sessionReengagementPending: boolean;
  sessionReengagementThinkingLogs: string[];
  sessionReengagementRecommendationStatus: CareerRecommendationSearchStatus | null;
  sessionReengagementActionMessageId?: string | null;
  opportunityFeedbackFollowUpPending: boolean;
  opportunityFeedbackFollowUpTrigger: CareerOpportunityFeedbackFollowUpTrigger | null;
  opportunityRun: CareerOpportunityRun | null;
  unlinkedOpportunityRuns?: CareerOpportunityRun[];
  opportunitySearchLocked: boolean;
  historyUpdatingOpportunityIds: string[];
  emailOnboardingToken?: string;
  onboardingBeginPending: boolean;
  callStartPending?: boolean;
  callWrapUpPending?: boolean;
  pendingActionsOverride?: CareerPendingAction[];
  tasksOverride?: CareerTasksSnapshot;
  onboardingPausePending: boolean;

  onGoogleLogin: () => void | Promise<void>;
  onEmailAuth: (args: {
    mode: "signin" | "signup";
    email: string;
    password: string;
  }) => boolean | Promise<boolean>;

  onResumeFileChange: (file: File | null) => void;
  onProfileLinkChange: (index: number, value: string) => void;
  onRemoveProfileLink: (index: number) => void;
  onAddProfileLink: () => void;
  onProfileSubmit: () => void | Promise<void>;

  onSendChatMessage: (args: {
    formResponseMessageId?: number;
    internalCallAnswerSubmission?: InternalCallChatSubmission;
    applicationPreparationContinuation?: {sessionMessageId:number; continuationId:string};
    applicationInputSubmission?: {batchId:string; sessionMessageId:number; expectedRevision:number};
    files?: File[];
    channel?: "chat" | "voice";
    conversationStarterId?: CareerConversationStarterId;
    text: string;
    link?: string;
    messageType?: TalentUserChatMessageType;
    opportunityMentions?: CareerOpportunityMention[];
    viewedRoleId?: string;
    pendingAction?: CareerPendingActionReference;
    actionItem?: { id: string; revision: number };
    onSuccess?: () => void;
    onError?: () => void;
  }) => void | Promise<void>;
  onPrepareChatDraft?: (args: {
    opportunityMention: CareerOpportunityMention;
    text: string;
  }) => void;
  onShowSameCompanyRoles?: (
    item: CareerHistoryOpportunity,
    onOpenChat?: () => void
  ) => void;
  onStartConversationStarter?: (args: {
    mode: CareerConversationStarterMode;
    starterId: CareerConversationStarterId;
  }) => boolean | Promise<boolean>;
  onSimulationAction?: (action:SimulationCardRequest,text:string)=>void|Promise<void>;
  onUpdateCareerCoachingActivity?: (args: {
    action: CareerCoachingActivityUiAction;
    activity: CareerCoachingActivity;
  }) => boolean | Promise<boolean>;
  onRunSessionReengagement?: () => boolean | Promise<boolean>;
  onUpdateHistoryOpportunityFeedback: (
    opportunityId: string,
    feedback: CareerHistoryOpportunityFeedback | null,
    options?: {
      feedbackReason?: string | null;
      fallbackOpportunity?: CareerHistoryOpportunity;
      beforeCommit?: () => Promise<boolean>;
      interactionSource?: "position_tab";
      promptImmediately?: boolean;
      savedStage?: CareerOpportunitySavedStage | null;
    }
  ) => boolean | void | Promise<boolean | void>;
  onDeleteMessage?: (messageId: string | number) => boolean | Promise<boolean>;
  onLoadOlderMessages: () => void | Promise<void>;
  onRegenerateOnboardingWrapup?: () => void | Promise<void>;
  forceCompletePending?: boolean;
  interviewProgress: CareerInterviewProgress;
  onForceCompleteOnboarding?: () => boolean | Promise<boolean>;

  showVoiceStartPrompt: boolean;
  onUseChatOnly: () => void;
  onPauseOnboarding: () => void | Promise<void>;
  onSubmitOnboardingInterest: (
    selectedOptions: TalentOnboardingInterestOptionId[]
  ) => boolean | Promise<boolean>;
  onContinueOnboardingConversation: () => void | Promise<void>;
  inputMode: CareerInputMode;
  voiceTranscript: string;
  voiceMuted: boolean;
  onToggleVoiceMute: () => void;

  // Call mode (optional — not provided by preview.tsx)
  onStartCallMode?: (
    args?: CareerCallStartRequest
  ) => boolean | Promise<boolean>;
  onOpenHistoryOpportunity?: (roleId: string) => void;
  onEndCallMode?: (options?: { forceCompleteOnboarding?: boolean }) => void;
  callTranscriptEntries?: CallTranscriptEntry[];
  liveUserTranscriptPlacement?: CallLiveTranscriptPlacement;
  callConnectionStatus?: "connected" | "reconnecting" | "disconnected";
  isAssistantSpeaking?: boolean;
  isVoiceToolExecuting?: boolean;
  voiceActiveToolNames?: string[];
  idleWarningVisible?: boolean;
  onAcknowledgeIdleWarning?: () => void;
};

export type CareerCallContextValue = Pick<
  CareerChatPanelContextValue,
  | "callConnectionStatus"
  | "callTranscriptEntries"
  | "isAssistantSpeaking"
  | "isVoiceToolExecuting"
  | "voiceActiveToolNames"
  | "idleWarningVisible"
  | "onAcknowledgeIdleWarning"
  | "liveUserTranscriptPlacement"
  | "onEndCallMode"
  | "onToggleVoiceMute"
  | "voiceMuted"
  | "voiceTranscript"
> & {
  mockInterviewDisplay?: CareerMockInterviewCallDisplay | null;
};

export type CareerChatPanelCoreContextValue = Omit<
  CareerChatPanelContextValue,
  keyof CareerCallContextValue
>;

const CareerChatPanelContext =
  createContext<CareerChatPanelCoreContextValue | null>(null);
const CareerCallContext = createContext<CareerCallContextValue | null>(null);

type CareerChatActivityContextValue = Pick<
  CareerChatPanelCoreContextValue,
  | "inputMode"
  | "chatPending"
  | "chatAdmissionPending"
  | "assistantTyping"
  | "sessionPending"
  | "onboardingWrapupPending"
  | "opportunityFeedbackFollowUpPending"
  | "callWrapUpPending"
  | "pendingActionsOverride"
  | "tasksOverride"
  | "forceCompletePending"
  | "interviewProgress"
  | "onForceCompleteOnboarding"
>;

const CareerChatActivityContext =
  createContext<CareerChatActivityContextValue | null>(null);

type CareerChatPanelProviderProps =
  | {
      callValue: CareerCallContextValue;
      children: React.ReactNode;
      value: CareerChatPanelCoreContextValue;
    }
  | {
      callValue?: never;
      children: React.ReactNode;
      value: CareerChatPanelContextValue;
    };

export const CareerChatPanelProvider = ({
  callValue,
  value,
  children,
}: CareerChatPanelProviderProps) => {
  const userId = value.user?.id ?? null;
  const [scope, setScope] = useState({
    userId,
    conversationId: value.conversationId,
    key: 0,
  });
  // Resolving the initial ID must not remount the composer and erase its draft.
  // Keep the reset boundary for account changes and actual conversation switches.
  if (
    scope.userId !== userId ||
    (scope.conversationId && value.conversationId &&
      scope.conversationId !== value.conversationId)
  ) {
    setScope({ userId, conversationId: value.conversationId, key: scope.key + 1 });
  } else if (!scope.conversationId && value.conversationId) {
    setScope({ ...scope, conversationId: value.conversationId });
  }
  const compatibilityValue = value as CareerChatPanelContextValue;
  const resolvedCallValue = callValue ?? compatibilityValue;
  const {
    inputMode,
    chatPending,
    chatAdmissionPending,
    assistantTyping,
    sessionPending,
    onboardingWrapupPending,
    opportunityFeedbackFollowUpPending,
    callWrapUpPending,
    pendingActionsOverride,
    tasksOverride,
    forceCompletePending,
    interviewProgress,
    onForceCompleteOnboarding,
  } = value;
  const activityValue = useMemo(
    () => ({
      inputMode,
      chatPending,
      chatAdmissionPending,
      assistantTyping,
      sessionPending,
      onboardingWrapupPending,
      opportunityFeedbackFollowUpPending,
      callWrapUpPending,
      pendingActionsOverride,
      tasksOverride,
      forceCompletePending,
      interviewProgress,
      onForceCompleteOnboarding,
    }),
    [
      inputMode,
      chatPending,
      chatAdmissionPending,
      assistantTyping,
      sessionPending,
      onboardingWrapupPending,
      opportunityFeedbackFollowUpPending,
      callWrapUpPending,
      pendingActionsOverride,
      tasksOverride,
      forceCompletePending,
      interviewProgress,
      onForceCompleteOnboarding,
    ]
  );

  return (
    <CareerChatPanelContext.Provider value={value}>
      <CareerChatActivityContext.Provider value={activityValue}>
        <CareerCallContext.Provider value={resolvedCallValue}>
          <BrowserSessionProvider
            key={scope.key}
            conversationId={value.conversationId}
            enabled={Boolean(value.user)}
            messages={value.messages}
          >
            {children}
          </BrowserSessionProvider>
        </CareerCallContext.Provider>
      </CareerChatActivityContext.Provider>
    </CareerChatPanelContext.Provider>
  );
};

export const useOptionalCareerChatPanelContext = () => useContext(CareerChatPanelContext);

export const useCareerChatActivityContext = () => {
  const context = useContext(CareerChatActivityContext);
  if (!context) {
    throw new Error(
      "useCareerChatActivityContext must be used inside CareerChatPanelProvider"
    );
  }
  return context;
};

export const useCareerChatPanelContext = () => {
  const context = useContext(CareerChatPanelContext);
  if (!context) {
    throw new Error(
      "useCareerChatPanelContext must be used inside CareerChatPanelProvider"
    );
  }
  return context;
};

export const useCareerCallContext = () => {
  const context = useContext(CareerCallContext);
  if (!context) {
    throw new Error(
      "useCareerCallContext must be used inside CareerChatPanelProvider"
    );
  }
  return context;
};
