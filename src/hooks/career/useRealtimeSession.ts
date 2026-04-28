"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FetchWithAuth } from "./useCareerApi";

type UseRealtimeSessionArgs = {
  conversationId: string | null;
  enabled: boolean;
  useElevenLabsTts?: boolean;
  fetchWithAuth: FetchWithAuth;
  onTranscript: (text: string) => void;
  onAssistantDelta: (delta: string) => void;
  onAssistantDone: (fullText: string) => void;
  onError: (error: string) => void;
  onConnectionChange: (connected: boolean) => void;
  onUserSpeechStarted?: () => void;
};

type TokenInfo = {
  token: string;
  expiresAt: number;
  sessionId: string;
  toolVoicePreambles?: Record<string, string>;
};

type PendingFunctionCallOutput = {
  callId: string;
  output: unknown;
};

const REFRESH_BUFFER_MS = 10_000;
const VOICE_DEBUG_STORAGE_KEY = "careerVoiceDebug";

function isCareerVoiceDebugEnabled(): boolean {
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
}

function logCareerVoiceDebug(
  phase: string,
  payload?: Record<string, unknown>
): void {
  if (!isCareerVoiceDebugEnabled()) return;
  console.log("[career-voice]", {
    phase,
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

function pcm16ToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode base64 PCM16 audio chunk and schedule gapless playback via Web Audio API */
function scheduleAudioChunk(
  base64Audio: string,
  ctxRef: { current: AudioContext | null },
  nextTimeRef: { current: number }
): void {
  try {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctxRef.current = new AudioCtx({ sampleRate: 24000 });
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();

    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const buf = ctx.createBuffer(1, float32.length, 24000);
    buf.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);

    const startTime = Math.max(ctx.currentTime, nextTimeRef.current);
    source.start(startTime);
    nextTimeRef.current = startTime + buf.duration;
  } catch (e) {
    console.error("[RealtimeSession] Audio chunk playback error:", e);
  }
}

function getErrorText(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;

  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error.trim();

  return fallback;
}

export function useRealtimeSession(args: UseRealtimeSessionArgs) {
  const {
    conversationId,
    enabled,
    useElevenLabsTts = false,
    fetchWithAuth,
    onTranscript,
    onAssistantDelta,
    onAssistantDone,
    onError,
    onConnectionChange,
    onUserSpeechStarted,
  } = args;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "reconnecting" | "disconnected"
  >("disconnected");

  const socketRef = useRef<WebSocket | null>(null);
  const tokenInfoRef = useRef<TokenInfo | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseTextRef = useRef("");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(
    null
  );
  const connectRef = useRef<(() => Promise<boolean>) | null>(null);
  const connectPromiseRef = useRef<Promise<boolean> | null>(null);
  const connectAttemptIdRef = useRef(0);

  // Audio playback refs (native Realtime audio output)
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const hasAudioInResponseRef = useRef(false);
  const interruptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalResponseModeRef = useRef<"tool_preamble" | null>(null);
  const pendingToolContinuationRef = useRef<(() => void) | null>(null);
  const responseInProgressRef = useRef(false);
  const responseCancelRequestedRef = useRef(false);
  const suppressCurrentResponseOutputRef = useRef(false);
  const suppressCancelledResponseDoneRef = useRef(false);

  // TTFT measurement: speech_stopped → first audio playback
  const speechStoppedAtRef = useRef<number>(0);

  // Stable value refs
  const useElevenLabsTtsRef = useRef(useElevenLabsTts);
  useEffect(() => {
    useElevenLabsTtsRef.current = useElevenLabsTts;
  }, [useElevenLabsTts]);

  // Stable callback refs
  const onTranscriptRef = useRef(onTranscript);
  const onAssistantDeltaRef = useRef(onAssistantDelta);
  const onAssistantDoneRef = useRef(onAssistantDone);
  const onErrorRef = useRef(onError);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onUserSpeechStartedRef = useRef(onUserSpeechStarted);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onAssistantDeltaRef.current = onAssistantDelta;
  }, [onAssistantDelta]);
  useEffect(() => {
    onAssistantDoneRef.current = onAssistantDone;
  }, [onAssistantDone]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);
  useEffect(() => {
    onUserSpeechStartedRef.current = onUserSpeechStarted;
  }, [onUserSpeechStarted]);

  const cleanupAudio = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    void ctx?.close().catch(() => undefined);
  }, []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const fetchToken = useCallback(async (): Promise<TokenInfo | null> => {
    if (!conversationId) return null;
    try {
      const res = await fetchWithAuth("/api/realtime/token", {
        method: "POST",
        body: JSON.stringify({ conversationId, useElevenLabsTts }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("[RealtimeSession] Token fetch failed:", errText);
        return null;
      }
      const data = await res.json();
      return {
        token: data.token,
        expiresAt:
          typeof data.expiresAt === "number"
            ? data.expiresAt * 1000
            : new Date(data.expiresAt).getTime(),
        sessionId: data.sessionId,
        toolVoicePreambles:
          data.toolVoicePreambles &&
          typeof data.toolVoicePreambles === "object" &&
          !Array.isArray(data.toolVoicePreambles)
            ? (data.toolVoicePreambles as Record<string, string>)
            : {},
      };
    } catch (err) {
      console.error("[RealtimeSession] Token fetch error:", err);
      return null;
    }
  }, [conversationId, fetchWithAuth, useElevenLabsTts]);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(event));
  }, []);

  const requestExactSpeech = useCallback(
    (text: string) => {
      responseTextRef.current = "";
      sendEvent({
        type: "response.create",
        response: {
          instructions: `다음 내용을 정확히 그대로 자연스럽게 말해주세요: "${text}"`,
        },
      });
    },
    [sendEvent]
  );

  const getRemainingPlaybackMs = useCallback(() => {
    const ctx = playbackCtxRef.current;
    if (!ctx || ctx.state === "closed") return 0;
    return Math.max(0, (nextPlayTimeRef.current - ctx.currentTime) * 1000);
  }, []);

  const stopNativePlayback = useCallback(() => {
    const ctx = playbackCtxRef.current;
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => undefined);
    }
    playbackCtxRef.current = null;
    nextPlayTimeRef.current = 0;
    hasAudioInResponseRef.current = false;
    setIsAssistantSpeaking(false);
  }, []);

  const cancelActiveResponse = useCallback(() => {
    suppressCurrentResponseOutputRef.current = true;
    suppressCancelledResponseDoneRef.current = true;

    if (
      responseInProgressRef.current &&
      !responseCancelRequestedRef.current
    ) {
      responseCancelRequestedRef.current = true;
      sendEvent({ type: "response.cancel" });
    }

    responseTextRef.current = "";
    internalResponseModeRef.current = null;
    pendingToolContinuationRef.current = null;
    speechStoppedAtRef.current = 0;
    stopNativePlayback();
  }, [sendEvent, stopNativePlayback]);

  const runAfterCurrentPlayback = useCallback(
    (callback: () => void) => {
      const remainingMs = getRemainingPlaybackMs();
      if (remainingMs > 50) {
        window.setTimeout(callback, remainingMs);
        return;
      }
      callback();
    },
    [getRemainingPlaybackMs]
  );

  const sendFunctionCallOutputs = useCallback(
    (resolvedCalls: PendingFunctionCallOutput[]) => {
      for (const resolvedCall of resolvedCalls) {
        sendEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: resolvedCall.callId,
            output: JSON.stringify(resolvedCall.output),
          },
        });
      }

      sendEvent({ type: "response.create" });
    },
    [sendEvent]
  );

  const resolveFunctionCalls = useCallback(
    async (
      functionCalls: Array<{
        arguments: string;
        callId: string;
        name: string;
      }>
    ): Promise<PendingFunctionCallOutput[]> => {
      const outputs: PendingFunctionCallOutput[] = [];

      for (const functionCall of functionCalls) {
        let parsedArguments: Record<string, unknown> = {};
        try {
          const parsed = functionCall.arguments
            ? JSON.parse(functionCall.arguments)
            : {};
          parsedArguments =
            parsed && typeof parsed === "object" ? parsed : { value: parsed };
        } catch {
          parsedArguments = { _raw: functionCall.arguments };
        }

        let output: unknown;
        try {
          if (!conversationId) {
            throw new Error("Missing conversationId for tool execution.");
          }

          const response = await fetchWithAuth("/api/talent/tool/execute", {
            method: "POST",
            body: JSON.stringify({
              conversationId,
              name: functionCall.name,
              arguments: parsedArguments,
            }),
          });

          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(
              getErrorText(payload, "Failed to execute realtime tool.")
            );
          }

          output = payload?.output ?? {};
        } catch (error) {
          output = {
            error:
              error instanceof Error ? error.message : "Tool execution failed",
          };
        }

        outputs.push({
          callId: functionCall.callId,
          output,
        });
      }

      return outputs;
    },
    [conversationId, fetchWithAuth]
  );

  const getToolVoicePreamble = useCallback(
    (
      functionCalls: Array<{
        arguments: string;
        callId: string;
        name: string;
      }>
    ) => {
      const toolVoicePreambles = tokenInfoRef.current?.toolVoicePreambles ?? {};
      for (const functionCall of functionCalls) {
        const preamble = toolVoicePreambles[functionCall.name];
        if (typeof preamble === "string" && preamble.trim()) {
          return preamble.trim();
        }
      }
      return "";
    },
    []
  );

  const handleFunctionCalls = useCallback(
    async (
      functionCalls: Array<{
        arguments: string;
        callId: string;
        name: string;
      }>
    ) => {
      const outputPromise = resolveFunctionCalls(functionCalls);
      const preamble = getToolVoicePreamble(functionCalls);

      if (preamble) {
        pendingToolContinuationRef.current = () => {
          void outputPromise.then((outputs) => {
            sendFunctionCallOutputs(outputs);
          });
        };
        internalResponseModeRef.current = "tool_preamble";
        requestExactSpeech(preamble);
        return;
      }

      const outputs = await outputPromise;
      sendFunctionCallOutputs(outputs);
    },
    [
      getToolVoicePreamble,
      requestExactSpeech,
      resolveFunctionCalls,
      sendFunctionCallOutputs,
    ]
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;
        const msgType = msg.type as string;

        switch (msgType) {
          case "session.created":
          case "session.updated":
            break;

          case "response.created":
            responseInProgressRef.current = true;
            responseCancelRequestedRef.current = false;
            suppressCurrentResponseOutputRef.current = false;
            suppressCancelledResponseDoneRef.current = false;
            break;

          case "conversation.item.input_audio_transcription.delta": {
            const delta = typeof msg.delta === "string" ? msg.delta : "";
            logCareerVoiceDebug("transcription.delta", { delta });
            setPartialTranscript((prev) => prev + delta);
            break;
          }

          case "conversation.item.input_audio_transcription.completed": {
            const transcript =
              typeof msg.transcript === "string" ? msg.transcript : "";
            logCareerVoiceDebug("transcription.completed", { transcript });
            setPartialTranscript("");
            onTranscriptRef.current(transcript);
            break;
          }

          case "response.audio.delta": {
            if (suppressCurrentResponseOutputRef.current) break;
            if (useElevenLabsTtsRef.current) break;
            if (
              !hasAudioInResponseRef.current &&
              speechStoppedAtRef.current > 0
            ) {
              const ttft = performance.now() - speechStoppedAtRef.current;
              console.log(`[TTFT] Realtime native audio: ${ttft.toFixed(0)}ms`);
              speechStoppedAtRef.current = 0;
            }
            hasAudioInResponseRef.current = true;
            setIsAssistantSpeaking(true);
            const audioData = typeof msg.delta === "string" ? msg.delta : "";
            if (audioData) {
              scheduleAudioChunk(audioData, playbackCtxRef, nextPlayTimeRef);
            }
            break;
          }

          case "response.audio_transcript.delta": {
            if (suppressCurrentResponseOutputRef.current) break;
            const delta = typeof msg.delta === "string" ? msg.delta : "";
            responseTextRef.current += delta;
            onAssistantDeltaRef.current(delta);
            break;
          }

          case "response.text.delta": {
            if (suppressCurrentResponseOutputRef.current) break;
            const delta = typeof msg.delta === "string" ? msg.delta : "";
            // Text-only sessions feed ElevenLabs. Native Realtime audio uses
            // response.audio_transcript.delta for display text.
            if (useElevenLabsTtsRef.current) {
              responseTextRef.current += delta;
              onAssistantDeltaRef.current(delta);
            }
            break;
          }

          case "response.text.done":
            break;

          case "response.done": {
            responseInProgressRef.current = false;
            responseCancelRequestedRef.current = false;
            if (useElevenLabsTtsRef.current && speechStoppedAtRef.current > 0) {
              const ttft = performance.now() - speechStoppedAtRef.current;
              console.log(
                `[TTFT] Realtime text response: ${ttft.toFixed(0)}ms (ElevenLabs fetch starts now)`
              );
              speechStoppedAtRef.current = 0;
            }
            const fullText = responseTextRef.current;
            responseTextRef.current = "";
            hasAudioInResponseRef.current = false;

            const response = msg.response as
              | Record<string, unknown>
              | undefined;
            const status =
              typeof response?.status === "string"
                ? response.status
                : "completed";

            if (
              status === "cancelled" &&
              suppressCancelledResponseDoneRef.current
            ) {
              suppressCurrentResponseOutputRef.current = false;
              suppressCancelledResponseDoneRef.current = false;
              stopNativePlayback();
              break;
            }

            const outputItems = Array.isArray(response?.output)
              ? (response.output as Array<Record<string, unknown>>)
              : [];
            const functionCalls = outputItems
              .filter((item) => item.type === "function_call")
              .map((item) => ({
                callId: String(item.call_id ?? ""),
                name: String(item.name ?? ""),
                arguments: String(item.arguments ?? "{}"),
              }))
              .filter((item) => item.callId && item.name);

            if (functionCalls.length > 0) {
              setIsAssistantSpeaking(false);
              void handleFunctionCalls(functionCalls);
              break;
            }

            if (internalResponseModeRef.current === "tool_preamble") {
              internalResponseModeRef.current = null;

              const continueWithToolOutputs =
                pendingToolContinuationRef.current;
              pendingToolContinuationRef.current = null;

              const finishPreamble = () => {
                setIsAssistantSpeaking(false);
                continueWithToolOutputs?.();
              };

              if (status === "cancelled") {
                finishPreamble();
              } else {
                runAfterCurrentPlayback(finishPreamble);
              }
              break;
            }

            if (status === "cancelled") {
              // User interrupted — stop audio immediately
              stopNativePlayback();
            } else {
              // Natural end — wait for buffered audio to finish playing
              const ctx = playbackCtxRef.current;
              if (ctx && ctx.state !== "closed") {
                const remaining = Math.max(
                  0,
                  nextPlayTimeRef.current - ctx.currentTime
                );
                if (remaining > 0.05) {
                  setTimeout(
                    () => setIsAssistantSpeaking(false),
                    remaining * 1000
                  );
                } else {
                  setIsAssistantSpeaking(false);
                }
              } else {
                setIsAssistantSpeaking(false);
              }
            }

            onAssistantDoneRef.current(fullText);
            break;
          }

          case "input_audio_buffer.speech_started": {
            logCareerVoiceDebug("speech.started");
            if (interruptTimerRef.current) {
              clearTimeout(interruptTimerRef.current);
              interruptTimerRef.current = null;
            }

            const shouldInterrupt =
              responseInProgressRef.current ||
              hasAudioInResponseRef.current ||
              responseTextRef.current.trim().length > 0 ||
              getRemainingPlaybackMs() > 50;

            if (shouldInterrupt) {
              cancelActiveResponse();
            }
            onUserSpeechStartedRef.current?.();
            break;
          }

          case "input_audio_buffer.speech_stopped": {
            speechStoppedAtRef.current = performance.now();
            logCareerVoiceDebug("speech.stopped");
            if (interruptTimerRef.current) {
              clearTimeout(interruptTimerRef.current);
              interruptTimerRef.current = null;
            }
            break;
          }

          case "error": {
            const error = msg.error as Record<string, unknown> | undefined;
            const errorCode =
              typeof error?.code === "string" ? error.code : "";
            const errorMessage =
              typeof error?.message === "string"
                ? error.message
                : "Realtime session error";
            if (errorCode === "response_cancel_not_active") {
              responseCancelRequestedRef.current = false;
              break;
            }
            console.error("[RealtimeSession] Server error:", error);
            onErrorRef.current(errorMessage);
            break;
          }

          default:
            break;
        }
      } catch (e) {
        console.error("[RealtimeSession] Failed to parse message:", e);
      }
    },
    [
      cancelActiveResponse,
      getRemainingPlaybackMs,
      handleFunctionCalls,
      runAfterCurrentPlayback,
      stopNativePlayback,
    ]
  );

  const startAudioCapture = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    if (
      typeof navigator === "undefined" ||
      typeof navigator.mediaDevices?.getUserMedia !== "function"
    ) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      mediaStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Use ScriptProcessorNode (widely supported) to capture PCM data
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const base64 = pcm16ToBase64(int16);
        sendEvent({ type: "input_audio_buffer.append", audio: base64 });
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      workletNodeRef.current = processor;

      return true;
    } catch (err) {
      console.error("[RealtimeSession] Audio capture failed:", err);
      cleanupAudio();
      return false;
    }
  }, [cleanupAudio, sendEvent]);

  const disconnect = useCallback(() => {
    connectAttemptIdRef.current += 1;
    connectPromiseRef.current = null;
    clearRefreshTimer();
    cleanupAudio();
    // Clean up native audio playback context
    if (interruptTimerRef.current) {
      clearTimeout(interruptTimerRef.current);
      interruptTimerRef.current = null;
    }
    const playbackCtx = playbackCtxRef.current;
    playbackCtxRef.current = null;
    nextPlayTimeRef.current = 0;
    hasAudioInResponseRef.current = false;
    void playbackCtx?.close().catch(() => undefined);
    const socket = socketRef.current;
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }
      socketRef.current = null;
    }
    tokenInfoRef.current = null;
    responseTextRef.current = "";
    internalResponseModeRef.current = null;
    pendingToolContinuationRef.current = null;
    responseInProgressRef.current = false;
    responseCancelRequestedRef.current = false;
    suppressCurrentResponseOutputRef.current = false;
    suppressCancelledResponseDoneRef.current = false;
    setIsConnected(false);
    setIsConnecting(false);
    setConnectionStatus("disconnected");
  }, [cleanupAudio, clearRefreshTimer]);

  const scheduleTokenRefresh = useCallback(() => {
    clearRefreshTimer();
    const tokenInfo = tokenInfoRef.current;
    if (!tokenInfo) return;

    const msUntilRefresh = tokenInfo.expiresAt - Date.now() - REFRESH_BUFFER_MS;
    if (msUntilRefresh <= 0) {
      // Already expired or about to, refresh now
      void (async () => {
        const newToken = await fetchToken();
        if (newToken) {
          tokenInfoRef.current = newToken;
          // Reconnect with new token
          disconnect();
          // The parent will trigger reconnect via connect()
        }
      })();
      return;
    }

    refreshTimerRef.current = setTimeout(async () => {
      const newToken = await fetchToken();
      if (!newToken) {
        onErrorRef.current("Failed to refresh realtime token");
        return;
      }
      tokenInfoRef.current = newToken;
      // The Realtime API doesn't support token rotation on an open socket
      // Disconnect and auto-reconnect with the new token
      const wasConnected = socketRef.current?.readyState === WebSocket.OPEN;
      if (wasConnected) {
        disconnect();
        // Auto-reconnect with fresh token
        void connectRef.current?.().then((ok) => {
          if (!ok) {
            onErrorRef.current("Failed to reconnect after token refresh");
            onConnectionChangeRef.current(false);
          }
        });
      }
    }, msUntilRefresh);
  }, [clearRefreshTimer, disconnect, fetchToken]);

  const connect = useCallback((): Promise<boolean> => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return Promise.resolve(true);
    }
    if (connectPromiseRef.current) return connectPromiseRef.current;

    setIsConnecting(true);
    const attemptId = connectAttemptIdRef.current + 1;
    connectAttemptIdRef.current = attemptId;

    const clearPendingConnect = () => {
      if (connectAttemptIdRef.current !== attemptId) return;
      connectPromiseRef.current = null;
      setIsConnecting(false);
    };

    const connectPromise = (async (): Promise<boolean> => {
      const tokenInfo = await fetchToken();
      if (!tokenInfo) {
        clearPendingConnect();
        return false;
      }
      if (connectAttemptIdRef.current !== attemptId) {
        clearPendingConnect();
        return false;
      }
      tokenInfoRef.current = tokenInfo;

      return new Promise<boolean>((resolve) => {
        const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5`;
        const protocols = [
          "realtime",
          `openai-insecure-api-key.${tokenInfo.token}`,
          "openai-beta.realtime-v1",
        ];

        const socket = new WebSocket(wsUrl, protocols);
        socketRef.current = socket;
        let opened = false;
        let settled = false;
        let timeout: ReturnType<typeof setTimeout>;

        const settle = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (connectAttemptIdRef.current === attemptId) {
            connectPromiseRef.current = null;
            setIsConnecting(false);
          }
          resolve(ok);
        };

        timeout = setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            socket.onclose = null;
            socket.onerror = null;
            socket.onmessage = null;
            socket.close();
            if (socketRef.current === socket) socketRef.current = null;
            cleanupAudio();
            setIsConnected(false);
            setConnectionStatus("disconnected");
            onConnectionChangeRef.current(false);
            settle(false);
          }
        }, 10_000);

        socket.onopen = async () => {
          if (connectAttemptIdRef.current !== attemptId) {
            socket.close();
            settle(false);
            return;
          }
          opened = true;

          // Enable server-side VAD for automatic turn detection
          socket.send(
            JSON.stringify({
              type: "session.update",
              session: {
                turn_detection: {
                  type: "semantic_vad",
                  create_response: true,
                  interrupt_response: true,
                  eagerness: "auto",
                },
                input_audio_transcription: {
                  model: "whisper-1",
                  prompt:
                    "대화는 주로 한국어지만 기술명은 영어 원문으로 적는다. 예: Diffusion, Transformer, ML, Harper, etc",
                },
              },
            })
          );

          // Start audio capture
          const audioOk = await startAudioCapture();
          if (!audioOk) {
            console.warn("[RealtimeSession] Audio capture failed");
            socket.onclose = null;
            socket.onerror = null;
            socket.onmessage = null;
            socket.close();
            if (socketRef.current === socket) socketRef.current = null;
            cleanupAudio();
            setIsConnected(false);
            setConnectionStatus("disconnected");
            onConnectionChangeRef.current(false);
            settle(false);
            return;
          }

          if (connectAttemptIdRef.current !== attemptId) {
            socket.close();
            settle(false);
            return;
          }

          setIsConnected(true);
          setConnectionStatus("connected");
          onConnectionChangeRef.current(true);
          scheduleTokenRefresh();
          settle(true);
        };

        socket.onmessage = handleMessage;

        socket.onerror = () => {
          console.error("[RealtimeSession] WebSocket error");
          if (!opened) {
            socket.close();
          }
        };

        socket.onclose = () => {
          if (connectAttemptIdRef.current !== attemptId) {
            settle(false);
            return;
          }
          setIsConnected(false);
          cleanupAudio();
          clearRefreshTimer();
          onConnectionChangeRef.current(false);
          setConnectionStatus("disconnected");

          if (opened) {
            onErrorRef.current(
              "Realtime connection lost. Falling back to text mode."
            );
          }
          settle(false);
        };
      });
    })().catch((err) => {
      console.error("[RealtimeSession] Connect error:", err);
      clearPendingConnect();
      return false;
    });

    connectPromiseRef.current = connectPromise;
    return connectPromise;
  }, [
    cleanupAudio,
    clearRefreshTimer,
    fetchToken,
    handleMessage,
    scheduleTokenRefresh,
    startAudioCapture,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const sendAudio = useCallback(
    (base64PCM16: string) => {
      sendEvent({ type: "input_audio_buffer.append", audio: base64PCM16 });
    },
    [sendEvent]
  );

  const commitAudio = useCallback(() => {
    sendEvent({ type: "input_audio_buffer.commit" });
    sendEvent({ type: "response.create" });
  }, [sendEvent]);

  const sendTextMessage = useCallback(
    (text: string) => {
      responseTextRef.current = "";
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      });
      sendEvent({ type: "response.create" });
    },
    [sendEvent]
  );

  const triggerResponse = useCallback(() => {
    sendEvent({ type: "response.create" });
  }, [sendEvent]);

  const cancelResponse = useCallback(() => {
    cancelActiveResponse();
  }, [cancelActiveResponse]);

  const primePlayback = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      if (
        !playbackCtxRef.current ||
        playbackCtxRef.current.state === "closed"
      ) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        playbackCtxRef.current = new AudioCtx({ sampleRate: 24000 });
        nextPlayTimeRef.current = playbackCtxRef.current.currentTime;
      }

      void playbackCtxRef.current.resume().catch((error) => {
        console.warn("[RealtimeSession] Audio playback unlock failed:", error);
      });
    } catch (error) {
      console.warn("[RealtimeSession] Audio playback prime failed:", error);
    }
  }, []);

  /** Update the Realtime session instructions (e.g., on interview step transition) */
  const updateSessionInstructions = useCallback(
    (instructions: string) => {
      sendEvent({
        type: "session.update",
        session: { instructions },
      });
    },
    [sendEvent]
  );

  /** Request the model to speak the given text via native Realtime audio */
  const generateSpeech = useCallback(
    (text: string) => {
      requestExactSpeech(text);
    },
    [requestExactSpeech]
  );

  /** Expose the MediaStream for voice level monitoring */
  const getMediaStream = useCallback((): MediaStream | null => {
    return mediaStreamRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    isAssistantSpeaking,
    partialTranscript,
    connectionStatus,
    connect,
    disconnect,
    sendAudio,
    commitAudio,
    sendTextMessage,
    triggerResponse,
    cancelResponse,
    primePlayback,
    generateSpeech,
    updateSessionInstructions,
    getMediaStream,
    sendEvent,
  };
}
