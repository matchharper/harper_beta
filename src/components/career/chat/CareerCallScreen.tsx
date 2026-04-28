import { Loader2, Mic, MicOff, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { careerCx } from "@/components/career/ui/CareerPrimitives";
import { useCareerVoiceInputStore } from "@/store/useCareerVoiceInputStore";
import type { CallTranscriptEntry } from "../types";
import CareerCallEnvironmentNotice from "./CareerCallEnvironmentNotice";

/* ─── Waveform Dots ─── */

const WAVEFORM_DOT_COUNT = 5;
const CALL_CLOSE_ANIMATION_MS = 420;

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
  ({
    entries,
    currentUserTranscript,
  }: {
    entries: CallTranscriptEntry[];
    currentUserTranscript?: string;
  }) => {
    const bottomRef = useRef<HTMLDivElement>(null);
    const liveUserText = currentUserTranscript?.trim() ?? "";
    const hasSameUserEntry = entries.some(
      (entry) => entry.role === "user" && entry.text.trim() === liveUserText
    );
    const lastEntry = entries[entries.length - 1];
    const liveUserEntry =
      liveUserText && !hasSameUserEntry
        ? ({
            role: "user",
            text: liveUserText,
            timestamp: "live",
            isLive: true,
          } as CallTranscriptEntry & { isLive: boolean })
        : null;
    const displayEntries = liveUserEntry
      ? lastEntry?.role === "assistant"
        ? [...entries.slice(0, -1), liveUserEntry, lastEntry]
        : [...entries, liveUserEntry]
      : entries;

    useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [displayEntries.length, liveUserText]);

    return (
      <div className="absolute inset-x-4 bottom-24 z-10 max-h-[50vh] overflow-hidden rounded-[8px] border border-beige900/10 bg-white/95 shadow-[0_0_24px_rgba(0,0,0,0.1)]">
        <div className="border-b border-beige900/10 px-4 py-3">
          <span className="text-sm font-medium text-beige900/70">
            Transcript
          </span>
        </div>
        <div className="max-h-[calc(50vh-48px)] overflow-y-auto px-4 py-3">
          {displayEntries.length === 0 ? (
            <p className="text-center text-sm text-beige900/35">
              대화가 시작되면 여기에 표시됩니다.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {displayEntries.map((entry, i) => (
                <div
                  key={`${entry.timestamp}-${entry.role}-${i}`}
                  className={careerCx(
                    "max-w-[80%] rounded-[8px] px-3 py-2 text-sm",
                    entry.role === "user"
                      ? "ml-auto bg-[#e87c3e]/85 text-white"
                      : "mr-auto bg-beige900/5 text-beige900/80",
                    "isLive" in entry && entry.isLive ? "opacity-75" : null
                  )}
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

type CareerCallScreenProps = {
  noticeCollapsed: boolean;
  onToggleNotice: () => void;
};

const CareerCallScreen = ({
  noticeCollapsed,
  onToggleNotice,
}: CareerCallScreenProps) => {
  const {
    voiceMuted,
    voiceTranscript,
    onToggleVoiceMute,
    onEndCallMode,
    callTranscriptEntries,
    callConnectionStatus,
    isAssistantSpeaking,
  } = useCareerChatPanelContext();

  const [showTranscript, setShowTranscript] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const hasObservedLiveConnectionRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const hasStarted = (callTranscriptEntries ?? []).length > 0;
  const timer = useCallTimer(hasStarted);

  const requestEndCall = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    if (typeof window === "undefined") {
      onEndCallMode?.();
      return;
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onEndCallMode?.();
    }, CALL_CLOSE_ANIMATION_MS);
  }, [isClosing, onEndCallMode]);

  const handleEndCall = useCallback(() => {
    requestEndCall();
  }, [requestEndCall]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleToggleVoiceMute = useCallback(() => {
    if (isClosing) return;
    onToggleVoiceMute();
  }, [isClosing, onToggleVoiceMute]);

  const handleToggleTranscript = useCallback(() => {
    if (isClosing) return;
    setShowTranscript((prev) => !prev);
  }, [isClosing]);

  // Auto-end only after the call has actually reached a live connection state.
  // The first call-screen render can still receive the previous "disconnected"
  // status while the Realtime state update is settling.
  useEffect(() => {
    if (
      callConnectionStatus === "connected" ||
      callConnectionStatus === "reconnecting"
    ) {
      hasObservedLiveConnectionRef.current = true;
      return;
    }
    if (!hasObservedLiveConnectionRef.current) return;
    if (callConnectionStatus === "disconnected") {
      requestEndCall();
    }
  }, [callConnectionStatus, requestEndCall]);

  return (
    <div
      className={careerCx(
        "relative flex min-h-0 flex-1 flex-col items-center transition-all duration-500 ease-out",
        isClosing
          ? "pointer-events-none translate-y-3 scale-[0.985] opacity-0 blur-[2px]"
          : "translate-y-0 scale-100 opacity-100 blur-0"
      )}
    >
      <div className="absolute inset-x-4 top-4 z-20 flex flex-col items-center gap-3">
        <CareerCallEnvironmentNotice
          collapsed={noticeCollapsed}
          onToggle={onToggleNotice}
        />
        {callConnectionStatus === "reconnecting" && (
          <div className="flex items-center gap-2 rounded-full border border-beige900/10 bg-white/85 px-3 py-2 text-sm text-beige900/60 shadow-[0_10px_24px_rgba(44,29,17,0.1)] backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            연결 중...
          </div>
        )}
      </div>

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
        <TranscriptOverlay
          entries={callTranscriptEntries ?? []}
          currentUserTranscript={voiceTranscript}
        />
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
            onClick={handleToggleVoiceMute}
            disabled={isClosing}
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
            onClick={handleToggleTranscript}
            disabled={isClosing}
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
            disabled={isClosing}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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
