import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  AudioLines,
  BriefcaseBusiness,
  Building2,
  Clock3,
  FileText,
  FileUp,
  Handshake,
  Loader2,
  MessageSquareText,
  PhoneCall,
  Plus,
} from "lucide-react";
import { useRouter } from "next/router";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "@/components/career/CareerSidebarContext";
import { Tooltips } from "@/components/ui/tooltip";
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
import type { CareerConversationStarterId } from "@/lib/career/prompts/conversationStarters";
import {
  toCareerPendingActionReference,
  type CareerPendingAction,
  type CareerPendingCompanyRequestAction,
  type CareerPendingInternalOpportunityAction,
} from "@/lib/career/pendingActions";
import { useCareerPendingActions } from "@/hooks/career/useCareerPendingActions";
import { CareerPendingActionContextCard } from "./CareerPendingActionContextCard";
import ChatAttachmentDraftList from "@/components/chat/ChatAttachmentDraftList";
import {
  createDraftFileAttachment,
  type DraftChatAttachment,
} from "@/lib/chat/attachmentClient";
import { showToast } from "@/components/toast/toast";
import { MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES } from "@/lib/talentOnboarding/documentUploadLimits";

const RECENT_CHAT_HISTORY_WINDOW_MS = 60 * 60 * 1000;
const CAREER_COMPOSER_MAX_ROWS = 4;
const CAREER_CHAT_FILE_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx";
const CAREER_RESUME_FILE_ACCEPT = ".pdf,.doc,.docx,.txt,.md";
type CareerComposerOpportunityMention = CareerOpportunityMention & {
  isClickable?: boolean;
};
const createComposerTokenId = (prefix: string) => {
  const randomId = globalThis.crypto?.randomUUID?.();
  return `${prefix}:${randomId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
};

const CareerComposerSection = () => {
  const t = useCareerT();
  const router = useRouter();
  const opportunityMentionListId = useId();

  const logCareerEvent = useCareerLogEvent();
  const { onRequestMoreOpenPositions } = useCareerSidebarContext();
  const { onSaveTalentProfile, profileSavePending } = useCareerProfileContext();
  const {
    user,
    conversationId,
    stage,
    messages,
    scrollRef,
    isOnboardingDone,
    sessionPending,
    profilePending,
    chatPending,
    sessionReengagementPending,
    assistantTyping,
    opportunityFeedbackFollowUpPending,
    initialChatDraft,
    initialChatDraftKey,
    initialChatOpportunityMention,
    onboardingBeginPending,
    onboardingWrapupPending,
    callStartPending = false,
    callWrapUpPending = false,
    pendingActionsOverride,
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
  } = useCareerChatPanelContext();

  const initialDraftText = initialChatDraft?.trim() ?? "";
  const [draft, setDraft] = useState(() => initialDraftText);
  const [opportunityMentionSearch, setOpportunityMentionSearch] = useState<{
    query: string;
    start: number;
  } | null>(null);
  const [chatLinkDraft, setChatLinkDraft] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [fileUploadPending, setFileUploadPending] = useState(false);
  const [pendingFileAttachment, setPendingFileAttachment] =
    useState<DraftChatAttachment | null>(null);
  const [recommendationRequestPending, setRecommendationRequestPending] =
    useState(false);
  const [conversationStarterPending, setConversationStarterPending] =
    useState(false);
  const [mobileActionMenuOpen, setMobileActionMenuOpen] = useState(false);
  const [desktopActionMenuOpen, setDesktopActionMenuOpen] = useState(false);
  const [selectedPendingAction, setSelectedPendingAction] =
    useState<CareerPendingCompanyRequestAction | null>(null);
  const [pendingQuestionExpanded, setPendingQuestionExpanded] = useState(false);
  const [recentChatCutoffMs] = useState(
    () => Date.now() - RECENT_CHAT_HISTORY_WINDOW_MS
  );
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
  const onboardingPaused = isOnboardingPaused(messages);
  const isStartingCall =
    (onboardingBeginPending && !callWrapUpPending) || callStartPending;
  const isWorkflowPending = isStartingCall || callWrapUpPending;

  const isTextInputLocked =
    !user ||
    !conversationId ||
    sessionPending ||
    stage === "profile" ||
    showVoiceStartPrompt ||
    profilePending ||
    opportunityFeedbackFollowUpPending ||
    isWorkflowPending ||
    onboardingWrapupPending ||
    onboardingPausePending;
  const isComposerActionLocked =
    isTextInputLocked || chatPending || assistantTyping;
  const isComposerBusy =
    chatPending || assistantTyping || opportunityFeedbackFollowUpPending;
  const pendingActions = useCareerPendingActions({
    enabled:
      isOnboardingDone &&
      !pendingActionsOverride &&
      (mobileActionMenuOpen ||
        desktopActionMenuOpen ||
        Boolean(selectedPendingAction)),
    locale: router.locale,
    userId: user?.id,
  });
  const opportunityMentions = useCareerOpportunityMentions({
    enabled: Boolean(opportunityMentionSearch) && !isTextInputLocked,
    userId: user?.id,
  });
  const mentionOpportunities = filterCareerOpportunityMentions(
    opportunityMentions.opportunities,
    opportunityMentionSearch?.query ?? ""
  );
  const hasRecentChatHistory = messages.some((message) => {
    if ((message.messageType ?? "chat") !== "chat") return false;
    const createdAtMs = Date.parse(message.createdAt);
    return Number.isFinite(createdAtMs) && createdAtMs > recentChatCutoffMs;
  });
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
      if (currentDraft && currentDraft !== previousInitialDraftText) {
        return currentDraft;
      }
      return initialDraftText;
    });
  }, [initialChatDraftKey, initialDraftText]);

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
      "원하는 역할이나 조건을 편하게 알려주세요. @로 기회를 선택하세요."
    );
  })();

  const hasDraftText = draft.trim().length > 0;
  const hasSendableDraft = hasDraftText || pendingFileAttachment !== null;

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
  const forceCompleteTooltip = t(
    "career.chat.career_call_screen.0n1pl8k",
    "커리어 인터뷰를 임의로 종료할 수 있어요. 거의 다 왔으니 2~3개의 질문에만 추가로 대답해주시면 자동으로 종료됩니다!"
  );

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
              <Plus />
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

  const focusComposerAfterMenuSelection = () => {
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const insertPendingOpportunityMention = (
    action: CareerPendingInternalOpportunityAction
  ) => {
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
  };

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

  const handleSelectPendingAction = (action: CareerPendingAction) => {
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
    if (action.kind === "internal_fit_question") return;

    logCareerEvent("click_chat_composer_pending_action", {
      actionId: action.id,
      actionKind: action.kind,
    });
    setSelectedPendingAction(action);
    setPendingQuestionExpanded(false);
    focusComposerAfterMenuSelection();
  };

  const handleSend = async () => {
    const text = (textareaRef.current?.value ?? draft).trim();
    const submittedFileAttachment = pendingFileAttachment;
    if (!text && !submittedFileAttachment) return;
    if (isComposerActionLocked) return;

    const link = chatLinkDraft.trim();
    const submittedTokens = opportunityTokens.tokens;
    const submittedPendingAction = selectedPendingAction;
    const submittedMentions = submittedTokens.map((token) => token.data);
    resetDraftField();
    setChatLinkDraft("");
    setShowLinkInput(false);
    setSelectedPendingAction(null);
    setPendingQuestionExpanded(false);
    setPendingFileAttachment(null);
    window.requestAnimationFrame(() => textareaRef.current?.focus());

    logCareerEvent(
      link ? "click_chat_send_message_with_link" : "click_chat_send_message"
    );
    let sendFailed = false;
    await onSendChatMessage({
      text,
      files:
        submittedFileAttachment?.kind === "file"
          ? [submittedFileAttachment.file]
          : undefined,
      link,
      opportunityMentions: submittedMentions,
      pendingAction: submittedPendingAction
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
        if (submittedFileAttachment) {
          setPendingFileAttachment(
            (current) => current ?? submittedFileAttachment
          );
        }
      },
    });
    if (!sendFailed && submittedPendingAction) {
      if (!pendingActionsOverride) void pendingActions.refetch();
    }
  };

  const handlePrimaryComposerAction = () => {
    if (hasSendableDraft) {
      void handleSend();
      return;
    }

    logCareerEvent("click_chat_start_call");
    void onStartCallMode?.();
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
      void handleSend();
    }
  };

  const handleComposerFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) return;
      scrollElement.scrollTo({
        top: scrollElement.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [scrollRef]);

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
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file || fileUploadPending || profileSavePending) return;
    if (file.size > MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES) {
      showToast({
        message: t(
          "career.resume_dropzone.file_too_large_generic",
          "파일은 최대 4MB까지 업로드할 수 있습니다."
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
          resumeFile: file,
          resumeRequestToken,
        });
        if (saved) {
          setSelectedPendingAction(null);
          setPendingQuestionExpanded(false);
          if (!pendingActionsOverride) void pendingActions.refetch();
        }
      } else {
        setPendingFileAttachment(createDraftFileAttachment(file));
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
      await onStartConversationStarter({ mode: "call", starterId });
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
  const resolvedPendingActions =
    pendingActionsOverride ?? pendingActions.data ?? [];
  const visiblePendingActions = resolvedPendingActions.filter(
    (
      action
    ): action is Exclude<
      CareerPendingAction,
      { kind: "internal_fit_question" }
    > => action.kind !== "internal_fit_question"
  );
  const pendingActionMenuItems: ChatComposerActionMenuItem[] = !isOnboardingDone
    ? []
    : !pendingActionsOverride && pendingActions.isPending
      ? [
          {
            disabled: true,
            icon: <Loader2 />,
            id: "pending-actions-loading",
            label: t(
              "career.chat.career_composer_section.pending_actions_loading_label",
              "처리할 항목을 확인하는 중"
            ),
            loading: true,
            onSelect: () => undefined,
            sectionLabel: t(
              "career.chat.career_composer_section.pending_actions_section_label",
              "처리할 항목"
            ),
            subtext: t(
              "career.chat.career_composer_section.pending_actions_loading_subtext",
              "회사 요청과 연결 제안을 불러오고 있어요."
            ),
            subtextLayout: "stacked" as const,
          },
        ]
      : !pendingActionsOverride && pendingActions.isError
        ? [
            {
              icon: <MessageSquareText />,
              id: "pending-actions-error",
              label: t(
                "career.chat.career_composer_section.pending_actions_error_label",
                "처리할 항목 다시 불러오기"
              ),
              onSelect: () => void pendingActions.refetch(),
              sectionLabel: t(
                "career.chat.career_composer_section.pending_actions_section_label",
                "처리할 항목"
              ),
              subtext: t(
                "career.chat.career_composer_section.pending_actions_error_subtext",
                "목록을 불러오지 못했어요. 눌러서 다시 시도해 주세요."
              ),
              subtextLayout: "stacked" as const,
            },
          ]
        : visiblePendingActions.map((action) => {
            if (action.kind === "internal_opportunity_call") {
              return {
                disabled:
                  isComposerActionLocked || isStartingCall || !onStartCallMode,
                icon: <PhoneCall />,
                id: `pending-${action.kind}-${action.id}`,
                label: t(
                  "career.chat.career_composer_section.pending_call_label",
                  "연결 전 통화 · {companyName}",
                  {
                    values: {
                      companyName: action.callRequest.companyName,
                    },
                  }
                ),
                onSelect: () => handleSelectPendingAction(action),
                sectionLabel: t(
                  "career.chat.career_composer_section.pending_actions_section_label",
                  "처리할 항목"
                ),
                subtext: t(
                  "career.chat.career_composer_section.pending_call_subtext",
                  "{roleTitle} 포지션에 대해 간단히 이야기하고 연결을 준비해요.",
                  { values: { roleTitle: action.callRequest.roleTitle } }
                ),
                subtextLayout: "stacked" as const,
                trailingText: t(
                  "career.chat.career_composer_section.pending_call_trailing_text",
                  "통화 시작"
                ),
              };
            }
            if (action.kind === "company_request") {
              return {
                disabled: isComposerActionLocked,
                icon:
                  action.requestMode === "resume" ? (
                    <FileText />
                  ) : (
                    <MessageSquareText />
                  ),
                id: `pending-${action.kind}-${action.id}`,
                label: t(
                  "career.chat.career_composer_section.pending_company_request_label",
                  "{companyName}의 요청",
                  { values: { companyName: action.companyName } }
                ),
                onSelect: () => handleSelectPendingAction(action),
                sectionLabel: t(
                  "career.chat.career_composer_section.pending_actions_section_label",
                  "처리할 항목"
                ),
                subtext: action.prompt,
                subtextLayout: "stacked" as const,
                trailingText:
                  action.requestMode === "resume"
                    ? t(
                        "career.chat.career_composer_section.pending_company_request_resume",
                        "이력서"
                      )
                    : t(
                        "career.chat.career_composer_section.pending_company_request_question",
                        "질문"
                      ),
              };
            }
            return {
              disabled: isComposerActionLocked,
              icon: <Handshake />,
              id: `pending-${action.kind}-${action.id}`,
              label: action.roleTitle,
              onSelect: () => handleSelectPendingAction(action),
              sectionLabel: t(
                "career.chat.career_composer_section.pending_actions_section_label",
                "처리할 항목"
              ),
              subtext: t(
                "career.chat.career_composer_section.pending_internal_opportunity_subtext",
                "{companyName}에 대한 연결 제안이에요. 수락·거절 또는 질문을 남겨주세요.",
                { values: { companyName: action.companyName } }
              ),
              subtextLayout: "stacked" as const,
              trailingText: t(
                "career.chat.career_composer_section.pending_internal_opportunity_trailing_text",
                "연결 제안"
              ),
            };
          });
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
        "이력서/포트폴리오 등"
      ),
      // trailingText: "PDF, DOCX, TXT",
    },
    {
      disabled: recommendationRequestDisabled,
      icon: <BriefcaseBusiness />,
      id: "request-more-open-positions",
      label: recommendationRequestPending
        ? t(
            "career.common.conversation_starters.requesting_more_open_positions",
            "요청 중..."
          )
        : t(
            "career.common.conversation_starters.more_open_positions",
            "오픈 포지션 더 추천받기"
          ),
      loading: recommendationRequestPending,
      onSelect: () => void handleRequestMoreOpenPositions(),
    },
    {
      disabled: conversationStarterDisabled,
      icon: <PhoneCall />,
      id: "conversation-starter-preference-update",
      label: t(
        "career.common.conversation_starters.1sfi8z4",
        "선호 조건 업데이트하기"
      ),
      loading: conversationStarterPending,
      onSelect: () => void handleStartConversationStarter("preference_update"),
    },
    {
      disabled: conversationStarterDisabled,
      icon: <PhoneCall />,
      id: "conversation-starter-match-quality",
      label: t(
        "career.common.conversation_starters.07qcswd",
        "더 이야기하고 더 좋은 연결 받기"
      ),
      loading: conversationStarterPending,
      onSelect: () => void handleStartConversationStarter("match_quality"),
    },
    ...pendingActionMenuItems,
  ];

  return (
    <div
      data-vaul-no-drag=""
      className="shrink-0 px-4 pb-3 pt-2 md:px-5 md:pb-6 md:pt-0"
    >
      <div className="mx-auto w-full max-w-[1120px]">
        <div
          className={cn(
            "transition-all duration-200",
            showInterviewComposerFrame
              ? "rounded-[20px] border border-neutral-1000-a05 bg-neutral-200 p-2 shadow-[0_18px_42px_rgba(31,28,26,0.08)] backdrop-blur-xl"
              : "rounded-3xl"
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
            className="overflow-visible"
            context={
              selectedPendingAction || pendingFileAttachment ? (
                <div className="grid gap-2">
                  {selectedPendingAction ? (
                    <CareerPendingActionContextCard
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
                  ) : null}
                  {pendingFileAttachment ? (
                    <ChatAttachmentDraftList
                      attachments={[pendingFileAttachment]}
                      onRemove={() => setPendingFileAttachment(null)}
                      tone="light"
                    />
                  ) : null}
                </div>
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
            onFocus={handleComposerFocus}
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
            rows={2}
            maxRows={CAREER_COMPOSER_MAX_ROWS}
            disabled={isTextInputLocked}
            mobileLeadingAction={
              <ChatComposerActionMenu
                contentClassName="max-h-[min(32rem,70dvh)] overscroll-contain"
                disabled={!user}
                items={composerActionMenuItems}
                onOpenChange={setMobileActionMenuOpen}
                open={mobileActionMenuOpen}
              />
            }
            textareaClassName={cn(
              "min-h-12 py-3",
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
                    highlightedIndex={opportunityMentionHighlightedIndex}
                    items={opportunityPickerItems}
                    listId={opportunityMentionListId}
                    navigationDirection={opportunityMentionNavigationDirection}
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
                  className="hidden md:inline-flex"
                  contentClassName="max-h-[min(32rem,70dvh)] overscroll-contain"
                  disabled={!user}
                  items={composerActionMenuItems}
                  onOpenChange={setDesktopActionMenuOpen}
                  open={desktopActionMenuOpen}
                />
                <ActionButton
                  onClick={handlePrimaryComposerAction}
                  disabled={
                    hasSendableDraft
                      ? isComposerActionLocked
                      : isComposerActionLocked ||
                        isStartingCall ||
                        !onStartCallMode
                  }
                  actionVariant="primary"
                  buttonRadius="pill"
                  className={cn(
                    "px-2.5 h-9 rounded-[18px] text-neutral-00 shadow-xs",
                    hasSendableDraft
                      ? "border-neutral-1000-a10 bg-primary"
                      : "border border-neutral-1000-a10 bg-primary"
                  )}
                  aria-label={
                    hasSendableDraft
                      ? t(
                          "career.chat.career_composer_section.send_message_aria_label",
                          "메시지 보내기"
                        )
                      : t(
                          "career.chat.career_composer_section.call_mode_aria_label",
                          "통화 모드"
                        )
                  }
                >
                  {(hasSendableDraft && isComposerBusy) ||
                  (!hasSendableDraft && isStartingCall) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : hasSendableDraft ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <AudioLines className="h-3.5 w-3.5" />
                  )}
                </ActionButton>
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
                  className="hidden h-8 items-center gap-1.5 rounded-[12px] border border-neutral-1000 bg-neutral-1000 px-3 text-[12px] font-normal text-neutral-00 shadow-xs hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-70 md:inline-flex"
                >
                  {sessionReengagementPending || resumeInterviewRequested ? (
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
                <div
                  className="h-1 w-24 overflow-hidden rounded-full bg-neutral-400 sm:w-32"
                  role="progressbar"
                  aria-label={t(
                    "career.chat.career_composer_section.interview_progress_aria_label",
                    "커리어 인터뷰 진행률"
                  )}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={interviewProgress.percent}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                    style={{ width: `${interviewProgress.percent}%` }}
                  />
                </div>
                {showManualCompletionAction ? (
                  <Tooltips text={forceCompleteTooltip} side="top">
                    <BareButton
                      type="button"
                      onClick={handleForceComplete}
                      disabled={manualCompletionDisabled}
                      className="inline-flex h-5 items-center gap-1 text-[12px] font-semibold text-critical transition-all duration-300 ease-out hover:text-neutral-primary disabled:cursor-wait disabled:opacity-70"
                    >
                      {forceCompletePending || onboardingWrapupPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : null}
                      {t("career.chat.career_call_screen.0yqbta2", "임의 종료")}
                    </BareButton>
                  </Tooltips>
                ) : (
                  <div className="inline-flex h-5 items-center gap-1.5 text-[12px] text-neutral-soft transition-all duration-300 ease-out">
                    <Clock3 className="h-3.5 w-3.5" />
                    {t("career.chat.career_composer_section.02tj0kp", "약 5분")}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default React.memo(CareerComposerSection);
