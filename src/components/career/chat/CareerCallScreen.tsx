import { Loader2, Mic, MicOff, Captions, PhoneOff } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import Face, { type FaceStatus } from "@/components/common/Face";
import { Tooltips } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCareerVoiceInputStore } from "@/store/useCareerVoiceInputStore";
import type {
  CallLiveTranscriptPlacement,
  CallTranscriptEntry,
} from "../types";
import CareerCallEnvironmentNotice from "./CareerCallEnvironmentNotice";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

/* ─── Waveform Dots ─── */

const WAVEFORM_DOT_COUNT = 5;
const CALL_CLOSE_ANIMATION_MS = 420;

const WaveformDots = memo(({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const sizeClass =
    size === "sm"
      ? "h-[2px] w-[2px]"
      : size === "md"
        ? "h-[3px] w-[3px]"
        : "h-[4px] w-[4px]";
  const voiceInputLevel = useCareerVoiceInputStore(
    (state) => state.voiceInputLevel
  );

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: WAVEFORM_DOT_COUNT }).map((_, i) => {
        const threshold = (i + 1) / (WAVEFORM_DOT_COUNT + 1);
        const active = voiceInputLevel > threshold;
        return (
          <div
            key={i}
            className={cn(
              "rounded-full bg-black transition-[opacity,transform] duration-150",
              sizeClass,
              active ? "opacity-100" : "opacity-25"
            )}
            style={{
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
    liveUserTranscriptPlacement = "beforeCurrentAssistant",
    currentUserTranscript,
  }: {
    entries: CallTranscriptEntry[];
    liveUserTranscriptPlacement?: CallLiveTranscriptPlacement;
    currentUserTranscript?: string;
  }) => {
    const t = useCareerT();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const liveUserText = currentUserTranscript?.trim() ?? "";
    const hasSameUserEntry = entries.some(
      (entry) => entry.role === "user" && entry.text.trim() === liveUserText
    );
    const lastEntry = entries[entries.length - 1];
    const shouldShowLiveUserEntry = Boolean(liveUserText) && !hasSameUserEntry;
    const liveUserEntry = shouldShowLiveUserEntry
      ? ({
          role: "user",
          text: liveUserText,
          timestamp: "live",
          isLive: true,
        } as CallTranscriptEntry & { isLive: boolean })
      : null;
    const shouldPlaceLiveUserBeforeCurrentAssistant =
      liveUserTranscriptPlacement === "beforeCurrentAssistant" &&
      lastEntry?.role === "assistant";
    const displayEntries = liveUserEntry
      ? shouldPlaceLiveUserBeforeCurrentAssistant
        ? [...entries.slice(0, -1), liveUserEntry, lastEntry]
        : [...entries, liveUserEntry]
      : entries;
    const transcriptScrollKey = displayEntries
      .map((entry) => `${entry.timestamp}:${entry.role}:${entry.text}`)
      .join("\n");

    useEffect(() => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      const frame = window.requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });

      return () => window.cancelAnimationFrame(frame);
    }, [transcriptScrollKey]);

    return (
      <div className="absolute inset-x-4 bottom-24 z-10 max-h-[50svh] overflow-hidden rounded-[8px] border border-neutral-1000-a05 bg-bg-default/95 shadow-[0_0_24px_color-mix(in_srgb,var(--color-black)_10%,transparent)]">
        <div className="border-b border-neutral-1000-a05 px-4 py-3">
          <span className="text-sm font-medium text-neutral-muted">
            Transcript
          </span>
        </div>
        <div
          ref={scrollContainerRef}
          className="max-h-[calc(50svh-48px)] overflow-y-auto px-4 py-3"
        >
          {displayEntries.length === 0 ? (
            <p className="text-center text-sm text-neutral-disabled">
              {t(
                "career.chat.career_call_screen.0u4w1k5",
                "대화가 시작되면 여기에 표시됩니다."
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {displayEntries.map((entry, i) => {
                const isLiveUserEntry =
                  "isLive" in entry && entry.isLive && entry.role === "user";

                return (
                  <div
                    key={`${entry.timestamp}-${entry.role}-${i}`}
                    className={cn(
                      "max-w-[80%] rounded-[8px] px-3 py-2 text-sm",
                      entry.role === "user"
                        ? "ml-auto bg-primary/85 text-neutral-00"
                        : "mr-auto bg-black/5 text-neutral-muted",
                      isLiveUserEntry ? "opacity-80" : null
                    )}
                  >
                    {entry.text}
                  </div>
                );
              })}
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
  const t = useCareerT();

  const {
    voiceMuted,
    voiceTranscript,
    liveUserTranscriptPlacement,
    isOnboardingDone,
    forceCompletePending = false,
    interviewProgress,
    onboardingWrapupPending,
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
  const hasStarted =
    callConnectionStatus === "connected" ||
    callConnectionStatus === "reconnecting" ||
    (callTranscriptEntries ?? []).length > 0;
  const timer = useCallTimer(hasStarted);
  const faceStatus: FaceStatus = isClosing
    ? "closing"
    : isAssistantSpeaking
      ? "speaking"
      : "listening";
  const forceCompleteTooltip = t(
    "career.chat.career_call_screen.0n1pl8k",
    "커리어 인터뷰를 임의로 종료할 수 있어요. 거의 다 왔으니 2~3개의 질문에만 추가로 대답해주시면 자동으로 종료됩니다!"
  );

  const showInterviewCallProgress = !isOnboardingDone;

  const requestEndCall = useCallback(
    (options?: { forceCompleteOnboarding?: boolean }) => {
      if (isClosing) return;
      setIsClosing(true);
      if (typeof window === "undefined") {
        onEndCallMode?.(options);
        return;
      }
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        onEndCallMode?.(options);
      }, CALL_CLOSE_ANIMATION_MS);
    },
    [isClosing, onEndCallMode]
  );

  const handleEndCall = useCallback(() => {
    requestEndCall({
      forceCompleteOnboarding: interviewProgress.canForceComplete,
    });
  }, [interviewProgress.canForceComplete, requestEndCall]);

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
      className={cn(
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
          <div className="flex items-center gap-2 rounded-full border border-neutral-1000-a05 bg-bg-floating px-3 py-2 text-sm text-neutral-muted shadow-[0_10px_24px_color-mix(in_srgb,var(--color-neutral-1000)_10%,transparent)] backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("career.call.career_call_card.1vn8y3k", "연결 중...")}
          </div>
        )}
      </div>

      {/* Center area — pushed up from center */}
      <div className="flex flex-1 flex-col items-center justify-center pb-40">
        <span className="text-lg font-medium text-neutral-muted">Harper</span>
        <Face status={faceStatus} className="mt-4" aria-label="Harper" />
        <span className="mt-4 text-sm tabular-nums text-neutral-soft">
          {timer}
        </span>

        {/* Speaking / Listening status */}
        <span
          className={`mt-3 rounded-full px-3 py-1 text-xs font-medium ${
            isAssistantSpeaking
              ? "bg-positive-faded text-positive"
              : "bg-info-faded text-info"
          }`}
        >
          {isAssistantSpeaking ? "Speaking" : "Listening"}
        </span>

        {showInterviewCallProgress ? (
          <div className="mt-4 w-full max-w-[360px] min-w-[360px] rounded-[12px] border border-neutral-1000-a05 bg-black/90 px-4 py-3 text-neutral-00 shadow-[0_14px_32px_color-mix(in_srgb,var(--color-neutral-1000)_16%,transparent)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <span className="career-interview-shimmer text-[13px] font-semibold">
                {t(
                  "career.home.career_home_panel.1ol18h9",
                  "커리어 인터뷰 진행 중"
                )}
              </span>
              <span className="text-[13px] font-normal text-neutral-00/80">
                {t("career.chat.career_call_screen.082qr7j", "완료율")}
              </span>
            </div>
            <div
              className="mt-2 h-1 overflow-hidden rounded-full bg-bg-default/15"
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
                className="h-full rounded-full bg-accent-300 transition-[width] duration-700 ease-out"
                style={{ width: `${interviewProgress.percent}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Transcript overlay */}
      {showTranscript && (
        <TranscriptOverlay
          entries={callTranscriptEntries ?? []}
          liveUserTranscriptPlacement={liveUserTranscriptPlacement}
          currentUserTranscript={voiceTranscript}
        />
      )}

      {/* Bottom control bar */}
      <div className="sticky bottom-0 flex w-full justify-center pb-8 pt-4">
        <div className="flex items-center gap-3 rounded-full bg-black/5 px-5 py-3">
          {/* Waveform indicator */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-default">
            <WaveformDots />
          </div>

          {/* Mic mute toggle */}
          <BareButton
            type="button"
            onClick={handleToggleVoiceMute}
            disabled={isClosing}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
              voiceMuted
                ? "bg-black/15 text-neutral-soft"
                : "bg-bg-default text-neutral-primary"
            }`}
            aria-label={
              voiceMuted
                ? t("career.chat.career_call_screen.15tfl05", "음소거 해제")
                : t("career.chat.career_call_screen.1914g7j", "음소거")
            }
          >
            {voiceMuted ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </BareButton>

          {/* CC toggle */}
          <BareButton
            type="button"
            onClick={handleToggleTranscript}
            disabled={isClosing}
            className={`flex h-12 w-12 items-center justify-center rounded-[8px] text-sm font-bold transition-colors ${
              showTranscript
                ? "bg-black text-neutral-00"
                : "bg-bg-default text-neutral-muted"
            }`}
            aria-label={t(
              "career.chat.career_call_screen.0a6n15y",
              "자막 토글"
            )}
          >
            <Captions className="h-5 w-5" />
          </BareButton>

          {/* End call */}
          {interviewProgress.canForceComplete ? (
            <Tooltips text={forceCompleteTooltip} side="top">
              <BareButton
                type="button"
                onClick={handleEndCall}
                disabled={
                  isClosing || forceCompletePending || onboardingWrapupPending
                }
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-critical px-4 text-sm font-semibold text-neutral-00 transition-colors hover:opacity-90 disabled:opacity-60"
                aria-label={t(
                  "career.chat.career_call_screen.1l3ov75",
                  "통화 종료 및 커리어 인터뷰 임의 종료"
                )}
              >
                {t("career.chat.career_call_screen.0yqbta2", "임의 종료")}
                {forceCompletePending || onboardingWrapupPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PhoneOff className="h-4 w-4" strokeWidth={1.6} />
                )}
              </BareButton>
            </Tooltips>
          ) : (
            <BareButton
              type="button"
              onClick={handleEndCall}
              disabled={isClosing}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-critical text-neutral-00 transition-opacity hover:opacity-90 disabled:opacity-60"
              aria-label={t(
                "career.chat.career_call_screen.16d2ux9",
                "통화 종료"
              )}
            >
              <PhoneOff className="h-4 w-4" strokeWidth={1.6} />
            </BareButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default CareerCallScreen;
