// hooks/chat/useChatSession.ts
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import type { ChatMessage, FileAttachmentPayload, FileContextBlock } from "@/types/chat";
import {
  fetchMessages,
  insertMessage,
  updateMessageContent,
} from "@/lib/message";
import { CandidateDetail } from "../useCandidateDetail";
import { logger } from "@/utils/logger";

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

function splitTextByAnchors(text: string): UiSegment[] {
  const A_TAG_RE =
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;

  const out: UiSegment[] = [];
  let cursor = 0;

  while (true) {
    const m = A_TAG_RE.exec(text);
    if (!m) break;

    const start = m.index;
    const end = start + m[0].length;

    const before = text.slice(cursor, start);
    if (before) out.push({ type: "text", content: before });

    const href = (m[1] ?? m[2] ?? "").trim();
    const innerHtml = (m[3] ?? "").trim();

    // If href is missing or looks unsafe, just keep raw as text
    // (You can relax/tighten this depending on your input trust)
    const safe =
      href &&
      (href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:"));

    if (!safe) {
      out.push({ type: "text", content: m[0] });
    } else {
      // Inner text: strip nested tags (simple + safe)
      const innerText = innerHtml.replace(/<[^>]+>/g, "").trim();
      out.push({
        type: "block",
        content: { type: "link", text: innerText || href.split("https://")[1].slice(0, 10), href },
      });
    }

    cursor = end;
  }

  const tail = text.slice(cursor);
  if (tail) out.push({ type: "text", content: tail });

  return out;
}

export function extractUiSegments(text: string): { segments: UiSegment[] } {
  const segments: UiSegment[] = [];
  let cursor = 0;

  while (true) {
    const start = text.indexOf(UI_START, cursor);
    if (start === -1) break;

    // 1) Before UI block
    const before = text.slice(cursor, start);
    if (before) {
      // split <a> inside text
      segments.push(...splitTextByAnchors(before));
    }

    // 2) UI block
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
      // If broken JSON, treat the whole thing as text (and still split anchors inside)
      const raw = text.slice(start, end + UI_END.length);
      segments.push(...splitTextByAnchors(raw));
    }

    cursor = end + UI_END.length;
  }

  const tail = text.slice(cursor);
  if (tail) segments.push(...splitTextByAnchors(tail));

  // Remove duplicate tool_status blocks per tool call id.
  // Keep only the latest tool_status for each id (running -> done/error).
  const lastToolStatusIndexById = new Map<string, number>();
  segments.forEach((seg, idx) => {
    if (seg.type !== "block") return;
    const content = (seg as any).content;
    if (content?.type !== "tool_status" || !content?.id) return;
    lastToolStatusIndexById.set(String(content.id), idx);
  });
  const filtered = segments.filter((seg, idx) => {
    if (seg.type !== "block") return true;
    const content = (seg as any).content;
    if (content?.type !== "tool_status" || !content?.id) return true;
    return lastToolStatusIndexById.get(String(content.id)) === idx;
  });

  const merged: UiSegment[] = [];
  for (const seg of filtered) {
    const prev = merged[merged.length - 1];
    if (seg.type === "text" && prev?.type === "text") {
      prev.content += seg.content;
      continue;
    }
    if (
      seg.type === "block" &&
      (seg as any).content?.type === "tool_status" &&
      prev?.type === "block" &&
      (prev as any).content?.type === "tool_status"
    ) {
      const prevId = (prev as any).content?.id;
      const nextId = (seg as any).content?.id;
      if (prevId && nextId && prevId === nextId) {
        merged[merged.length - 1] = seg;
        continue;
      }
    }
    merged.push(seg);
  }

  return { segments: merged };
}

export function buildConversationText(messages: ChatMessage[]) {
  return messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.rawContent}`)
    .join("\n");
}

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
  systemPromptOverride?: string;
  memoryMode?: "automation";
}) {
  const { scope, userId } = args;
  const isCandidScope = scope?.type === "candid";
  const apiPath = isCandidScope ? "/api/chat/candid" : "/api/chat";
  const model = args.model ?? CHAT_MODEL;
  const systemPromptOverride = args.systemPromptOverride;
  const memoryMode = args.memoryMode;

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
    async (
      content?: string,
      options?: { attachments?: FileAttachmentPayload[] }
    ) => {
      logger.log("\n\nsend in useChatSessionDB : ", content, "\n\n");

      if (!ready) return;

      const trimmed = content ? content.trim() : input.trim();
      const attachments = options?.attachments ?? [];
      const hasAttachments = attachments.length > 0;
      if (!trimmed && !hasAttachments) return;
      if (isStreaming) return;

      setError(null);
      setIsStreaming(true);
      const startAt = Date.now();

      try {
        const baseDbArgs = scopeToDbArgs(scope!);
        const existingUserMsg =
          content != null && !hasAttachments
            ? [...messagesRef.current]
                .reverse()
                .find(
                  (m) =>
                    m.role === "user" &&
                    ((m as any).rawContent ?? m.content ?? "") === trimmed
                )
            : null;

        let userMsg: ChatMessage;

        if (!existingUserMsg) {
          const attachmentBlocks: FileContextBlock[] = attachments.map((a) => ({
            type: "file_context",
            name: a.name,
            size: a.size,
            mime: a.mime,
            excerpt: a.excerpt,
            truncated: a.truncated,
          }));
          const attachmentUi =
            attachmentBlocks.length > 0
              ? attachmentBlocks
                  .map(
                    (block) =>
                      `${UI_START}\n${JSON.stringify(block)}\n${UI_END}`
                  )
                  .join("\n")
              : "";
          const userContentForDb = [trimmed, attachmentUi]
            .filter((v) => v && v.length > 0)
            .join("\n\n");

          // 1) insert user message
          userMsg = await insertMessage({
            ...baseDbArgs,
            userId: userId!,
            role: "user",
            content: userContentForDb,
          });

          if (!content) {
            setMessages((prev) => [
              ...prev,
              {
                ...userMsg,
                rawContent: userContentForDb,
                segments: userContentForDb
                  ? extractUiSegments(userContentForDb).segments
                  : [],
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
        const historyForModel = [...messagesRef.current].map((m) => ({
          role: m.role,
          content: (m as any).rawContent ?? m.content ?? "",
        }));
        if (!existingUserMsg) {
          const latestContent =
            (userMsg as any)?.rawContent ?? userMsg.content ?? "";
          if (latestContent) {
            historyForModel.push({
              role: "user",
              content: latestContent,
            });
          }
        }

        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: historyForModel,
            scope: scope,
            doc: candidDoc,
            systemPromptOverride,
            userId,
            memoryMode,
            attachments: attachments.length > 0 ? attachments : undefined,
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
          logger.log("\n\n assistantText in useChatSessionDB ", assistantText, " === ", assistantPlaceholder.id, "\n\n");

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

        const latency = Date.now() - startAt;
        await updateMessageContent({
          id: assistantPlaceholder.id!,
          content: assistantText,
          latency,
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
