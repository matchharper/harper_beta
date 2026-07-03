import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  AudioLines,
  Clock3,
  Loader2,
  MessageSquareText,
} from "lucide-react";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { Tooltips } from "@/components/ui/tooltip";
import { isOnboardingPaused } from "@/hooks/career/careerHelpers";
import { cn } from "@/lib/utils";
import { ActionButton, BareButton } from "@/components/ui/button";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { useCareerT } from "@/i18n/useCareerT";

const CareerComposerSection = () => {
  const t = useCareerT();

  const logCareerEvent = useCareerLogEvent();
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
    assistantTyping,
    opportunityFeedbackFollowUpPending,
    initialChatDraft,
    initialChatDraftKey,
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
    onStartCallMode,
    onForceCompleteOnboarding,
  } = useCareerChatPanelContext();

  const initialDraftText = initialChatDraft?.trim() ?? "";
  const [draft, setDraft] = useState(() => initialDraftText);
  const [chatLinkDraft, setChatLinkDraft] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [textareaResetVersion, setTextareaResetVersion] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef(false);
  const initialDraftFocusKey =
    initialChatDraftKey?.trim() || initialDraftText || null;
  const focusedInitialDraftKeyRef = useRef<string | null>(null);
  const appliedInitialDraftKeyRef = useRef(
    initialChatDraftKey?.trim() || initialDraftText || null
  );
  const appliedInitialDraftTextRef = useRef(initialDraftText);
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
    if (callWrapUpPending) return "Call wrap-up...";
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
    if (stage === "completed") {
      return t(
        "career.chat.career_composer_section.0e686ow",
        "Harper에게 답변을 입력하세요."
      );
    }
    return t(
      "career.chat.career_composer_section.017fk2m",
      "원하는 역할이나 조건을 편하게 알려주세요."
    );
  })();

  const hasDraftText = draft.trim().length > 0;

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

  const resetDraftField = () => {
    setDraft("");
    setTextareaResetVersion((version) => version + 1);
  };

  const handleSend = async () => {
    const text = (textareaRef.current?.value ?? draft).trim();
    if (!text) return;
    if (isComposerActionLocked) return;

    const link = chatLinkDraft.trim();
    resetDraftField();
    setChatLinkDraft("");
    setShowLinkInput(false);
    window.requestAnimationFrame(() => textareaRef.current?.focus());

    logCareerEvent(
      link ? "click_chat_send_message_with_link" : "click_chat_send_message"
    );
    await onSendChatMessage({
      text,
      link,
      onError: () => {
        setDraft((current) => current || text);
        setChatLinkDraft((current) => current || link);
        if (link) setShowLinkInput(true);
      },
    });
  };

  const handlePrimaryComposerAction = () => {
    if (hasDraftText) {
      void handleSend();
      return;
    }

    logCareerEvent("click_chat_start_call");
    void onStartCallMode?.();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      if (event.nativeEvent.isComposing || isComposingRef.current) return;
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
          <div className="overflow-hidden rounded-[16px] border border-neutral-1000-a10 bg-bg-floating/75 shadow-sm backdrop-blur-xl transition-all duration-200 focus-within:border-neutral-400">
            <div className="relative flex items-end gap-2">
              <UiTextarea
                unstyled
                key={textareaResetVersion}
                ref={textareaRef}
                id="career-chat-composer"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={(event) => {
                  isComposingRef.current = false;
                  setDraft(event.currentTarget.value);
                }}
                onFocus={handleComposerFocus}
                onKeyDown={handleComposerKeyDown}
                enterKeyHint="send"
                placeholder={composerPlaceholder}
                rows={3}
                disabled={isTextInputLocked}
                className={cn(
                  "min-h-[72px] min-w-0 flex-1 resize-none border-none px-3.5 py-4 text-base leading-5 text-neutral-primary outline-none transition-all placeholder:text-neutral-placeholder disabled:cursor-not-allowed md:text-sm lg:text-[14px]"
                )}
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <ActionButton
                  onClick={handlePrimaryComposerAction}
                  disabled={
                    hasDraftText
                      ? isComposerActionLocked
                      : isComposerActionLocked ||
                        isStartingCall ||
                        !onStartCallMode
                  }
                  actionVariant="primary"
                  buttonRadius="pill"
                  className={cn(
                    "px-2.5 h-9 rounded-[18px] text-neutral-00 shadow-xs",
                    hasDraftText
                      ? "border-neutral-1000-a10 bg-primary"
                      : "border border-neutral-1000-a10 bg-primary"
                  )}
                  aria-label={
                    hasDraftText
                      ? t(
                          "career.chat.career_composer_section.1sjkx1r",
                          "메시지 보내기"
                        )
                      : t(
                          "career.chat.career_composer_section.1vn1k94",
                          "통화 모드"
                        )
                  }
                >
                  {(hasDraftText && isComposerBusy) ||
                  (!hasDraftText && isStartingCall) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : hasDraftText ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <AudioLines className="h-3.5 w-3.5" />
                  )}
                </ActionButton>
              </div>
            </div>
          </div>
          {showInterviewComposerFrame ? (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 px-1 text-neutral-muted">
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
                    "career.chat.career_call_screen.1lwovam",
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
