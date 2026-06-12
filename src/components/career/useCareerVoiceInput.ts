import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CallLiveTranscriptPlacement,
  CallTranscriptEntry,
  CareerInputMode,
} from "./types";
import { useCareerVoiceInputStore } from "@/store/useCareerVoiceInputStore";
import type { CareerConversationStarterId } from "@/lib/career/conversationStarters";
import type { RealtimeConnectFailure } from "@/hooks/career/useRealtimeSession";

type RealtimeControls = {
  partialTranscript: string;
  connectionStatus: "connected" | "reconnecting" | "disconnected";
  connect: (options?: {
    conversationStarterId?: CareerConversationStarterId | null;
    internalCallRequestId?: string | null;
  }) => Promise<boolean>;
  disconnect: () => void;
  getLastConnectFailure?: () => RealtimeConnectFailure | null;
  getMediaStream: () => MediaStream | null;
};

type UseCareerVoiceInputArgs = {
  canInteract: boolean;
  onUnsupported: (message: string) => void;
  realtimeControls?: RealtimeControls | null;
};

const CALL_END_MARKER = "##END##";
const VOICE_DEBUG_STORAGE_KEY = "careerVoiceDebug";
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const isCareerVoiceDebugEnabled = () => {
  if (process.env.NODE_ENV !== "production") return true;
  if (typeof window === "undefined") return false;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    return (
      searchParams.get("voiceDebug") === "1" ||
      window.localStorage.getItem(VOICE_DEBUG_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
};

export function useCareerVoiceInput(args: UseCareerVoiceInputArgs) {
  const { canInteract, onUnsupported, realtimeControls } = args;
  const [inputMode, setInputMode] = useState<CareerInputMode>("text");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [callTranscriptEntries, setCallTranscriptEntries] = useState<
    CallTranscriptEntry[]
  >([]);

  const voiceLevelStreamRef = useRef<MediaStream | null>(null);
  const voiceLevelAudioContextRef = useRef<AudioContext | null>(null);
  const voiceLevelSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const voiceLevelAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceLevelDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const voiceLevelAnimationFrameRef = useRef<number | null>(null);
  const voiceLevelFloorRef = useRef(0.008);
  const voiceLevelPeakRef = useRef(0.08);
  const voiceLevelSmoothedRef = useRef(0);
  const voiceLevelLastLogAtRef = useRef(0);
  const callAssistantTranscriptStreamingRef = useRef(false);
  const voiceTranscript =
    inputMode === "call" ? (realtimeControls?.partialTranscript ?? "") : "";

  const logVoiceDebug = useCallback(
    (phase: string, payload?: Record<string, unknown>) => {
      if (typeof window === "undefined") return;
      const timestamp = new Date().toISOString();
      const base: Record<string, unknown> = {
        phase,
        timestamp,
        inputMode,
        canInteract,
      };
      const data = payload ? { ...base, ...payload } : base;
      if (isCareerVoiceDebugEnabled()) {
        console.log("[career-voice]", data);
      }
    },
    [canInteract, inputMode]
  );

  const readPermissionState = useCallback(async () => {
    if (typeof window === "undefined") return "unknown";
    const hasPermissionsApi =
      typeof navigator !== "undefined" &&
      typeof navigator.permissions?.query === "function";
    if (!hasPermissionsApi) return "permissions-api-unavailable";

    try {
      const result = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      return result.state;
    } catch (error) {
      return `permissions-query-error:${
        error instanceof Error ? error.message : "unknown"
      }`;
    }
  }, []);

  const logEnvironmentSnapshot = useCallback(async () => {
    if (typeof window === "undefined") return;
    const permissionState = await readPermissionState();
    logVoiceDebug("env-snapshot", {
      href: window.location.href,
      protocol: window.location.protocol,
      isSecureContext: window.isSecureContext,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      isInIframe: window.self !== window.top,
      permissionState,
      userAgent: navigator.userAgent,
    });
  }, [logVoiceDebug, readPermissionState]);

  const resetVoiceInputLevel = useCallback(() => {
    voiceLevelFloorRef.current = 0.008;
    voiceLevelPeakRef.current = 0.08;
    voiceLevelSmoothedRef.current = 0;
    useCareerVoiceInputStore.getState().resetVoiceInputLevel();
  }, []);

  const stopVoiceLevelMonitor = useCallback(
    (options?: { preserveLevel?: boolean }) => {
      if (voiceLevelAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(voiceLevelAnimationFrameRef.current);
        voiceLevelAnimationFrameRef.current = null;
      }

      voiceLevelSourceRef.current?.disconnect();
      voiceLevelSourceRef.current = null;
      voiceLevelAnalyserRef.current = null;
      voiceLevelDataRef.current = null;

      // Only stop tracks if we own the stream (not shared from Realtime)
      const realtimeStream = realtimeControls?.getMediaStream?.() ?? null;
      if (
        voiceLevelStreamRef.current &&
        voiceLevelStreamRef.current !== realtimeStream
      ) {
        voiceLevelStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
      }
      voiceLevelStreamRef.current = null;

      const audioContext = voiceLevelAudioContextRef.current;
      voiceLevelAudioContextRef.current = null;
      void audioContext?.close().catch(() => undefined);

      if (!options?.preserveLevel) {
        resetVoiceInputLevel();
      }
    },
    [realtimeControls, resetVoiceInputLevel]
  );

  const startVoiceLevelMonitor = useCallback(async () => {
    if (typeof window === "undefined") return false;
    if (
      typeof navigator === "undefined" ||
      typeof navigator.mediaDevices?.getUserMedia !== "function"
    ) {
      return false;
    }

    if (
      voiceLevelAudioContextRef.current &&
      voiceLevelAnalyserRef.current &&
      voiceLevelStreamRef.current
    ) {
      if (voiceLevelAudioContextRef.current.state === "suspended") {
        await voiceLevelAudioContextRef.current.resume().catch(() => undefined);
      }
      return true;
    }

    try {
      // Use Realtime session's shared MediaStream if available
      const realtimeStream = realtimeControls?.getMediaStream?.() ?? null;
      const stream =
        realtimeStream ??
        (await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        }));

      const AudioContextCtor =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      const audioContext = new AudioContextCtor();
      await audioContext.resume().catch(() => undefined);

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      voiceLevelStreamRef.current = stream;
      voiceLevelAudioContextRef.current = audioContext;
      voiceLevelSourceRef.current = source;
      voiceLevelAnalyserRef.current = analyser;
      voiceLevelDataRef.current = data;
      resetVoiceInputLevel();

      const tick = () => {
        const activeAnalyser = voiceLevelAnalyserRef.current;
        const activeData = voiceLevelDataRef.current;
        if (!activeAnalyser || !activeData) return;

        activeAnalyser.getByteTimeDomainData(activeData);

        let sumSquares = 0;
        for (let index = 0; index < activeData.length; index += 1) {
          const centered = (activeData[index] - 128) / 128;
          sumSquares += centered * centered;
        }

        const rms = Math.sqrt(sumSquares / activeData.length);

        // Keep a rolling floor/peak so the exported level stays usable across different mics.
        const nextFloor =
          rms < voiceLevelFloorRef.current
            ? voiceLevelFloorRef.current * 0.9 + rms * 0.1
            : voiceLevelFloorRef.current * 0.995 + rms * 0.005;
        voiceLevelFloorRef.current = Math.min(nextFloor, 0.12);

        const floor = voiceLevelFloorRef.current + 0.003;
        voiceLevelPeakRef.current = Math.max(
          rms,
          voiceLevelPeakRef.current * 0.985,
          floor + 0.02
        );

        const normalized = clamp01(
          (rms - floor) / Math.max(voiceLevelPeakRef.current - floor, 0.02)
        );
        const gated = normalized < 0.035 ? 0 : normalized;
        const lerpFactor = gated > voiceLevelSmoothedRef.current ? 0.42 : 0.18;
        const smoothed =
          voiceLevelSmoothedRef.current +
          (gated - voiceLevelSmoothedRef.current) * lerpFactor;

        voiceLevelSmoothedRef.current = smoothed;
        useCareerVoiceInputStore.getState().setVoiceInputLevel(smoothed);

        const now = performance.now();
        if (smoothed > 0.08 && now - voiceLevelLastLogAtRef.current > 500) {
          voiceLevelLastLogAtRef.current = now;
          logVoiceDebug("mic-level", {
            level: Number(smoothed.toFixed(3)),
            rms: Number(rms.toFixed(4)),
          });
        }

        voiceLevelAnimationFrameRef.current =
          window.requestAnimationFrame(tick);
      };

      voiceLevelAnimationFrameRef.current = window.requestAnimationFrame(tick);
      return true;
    } catch (error) {
      logVoiceDebug("voice-level-monitor-failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
      stopVoiceLevelMonitor();
      return false;
    }
  }, [
    logVoiceDebug,
    realtimeControls,
    resetVoiceInputLevel,
    stopVoiceLevelMonitor,
  ]);

  const stopAssistantAudio = useCallback(
    (_options?: { preserveBusy?: boolean }) => {
      // No-op while assistant speech is handled by Realtime native audio.
    },
    []
  );

  useEffect(() => {
    return () => {
      stopVoiceLevelMonitor({ preserveLevel: true });
      stopAssistantAudio({ preserveBusy: true });
    };
  }, [stopAssistantAudio, stopVoiceLevelMonitor]);

  const clearVoiceBuffer = useCallback(() => undefined, []);

  useEffect(() => {
    if (inputMode !== "call" || voiceMuted || !voiceListening) {
      stopVoiceLevelMonitor();
      return;
    }

    let cancelled = false;

    void (async () => {
      const started = await startVoiceLevelMonitor();
      if (cancelled && started) {
        stopVoiceLevelMonitor();
      }
    })();

    return () => {
      cancelled = true;
      stopVoiceLevelMonitor();
    };
  }, [
    inputMode,
    startVoiceLevelMonitor,
    stopVoiceLevelMonitor,
    voiceListening,
    voiceMuted,
  ]);

  const toggleVoiceMute = useCallback(() => {
    if (!canInteract) return;

    if (voiceMuted) {
      setVoiceMuted(false);
      setVoiceListening(true);
      logVoiceDebug("voice-unmuted");
      return;
    }

    setVoiceListening(false);
    stopVoiceLevelMonitor();
    setVoiceMuted(true);
    logVoiceDebug("voice-muted");
  }, [canInteract, logVoiceDebug, stopVoiceLevelMonitor, voiceMuted]);

  const switchToTextMode = useCallback(() => {
    stopVoiceLevelMonitor();
    stopAssistantAudio();
    setVoiceListening(false);
    setVoiceMuted(false);
    setInputMode("text");
    logVoiceDebug("switch-to-text-mode");
  }, [logVoiceDebug, stopAssistantAudio, stopVoiceLevelMonitor]);

  const switchToChatOnly = useCallback(() => {
    switchToTextMode();
  }, [switchToTextMode]);

  const resetVoice = useCallback(() => {
    stopVoiceLevelMonitor();
    stopAssistantAudio();
    realtimeControls?.disconnect();
    callAssistantTranscriptStreamingRef.current = false;
    setVoiceListening(false);
    setVoiceMuted(false);
    setInputMode("text");
    clearVoiceBuffer();
    logVoiceDebug("reset-voice");
  }, [
    clearVoiceBuffer,
    logVoiceDebug,
    realtimeControls,
    stopAssistantAudio,
    stopVoiceLevelMonitor,
  ]);

  // Opens the call UI only after Realtime is connected, so the user does not
  // land on a dead call screen.
  const startCallMode = useCallback(
    async (options?: {
      conversationStarterId?: CareerConversationStarterId | null;
      internalCallRequestId?: string | null;
    }) => {
      void logEnvironmentSnapshot();
      logVoiceDebug("start-call-mode");
      setVoiceMuted(false);
      stopAssistantAudio();
      clearVoiceBuffer();
      setCallTranscriptEntries([]);
      callAssistantTranscriptStreamingRef.current = false;

      if (realtimeControls) {
        realtimeControls.disconnect();
        const connected = await realtimeControls.connect({
          conversationStarterId: options?.conversationStarterId ?? null,
          internalCallRequestId: options?.internalCallRequestId ?? null,
        });
        if (connected) {
          setVoiceListening(true);
          setInputMode("call");
          inputModeRef.current = "call";
          logVoiceDebug("call-mode-connected");

          void startVoiceLevelMonitor();
          return true;
        }
        const failure = realtimeControls.getLastConnectFailure?.();
        if (failure?.code === "internal_call_completed") {
          onUnsupported(failure.message);
          return false;
        }
      }

      // Fallback: can't connect realtime, stay in text mode
      onUnsupported("실시간 연결에 실패했습니다. 채팅으로 진행해 주세요.");
      return false;
    },
    [
      clearVoiceBuffer,
      logEnvironmentSnapshot,
      logVoiceDebug,
      onUnsupported,
      realtimeControls,
      startVoiceLevelMonitor,
      stopAssistantAudio,
    ]
  );

  // Leaves call mode, closes Realtime/mic resources, and keeps the transcript
  // in memory for the wrap-up request.
  const endCallMode = useCallback(() => {
    logVoiceDebug("end-call-mode");
    stopVoiceLevelMonitor();
    stopAssistantAudio();
    realtimeControls?.disconnect();
    setVoiceListening(false);
    setVoiceMuted(false);
    setInputMode("text");
    inputModeRef.current = "text";
    callAssistantTranscriptStreamingRef.current = false;
    // Don't clear callTranscriptEntries — needed for wrap-up generation
  }, [
    logVoiceDebug,
    realtimeControls,
    stopAssistantAudio,
    stopVoiceLevelMonitor,
  ]);

  // Accumulate transcript entries only during call mode. Realtime can stream
  // Harper's answer before the final user transcript arrives, so a delayed user
  // entry is inserted before the currently streaming assistant entry.
  const inputModeRef = useRef<CareerInputMode>("text");
  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  const addCallTranscriptEntry = useCallback(
    (
      role: "user" | "assistant",
      text: string,
      options?: {
        beforeCurrentAssistant?: boolean;
        placement?: CallLiveTranscriptPlacement;
      }
    ) => {
      if (inputModeRef.current !== "call") return;
      if (!text.trim()) return;
      if (role === "assistant") {
        callAssistantTranscriptStreamingRef.current = false;
      }
      setCallTranscriptEntries((prev) => {
        const entry = {
          role,
          text: text.trim(),
          timestamp: new Date().toISOString(),
        };
        const lastIndex = prev.length - 1;
        const last = prev[lastIndex];

        const shouldInsertBeforeCurrentAssistant =
          role === "user" &&
          last?.role === "assistant" &&
          options?.placement !== "afterCurrentAssistant" &&
          (options?.beforeCurrentAssistant ||
            callAssistantTranscriptStreamingRef.current);

        if (shouldInsertBeforeCurrentAssistant) {
          return [...prev.slice(0, lastIndex), entry, last];
        }

        return [...prev, entry];
      });
    },
    []
  );

  const appendCallAssistantTranscriptDelta = useCallback((delta: string) => {
    if (inputModeRef.current !== "call") return;

    const displayDelta = delta.replace(CALL_END_MARKER, "");
    if (!displayDelta) return;

    setCallTranscriptEntries((prev) => {
      const now = new Date().toISOString();
      const lastIndex = prev.length - 1;
      const last = prev[lastIndex];

      if (
        callAssistantTranscriptStreamingRef.current &&
        last?.role === "assistant"
      ) {
        const next = [...prev];
        next[lastIndex] = {
          ...last,
          text: `${last.text}${displayDelta}`.replace(/\s+/g, " ").trimStart(),
          timestamp: now,
        };
        return next;
      }

      if (!displayDelta.trim()) return prev;
      callAssistantTranscriptStreamingRef.current = true;
      return [
        ...prev,
        {
          role: "assistant",
          text: displayDelta.trimStart(),
          timestamp: now,
        },
      ];
    });
  }, []);

  const finalizeCallAssistantTranscript = useCallback((text: string) => {
    if (inputModeRef.current !== "call") return;

    const cleanText = text.replace(CALL_END_MARKER, "").trim();
    const wasStreaming = callAssistantTranscriptStreamingRef.current;
    callAssistantTranscriptStreamingRef.current = false;
    if (!cleanText) return;

    setCallTranscriptEntries((prev) => {
      const now = new Date().toISOString();
      const lastIndex = prev.length - 1;
      const last = prev[lastIndex];

      if (wasStreaming && last?.role === "assistant") {
        const next = [...prev];
        next[lastIndex] = {
          ...last,
          text: cleanText,
          timestamp: now,
        };
        return next;
      }

      return [...prev, { role: "assistant", text: cleanText, timestamp: now }];
    });
  }, []);

  return {
    inputMode,
    voiceTranscript,
    voiceMuted,
    callTranscriptEntries,
    connectionStatus:
      realtimeControls?.connectionStatus ?? ("disconnected" as const),
    startCallMode,
    endCallMode,
    addCallTranscriptEntry,
    appendCallAssistantTranscriptDelta,
    finalizeCallAssistantTranscript,
    switchToChatOnly,
    toggleVoiceMute,
    resetVoice,
    clearVoiceBuffer,
  };
}
