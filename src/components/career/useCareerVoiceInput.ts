import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CallTranscriptEntry,
  CareerInputMode,
  CareerMessage,
} from "./types";
import { useCareerVoiceInputStore } from "@/store/useCareerVoiceInputStore";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type VoiceSendArgs = {
  text: string;
  onError?: () => void;
};

type VoiceEngine = "realtime" | "webspeech";

type RealtimeControls = {
  isConnected: boolean;
  isConnecting: boolean;
  partialTranscript: string;
  connectionStatus: "connected" | "reconnecting" | "disconnected";
  connect: () => Promise<boolean>;
  disconnect: () => void;
  sendTextMessage: (text: string) => void;
  triggerResponse: () => void;
  cancelResponse: () => void;
  primePlayback?: () => void;
  getMediaStream: () => MediaStream | null;
};

type UseCareerVoiceInputArgs = {
  canInteract: boolean;
  messages: CareerMessage[];
  onSendMessage: (args: VoiceSendArgs) => void | Promise<void>;
  onUnsupported: (message: string) => void;
  realtimeControls?: RealtimeControls | null;
};

const CALL_END_MARKER = "##END##";
const getSpeechRecognitionCtor = () => {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
};

const notAllowedVoiceErrors = new Set(["not-allowed", "service-not-allowed"]);
const AUTO_RESUME_RETRY_DELAYS_MS = [180, 260, 360, 520, 760, 1000];
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

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  if (target.isContentEditable) return true;

  if (tagName === "INPUT" || tagName === "TEXTAREA") {
    const field = target as HTMLInputElement | HTMLTextAreaElement;
    return !field.readOnly && !field.disabled;
  }

  if (tagName === "SELECT") {
    return !(target as HTMLSelectElement).disabled;
  }

  return false;
};

