// src/lib/stt/openaiRealtimeClient.ts
/* eslint-disable no-console */
import { logger } from "@/utils/logger";

export type STTTarget = "speaker" | "mic"; // 기존 타입과 맞춰서 쓰면 됨

export type OpenAIRealtimeCallbacks = {
  onDelta?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (err: Event | Error) => void;
  onClose?: () => void;
};

type LanguageCode = string; // 필요하면 기존 LANGUAGE_CODE로 교체

export class OpenAIRealtimeClient {
  private socket: WebSocket | null = null;
  private heartbeatId: number | null = null;

  private isSendingMicAudio = false;

  private readonly model: string;
  private readonly token: string;
  private readonly callbacks: OpenAIRealtimeCallbacks;

  constructor(opts: {
    token: string; // ephemeral token or insecure api key
    callbacks?: OpenAIRealtimeCallbacks;
  }) {
    this.token = opts.token;
    this.model = "gpt-4o-mini-realtime-preview";
    this.callbacks = opts.callbacks ?? {};
  }

  start(languageCode: LanguageCode): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const wsUrl = `wss://api.openai.com/v1/realtime?intent=transcription`;

      // BEST PRACTICE:
      // token should be an ephemeral key generated on your server.
      // For insecure dev use you can also use: openai-insecure-api-key.<API_KEY>
      const protocols = [
        "realtime",
        `openai-insecure-api-key.${this.token}`,
        "openai-beta.realtime-v1",
      ];

      const socket = new WebSocket(wsUrl, protocols);
      this.socket = socket;

      socket.onopen = () => {
        const initMsg = {
          type: "transcription_session.update",
          session: {
            input_audio_format: "pcm16",
            input_audio_transcription: {
              model: "whisper-1",
              prompt: "Just transcribe the audio in Korean.",
              language: "ko",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.4,
              prefix_padding_ms: 300,
              silence_duration_ms: 100,
            },
            input_audio_noise_reduction: { type: "near_field" },
          },
        };

        socket.send(JSON.stringify(initMsg));

        resolve();
      };

      socket.onerror = (event) => {
        console.error("Realtime socket error:", event);
        this.callbacks.onError?.(event);
        reject(event);
      };

      socket.onclose = () => {
        logger.log("Realtime socket closed");
        if (this.heartbeatId !== null) {
          window.clearInterval(this.heartbeatId);
          this.heartbeatId = null;
        }
        this.socket = null;
        this.callbacks.onClose?.();
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          logger.log("msg", msg);
          //   if (msg.delta && msg.delta !== "" && msg.delta !== undefined) {
          //     this.callbacks.onDelta?.(msg.delta);
          //   }

          if (
            msg.type === "conversation.item.input_audio_transcription.completed"
          ) {
            // Some payloads have msg.text, some have msg.output_text or similar.
            const text = msg.transcript;
            this.callbacks.onFinal?.(text);
          }
        } catch (e) {
          console.error("Failed to parse realtime message:", e);
        }
      };
    });
  }

  sendAudio(base64Audio: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    this.socket.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64Audio,
      })
    );
  }

  sendAudioStreamEnd() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    logger.log("sendAudioStreamEnd");
    this.socket.send(
      JSON.stringify({
        type: "input_audio_buffer.commit",
      })
    );
    this.socket.send(
      JSON.stringify({
        type: "response.create",
      })
    );
  }

  onSendingMic() {
    this.isSendingMicAudio = true;
  }

  offSendingMic() {
    this.isSendingMicAudio = false;
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  stop() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: "session.close",
        })
      );
      this.socket.close();
    }
    this.socket = null;

    if (this.heartbeatId !== null) {
      window.clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }
  }
}
