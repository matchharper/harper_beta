import { useShallow } from "zustand/react/shallow";
import { InternalCallAnswersSlot } from "./InternalCallAnswers";
import { CareerAnimatedRegion } from "../CareerAnimatedRegion";
import { CareerDailyExternalStatus } from "../CareerDailyExternalRecommendations";
import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  Building2,
  Clock3,
  FileUp,
  Loader2,
  Plus,
  Square,
} from "lucide-react";
import { useRouter } from "next/router";
import {
  useCareerChatPanelContext,
  type CareerChatPanelCoreContextValue,
} from "@/components/career/CareerChatPanelContext";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "@/components/career/CareerSidebarContext";
import { isOnboardingPaused } from "@/hooks/career/careerHelpers";
import { cn } from "@/lib/utils";
import { ActionButton, BareButton, MuteButton } from "@/components/ui/button";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import {
  ChatComposerActionMenu,
  type ChatComposerActionMenuItem,
} from "@/components/chat/ChatComposerActionMenu";
import { ChatComposerTokenOverlay } from "@/components/chat/ChatComposerTokenOverlay";
import { Input } from "@/components/ui/input";
import {
  ChatComposerPicker,
  type ChatComposerPickerItem,
  useChatComposerPickerKeyboard,
} from "@/components/chat/ChatComposerPicker";
import {
  filterCareerOpportunityMentions,
  useCareerOpportunityMentions,
} from "@/hooks/career/useCareerOpportunityMentions";
import { getCareerOpportunityTypeShortLabel } from "@/components/career/opportunityTypeMeta";
import {
  applyChatComposerPickerSelection,
  getChatComposerTriggerSearch,
} from "@/lib/chat/composerPicker";
import { getDisplayableCompanyLogoUrl } from "@/lib/imageUrl";
import { useChatComposerTokens } from "@/hooks/chat/useChatComposerTokens";
import type { CareerOpportunityMention } from "@/lib/career/opportunityMentionText";
import type { ChatComposerToken } from "@/lib/chat/composerTokens";
import { CareerQueuedMessageList } from "./CareerQueuedMessageList";
import { CareerApplicationBrowserDock, CareerApplicationProgressPanel } from "./CareerApplicationProgressPanel";
import type { CareerConversationStarterId } from "@/lib/career/prompts/conversationStarters";
import {
  toCareerPendingActionReference,
  type CareerComposerPendingAction,
  type CareerPendingAction,
  type CareerPendingCompanyRequestAction,
  type CareerPendingFitQuestionAction,
  type CareerPendingInternalOpportunityAction,
} from "@/lib/career/pendingActions";
import { CareerPendingActionContextCard } from "./CareerPendingActionContextCard";
import ChatAttachmentDraftList from "@/components/chat/ChatAttachmentDraftList";
import {
  createDraftFileAttachment,
  dedupeDraftAttachments,
  type DraftChatAttachment,
} from "@/lib/chat/attachmentClient";
import { MAX_CAREER_MESSAGE_ATTACHMENTS } from "@/lib/career/messageAttachments";
import { showToast } from "@/components/toast/toast";
import { MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES } from "@/lib/talentOnboarding/documentUploadLimits";
import CareerInitialOpportunitySearchStatus, {
  useInitialOpportunitySearchStatus,
} from "@/components/career/CareerInitialOpportunitySearchStatus";
import HistoryOpportunityRoleActions, {
  COMPANY_DETAIL_ROLE_ACTIONS,
} from "@/components/career/history/HistoryOpportunityRoleActions";
import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import { shouldShowCareerComposerRoleActions } from "@/lib/career/composerRoleActions";

const RECENT_CHAT_HISTORY_WINDOW_MS = 60 * 60 * 1000;
const CAREER_COMPOSER_MAX_ROWS = 4;
const CAREER_CHAT_FILE_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg";
const CAREER_RESUME_FILE_ACCEPT = ".pdf,.doc,.docx,.txt,.md";
type CareerComposerOpportunityMention = CareerOpportunityMention & {
  isClickable?: boolean;
};

/** A message taken out of the composer, sent now or after the running turn. */
type CareerComposerSubmission = {
  id: string;
  conversationId: string | null | undefined;
  text: string;
  files: DraftChatAttachment[];
  link: string;
  tokens: ChatComposerToken<CareerComposerOpportunityMention>[];
  pendingAction:
    | CareerPendingCompanyRequestAction
    | CareerPendingFitQuestionAction
    | import("@/lib/career/actionItems").CareerHighlightedAction
    | null;
  viewedRoleId?: string;
};

export type CareerComposerPendingActionHandler = (
  action: CareerComposerPendingAction
) => void;

type CareerComposerSectionProps = {
  showConversationActions?: boolean;
  onMessageSubmit?: () => void;
  onPendingActionHandlerChange?: (
    handler: CareerComposerPendingActionHandler | null
  ) => void;
};

