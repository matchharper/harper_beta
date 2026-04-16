import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerMessage,
  CareerMessagePayload,
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
  persistedMessages: CareerMessage[];
  onMessagesChanged?: (messages: CareerMessagePayload[]) => void | Promise<void>;
};

const mergeMessages = (
  persistedMessages: CareerMessage[],
  localMessages: CareerMessage[]
) => {
  if (localMessages.length === 0) return persistedMessages;

  const merged = [...persistedMessages];
  const persistedIndexById = new Map<string, number>();

  for (let index = 0; index < persistedMessages.length; index += 1) {
    persistedIndexById.set(String(persistedMessages[index].id), index);
  }

  for (const message of localMessages) {
    const id = String(message.id);
    const existingIndex = persistedIndexById.get(id);
    if (typeof existingIndex === "number") {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...message,
      };
      continue;
    }

    persistedIndexById.set(id, merged.length);
    merged.push(message);
  }

  return merged;
};

const replaceMessageById = (
  messages: CareerMessage[],
  targetId: string | number,
  nextMessage: CareerMessage
) => {
  const targetKey = String(targetId);
  const nextIndex = messages.findIndex(
    (message) => String(message.id) === targetKey
  );

  if (nextIndex < 0) {
    return [...messages, nextMessage];
  }

  const nextMessages = [...messages];
  nextMessages[nextIndex] = nextMessage;
  return nextMessages;
};

export const useCareerChat = ({
  user,
  conversationId,
  sessionPending,
  fetchWithAuth,
  persistedMessages,
  onMessagesChanged,
}: UseCareerChatArgs) => {
  const [stage, setStage] = useState<CareerStage>("profile");
  const [localMessages, setLocalMessages] = useState<CareerMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [scrollTick, setScrollTick] = useState(0);

  const typingQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (persistedMessages.length === 0) return;

    const persistedIds = new Set(
      persistedMessages.map((message) => String(message.id))
    );

    setLocalMessages((prev) =>
      prev.filter((message) => {
        if (message.typing) return true;
        return !persistedIds.has(String(message.id));
      })
    );
  }, [persistedMessages]);

  const enqueueAssistantTypewriter = useCallback((message: CareerMessage) => {
    typingQueueRef.current = typingQueueRef.current.then(async () => {
      if (!mountedRef.current) return;

      setAssistantTyping(true);
      const id = String(message.id);
      setLocalMessages((prev) => [
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
        setLocalMessages((prev) =>
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

      setLocalMessages((prev) =>
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
    setLocalMessages([]);
  }, []);

  const appendMessage = useCallback((message: CareerMessage) => {
    setLocalMessages((prev) => [...prev, message]);
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
      setLocalMessages((prev) => [
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

        setLocalMessages((prev) =>
          replaceMessageById(prev, tempId, toUiMessage(payload.userMessage))
        );
        await enqueueAssistantTypewriter(toUiMessage(payload.assistantMessage));
        setScrollTick((t) => t + 1);
        await onMessagesChanged?.([
          payload.userMessage as CareerMessagePayload,
          payload.assistantMessage as CareerMessagePayload,
        ]);

        if (payload?.progress?.completed) {
          setStage("completed");
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "메시지 전송 중 오류가 발생했습니다.";
        setLocalMessages((prev) => prev.filter((item) => item.id !== tempId));
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
      onMessagesChanged,
    ]
  );

  const messages = useMemo(
    () => mergeMessages(persistedMessages, localMessages),
    [localMessages, persistedMessages]
  );

  const resetChatState = useCallback(() => {
    setStage("profile");
    setLocalMessages([]);
    setChatPending(false);
    setChatError("");
    setAssistantTyping(false);
  }, []);

  return {
    stage,
    setStage,
    messages,
    scrollTick,
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
