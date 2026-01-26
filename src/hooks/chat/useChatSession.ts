// hooks/chat/useChatSession.ts
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import type { ChatMessage } from "@/types/chat";
import {
  fetchMessages,
  insertMessage,
  updateMessageContent,
} from "@/lib/message";
import { CandidateDetail } from "../useCandidateDetail";

const CHAT_MODEL = "grok-4-fast-reasoning";

export const UI_START = "<<UI>>";
export const UI_END = "<<END_UI>>";

export type ChatScope =
  | { type: "query"; queryId: string }
  | { type: "candid"; candidId: string };

export type UiSegment =
  | { type: "text"; content: string }
  | { type: "block"; content: any };

export function replaceUiBlockInText(rawText: string, modifiedBlockObj: any) {
  const start = rawText.lastIndexOf(UI_START);
  const end = rawText.lastIndexOf(UI_END);

  if (start === -1 || end === -1 || end <= start) return rawText;

  const before = rawText.slice(0, start + UI_START.length);
  const after = rawText.slice(end); // keep END_UI

  const json = JSON.stringify(modifiedBlockObj);
  return `${before}\n${json}\n${after}`;
}

export function extractUiSegments(text: string): { segments: UiSegment[] } {
  const segments: UiSegment[] = [];
  let cursor = 0;

  while (true) {
    const start = text.indexOf(UI_START, cursor);
    if (start === -1) break;

    const before = text.slice(cursor, start);
    if (before) segments.push({ type: "text", content: before });

    const afterStart = start + UI_START.length;
    const end = text.indexOf(UI_END, afterStart);

    if (end === -1) {
      segments.push({ type: "block", content: { type: "criteria_loading" } });
      return { segments };
    }

    const jsonStr = text.slice(afterStart, end).trim();
    try {
      const obj = JSON.parse(jsonStr);
      segments.push({ type: "block", content: obj });
    } catch {
      segments.push({
        type: "text",
        content: text.slice(start, end + UI_END.length),
      });
    }

    cursor = end + UI_END.length;
  }

  const tail = text.slice(cursor);
  if (tail) segments.push({ type: "text", content: tail });

  return { segments };
}