const createComposerTokenId = (prefix: string) => {
  const randomId = globalThis.crypto?.randomUUID?.();
  return `${prefix}:${randomId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
};

const selectComposerChat = (chat: CareerChatPanelCoreContextValue) => ({
  user: chat.user,
  conversationId: chat.conversationId,
  stage: chat.stage,
  isOnboardingDone: chat.isOnboardingDone,
  sessionPending: chat.sessionPending,
  profilePending: chat.profilePending,
  chatPending: chat.chatPending,
  onCancelChat: chat.onCancelChat,
  canStopChat: chat.canStopChat,
  stopPending: chat.stopPending,
  sessionReengagementPending: chat.sessionReengagementPending,
  assistantTyping: chat.assistantTyping,
  opportunityFeedbackFollowUpPending: chat.opportunityFeedbackFollowUpPending,
  initialChatDraft: chat.initialChatDraft,
  initialChatDraftKey: chat.initialChatDraftKey,
  initialChatOpportunityMention: chat.initialChatOpportunityMention,
  initialChatDraftReplace: chat.initialChatDraftReplace,
  onboardingBeginPending: chat.onboardingBeginPending,
  onboardingWrapupPending: chat.onboardingWrapupPending,
  callStartPending: chat.callStartPending,
  callWrapUpPending: chat.callWrapUpPending,
  forceCompletePending: chat.forceCompletePending,
  interviewProgress: chat.interviewProgress,
  onboardingPausePending: chat.onboardingPausePending,
  showVoiceStartPrompt: chat.showVoiceStartPrompt,
  inputMode: chat.inputMode,
  onSendChatMessage: chat.onSendChatMessage,
  onRunSessionReengagement: chat.onRunSessionReengagement,
  onStartCallMode: chat.onStartCallMode,
  onStartConversationStarter: chat.onStartConversationStarter,
  onOpenHistoryOpportunity: chat.onOpenHistoryOpportunity,
  onForceCompleteOnboarding: chat.onForceCompleteOnboarding,
  opportunityRun: chat.opportunityRun,
});

type CareerComposerContentProps = CareerComposerSectionProps & {
  chat: ReturnType<typeof selectComposerChat>;
  onboardingPaused: boolean;
  hasRecentChatHistory: boolean;
} & Pick<
    ReturnType<typeof useCareerSidebarContext>,
    "onRequestMoreOpenPositions"
  > &
  Pick<
    ReturnType<typeof useCareerProfileContext>,
    "onSaveTalentProfile" | "profileSavePending"
  >;

const CareerComposerSection = (props: CareerComposerSectionProps) => {
  const panel = useCareerChatPanelContext();
  const chat = useShallow(selectComposerChat)(panel);
  const [recentChatCutoffMs] = useState(
    () => Date.now() - RECENT_CHAT_HISTORY_WINDOW_MS
  );
  const { onRequestMoreOpenPositions } = useCareerSidebarContext();
  const { onSaveTalentProfile, profileSavePending } = useCareerProfileContext();
  const hasRecentChatHistory = panel.messages.some((message) => {
    if ((message.messageType ?? "chat") !== "chat") return false;
    const createdAtMs = Date.parse(message.createdAt);
    return Number.isFinite(createdAtMs) && createdAtMs > recentChatCutoffMs;
  });
  return (
    <CareerComposerContent
      {...props}
      chat={chat}
      onRequestMoreOpenPositions={onRequestMoreOpenPositions}
      onSaveTalentProfile={onSaveTalentProfile}
      profileSavePending={profileSavePending}
      onboardingPaused={isOnboardingPaused(panel.messages)}
      hasRecentChatHistory={hasRecentChatHistory}
    />
  );
};

const CareerComposerContent = React.memo(function CareerComposerContent({
  showConversationActions = true,
  onMessageSubmit,
  onPendingActionHandlerChange,
  chat,
  onRequestMoreOpenPositions,
  onSaveTalentProfile,
  profileSavePending,
  onboardingPaused,
  hasRecentChatHistory,
}: CareerComposerContentProps) {
  const {
    user,
    conversationId,
    stage,
    isOnboardingDone,
    sessionPending,
    profilePending,
    chatPending,
    onCancelChat,
    canStopChat,
    stopPending,
    sessionReengagementPending,
    assistantTyping,
    opportunityFeedbackFollowUpPending,
    initialChatDraft,
    initialChatDraftKey,
    initialChatOpportunityMention,
    initialChatDraftReplace = false,
    onboardingBeginPending,
    onboardingWrapupPending,
    callStartPending = false,
    callWrapUpPending = false,
    forceCompletePending = false,
    interviewProgress,
    onboardingPausePending,
    showVoiceStartPrompt,
    inputMode,
    onSendChatMessage,
    onRunSessionReengagement,
    onStartCallMode,
    onStartConversationStarter,
    onOpenHistoryOpportunity,
    onForceCompleteOnboarding,
    opportunityRun,
  } = chat;
  const t = useCareerT();
  const router = useRouter();
  const opportunityMentionListId = useId();
  const companyJobsOpportunity = useCareerWorkspaceUiStore(
    (state) => state.companyJobsOpportunity
  );
  const currentRoleActionOpportunity = useCareerWorkspaceUiStore(
    (state) => state.desktopRoleActionOpportunity
  );
  const currentRoleActionScope = useCareerWorkspaceUiStore(
    (state) => state.desktopRoleActionScope
  );

  const desktopRoleActionOpportunity =
    companyJobsOpportunity ?? currentRoleActionOpportunity;
  const desktopRoleActionScope = companyJobsOpportunity
    ? "company"
    : currentRoleActionScope;

  const logCareerEvent = useCareerLogEvent();

  const initialDraftText = initialChatDraft?.trim() ?? "";
  const [draft, setDraft] = useState(() => initialDraftText);
  const [opportunityMentionSearch, setOpportunityMentionSearch] = useState<{
    query: string;
    start: number;
  } | null>(null);
  const [chatLinkDraft, setChatLinkDraft] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [fileUploadPending, setFileUploadPending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<DraftChatAttachment[]>([]);
  const [queuedSubmissions, setQueuedSubmissions] = useState<
    CareerComposerSubmission[]
  >([]);
  const [queuedDispatchPending, setQueuedDispatchPending] = useState(false);
  const [recommendationRequestPending, setRecommendationRequestPending] =
    useState(false);
  const [conversationStarterPending, setConversationStarterPending] =
    useState(false);
  const [mobileActionMenuOpen, setMobileActionMenuOpen] = useState(false);
  const [desktopActionMenuOpen, setDesktopActionMenuOpen] = useState(false);
  const [selectedPendingAction, setSelectedPendingAction] = useState<
    | CareerPendingCompanyRequestAction
    | CareerPendingFitQuestionAction
    | import("@/lib/career/actionItems").CareerHighlightedAction
    | null
  >(null);
  const [pendingQuestionExpanded, setPendingQuestionExpanded] = useState(false);
  const pendingActionHandlerRef =
    useRef<CareerComposerPendingActionHandler | null>(null);
  const [resumeInterviewRequest, setResumeInterviewRequest] = useState<{
    conversationId: string | null;
    requested: boolean;
  }>({
    conversationId: null,
    requested: false,
  });
  const [textareaResetVersion, setTextareaResetVersion] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const actionMenuFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingResumeRequestTokenRef = useRef<string | null>(null);
  const opportunityMentionHighlightRef = useRef<HTMLDivElement | null>(null);
  const handleMobileActionMenuOpenChange = useCallback(
    (open: boolean) => {
      setMobileActionMenuOpen(open);
      if (open) logCareerEvent("click_chat_composer_add");
    },
    [logCareerEvent]
  );
  const handleDesktopActionMenuOpenChange = useCallback(
    (open: boolean) => {
      setDesktopActionMenuOpen(open);
      if (open) logCareerEvent("click_chat_composer_add");
    },
    [logCareerEvent]
  );
  const handleComposerActionMenuItemSelect = useCallback(
    (item: ChatComposerActionMenuItem) => {
      logCareerEvent("click_chat_composer_action_menu_item", {
        actionId: item.id,
      });
    },
    [logCareerEvent]
  );
  const opportunityTokens =
    useChatComposerTokens<CareerComposerOpportunityMention>({
      onValueChange: setDraft,
      textareaRef,
      value: draft,
    });
  const isComposingRef = useRef(false);
  const initialDraftFocusKey =
    initialChatDraftKey?.trim() || initialDraftText || null;
  const focusedInitialDraftKeyRef = useRef<string | null>(null);
  const appliedInitialDraftKeyRef = useRef(
    initialChatDraftKey?.trim() || initialDraftText || null
  );
  const appliedInitialDraftTextRef = useRef(initialDraftText);
  const appliedInitialOpportunityMentionKeyRef = useRef<string | null>(null);
  const isStartingCall =
    (onboardingBeginPending && !callWrapUpPending) || callStartPending;
  const isWorkflowPending = isStartingCall || callWrapUpPending;
  const initialOpportunitySearchStatus =
    useInitialOpportunitySearchStatus(opportunityRun);

  const isTextInputLocked =
    !user ||
    !conversationId ||
    sessionPending ||
    stage === "profile" ||
    showVoiceStartPrompt ||
    profilePending ||
    isWorkflowPending ||
    onboardingPausePending;
  const isComposerActionLocked =
    isTextInputLocked || stopPending;
  const isComposerBusy =
    chatPending || assistantTyping || opportunityFeedbackFollowUpPending;
  const opportunityMentions = useCareerOpportunityMentions({
    enabled: Boolean(opportunityMentionSearch) && !isTextInputLocked,
    userId: user?.id,
  });
  const mentionQuery = opportunityMentionSearch?.query ?? "";
  const mentionOpportunities = useMemo(
    () =>
      filterCareerOpportunityMentions(
        opportunityMentions.opportunities,
        mentionQuery
      ),
    [opportunityMentions.opportunities, mentionQuery]
  );
  const resumeInterviewRequested =
    resumeInterviewRequest.requested &&
    resumeInterviewRequest.conversationId === conversationId;

  const syncOpportunityMentionHighlight = useCallback(
    (textarea: HTMLTextAreaElement | null) => {
      const highlight = opportunityMentionHighlightRef.current;
      if (!textarea || !highlight) return;

      highlight.style.left = `${textarea.offsetLeft}px`;
      highlight.style.top = `${textarea.offsetTop}px`;
      highlight.style.width = `${textarea.clientWidth}px`;
      highlight.style.height = `${textarea.clientHeight}px`;
      highlight.scrollTop = textarea.scrollTop;
    },
    []
  );

  useLayoutEffect(() => {
    syncOpportunityMentionHighlight(textareaRef.current);
  }, [draft, syncOpportunityMentionHighlight]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !window.ResizeObserver) return;
    const observer = new window.ResizeObserver(() =>
      syncOpportunityMentionHighlight(textarea)
    );
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [syncOpportunityMentionHighlight]);

  useEffect(() => {
    if (!initialDraftFocusKey) return;
    let animationFrameId: number | null = null;

    if (
      inputMode !== "text" ||
      isTextInputLocked ||
      focusedInitialDraftKeyRef.current === initialDraftFocusKey
    ) {
      return;
    }

    focusedInitialDraftKeyRef.current = initialDraftFocusKey;
    animationFrameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [initialDraftFocusKey, inputMode, isTextInputLocked]);

  useEffect(() => {
    const nextInitialDraftKey =
      initialChatDraftKey?.trim() || initialDraftText || null;
    if (!nextInitialDraftKey) return;
    if (appliedInitialDraftKeyRef.current === nextInitialDraftKey) return;

    const previousInitialDraftText = appliedInitialDraftTextRef.current;
    appliedInitialDraftKeyRef.current = nextInitialDraftKey;
    appliedInitialDraftTextRef.current = initialDraftText;

    setDraft((currentDraft) => {
      if (initialChatDraftReplace) return initialDraftText;
      if (currentDraft && currentDraft !== previousInitialDraftText) {
        return currentDraft;
      }
      return initialDraftText;
    });
  }, [initialChatDraftKey, initialChatDraftReplace, initialDraftText]);

  useEffect(() => {
    const mentionLabel = initialChatOpportunityMention?.label.trim() ?? "";
    const mentionRoleId = initialChatOpportunityMention?.roleId.trim() ?? "";
    if (!initialDraftFocusKey || !mentionLabel || !mentionRoleId) return;
    if (draft !== initialDraftText) return;

    const mentionKey = `${initialDraftFocusKey}:${mentionRoleId}:${mentionLabel}`;
    if (appliedInitialOpportunityMentionKeyRef.current === mentionKey) return;

    const start = initialDraftText.indexOf(mentionLabel);
    if (start < 0) return;

    appliedInitialOpportunityMentionKeyRef.current = mentionKey;
    opportunityTokens.replaceTokens([
      {
        data: {
          isClickable: false,
          label: mentionLabel,
          roleId: mentionRoleId,
          ...(initialChatOpportunityMention?.targetKind
            ? { targetKind: initialChatOpportunityMention.targetKind }
            : {}),
        },
        end: start + mentionLabel.length,
        id: `official-job:${mentionRoleId}`,
        start,
        text: mentionLabel,
      },
    ]);
  }, [
    draft,
    initialChatOpportunityMention,
    initialDraftFocusKey,
    initialDraftText,
    opportunityTokens,
  ]);

  const composerPlaceholder = (() => {
    if (!user) {
      return t(
        "career.chat.career_composer_section.1g4p5ul",
        "로그인 후 대화를 시작할 수 있습니다."
      );
    }
    if (stage === "profile") {
      return t(
        "career.chat.career_composer_section.19raxy2",
        "기본 정보 제출 후 대화가 시작됩니다."
      );
    }
    if (showVoiceStartPrompt) {
      return t(
        "career.chat.career_composer_section.1i8zl29",
        "아래 시작 버튼으로 대화를 시작해 주세요."
      );
    }
    if (callWrapUpPending) {
      return t(
        "career.chat.career_composer_section.0bxwclq",
        "통화 내용을 정리하는 중입니다."
      );
    }
    if (onboardingWrapupPending) {
      return t(
        "career.chat.career_composer_section.0bxwclq",
        "통화 내용을 정리하는 중입니다."
      );
    }
    if (onboardingPaused) {
      return t(
        "career.chat.career_composer_section.1rqak4s",
        "바로 입력하면 대화가 이어집니다."
      );
    }
    if (profilePending) {
      return t(
        "career.chat.career_composer_section.041n9nc",
        "이력서와 링크를 분석 중입니다."
      );
    }
    if (opportunityFeedbackFollowUpPending) {
      return t(
        "career.chat.career_timeline_section.0qzkj18",
        "다음 프로세스를 확인하고 있어요."
      );
    }
    if (selectedPendingAction) {
      return t(
        "career.chat.career_composer_section.selected_request_placeholder",
        "선택한 요청에 바로 답변해 주세요."
      );
    }
    if (stage === "completed") {
      return t(
        "career.chat.career_composer_section.0e686ow",
        "새로운 조건이나 궁금한 점을 남겨주세요"
      );
    }
    return t(
      "career.chat.career_composer_section.017fk2m",
      "원하는 방향을 편하게 말해주세요. @로 기회를 골라 물어볼 수 있어요."
    );
  })();

  const hasDraftText = draft.trim().length > 0;
  const hasSendableDraft = hasDraftText || pendingFiles.length > 0;

  const showInterviewComposerFrame =
    Boolean(user) &&
    stage === "chat" &&
    !isOnboardingDone &&
    !showVoiceStartPrompt &&
    inputMode === "text";
  const showManualCompletionAction =
    showInterviewComposerFrame &&
    interviewProgress.canForceComplete &&
    Boolean(onForceCompleteOnboarding);
  const showResumeInterviewAction =
    showInterviewComposerFrame &&
    !hasRecentChatHistory &&
    Boolean(onRunSessionReengagement);
  const resumeInterviewDisabled =
    resumeInterviewRequested ||
    sessionReengagementPending ||
    isComposerActionLocked ||
    onboardingWrapupPending ||
    onboardingPausePending;
  const manualCompletionDisabled =
    forceCompletePending ||
    onboardingWrapupPending ||
    chatPending ||
    assistantTyping ||
    opportunityFeedbackFollowUpPending;

  const closeOpportunityMentionPicker = useCallback(
    () => setOpportunityMentionSearch(null),
    []
  );
  const handleSelectOpportunityMention = useCallback(
    (opportunity: (typeof mentionOpportunities)[number]) => {
      if (!opportunityMentionSearch) return;
      const textarea = textareaRef.current;
      const currentDraft = textarea?.value ?? draft;
      const cursor = textarea?.selectionStart ?? currentDraft.length;
      const label = `${opportunity.companyName} · ${opportunity.title}`;
      const selection = applyChatComposerPickerSelection({
        cursor,
        search: opportunityMentionSearch,
        selectedText: label,
        value: currentDraft,
      });
      opportunityTokens.insertToken({
        cursor: selection.cursor,
        data: { label, roleId: opportunity.roleId },
        end: selection.selectedEnd,
        id: createComposerTokenId(opportunity.id),
        start: selection.selectedStart,
        text: label,
        value: selection.value,
      });
      closeOpportunityMentionPicker();
    },
    [
      closeOpportunityMentionPicker,
      draft,
      opportunityMentionSearch,
      opportunityTokens,
    ]
  );
  const opportunityPickerItems: ChatComposerPickerItem[] = [
    {
      id: "title",
      text: t(
        "career.chat.career_composer_section.opportunity_picker_title",
        "추천 기회"
      ),
      trailingText:
        mentionOpportunities.length > 0
          ? t(
              "career.chat.career_composer_section.opportunity_picker_count",
              "{count}개",
              { values: { count: mentionOpportunities.length } }
            )
          : undefined,
      type: "text",
    },
    ...(opportunityMentions.isPending && mentionOpportunities.length === 0
      ? [
          {
            announcement: "status" as const,
            icon: <Loader2 className="animate-spin" />,
            id: "loading",
            text: t(
              "career.chat.career_composer_section.opportunity_picker_loading",
              "추천 기회를 불러오는 중"
            ),
            type: "text" as const,
          },
        ]
      : opportunityMentions.error && mentionOpportunities.length === 0
        ? [
            {
              announcement: "alert" as const,
              id: "error",
              text: t(
                "career.chat.career_composer_section.opportunity_picker_error",
                "추천 기회를 불러오지 못했습니다."
              ),
              tone: "critical" as const,
              type: "text" as const,
            },
          ]
        : mentionOpportunities.length === 0
          ? [
              {
                id: "empty",
                text: t(
                  "career.chat.career_composer_section.opportunity_picker_empty",
                  "추천된 기회가 없습니다."
                ),
                type: "text" as const,
              },
            ]
          : mentionOpportunities.map((opportunity) => {
              const companyLogoUrl = getDisplayableCompanyLogoUrl(
                opportunity.companyLogoUrl
              );
              return {
                icon: <Building2 />,
                id: opportunity.id,
                imageAlt: "",
                imageSrc: companyLogoUrl,
                onSelect: () => handleSelectOpportunityMention(opportunity),
                subText: opportunity.companyName,
                text: opportunity.title,
                trailingText: getCareerOpportunityTypeShortLabel(
                  opportunity.opportunityType,
                  t
                ),
                type: "option" as const,
              };
            })),
    ...(opportunityMentions.hasNextPage
      ? [
          {
            disabled: opportunityMentions.isFetchingNextPage,
            icon: opportunityMentions.isFetchingNextPage ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Plus className="h-5 w-5" strokeWidth={1.6} />
            ),
            id: "load-more",
            onSelect: () => {
              void opportunityMentions.fetchNextPage();
            },
            text: t(
              "career.chat.career_composer_section.opportunity_picker_load_more",
              "더 불러오기"
            ),
            type: "action" as const,
          },
        ]
      : []),
  ];
  const {
    activeDescendantId: opportunityMentionActiveDescendantId,
    highlightedIndex: opportunityMentionHighlightedIndex,
    navigationDirection: opportunityMentionNavigationDirection,
    onKeyDown: handleOpportunityMentionKeyDown,
    resetHighlight: resetOpportunityMentionHighlight,
    setHighlightedIndex: setOpportunityMentionHighlightedIndex,
  } = useChatComposerPickerKeyboard({
    isOpen: Boolean(opportunityMentionSearch) && !isTextInputLocked,
    items: opportunityPickerItems,
    listId: opportunityMentionListId,
    onClose: closeOpportunityMentionPicker,
  });
  const updateOpportunityMentionSearch = useCallback(
    (value: string, cursor: number) => {
      setOpportunityMentionSearch(
        getChatComposerTriggerSearch({
          cursor,
          triggers: ["@"],
          value,
        })
      );
      resetOpportunityMentionHighlight();
    },
    [resetOpportunityMentionHighlight]
  );

  const resetDraftField = () => {
    setDraft("");
    opportunityTokens.resetTokens();
    closeOpportunityMentionPicker();
    setTextareaResetVersion((version) => version + 1);
  };

  const focusComposerAfterMenuSelection = useCallback(() => {
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const insertPendingOpportunityMention = useCallback(
    (action: CareerPendingInternalOpportunityAction) => {
      const existingToken = opportunityTokens.tokens.find(
        (token) => token.data.roleId === action.roleId
      );
      if (existingToken) {
        window.requestAnimationFrame(() => {
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(
            existingToken.end,
            existingToken.end
          );
        });
        return;
      }

      const textarea = textareaRef.current;
      const currentDraft = textarea?.value ?? draft;
      const cursor = textarea?.selectionStart ?? currentDraft.length;
      const before = currentDraft.slice(0, cursor);
      const after = currentDraft.slice(cursor);
      const leadingSpace = before && !/\s$/u.test(before) ? " " : "";
      const trailingSpace = after && /^\s/u.test(after) ? "" : " ";
      const label = `${action.companyName} · ${action.roleTitle}`;
      const selectedStart = before.length + leadingSpace.length;
      const selectedEnd = selectedStart + label.length;
      const value = `${before}${leadingSpace}${label}${trailingSpace}${after}`;

      opportunityTokens.insertToken({
        cursor: selectedEnd + trailingSpace.length,
        data: { label, roleId: action.roleId },
        end: selectedEnd,
        id: createComposerTokenId(action.id),
        start: selectedStart,
        text: label,
        value,
      });
      closeOpportunityMentionPicker();
    },
    [closeOpportunityMentionPicker, draft, opportunityTokens]
  );

  const handleOpenPendingOpportunity = (roleId: string) => {
    const normalizedRoleId = roleId.trim();
    if (!normalizedRoleId) return;
    if (onOpenHistoryOpportunity) {
      onOpenHistoryOpportunity(normalizedRoleId);
      return;
    }
    const query: Record<string, string> = {
      historyTab: "new",
      id: normalizedRoleId,
    };
    for (const key of ["invite", "mail", "email_onboarding"] as const) {
      const value = router.query[key];
      const singleValue = Array.isArray(value) ? value[0] : value;
      if (singleValue) query[key] = singleValue;
    }
    void router.push({ pathname: "/career/history", query }, undefined, {
      scroll: false,
      shallow: true,
    });
  };

  const handleSelectPendingAction = useCallback(
    (action: CareerPendingAction | CareerComposerPendingAction) => {
      if (
        action.kind === "action_item" &&
        action.action.type === "send_message"
      ) {
        void onSendChatMessage({
          text: action.action.text,
          actionItem: { id: action.id, revision: action.revision },
        });
        return;
      }
      if (action.kind === "career_check_in_call") {
        logCareerEvent("click_chat_composer_pending_call", {
          callId: action.callRequest.id,
          callKind: action.kind,
        });
        void onStartConversationStarter?.({
          mode: "call",
          starterId: "career_check_in",
        });
        return;
      }
      if (action.kind === "internal_opportunity_call") {
        logCareerEvent("click_chat_composer_pending_call", {
          callId: action.callRequest.id,
          roleId: action.callRequest.roleId,
        });
        void onStartCallMode?.({
          internalCallRequestId: action.callRequest.id,
        });
        return;
      }
      if (action.kind === "internal_opportunity") {
        logCareerEvent("click_chat_composer_pending_action", {
          actionId: action.id,
          actionKind: action.kind,
        });
        insertPendingOpportunityMention(action);
        return;
      }
      logCareerEvent("click_chat_composer_pending_action", {
        actionId: action.id,
        actionKind: action.kind,
      });
      setSelectedPendingAction(action);
      setPendingQuestionExpanded(false);
      focusComposerAfterMenuSelection();
    },
    [
      focusComposerAfterMenuSelection,
      insertPendingOpportunityMention,
      logCareerEvent,
      onStartConversationStarter,
      onStartCallMode,
      onSendChatMessage,
    ]
  );

  useLayoutEffect(() => {
    pendingActionHandlerRef.current = handleSelectPendingAction;
  }, [handleSelectPendingAction]);
  const handleExternalPendingAction = useCallback(
    (action: CareerComposerPendingAction) =>
      pendingActionHandlerRef.current?.(action),
    []
  );

  useEffect(() => {
    onPendingActionHandlerChange?.(handleExternalPendingAction);
    return () => onPendingActionHandlerChange?.(null);
  }, [handleExternalPendingAction, onPendingActionHandlerChange]);

  /** Moves the current input out of the composer, or returns null if nothing can be sent. */
  const takeComposerSubmission = (): CareerComposerSubmission | null => {
    const text = (textareaRef.current?.value ?? draft).trim();
    const files = pendingFiles;
    if (!text && !files.length) return null;
    if (files.length > MAX_CAREER_MESSAGE_ATTACHMENTS) {
      showToast({ message: t("career.chat.attachment_limit", "파일은 한 번에 5개까지 보낼 수 있어요."), variant: "white" });
      return null;
    }
    if (isComposerActionLocked) return null;

    const submission: CareerComposerSubmission = {
      id: crypto.randomUUID(),
      conversationId,
      text,
      files,
      link: chatLinkDraft.trim(),
      tokens: opportunityTokens.tokens,
      pendingAction: selectedPendingAction,
      viewedRoleId:
        router.query.tab?.[0] === "history" &&
        typeof router.query.id === "string"
          ? router.query.id
          : undefined,
    };
    resetDraftField();
    setChatLinkDraft("");
    setShowLinkInput(false);
    setSelectedPendingAction(null);
    setPendingQuestionExpanded(false);
    setPendingFiles([]);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
    return submission;
  };

  const sendComposerSubmission = async (submission: CareerComposerSubmission) => {
    const {
      text,
      files: submittedFiles,
      link,
      tokens: submittedTokens,
      pendingAction: submittedPendingAction,
      viewedRoleId,
    } = submission;
    const submittedMentions = submittedTokens.map((token) => token.data);

    logCareerEvent(
      link ? "click_chat_send_message_with_link" : "click_chat_send_message"
    );
    let sendFailed = false;
    await onSendChatMessage({
      text,
      files: submittedFiles.flatMap(attachment => attachment.kind === "file" ? [attachment.file] : []),
      link,
      opportunityMentions: submittedMentions,
      viewedRoleId,
      actionItem:
        submittedPendingAction?.kind === "action_item"
          ? {
              id: submittedPendingAction.id,
              revision: submittedPendingAction.revision,
            }
          : undefined,
      pendingAction:
        submittedPendingAction && submittedPendingAction.kind !== "action_item"
          ? toCareerPendingActionReference(submittedPendingAction)
          : undefined,
      onError: () => {
        sendFailed = true;
        setDraft((current) => current || text);
        opportunityTokens.replaceTokens(submittedTokens);
        setChatLinkDraft((current) => current || link);
        if (link) setShowLinkInput(true);
        if (submittedPendingAction) {
          setSelectedPendingAction(
            (current) => current ?? submittedPendingAction
          );
        }
        if (submittedFiles.length) {
          setPendingFiles(current => current.reduce(dedupeDraftAttachments, submittedFiles));
        }
      },
    });
  };

  const handleSend = async () => {
    const submission = takeComposerSubmission();
    if (!submission) return;
    onMessageSubmit?.();
    await sendComposerSubmission(submission);
  };

  // Cmd/Ctrl+Enter waits for the running turn instead of joining it.
  const handleQueueSend = () => {
    if (!canStopChat) {
      void handleSend();
      return;
    }
    const submission = takeComposerSubmission();
    if (!submission) return;
    onMessageSubmit?.();
    logCareerEvent("click_chat_queue_message");
    setQueuedSubmissions((current) => [...current, submission]);
  };

  const sendComposerSubmissionRef = useRef(sendComposerSubmission);
  useLayoutEffect(() => {
    sendComposerSubmissionRef.current = sendComposerSubmission;
  });
  // A queue belongs to the conversation it was written in.
  const conversationQueuedSubmissions = useMemo(
    () =>
      queuedSubmissions.filter(
        (submission) => submission.conversationId === conversationId
      ),
    [conversationId, queuedSubmissions]
  );
  const nextQueuedSubmission = conversationQueuedSubmissions[0];
  useEffect(() => {
    if (!nextQueuedSubmission || queuedDispatchPending) return;
    if (canStopChat || isComposerActionLocked) return;
    setQueuedSubmissions((current) =>
      current.filter((item) => item.id !== nextQueuedSubmission.id)
    );
    setQueuedDispatchPending(true);
    void sendComposerSubmissionRef.current(nextQueuedSubmission).finally(() =>
      setQueuedDispatchPending(false)
    );
  }, [
    canStopChat,
    isComposerActionLocked,
    nextQueuedSubmission,
    queuedDispatchPending,
  ]);

  const handleStopChat = () => {
    setQueuedSubmissions([]);
    onCancelChat?.();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing = event.nativeEvent.isComposing || isComposingRef.current;
    if (
      opportunityMentionSearch &&
      !(event.key === "Enter" && isComposing) &&
      handleOpportunityMentionKeyDown(event)
    ) {
      return;
    }
    if (opportunityTokens.handleKeyDown(event)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      if (isComposing) return;
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) handleQueueSend();
      else void handleSend();
    }
  };

  const handleForceComplete = () => {
    if (!onForceCompleteOnboarding || manualCompletionDisabled) return;
    logCareerEvent("click_chat_force_complete");
    void onForceCompleteOnboarding();
  };

  const handleResumeInterview = () => {
    if (
      !onRunSessionReengagement ||
      resumeInterviewDisabled ||
      resumeInterviewRequested
    ) {
      return;
    }
    setResumeInterviewRequest({
      conversationId,
      requested: true,
    });
    logCareerEvent("click_chat_resume_interview_reengagement");
    void onRunSessionReengagement();
  };

  const handleActionMenuFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length || fileUploadPending || profileSavePending) return;
    if (files.some(file => file.size > MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES)) {
      showToast({
        message: t(
          "career.resume_dropzone.file_too_large_generic",
          "파일은 최대 20MB까지 업로드할 수 있습니다."
        ),
        variant: "white",
      });
      pendingResumeRequestTokenRef.current = null;
      return;
    }

    logCareerEvent("click_chat_composer_upload_file");
    const resumeRequestToken = pendingResumeRequestTokenRef.current;
    pendingResumeRequestTokenRef.current = null;
    setFileUploadPending(true);
    try {
      if (resumeRequestToken) {
        const saved = await onSaveTalentProfile({
          persistError: true,
          resumeFile: files[0],
          resumeRequestToken,
        });
        if (saved) {
          setSelectedPendingAction(null);
          setPendingQuestionExpanded(false);
        }
      } else {
        const additions = files.map(createDraftFileAttachment);
        setPendingFiles(current => additions.reduce(dedupeDraftAttachments, current));
        focusComposerAfterMenuSelection();
      }
    } finally {
      setFileUploadPending(false);
    }
  };

  const openGenericFilePicker = () => {
    pendingResumeRequestTokenRef.current = null;
    const input = actionMenuFileInputRef.current;
    if (!input) return;
    input.multiple = true;
    input.accept = CAREER_CHAT_FILE_ACCEPT;
    input.click();
  };

  const openPendingResumePicker = (
    action: CareerPendingCompanyRequestAction
  ) => {
    if (!action.resumeRequestToken) return;
    pendingResumeRequestTokenRef.current = action.resumeRequestToken;
    const input = actionMenuFileInputRef.current;
    if (!input) return;
    input.multiple = false;
    input.accept = CAREER_RESUME_FILE_ACCEPT;
    input.click();
  };

  const handleRequestMoreOpenPositions = async () => {
    if (
      recommendationRequestPending ||
      isComposerActionLocked ||
      !isOnboardingDone ||
      !onRequestMoreOpenPositions
    ) {
      return;
    }

    logCareerEvent("click_chat_composer_request_more_open_positions");
    setRecommendationRequestPending(true);
    try {
      await onRequestMoreOpenPositions();
    } finally {
      setRecommendationRequestPending(false);
    }
  };

  const handleStartConversationStarter = async (
    starterId: CareerConversationStarterId
  ) => {
    if (
      conversationStarterPending ||
      isComposerActionLocked ||
      !isOnboardingDone ||
      !onStartConversationStarter
    ) {
      return;
    }

    logCareerEvent("click_chat_composer_conversation_starter", {
      starterId,
    });
    setConversationStarterPending(true);
    try {
      await onStartConversationStarter({
        mode: starterId === "career_coaching" ? "chat" : "call",
        starterId,
      });
    } finally {
      setConversationStarterPending(false);
    }
  };

  const fileUploadDisabled =
    !user || fileUploadPending || profileSavePending || isComposerActionLocked;
  const recommendationRequestDisabled =
    !isOnboardingDone ||
    !onRequestMoreOpenPositions ||
    recommendationRequestPending ||
    isComposerActionLocked;
  const conversationStarterDisabled =
    !isOnboardingDone ||
    !onStartConversationStarter ||
    conversationStarterPending ||
    isComposerActionLocked;
  const composerActionMenuItems: ChatComposerActionMenuItem[] = [
    {
      disabled: fileUploadDisabled,
      icon: <FileUp />,
      id: "upload-file",
      label: t(
        "career.chat.career_composer_section.action_menu_upload_file",
        "파일 업로드"
      ),
      loading: fileUploadPending || profileSavePending,
      onSelect: openGenericFilePicker,
      trailingText: t(
        "career.chat.career_composer_section.action_menu_upload_file_hint",
        "문서, 이미지 · 최대 20MB"
      ),
      // trailingText: "PDF, DOCX, TXT",
    },
  ];

  const composerActionsHidden = !shouldShowCareerComposerRoleActions(draft);
  const composerActions =
    showConversationActions ? (
      desktopRoleActionOpportunity ? (
        <div key={desktopRoleActionOpportunity.id} className="hidden md:block">
          <HistoryOpportunityRoleActions
            item={desktopRoleActionOpportunity}
            variant="tags"
            visibleActions={
              desktopRoleActionScope === "company"
                ? COMPANY_DETAIL_ROLE_ACTIONS
                : undefined
            }
          />
        </div>
      ) : isOnboardingDone ? (
        <>
          <MuteButton
            size="sm"
            disabled={recommendationRequestDisabled}
            aria-busy={recommendationRequestPending || undefined}
            onClick={() => void handleRequestMoreOpenPositions()}
          >
            {recommendationRequestPending
              ? t(
                  "career.common.conversation_starters.requesting_more_open_positions",
                  "요청 중..."
                )
              : t(
                  "career.common.conversation_starters.more_open_positions",
                  "기회 더 찾아줘"
                )}
          </MuteButton>
          <MuteButton
            size="sm"
            disabled={conversationStarterDisabled}
            aria-busy={conversationStarterPending || undefined}
            onClick={() =>
              void handleStartConversationStarter("career_coaching")
            }
          >
            {conversationStarterPending ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : null}
            {t("career.common.conversation_starters.1sfi8z4", "커리어 상담")}
          </MuteButton>
        </>
      ) : null
    ) : null;

  return (
    <div
      data-vaul-no-drag=""
      className="career-composer-section shrink-0 px-4 pb-3 pt-2 md:px-5 md:pb-7 md:pt-0"
    >
      <div className="career-composer-width relative mx-auto w-full">
        <CareerApplicationBrowserDock conversationId={conversationId} />
        <CareerDailyExternalStatus />
        <CareerApplicationProgressPanel conversationId={conversationId} />
        <InternalCallAnswersSlot>
          {initialOpportunitySearchStatus ? (
            <CareerInitialOpportunitySearchStatus
              status={initialOpportunitySearchStatus}
              variant="composer"
            />
          ) : null}
          <React.Fragment>
            {composerActions ? (
              <div
                className={cn("mb-2 flex items-center gap-2 overflow-x-auto", composerActionsHidden && "invisible")}
                aria-hidden={composerActionsHidden}
                inert={composerActionsHidden}
              >
                {composerActions}
              </div>
            ) : null}
            <CareerAnimatedRegion open={Boolean(selectedPendingAction)}>
              {selectedPendingAction ? (
                <div className="career-reply-slot">
                  <CareerPendingActionContextCard
                    key={selectedPendingAction.id}
                    action={selectedPendingAction}
                    expanded={pendingQuestionExpanded}
                    onDismiss={() => {
                      setSelectedPendingAction(null);
                      setPendingQuestionExpanded(false);
                      window.requestAnimationFrame(() =>
                        textareaRef.current?.focus()
                      );
                    }}
                    onUploadResume={
                      selectedPendingAction.kind === "company_request" &&
                      selectedPendingAction.requestMode === "resume" &&
                      selectedPendingAction.resumeRequestToken
                        ? () => openPendingResumePicker(selectedPendingAction)
                        : undefined
                    }
                    onToggleExpanded={() =>
                      setPendingQuestionExpanded((current) => !current)
                    }
                    resumeUploadPending={
                      fileUploadPending || profileSavePending
                    }
                  />
                </div>
              ) : null}
            </CareerAnimatedRegion>
            <CareerAnimatedRegion
              open={conversationQueuedSubmissions.length > 0}
            >
              {conversationQueuedSubmissions.length > 0 ? (
                <div className="career-reply-slot">
                  <CareerQueuedMessageList
                    items={conversationQueuedSubmissions.map((submission) => ({
                      id: submission.id,
                      text: submission.text,
                      fileNames: submission.files.map((file) => file.name),
                    }))}
                    onRemove={(id) =>
                      setQueuedSubmissions((current) =>
                        current.filter((item) => item.id !== id)
                      )
                    }
                  />
                </div>
              ) : null}
            </CareerAnimatedRegion>
            <div
              className={cn(
                showInterviewComposerFrame
                  ? "career-glass career-work-surface p-2"
                  : undefined
              )}
            >
              <Input
                unstyled
                ref={actionMenuFileInputRef}
                accept={CAREER_CHAT_FILE_ACCEPT}
                className="hidden"
                onChange={(event) => void handleActionMenuFileChange(event)}
                type="file"
              />
              <ChatComposerFrame
                ref={textareaRef}
                actionLayout="footer"
                aria-activedescendant={opportunityMentionActiveDescendantId}
                aria-autocomplete="list"
                aria-controls={
                  opportunityMentionSearch && !isTextInputLocked
                    ? opportunityMentionListId
                    : undefined
                }
                aria-expanded={
                  Boolean(opportunityMentionSearch) && !isTextInputLocked
                }
                className="overflow-visible [--radius-composer-collapsed:var(--radius-pill)]"
                context={
                  pendingFiles.length > 0 ? (
                    <ChatAttachmentDraftList
                      attachments={pendingFiles}
                      onRemove={id => setPendingFiles(current => current.filter(file => file.id !== id))}
                      tone="light"
                    />
                  ) : null
                }
                textareaKey={textareaResetVersion}
                id="career-chat-composer"
                value={draft}
                onChange={(event) => {
                  const value = event.target.value;
                  opportunityTokens.updateValue(value);
                  updateOpportunityMentionSearch(
                    value,
                    event.currentTarget.selectionStart ?? value.length
                  );
                }}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={(event) => {
                  isComposingRef.current = false;
                  const value = event.currentTarget.value;
                  opportunityTokens.updateValue(value);
                  updateOpportunityMentionSearch(
                    value,
                    event.currentTarget.selectionStart ?? value.length
                  );
                }}
                onBeforeInput={opportunityTokens.handleBeforeInput}
                onKeyDown={handleComposerKeyDown}
                onScroll={(event) =>
                  syncOpportunityMentionHighlight(event.currentTarget)
                }
                onSelect={(event) => {
                  opportunityTokens.handleSelect(event);
                }}
                enterKeyHint="send"
                placeholder={composerPlaceholder}
                rows={1}
                maxRows={CAREER_COMPOSER_MAX_ROWS}
                mobileMinRows={2}
                disabled={isComposerActionLocked}
                aria-busy={isComposerBusy || undefined}
                mobileLeadingAction={
                  <ChatComposerActionMenu
                    animated={false}
                    className="border-transparent! bg-transparent! backdrop-blur-none! hover:bg-transparent! active:bg-transparent! data-[state=open]:bg-transparent!"
                    triggerIcon={
                      <Plus
                        className="size-5 text-neutral-primary"
                        strokeWidth={1.6}
                      />
                    }
                    contentClassName="max-h-[min(32rem,70dvh)] overflow-y-auto overscroll-contain"
                    disabled={!user}
                    items={composerActionMenuItems}
                    onItemSelect={handleComposerActionMenuItemSelect}
                    onOpenChange={handleMobileActionMenuOpenChange}
                    open={mobileActionMenuOpen}
                  />
                }
                textareaClassName={cn(
                  "min-h-12 py-3 max-md:group-data-[expanded=false]/chat-composer:py-3.5 max-md:group-data-[expanded=false]/chat-composer:font-normal max-md:group-data-[expanded=false]/chat-composer:placeholder:text-neutral-soft",
                  opportunityTokens.tokens.length > 0 &&
                    "relative z-10 text-transparent caret-neutral-primary"
                )}
                overlay={
                  <>
                    {opportunityTokens.tokens.length > 0 ? (
                      <ChatComposerTokenOverlay
                        ref={opportunityMentionHighlightRef}
                        className="z-20 min-h-12 py-3"
                        getTokenAriaLabel={(token) =>
                          t(
                            "career.chat.career_composer_section.opportunity_token_aria_label",
                            "기회 상세 열기: {opportunity}",
                            { values: { opportunity: token.text } }
                          )
                        }
                        isTokenClickable={(token) =>
                          (token.data as CareerComposerOpportunityMention)
                            .isClickable !== false
                        }
                        onTokenClick={(token) => {
                          const data =
                            token.data as Partial<CareerOpportunityMention>;
                          const roleId = String(data.roleId ?? "").trim();
                          if (roleId) handleOpenPendingOpportunity(roleId);
                        }}
                        segments={opportunityTokens.segments}
                      />
                    ) : null}
                    {opportunityMentionSearch && !isTextInputLocked ? (
                      <ChatComposerPicker
                        className="[--background-image-menu-image:none] [--color-menu:rgb(255_255_255/0.9)]"
                        highlightedIndex={opportunityMentionHighlightedIndex}
                        items={opportunityPickerItems}
                        listId={opportunityMentionListId}
                        navigationDirection={
                          opportunityMentionNavigationDirection
                        }
                        onClose={closeOpportunityMentionPicker}
                        onHighlight={setOpportunityMentionHighlightedIndex}
                      />
                    ) : null}
                  </>
                }
                action={
                  <div className="flex w-full items-end justify-between gap-2">
                    <ChatComposerActionMenu
                      align="start"
                      animated={false}
                      className="hidden md:inline-flex"
                      contentClassName="max-h-[min(32rem,70dvh)] overflow-y-auto overscroll-contain"
                      disabled={!user}
                      items={composerActionMenuItems}
                      onItemSelect={handleComposerActionMenuItemSelect}
                      onOpenChange={handleDesktopActionMenuOpenChange}
                      open={desktopActionMenuOpen}
                    />
                    <div className="ml-auto flex items-center gap-2">
                      {canStopChat && onCancelChat && !hasSendableDraft ? (
                        <MuteButton
                          onClick={handleStopChat}
                          disabled={stopPending}
                          variant="dark"
                          aria-label={t("career.chat.stop", "중단")}
                          aria-busy={stopPending}
                        >
                          {stopPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Square className="size-4" fill="currentColor" />
                          )}
                        </MuteButton>
                      ) : null}
                      {hasSendableDraft || !canStopChat ? (
                        <MuteButton
                          onClick={() => void handleSend()}
                          disabled={
                            stopPending ||
                            !hasSendableDraft ||
                            isComposerActionLocked
                          }
                          variant="dark"
                          aria-label={t(
                            "career.chat.career_composer_section.send_message_aria_label",
                            "메시지 보내기"
                          )}
                        >
                          <ArrowUp className="size-4" />
                        </MuteButton>
                      ) : null}
                    </div>
                  </div>
                }
              />
              {showInterviewComposerFrame ? (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 px-1 text-neutral-muted md:justify-between">
                  {showResumeInterviewAction ? (
                    <ActionButton
                      type="button"
                      onClick={handleResumeInterview}
                      disabled={resumeInterviewDisabled}
                      actionVariant="primary"
                      buttonRadius="pill"
                      className="hidden h-8 items-center gap-1.5 rounded-lg border border-neutral-1000 bg-neutral-1000 px-3 text-[12px] font-normal text-neutral-00 shadow-(--shadow-xs) hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-70 md:inline-flex"
                    >
                      {sessionReengagementPending ||
                      resumeInterviewRequested ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <></>
                      )}
                      {t(
                        "career.chat.career_composer_section.resume_interview_cta",
                        "5분 커리어 인터뷰 이어가기"
                      )}
                    </ActionButton>
                  ) : (
                    <div className="hidden md:block" />
                  )}
                  <div className="inline-flex min-w-0 items-center gap-2">
                    <div className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium">
                      <span>
                        {t(
                          "career.home.career_home_panel.1ol18h9",
                          "커리어 인터뷰 진행 중"
                        )}
                      </span>
                    </div>
                    {showManualCompletionAction ? (
                      <BareButton
                        type="button"
                        onClick={handleForceComplete}
                        disabled={manualCompletionDisabled}
                        className="inline-flex h-5 items-center gap-1 text-[12px] font-semibold text-critical transition-all duration-300 ease-out hover:text-neutral-primary disabled:cursor-wait disabled:opacity-70"
                      >
                        {forceCompletePending || onboardingWrapupPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                        {t(
                          "career.chat.career_call_screen.0yqbta2",
                          "임의 종료"
                        )}
                      </BareButton>
                    ) : (
                      <div className="inline-flex h-5 items-center gap-1.5 text-[12px] text-neutral-soft transition-all duration-300 ease-out">
                        <Clock3 className="h-3.5 w-3.5" />
                        {t(
                          "career.chat.career_composer_section.02tj0kp",
                          "약 5분"
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </React.Fragment>
        </InternalCallAnswersSlot>
      </div>
    </div>
  );
});

export default React.memo(CareerComposerSection);
