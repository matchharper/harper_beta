"use client";

import { showToast } from "@/components/toast/toast";
import { useEffect, useRef, useState } from "react";

type CallStatus = "idle" | "calling" | "ended";
type ConversationMode = "greeting" | "followup";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

const DEFAULT_GREETING = "하퍼입니다. 오디오나 마이크는 괜찮으신가요?";
const FOLLOW_UP_FALLBACKS = [
  "좋아요. 최근에 가장 몰입해서 했던 일이나 프로젝트를 짧게 말씀해 주세요.",
  "좋습니다. 다음으로, 어떤 역할이나 회사 환경을 가장 선호하는지도 알려주세요.",
  "알겠습니다. 지금 시점에서 가장 중요하게 보는 조건이 무엇인지도 말씀해 주세요.",
  "좋아요. 이어서 더 강조하고 싶은 강점이나 원하는 조건이 있다면 자유롭게 말씀해 주세요.",
];

const NO_OP_SEND_AUDIO = () => {};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const getRecognitionConstructor = (): SpeechRecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
};

const getFallbackFollowUp = (conversationHistory: string) => {
  const userTurnCount = conversationHistory
    .split("\n")
    .filter((line) => line.startsWith("User:")).length;

  return FOLLOW_UP_FALLBACKS[
    Math.min(userTurnCount, FOLLOW_UP_FALLBACKS.length - 1)
  ];
};