export function buildConversationText(messages: ChatMessage[]) {
  return messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.rawContent}`)
    .join("\n");
}

// ✅ scope -> insert/fetch payload로 바꿔주는 헬퍼
function scopeToDbArgs(scope: ChatScope) {
  return scope.type === "query"
    ? ({ queryId: scope.queryId } as const)
    : ({ candidId: scope.candidId } as const);
}

export function useChatSessionDB(args: {
  scope?: ChatScope;
  userId?: string;
  apiPath?: string;
  model?: "grok-4-fast-reasoning" | "gemini-3-flash-preview";
  candidDoc?: CandidateDetail;
}) {
  const { scope, userId } = args;
  const apiPath = args.apiPath ?? "/api/chat";
  const model = args.model ?? CHAT_MODEL;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const candidDoc = args.candidDoc;

  const abortRef = useRef<AbortController | null>(null);

  // ✅ 최신 messages 참조 (클로저 stale 방지)
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const ready = !!scope && !!userId;

  const loadHistory = useCallback(async () => {
    if (!ready) return;
    if (isLoadingHistory) return;

    setIsLoadingHistory(true);
    setError(null);

    try {
      const rows = await fetchMessages({
        ...scopeToDbArgs(scope!),
        userId: userId!,
      });

      const hydrated = rows.map((m: any) => {
        const raw = (m as any).rawContent ?? m.content ?? "";
        const { segments } = extractUiSegments(raw);
        return { ...m, rawContent: raw, segments };
      });

      setMessages(hydrated);
    } catch {
      setError("대화 기록을 불러오지 못했습니다.");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [ready, isLoadingHistory, scope, userId]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const canSend = useMemo(
    () => ready && !isStreaming && input.trim().length > 0,
    [ready, isStreaming, input]
  );

  const send = useCallback(
    async (content?: string) => {
      if (!ready) return;

      const trimmed = content?.trim() ?? input.trim();
      if (!trimmed) return;
      if (isStreaming) return;

      setError(null);
      setIsStreaming(true);

      try {
        const baseDbArgs = scopeToDbArgs(scope!);
        const existingUserMsg =
          content != null
            ? [...messagesRef.current]
              .reverse()
              .find(
                (m) =>
                  m.role === "user" &&
                  ((m as any).rawContent ?? m.content ?? "") === trimmed
              )
            : null;

        let userMsg: ChatMessage;
        let appendToHistory = false;

        if (!existingUserMsg) {
          // 1) insert user message
          userMsg = await insertMessage({
            ...baseDbArgs,
            userId: userId!,
            role: "user",
            content: trimmed,
          });
          appendToHistory = true;

          // UI 반영: content를 직접 호출했을 때도 userMsg는 화면에 보여줘야 자연스러움
          // (원래 코드는 content 인자로 호출하면 화면에 안 붙는 케이스가 생김)
          if (!content) {
            setMessages((prev) => [
              ...prev,
              {
                ...userMsg,
                rawContent: trimmed,
                segments: [{ type: "text", content: trimmed }],
              },
            ]);
          }
          if (!content) setInput("");
        } else {
          userMsg = existingUserMsg as ChatMessage;
        }

        // 2) assistant placeholder insert (DB row 확보)
        const assistantPlaceholder = await insertMessage({
          ...baseDbArgs,
          userId: userId!,
          role: "assistant",
          content: "",
        });

        setMessages((prev) => [...prev, assistantPlaceholder]);

        // 3) stream response and update placeholder
        const controller = new AbortController();
        abortRef.current = controller;

        // ✅ 최신 messages를 기준으로 모델 대화 구성
        const historyForModel = (
          appendToHistory
            ? [...messagesRef.current, userMsg]
            : [...messagesRef.current]
        ).map((m) => ({
          role: m.role,
          content: (m as any).rawContent ?? m.content ?? "",
        }));

        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: historyForModel,
            scope: scope,
            doc: candidDoc,
            // scope도 서버에 필요하면 같이 보낼 수 있음
            // scope,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) throw new Error("chat api failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistantText = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          assistantText += decoder.decode(value, { stream: true });

          const { segments } = extractUiSegments(assistantText);

          setMessages((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex(
              (x) => x.id === assistantPlaceholder.id
            );
            if (idx >= 0) {
              updated[idx] = {
                ...updated[idx],
                rawContent: assistantText,
                content: assistantText,
                segments,
              };
            }
            return updated;
          });
        }

        await updateMessageContent({
          id: assistantPlaceholder.id!,
          content: assistantText,
        });
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError("메시지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [ready, input, isStreaming, scope, userId, apiPath, model]
  );

  const reload = useCallback(async () => {
    if (!ready) return;
    setError(null);

    try {
      const rows = await fetchMessages({
        ...scopeToDbArgs(scope!),
        userId: userId!,
      });

      const hydrated = rows.map((m: any) => {
        const raw = (m as any).rawContent ?? m.content ?? "";
        const { segments } = extractUiSegments(raw);
        return { ...m, rawContent: raw, segments };
      });

      setMessages(hydrated);
    } catch {
      setError("대화 기록을 새로고침하지 못했습니다.");
    }
  }, [ready, scope, userId]);

  const addAssistantMessage = useCallback(
    async (content: string) => {
      if (!ready) return null;
      const trimmed = content.trim();
      if (!trimmed) return null;

      const assistantMsg = await insertMessage({
        ...scopeToDbArgs(scope!),
        userId: userId!,
        role: "assistant",
        content: trimmed,
      });

      const { segments } = extractUiSegments(trimmed);

      setMessages((prev) => [
        ...prev,
        { ...assistantMsg, rawContent: trimmed, segments },
      ]);

      return assistantMsg;
    },
    [ready, scope, userId]
  );

  const patchAssistantUiBlock = useCallback(
    async (messageId: number, modifiedBlock: any) => {
      let nextRawForDb = "";

      setMessages((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex((x) => x.id === messageId);
        if (idx < 0) return prev;

        const cur = updated[idx] as any;
        const raw = (cur.rawContent ?? cur.content ?? "") as string;
        const nextRaw = replaceUiBlockInText(raw, modifiedBlock);
        nextRawForDb = nextRaw;

        const { segments } = extractUiSegments(nextRaw);

        updated[idx] = {
          ...cur,
          rawContent: nextRaw,
          segments,
          content: nextRaw,
        };
        return updated;
      });

      if (nextRawForDb) {
        await updateMessageContent({ id: messageId, content: nextRawForDb });
      }
    },
    []
  );

  return {
    ready,
    messages,
    setMessages,
    input,
    setInput,
    isStreaming,
    error,
    isLoadingHistory,
    canSend,
    loadHistory,
    send,
    stop,
    reload,
    addAssistantMessage,
    patchAssistantUiBlock,
  };
}
