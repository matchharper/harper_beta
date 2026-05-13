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

function pcm16ToBase64(input: Int16Array | ArrayBuffer | string): string {
  if (typeof input === "string") return input;

  const bytes =
    input instanceof Int16Array
      ? new Uint8Array(input.buffer)
      : new Uint8Array(input);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const tokenInfoRef = useRef<TokenInfo | null>(null);
  const responseTextRef = useRef("");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const connectRef = useRef<(() => Promise<boolean>) | null>(null);
  const connectPromiseRef = useRef<Promise<boolean> | null>(null);
  const connectAttemptIdRef = useRef(0);

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

  const ensureRemoteAudioElement = useCallback(() => {
    if (typeof document === "undefined") return null;

    if (!remoteAudioRef.current) {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      remoteAudioRef.current = audio;
    }

    return remoteAudioRef.current;
  }, []);

  const cleanupMedia = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    const remoteAudio = remoteAudioRef.current;
    if (remoteAudio) {
      remoteAudio.pause();
      remoteAudio.srcObject = null;
    }
    remoteAudioRef.current = null;
    remoteStreamRef.current = null;
  }, []);

  const cleanupTransport = useCallback(() => {
    const dataChannel = dataChannelRef.current;
    dataChannelRef.current = null;
    if (dataChannel) {
      dataChannel.onopen = null;
      dataChannel.onmessage = null;
      dataChannel.onerror = null;
      dataChannel.onclose = null;
      if (
        dataChannel.readyState === "connecting" ||
        dataChannel.readyState === "open"
      ) {
        dataChannel.close();
      }
    }

    const peerConnection = peerConnectionRef.current;
    peerConnectionRef.current = null;
    if (peerConnection) {
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    }

    cleanupMedia();
  }, [cleanupMedia]);

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
    const dataChannel = dataChannelRef.current;
    if (!dataChannel || dataChannel.readyState !== "open") return;
    dataChannel.send(JSON.stringify(event));
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

  const requestSpeechFromInstructions = useCallback(
    (instructions: string) => {
      const normalizedInstructions = instructions.trim();
      if (!normalizedInstructions) return;

      responseTextRef.current = "";
      sendEvent({
        type: "response.create",
        response: {
          instructions: normalizedInstructions,
        },
      });
    },
    [sendEvent]
  );

  const getRemainingPlaybackMs = useCallback(() => {
    return 0;
  }, []);

  const stopNativePlayback = useCallback(() => {
    hasAudioInResponseRef.current = false;
    setIsAssistantSpeaking(false);
  }, []);

  const cancelActiveResponse = useCallback(() => {
    suppressCurrentResponseOutputRef.current = true;
    suppressCancelledResponseDoneRef.current = true;

    if (responseInProgressRef.current && !responseCancelRequestedRef.current) {
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
              channel: "voice",
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
            break;
          }

          case "response.audio_transcript.delta": {
            if (suppressCurrentResponseOutputRef.current) break;
            const delta = typeof msg.delta === "string" ? msg.delta : "";
            if (!useElevenLabsTtsRef.current) {
              hasAudioInResponseRef.current = true;
              setIsAssistantSpeaking(true);
            }
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
              stopNativePlayback();
            } else {
              setIsAssistantSpeaking(false);
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
            const errorCode = typeof error?.code === "string" ? error.code : "";
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

  const startAudioCapture = useCallback(
    async (peerConnection: RTCPeerConnection): Promise<boolean> => {
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
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        mediaStreamRef.current = stream;
        stream
          .getAudioTracks()
          .forEach((track) => peerConnection.addTrack(track, stream));

        return true;
      } catch (err) {
        console.error("[RealtimeSession] Audio capture failed:", err);
        cleanupMedia();
        return false;
      }
    },
    [cleanupMedia]
  );

  const disconnect = useCallback(() => {
    connectAttemptIdRef.current += 1;
    connectPromiseRef.current = null;
    if (interruptTimerRef.current) {
      clearTimeout(interruptTimerRef.current);
      interruptTimerRef.current = null;
    }
    hasAudioInResponseRef.current = false;
    cleanupTransport();
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
  }, [cleanupTransport]);

  const connect = useCallback((): Promise<boolean> => {
    if (dataChannelRef.current?.readyState === "open") {
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
      try {
        if (typeof RTCPeerConnection === "undefined") {
          return false;
        }

        const tokenInfo = await fetchToken();
        if (!tokenInfo?.token) {
          return false;
        }
        if (connectAttemptIdRef.current !== attemptId) {
          return false;
        }
        tokenInfoRef.current = tokenInfo;

        const peerConnection = new RTCPeerConnection();
        peerConnectionRef.current = peerConnection;

        peerConnection.ontrack = (event) => {
          const audio = ensureRemoteAudioElement();
          if (!audio) return;

          const stream = event.streams[0] ?? new MediaStream([event.track]);
          remoteStreamRef.current = stream;
          audio.srcObject = stream;
          void audio.play().catch((error) => {
            console.warn("[RealtimeSession] Remote audio play failed:", error);
          });
        };

        peerConnection.onconnectionstatechange = () => {
          const state = peerConnection.connectionState;
          logCareerVoiceDebug("webrtc.connection_state", { state });
          if (
            connectAttemptIdRef.current !== attemptId ||
            state === "connected" ||
            state === "connecting" ||
            state === "new"
          ) {
            return;
          }

          if (state === "failed" || state === "closed") {
            setIsConnected(false);
            setConnectionStatus("disconnected");
            onConnectionChangeRef.current(false);
          }
        };

        const audioOk = await startAudioCapture(peerConnection);
        if (!audioOk) {
          cleanupTransport();
          setIsConnected(false);
          setConnectionStatus("disconnected");
          onConnectionChangeRef.current(false);
          return false;
        }

        if (connectAttemptIdRef.current !== attemptId) {
          cleanupTransport();
          return false;
        }

        const dataChannel = peerConnection.createDataChannel("oai-events");
        dataChannelRef.current = dataChannel;
        dataChannel.onmessage = handleMessage;
        dataChannel.onerror = () => {
          console.error("[RealtimeSession] WebRTC data channel error");
        };

        const dataChannelOpen = new Promise<boolean>((resolve) => {
          let opened = false;
          let settled = false;
          let timeout: ReturnType<typeof setTimeout>;

          const settle = (ok: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(ok);
          };

          timeout = setTimeout(() => {
            settle(false);
          }, 10_000);

          dataChannel.onopen = () => {
            opened = true;
            settle(true);
          };

          dataChannel.onclose = () => {
            if (!opened) {
              settle(false);
              return;
            }
            if (connectAttemptIdRef.current !== attemptId) return;
            setIsConnected(false);
            setConnectionStatus("disconnected");
            cleanupTransport();
            onConnectionChangeRef.current(false);
            onErrorRef.current(
              "Realtime connection lost. Falling back to text mode."
            );
          };
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const sdp = peerConnection.localDescription?.sdp ?? offer.sdp;
        if (!sdp) {
          cleanupTransport();
          return false;
        }

        const sdpResponse = await fetch(
          "https://api.openai.com/v1/realtime/calls",
          {
            method: "POST",
            body: sdp,
            headers: {
              Authorization: `Bearer ${tokenInfo.token}`,
              "Content-Type": "application/sdp",
            },
          }
        );

        if (!sdpResponse.ok) {
          const errText = await sdpResponse.text().catch(() => "");
          console.error("[RealtimeSession] SDP exchange failed:", errText);
          cleanupTransport();
          return false;
        }

        await peerConnection.setRemoteDescription({
          type: "answer",
          sdp: await sdpResponse.text(),
        });

        const opened = await dataChannelOpen;
        if (!opened || connectAttemptIdRef.current !== attemptId) {
          cleanupTransport();
          return false;
        }

        setIsConnected(true);
        setConnectionStatus("connected");
        onConnectionChangeRef.current(true);
        return true;
      } catch (err) {
        console.error("[RealtimeSession] Connect error:", err);
        cleanupTransport();
        setIsConnected(false);
        setConnectionStatus("disconnected");
        onConnectionChangeRef.current(false);
        return false;
      } finally {
        clearPendingConnect();
      }
    })();

    connectPromiseRef.current = connectPromise;
    return connectPromise;
  }, [
    cleanupTransport,
    ensureRemoteAudioElement,
    fetchToken,
    handleMessage,
    startAudioCapture,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const sendAudio = useCallback(
    (pcm16: Int16Array | ArrayBuffer | string) => {
      sendEvent({
        type: "input_audio_buffer.append",
        audio: pcm16ToBase64(pcm16),
      });
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
      const audio = ensureRemoteAudioElement();
      if (!audio) return;
      void audio.play().catch((error) => {
        console.warn("[RealtimeSession] Audio playback unlock failed:", error);
      });
    } catch (error) {
      console.warn("[RealtimeSession] Audio playback prime failed:", error);
    }
  }, [ensureRemoteAudioElement]);

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

  const generateSpeechFromInstructions = useCallback(
    (instructions: string) => {
      requestSpeechFromInstructions(instructions);
    },
    [requestSpeechFromInstructions]
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
    generateSpeechFromInstructions,
    updateSessionInstructions,
    getMediaStream,
    sendEvent,
  };
}
