import {
  ArrowUp,
  Check,
  Loader2,
  Mic,
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
    voiceError,
    onStartVoiceCall,
    onSendChatMessage,
    onVoicePrimaryAction,
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
    <div className="border-t border-hblack200 p-4">
      {showCallQuickAction ? (
        <button
          type="button"
          onClick={onStartVoiceCall}
          disabled={isComposerLocked || onboardingBeginPending}
          className="mb-3 inline-flex h-10 items-center justify-center rounded-full border border-xprimary bg-xprimary px-4 text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {onboardingBeginPending ? "준비 중..." : "Call 하기"}
        </button>
      ) : null}

      {inputMode === "voice" ? (
        <div>
          <div className="mb-4 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={onVoicePrimaryAction}
              disabled={isComposerLocked}
              className={[
                "inline-flex h-24 w-24 items-center justify-center rounded-full border text-hblack000 transition-all",
                voiceListening
                  ? "border-xprimary bg-xprimary shadow-[0_0_0_6px_rgba(29,155,240,0.15)]"
                  : "border-hblack300 bg-hblack000 text-hblack800 hover:border-xprimary hover:text-xprimary",
                isComposerLocked ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              {voiceListening ? (
                <Check className="h-8 w-8" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </button>
            <p className="text-xs text-hblack500">
              {voiceListening
                ? "말이 끝났으면 버튼을 눌러 전송하세요."
                : "버튼을 눌러 음성 인식 시작 또는 전송하세요."}
            </p>
          </div>

          <div className="rounded-lg border border-hblack200 bg-hblack000 px-3 py-3 text-sm text-hblack700">
            <p className="text-xs uppercase tracking-[0.08em] text-hblack500">
              Live Transcript
            </p>
            <p className="mt-2 min-h-[48px] whitespace-pre-line leading-relaxed">
              {voiceTranscript || "음성 인식 결과가 여기에 표시됩니다."}
            </p>
          </div>

          {voiceError && (
            <p className="mt-2 border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
              {voiceError}
            </p>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onSwitchToTextMode}
              className="h-9 border border-hblack300 bg-hblack000 px-3 text-xs text-hblack700 transition-colors hover:border-xprimary hover:text-xprimary"
            >
              채팅 입력으로 전환
            </button>
          </div>
        </div>
      ) : (
        <>
          {showLinkInput && (
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
          )}

          <div className="relative flex items-end rounded-2xl border border-hblack200 bg-hblack000 px-2 py-2 shadow-[0_4px_12px_rgba(17,24,39,0.06)]">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={composerPlaceholder}
              disabled={isComposerLocked}
              className="min-h-[88px] max-h-[140px] w-full resize-none border-none bg-transparent px-2 py-1 text-sm text-hblack900 outline-none placeholder:text-hblack500 disabled:cursor-not-allowed"
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLinkInput((prev) => !prev)}
                disabled={!user || isComposerLocked}
                className="inline-flex h-8 w-8 items-center justify-center border border-hblack300 text-hblack600 transition-colors hover:bg-hblack100 hover:text-hblack900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isComposerLocked || !draft.trim()}
                className="inline-flex h-8 w-8 items-center justify-center border border-xprimary bg-xprimary text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {chatPending || assistantTyping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CareerComposerSection;
