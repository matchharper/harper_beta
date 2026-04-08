import { useEffect, useRef } from "react";
import { Loader2, Phone, PhoneOff } from "lucide-react";
import CareerComposerSection from "./chat/CareerComposerSection";
import CareerTimelineSection from "./chat/CareerTimelineSection";
import { useCareerChatPanelContext } from "./CareerChatPanelContext";
import { CareerPrimaryButton } from "./ui/CareerPrimitives";
import HarperCircle from "@/components/call/HarperCircle";
import Timer from "@/components/call/Timer";

const VoiceChatTranscriptPanel = () => {
  const { voiceChatTranscript } = useCareerChatPanelContext();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [voiceChatTranscript.length]);

  if (voiceChatTranscript.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="mx-auto mt-4 w-full max-w-md max-h-[240px] overflow-y-auto rounded-xl border border-beige900/10 bg-white/60 px-4 py-3"
    >
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-beige900/40">
        Transcript
      </p>
      <div className="space-y-2">
        {voiceChatTranscript.map((turn, i) => (
          <div key={i} className="text-sm leading-relaxed">
            <span
              className={
                turn.role === "assistant"
                  ? "font-medium text-beige900/80"
                  : "font-medium text-blue-700/80"
              }
            >
              {turn.role === "assistant" ? "Harper" : "User"}:
            </span>{" "}
            <span className="text-beige900/60">{turn.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const VoiceCallScreen = () => {
  const {
    voiceChatStatus,
    voiceChatDuration,
    voiceChatError,
    onEndVoiceChat,
    onDismissVoiceChat,
  } = useCareerChatPanelContext();

  if (voiceChatStatus === "connecting") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <HarperCircle micLevel={0} />
        <div className="flex items-center gap-2 text-sm text-beige900/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          연결 중입니다...
        </div>
        <button
          type="button"
          onClick={onEndVoiceChat}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-300 bg-red-50 px-5 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-100"
        >
          <PhoneOff className="h-3.5 w-3.5" />
          취소
        </button>
      </div>
    );
  }

  if (voiceChatStatus === "active" || voiceChatStatus === "ending") {
    return (
      <div className="flex flex-1 flex-col items-center gap-6 overflow-hidden pt-10">
        <HarperCircle micLevel={0.5} />
        <Timer />
        <p className="text-sm text-beige900/50">Harper와 통화 중</p>
        <button
          type="button"
          onClick={onEndVoiceChat}
          disabled={voiceChatStatus === "ending"}
          className="inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          <PhoneOff className="h-4 w-4" />
          {voiceChatStatus === "ending" ? "종료 중..." : "통화 종료"}
        </button>
        <VoiceChatTranscriptPanel />
      </div>
    );
  }

  if (voiceChatStatus === "ended") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-beige900/10">
          <Phone className="h-6 w-6 text-beige900/60" />
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-beige900">
            통화가 종료되었습니다
          </p>
          <p className="mt-1 text-sm text-beige900/50">
            {Math.floor(voiceChatDuration / 60)}분 {voiceChatDuration % 60}초
          </p>
          {voiceChatError && (
            <p className="mt-2 text-sm text-red-600">{voiceChatError}</p>
          )}
          <p className="mt-3 text-xs text-beige900/40">
            통화 내용을 분석하여 인사이트를 추출하고 있습니다...
          </p>
        </div>
        <CareerPrimaryButton onClick={onDismissVoiceChat} className="gap-2 px-6">
          채팅으로 돌아가기
        </CareerPrimaryButton>
        <VoiceChatTranscriptPanel />
      </div>
    );
  }

  return null;
};

const CareerChatPanel = () => {
  const { voiceChatStatus } = useCareerChatPanelContext();
  const isVoiceChatActive = voiceChatStatus !== "idle";

  return (
    <section className="flex min-h-0 flex-1 flex-col lg:h-full">
      {isVoiceChatActive ? (
        <VoiceCallScreen />
      ) : (
        <>
          <CareerTimelineSection />
          <CareerComposerSection />
        </>
      )}
    </section>
  );
};

export default CareerChatPanel;
