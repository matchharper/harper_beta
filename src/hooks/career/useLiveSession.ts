"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { useMessages } from "@/i18n/useMessage";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";
import type {
  RealtimeConnectFailure,
  RealtimeConnectOptions,
  UseRealtimeSessionArgs,
} from "./useRealtimeSession";

type LiveFunctionCall = {
  arguments: string;
  callId: string;
  name: string;
};

type PendingInstructionAction = {
  commentary: string;
  timer: ReturnType<typeof setTimeout>;
};

const LIVE_END_CALL_TOOL_NAME = "end_call";
const MAX_LIVE_APPEND_CHARS = 400;
const ASSISTANT_TRANSCRIPT_SETTLE_MS = 1_400;
const MAX_ESTIMATED_PLAYBACK_MS = 45_000;
const PLAYBACK_GRACE_MS = 900;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getErrorText(payload: unknown, fallback: string) {
  if (!isRecord(payload)) return fallback;
  const error = payload.error;
  return typeof error === "string" && error.trim() ? error.trim() : fallback;
}

function estimateSpeechPlaybackMs(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return PLAYBACK_GRACE_MS;

  const koreanSyllables = normalized.match(/[\uac00-\ud7a3]/g)?.length ?? 0;
  const latinWords =
    normalized.match(/[A-Za-z0-9][A-Za-z0-9'./+-]*/g)?.length ?? 0;
  const pauses =
    normalized.match(/[.!?。！？…]|[.]{3}|[,，、;:]/g)?.length ?? 0;
  return Math.min(
    MAX_ESTIMATED_PLAYBACK_MS,
    Math.max(
      PLAYBACK_GRACE_MS,
      700 + koreanSyllables * 155 + latinWords * 390 + pauses * 220
    )
  );
}

function getNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function waitForIceGatheringComplete(
  peerConnection: RTCPeerConnection,
  signal: AbortSignal
) {
  if (signal.aborted) {
    return Promise.reject(new Error("GPT-Live connection was cancelled."));
  }
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      peerConnection.removeEventListener("icegatheringstatechange", onState);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error("GPT-Live connection was cancelled."));
    };
    const onState = () => {
      if (peerConnection.iceGatheringState !== "complete") return;
      cleanup();
      resolve();
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while gathering GPT-Live ICE candidates."));
    }, 10_000);

    signal.addEventListener("abort", onAbort, { once: true });
    peerConnection.addEventListener("icegatheringstatechange", onState);
    onState();
  });
}

function getOnlyActiveResponseId(
  responses: Map<string, Map<string, LiveFunctionCall>>
) {
  if (responses.size !== 1) return "";
  const responseId = responses.keys().next().value;
  return typeof responseId === "string" ? responseId : "";
}

