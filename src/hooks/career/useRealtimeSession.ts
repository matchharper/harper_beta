"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FetchWithAuth } from "./useCareerApi";

type UseRealtimeSessionArgs = {
  conversationId: string | null;
  enabled: boolean;
  fetchWithAuth: FetchWithAuth;
  onTranscript: (text: string) => void;
  onAssistantDelta: (delta: string) => void;
  onAssistantDone: (fullText: string) => void;
  onError: (error: string) => void;
  onConnectionChange: (connected: boolean) => void;
};

type TokenInfo = {
  token: string;
  expiresAt: number;
  sessionId: string;
};

const REFRESH_BUFFER_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS = [1000, 2000, 4000];

function pcm16ToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function useRealtimeSession(args: UseRealtimeSessionArgs) {
  const {
    conversationId,
    enabled,
    fetchWithAuth,
    onTranscript,
    onAssistantDelta,
    onAssistantDone,
    onError,
    onConnectionChange,
  } = args;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
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
  const reconnectAttemptRef = useRef(0);

  // Stable callback refs
  const onTranscriptRef = useRef(onTranscript);
  const onAssistantDeltaRef = useRef(onAssistantDelta);
  const onAssistantDoneRef = useRef(onAssistantDone);
  const onErrorRef = useRef(onError);
  const onConnectionChangeRef = useRef(onConnectionChange);

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
        body: JSON.stringify({ conversationId }),
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
      };
    } catch (err) {
      console.error("[RealtimeSession] Token fetch error:", err);
      return null;
    }
  }, [conversationId, fetchWithAuth]);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(event));
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as Record<string, unknown>;
      const msgType = msg.type as string;

      switch (msgType) {
        case "session.created":
        case "session.updated":
          break;

        case "conversation.item.input_audio_transcription.delta": {
          const delta = typeof msg.delta === "string" ? msg.delta : "";
          console.log("[RealtimeSession] transcription.delta:", JSON.stringify(delta), "at:", new Date().toISOString());
          setPartialTranscript((prev) => prev + delta);
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          const transcript = typeof msg.transcript === "string" ? msg.transcript : "";
          setPartialTranscript("");
          onTranscriptRef.current(transcript);
          break;
        }

        case "response.text.delta": {
          const delta = typeof msg.delta === "string" ? msg.delta : "";
          responseTextRef.current += delta;
          onAssistantDeltaRef.current(delta);
          break;
        }

        case "response.text.done":
          // response.text.done has the full text; use it as source of truth
          break;

        case "response.done": {
          const fullText = responseTextRef.current;
          responseTextRef.current = "";
          onAssistantDoneRef.current(fullText);
          break;
        }

        case "error": {
          const error = msg.error as Record<string, unknown> | undefined;
          const errorMessage = typeof error?.message === "string" ? error.message : "Realtime session error";
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
  }, []);

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
    clearRefreshTimer();
    cleanupAudio();
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
    reconnectAttemptRef.current = 0;
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
        void connect().then((ok) => {
          if (!ok) {
            onErrorRef.current("Failed to reconnect after token refresh");
            onConnectionChangeRef.current(false);
          }
        });
      }
    }, msUntilRefresh);
  }, [clearRefreshTimer, disconnect, fetchToken]);

  const connect = useCallback(async (): Promise<boolean> => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return true;
    if (isConnecting) return false;

    setIsConnecting(true);
    reconnectAttemptRef.current = 0;

    try {
      const tokenInfo = await fetchToken();
      if (!tokenInfo) {
        setIsConnecting(false);
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

        const timeout = setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            socket.close();
            setIsConnecting(false);
            resolve(false);
          }
        }, 10_000);

        socket.onopen = async () => {
          clearTimeout(timeout);

          // Enable server-side VAD for automatic turn detection
          socket.send(
            JSON.stringify({
              type: "session.update",
              session: {
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 800,
                },
                input_audio_transcription: {
                  model: "whisper-1",
                },
              },
            })
          );

          // Start audio capture
          const audioOk = await startAudioCapture();
          if (!audioOk) {
            console.warn(
              "[RealtimeSession] Audio capture failed, text-only mode"
            );
          }

          setIsConnected(true);
          setIsConnecting(false);
          setConnectionStatus("connected");
          reconnectAttemptRef.current = 0;
          onConnectionChangeRef.current(true);
          scheduleTokenRefresh();
          resolve(true);
        };

        socket.onmessage = handleMessage;

        socket.onerror = () => {
          clearTimeout(timeout);
          console.error("[RealtimeSession] WebSocket error");
        };

        socket.onclose = () => {
          clearTimeout(timeout);
          setIsConnected(false);
          setIsConnecting(false);
          cleanupAudio();
          clearRefreshTimer();
          onConnectionChangeRef.current(false);

          // Attempt reconnect with exponential backoff
          const attempt = reconnectAttemptRef.current;
          if (attempt < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptRef.current = attempt + 1;
            setConnectionStatus("reconnecting");
            const delay = RECONNECT_DELAYS[attempt] ?? 4000;
            console.log(
              `[RealtimeSession] Reconnect attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`
            );
            setTimeout(() => {
              void connect().then((ok) => {
                if (!ok && reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
                  setConnectionStatus("disconnected");
                  onErrorRef.current(
                    "Realtime connection lost. Falling back to text mode."
                  );
                }
              });
            }, delay);
          } else {
            setConnectionStatus("disconnected");
            onErrorRef.current(
              "Realtime connection lost. Falling back to text mode."
            );
          }
        };
      });
    } catch (err) {
      console.error("[RealtimeSession] Connect error:", err);
      setIsConnecting(false);
      return false;
    }
  }, [
    cleanupAudio,
    clearRefreshTimer,
    fetchToken,
    handleMessage,
    isConnecting,
    scheduleTokenRefresh,
    startAudioCapture,
  ]);

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
    sendEvent({ type: "response.cancel" });
    responseTextRef.current = "";
  }, [sendEvent]);

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
    partialTranscript,
    connectionStatus,
    connect,
    disconnect,
    sendAudio,
    commitAudio,
    sendTextMessage,
    triggerResponse,
    cancelResponse,
    getMediaStream,
  };
}
