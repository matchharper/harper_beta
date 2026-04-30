import React from "react";
import {
  ArrowUp,
  AudioLines,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
} from "lucide-react";
import { KeyboardEvent, useState } from "react";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { isOnboardingPaused } from "@/hooks/career/careerHelpers";
import { CareerSecondaryButton, careerCx } from "../ui/CareerPrimitives";
import CareerVoiceInputLevelFill from "./CareerVoiceInputLevelFill";

const CareerComposerSection = () => {
  const {
    user,
    conversationId,
    stage,
    messages,
    sessionPending,
    profilePending,
    chatPending,
    assistantTyping,
    opportunitySearchLocked,
    onboardingBeginPending,
    callStartPending = false,
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
  } = useCareerChatPanelContext();

  const [draft, setDraft] = useState("");
  const [chatLinkDraft, setChatLinkDraft] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const onboardingPaused = isOnboardingPaused(messages);
  const isStartingCall = onboardingBeginPending || callStartPending;

  const isComposerLocked =
    !user ||
    !conversationId ||
    sessionPending ||
    stage === "profile" ||
    showVoiceStartPrompt ||
    profilePending ||
    isStartingCall ||
    onboardingPausePending ||
    chatPending ||
    assistantTyping ||
    opportunitySearchLocked;

  const composerPlaceholder = !user
    ? "로그인 후 대화를 시작할 수 있습니다."
    : stage === "profile"
      ? "기본 정보 제출 후 대화가 시작됩니다."
      : showVoiceStartPrompt
        ? "아래 시작 버튼으로 대화를 시작해 주세요."
        : onboardingPaused
          ? "바로 입력하면 대화가 이어집니다."
          : opportunitySearchLocked
            ? "기회를 찾는 중입니다. 검색이 끝나면 다시 입력할 수 있습니다."
            : profilePending
              ? "이력서와 링크를 분석 중입니다."
              : "Harper에게 답변을 입력하세요.";

  const showCallQuickAction =
    Boolean(user) &&
    messages.length > 0 &&
    stage !== "profile" &&
    inputMode === "text" &&
    !showVoiceStartPrompt;

  const isVoiceMode = inputMode === "voice";

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;

    const link = chatLinkDraft.trim();
    setDraft("");
    setChatLinkDraft("");
    setShowLinkInput(false);

    await onSendChatMessage({
      text,
      link,
      onError: () => {
        setDraft(text);
        setChatLinkDraft(link);
      },
    });
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="sticky bottom-0 shrink-0 px-5 py-4">
      <div className="mx-auto w-full max-w-[1120px]">
        {isVoiceMode ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onVoicePrimaryAction}
              disabled={isComposerLocked}
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

            <CareerSecondaryButton
              onClick={onToggleVoiceMute}
              disabled={isComposerLocked}
              className="h-12 w-12 px-0"
              aria-label={voiceMuted ? "음소거 해제" : "음소거"}
            >
              {voiceMuted ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </CareerSecondaryButton>
            <CareerSecondaryButton
              onClick={onSwitchToTextMode}
              className="h-12 w-12 border-[#7c2d12]/20 bg-[#7c2d12]/5 px-0 text-[#7c2d12] hover:border-[#7c2d12]/30"
            >
              <PhoneOff className="h-3.5 w-3.5" />
            </CareerSecondaryButton>
          </div>
        ) : null}

        <div className="rounded-3xl border border-beige900/20 transition-all duration-200 focus-within:border-beige900/40 focus-within:shadow-[0_0_16px_rgba(0,0,0,0.1)] bg-white px-3 py-3 shadow-[0_0_16px_rgba(0,0,0,0.05)]">
          <div className="relative flex items-end gap-2">
            <textarea
              id="career-chat-composer"
              value={isVoiceMode ? voiceTranscript : draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              readOnly={isVoiceMode}
              placeholder={
                isVoiceMode
                  ? voiceMuted
                    ? "마이크가 음소거되어 있습니다."
                    : "듣는 중..."
                  : composerPlaceholder
              }
              disabled={isComposerLocked}
              className={careerCx(
                "min-w-0 flex-1 resize-none border-none px-0.5 py-1 text-[15px] leading-5 text-beige900 outline-none transition-all placeholder:text-beige900/35 disabled:cursor-not-allowed",
                isVoiceMode ? "min-h-[64px]" : "min-h-[88px]"
              )}
            />
            {!isVoiceMode && (
              <div className="absolute bottom-0 right-0 flex items-center gap-2">
                {showCallQuickAction && (
                  <>
                    <button
                      type="button"
                      onClick={() => onStartVoiceCall()}
                      disabled={isComposerLocked || isStartingCall}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-beige900/15 bg-white/45 text-beige900/50 transition-colors hover:border-beige900/30 hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="음성 모드"
                    >
                      <Mic className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartCallMode?.()}
                      disabled={isComposerLocked || isStartingCall}
                      className="inline-flex h-9 px-3 gap-2 text-sm items-center justify-center rounded-[8px] border border-beige900/50 bg-beige900 text-beige50 transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="통화 모드"
                    >
                      {isStartingCall ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Phone className="h-3.5 w-3.5" />
                      )}
                      {isStartingCall ? "연결 중..." : "전화 하기"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={isComposerLocked || !draft.trim()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-beige900 bg-beige900 text-[#f5ecdd] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {chatPending || assistantTyping ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CareerComposerSection);
