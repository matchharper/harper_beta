"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FetchWithAuth } from "./useCareerApi";
import type { CareerConversationStarterId } from "@/lib/career/prompts/conversationStarters";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { useMessages } from "@/i18n/useMessage";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";
import { shouldSpeakRealtimeEndCallFallback } from "@/lib/career/realtimeEndCall";
import {
  beginXaiSpeech,
  completeXaiResponse,
  createXaiTranscriptTurnState,
  markXaiAssistantOutputStarted,
  markXaiResponseCreated,
  queueXaiCompletedTranscript,
  type XaiTranscriptTransition,
} from "@/lib/career/xaiTranscriptTurn";

type UseRealtimeSessionArgs = {
  conversationId: string | null;
  fetchWithAuth: FetchWithAuth;
  providerOverride?: "openai" | "xai" | null;
  onTranscript: (text: string) => void;
  onAssistantDelta: (delta: string) => void;
  onAssistantDone: (fullText: string) => void;
  onError: (error: string) => void;
  onConnectionChange: (connected: boolean) => void;
  onEndCallTool?: () => void;
  onUserSpeechStarted?: (context: RealtimeUserSpeechStartedContext) => void;
  onUserSpeechStopped?: () => void;
};

type RealtimeConnectOptions = {
  conversationStarterId?: CareerConversationStarterId | null;
  initialResponseInstruction?: string | null;
  internalCallRequestId?: string | null;
};

export type RealtimeConnectFailure = {
  code: "internal_call_completed" | "token" | "connection";
  message: string;
};

export type RealtimeUserSpeechStartedContext = {
  continuesCurrentUserTurn: boolean;
  provider: "openai" | "xai";
};

type TokenInfo = {
  model: string;
  provider: "openai" | "xai";
  session?: Record<string, unknown>;
  token: string;
  toolVoicePreambles?: Record<string, string>;
};

type PendingFunctionCallOutput = {
  callId: string;
  output: unknown;
};

type RealtimeUsageLogOptions = {
  billing?: XaiRealtimeBillingPayload | null;
  eventType?: string;
  hadAudioInResponse: boolean;
  status: string;
};

type XaiRealtimeBillingPayload = {
  audioDurationSeconds: number;
  billingBasis: "audio_duration";
  inputAudioSeconds: number;
  outputAudioSeconds: number;
  sessionDurationSeconds: number;
  sessionEndedAt?: string | null;
  sessionStartedAt: string;
  textInputEventCount: number;
};

type XaiRealtimeBillingState = {
  inputAudioSeconds: number;
  outputAudioSeconds: number;
  sentInputAudioSeconds: number;
  sentOutputAudioSeconds: number;
  sentTextInputEventCount: number;
  sessionStartedAt: string;
  sessionStartedAtMs: number;
  textInputEventCount: number;
};

type RealtimeAudioTurnSavedOptions = {
  hasAssistantAudio: boolean;
  hasUserAudio: boolean;
};

type TrackedRealtimeAudioTurn = {
  assistantItemIds: string[];
  awaitsUserAudioItem: boolean;
  id: number;
  savedToDb: boolean;
  userItemIds: string[];
};

const VOICE_DEBUG_STORAGE_KEY = "careerVoiceDebug";
const PLAYBACK_DRAIN_GRACE_MS = 900;
const PLAYBACK_RESPONSE_DONE_GRACE_MS = 700;
const MIN_ESTIMATED_PLAYBACK_MS = 900;
const MAX_ESTIMATED_PLAYBACK_MS = 45_000;
const REALTIME_AUDIO_TURNS_TO_KEEP = 4;
const REALTIME_END_CALL_TOOL_NAME = "end_call";
const XAI_AUDIO_SAMPLE_RATE = 24_000;

function resampleAudio(
  samples: Float32Array,
  sourceRate: number,
  targetRate: number
) {
  if (sourceRate === targetRate) return samples;
  if (samples.length === 0) return samples;

  const outputLength = Math.max(
    1,
    Math.round(samples.length * (targetRate / sourceRate))
  );
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const mix = position - leftIndex;
    output[index] = samples[leftIndex] * (1 - mix) + samples[rightIndex] * mix;
  }

  return output;
}