export function useLiveSession(args: UseRealtimeSessionArgs) {
  const tCareer = useCareerMessageFormatter();
  const { locale } = useMessages();
  const {
    conversationId,
    fetchWithAuth,
    onAssistantDelta,
    onAssistantDone,
    onConnectionChange,
    onEndCallTool,
    onError,
    onTranscript,
    onUserSpeechStarted,
    onUserSpeechStopped,
  } = args;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [isToolExecuting, setIsToolExecuting] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "reconnecting" | "disconnected"
  >("disconnected");

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const connectPromiseRef = useRef<Promise<boolean> | null>(null);
  const connectAttemptIdRef = useRef(0);
  const pendingConnectAbortControllerRef = useRef<AbortController | null>(null);
  const lastConnectFailureRef = useRef<RealtimeConnectFailure | null>(null);
  const sessionStartedResolverRef = useRef<((started: boolean) => void) | null>(
    null
  );
  const userTranscriptRef = useRef("");
  const userSpeechActiveRef = useRef(false);
  const assistantTranscriptRef = useRef("");
  const assistantTranscriptTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const assistantPlaybackStartedAtRef = useRef<number | null>(null);
  const playbackDrainUntilRef = useRef(0);
  const playbackTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(
    new Set()
  );
  const responseFunctionCallsRef = useRef<
    Map<string, Map<string, LiveFunctionCall>>
  >(new Map());
  const delegationResponseIdsRef = useRef<Map<string, string>>(new Map());
  const executedFunctionCallIdsRef = useRef<Set<string>>(new Set());
  const pendingInstructionActionsRef = useRef<
    Map<string, PendingInstructionAction>
  >(new Map());
  const pendingEndCallRef = useRef(false);
  const pendingEndCallFallbackTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const latestAudioSecondsRef = useRef<number | null>(null);
  const audioUsageLoggedRef = useRef(false);
  const sessionClosedRef = useRef(false);

  const onAssistantDeltaRef = useRef(onAssistantDelta);
  const onAssistantDoneRef = useRef(onAssistantDone);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onEndCallToolRef = useRef(onEndCallTool);
  const onErrorRef = useRef(onError);
  const onTranscriptRef = useRef(onTranscript);
  const onUserSpeechStartedRef = useRef(onUserSpeechStarted);
  const onUserSpeechStoppedRef = useRef(onUserSpeechStopped);

  useEffect(() => {
    onAssistantDeltaRef.current = onAssistantDelta;
  }, [onAssistantDelta]);
  useEffect(() => {
    onAssistantDoneRef.current = onAssistantDone;
  }, [onAssistantDone]);
  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);
  useEffect(() => {
    onEndCallToolRef.current = onEndCallTool;
  }, [onEndCallTool]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onUserSpeechStartedRef.current = onUserSpeechStarted;
  }, [onUserSpeechStarted]);
  useEffect(() => {
    onUserSpeechStoppedRef.current = onUserSpeechStopped;
  }, [onUserSpeechStopped]);

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

  const clearPlaybackTimers = useCallback(() => {
    playbackTimersRef.current.forEach((timer) => clearTimeout(timer));
    playbackTimersRef.current.clear();
  }, []);

  const runAfterCurrentPlayback = useCallback((callback: () => void) => {
    const remainingMs = Math.min(
      MAX_ESTIMATED_PLAYBACK_MS,
      Math.max(0, playbackDrainUntilRef.current - getNow())
    );
    if (remainingMs <= 50) {
      callback();
      return;
    }
    const timer = setTimeout(() => {
      playbackTimersRef.current.delete(timer);
      callback();
    }, remainingMs);
    playbackTimersRef.current.add(timer);
  }, []);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const dataChannel = dataChannelRef.current;
    if (!dataChannel || dataChannel.readyState !== "open") return;
    dataChannel.send(JSON.stringify(event));
  }, []);

  const scheduleUsageLog = useCallback(
    (payload: Record<string, unknown>) => {
      if (!conversationId) return;
      void fetchWithAuth("/api/live/usage", {
        method: "POST",
        keepalive: true,
        body: JSON.stringify({ conversationId, ...payload }),
      }).catch((error) => {
        console.warn("[LiveSession] Usage log failed:", error);
      });
    },
    [conversationId, fetchWithAuth]
  );

  const logAudioUsage = useCallback(
    (status: string) => {
      if (audioUsageLoggedRef.current) return;
      const audioSeconds = latestAudioSecondsRef.current;
      if (audioSeconds === null) return;
      audioUsageLoggedRef.current = true;
      scheduleUsageLog({ audioSeconds, kind: "audio", status });
    },
    [scheduleUsageLog]
  );

  const flushUserTranscript = useCallback(() => {
    const transcript = userTranscriptRef.current.trim();
    userTranscriptRef.current = "";
    setPartialTranscript("");
    if (userSpeechActiveRef.current) {
      userSpeechActiveRef.current = false;
      onUserSpeechStoppedRef.current?.();
    }
    if (transcript) onTranscriptRef.current(transcript);
  }, []);

  const finishPendingEndCall = useCallback(() => {
    if (!pendingEndCallRef.current) return;
    pendingEndCallRef.current = false;
    if (pendingEndCallFallbackTimerRef.current) {
      clearTimeout(pendingEndCallFallbackTimerRef.current);
      pendingEndCallFallbackTimerRef.current = null;
    }
    runAfterCurrentPlayback(() => onEndCallToolRef.current?.());
  }, [runAfterCurrentPlayback]);

  const flushAssistantTranscript = useCallback(
    (options: { interrupted?: boolean } = {}) => {
      if (assistantTranscriptTimerRef.current) {
        clearTimeout(assistantTranscriptTimerRef.current);
        assistantTranscriptTimerRef.current = null;
      }
      const transcript = assistantTranscriptRef.current.trim();
      assistantTranscriptRef.current = "";
      const startedAt = assistantPlaybackStartedAtRef.current;
      assistantPlaybackStartedAtRef.current = null;
      if (transcript && startedAt !== null && !options.interrupted) {
        playbackDrainUntilRef.current = Math.max(
          playbackDrainUntilRef.current,
          startedAt + estimateSpeechPlaybackMs(transcript) + PLAYBACK_GRACE_MS,
          getNow() + PLAYBACK_GRACE_MS
        );
      }
      if (options.interrupted) {
        playbackDrainUntilRef.current = 0;
        clearPlaybackTimers();
      }
      setIsAssistantSpeaking(false);
      if (transcript) onAssistantDoneRef.current(transcript);
      finishPendingEndCall();
    },
    [clearPlaybackTimers, finishPendingEndCall]
  );

  const scheduleAssistantTranscriptFlush = useCallback(() => {
    if (assistantTranscriptTimerRef.current) {
      clearTimeout(assistantTranscriptTimerRef.current);
    }
    assistantTranscriptTimerRef.current = setTimeout(() => {
      assistantTranscriptTimerRef.current = null;
      flushAssistantTranscript();
    }, ASSISTANT_TRANSCRIPT_SETTLE_MS);
  }, [flushAssistantTranscript]);

  const sendInstructionThenCommentary = useCallback(
    (instruction: string, commentary: string) => {
      const eventId = `harper_live_instruction_${crypto.randomUUID()}`;
      const dispatchCommentary = () => {
        const pending = pendingInstructionActionsRef.current.get(eventId);
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingInstructionActionsRef.current.delete(eventId);
        sendEvent({
          type: "session.commentary.append",
          content: pending.commentary,
          delegation_id: null,
        });
      };
      const timer = setTimeout(dispatchCommentary, 700);
      pendingInstructionActionsRef.current.set(eventId, { commentary, timer });
      sendEvent({
        event_id: eventId,
        type: "session.instructions.append",
        content: instruction.slice(0, MAX_LIVE_APPEND_CHARS),
        delegation_id: null,
      });
    },
    [sendEvent]
  );

  const executeFunctionCalls = useCallback(
    async (functionCalls: LiveFunctionCall[]) => {
      if (functionCalls.length === 0) {
        setIsToolExecuting(false);
        return;
      }

      setIsToolExecuting(true);
      let shouldContinueBackend = false;
      for (const functionCall of functionCalls) {
        if (executedFunctionCallIdsRef.current.has(functionCall.callId)) {
          continue;
        }
        executedFunctionCallIdsRef.current.add(functionCall.callId);

        if (functionCall.name === LIVE_END_CALL_TOOL_NAME) {
          pendingEndCallRef.current = true;
          if (pendingEndCallFallbackTimerRef.current) {
            clearTimeout(pendingEndCallFallbackTimerRef.current);
          }
          pendingEndCallFallbackTimerRef.current = setTimeout(
            finishPendingEndCall,
            12_000
          );
          continue;
        }

        shouldContinueBackend = true;
        let parsedArguments: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(functionCall.arguments || "{}");
          parsedArguments = isRecord(parsed) ? parsed : { value: parsed };
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
              arguments: parsedArguments,
              channel: "voice",
              conversationId,
              name: functionCall.name,
              toolCallId: functionCall.callId,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(
              getErrorText(payload, "Failed to execute GPT-Live tool.")
            );
          }
          output = isRecord(payload) ? (payload.output ?? {}) : {};
        } catch (error) {
          output = {
            error:
              error instanceof Error ? error.message : "Tool execution failed",
          };
        }

        sendEvent({
          type: "response.item.create",
          item: {
            type: "function_call_output",
            call_id: functionCall.callId,
            output: JSON.stringify(output),
          },
        });
      }
      setIsToolExecuting(false);
      if (shouldContinueBackend) sendEvent({ type: "response.create" });
    },
    [conversationId, fetchWithAuth, finishPendingEndCall, sendEvent]
  );

  const handleDelegatedResponseEvent = useCallback(
    (event: Record<string, unknown>, delegationId: string) => {
      const eventType = typeof event.type === "string" ? event.type : "";
      if (eventType === "response.created") {
        const response = isRecord(event.response) ? event.response : null;
        const responseId =
          typeof response?.id === "string" ? response.id.trim() : "";
        if (responseId) {
          responseFunctionCallsRef.current.set(responseId, new Map());
          if (delegationId) {
            delegationResponseIdsRef.current.set(delegationId, responseId);
          }
        }
        setIsToolExecuting(true);
        return;
      }
      if (eventType === "response.output_item.done") {
        const item = isRecord(event.item) ? event.item : null;
        if (item?.type !== "function_call") return;
        const callId =
          typeof item.call_id === "string" ? item.call_id.trim() : "";
        const name = typeof item.name === "string" ? item.name.trim() : "";
        if (!callId || !name) return;
        const responseId =
          (delegationId
            ? delegationResponseIdsRef.current.get(delegationId)
            : "") || getOnlyActiveResponseId(responseFunctionCallsRef.current);
        if (!responseId) return;
        const calls =
          responseFunctionCallsRef.current.get(responseId) ?? new Map();
        calls.set(callId, {
          arguments: typeof item.arguments === "string" ? item.arguments : "{}",
          callId,
          name,
        });
        responseFunctionCallsRef.current.set(responseId, calls);
        return;
      }
      if (
        eventType !== "response.completed" &&
        eventType !== "response.failed" &&
        eventType !== "response.incomplete"
      ) {
        return;
      }

      const response = isRecord(event.response) ? event.response : null;
      const usage =
        response && isRecord(response.usage) ? response.usage : null;
      if (usage) {
        scheduleUsageLog({
          kind: "delegation",
          responseId:
            typeof response?.id === "string" ? response.id.trim() : "",
          status: typeof response?.status === "string" ? response.status : null,
          usage,
        });
      }
      const responseId =
        (typeof response?.id === "string" ? response.id.trim() : "") ||
        (delegationId
          ? (delegationResponseIdsRef.current.get(delegationId) ?? "")
          : "") ||
        getOnlyActiveResponseId(responseFunctionCallsRef.current);
      const functionCalls = responseId
        ? Array.from(
            responseFunctionCallsRef.current.get(responseId)?.values() ?? []
          )
        : [];
      if (responseId) responseFunctionCallsRef.current.delete(responseId);
      if (delegationId) delegationResponseIdsRef.current.delete(delegationId);
      if (responseId && !delegationId) {
        for (const [
          mappedDelegationId,
          mappedResponseId,
        ] of delegationResponseIdsRef.current.entries()) {
          if (mappedResponseId === responseId) {
            delegationResponseIdsRef.current.delete(mappedDelegationId);
          }
        }
      }
      if (eventType === "response.completed") {
        void executeFunctionCalls(functionCalls);
      } else {
        setIsToolExecuting(false);
      }
    },
    [executeFunctionCalls, scheduleUsageLog]
  );

  const handleMessage = useCallback(
    (messageEvent: MessageEvent) => {
      try {
        const message = JSON.parse(String(messageEvent.data)) as Record<
          string,
          unknown
        >;
        const type = typeof message.type === "string" ? message.type : "";

        if (type === "session.started") {
          sessionStartedResolverRef.current?.(true);
          sessionStartedResolverRef.current = null;
          return;
        }
        if (type === "session.input_transcript.delta") {
          const delta = typeof message.delta === "string" ? message.delta : "";
          if (!delta) return;
          if (assistantTranscriptRef.current) {
            flushAssistantTranscript({ interrupted: true });
          }
          if (!userSpeechActiveRef.current) {
            userSpeechActiveRef.current = true;
            onUserSpeechStartedRef.current?.({
              continuesCurrentUserTurn: false,
            });
          }
          userTranscriptRef.current += delta;
          setPartialTranscript(userTranscriptRef.current);
          return;
        }
        if (type === "session.output_transcript.delta") {
          const delta = typeof message.delta === "string" ? message.delta : "";
          if (!delta) return;
          flushUserTranscript();
          if (assistantPlaybackStartedAtRef.current === null) {
            assistantPlaybackStartedAtRef.current = getNow();
          }
          assistantTranscriptRef.current += delta;
          setIsAssistantSpeaking(true);
          onAssistantDeltaRef.current(delta);
          scheduleAssistantTranscriptFlush();
          return;
        }
        if (type === "session.delegation.created") {
          // Live transcripts have no done event. Delegation is the reliable
          // boundary that says the user's current utterance is ready for work.
          flushUserTranscript();
          const delegation = isRecord(message.delegation)
            ? message.delegation
            : null;
          const delegationId =
            typeof delegation?.id === "string" ? delegation.id.trim() : "";
          const responseId =
            typeof delegation?.response_id === "string"
              ? delegation.response_id.trim()
              : "";
          if (delegationId && responseId) {
            delegationResponseIdsRef.current.set(delegationId, responseId);
            responseFunctionCallsRef.current.set(responseId, new Map());
          }
          setIsToolExecuting(true);
          return;
        }
        if (type === "response.event") {
          const nestedEvent = isRecord(message.event) ? message.event : null;
          const delegationId =
            typeof message.delegation_id === "string"
              ? message.delegation_id.trim()
              : "";
          if (nestedEvent) {
            handleDelegatedResponseEvent(nestedEvent, delegationId);
          }
          return;
        }
        if (type === "session.instructions.appended") {
          const clientEventId =
            typeof message.client_event_id === "string"
              ? message.client_event_id
              : "";
          const pending = clientEventId
            ? pendingInstructionActionsRef.current.get(clientEventId)
            : pendingInstructionActionsRef.current.values().next().value;
          if (!pending) return;
          const resolvedEventId = clientEventId
            ? clientEventId
            : pendingInstructionActionsRef.current.keys().next().value;
          if (typeof resolvedEventId !== "string") return;
          clearTimeout(pending.timer);
          pendingInstructionActionsRef.current.delete(resolvedEventId);
          sendEvent({
            type: "session.commentary.append",
            content: pending.commentary,
            delegation_id: null,
          });
          return;
        }
        if (type === "session.usage.updated") {
          const usage = isRecord(message.usage) ? message.usage : null;
          const seconds = usage?.seconds;
          if (typeof seconds === "number" && Number.isFinite(seconds)) {
            latestAudioSecondsRef.current = seconds;
          }
          return;
        }
        if (type === "session.closed") {
          sessionClosedRef.current = true;
          const usage = isRecord(message.usage) ? message.usage : null;
          const seconds = usage?.seconds;
          if (typeof seconds === "number" && Number.isFinite(seconds)) {
            latestAudioSecondsRef.current = seconds;
          }
          logAudioUsage(
            typeof message.reason === "string" ? message.reason : "closed"
          );
          return;
        }
        if (type === "error") {
          const error = isRecord(message.error) ? message.error : null;
          const errorMessage =
            typeof error?.message === "string"
              ? error.message
              : "GPT-Live session error";
          sessionStartedResolverRef.current?.(false);
          sessionStartedResolverRef.current = null;
          onErrorRef.current(errorMessage);
        }
      } catch (error) {
        console.error("[LiveSession] Failed to parse event:", error);
      }
    },
    [
      flushAssistantTranscript,
      flushUserTranscript,
      handleDelegatedResponseEvent,
      logAudioUsage,
      scheduleAssistantTranscriptFlush,
      sendEvent,
    ]
  );

  const cleanupTransport = useCallback(() => {
    sessionStartedResolverRef.current?.(false);
    sessionStartedResolverRef.current = null;
    pendingInstructionActionsRef.current.forEach(({ timer }) =>
      clearTimeout(timer)
    );
    pendingInstructionActionsRef.current.clear();
    if (assistantTranscriptTimerRef.current) {
      clearTimeout(assistantTranscriptTimerRef.current);
      assistantTranscriptTimerRef.current = null;
    }
    if (pendingEndCallFallbackTimerRef.current) {
      clearTimeout(pendingEndCallFallbackTimerRef.current);
      pendingEndCallFallbackTimerRef.current = null;
    }
    clearPlaybackTimers();

    const dataChannel = dataChannelRef.current;
    dataChannelRef.current = null;
    if (dataChannel) {
      dataChannel.onopen = null;
      dataChannel.onmessage = null;
      dataChannel.onerror = null;
      dataChannel.onclose = null;
      if (dataChannel.readyState !== "closed") dataChannel.close();
    }
    const peerConnection = peerConnectionRef.current;
    peerConnectionRef.current = null;
    if (peerConnection) {
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    remoteAudioRef.current = null;
  }, [clearPlaybackTimers]);

  const disconnect = useCallback(() => {
    const wasConnected = dataChannelRef.current?.readyState === "open";
    if (wasConnected) sendEvent({ type: "session.close" });
    flushUserTranscript();
    flushAssistantTranscript();
    logAudioUsage("client_disconnect");
    connectAttemptIdRef.current += 1;
    pendingConnectAbortControllerRef.current?.abort();
    pendingConnectAbortControllerRef.current = null;
    connectPromiseRef.current = null;
    cleanupTransport();
    userTranscriptRef.current = "";
    userSpeechActiveRef.current = false;
    assistantTranscriptRef.current = "";
    responseFunctionCallsRef.current.clear();
    delegationResponseIdsRef.current.clear();
    executedFunctionCallIdsRef.current.clear();
    pendingEndCallRef.current = false;
    assistantPlaybackStartedAtRef.current = null;
    playbackDrainUntilRef.current = 0;
    setPartialTranscript("");
    setIsAssistantSpeaking(false);
    setIsToolExecuting(false);
    setIsConnected(false);
    setIsConnecting(false);
    setConnectionStatus("disconnected");
    if (wasConnected) onConnectionChangeRef.current(false);
  }, [
    cleanupTransport,
    flushAssistantTranscript,
    flushUserTranscript,
    logAudioUsage,
    sendEvent,
  ]);

  const connect = useCallback(
    (options?: RealtimeConnectOptions): Promise<boolean> => {
      if (connectPromiseRef.current) return connectPromiseRef.current;
      if (dataChannelRef.current?.readyState === "open") {
        return Promise.resolve(true);
      }

      setIsConnecting(true);
      lastConnectFailureRef.current = null;
      latestAudioSecondsRef.current = null;
      audioUsageLoggedRef.current = false;
      sessionClosedRef.current = false;
      const attemptId = connectAttemptIdRef.current + 1;
      connectAttemptIdRef.current = attemptId;
      const abortController = new AbortController();
      pendingConnectAbortControllerRef.current = abortController;

      const promise = (async () => {
        let connectedSuccessfully = false;
        try {
          if (!conversationId) return false;
          if (typeof RTCPeerConnection === "undefined") {
            lastConnectFailureRef.current = {
              code: "connection",
              message: "GPT-Live connection is not supported.",
            };
            return false;
          }

          const handleTransportClosed = () => {
            if (connectAttemptIdRef.current !== attemptId) return;
            const wasConnected = connectedSuccessfully;
            cleanupTransport();
            flushUserTranscript();
            flushAssistantTranscript({ interrupted: true });
            logAudioUsage(
              sessionClosedRef.current ? "closed" : "connection_lost"
            );
            setIsConnected(false);
            setConnectionStatus("disconnected");
            if (wasConnected) onConnectionChangeRef.current(false);
            if (wasConnected && !sessionClosedRef.current) {
              onErrorRef.current(
                "GPT-Live connection lost. Falling back to text mode."
              );
            }
          };

          const peerConnection = new RTCPeerConnection();
          peerConnectionRef.current = peerConnection;
          peerConnection.ontrack = (event) => {
            const audio = ensureRemoteAudioElement();
            if (!audio) return;
            audio.srcObject =
              event.streams[0] ?? new MediaStream([event.track]);
            void audio.play().catch((error) => {
              console.warn("[LiveSession] Remote audio play failed:", error);
            });
          };
          peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            if (
              connectAttemptIdRef.current !== attemptId ||
              state === "connected" ||
              state === "connecting" ||
              state === "new"
            ) {
              return;
            }
            if (state === "failed" || state === "closed") {
              handleTransportClosed();
            }
          };

          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              autoGainControl: true,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
            },
            video: false,
          });
          if (connectAttemptIdRef.current !== attemptId) {
            stream.getTracks().forEach((track) => track.stop());
            return false;
          }
          mediaStreamRef.current = stream;
          stream
            .getAudioTracks()
            .forEach((track) => peerConnection.addTrack(track, stream));

          const dataChannel = peerConnection.createDataChannel("oai-events");
          dataChannelRef.current = dataChannel;
          dataChannel.onmessage = handleMessage;
          dataChannel.onerror = () => {
            console.error("[LiveSession] WebRTC data channel error");
          };

          const dataChannelOpen = new Promise<boolean>((resolve) => {
            let settled = false;
            const settle = (result: boolean) => {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              resolve(result);
            };
            const timeout = setTimeout(() => settle(false), 12_000);
            dataChannel.onopen = () => settle(true);
            dataChannel.onclose = () => {
              if (!settled) {
                settle(false);
                return;
              }
              handleTransportClosed();
            };
          });
          const sessionStarted = new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => {
              if (!sessionStartedResolverRef.current) return;
              sessionStartedResolverRef.current = null;
              resolve(false);
            }, 12_000);
            sessionStartedResolverRef.current = (started) => {
              clearTimeout(timeout);
              resolve(started);
            };
          });

          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          await waitForIceGatheringComplete(
            peerConnection,
            abortController.signal
          );
          const sdp = peerConnection.localDescription?.sdp;
          if (!sdp) throw new Error("Failed to create GPT-Live SDP offer.");

          const response = await fetchWithAuth("/api/live/session", {
            method: "POST",
            signal: abortController.signal,
            body: JSON.stringify({
              conversationId,
              conversationStarterId:
                options?.conversationStarterId ?? undefined,
              initialResponseInstruction:
                options?.initialResponseInstruction ?? undefined,
              internalCallRequestId:
                options?.internalCallRequestId ?? undefined,
              locale,
              mockInterviewOpportunityId:
                options?.mockInterviewOpportunityId ?? undefined,
              resumeCallNoteId: options?.resumeCallNoteId ?? undefined,
              sdp,
            }),
          });
          const responseText = await response.text();
          let payload: Record<string, unknown> = {};
          try {
            const parsed = responseText ? JSON.parse(responseText) : {};
            payload = isRecord(parsed) ? parsed : {};
          } catch {
            payload = {};
          }
          if (!response.ok) {
            const message = getErrorText(
              payload,
              responseText || "Failed to create GPT-Live session."
            );
            lastConnectFailureRef.current =
              options?.internalCallRequestId &&
              response.status === 409 &&
              message === "Internal call already completed"
                ? {
                    code: "internal_call_completed",
                    message: tCareer(H.callCompleted),
                  }
                : { code: "token", message };
            return false;
          }

          const transport = isRecord(payload.transport)
            ? payload.transport
            : null;
          const answerSdp =
            typeof transport?.sdp === "string" ? transport.sdp : "";
          if (!answerSdp) {
            throw new Error("GPT-Live session response is missing SDP.");
          }
          await peerConnection.setRemoteDescription({
            type: "answer",
            sdp: answerSdp,
          });

          const [opened, started] = await Promise.all([
            dataChannelOpen,
            sessionStarted,
          ]);
          if (
            !opened ||
            !started ||
            connectAttemptIdRef.current !== attemptId
          ) {
            throw new Error("GPT-Live session did not become ready.");
          }

          connectedSuccessfully = true;
          setIsConnected(true);
          setConnectionStatus("connected");
          onConnectionChangeRef.current(true);
          return true;
        } catch (error) {
          if (
            abortController.signal.aborted ||
            connectAttemptIdRef.current !== attemptId
          ) {
            return false;
          }
          console.error("[LiveSession] Connect error:", error);
          lastConnectFailureRef.current = {
            code: "connection",
            message:
              error instanceof Error
                ? error.message
                : "Failed to connect GPT-Live session.",
          };
          return false;
        } finally {
          if (connectAttemptIdRef.current === attemptId) {
            connectPromiseRef.current = null;
            pendingConnectAbortControllerRef.current = null;
            setIsConnecting(false);
          }
          if (
            !connectedSuccessfully &&
            connectAttemptIdRef.current === attemptId
          ) {
            cleanupTransport();
            setIsConnected(false);
            setConnectionStatus("disconnected");
          }
        }
      })();
      connectPromiseRef.current = promise;
      return promise;
    },
    [
      cleanupTransport,
      conversationId,
      ensureRemoteAudioElement,
      fetchWithAuth,
      flushAssistantTranscript,
      flushUserTranscript,
      handleMessage,
      locale,
      logAudioUsage,
      tCareer,
    ]
  );

  const sendTextMessage = useCallback(
    (text: string) => {
      sendEvent({
        type: "response.item.create",
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
    sendInstructionThenCommentary(
      "For the next spoken turn, begin the call now and follow the opening guidance already provided. Speak first, then listen.",
      "Begin the call now."
    );
  }, [sendInstructionThenCommentary]);

  const cancelResponse = useCallback(() => {
    flushAssistantTranscript({ interrupted: true });
  }, [flushAssistantTranscript]);

  const primePlayback = useCallback(() => {
    const audio = ensureRemoteAudioElement();
    if (!audio) return;
    void audio.play().catch(() => undefined);
  }, [ensureRemoteAudioElement]);

  const generateSpeech = useCallback(
    (text: string) => {
      const requestedText = text.trim();
      if (!requestedText) return;
      sendInstructionThenCommentary(
        `For the next spoken turn, say exactly this message and nothing else: ${JSON.stringify(
          requestedText
        )}`,
        "Say the requested message now."
      );
    },
    [sendInstructionThenCommentary]
  );

  const updateSessionInstructions = useCallback(
    (instructions: string) => {
      sendEvent({
        type: "session.update",
        session: {
          delegation: {
            type: "responses",
            responses: { instructions },
          },
        },
      });
    },
    [sendEvent]
  );

  const markRealtimeAudioTurnSaved = useCallback(
    (_options: { hasAssistantAudio: boolean; hasUserAudio: boolean }) => {
      // GPT-Live owns its audio context; the DB transcript remains the durable copy.
    },
    []
  );

  const getMediaStream = useCallback(() => mediaStreamRef.current, []);
  const getLastConnectFailure = useCallback(
    () => lastConnectFailureRef.current,
    []
  );

  useEffect(() => disconnect, [disconnect]);

  return {
    isConnected,
    isConnecting,
    isAssistantSpeaking,
    isToolExecuting,
    partialTranscript,
    connectionStatus,
    connect,
    disconnect,
    sendTextMessage,
    triggerResponse,
    cancelResponse,
    primePlayback,
    runAfterCurrentPlayback,
    generateSpeech,
    updateSessionInstructions,
    markRealtimeAudioTurnSaved,
    getMediaStream,
    getLastConnectFailure,
    sendEvent,
  };
}
