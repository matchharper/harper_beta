import {
  ArrowUp,
  AudioLines,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Plus,
  X,
} from "lucide-react";
import { KeyboardEvent, useState } from "react";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";

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
    onboardingBeginPending,
    showVoiceStartPrompt,
    inputMode,
    voiceTranscript,
    voiceListening,
    voiceInputLevel,
    voiceMuted,
    voicePrimaryPressed,
    onStartVoiceCall,
    onSendChatMessage,
    onVoicePrimaryAction,
    onToggleVoiceMute,
    onSwitchToTextMode,
  } = useCareerChatPanelContext();

  const [draft, setDraft] = useState("");
  const [chatLinkDraft, setChatLinkDraft] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);

  const isComposerLocked =
    !user ||
    !conversationId ||
    sessionPending ||
    stage === "profile" ||
    showVoiceStartPrompt ||
    profilePending ||
    onboardingBeginPending ||
    chatPending ||
    assistantTyping;

  const composerPlaceholder = !user
    ? "로그인 후 대화를 시작할 수 있습니다."
    : stage === "profile"
      ? "기본 정보 제출 후 대화가 시작됩니다."
      : showVoiceStartPrompt
        ? "아래 시작 버튼으로 대화를 시작해 주세요."
        : profilePending
          ? "이력서/링크를 분석 중입니다."
          : "Harper에게 답변을 입력하세요.";

  const showCallQuickAction =
    Boolean(user) &&
    messages.length > 0 &&
    stage !== "profile" &&
    inputMode === "text" &&
    !showVoiceStartPrompt;

  const isVoiceMode = inputMode === "voice";
  const normalizedVoiceInputLevel = Math.max(0, Math.min(1, voiceInputLevel));
  const voiceTranscriptFillWidth = `${Math.round(normalizedVoiceInputLevel * 100)}%`;

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
    <div className="border-t border-hblack100/0 p-4 pt-0 relative">
      {showCallQuickAction ? (
        <button
          type="button"
          onClick={onStartVoiceCall}
          disabled={isComposerLocked || onboardingBeginPending}
          className="right-4 absolute top-[-40px] mb-3 inline-flex gap-2 h-9 items-center justify-center rounded-full border border-xprimary bg-xprimary px-3 text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Phone className="h-3.5 w-3.5" />
          {onboardingBeginPending ? "준비 중..." : "전화로 하기"}
        </button>
      ) : null}

      {!isVoiceMode && showLinkInput ? (
        <div className="mb-2 flex items-center gap-2 border border-hblack200 bg-hblack100 px-2 py-2">
          <input
            value={chatLinkDraft}
            onChange={(event) => setChatLinkDraft(event.target.value)}
            placeholder="대화에 포함할 링크를 입력하세요."
            className="h-9 flex-1 border-none bg-transparent px-2 text-sm text-hblack900 outline-none placeholder:text-hblack500"
          />
          <button
            type="button"
            onClick={() => {
              setChatLinkDraft("");
              setShowLinkInput(false);
            }}
            className="inline-flex h-8 w-8 items-center justify-center border border-hblack300 text-hblack600 hover:border-xprimary hover:text-xprimary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {isVoiceMode ? (
        <div className="relative w-full flex items-center justify-center">
          <div className="inline-flex flex-row items-center justify-center mb-2 gap-2 bg-hblack100/50 p-2 rounded-full">
            <button
              type="button"
              onClick={onVoicePrimaryAction}
              disabled={isComposerLocked}
              className={[
                "group z-10 flex flex-row items-center justify-center overflow-hidden rounded-full border px-4 py-2.5 text-xs text-hblack000 transition-all duration-150",
                voiceListening && !voiceMuted
                  ? "bg-hblack000 text-hblack1000 border border-hblack100"
                  : "border-hblack300 bg-hblack000 text-hblack800 hover:border-xprimary hover:text-xprimary",
                voicePrimaryPressed
                  ? "scale-[0.96] border-xprimary ring-2 ring-xprimary/25"
                  : "",
                isComposerLocked ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              {voiceListening && !voiceMuted ? (
                <div className="flex flex-row items-center gap-2">
                  <ArrowUp className="h-3.5 w-4 transition-all group-hover:translate-y-[-32px]" />
                  말하는 중... (스페이스바를 눌러서 전송)
                </div>
              ) : voiceMuted ? (
                <div className="flex flex-row items-center gap-2">
                  <MicOff className="h-3.5 w-4" />
                  음소거 상태
                </div>
              ) : (
                <div className="flex flex-row items-center gap-2">
                  <AudioLines className="h-3.5 w-4 transition-all group-hover:translate-y-[-32px]" />
                  대기중...
                </div>
              )}
            </button>

            {/* {voiceError && (
              <p className="mt-2 border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
                {voiceError}
              </p>
            )} */}

            <button
              type="button"
              onClick={onToggleVoiceMute}
              disabled={isComposerLocked}
              className="rounded-full inline-flex h-9 w-9 items-center justify-center border border-hblack100 text-hblack500 transition-colors bg-hblack000 hover:bg-hblack100 hover:text-hblack900 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={voiceMuted ? "음소거 해제" : "음소거"}
            >
              {voiceMuted ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onSwitchToTextMode}
              className="rounded-full inline-flex h-9 w-9 items-center justify-center border border-red-400 text-red-400 bg-hblack000 transition-opacity"
            >
              <PhoneOff className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
      <div className={isVoiceMode ? "relative" : "relative"}>
        <div className="relative z-10 flex items-end overflow-hidden rounded-2xl border border-hblack200 bg-hblack000 px-2 py-2 shadow-[0_4px_12px_rgba(17,24,39,0.06)]">
          {isVoiceMode ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-hblack200 via-hblack200 to-transparent transition-[width,opacity] duration-200"
              style={{
                width: voiceTranscriptFillWidth,
                opacity: voiceListening ? 1 : 0.35,
              }}
            />
          ) : null}
          <textarea
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
            className={`
              ${isVoiceMode ? "min-h-[68px] max-h-[120px]" : "min-h-[88px] max-h-[140px]"} relative z-10 w-full resize-none border-none bg-transparent px-2 py-1 text-sm text-hblack900 outline-none transition-all duration-200 placeholder:text-hblack500 disabled:cursor-not-allowed`}
          />
          {isVoiceMode ? (
            <div></div>
          ) : (
            <div className="absolute bottom-2 right-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLinkInput((prev) => !prev)}
                disabled={!user || isComposerLocked || isVoiceMode}
                className="rounded-full inline-flex h-8 w-8 items-center justify-center border border-hblack300 text-hblack600 transition-colors hover:bg-hblack100 hover:text-hblack900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isComposerLocked || !draft.trim()}
                className="rounded-full inline-flex h-7 w-7 items-center justify-center border border-xprimary bg-xprimary text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
  );
};

export default CareerComposerSection;