function encodePcm16Base64(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(index * 2, Math.round(pcm), true);
  }

  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodePcm16Base64(audio: string) {
  const binary = atob(audio);
  const byteLength = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(byteLength);
  for (let index = 0; index < byteLength; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(byteLength / 2);
  for (let index = 0; index < samples.length; index += 1) {
    const pcm = view.getInt16(index * 2, true);
    samples[index] = pcm < 0 ? pcm / 0x8000 : pcm / 0x7fff;
  }
  return samples;
}

function getPlaybackNow() {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
}

function estimateSpeechPlaybackMs(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return PLAYBACK_RESPONSE_DONE_GRACE_MS;

  const koreanSyllables = normalized.match(/[\uac00-\ud7a3]/g)?.length ?? 0;
  const latinWords =
    normalized.match(/[A-Za-z0-9][A-Za-z0-9'./+-]*/g)?.length ?? 0;
  const otherChars = normalized
    .replace(/[\s\uac00-\ud7a3A-Za-z0-9'./+-]/g, "")
    .trim().length;
  const pauses =
    normalized.match(/[.!?。！？…]|[.]{3}|[,，、;:]/g)?.length ?? 0;

  const estimated =
    700 +
    koreanSyllables * 155 +
    latinWords * 390 +
    otherChars * 90 +
    pauses * 220;
  return Math.min(
    MAX_ESTIMATED_PLAYBACK_MS,
    Math.max(MIN_ESTIMATED_PLAYBACK_MS, estimated)
  );
}

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

function getErrorText(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;

  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error.trim();

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getRealtimeResponseUsage(
  response: Record<string, unknown> | undefined
) {
  const usage = response?.usage;
  return isRecord(usage) ? usage : null;
}

function addUniqueId(ids: string[], value: string) {
  const id = value.trim();
  if (!id || ids.includes(id)) return;
  ids.push(id);
}

function getRealtimeItemId(item: unknown) {
  if (!isRecord(item)) return "";
  return typeof item.id === "string" ? item.id.trim() : "";
}

function isAssistantMessageItem(item: unknown) {
  if (!isRecord(item)) return false;
  return item.type === "message" && item.role === "assistant";
}

function isSavedUserAssistantAudioTurn(turn: TrackedRealtimeAudioTurn) {
  return (
    turn.savedToDb &&
    turn.userItemIds.length > 0 &&
    turn.assistantItemIds.length > 0
  );
}

function scheduleRealtimeUsageLogTask(task: () => void) {
  if (typeof window === "undefined") {
    setTimeout(task, 0);
    return;
  }

  const idleWindow = window as Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number }
    ) => number;
  };

  if (typeof idleWindow.requestIdleCallback === "function") {
    idleWindow.requestIdleCallback(task, { timeout: 10_000 });
    return;
  }

  window.setTimeout(task, 3_000);
}

export function useRealtimeSession(args: UseRealtimeSessionArgs) {
  const tCareer = useCareerMessageFormatter();
  const { locale } = useMessages();
  const {
    conversationId,
    fetchWithAuth,
    providerOverride,
    onTranscript,
    onAssistantDelta,
    onAssistantDone,
    onError,
    onConnectionChange,
    onEndCallTool,
    onUserSpeechStarted,
    onUserSpeechStopped,
  } = args;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [isToolExecuting, setIsToolExecuting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "reconnecting" | "disconnected"
  >("disconnected");

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const tokenInfoRef = useRef<TokenInfo | null>(null);
  const responseTextRef = useRef("");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const xaiAudioContextRef = useRef<AudioContext | null>(null);
  const xaiInputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const xaiInputProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const xaiInputMuteRef = useRef<GainNode | null>(null);
  const xaiPlaybackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const xaiNextPlaybackTimeRef = useRef(0);
  const xaiBillingRef = useRef<XaiRealtimeBillingState | null>(null);
  const connectRef = useRef<
    ((options?: RealtimeConnectOptions) => Promise<boolean>) | null
  >(null);
  const lastConnectFailureRef = useRef<RealtimeConnectFailure | null>(null);
  const connectPromiseRef = useRef<Promise<boolean> | null>(null);
  const pendingConnectAbortControllerRef = useRef<AbortController | null>(null);
  const pendingConnectCancelRef = useRef<(() => void) | null>(null);
  const connectAttemptIdRef = useRef(0);
  const partialTranscriptItemIdRef = useRef<string | null>(null);
  // xAI can emit a cumulative completed transcript after every VAD pause.
  // Keep replacing the pending text until an actual assistant turn boundary.
  const xaiTranscriptTurnRef = useRef(createXaiTranscriptTurnState());
  const pendingResponseFunctionCallsRef = useRef<
    Array<{ arguments: string; callId: string; name: string }>
  >([]);
  const nextToolExecutionIdRef = useRef(1);
  const activeToolExecutionIdsRef = useRef<Set<number>>(new Set());

  const currentResponseAssistantItemIdsRef = useRef<string[]>([]);
  const currentResponseStartedAfterUserSpeechRef = useRef(false);
  const nextAudioDeleteEventIdRef = useRef(1);
  const nextAudioTurnIdRef = useRef(1);
  const pendingAudioDeleteEventIdsRef = useRef<Set<string>>(new Set());
  const pendingUserAudioItemIdsRef = useRef<string[]>([]);
  const pendingUserSpeechForAudioTurnRef = useRef(false);
  const realtimeAudioTurnsRef = useRef<TrackedRealtimeAudioTurn[]>([]);
  const userSpeechSinceLastResponseRef = useRef(false);

  const hasAudioInResponseRef = useRef(false);
  const interruptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalResponseModeRef = useRef<
    "end_call_closing" | "tool_preamble" | null
  >(null);
  const pendingToolContinuationRef = useRef<(() => void) | null>(null);
  const responseInProgressRef = useRef(false);
  const responseCancelRequestedRef = useRef(false);
  const suppressCurrentResponseOutputRef = useRef(false);
  const suppressCancelledResponseDoneRef = useRef(false);
  const assistantPlaybackStartedAtRef = useRef<number | null>(null);
  const playbackDrainUntilRef = useRef(0);
  const playbackDrainTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(
    new Set()
  );

  // TTFT measurement: speech_stopped → first audio playback
  const speechStoppedAtRef = useRef<number>(0);

  // Stable callback refs
  const onTranscriptRef = useRef(onTranscript);
  const onAssistantDeltaRef = useRef(onAssistantDelta);
  const onAssistantDoneRef = useRef(onAssistantDone);
  const onErrorRef = useRef(onError);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onEndCallToolRef = useRef(onEndCallTool);
  const onUserSpeechStartedRef = useRef(onUserSpeechStarted);
  const onUserSpeechStoppedRef = useRef(onUserSpeechStopped);

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
    onEndCallToolRef.current = onEndCallTool;
  }, [onEndCallTool]);
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

  const cleanupMedia = useCallback(() => {
    const inputProcessor = xaiInputProcessorRef.current;
    xaiInputProcessorRef.current = null;
    if (inputProcessor) {
      inputProcessor.onaudioprocess = null;
      inputProcessor.disconnect();
    }

    xaiInputSourceRef.current?.disconnect();
    xaiInputSourceRef.current = null;
    xaiInputMuteRef.current?.disconnect();
    xaiInputMuteRef.current = null;

    const playbackSources = Array.from(xaiPlaybackSourcesRef.current);
    xaiPlaybackSourcesRef.current.clear();
    for (const source of playbackSources) {
      try {
        source.stop();
      } catch {
        // The source may already have finished.
      }
      source.disconnect();
    }
    xaiNextPlaybackTimeRef.current = 0;

    const xaiAudioContext = xaiAudioContextRef.current;
    xaiAudioContextRef.current = null;
    if (xaiAudioContext && xaiAudioContext.state !== "closed") {
      void xaiAudioContext.close().catch(() => undefined);
    }

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
    const webSocket = webSocketRef.current;
    webSocketRef.current = null;
    if (webSocket) {
      webSocket.onopen = null;
      webSocket.onmessage = null;
      webSocket.onerror = null;
      webSocket.onclose = null;
      if (
        webSocket.readyState === WebSocket.CONNECTING ||
        webSocket.readyState === WebSocket.OPEN
      ) {
        webSocket.close();
      }
    }

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

  const fetchToken = useCallback(
    async (options?: RealtimeConnectOptions): Promise<TokenInfo | null> => {
      if (!conversationId) return null;
      try {
        const res = await fetchWithAuth("/api/realtime/token", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            conversationStarterId: options?.conversationStarterId ?? undefined,
            initialResponseInstruction:
              options?.initialResponseInstruction ?? undefined,
            internalCallRequestId: options?.internalCallRequestId ?? undefined,
            locale,
            providerOverride: providerOverride ?? undefined,
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          let parsedError: unknown = null;
          try {
            parsedError = errText ? JSON.parse(errText) : null;
          } catch {
            parsedError = null;
          }
          const errorMessage = getErrorText(
            parsedError,
            errText || "Failed to create realtime token."
          );
          console.error("[RealtimeSession] Token fetch failed:", errText);
          lastConnectFailureRef.current =
            options?.internalCallRequestId &&
            res.status === 409 &&
            errorMessage === "Internal call already completed"
              ? {
                  code: "internal_call_completed",
                  message: tCareer(H.callCompleted),
                }
              : {
                  code: "token",
                  message: errorMessage,
                };
          return null;
        }
        const data = await res.json();
        return {
          model:
            typeof data.model === "string" && data.model.trim()
              ? data.model.trim()
              : "gpt-realtime-2.1",
          provider: data.provider === "xai" ? "xai" : "openai",
          session: isRecord(data.session) ? data.session : undefined,
          token: data.token,
          toolVoicePreambles:
            data.toolVoicePreambles &&
            typeof data.toolVoicePreambles === "object" &&
            !Array.isArray(data.toolVoicePreambles)
              ? (data.toolVoicePreambles as Record<string, string>)
              : {},
        };
      } catch (err) {
        console.error("[RealtimeSession] Token fetch error:", err);
        lastConnectFailureRef.current = {
          code: "token",
          message:
            err instanceof Error
              ? err.message
              : "Failed to create realtime token.",
        };
        return null;
      }
    },
    [conversationId, fetchWithAuth, locale, providerOverride, tCareer]
  );

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const webSocket = webSocketRef.current;
    if (webSocket?.readyState === WebSocket.OPEN) {
      webSocket.send(JSON.stringify(event));
      return;
    }

    const dataChannel = dataChannelRef.current;
    if (!dataChannel || dataChannel.readyState !== "open") return;
    dataChannel.send(JSON.stringify(event));
  }, []);

  const applyXaiTranscriptTransition = useCallback(
    (transition: XaiTranscriptTransition) => {
      xaiTranscriptTurnRef.current = transition.state;

      const deliveredTranscript = transition.deliveredTranscript;
      const shouldClearPartial = deliveredTranscript
        ? !deliveredTranscript.itemId ||
          partialTranscriptItemIdRef.current === deliveredTranscript.itemId
        : Boolean(
            transition.discardedItemId &&
            partialTranscriptItemIdRef.current === transition.discardedItemId
          );
      if (shouldClearPartial) {
        partialTranscriptItemIdRef.current = null;
        setPartialTranscript("");
      }
      if (deliveredTranscript) {
        onTranscriptRef.current(deliveredTranscript.text);
      }
    },
    []
  );

  const scheduleXaiTranscript = useCallback(
    (text: string, itemId: string) => {
      applyXaiTranscriptTransition(
        queueXaiCompletedTranscript(xaiTranscriptTurnRef.current, {
          itemId,
          text,
        })
      );
    },
    [applyXaiTranscriptTransition]
  );

  const pruneSavedRealtimeAudioTurns = useCallback(() => {
    const turns = realtimeAudioTurnsRef.current;
    const savedUserAssistantTurns = turns.filter(isSavedUserAssistantAudioTurn);
    if (savedUserAssistantTurns.length <= REALTIME_AUDIO_TURNS_TO_KEEP) return;

    const pruneCount =
      savedUserAssistantTurns.length - REALTIME_AUDIO_TURNS_TO_KEEP;
    const userAssistantTurnsToPrune = savedUserAssistantTurns.slice(
      0,
      pruneCount
    );
    const oldestKeptUserAssistantTurn =
      savedUserAssistantTurns[pruneCount] ?? null;
    const pruneTurnIds = new Set(
      userAssistantTurnsToPrune.map((turn) => turn.id)
    );
    const itemIdsToDelete = new Set<string>();

    const turnsToKeep = turns.filter((turn) => {
      const shouldPruneUserAssistantTurn = pruneTurnIds.has(turn.id);
      const shouldPruneOlderSavedAudioOnlyTurn =
        Boolean(oldestKeptUserAssistantTurn) &&
        turn.savedToDb &&
        !isSavedUserAssistantAudioTurn(turn) &&
        turn.id < oldestKeptUserAssistantTurn!.id;

      if (
        !shouldPruneUserAssistantTurn &&
        !shouldPruneOlderSavedAudioOnlyTurn
      ) {
        return true;
      }

      for (const itemId of turn.userItemIds) itemIdsToDelete.add(itemId);
      for (const itemId of turn.assistantItemIds) itemIdsToDelete.add(itemId);
      return false;
    });

    if (itemIdsToDelete.size === 0) return;

    realtimeAudioTurnsRef.current = turnsToKeep;
    for (const itemId of itemIdsToDelete) {
      const eventId = `harper_audio_prune_${Date.now()}_${nextAudioDeleteEventIdRef.current}`;
      nextAudioDeleteEventIdRef.current += 1;
      pendingAudioDeleteEventIdsRef.current.add(eventId);
      sendEvent({
        event_id: eventId,
        type: "conversation.item.delete",
        item_id: itemId,
      });
    }
    logCareerVoiceDebug("audio_history.pruned", {
      deletedItemCount: itemIdsToDelete.size,
      keptUserAssistantTurns: REALTIME_AUDIO_TURNS_TO_KEEP,
    });
  }, [sendEvent]);

  const markRealtimeAudioTurnSaved = useCallback(
    (options: RealtimeAudioTurnSavedOptions) => {
      const turn = realtimeAudioTurnsRef.current.find((candidate) => {
        if (candidate.savedToDb) return false;
        if (
          options.hasAssistantAudio &&
          candidate.assistantItemIds.length === 0
        )
          return false;
        if (
          options.hasUserAudio &&
          candidate.userItemIds.length === 0 &&
          !candidate.awaitsUserAudioItem
        ) {
          return false;
        }
        return true;
      });

      if (!turn) {
        logCareerVoiceDebug("audio_history.save_mark_skipped", {
          reason: "no_matching_turn",
          ...options,
        });
        return;
      }

      if (
        options.hasUserAudio &&
        turn.awaitsUserAudioItem &&
        turn.userItemIds.length === 0
      ) {
        logCareerVoiceDebug("audio_history.save_mark_skipped", {
          reason: "awaiting_user_audio_item",
          turnId: turn.id,
        });
        return;
      }

      turn.savedToDb = true;
      turn.awaitsUserAudioItem = false;
      logCareerVoiceDebug("audio_history.saved", {
        assistantItemCount: turn.assistantItemIds.length,
        turnId: turn.id,
        userItemCount: turn.userItemIds.length,
      });
      pruneSavedRealtimeAudioTurns();
    },
    [pruneSavedRealtimeAudioTurns]
  );

  const recordRealtimeUserAudioItem = useCallback((itemId: string) => {
    const normalizedItemId = itemId.trim();
    if (!normalizedItemId) return;

    const awaitingTurn = [...realtimeAudioTurnsRef.current]
      .reverse()
      .find(
        (turn) =>
          !turn.savedToDb &&
          turn.awaitsUserAudioItem &&
          turn.userItemIds.length === 0
      );

    if (awaitingTurn) {
      addUniqueId(awaitingTurn.userItemIds, normalizedItemId);
      awaitingTurn.awaitsUserAudioItem = false;
      logCareerVoiceDebug("audio_history.user_item_attached", {
        itemId: normalizedItemId,
        turnId: awaitingTurn.id,
      });
      return;
    }

    addUniqueId(pendingUserAudioItemIdsRef.current, normalizedItemId);
    logCareerVoiceDebug("audio_history.user_item_pending", {
      itemId: normalizedItemId,
    });
  }, []);

  const recordRealtimeAssistantOutputItem = useCallback((item: unknown) => {
    if (!isAssistantMessageItem(item)) return;
    const itemId = getRealtimeItemId(item);
    if (!itemId) return;

    addUniqueId(currentResponseAssistantItemIdsRef.current, itemId);
    logCareerVoiceDebug("audio_history.assistant_item_seen", { itemId });
  }, []);

  const completeRealtimeAudioTurnFromResponse = useCallback(
    (options: {
      hadAudioInResponse: boolean;
      outputItems: Array<Record<string, unknown>>;
      skipTracking: boolean;
      status: string;
    }) => {
      for (const item of options.outputItems) {
        recordRealtimeAssistantOutputItem(item);
      }

      const assistantItemIds = currentResponseAssistantItemIdsRef.current;
      currentResponseAssistantItemIdsRef.current = [];
      const startedAfterUserSpeech =
        currentResponseStartedAfterUserSpeechRef.current;
      currentResponseStartedAfterUserSpeechRef.current = false;

      if (
        options.skipTracking ||
        options.status !== "completed" ||
        !options.hadAudioInResponse ||
        assistantItemIds.length === 0
      ) {
        if (startedAfterUserSpeech) {
          pendingUserSpeechForAudioTurnRef.current = true;
        }
        return;
      }

      const userItemIds = [...pendingUserAudioItemIdsRef.current];
      pendingUserAudioItemIdsRef.current = [];
      const awaitsUserAudioItem =
        userItemIds.length === 0 && startedAfterUserSpeech;
      const turn: TrackedRealtimeAudioTurn = {
        assistantItemIds,
        awaitsUserAudioItem,
        id: nextAudioTurnIdRef.current,
        savedToDb: false,
        userItemIds,
      };
      nextAudioTurnIdRef.current += 1;
      realtimeAudioTurnsRef.current.push(turn);
      logCareerVoiceDebug("audio_history.turn_tracked", {
        awaitsUserAudioItem,
        assistantItemCount: assistantItemIds.length,
        turnId: turn.id,
        userItemCount: userItemIds.length,
      });
    },
    [recordRealtimeAssistantOutputItem]
  );

  const beginXaiBilling = useCallback(() => {
    const now = Date.now();
    xaiBillingRef.current = {
      inputAudioSeconds: 0,
      outputAudioSeconds: 0,
      sentInputAudioSeconds: 0,
      sentOutputAudioSeconds: 0,
      sentTextInputEventCount: 0,
      sessionStartedAt: new Date(now).toISOString(),
      sessionStartedAtMs: now,
      textInputEventCount: 0,
    };
  }, []);

  const consumeXaiBilling = useCallback((ended = false) => {
    const state = xaiBillingRef.current;
    if (!state) return null;

    const inputAudioSeconds = Math.max(
      state.inputAudioSeconds - state.sentInputAudioSeconds,
      0
    );
    const outputAudioSeconds = Math.max(
      state.outputAudioSeconds - state.sentOutputAudioSeconds,
      0
    );
    const textInputEventCount = Math.max(
      state.textInputEventCount - state.sentTextInputEventCount,
      0
    );
    if (
      inputAudioSeconds <= 0 &&
      outputAudioSeconds <= 0 &&
      textInputEventCount <= 0
    ) {
      return null;
    }

    state.sentInputAudioSeconds = state.inputAudioSeconds;
    state.sentOutputAudioSeconds = state.outputAudioSeconds;
    state.sentTextInputEventCount = state.textInputEventCount;

    const now = Date.now();
    return {
      audioDurationSeconds: inputAudioSeconds + outputAudioSeconds,
      billingBasis: "audio_duration" as const,
      inputAudioSeconds,
      outputAudioSeconds,
      sessionDurationSeconds: Math.max(
        (now - state.sessionStartedAtMs) / 1000,
        0
      ),
      sessionEndedAt: ended ? new Date(now).toISOString() : null,
      sessionStartedAt: state.sessionStartedAt,
      textInputEventCount,
    } satisfies XaiRealtimeBillingPayload;
  }, []);

  const scheduleRealtimeUsageLog = useCallback(
    (
      response: Record<string, unknown> | undefined,
      options: RealtimeUsageLogOptions
    ) => {
      if (!conversationId) return;

      const usage = getRealtimeResponseUsage(response);
      const isXai = tokenInfoRef.current?.provider === "xai";
      const billing =
        options.billing !== undefined
          ? options.billing
          : isXai
            ? consumeXaiBilling()
            : null;
      if (!usage && !billing) return;

      const responseId =
        typeof response?.id === "string" ? response.id.trim() : "";
      const payload = {
        conversationId,
        eventType: options.eventType ?? "response.done",
        hadAudioInResponse: options.hadAudioInResponse,
        providerOverride: providerOverride ?? undefined,
        responseId,
        status: options.status,
        usage: usage ?? {},
        ...(billing ? { billing } : {}),
      };

      scheduleRealtimeUsageLogTask(() => {
        void fetchWithAuth("/api/realtime/usage", {
          method: "POST",
          keepalive: true,
          body: JSON.stringify(payload),
        })
          .then((res) => {
            if (!res.ok) {
              console.warn("[RealtimeSession] Usage log failed:", res.status);
            }
          })
          .catch((error) => {
            console.warn("[RealtimeSession] Usage log failed:", error);
          });
      });
    },
    [consumeXaiBilling, conversationId, fetchWithAuth, providerOverride]
  );

  const flushXaiBilling = useCallback(
    (eventType: string, status: string) => {
      if (tokenInfoRef.current?.provider !== "xai") return;

      const billing = consumeXaiBilling(true);
      if (billing) {
        scheduleRealtimeUsageLog(undefined, {
          billing,
          eventType,
          hadAudioInResponse: false,
          status,
        });
      }
      xaiBillingRef.current = null;
    },
    [consumeXaiBilling, scheduleRealtimeUsageLog]
  );

  const requestExactSpeech = useCallback(
    (text: string) => {
      responseTextRef.current = "";
      sendEvent({
        type: "response.create",
        response: {
          instructions: tCareer(
            '다음 내용을 정확히 그대로 자연스럽게 말해주세요: "{text}"',
            { text }
          ),
          tool_choice: "none",
          tools: [],
        },
      });
    },
    [sendEvent, tCareer]
  );

  const markAssistantPlaybackStarted = useCallback(() => {
    const now = getPlaybackNow();
    if (assistantPlaybackStartedAtRef.current === null) {
      assistantPlaybackStartedAtRef.current = now;
    }
    playbackDrainUntilRef.current = Math.max(
      playbackDrainUntilRef.current,
      now + PLAYBACK_RESPONSE_DONE_GRACE_MS
    );
  }, []);

  const markAssistantPlaybackDone = useCallback((fullText: string) => {
    const now = getPlaybackNow();
    const startedAt = assistantPlaybackStartedAtRef.current ?? now;
    const estimatedEndAt =
      startedAt + estimateSpeechPlaybackMs(fullText) + PLAYBACK_DRAIN_GRACE_MS;

    playbackDrainUntilRef.current = Math.max(
      playbackDrainUntilRef.current,
      estimatedEndAt,
      now + PLAYBACK_RESPONSE_DONE_GRACE_MS
    );
    assistantPlaybackStartedAtRef.current = null;
  }, []);

  const getRemainingPlaybackMs = useCallback(() => {
    const remainingMs = playbackDrainUntilRef.current - getPlaybackNow();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0;
    return Math.min(MAX_ESTIMATED_PLAYBACK_MS, remainingMs);
  }, []);

  const clearPlaybackDrainTimers = useCallback(() => {
    playbackDrainTimersRef.current.forEach((timer) => clearTimeout(timer));
    playbackDrainTimersRef.current.clear();
  }, []);

  const ensureXaiAudioContext = useCallback(() => {
    const existing = xaiAudioContextRef.current;
    if (existing && existing.state !== "closed") return existing;
    if (typeof window === "undefined") return null;

    const audioWindow = window as Window &
      typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      };
    const AudioContextConstructor =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) return null;

    const audioContext = new AudioContextConstructor({
      sampleRate: XAI_AUDIO_SAMPLE_RATE,
    });
    xaiAudioContextRef.current = audioContext;
    return audioContext;
  }, []);

  const stopXaiPlayback = useCallback(() => {
    const playbackSources = Array.from(xaiPlaybackSourcesRef.current);
    xaiPlaybackSourcesRef.current.clear();
    for (const source of playbackSources) {
      try {
        source.stop();
      } catch {
        // The source may already have finished.
      }
      source.disconnect();
    }

    const audioContext = xaiAudioContextRef.current;
    xaiNextPlaybackTimeRef.current =
      audioContext?.state === "running" ? audioContext.currentTime : 0;
  }, []);

  const queueXaiAudioDelta = useCallback(
    (audio: string) => {
      if (!audio || tokenInfoRef.current?.provider !== "xai") return;

      try {
        const samples = decodePcm16Base64(audio);
        if (samples.length === 0) return;

        if (xaiBillingRef.current) {
          xaiBillingRef.current.outputAudioSeconds +=
            samples.length / XAI_AUDIO_SAMPLE_RATE;
        }

        const audioContext = ensureXaiAudioContext();
        if (!audioContext || audioContext.state === "closed") return;
        if (audioContext.state === "suspended") {
          void audioContext.resume().catch((error) => {
            console.warn("[RealtimeSession] xAI audio resume failed:", error);
          });
        }

        const buffer = audioContext.createBuffer(
          1,
          samples.length,
          XAI_AUDIO_SAMPLE_RATE
        );
        buffer.copyToChannel(samples, 0);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.onended = () => {
          if (xaiPlaybackSourcesRef.current.delete(source)) {
            source.disconnect();
          }
        };

        const startAt = Math.max(
          audioContext.currentTime + 0.01,
          xaiNextPlaybackTimeRef.current
        );
        source.start(startAt);
        xaiNextPlaybackTimeRef.current = startAt + buffer.duration;
        xaiPlaybackSourcesRef.current.add(source);

        const queuedPlaybackMs =
          Math.max(
            0,
            xaiNextPlaybackTimeRef.current - audioContext.currentTime
          ) * 1000;
        playbackDrainUntilRef.current = Math.max(
          playbackDrainUntilRef.current,
          getPlaybackNow() + queuedPlaybackMs + PLAYBACK_DRAIN_GRACE_MS
        );
      } catch (error) {
        console.warn("[RealtimeSession] xAI audio decode failed:", error);
      }
    },
    [ensureXaiAudioContext]
  );

  const stopNativePlayback = useCallback(() => {
    hasAudioInResponseRef.current = false;
    assistantPlaybackStartedAtRef.current = null;
    playbackDrainUntilRef.current = 0;
    clearPlaybackDrainTimers();
    stopXaiPlayback();
    setIsAssistantSpeaking(false);
  }, [clearPlaybackDrainTimers, stopXaiPlayback]);

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
        const timer = setTimeout(() => {
          playbackDrainTimersRef.current.delete(timer);
          callback();
        }, remainingMs);
        playbackDrainTimersRef.current.add(timer);
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

      const continueResponse = () => {
        sendEvent({ type: "response.create" });
      };
      if (tokenInfoRef.current?.provider === "xai") {
        runAfterCurrentPlayback(continueResponse);
      } else {
        continueResponse();
      }
    },
    [runAfterCurrentPlayback, sendEvent]
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

  const beginToolExecution = useCallback(() => {
    const executionId = nextToolExecutionIdRef.current;
    nextToolExecutionIdRef.current += 1;
    activeToolExecutionIdsRef.current.add(executionId);
    setIsToolExecuting(true);
    return executionId;
  }, []);

  const finishToolExecution = useCallback((executionId: number) => {
    activeToolExecutionIdsRef.current.delete(executionId);
    setIsToolExecuting(activeToolExecutionIdsRef.current.size > 0);
  }, []);

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
      const toolExecutionId = beginToolExecution();
      const outputPromise = resolveFunctionCalls(functionCalls).finally(() => {
        finishToolExecution(toolExecutionId);
      });
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
      beginToolExecution,
      finishToolExecution,
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
            currentResponseAssistantItemIdsRef.current = [];
            pendingResponseFunctionCallsRef.current = [];
            if (tokenInfoRef.current?.provider === "xai") {
              xaiTranscriptTurnRef.current = markXaiResponseCreated(
                xaiTranscriptTurnRef.current
              );
            }
            currentResponseStartedAfterUserSpeechRef.current =
              userSpeechSinceLastResponseRef.current ||
              pendingUserSpeechForAudioTurnRef.current;
            userSpeechSinceLastResponseRef.current = false;
            pendingUserSpeechForAudioTurnRef.current = false;
            responseInProgressRef.current = true;
            responseCancelRequestedRef.current = false;
            suppressCurrentResponseOutputRef.current = false;
            suppressCancelledResponseDoneRef.current = false;
            break;

          case "response.output_item.added":
          case "response.output_item.created":
          case "response.output_item.done": {
            recordRealtimeAssistantOutputItem(msg.item);
            break;
          }

          case "conversation.item.input_audio_transcription.delta": {
            const delta = typeof msg.delta === "string" ? msg.delta : "";
            const itemId = typeof msg.item_id === "string" ? msg.item_id : "";
            logCareerVoiceDebug("transcription.delta", { delta, itemId });
            if (!delta) break;

            const previousItemId = partialTranscriptItemIdRef.current;
            if (itemId) {
              partialTranscriptItemIdRef.current = itemId;
            }

            if (itemId && previousItemId && previousItemId !== itemId) {
              setPartialTranscript(delta);
              break;
            }

            setPartialTranscript((prev) => prev + delta);
            break;
          }

          case "conversation.item.input_audio_transcription.updated": {
            const xaiTranscriptState = xaiTranscriptTurnRef.current;
            if (
              tokenInfoRef.current?.provider === "xai" &&
              xaiTranscriptState.deliveredTurnId === xaiTranscriptState.turnId
            ) {
              break;
            }
            const transcript =
              typeof msg.transcript === "string" ? msg.transcript : "";
            const itemId = typeof msg.item_id === "string" ? msg.item_id : "";
            logCareerVoiceDebug("transcription.updated", {
              itemId,
              transcript,
            });
            if (itemId) {
              partialTranscriptItemIdRef.current = itemId;
            }
            setPartialTranscript(transcript);
            break;
          }

          case "conversation.item.input_audio_transcription.completed": {
            const transcript =
              typeof msg.transcript === "string" ? msg.transcript : "";
            const itemId = typeof msg.item_id === "string" ? msg.item_id : "";
            logCareerVoiceDebug("transcription.completed", {
              itemId,
              transcript,
            });
            recordRealtimeUserAudioItem(itemId);
            if (tokenInfoRef.current?.provider === "xai") {
              scheduleXaiTranscript(transcript, itemId);
              break;
            }
            if (!itemId || partialTranscriptItemIdRef.current === itemId) {
              partialTranscriptItemIdRef.current = null;
              setPartialTranscript("");
            }
            onTranscriptRef.current(transcript);
            break;
          }

          case "conversation.item.input_audio_transcription.failed": {
            const itemId = typeof msg.item_id === "string" ? msg.item_id : "";
            logCareerVoiceDebug("transcription.failed", { itemId });
            if (!itemId || partialTranscriptItemIdRef.current === itemId) {
              partialTranscriptItemIdRef.current = null;
              setPartialTranscript("");
            }
            onTranscriptRef.current("");
            break;
          }

          case "response.output_audio.delta":
          case "response.audio.delta": {
            if (suppressCurrentResponseOutputRef.current) break;
            if (tokenInfoRef.current?.provider === "xai") {
              xaiTranscriptTurnRef.current = markXaiAssistantOutputStarted(
                xaiTranscriptTurnRef.current
              );
            }
            const audio =
              typeof msg.delta === "string"
                ? msg.delta
                : typeof msg.audio === "string"
                  ? msg.audio
                  : "";
            if (audio) queueXaiAudioDelta(audio);
            markAssistantPlaybackStarted();
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

          case "response.output_audio_transcript.delta":
          case "response.audio_transcript.delta": {
            if (suppressCurrentResponseOutputRef.current) break;
            if (tokenInfoRef.current?.provider === "xai") {
              xaiTranscriptTurnRef.current = markXaiAssistantOutputStarted(
                xaiTranscriptTurnRef.current
              );
            }
            const delta = typeof msg.delta === "string" ? msg.delta : "";
            markAssistantPlaybackStarted();
            hasAudioInResponseRef.current = true;
            setIsAssistantSpeaking(true);
            responseTextRef.current += delta;
            onAssistantDeltaRef.current(delta);
            break;
          }

          case "response.output_audio_transcript.done":
          case "response.audio_transcript.done": {
            if (suppressCurrentResponseOutputRef.current) break;
            const transcript =
              typeof msg.transcript === "string" ? msg.transcript : "";
            if (transcript) {
              responseTextRef.current = transcript;
            }
            break;
          }

          case "response.function_call_arguments.done": {
            const callId =
              typeof msg.call_id === "string" ? msg.call_id.trim() : "";
            const name = typeof msg.name === "string" ? msg.name.trim() : "";
            if (!callId || !name) break;

            const functionCall = {
              arguments:
                typeof msg.arguments === "string" ? msg.arguments : "{}",
              callId,
              name,
            };
            const existingIndex =
              pendingResponseFunctionCallsRef.current.findIndex(
                (candidate) => candidate.callId === callId
              );
            if (existingIndex >= 0) {
              pendingResponseFunctionCallsRef.current[existingIndex] =
                functionCall;
            } else {
              pendingResponseFunctionCallsRef.current.push(functionCall);
            }
            break;
          }

          case "response.done": {
            responseInProgressRef.current = false;
            responseCancelRequestedRef.current = false;
            const fullText = responseTextRef.current;
            responseTextRef.current = "";
            const hadAudioInResponse = hasAudioInResponseRef.current;
            hasAudioInResponseRef.current = false;
            if (hadAudioInResponse) {
              markAssistantPlaybackDone(fullText);
            }

            const response = msg.response as
              | Record<string, unknown>
              | undefined;
            const status =
              typeof response?.status === "string"
                ? response.status
                : "completed";
            if (tokenInfoRef.current?.provider === "xai") {
              applyXaiTranscriptTransition(
                completeXaiResponse(xaiTranscriptTurnRef.current, status)
              );
            }
            scheduleRealtimeUsageLog(response, {
              hadAudioInResponse,
              status,
            });

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
            completeRealtimeAudioTurnFromResponse({
              hadAudioInResponse,
              outputItems,
              skipTracking: internalResponseModeRef.current !== null,
              status,
            });
            const outputFunctionCalls = outputItems
              .filter((item) => item.type === "function_call")
              .map((item) => ({
                callId: String(item.call_id ?? ""),
                name: String(item.name ?? ""),
                arguments: String(item.arguments ?? "{}"),
              }))
              .filter((item) => item.callId && item.name);
            const functionCallsById = new Map(
              pendingResponseFunctionCallsRef.current.map((functionCall) => [
                functionCall.callId,
                functionCall,
              ])
            );
            pendingResponseFunctionCallsRef.current = [];
            for (const functionCall of outputFunctionCalls) {
              functionCallsById.set(functionCall.callId, functionCall);
            }
            const functionCalls = Array.from(functionCallsById.values());

            const endCallRequested = functionCalls.some(
              (functionCall) =>
                functionCall.name === REALTIME_END_CALL_TOOL_NAME
            );
            const executableFunctionCalls = functionCalls.filter(
              (functionCall) =>
                functionCall.name !== REALTIME_END_CALL_TOOL_NAME
            );

            if (internalResponseModeRef.current === "end_call_closing") {
              internalResponseModeRef.current = null;
              if (status === "cancelled") {
                stopNativePlayback();
              } else {
                runAfterCurrentPlayback(() => {
                  setIsAssistantSpeaking(false);
                });
              }
              onAssistantDoneRef.current(fullText);
              onEndCallToolRef.current?.();
              break;
            }

            if (endCallRequested) {
              if (
                shouldSpeakRealtimeEndCallFallback({
                  endCallRequested,
                  responseText: fullText,
                })
              ) {
                internalResponseModeRef.current = "end_call_closing";
                requestExactSpeech(tCareer(H.callEndFallbackSpeech));
                break;
              }
              if (status === "cancelled") {
                stopNativePlayback();
              } else {
                runAfterCurrentPlayback(() => {
                  setIsAssistantSpeaking(false);
                });
              }
              onAssistantDoneRef.current(fullText);
              onEndCallToolRef.current?.();
              break;
            }

            if (executableFunctionCalls.length > 0) {
              setIsAssistantSpeaking(false);
              void handleFunctionCalls(executableFunctionCalls);
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
              runAfterCurrentPlayback(() => {
                setIsAssistantSpeaking(false);
              });
            }

            onAssistantDoneRef.current(fullText);
            break;
          }

          case "input_audio_buffer.speech_started": {
            logCareerVoiceDebug("speech.started");
            userSpeechSinceLastResponseRef.current = true;
            let preserveXaiPartialTranscript = false;
            if (tokenInfoRef.current?.provider === "xai") {
              const speechTransition = beginXaiSpeech(
                xaiTranscriptTurnRef.current
              );
              preserveXaiPartialTranscript =
                speechTransition.continuesCurrentUserTurn;
              applyXaiTranscriptTransition(speechTransition.transition);
              stopXaiPlayback();
              setIsAssistantSpeaking(false);
            }
            if (!preserveXaiPartialTranscript) {
              partialTranscriptItemIdRef.current = null;
              setPartialTranscript("");
            }
            if (interruptTimerRef.current) {
              clearTimeout(interruptTimerRef.current);
              interruptTimerRef.current = null;
            }

            onUserSpeechStartedRef.current?.({
              continuesCurrentUserTurn:
                tokenInfoRef.current?.provider === "xai" &&
                preserveXaiPartialTranscript,
              provider: tokenInfoRef.current?.provider ?? "openai",
            });
            break;
          }

          case "input_audio_buffer.speech_stopped": {
            speechStoppedAtRef.current = performance.now();
            logCareerVoiceDebug("speech.stopped");
            onUserSpeechStoppedRef.current?.();
            if (interruptTimerRef.current) {
              clearTimeout(interruptTimerRef.current);
              interruptTimerRef.current = null;
            }
            break;
          }

          case "error": {
            const error = msg.error as Record<string, unknown> | undefined;
            const errorCode = typeof error?.code === "string" ? error.code : "";
            const errorEventId =
              typeof error?.event_id === "string"
                ? error.event_id
                : typeof msg.event_id === "string"
                  ? msg.event_id
                  : "";
            const errorMessage =
              typeof error?.message === "string"
                ? error.message
                : "Realtime session error";
            if (errorCode === "response_cancel_not_active") {
              responseCancelRequestedRef.current = false;
              break;
            }
            if (
              errorEventId &&
              pendingAudioDeleteEventIdsRef.current.delete(errorEventId)
            ) {
              console.warn("[RealtimeSession] Audio prune delete ignored:", {
                code: errorCode,
                message: errorMessage,
              });
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
      applyXaiTranscriptTransition,
      completeRealtimeAudioTurnFromResponse,
      handleFunctionCalls,
      markAssistantPlaybackDone,
      markAssistantPlaybackStarted,
      queueXaiAudioDelta,
      recordRealtimeAssistantOutputItem,
      recordRealtimeUserAudioItem,
      requestExactSpeech,
      runAfterCurrentPlayback,
      scheduleXaiTranscript,
      scheduleRealtimeUsageLog,
      stopNativePlayback,
      stopXaiPlayback,
      tCareer,
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

  const startXaiAudioCapture = useCallback(
    async (webSocket: WebSocket): Promise<boolean> => {
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

        const audioContext = ensureXaiAudioContext();
        if (!audioContext) {
          cleanupMedia();
          return false;
        }
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(2048, 1, 1);
        const mute = audioContext.createGain();
        mute.gain.value = 0;

        processor.onaudioprocess = (event) => {
          if (webSocket.readyState !== WebSocket.OPEN) return;

          const input = event.inputBuffer.getChannelData(0);
          const resampled = resampleAudio(
            input,
            audioContext.sampleRate,
            XAI_AUDIO_SAMPLE_RATE
          );
          if (xaiBillingRef.current) {
            xaiBillingRef.current.inputAudioSeconds +=
              resampled.length / XAI_AUDIO_SAMPLE_RATE;
          }
          webSocket.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: encodePcm16Base64(resampled),
            })
          );
        };

        source.connect(processor);
        processor.connect(mute);
        mute.connect(audioContext.destination);
        xaiInputSourceRef.current = source;
        xaiInputProcessorRef.current = processor;
        xaiInputMuteRef.current = mute;
        return true;
      } catch (err) {
        console.error("[RealtimeSession] xAI audio capture failed:", err);
        cleanupMedia();
        return false;
      }
    },
    [cleanupMedia, ensureXaiAudioContext]
  );

  const disconnect = useCallback(() => {
    connectAttemptIdRef.current += 1;
    lastConnectFailureRef.current = null;
    pendingConnectAbortControllerRef.current?.abort();
    pendingConnectAbortControllerRef.current = null;
    pendingConnectCancelRef.current?.();
    pendingConnectCancelRef.current = null;
    connectPromiseRef.current = null;
    if (interruptTimerRef.current) {
      clearTimeout(interruptTimerRef.current);
      interruptTimerRef.current = null;
    }
    hasAudioInResponseRef.current = false;
    assistantPlaybackStartedAtRef.current = null;
    playbackDrainUntilRef.current = 0;
    clearPlaybackDrainTimers();
    flushXaiBilling("session.completed", "completed");
    cleanupTransport();
    tokenInfoRef.current = null;
    responseTextRef.current = "";
    internalResponseModeRef.current = null;
    pendingToolContinuationRef.current = null;
    responseInProgressRef.current = false;
    responseCancelRequestedRef.current = false;
    suppressCurrentResponseOutputRef.current = false;
    suppressCancelledResponseDoneRef.current = false;
    partialTranscriptItemIdRef.current = null;
    xaiTranscriptTurnRef.current = createXaiTranscriptTurnState();
    pendingResponseFunctionCallsRef.current = [];
    activeToolExecutionIdsRef.current.clear();
    setIsToolExecuting(false);
    currentResponseAssistantItemIdsRef.current = [];
    currentResponseStartedAfterUserSpeechRef.current = false;
    nextAudioDeleteEventIdRef.current = 1;
    nextAudioTurnIdRef.current = 1;
    pendingAudioDeleteEventIdsRef.current.clear();
    pendingUserAudioItemIdsRef.current = [];
    pendingUserSpeechForAudioTurnRef.current = false;
    realtimeAudioTurnsRef.current = [];
    userSpeechSinceLastResponseRef.current = false;
    setPartialTranscript("");
    setIsConnected(false);
    setIsConnecting(false);
    setConnectionStatus("disconnected");
  }, [cleanupTransport, clearPlaybackDrainTimers, flushXaiBilling]);

  const connect = useCallback(
    (options?: RealtimeConnectOptions): Promise<boolean> => {
      if (
        dataChannelRef.current?.readyState === "open" ||
        webSocketRef.current?.readyState === 1
      ) {
        return Promise.resolve(true);
      }
      if (connectPromiseRef.current) return connectPromiseRef.current;

      setIsConnecting(true);
      lastConnectFailureRef.current = null;
      const attemptId = connectAttemptIdRef.current + 1;
      connectAttemptIdRef.current = attemptId;
      const abortController =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      pendingConnectAbortControllerRef.current = abortController;

      const clearPendingConnect = () => {
        if (connectAttemptIdRef.current !== attemptId) return;
        connectPromiseRef.current = null;
        if (pendingConnectAbortControllerRef.current === abortController) {
          pendingConnectAbortControllerRef.current = null;
        }
        pendingConnectCancelRef.current = null;
        setIsConnecting(false);
      };

      const cancelPromise = new Promise<boolean>((resolve) => {
        pendingConnectCancelRef.current = () => resolve(false);
      });

      const connectWorkPromise = (async (): Promise<boolean> => {
        try {
          const tokenInfo = await fetchToken(options);
          if (!tokenInfo?.token) {
            return false;
          }
          if (connectAttemptIdRef.current !== attemptId) {
            return false;
          }
          tokenInfoRef.current = tokenInfo;

          if (tokenInfo.provider === "xai") {
            if (
              typeof WebSocket === "undefined" ||
              !tokenInfo.session ||
              !tokenInfo.model
            ) {
              lastConnectFailureRef.current = {
                code: "connection",
                message: "xAI realtime connection is not supported.",
              };
              return false;
            }

            const webSocket = new WebSocket(
              `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(
                tokenInfo.model
              )}`,
              [`xai-client-secret.${tokenInfo.token}`]
            );
            webSocketRef.current = webSocket;
            webSocket.onmessage = handleMessage;

            const opened = await new Promise<boolean>((resolve) => {
              let ready = false;
              let settled = false;
              const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                webSocket.close();
                resolve(false);
              }, 10_000);

              const settle = (ok: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve(ok);
              };

              webSocket.onopen = () => {
                logCareerVoiceDebug("xai.websocket_open", {
                  model: tokenInfo.model,
                });
                webSocket.send(
                  JSON.stringify({
                    type: "session.update",
                    session: tokenInfo.session,
                  })
                );
                beginXaiBilling();

                void startXaiAudioCapture(webSocket).then((audioOk) => {
                  if (
                    !audioOk ||
                    webSocket.readyState !== WebSocket.OPEN ||
                    connectAttemptIdRef.current !== attemptId
                  ) {
                    settle(false);
                    webSocket.close();
                    return;
                  }
                  ready = true;
                  settle(true);
                });
              };

              webSocket.onerror = () => {
                console.error("[RealtimeSession] xAI WebSocket error");
                if (!ready) settle(false);
              };

              webSocket.onclose = () => {
                if (!ready) {
                  settle(false);
                  return;
                }
                if (connectAttemptIdRef.current !== attemptId) return;
                setIsConnected(false);
                setConnectionStatus("disconnected");
                flushXaiBilling("session.disconnected", "error");
                cleanupTransport();
                onConnectionChangeRef.current(false);
                onErrorRef.current(
                  "Realtime connection lost. Falling back to text mode."
                );
              };
            });

            if (!opened || connectAttemptIdRef.current !== attemptId) {
              cleanupTransport();
              return false;
            }

            setIsConnected(true);
            setConnectionStatus("connected");
            onConnectionChangeRef.current(true);
            return true;
          }

          if (typeof RTCPeerConnection === "undefined") {
            lastConnectFailureRef.current = {
              code: "connection",
              message: "Realtime connection is not supported.",
            };
            return false;
          }

          // TODO: Replace this direct OpenAI Realtime WebRTC connection with a
          // LiveKit-based STT -> LLM -> TTS WebRTC architecture.
          const peerConnection = new RTCPeerConnection();
          peerConnectionRef.current = peerConnection;

          peerConnection.ontrack = (event) => {
            const audio = ensureRemoteAudioElement();
            if (!audio) return;

            const stream = event.streams[0] ?? new MediaStream([event.track]);
            remoteStreamRef.current = stream;
            audio.srcObject = stream;
            void audio.play().catch((error) => {
              console.warn(
                "[RealtimeSession] Remote audio play failed:",
                error
              );
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
              signal: abortController?.signal,
              headers: {
                Authorization: `Bearer ${tokenInfo.token}`,
                "Content-Type": "application/sdp",
              },
            }
          );

          if (connectAttemptIdRef.current !== attemptId) {
            cleanupTransport();
            return false;
          }

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
          if (
            abortController?.signal.aborted ||
            connectAttemptIdRef.current !== attemptId
          ) {
            return false;
          }
          console.error("[RealtimeSession] Connect error:", err);
          lastConnectFailureRef.current = {
            code: "connection",
            message:
              err instanceof Error
                ? err.message
                : "Failed to connect realtime session.",
          };
          cleanupTransport();
          setIsConnected(false);
          setConnectionStatus("disconnected");
          onConnectionChangeRef.current(false);
          return false;
        } finally {
          clearPendingConnect();
        }
      })();
      const connectPromise = Promise.race([connectWorkPromise, cancelPromise]);

      connectPromiseRef.current = connectPromise;
      return connectPromise;
    },
    [
      beginXaiBilling,
      cleanupTransport,
      ensureRemoteAudioElement,
      fetchToken,
      flushXaiBilling,
      handleMessage,
      startAudioCapture,
      startXaiAudioCapture,
    ]
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const sendTextMessage = useCallback(
    (text: string) => {
      responseTextRef.current = "";
      if (tokenInfoRef.current?.provider === "xai" && xaiBillingRef.current) {
        xaiBillingRef.current.textInputEventCount += 1;
      }
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
      const xaiAudioContext = ensureXaiAudioContext();
      if (xaiAudioContext?.state === "suspended") {
        void xaiAudioContext.resume().catch((error) => {
          console.warn(
            "[RealtimeSession] xAI audio playback unlock failed:",
            error
          );
        });
      }

      const audio = ensureRemoteAudioElement();
      if (!audio) return;
      void audio.play().catch((error) => {
        console.warn("[RealtimeSession] Audio playback unlock failed:", error);
      });
    } catch (error) {
      console.warn("[RealtimeSession] Audio playback prime failed:", error);
    }
  }, [ensureRemoteAudioElement, ensureXaiAudioContext]);

  /** Update the Realtime session instructions (e.g., on interview step transition) */
  const updateSessionInstructions = useCallback(
    (instructions: string) => {
      sendEvent({
        type: "session.update",
        session:
          tokenInfoRef.current?.provider === "xai"
            ? { instructions }
            : { type: "realtime", instructions },
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

  const getLastConnectFailure = useCallback(
    () => lastConnectFailureRef.current,
    []
  );

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