export function useCareerVoiceInput(args: UseCareerVoiceInputArgs) {
  const {
    canInteract,
    messages,
    onSendMessage,
    onUnsupported,
    realtimeControls,
  } = args;
  const [inputMode, setInputMode] = useState<CareerInputMode>("text");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [assistantAudioBusy, setAssistantAudioBusy] = useState(false);
  const [voicePrimaryPressed, setVoicePrimaryPressed] = useState(false);
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngine>("webspeech");
  const voiceEngineRef = useRef<VoiceEngine>("webspeech");
  const [callTranscriptEntries, setCallTranscriptEntries] = useState<
    CallTranscriptEntry[]
  >([]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceFinalTextRef = useRef("");
  const voiceDraftTextRef = useRef("");
  const commitOnEndRef = useRef(false);
  const autoResumeAfterResponseRef = useRef(false);
  const spokenAssistantIdsRef = useRef<Set<string>>(new Set());
  const previousInputModeRef = useRef<CareerInputMode>("text");
  const assistantAudioRef = useRef<HTMLAudioElement | null>(null);
  const assistantAudioUrlRef = useRef<string | null>(null);
  const assistantTtsAbortRef = useRef<AbortController | null>(null);
  const assistantTtsRequestIdRef = useRef(0);
  const spacebarPressActiveRef = useRef(false);
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

  const probeMicrophoneAccess = useCallback(async () => {
    if (typeof window === "undefined") return "unknown";
    const hasMediaDevices =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function";
    if (!hasMediaDevices) return "media-devices-unavailable";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return "granted";
    } catch (error) {
      const code =
        error && typeof error === "object" && "name" in error
          ? String((error as { name?: unknown }).name ?? "unknown")
          : "unknown";
      const message = error instanceof Error ? error.message : "";
      return `blocked:${code}${message ? `:${message}` : ""}`;
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

  useEffect(() => {
    const hasWebSpeech = Boolean(getSpeechRecognitionCtor());
    const hasWebSocket = typeof WebSocket !== "undefined";
    setIsSpeechSupported(hasWebSpeech || hasWebSocket);
  }, []);

  useEffect(() => {
    voiceDraftTextRef.current = voiceTranscript;
  }, [voiceTranscript]);

  useEffect(() => {
    voiceEngineRef.current = voiceEngine;
  }, [voiceEngine]);

  // Sync Realtime partial transcript to input field display
  useEffect(() => {
    if (
      voiceEngine === "realtime" &&
      realtimeControls?.partialTranscript != null
    ) {
      setVoiceTranscript(realtimeControls.partialTranscript);
      voiceDraftTextRef.current = realtimeControls.partialTranscript;
    }
  }, [voiceEngine, realtimeControls?.partialTranscript]);

  useEffect(() => {
    if (canInteract) return;
    commitOnEndRef.current = false;
    if (inputMode !== "voice") return;
    recognitionRef.current?.stop();
    setVoiceListening(false);
  }, [canInteract, inputMode]);

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

  const releaseAssistantAudioUrl = useCallback(() => {
    if (!assistantAudioUrlRef.current) return;
    URL.revokeObjectURL(assistantAudioUrlRef.current);
    assistantAudioUrlRef.current = null;
  }, []);

  const cleanupAssistantAudio = useCallback(
    (options?: { preserveBusy?: boolean }) => {
      const audio = assistantAudioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.src = "";
        assistantAudioRef.current = null;
      }

      releaseAssistantAudioUrl();
      assistantTtsAbortRef.current = null;

      if (!options?.preserveBusy) {
        setAssistantAudioBusy(false);
      }
    },
    [releaseAssistantAudioUrl]
  );

  const stopAssistantAudio = useCallback(
    (options?: { preserveBusy?: boolean }) => {
      assistantTtsRequestIdRef.current += 1;
      assistantTtsAbortRef.current?.abort();
      cleanupAssistantAudio(options);
    },
    [cleanupAssistantAudio]
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      stopVoiceLevelMonitor({ preserveLevel: true });
      stopAssistantAudio({ preserveBusy: true });
    };
  }, [stopAssistantAudio, stopVoiceLevelMonitor]);

  const clearVoiceBuffer = useCallback(() => {
    setVoiceTranscript("");
    voiceFinalTextRef.current = "";
    voiceDraftTextRef.current = "";
    commitOnEndRef.current = false;
  }, []);

  const sendTranscript = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      clearVoiceBuffer();
      if (inputMode === "voice") {
        autoResumeAfterResponseRef.current = true;
      }

      // Route text through Realtime WebSocket when connected
      if (voiceEngine === "realtime" && realtimeControls?.isConnected) {
        realtimeControls.sendTextMessage(text);
        return;
      }

      void onSendMessage({
        text,
        onError: () => {
          setVoiceTranscript(text);
          voiceFinalTextRef.current = text;
          voiceDraftTextRef.current = text;
        },
      });
    },
    [clearVoiceBuffer, inputMode, onSendMessage, realtimeControls, voiceEngine]
  );

  useEffect(() => {
    if (previousInputModeRef.current === inputMode) return;

    if (inputMode === "voice" || inputMode === "call") {
      stopAssistantAudio();
      const existingAssistantIds = messages
        .filter((message) => message.role === "assistant")
        .map((message) => String(message.id));
      spokenAssistantIdsRef.current = new Set(existingAssistantIds);
    } else if (
      previousInputModeRef.current === "voice" ||
      previousInputModeRef.current === "call"
    ) {
      stopAssistantAudio();
    }

    previousInputModeRef.current = inputMode;
  }, [inputMode, messages, stopAssistantAudio]);

  useEffect(() => {
    if (
      (inputMode !== "voice" && inputMode !== "call") ||
      voiceMuted ||
      !voiceListening
    ) {
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

  useEffect(() => {
    if (inputMode !== "voice") return;
    if (typeof window === "undefined") return;

    const latestAssistantMessage = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          !message.typing &&
          Boolean(message.content.trim()) &&
          (message.messageType ?? "chat") === "chat"
      );

    if (!latestAssistantMessage) return;

    const messageId = String(latestAssistantMessage.id);
    if (spokenAssistantIdsRef.current.has(messageId)) return;
    spokenAssistantIdsRef.current.add(messageId);

    const controller = new AbortController();
    stopAssistantAudio({ preserveBusy: true });

    const requestId = assistantTtsRequestIdRef.current + 1;
    assistantTtsRequestIdRef.current = requestId;
    assistantTtsAbortRef.current = controller;
    setAssistantAudioBusy(true);
    setVoiceError("");

    void (async () => {
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: latestAssistantMessage.content,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(
            errorText || `TTS request failed with status ${response.status}`
          );
        }

        if (
          controller.signal.aborted ||
          assistantTtsRequestIdRef.current !== requestId
        ) {
          return;
        }

        const audioBlob = await response.blob();

        if (
          controller.signal.aborted ||
          assistantTtsRequestIdRef.current !== requestId
        ) {
          return;
        }

        const audioUrl = URL.createObjectURL(audioBlob);
        if (
          controller.signal.aborted ||
          assistantTtsRequestIdRef.current !== requestId
        ) {
          URL.revokeObjectURL(audioUrl);
          return;
        }

        assistantAudioUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audio.preload = "auto";
        assistantAudioRef.current = audio;

        audio.onended = () => {
          if (assistantTtsRequestIdRef.current !== requestId) return;
          cleanupAssistantAudio();
        };

        audio.onerror = () => {
          if (assistantTtsRequestIdRef.current !== requestId) return;
          cleanupAssistantAudio();
          setVoiceError("Harper 음성 응답을 재생하지 못했습니다.");
          logVoiceDebug("assistant-tts-playback-error");
        };

        await audio.play();
      } catch (error) {
        if (
          controller.signal.aborted ||
          assistantTtsRequestIdRef.current !== requestId
        ) {
          return;
        }

        cleanupAssistantAudio();
        const message =
          error instanceof Error
            ? error.message
            : "assistant tts request failed";
        setVoiceError("Harper 음성 응답을 재생하지 못했습니다.");
        logVoiceDebug("assistant-tts-request-failed", {
          error: message,
        });
      }
    })();
  }, [
    cleanupAssistantAudio,
    inputMode,
    logVoiceDebug,
    messages,
    stopAssistantAudio,
  ]);

  const ensureSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current;

    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      throw new Error(
        "현재 브라우저에서는 음성 인식을 지원하지 않습니다. Chrome 환경을 권장합니다."
      );
    }

    const recognition = new SpeechRecognitionCtor() as SpeechRecognitionLike;
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;

    logVoiceDebug("recognition-created", {
      ctorName:
        (SpeechRecognitionCtor as { name?: string }).name ?? "anonymous",
      lang: recognition.lang,
      continuous: recognition.continuous,
      interimResults: recognition.interimResults,
    });

    recognition.onresult = (event: any) => {
      let finalText = voiceFinalTextRef.current;
      let interimText = "";

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const current = event.results[index];
        const transcript = String(current?.[0]?.transcript ?? "").trim();
        if (!transcript) continue;

        if (current.isFinal) {
          finalText = `${finalText} ${transcript}`.trim();
        } else {
          interimText = `${interimText} ${transcript}`.trim();
        }
      }

      voiceFinalTextRef.current = finalText;
      const merged = [finalText, interimText].filter(Boolean).join(" ").trim();
      setVoiceTranscript(merged);
    };

    recognition.onerror = (event: any) => {
      const errorCode = String(event?.error ?? "");
      logVoiceDebug("recognition-error", {
        errorCode,
        eventMessage:
          typeof event?.message === "string" ? event.message : undefined,
        eventType: typeof event?.type === "string" ? event.type : undefined,
      });

      if (notAllowedVoiceErrors.has(errorCode)) {
        void (async () => {
          const permissionState = await readPermissionState();
          const micProbe = await probeMicrophoneAccess();
          logVoiceDebug("not-allowed-diagnostics", {
            permissionState,
            micProbe,
            isSecureContext:
              typeof window !== "undefined"
                ? window.isSecureContext
                : undefined,
            visibilityState:
              typeof document !== "undefined"
                ? document.visibilityState
                : undefined,
            hasFocus:
              typeof document !== "undefined" ? document.hasFocus() : undefined,
            isInIframe:
              typeof window !== "undefined"
                ? window.self !== window.top
                : undefined,
          });
        })();

        setVoiceError(
          "마이크 권한 또는 브라우저 정책으로 음성 인식이 차단되었습니다. 콘솔의 [career-voice] 로그를 확인해 주세요."
        );
      } else {
        const reason = errorCode ? `(${errorCode})` : "";
        setVoiceError(`음성 인식 중 오류가 발생했습니다. ${reason}`.trim());
      }
      setVoiceListening(false);
      commitOnEndRef.current = false;
    };

    recognition.onend = () => {
      logVoiceDebug("recognition-end", {
        commitOnEnd: commitOnEndRef.current,
        transcriptLength: voiceDraftTextRef.current.trim().length,
        voiceEngine: voiceEngineRef.current,
      });

      // When Realtime is active, Web Speech is display-only — don't send, auto-restart
      if (voiceEngineRef.current === "realtime") {
        try {
          recognition.start();
        } catch {
          // Safe to ignore — may fail if context lost
        }
        return;
      }

      setVoiceListening(false);
      const shouldCommit = commitOnEndRef.current;
      commitOnEndRef.current = false;
      if (!shouldCommit) return;

      const text = voiceDraftTextRef.current.trim();
      if (!text) return;
      sendTranscript(text);
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [
    logVoiceDebug,
    probeMicrophoneAccess,
    readPermissionState,
    sendTranscript,
  ]);

  const startVoiceListening = useCallback(
    (options?: { suppressError?: boolean }) => {
      if (!canInteract) return false;

      const tryStart = (forceReset: boolean) => {
        if (forceReset) {
          recognitionRef.current?.abort();
          recognitionRef.current = null;
        }

        const recognition = ensureSpeechRecognition();
        logVoiceDebug("recognition-start-attempt", {
          forceReset,
        });
        setVoiceError("");
        setVoiceListening(true);
        recognition.start();
        logVoiceDebug("recognition-start-success", {
          forceReset,
        });
      };

      try {
        tryStart(false);
        return true;
      } catch (error) {
        const firstMessage =
          error instanceof Error
            ? error.message
            : "음성 인식을 시작하지 못했습니다.";
        logVoiceDebug("recognition-start-retrying", {
          error: firstMessage,
        });

        try {
          tryStart(true);
          return true;
        } catch (retryError) {
          const message =
            retryError instanceof Error
              ? retryError.message
              : "음성 인식을 시작하지 못했습니다.";
          logVoiceDebug("recognition-start-failed", {
            error: message,
          });
          if (!options?.suppressError) {
            setVoiceError(message);
          }
          setVoiceListening(false);
          return false;
        }
      }
    },
    [canInteract, ensureSpeechRecognition, logVoiceDebug]
  );

  useEffect(() => {
    if (!canInteract || inputMode !== "voice") return;
    if (!autoResumeAfterResponseRef.current) return;
    if (voiceMuted || voiceListening) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    let timerId: number | null = null;
    let idleChecks = 0;
    let startAttempts = 0;

    const tryAutoResume = () => {
      if (cancelled) return;

      // TTS 오디오 재생과 네트워크 응답이 모두 끝난 뒤에만 마이크를 자동 재개한다.
      if (assistantAudioBusy) {
        idleChecks = 0;
        timerId = window.setTimeout(tryAutoResume, 120);
        return;
      }

      idleChecks += 1;
      if (idleChecks < 2) {
        timerId = window.setTimeout(tryAutoResume, 120);
        return;
      }

      const started = startVoiceListening({ suppressError: true });
      if (started) {
        autoResumeAfterResponseRef.current = false;
        return;
      }

      startAttempts += 1;
      if (startAttempts >= AUTO_RESUME_RETRY_DELAYS_MS.length) {
        autoResumeAfterResponseRef.current = false;
        setVoiceError(
          "마이크 자동 재시작에 실패했습니다. 마이크 버튼을 눌러 다시 시작해 주세요."
        );
        return;
      }

      timerId = window.setTimeout(
        tryAutoResume,
        AUTO_RESUME_RETRY_DELAYS_MS[startAttempts]
      );
    };

    timerId = window.setTimeout(tryAutoResume, AUTO_RESUME_RETRY_DELAYS_MS[0]);

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [
    assistantAudioBusy,
    canInteract,
    inputMode,
    startVoiceListening,
    voiceListening,
    voiceMuted,
  ]);

  const startVoiceCall = useCallback(async () => {
    if (!isSpeechSupported) {
      const unsupportedMessage =
        "이 브라우저는 음성 인식을 지원하지 않습니다. 현재 채팅으로 계속 진행해 주세요.";
      onUnsupported(unsupportedMessage);
      setInputMode("text");
      return;
    }

    void logEnvironmentSnapshot();
    logVoiceDebug("start-voice-call-clicked");
    setInputMode("voice");
    setVoiceError("");
    setVoiceMuted(false);
    autoResumeAfterResponseRef.current = false;
    stopAssistantAudio();
    clearVoiceBuffer();

    // Try Realtime first, fallback to Web Speech API
    if (realtimeControls) {
      logVoiceDebug("attempting-realtime-connect");
      const connected = await realtimeControls.connect();
      if (connected) {
        setVoiceEngine("realtime");
        setVoiceListening(true);
        logVoiceDebug("realtime-connected");
        // Start Web Speech API in parallel for real-time transcript display
        if (getSpeechRecognitionCtor()) {
          startVoiceListening({ suppressError: true });
          logVoiceDebug("webspeech-started-for-display");
        }
        return;
      }
      logVoiceDebug("realtime-connect-failed, falling back to webspeech");
    }

    setVoiceEngine("webspeech");
    startVoiceListening();
  }, [
    clearVoiceBuffer,
    isSpeechSupported,
    logEnvironmentSnapshot,
    logVoiceDebug,
    onUnsupported,
    realtimeControls,
    startVoiceListening,
    stopAssistantAudio,
  ]);

  const handleVoicePrimaryAction = useCallback(() => {
    if (!canInteract) return;

    // Realtime engine: spacebar triggers response.create (VAD handles audio commit)
    if (voiceEngine === "realtime" && realtimeControls?.isConnected) {
      if (voiceMuted) {
        setVoiceMuted(false);
        setVoiceListening(true);
        return;
      }
      // Force-send: trigger response generation from current audio buffer
      realtimeControls.triggerResponse();
      return;
    }

    // Web Speech API engine (fallback)
    if (voiceMuted) {
      setVoiceMuted(false);
      startVoiceListening();
      return;
    }

    if (voiceListening) {
      const transcript = voiceDraftTextRef.current.trim();
      if (!transcript) return;
      commitOnEndRef.current = true;
      recognitionRef.current?.stop();
      return;
    }

    if (voiceTranscript.trim()) {
      sendTranscript(voiceTranscript);
      return;
    }

    startVoiceListening();
  }, [
    canInteract,
    realtimeControls,
    sendTranscript,
    startVoiceListening,
    voiceEngine,
    voiceListening,
    voiceMuted,
    voiceTranscript,
  ]);

  const sendTranscriptBySpacebar = useCallback(() => {
    if (!canInteract || inputMode !== "voice" || voiceMuted) return;

    const transcript = voiceDraftTextRef.current.trim();
    if (!transcript) return;

    if (voiceListening) {
      commitOnEndRef.current = true;
      recognitionRef.current?.stop();
      return;
    }

    sendTranscript(transcript);
  }, [canInteract, inputMode, sendTranscript, voiceListening, voiceMuted]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (inputMode !== "voice") return;

    const handleSpacebarDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code !== "Space" && event.key !== " ") return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      spacebarPressActiveRef.current = true;
      setVoicePrimaryPressed(true);
    };

    const handleSpacebarUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      if (!spacebarPressActiveRef.current) return;

      event.preventDefault();
      spacebarPressActiveRef.current = false;
      setVoicePrimaryPressed(false);
      sendTranscriptBySpacebar();
    };

    const handleWindowBlur = () => {
      spacebarPressActiveRef.current = false;
      setVoicePrimaryPressed(false);
    };

    window.addEventListener("keydown", handleSpacebarDown);
    window.addEventListener("keyup", handleSpacebarUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      spacebarPressActiveRef.current = false;
      window.removeEventListener("keydown", handleSpacebarDown);
      window.removeEventListener("keyup", handleSpacebarUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [inputMode, sendTranscriptBySpacebar]);

  useEffect(() => {
    if (inputMode === "voice") return;
    spacebarPressActiveRef.current = false;
    setVoicePrimaryPressed(false);
  }, [inputMode]);

  const toggleVoiceMute = useCallback(() => {
    if (!canInteract) return;

    if (voiceMuted) {
      setVoiceMuted(false);
      setVoiceError("");
      if (voiceEngine === "realtime") {
        setVoiceListening(true);
      } else {
        startVoiceListening();
      }
      logVoiceDebug("voice-unmuted");
      return;
    }

    commitOnEndRef.current = false;
    if (voiceEngine === "webspeech") {
      recognitionRef.current?.stop();
    }
    setVoiceListening(false);
    stopVoiceLevelMonitor();
    setVoiceMuted(true);
    logVoiceDebug("voice-muted");
  }, [
    canInteract,
    logVoiceDebug,
    startVoiceListening,
    stopVoiceLevelMonitor,
    voiceEngine,
    voiceMuted,
  ]);

  const switchToTextMode = useCallback(() => {
    voiceEngineRef.current = "webspeech";
    commitOnEndRef.current = false;
    autoResumeAfterResponseRef.current = false;
    spacebarPressActiveRef.current = false;
    setVoicePrimaryPressed(false);
    recognitionRef.current?.stop();
    // Note: do NOT disconnect Realtime here — text input also uses the Realtime session
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

  const armAutoResumeAfterAssistant = useCallback(() => {
    autoResumeAfterResponseRef.current = true;
  }, []);

  const clearAutoResumeAfterAssistant = useCallback(() => {
    autoResumeAfterResponseRef.current = false;
  }, []);

  const resetVoice = useCallback(() => {
    voiceEngineRef.current = "webspeech";
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    autoResumeAfterResponseRef.current = false;
    spacebarPressActiveRef.current = false;
    setVoicePrimaryPressed(false);
    stopVoiceLevelMonitor();
    stopAssistantAudio();
    // Disconnect Realtime session on full reset
    realtimeControls?.disconnect();
    callAssistantTranscriptStreamingRef.current = false;
    setVoiceEngine("webspeech");
    setVoiceListening(false);
    setVoiceMuted(false);
    setVoiceError("");
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
  const startCallMode = useCallback(async () => {
    void logEnvironmentSnapshot();
    logVoiceDebug("start-call-mode");
    setVoiceError("");
    setVoiceMuted(false);
    stopAssistantAudio();
    recognitionRef.current?.abort();
    clearVoiceBuffer();
    setCallTranscriptEntries([]);
    callAssistantTranscriptStreamingRef.current = false;

    if (realtimeControls) {
      realtimeControls.disconnect();
      const connected = await realtimeControls.connect();
      if (connected) {
        setVoiceEngine("realtime");
        setVoiceListening(true);
        setInputMode("call");
        inputModeRef.current = "call";
        logVoiceDebug("call-mode-connected");

        void startVoiceLevelMonitor();
        return true;
      }
    }

    // Fallback: can't connect realtime, stay in text mode
    onUnsupported("실시간 연결에 실패했습니다. 채팅으로 진행해 주세요.");
    return false;
  }, [
    clearVoiceBuffer,
    logEnvironmentSnapshot,
    logVoiceDebug,
    onUnsupported,
    realtimeControls,
    startVoiceLevelMonitor,
    stopAssistantAudio,
  ]);

  // Leaves call mode, closes Realtime/mic resources, and keeps the transcript
  // in memory for the wrap-up request.
  const endCallMode = useCallback(() => {
    logVoiceDebug("end-call-mode");
    voiceEngineRef.current = "webspeech";
    commitOnEndRef.current = false;
    autoResumeAfterResponseRef.current = false;
    spacebarPressActiveRef.current = false;
    setVoicePrimaryPressed(false);
    recognitionRef.current?.stop();
    stopVoiceLevelMonitor();
    stopAssistantAudio();
    realtimeControls?.disconnect();
    setVoiceEngine("webspeech");
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
  const inputModeRef = useRef(inputMode);
  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  const addCallTranscriptEntry = useCallback(
    (
      role: "user" | "assistant",
      text: string,
      options?: { beforeCurrentAssistant?: boolean }
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
    voiceListening,
    voiceMuted,
    voiceError,
    assistantAudioBusy,
    voicePrimaryPressed,
    voiceEngine,
    onboardingVoiceSupported: isSpeechSupported,
    callTranscriptEntries,
    connectionStatus:
      realtimeControls?.connectionStatus ?? ("disconnected" as const),
    startVoiceCall,
    startCallMode,
    endCallMode,
    addCallTranscriptEntry,
    appendCallAssistantTranscriptDelta,
    finalizeCallAssistantTranscript,
    switchToChatOnly,
    handleVoicePrimaryAction,
    toggleVoiceMute,
    switchToTextMode,
    armAutoResumeAfterAssistant,
    clearAutoResumeAfterAssistant,
    resetVoice,
    clearVoiceBuffer,
  };
}
