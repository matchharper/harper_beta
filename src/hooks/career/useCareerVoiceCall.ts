import { useCallback, useEffect, useRef, useState } from "react";
import { OpenAIRealtimeClient } from "@/lib/stt/createSttSocket";
import {
  resampleLinearMono,
  floatTo16BitPCM,
  int16ToBase64,
  TARGET_SR,
} from "@/utils/audio";
import { VOICE_CALL_GREETING } from "@/lib/voice/systemPrompt";

export type VoiceCallStatus =
  | "idle"
  | "connecting"
  | "active"
  | "ending"
  | "ended";

type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

const SILENCE_TIMEOUT_MS = 30_000;

function playAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("오디오 재생에 실패했습니다."));
    };
    audio.play().catch(reject);
  });
}

export function useCareerVoiceCall() {
  const [voiceCallStatus, setVoiceCallStatus] =
    useState<VoiceCallStatus>("idle");
  const [voiceCallDuration, setVoiceCallDuration] = useState(0);
  const [voiceCallError, setVoiceCallError] = useState<string | null>(null);
  const [voiceChatTranscript, setVoiceChatTranscript] = useState<
    ConversationTurn[]
  >([]);

  const sttClientRef = useRef<OpenAIRealtimeClient | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationRef = useRef<ConversationTurn[]>([]);
  const isTurnInProgressRef = useRef(false);
  const isEndingRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const fetchWithAuthRef = useRef<((url: string, init?: RequestInit) => Promise<Response>) | null>(null);

  // Args passed to startVoiceCall, stored for use during the session
  const sessionArgsRef = useRef<{
    userId: string;
    conversationId: string;
    existingInsightsContext?: string;
    fetchWithAuth?: (url: string, init?: RequestInit) => Promise<Response>;
  } | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(
    (onTimeout: () => void) => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      silenceTimerRef.current = setTimeout(onTimeout, SILENCE_TIMEOUT_MS);
    },
    []
  );

  const cleanupResources = useCallback(() => {
    // Stop STT
    try {
      sttClientRef.current?.stop();
    } catch {
      // silent
    }
    sttClientRef.current = null;

    // Stop processor
    try {
      processorRef.current?.disconnect();
    } catch {
      // silent
    }
    processorRef.current = null;

    // Stop media stream
    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      // silent
    }
    mediaStreamRef.current = null;

    // Close audio context
    try {
      audioContextRef.current?.close();
    } catch {
      // silent
    }
    audioContextRef.current = null;

    clearTimers();
  }, [clearTimers]);

  const doFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      if (fetchWithAuthRef.current) {
        return fetchWithAuthRef.current(url, init);
      }
      return fetch(url, init);
    },
    []
  );

  const endVoiceCall = useCallback(async () => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    setVoiceCallStatus("ending");

    cleanupResources();

    const args = sessionArgsRef.current;
    if (args) {
      const transcript = conversationRef.current
        .map(
          (t) =>
            `${t.role === "user" ? "사용자" : "하퍼"}: ${t.content}`
        )
        .join("\n");

      const durationSeconds = Math.round(
        (Date.now() - startTimeRef.current) / 1000
      );

      try {
        await doFetch("/api/voice/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: args.conversationId,
            transcript,
            durationSeconds,
          }),
        });
      } catch (err) {
        console.error("[VoiceCall] Failed to save transcript:", err);
      }
    }

    setVoiceCallStatus("ended");
  }, [cleanupResources, doFetch]);

  const startVoiceCall = useCallback(
    async (args: {
      userId: string;
      conversationId: string;
      existingInsightsContext?: string;
      fetchWithAuth?: (url: string, init?: RequestInit) => Promise<Response>;
    }) => {
      setVoiceCallStatus("connecting");
      setVoiceCallError(null);
      setVoiceCallDuration(0);
      conversationRef.current = [];
      setVoiceChatTranscript([]);
      isTurnInProgressRef.current = false;
      isEndingRef.current = false;
      sessionArgsRef.current = args;
      startTimeRef.current = Date.now();

      if (args.fetchWithAuth) {
        fetchWithAuthRef.current = args.fetchWithAuth;
      }

      try {
        // 1. Get ephemeral STT token
        const tokenRes = await doFetch("/api/voice/stt-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!tokenRes.ok) {
          throw new Error("STT 토큰 발급에 실패했습니다.");
        }
        const { token } = await tokenRes.json();

        // 2. Request microphone
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              sampleRate: TARGET_SR,
            },
          });
        } catch (micErr) {
          const msg =
            micErr instanceof Error ? micErr.message : String(micErr);
          if (
            msg.includes("Permission") ||
            msg.includes("NotAllowed") ||
            msg.includes("microphone")
          ) {
            throw new Error(
              "마이크 권한이 필요합니다. 브라우저 설정에서 마이크를 허용해 주세요."
            );
          }
          throw new Error("마이크를 사용할 수 없습니다.");
        }
        mediaStreamRef.current = stream;

        // 3. Create AudioContext
        const audioCtx = new AudioContext({ sampleRate: TARGET_SR });
        audioContextRef.current = audioCtx;

        // 4. Create STT client with ephemeral token
        const sttClient = new OpenAIRealtimeClient({
          token,
          callbacks: {
            onFinal: async (text: string) => {
              // Guard: skip if turn in progress, ending, or garbage text
              if (isTurnInProgressRef.current || isEndingRef.current) return;
              if (!text || !text.trim()) return;

              isTurnInProgressRef.current = true;
              resetSilenceTimer(() => void endVoiceCall());

              try {
                // Add user turn
                conversationRef.current.push({
                  role: "user",
                  content: text.trim(),
                });
                setVoiceChatTranscript([...conversationRef.current]);

                // Call LLM
                const turnCount = conversationRef.current.filter(
                  (t) => t.role === "user"
                ).length;
                const durationSeconds = Math.round(
                  (Date.now() - startTimeRef.current) / 1000
                );
                const chatRes = await doFetch("/api/voice/chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    conversationId: args.conversationId,
                    userText: text.trim(),
                    conversationHistory: conversationRef.current.slice(0, -1),
                    existingInsightsContext: args.existingInsightsContext,
                    turnCount,
                    durationSeconds,
                  }),
                });

                if (!chatRes.ok) {
                  throw new Error("LLM 응답 생성에 실패했습니다.");
                }
                const { assistantText, shouldEnd } = await chatRes.json();

                // Add assistant turn
                conversationRef.current.push({
                  role: "assistant",
                  content: assistantText,
                });
                setVoiceChatTranscript([...conversationRef.current]);

                // Call TTS
                const ttsRes = await doFetch("/api/tts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text: assistantText }),
                });

                if (!ttsRes.ok) {
                  throw new Error("음성 합성에 실패했습니다.");
                }

                const audioBlob = await ttsRes.blob();
                await playAudioBlob(audioBlob);

                // Auto-end call if LLM signaled conversation is complete
                if (shouldEnd) {
                  console.log("[VoiceCall] LLM signaled end of conversation, auto-ending");
                  isTurnInProgressRef.current = false;
                  void endVoiceCall();
                  return;
                }
              } catch (err) {
                console.error("[VoiceCall] Turn error:", err);
                // Don't set error state for individual turn failures
                // The conversation can continue
              } finally {
                isTurnInProgressRef.current = false;
              }
            },
            onError: (err) => {
              console.error("[VoiceCall] STT error:", err);
              setVoiceCallError("음성 인식 중 오류가 발생했습니다.");
            },
            onClose: () => {
              if (!isEndingRef.current) {
                // Unexpected close — trigger end
                void endVoiceCall();
              }
            },
          },
        });
        sttClientRef.current = sttClient;

        // 5. Connect STT WebSocket
        await sttClient.start("ko");

        // 6. Wire up audio capture
        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (!sttClient.isConnected()) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const resampled = resampleLinearMono(
            inputData,
            audioCtx.sampleRate,
            TARGET_SR
          );
          const pcm16 = floatTo16BitPCM(resampled);
          const base64 = int16ToBase64(pcm16);
          sttClient.sendAudio(base64);
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);

        // 7. Start duration timer
        setVoiceCallStatus("active");
        timerRef.current = setInterval(() => {
          setVoiceCallDuration((prev) => prev + 1);
        }, 1000);

        // 8. Play greeting message via TTS
        try {
          isTurnInProgressRef.current = true;
          conversationRef.current.push({
            role: "assistant",
            content: VOICE_CALL_GREETING,
          });
          setVoiceChatTranscript([...conversationRef.current]);
          const greetingTts = await doFetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: VOICE_CALL_GREETING }),
          });
          if (greetingTts.ok) {
            const greetingBlob = await greetingTts.blob();
            await playAudioBlob(greetingBlob);
          }
        } catch (err) {
          console.error("[VoiceCall] Greeting TTS error:", err);
        } finally {
          isTurnInProgressRef.current = false;
        }

        // 9. Start silence timer
        resetSilenceTimer(() => void endVoiceCall());
      } catch (err) {
        cleanupResources();
        const message =
          err instanceof Error ? err.message : "음성 통화 연결에 실패했습니다.";
        setVoiceCallError(message);
        setVoiceCallStatus("idle");
      }
    },
    [cleanupResources, doFetch, endVoiceCall, resetSilenceTimer]
  );

  const dismissVoiceCall = useCallback(() => {
    setVoiceCallStatus("idle");
    setVoiceCallDuration(0);
    setVoiceCallError(null);
    conversationRef.current = [];
    setVoiceChatTranscript([]);
    sessionArgsRef.current = null;
    isEndingRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, [cleanupResources]);

  return {
    voiceCallStatus,
    voiceCallDuration,
    voiceCallError,
    voiceChatTranscript,
    startVoiceCall,
    endVoiceCall,
    dismissVoiceCall,
  };
}