const requestAssistantText = async ({
  mode,
  conversationHistory,
}: {
  mode: ConversationMode;
  conversationHistory?: string;
}) => {
  try {
    const res = await fetch("/api/call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode,
        conversationHistory,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch call response: ${res.status}`);
    }

    const data = (await res.json()) as { text?: string };
    if (typeof data.text === "string" && data.text.trim().length > 0) {
      return data.text.trim();
    }
  } catch (error) {
    console.error("[useConversation] requestAssistantText failed", error);
  }

  if (mode === "greeting") {
    return DEFAULT_GREETING;
  }

  return getFallbackFollowUp(conversationHistory ?? "");
};

export const useConversation = (
  startMicRecording: (
    sendAudio: (pcm16: any) => void,
    changeIsRecording?: boolean
  ) => Promise<void> | void,
  stopMicCompletely: (changeIsRecording?: boolean) => void
) => {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [userTranscripts, setUserTranscripts] = useState<string[]>([]);
  const [assistantTexts, setAssistantTexts] = useState<string[]>([]);
  const [harperSaying, setHarperSaying] = useState<string>("");
  const [userTranscript, setUserTranscript] = useState<string>("");
  const [isPlayingTts, setIsPlayingTts] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const liveTranscriptRef = useRef("");
  const finalTranscriptRef = useRef("");
  const callScriptRef = useRef("");
  const callStartTimeRef = useRef(0);
  const isListeningRef = useRef(false);
  const callStatusRef = useRef<CallStatus>("idle");
  const isMutedRef = useRef(false);
  const isPlayingTtsRef = useRef(false);
  const activeSpeechIdRef = useRef(0);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isPlayingTtsRef.current = isPlayingTts;
  }, [isPlayingTts]);

  const syncTranscript = (value: string) => {
    liveTranscriptRef.current = value;
    setUserTranscript(value);
  };

  const stopSpeech = () => {
    activeSpeechIdRef.current += 1;
    setIsPlayingTts(false);
    setHarperSaying("");

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const stopListening = async () => {
    if (recognitionRef.current && isListeningRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error("[useConversation] stop recognition failed", error);
      }
    }

    isListeningRef.current = false;
    stopMicCompletely();
    await wait(250);
  };

  const ensureRecognition = () => {
    if (recognitionRef.current) {
      return recognitionRef.current;
    }

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      return null;
    }

    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let nextFinal = "";
      let nextInterim = "";

      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript?.trim();

        if (!transcript) continue;

        if (result.isFinal) {
          nextFinal += ` ${transcript}`;
        } else {
          nextInterim += ` ${transcript}`;
        }
      }

      finalTranscriptRef.current = nextFinal.trim();
      syncTranscript(
        [finalTranscriptRef.current, nextInterim.trim()]
          .filter(Boolean)
          .join(" ")
          .trim()
      );
    };

    recognition.onerror = (event) => {
      if (event.error && event.error !== "no-speech") {
        showToast({
          message: `음성 인식 오류: ${event.error}`,
          variant: "error",
        });
      }
    };

    recognition.onend = () => {
      isListeningRef.current = false;
    };

    recognitionRef.current = recognition;
    return recognition;
  };

  const startListening = async () => {
    if (isMutedRef.current) return;

    const recognition = ensureRecognition();
    if (!recognition) {
      showToast({
        message: "이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 계열에서 테스트해 주세요.",
        variant: "white",
      });
      return;
    }

    finalTranscriptRef.current = "";
    syncTranscript("");

    try {
      await startMicRecording(NO_OP_SEND_AUDIO);
    } catch (error) {
      console.error("[useConversation] mic recorder failed", error);
      showToast({
        message: "마이크 접근에 실패했습니다.",
        variant: "error",
      });
    }

    if (isListeningRef.current) return;

    try {
      recognition.start();
      isListeningRef.current = true;
    } catch (error) {
      const isInvalidStateError =
        error instanceof DOMException && error.name === "InvalidStateError";

      if (!isInvalidStateError) {
        stopMicCompletely();
        console.error("[useConversation] start recognition failed", error);
        showToast({
          message: "음성 인식을 시작하지 못했습니다.",
          variant: "error",
        });
      }
    }
  };

  const speakAssistantText = async (text: string) => {
    const speechId = activeSpeechIdRef.current + 1;
    activeSpeechIdRef.current = speechId;

    setIsThinking(false);
    setHarperSaying(text);

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setAssistantTexts((prev) => [...prev, text]);
      setHarperSaying("");

      if (callStatusRef.current === "calling" && !isMutedRef.current) {
        await startListening();
      }
      return;
    }

    window.speechSynthesis.cancel();

    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ko-KR";
      utterance.rate = 1.05;
      utterance.pitch = 1;

      utterance.onstart = () => {
        if (speechId !== activeSpeechIdRef.current) {
          resolve();
          return;
        }

        setIsPlayingTts(true);
      };

      utterance.onend = async () => {
        if (speechId !== activeSpeechIdRef.current) {
          resolve();
          return;
        }

        setIsPlayingTts(false);
        setAssistantTexts((prev) => [...prev, text]);
        setHarperSaying("");

        if (callStatusRef.current === "calling" && !isMutedRef.current) {
          await startListening();
        }

        resolve();
      };

      utterance.onerror = () => {
        if (speechId === activeSpeechIdRef.current) {
          setIsPlayingTts(false);
          setAssistantTexts((prev) => [...prev, text]);
          setHarperSaying("");
        }
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  const startCall = async () => {
    await stopListening();
    stopSpeech();

    setCallStatus("calling");
    setUserTranscripts([]);
    setAssistantTexts([]);
    setIsThinking(false);
    setIsMuted(false);
    finalTranscriptRef.current = "";
    syncTranscript("");

    callStartTimeRef.current = performance.now();
    callScriptRef.current = "";

    const greeting = await requestAssistantText({ mode: "greeting" });
    callScriptRef.current += `Harper: ${greeting}\n`;
    await speakAssistantText(greeting);
  };

  const startTest = async () => {
    await stopListening();
    stopSpeech();
    finalTranscriptRef.current = "";
    syncTranscript("");
    await startListening();
  };

  const endTest = async () => {
    await stopListening();
    return liveTranscriptRef.current;
  };

  const endCall = async () => {
    setCallStatus("ended");
    await stopListening();
    stopSpeech();

    const remainingTranscript = liveTranscriptRef.current.trim();
    if (remainingTranscript) {
      callScriptRef.current += `User: ${remainingTranscript}\n`;
    }

    return {
      script: callScriptRef.current,
      callTime: performance.now() - callStartTimeRef.current,
    };
  };

  const toggleMute = async () => {
    if (isMutedRef.current) {
      setIsMuted(false);

      if (callStatusRef.current === "calling" && !isPlayingTtsRef.current) {
        await startListening();
      }
      return;
    }

    setIsMuted(true);
    await stopListening();
  };

  const sendAudioCommit = async () => {
    await stopListening();

    const currentUserTranscript = liveTranscriptRef.current.trim();
    if (!currentUserTranscript) {
      showToast({
        message: "인식된 음성이 없습니다.",
        variant: "white",
      });

      if (callStatusRef.current === "calling" && !isMutedRef.current) {
        await startListening();
      }
      return;
    }

    setUserTranscripts((prev) => [...prev, currentUserTranscript]);
    callScriptRef.current += `User: ${currentUserTranscript}\n`;

    finalTranscriptRef.current = "";
    syncTranscript("");
    setIsThinking(true);

    const question = await requestAssistantText({
      mode: "followup",
      conversationHistory: callScriptRef.current,
    });

    callScriptRef.current += `Harper: ${question}\n`;
    await speakAssistantText(question);
  };

  useEffect(() => {
    return () => {
      stopMicCompletely();

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (error) {
          console.error("[useConversation] abort recognition failed", error);
        }
      }
    };
  }, [stopMicCompletely]);

  return {
    isPlayingTts,
    isMuted,
    userTranscripts,
    isThinking,
    assistantTexts,
    callStatus,
    harperSaying,
    startCall,
    sendAudioCommit,
    endCall,
    userTranscript,
    toggleMute,
    startTest,
    endTest,
  };
};
