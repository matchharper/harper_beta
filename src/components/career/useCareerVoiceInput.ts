import { useCallback, useEffect, useRef, useState } from "react";
import type { CareerInputMode } from "./types";

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

type UseCareerVoiceInputArgs = {
  canInteract: boolean;
  onSendMessage: (args: VoiceSendArgs) => void | Promise<void>;
  onUnsupported: (message: string) => void;
};

const getSpeechRecognitionCtor = () => {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
};

const notAllowedVoiceErrors = new Set(["not-allowed", "service-not-allowed"]);

export function useCareerVoiceInput(args: UseCareerVoiceInputArgs) {
  const { canInteract, onSendMessage, onUnsupported } = args;
  const [inputMode, setInputMode] = useState<CareerInputMode>("text");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceFinalTextRef = useRef("");
  const voiceDraftTextRef = useRef("");
  const commitOnEndRef = useRef(false);

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
      console.log("[career-voice]", data);
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
    setIsSpeechSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  useEffect(() => {
    voiceDraftTextRef.current = voiceTranscript;
  }, [voiceTranscript]);

  useEffect(() => {
    if (canInteract) return;
    commitOnEndRef.current = false;
    recognitionRef.current?.stop();
    setVoiceListening(false);
    setInputMode("text");
  }, [canInteract]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

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

      void onSendMessage({
        text,
        onError: () => {
          setVoiceTranscript(text);
          voiceFinalTextRef.current = text;
          voiceDraftTextRef.current = text;
        },
      });
    },
    [clearVoiceBuffer, onSendMessage]
  );

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
              typeof window !== "undefined" ? window.isSecureContext : undefined,
            visibilityState:
              typeof document !== "undefined"
                ? document.visibilityState
                : undefined,
            hasFocus:
              typeof document !== "undefined" ? document.hasFocus() : undefined,
            isInIframe:
              typeof window !== "undefined" ? window.self !== window.top : undefined,
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
      });
      setVoiceListening(false);
      const shouldCommit = commitOnEndRef.current;
      commitOnEndRef.current = false;
      if (!shouldCommit) return;

      const text = voiceDraftTextRef.current.trim();
      if (!text) {
        setVoiceError("인식된 음성이 없어 전송하지 않았습니다.");
        return;
      }
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

  const startVoiceListening = useCallback(() => {
    if (!canInteract) return;
    try {
      const recognition = ensureSpeechRecognition();
      logVoiceDebug("recognition-start-attempt");
      setVoiceError("");
      setVoiceListening(true);
      recognition.start();
      logVoiceDebug("recognition-start-success");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "음성 인식을 시작하지 못했습니다.";
      logVoiceDebug("recognition-start-failed", {
        error: message,
      });
      setVoiceError(message);
      setVoiceListening(false);
    }
  }, [canInteract, ensureSpeechRecognition, logVoiceDebug]);

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
    clearVoiceBuffer();
    startVoiceListening();
  }, [
    clearVoiceBuffer,
    isSpeechSupported,
    logEnvironmentSnapshot,
    logVoiceDebug,
    onUnsupported,
    startVoiceListening,
  ]);

  const handleVoicePrimaryAction = useCallback(() => {
    if (!canInteract) return;

    if (voiceListening) {
      commitOnEndRef.current = true;
      recognitionRef.current?.stop();
      return;
    }

    if (voiceTranscript.trim()) {
      sendTranscript(voiceTranscript);
      return;
    }

    startVoiceListening();
  }, [canInteract, sendTranscript, startVoiceListening, voiceListening, voiceTranscript]);

  const switchToTextMode = useCallback(() => {
    commitOnEndRef.current = false;
    recognitionRef.current?.stop();
    setVoiceListening(false);
    setInputMode("text");
    logVoiceDebug("switch-to-text-mode");
  }, [logVoiceDebug]);

  const switchToChatOnly = useCallback(() => {
    switchToTextMode();
  }, [switchToTextMode]);

  const resetVoice = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setVoiceListening(false);
    setVoiceError("");
    setInputMode("text");
    clearVoiceBuffer();
    logVoiceDebug("reset-voice");
  }, [clearVoiceBuffer, logVoiceDebug]);

  return {
    inputMode,
    voiceTranscript,
    voiceListening,
    voiceError,
    onboardingVoiceSupported: isSpeechSupported,
    startVoiceCall,
    switchToChatOnly,
    handleVoicePrimaryAction,
    switchToTextMode,
    resetVoice,
  };
}
