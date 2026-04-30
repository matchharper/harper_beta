import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerMessage,
  CareerMessagePayload,
  CareerOpportunityRun,
  CareerStage,
  SessionResponse,
} from "@/components/career/types";
import { getErrorMessage, sleep, toUiMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";

type SendChatArgs = {
  text: string;
  link?: string;
  onError?: () => void;
};

type SendChatOptions = {
  profilePending?: boolean;
};

type CareerChatStreamEvent = {
  data: unknown;
  event: string;
};

type UseCareerChatArgs = {
  user: User | null;
  conversationId: string | null;
  sessionPending: boolean;
  fetchWithAuth: FetchWithAuth;
  onOpportunityRunChanged?: (run: CareerOpportunityRun | null) => void;
  persistedMessages: CareerMessage[];
  onMessagesChanged?: (
    messages: CareerMessagePayload[]
  ) => void | Promise<void>;
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

  return merged.sort(compareCareerMessages);
};

const compareCareerMessages = (left: CareerMessage, right: CareerMessage) => {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    if (leftTime !== rightTime) return leftTime - rightTime;
  }

  const leftId = typeof left.id === "number" ? left.id : Number(left.id);
  const rightId = typeof right.id === "number" ? right.id : Number(right.id);

  if (Number.isFinite(leftId) && Number.isFinite(rightId)) {
    return leftId - rightId;
  }

  return 0;
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

const parseSseEvent = (rawEvent: string): CareerChatStreamEvent | null => {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  const rawData = dataLines.join("\n").trim();
  if (!rawData) return { event, data: null };

  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: rawData };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const isCareerMessagePayload = (
  value: unknown
): value is CareerMessagePayload =>
  isRecord(value) &&
  typeof value.id === "number" &&
  (value.role === "user" || value.role === "assistant") &&
  typeof value.content === "string";

const toStreamMessagePayload = (
  value: unknown
): CareerMessagePayload | null => {
  if (!isCareerMessagePayload(value)) return null;
  return value;
};

export const useCareerChat = ({
  user,
  conversationId,
  sessionPending,
  fetchWithAuth,
  onOpportunityRunChanged,
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

      let pendingAssistantMessageId: string | null = null;

      try {
        const response = await fetchWithAuth("/api/talent/chat", {
          method: "POST",
          headers: {
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            conversationId,
            message: text,
            link,
          }),
        });

        const contentType = response.headers.get("content-type") ?? "";
        if (
          response.ok &&
          response.body &&
          contentType.includes("text/event-stream")
        ) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          const streamAssistantId = `stream-assistant-${Date.now()}`;
          pendingAssistantMessageId = streamAssistantId;
          let buffer = "";
          let realUserMessage: CareerMessagePayload | null = null;
          let assistantPayloads: CareerMessagePayload[] = [];
          let streamAssistantVisible = false;
          let streamDone = false;

          const ensureStreamAssistant = () => {
            if (streamAssistantVisible) return;
            streamAssistantVisible = true;
            setAssistantTyping(true);
            setLocalMessages((prev) => [
              ...prev,
              {
                id: streamAssistantId,
                role: "assistant",
                content: "",
                messageType: "chat",
                createdAt: new Date().toISOString(),
                typing: true,
              },
            ]);
          };

          const appendStreamDelta = (delta: string) => {
            if (!delta) return;
            ensureStreamAssistant();
            setLocalMessages((prev) =>
              prev.map((item) =>
                String(item.id) === streamAssistantId
                  ? {
                      ...item,
                      content: `${item.content}${delta}`,
                      typing: true,
                    }
                  : item
              )
            );
            setScrollTick((t) => t + 1);
          };

          const settleAssistantMessage = (payload: CareerMessagePayload) => {
            const nextMessage = toUiMessage(payload);
            setLocalMessages((prev) =>
              streamAssistantVisible
                ? replaceMessageById(prev, streamAssistantId, nextMessage)
                : [...prev, nextMessage]
            );
            streamAssistantVisible = false;
            pendingAssistantMessageId = null;
            setAssistantTyping(false);
            setScrollTick((t) => t + 1);
          };

          const handleStreamEvent = async ({
            data,
            event,
          }: CareerChatStreamEvent) => {
            if (event === "user_message") {
              const payload = isRecord(data)
                ? toStreamMessagePayload(data.message)
                : null;
              if (!payload) return;
              realUserMessage = payload;
              setLocalMessages((prev) =>
                replaceMessageById(prev, tempId, toUiMessage(payload))
              );
              return;
            }

            if (event === "text_delta") {
              const delta =
                isRecord(data) && typeof data.delta === "string"
                  ? data.delta
                  : "";
              appendStreamDelta(delta);
              return;
            }

            if (event === "assistant_message") {
              const payload = isRecord(data)
                ? toStreamMessagePayload(data.message)
                : null;
              if (!payload) return;
              assistantPayloads = [payload];
              settleAssistantMessage(payload);
              return;
            }

            if (event === "assistant_messages") {
              const payloads =
                isRecord(data) && Array.isArray(data.messages)
                  ? data.messages
                      .map(toStreamMessagePayload)
                      .filter(
                        (item): item is CareerMessagePayload => item !== null
                      )
                  : [];
              if (payloads.length === 0) return;
              assistantPayloads = payloads;
              setLocalMessages((prev) => {
                let nextMessages = [...prev];
                for (let index = 0; index < payloads.length; index += 1) {
                  const payload = payloads[index];
                  const nextMessage = toUiMessage(payload);
                  if (index === 0 && streamAssistantVisible) {
                    nextMessages = replaceMessageById(
                      nextMessages,
                      streamAssistantId,
                      nextMessage
                    );
                    continue;
                  }
                  nextMessages.push(nextMessage);
                }
                return nextMessages;
              });
              streamAssistantVisible = false;
              pendingAssistantMessageId = null;
              setAssistantTyping(false);
              setScrollTick((t) => t + 1);
              return;
            }

            if (event === "opportunity_run") {
              const run = isRecord(data)
                ? (data.opportunityRun as CareerOpportunityRun | null)
                : null;
              onOpportunityRunChanged?.(run ?? null);
              return;
            }

            if (event === "progress") {
              const progress = isRecord(data) ? data.progress : null;
              if (isRecord(progress) && progress.completed) {
                setStage("completed");
              }
              return;
            }

            if (event === "error") {
              throw new Error(
                isRecord(data) && typeof data.error === "string"
                  ? data.error
                  : "메시지 전송에 실패했습니다."
              );
            }

            if (event === "done") {
              streamDone = true;
              if (realUserMessage || assistantPayloads.length > 0) {
                await onMessagesChanged?.([
                  ...(realUserMessage ? [realUserMessage] : []),
                  ...assistantPayloads,
                ]);
              }
              setChatPending(false);
              setAssistantTyping(false);
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder
              .decode(value, { stream: true })
              .replace(/\r\n/g, "\n");
            let boundaryIndex = buffer.indexOf("\n\n");
            while (boundaryIndex >= 0) {
              const rawEvent = buffer.slice(0, boundaryIndex);
              buffer = buffer.slice(boundaryIndex + 2);
              const parsedEvent = parseSseEvent(rawEvent);
              if (parsedEvent) {
                await handleStreamEvent(parsedEvent);
              }
              boundaryIndex = buffer.indexOf("\n\n");
            }
          }

          const tail = buffer.trim();
          if (tail) {
            const parsedEvent = parseSseEvent(tail);
            if (parsedEvent) {
              await handleStreamEvent(parsedEvent);
            }
          }

          if (!streamDone) {
            throw new Error("메시지 스트림이 완료되기 전에 종료되었습니다.");
          }

          return;
        }

        const payload = await response.json().catch(() => ({}));
        if (payload?.opportunityRun) {
          onOpportunityRunChanged?.(
            payload.opportunityRun as CareerOpportunityRun
          );
        }
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "메시지 전송에 실패했습니다.")
          );
        }

        const assistantPayloads = Array.isArray(payload.assistantMessages)
          ? (payload.assistantMessages as CareerMessagePayload[])
          : payload.assistantMessage
            ? [payload.assistantMessage as CareerMessagePayload]
            : [];

        setLocalMessages((prev) =>
          replaceMessageById(prev, tempId, toUiMessage(payload.userMessage))
        );
        for (const assistantPayload of assistantPayloads) {
          await enqueueAssistantTypewriter(toUiMessage(assistantPayload));
        }
        setScrollTick((t) => t + 1);
        await onMessagesChanged?.([
          payload.userMessage as CareerMessagePayload,
          ...assistantPayloads,
        ]);

        if (payload?.progress?.completed) {
          setStage("completed");
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "메시지 전송 중 오류가 발생했습니다.";
        setLocalMessages((prev) =>
          prev.filter(
            (item) =>
              item.id !== tempId &&
              (!pendingAssistantMessageId ||
                String(item.id) !== pendingAssistantMessageId)
          )
        );
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
      onOpportunityRunChanged,
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
