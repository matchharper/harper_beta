"use client";

import { useCallback, useRef, useState } from "react";
import {
  OpenAIRealtimeClient,
  OpenAIRealtimeCallbacks,
} from "@/lib/stt/createSttSocket";

type LanguageCode = string;

type UseOpenAIRealtimeSttOptions = {
  token: string; // ephemeral token from your backend
  languageCode: LanguageCode;
};

export const useOpenAIRealtimeStt = (opts: UseOpenAIRealtimeSttOptions) => {
  const [partialTranscript, setPartialTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const clientRef = useRef<OpenAIRealtimeClient | null>(null);

  const ensureClient = useCallback(() => {
    if (clientRef.current) return clientRef.current;

    const callbacks: OpenAIRealtimeCallbacks = {
      onDelta: (text) => {
        setPartialTranscript(text);
      },
      onFinal: (text) => {
        setFinalTranscript((prev) => (prev ? `${prev}\n${text}` : text));
        setPartialTranscript("");
      },
      onError: (err) => {
        console.error("Realtime STT error:", err);
      },
      onClose: () => {
        setIsConnected(false);
      },
    };

    const client = new OpenAIRealtimeClient({
      token: opts.token,
      callbacks,
    });

    clientRef.current = client;
    return client;
  }, [opts.token]);

  const start = useCallback(async () => {
    const client = ensureClient();
    await client.start(opts.languageCode);
    setIsConnected(true);
  }, [ensureClient, opts.languageCode]);

  const sendAudio = useCallback((base64Audio: string) => {
    clientRef.current?.sendAudio(base64Audio);
  }, []);

  const sendAudioStreamEnd = useCallback(() => {
    clientRef.current?.sendAudioStreamEnd();
  }, []);

  const stop = useCallback(() => {
    clientRef.current?.stop();
    clientRef.current = null;
    setIsConnected(false);
  }, []);

  const onSendingMic = useCallback(() => {
    clientRef.current?.onSendingMic();
  }, []);

  const offSendingMic = useCallback(() => {
    clientRef.current?.offSendingMic();
  }, []);

  return {
    isConnected,
    partialTranscript,
    finalTranscript,
    start,
    sendAudio,
    sendAudioStreamEnd,
    stop,
    onSendingMic,
    offSendingMic,
  };
};
