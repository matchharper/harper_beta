import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerMessage,
  CareerStage,
  SessionResponse,
} from "@/components/career/types";
import {
  getErrorMessage,
  sleep,
  toUiMessage,
} from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";

type SendChatArgs = {
  text: string;
  link?: string;
  onError?: () => void;
};

type SendChatOptions = {
  profilePending?: boolean;
};

type UseCareerChatArgs = {
  user: User | null;
  conversationId: string | null;
  sessionPending: boolean;
  fetchWithAuth: FetchWithAuth;
};

export const useCareerChat = ({
  user,
  conversationId,
  sessionPending,
  fetchWithAuth,
}: UseCareerChatArgs) => {
  const [stage, setStage] = useState<CareerStage>("profile");
  const [messages, setMessages] = useState<CareerMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [assistantTyping, setAssistantTyping] = useState(false);

  const typingQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const enqueueAssistantTypewriter = useCallback((message: CareerMessage) => {
    typingQueueRef.current = typingQueueRef.current.then(async () => {
      if (!mountedRef.current) return;

      setAssistantTyping(true);
      const id = String(message.id);
      setMessages((prev) => [
        ...prev,
        {
          ...message,
          content: "",
          typing: true,
        },
      ]);

      const fullText = message.content;
      const delay = Math.max(
        10,
        Math.min(28, Math.floor(1700 / Math.max(fullText.length, 30)))
      );
      for (let index = 1; index <= fullText.length; index += 1) {
        if (!mountedRef.current) return;
        await sleep(delay);
        setMessages((prev) =>
          prev.map((item) =>
            String(item.id) === id
              ? {
                  ...item,
                  content: fullText.slice(0, index),
                }
              : item
          )
        );
      }

      setMessages((prev) =>
        prev.map((item) =>
          String(item.id) === id
            ? {
                ...item,
                content: fullText,
                typing: false,
              }
            : item
        )
      );
      setAssistantTyping(false);
    });

    return typingQueueRef.current;
  }, []);

  const applySessionConversation = useCallback((payload: SessionResponse) => {
    setStage(payload.conversation.stage);
    setMessages(payload.messages.map(toUiMessage));
  }, []);

  const appendMessage = useCallback((message: CareerMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const sendChatMessage = useCallback(
    async (args: SendChatArgs, options?: SendChatOptions) => {
      if (
        !user ||
        !conversationId ||
        sessionPending ||
        stage === "profile" ||
        options?.profilePending ||
        chatPending ||
        assistantTyping
      ) {
        return;
      }

      const text = args.text.trim();
      const link = (args.link ?? "").trim();
      if (!text) return;

      const composed = link ? `${text}\n\n참고 링크: ${link}` : text;
      const tempId = `temp-user-${Date.now()}`;
      const nowIso = new Date().toISOString();

      setChatError("");
      setChatPending(true);
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          role: "user",
          content: composed,
          messageType: "chat",
          createdAt: nowIso,
        },
      ]);

      try {
        const response = await fetchWithAuth("/api/talent/chat", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            message: text,
            link,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(getErrorMessage(payload, "메시지 전송에 실패했습니다."));
        }

        setMessages((prev) => [
          ...prev.filter((item) => item.id !== tempId),
          toUiMessage(payload.userMessage),
        ]);
        await enqueueAssistantTypewriter(toUiMessage(payload.assistantMessage));

        if (payload?.progress?.completed) {
          setStage("completed");
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "메시지 전송 중 오류가 발생했습니다.";
        setMessages((prev) => prev.filter((item) => item.id !== tempId));
        setChatError(message);
        args.onError?.();
      } finally {
        setChatPending(false);
      }
    },
    [
      assistantTyping,
      chatPending,
      conversationId,
      enqueueAssistantTypewriter,
      fetchWithAuth,
      sessionPending,
      stage,
      user,
    ]
  );

  const resetChatState = useCallback(() => {
    setStage("profile");
    setMessages([]);
    setChatPending(false);
    setChatError("");
    setAssistantTyping(false);
  }, []);

  return {
    stage,
    setStage,
    messages,
    appendMessage,
    chatPending,
    chatError,
    setChatError,
    assistantTyping,
    enqueueAssistantTypewriter,
    applySessionConversation,
    sendChatMessage,
    resetChatState,
  };
};
