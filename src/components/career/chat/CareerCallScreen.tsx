import { Loader2, Mic, MicOff, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { useCareerVoiceInputStore } from "@/store/useCareerVoiceInputStore";
import type { CallTranscriptEntry } from "../types";

/* ─── Waveform Dots ─── */

const WAVEFORM_DOT_COUNT = 5;

const WaveformDots = memo(() => {
  const voiceInputLevel = useCareerVoiceInputStore(
    (state) => state.voiceInputLevel
  );

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: WAVEFORM_DOT_COUNT }).map((_, i) => {
        const threshold = (i + 1) / (WAVEFORM_DOT_COUNT + 1);
        const active = voiceInputLevel > threshold;
        return (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full transition-all duration-150"
            style={{
              backgroundColor: active
                ? "rgb(var(--color-beige900))"
                : "rgb(var(--color-beige900) / 0.2)",
              transform: active
                ? `scaleY(${1 + voiceInputLevel * 1.5})`
                : "scaleY(1)",
            }}
          />
        );
      })}
    </div>
  );
});

WaveformDots.displayName = "WaveformDots";

/* ─── Timer ─── */

const useCallTimer = (started: boolean) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!started) return;
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [started]);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

/* ─── Transcript Overlay ─── */

const TranscriptOverlay = memo(
  ({ entries }: { entries: CallTranscriptEntry[] }) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [entries.length]);

    return (
      <div className="absolute inset-x-4 bottom-24 z-10 max-h-[50vh] overflow-hidden rounded-[8px] border border-beige900/10 bg-white/95 shadow-[0_0_24px_rgba(0,0,0,0.08)]">
        <div className="border-b border-beige900/10 px-4 py-3">
          <span className="text-sm font-medium text-beige900/70">
            Transcript
          </span>
        </div>
        <div className="max-h-[calc(50vh-48px)] overflow-y-auto px-4 py-3">
          {entries.length === 0 ? (
            <p className="text-center text-sm text-beige900/35">
              대화가 시작되면 여기에 표시됩니다.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((entry, i) => (
                <div
                  key={i}
                  className={`max-w-[80%] rounded-[8px] px-3 py-2 text-sm ${
                    entry.role === "user"
                      ? "ml-auto bg-[#e87c3e]/85 text-white"
                      : "mr-auto bg-beige900/5 text-beige900/80"
                  }`}
                >
                  {entry.text}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>
    );
  }
);

TranscriptOverlay.displayName = "TranscriptOverlay";

/* ─── Call Screen ─── */

const CareerCallScreen = () => {
  const {
    voiceMuted,
    onToggleVoiceMute,
    onEndCallMode,
    callTranscriptEntries,
    callConnectionStatus,
    isAssistantSpeaking,
  } = useCareerChatPanelContext();

  const [showTranscript, setShowTranscript] = useState(false);
  const hasStarted = (callTranscriptEntries ?? []).length > 0;
  const timer = useCallTimer(hasStarted);

  const handleEndCall = useCallback(() => {
    onEndCallMode?.();
  }, [onEndCallMode]);

  const toggleTranscript = useCallback(() => {
    setShowTranscript((prev) => !prev);
  }, []);

  // Auto-end call on disconnect
  useEffect(() => {
    if (callConnectionStatus === "disconnected") {
      onEndCallMode?.();
    }
  }, [callConnectionStatus, onEndCallMode]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center">
      {/* Reconnecting banner */}
      {callConnectionStatus === "reconnecting" && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-2 bg-beige900/5 py-2 text-sm text-beige900/60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          연결 중...
        </div>
      )}

      {/* Center area — pushed up from center */}
      <div className="flex flex-1 flex-col items-center justify-center pb-40">
        <span className="text-lg font-medium text-beige900/80">Harper</span>
        <div className="mt-4 flex h-24 w-24 items-center justify-center rounded-full bg-beige900/5">
          <WaveformDots />
        </div>
        <span className="mt-4 text-sm tabular-nums text-beige900/50">
          {timer}
        </span>
        {/* Speaking / Listening status */}
        <span
          className={`mt-3 rounded-full px-3 py-1 text-xs font-medium ${
            isAssistantSpeaking
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {isAssistantSpeaking ? "Speaking" : "Listening"}
        </span>
      </div>

      {/* Transcript overlay */}
      {showTranscript && (
        <TranscriptOverlay entries={callTranscriptEntries ?? []} />
      )}

      {/* Bottom control bar */}
      <div className="sticky bottom-0 flex w-full justify-center pb-8 pt-4">
        <div className="flex items-center gap-3 rounded-full bg-beige900/5 px-5 py-3">
          {/* Waveform indicator */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
            <WaveformDots />
          </div>

          {/* Mic mute toggle */}
          <button
            type="button"
            onClick={onToggleVoiceMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
              voiceMuted
                ? "bg-beige900/15 text-beige900/50"
                : "bg-white text-beige900"
            }`}
            aria-label={voiceMuted ? "음소거 해제" : "음소거"}
          >
            {voiceMuted ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </button>

          {/* CC toggle */}
          <button
            type="button"
            onClick={toggleTranscript}
            className={`flex h-12 w-12 items-center justify-center rounded-[8px] text-sm font-bold transition-colors ${
              showTranscript
                ? "bg-beige900 text-[#f5ecdd]"
                : "bg-white text-beige900/70"
            }`}
            aria-label="자막 토글"
          >
            cc
          </button>

          {/* End call */}
          <button
            type="button"
            onClick={handleEndCall}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white transition-opacity hover:opacity-90"
            aria-label="통화 종료"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CareerCallScreen;
