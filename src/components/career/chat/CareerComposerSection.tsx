import React from "react";
import {
  ArrowUp,
  AudioLines,
  Clock3,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
} from "lucide-react";
import { KeyboardEvent, useRef, useState } from "react";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { Tooltips } from "@/components/ui/tooltip";
import { isOnboardingPaused } from "@/hooks/career/careerHelpers";
import { careerCx } from "../ui/CareerPrimitives";
import { CareerActionButton } from "../ui/CareerActionButton";
import CareerVoiceInputLevelFill from "./CareerVoiceInputLevelFill";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";

const CareerComposerSection = () => {
  const logCareerEvent = useCareerLogEvent();
  const {
    user,
    conversationId,
    stage,
    messages,
    isOnboardingDone,
    sessionPending,
    profilePending,
    chatPending,
    assistantTyping,
    onboardingBeginPending,
    onboardingWrapupPending,
    callStartPending = false,
    callWrapUpPending = false,
    forceCompletePending = false,
    interviewProgress,
    onboardingPausePending,
    showVoiceStartPrompt,
    inputMode,
    voiceTranscript,
    voiceListening,
    voiceMuted,
    voicePrimaryPressed,
    onStartVoiceCall,
    onSendChatMessage,
    onVoicePrimaryAction,
    onToggleVoiceMute,
    onSwitchToTextMode,
    onStartCallMode,
    onForceCompleteOnboarding,
  } = useCareerChatPanelContext();

  const [draft, setDraft] = useState("");
  const [chatLinkDraft, setChatLinkDraft] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [textareaResetVersion, setTextareaResetVersion] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef(false);
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
    isWorkflowPending ||
    onboardingWrapupPending ||
    onboardingPausePending;
  const isComposerActionLocked =
    isTextInputLocked || chatPending || assistantTyping;

  const composerPlaceholder = !user
    ? "로그인 후 대화를 시작할 수 있습니다."
    : stage === "profile"
      ? "기본 정보 제출 후 대화가 시작됩니다."
      : showVoiceStartPrompt
        ? "아래 시작 버튼으로 대화를 시작해 주세요."
        : callWrapUpPending
          ? "Call wrap-up..."
          : onboardingWrapupPending
            ? "통화 내용을 정리하는 중입니다."
            : onboardingPaused
              ? "바로 입력하면 대화가 이어집니다."
              : profilePending
                ? "이력서와 링크를 분석 중입니다."
                : stage === "completed"
                  ? "Harper에게 답변을 입력하세요."
                  : "원하는 역할이나 조건을 편하게 알려주세요.";

  const showCallQuickAction =
    Boolean(user) &&
    messages.length > 0 &&
    stage !== "profile" &&
    inputMode === "text" &&
    !showVoiceStartPrompt;

  const isVoiceMode = inputMode === "voice";
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
    assistantTyping;
  const forceCompleteTooltip =
    "커리어 인터뷰를 임의로 종료할 수 있어요. 거의 다 왔으니 2~3개의 질문에만 추가로 대답해주시면 자동으로 종료됩니다!";

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

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      if (event.nativeEvent.isComposing || isComposingRef.current) return;
      event.preventDefault();
      void handleSend();
    }
  };

  const handleForceComplete = () => {
    if (!onForceCompleteOnboarding || manualCompletionDisabled) return;
    logCareerEvent("click_chat_force_complete");
    void onForceCompleteOnboarding();
  };

  return (
    <div className="sticky bottom-0 shrink-0 px-5 py-4">
      <div className="mx-auto w-full max-w-[1120px]">
        {isVoiceMode ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                logCareerEvent("click_chat_voice_primary");
                onVoicePrimaryAction();
              }}
              disabled={isComposerActionLocked}
              className={careerCx(
                "group relative flex min-h-[44px] flex-1 items-center justify-center overflow-hidden rounded-[8px] border px-4 py-3 text-sm transition-all duration-150",
                voiceListening && !voiceMuted
                  ? "border-beige900 bg-beige900 text-[#f5ecdd]"
                  : "border-beige900/15 bg-white/45 text-beige900 hover:border-beige900/30",
                voicePrimaryPressed && "scale-[0.99]"
              )}
            >
              <CareerVoiceInputLevelFill voiceListening={voiceListening} />
              <span className="relative z-10 flex items-center gap-2">
                {voiceListening && !voiceMuted ? (
                  <>
                    <ArrowUp className="h-3.5 w-3.5" />
                    말하는 중... 스페이스바를 눌러서 전송
                  </>
                ) : voiceMuted ? (
                  <>
                    <MicOff className="h-3.5 w-3.5" />
                    음소거 상태
                  </>
                ) : (
                  <>
                    <AudioLines className="h-3.5 w-3.5" />
                    대기중...
                  </>
                )}
              </span>
            </button>

            <CareerActionButton
              onClick={() => {
                logCareerEvent(
                  voiceMuted
                    ? "click_chat_voice_unmute"
                    : "click_chat_voice_mute"
                );
                onToggleVoiceMute();
              }}
              disabled={isComposerActionLocked}
              actionVariant="icon"
              aria-label={voiceMuted ? "음소거 해제" : "음소거"}
            >
              {voiceMuted ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </CareerActionButton>
            <CareerActionButton
              onClick={() => {
                logCareerEvent("click_chat_switch_text_mode");
                onSwitchToTextMode();
              }}
              actionVariant="icon"
              className="border-[#7c2d12]/20 bg-[#7c2d12]/5 text-[#7c2d12] hover:border-[#7c2d12]/30 hover:text-[#7c2d12]"
            >
              <PhoneOff className="h-3.5 w-3.5" />
            </CareerActionButton>
          </div>
        ) : null}

        <div
          className={careerCx(
            "transition-all duration-200",
            showInterviewComposerFrame
              ? "rounded-[18px] bg-beige900 p-1 shadow-[0_12px_28px_rgba(37,20,6,0.14)]"
              : "rounded-3xl"
          )}
        >
          {showInterviewComposerFrame ? (
            <div className="px-3 py-2 text-beige50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-[13px] font-semibold">
                  <MessageSquareText className="h-4 w-4" />
                  <span className="career-interview-shimmer inline-block">
                    커리어 인터뷰 진행 중
                  </span>
                </div>
                <div className="h-5 min-w-[64px] overflow-hidden text-right">
                  {showManualCompletionAction ? (
                    <Tooltips text={forceCompleteTooltip} side="top">
                      <button
                        type="button"
                        onClick={handleForceComplete}
                        disabled={manualCompletionDisabled}
                        className="inline-flex h-5 items-center gap-1 text-[12px] font-semibold text-red-300 transition-all duration-300 ease-out hover:text-red-400 disabled:cursor-wait disabled:opacity-70"
                      >
                        {forceCompletePending || onboardingWrapupPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                        임의 종료
                      </button>
                    </Tooltips>
                  ) : (
                    <div className="inline-flex h-5 items-center gap-1.5 text-[12px] text-beige50/70 transition-all duration-300 ease-out">
                      <Clock3 className="h-3.5 w-3.5" />약 5분
                    </div>
                  )}
                </div>
              </div>
              <div
                className="mt-2 h-1 overflow-hidden rounded-full bg-beige50/15"
                role="progressbar"
                aria-label="커리어 인터뷰 진행률"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={interviewProgress.percent}
              >
                <div
                  className="h-full rounded-full bg-[#f1a35d] transition-[width] duration-700 ease-out"
                  style={{ width: `${interviewProgress.percent}%` }}
                />
              </div>
            </div>
          ) : null}
          <div className="rounded-[16px] border border-beige900/20 bg-white shadow-[0_0_16px_rgba(0,0,0,0.05)] transition-all duration-200 focus-within:border-beige900/40 focus-within:shadow-[0_0_16px_rgba(0,0,0,0.1)]">
            <div className="relative flex items-end gap-2">
              <textarea
                key={textareaResetVersion}
                ref={textareaRef}
                id="career-chat-composer"
                value={isVoiceMode ? voiceTranscript : draft}
                onChange={(event) => setDraft(event.target.value)}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={(event) => {
                  isComposingRef.current = false;
                  setDraft(event.currentTarget.value);
                }}
                onKeyDown={handleComposerKeyDown}
                readOnly={isVoiceMode}
                placeholder={
                  isVoiceMode
                    ? voiceMuted
                      ? "마이크가 음소거되어 있습니다."
                      : "듣는 중..."
                    : composerPlaceholder
                }
                rows={3}
                disabled={isTextInputLocked}
                className={careerCx(
                  "min-h-[72px] min-w-0 flex-1 resize-none border-none px-3.5 py-4 text-base leading-5 text-black outline-none transition-all placeholder:text-beige900/35 disabled:cursor-not-allowed md:text-sm lg:text-[14px]"
                )}
              />
              {!isVoiceMode && (
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  {showCallQuickAction && (
                    <>
                      <CareerActionButton
                        onClick={() => {
                          logCareerEvent("click_chat_start_call");
                          onStartCallMode?.();
                        }}
                        disabled={isComposerActionLocked || isStartingCall}
                        actionVariant="icon"
                        buttonRadius="pill"
                        className="h-8 w-8 border border-black/15 bg-white/45 text-beige900"
                        aria-label="통화 모드"
                      >
                        {isStartingCall ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Phone className="h-3 w-3" />
                        )}
                      </CareerActionButton>
                    </>
                  )}
                  <CareerActionButton
                    onClick={() => void handleSend()}
                    disabled={isComposerActionLocked || !draft.trim()}
                    actionVariant="icon"
                    buttonRadius="pill"
                    className="h-8 w-8 border-beige900 bg-beige900 text-beige50 hover:bg-beige800 hover:text-beige50"
                  >
                    {chatPending || assistantTyping ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </CareerActionButton>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CareerComposerSection);
