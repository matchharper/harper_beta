import { splitRecommendJobPostingStatusLogs, upsertRecommendJobPostingStatusLog } from "@/lib/talentOnboarding/recommendJobPostingStatus";
import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import { JSDOM } from "jsdom";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type {
  CareerMessage,
  CareerRecommendationSearchStatus,
  CareerStage,
} from "@/components/career/types";
import { MessagesProvider } from "@/i18n/useMessage";
import type { FetchWithAuth } from "./useCareerApi";

type CareerChatTestApi = {
  activeRecommendationSearchStatus: CareerRecommendationSearchStatus | null;
  cancelActiveRecommendationSearch: () => void;
  cancelActiveChat: () => void;
  canStopChat: boolean;
  chatError: string;
  chatPending: boolean;
  messages: CareerMessage[];
  sendChatMessage: (args: { text: string; onSuccess?: () => void }) => Promise<void>;
  setStage: (stage: CareerStage) => void;
  resetChatState: () => void;
};

const createSseEvent = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

async function verifyStop(search: boolean, early = false, deferred = false, options: { failFirst?: boolean; switchDuringStop?: boolean; serverStopped?: boolean } = {}) {
  const { failFirst, switchDuringStop, serverStopped } = options;
  let successfulReplies = 0;
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

  const { useCareerChat } = await import("./useCareerChat");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/career",
  });
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document"
  );
  const previousCustomEvent = Object.getOwnPropertyDescriptor(
    globalThis,
    "CustomEvent"
  );
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: dom.window.CustomEvent,
  });

  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

  const stoppedRequests: Array<Record<string, unknown>> = [];
  const signals: AbortSignal[] = [];
  let releaseStop!: () => void;
  const stopGate = new Promise<void>(resolve => { releaseStop = resolve; });
  let requestSignal: AbortSignal | null | undefined;
  const fetchWithAuth: FetchWithAuth = async (url, init) => {
    if (url === "/api/talent/chat/stop") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        assistantMessage?: {
          content?: string;
          recommendationStatusAfterCharCount?: number;
          thinkingLogs?: string[];
        };
        userMessageId?: number;
      };
      stoppedRequests.push(body);
      if (switchDuringStop) await stopGate;
      if (failFirst && stoppedRequests.length === 1) return Response.json({ error: "Stop could not be saved" }, { status: 500 });
      if (early) {
        assert.equal(body.userMessageId, undefined);
        assert.ok((body as any).clientRequestId);
        return Response.json({ ok: true, userMessage: null, assistantMessage: null });
      }
      return Response.json({
        ok: true,
        userMessage: {
          id: body.userMessageId,
          role: "user",
          content: "포지션 찾아줘",
          messageType: "chat",
          createdAt: "2026-09-07T00:00:00.000Z",
          turnStopped: true,
          thinkingLogs: search ? ["[[recommend_job_postings:stopped]]"] : [],
        },
        assistantMessage: deferred ? null : {
          id: 2,
          role: "assistant",
          content: body.assistantMessage?.content ?? "",
          messageType: "chat",
          createdAt: "2026-09-07T00:00:01.000Z",
          thinkingLogs: search ? upsertRecommendJobPostingStatusLog(body.assistantMessage?.thinkingLogs ?? [], { ...splitRecommendJobPostingStatusLogs(body.assistantMessage?.thinkingLogs ?? []).latestStatus, state: "stopped" }) : body.assistantMessage?.thinkingLogs ?? [],
          recommendationStatusAfterCharCount:
            body.assistantMessage?.recommendationStatusAfterCharCount,
        },
      });
    }

    assert.equal(url, "/api/talent/chat");
    const signal = init?.signal;
    requestSignal = signal;
    if (signal) signals.push(signal);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        if (!early) controller.enqueue(
          encoder.encode(
            [
              createSseEvent("user_message", {
                message: {
                  id: 1,
                  role: "user",
                  content: "포지션 찾아줘",
                  messageType: "chat",
                  createdAt: "2026-09-07T00:00:00.000Z",
                  thinkingLogs: [],
                },
              }),
              createSseEvent("text_delta", {
                delta: "네 찾아볼게요.\n\n",
              }),
              ...(search ? [createSseEvent("recommendation_status_anchor", { contentLength: 10 })] : []),
              createSseEvent("tool_status", {
                message: "요청 조건을 확인했습니다.",
              }),
              ...(search ? [createSseEvent("recommendation_search_status", {
                state: "running",
                phase: "reranking",
                candidateCount: 128,
                scoredCount: 24,
              })] : []),
            ].join("")
          )
        );
        if (deferred || serverStopped) {
          controller.enqueue(encoder.encode(createSseEvent("done", serverStopped ? { ok: true, stopped: true } : { ok: true, continuationQueued: true })));
          controller.close();
        }
        signal?.addEventListener("abort", () => {
          controller.error(new DOMException("Aborted", "AbortError"));
        });
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  };

  const chatRef: { current: CareerChatTestApi | null } = { current: null };
  const Harness = () => {
    chatRef.current = useCareerChat({
      conversationId: "conversation-1",
      fetchWithAuth,
      persistedMessages: [],
      sessionPending: false,
      user: { id: "user-1" } as User,
    });
    return null;
  };
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);

  const waitFor = async (predicate: () => boolean) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (predicate()) return;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
    }
    assert.fail("Timed out waiting for career chat state");
  };

  try {
    await act(async () => {
      root.render(
        <StrictMode><MessagesProvider locale="ko">
          <Harness />
        </MessagesProvider></StrictMode>
      );
    });
    assert.ok(chatRef.current);

    await act(async () => {
      chatRef.current?.setStage("chat");
    });
    await act(async () => {
      void chatRef.current?.sendChatMessage({ text: "포지션 찾아줘", onSuccess: () => { successfulReplies++; } });
    });
    if (serverStopped) {
      await waitFor(() => !chatRef.current?.chatPending);
      assert.equal(successfulReplies, 0, "a server-confirmed Stop must not run reply-success callbacks");
      assert.equal(chatRef.current?.messages.find(message => message.role === "user")?.turnStopped, true);
      return;
    }
    await waitFor(() => deferred ? !!chatRef.current?.canStopChat && !chatRef.current?.chatPending
      : early ? !!chatRef.current?.chatPending : search
      ? chatRef.current?.activeRecommendationSearchStatus?.state === "running"
      : !!chatRef.current?.messages.some(message => message.role === "assistant"));
    const streamingAssistantMessage = chatRef.current?.messages.find(
      (message) => message.role === "assistant"
    );
    assert.equal(chatRef.current?.canStopChat, true);
    if (!early) assert.equal(streamingAssistantMessage?.typingMode, "stream");
    if (search) {
      assert.equal(chatRef.current?.activeRecommendationSearchStatus?.phase, "reranking");
      assert.equal(chatRef.current?.activeRecommendationSearchStatus?.scoredCount, 24);
    }

    await act(async () => {
      chatRef.current?.cancelActiveChat();
    });
    if (switchDuringStop) {
      await waitFor(() => stoppedRequests.length === 1);
      await act(async () => { chatRef.current?.resetChatState(); chatRef.current?.setStage("chat"); });
      await act(async () => { void chatRef.current?.sendChatMessage({ text: "새 요청" }); });
      await waitFor(() => signals.length === 2 && !!chatRef.current?.chatPending);
      await act(async () => { releaseStop(); });
      await waitFor(() => signals[0].aborted);
      assert.equal(signals[1].aborted, false);
      assert.equal(chatRef.current?.chatPending, true, "the old Stop must not settle the new request");
      assert.ok(chatRef.current?.messages.every(message => !message.turnStopped), "the old stream must not mark a new request stopped");
      return;
    }
    if (failFirst) {
      await waitFor(() => !!chatRef.current?.chatError);
      assert.equal(requestSignal?.aborted, false, "failed Stop must leave the real stream attached");
      assert.equal(chatRef.current?.canStopChat, true, "the user must be able to retry Stop");
      assert.ok(chatRef.current?.messages.every(message => !message.turnStopped));
      await act(async () => { chatRef.current?.cancelActiveChat(); });
    }
    await waitFor(
      () => stoppedRequests.length === (failFirst ? 2 : 1) && !chatRef.current?.chatPending
    );

    const assistantMessage = chatRef.current?.messages.find(
      (message) => message.role === "assistant"
    );
    assert.equal(chatRef.current?.canStopChat, false);
    if (deferred) {
      assert.equal(stoppedRequests[0].userMessageId, 1);
      assert.equal(chatRef.current?.messages.find(message => message.role === "user")?.turnStopped, true);
      return;
    }
    if (early) {
      assert.equal(assistantMessage, undefined);
      assert.equal(chatRef.current?.messages[0].turnStopped, true);
      return;
    }
    assert.ok(assistantMessage);
    assert.equal(assistantMessage.content.trim(), "네 찾아볼게요.");
    assert.deepEqual(assistantMessage.thinkingLogs, search ? [
      "요청 조건을 확인했습니다.",
      "[[recommend_job_postings:stopped:candidates=128:phase=reranking:scored=24]]",
    ] : ["요청 조건을 확인했습니다."]);
    if (!search) assert.equal(chatRef.current?.activeRecommendationSearchStatus, null);
    assert.equal(
      stoppedRequests[0].assistantMessage &&
        (stoppedRequests[0].assistantMessage as { content?: string }).content,
      "네 찾아볼게요.\n\n"
    );
  } finally {
    await act(async () => root.unmount());
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    if (previousDocument) {
      Object.defineProperty(globalThis, "document", previousDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    if (previousCustomEvent) {
      Object.defineProperty(globalThis, "CustomEvent", previousCustomEvent);
    } else {
      Reflect.deleteProperty(globalThis, "CustomEvent");
    }
    if (previousSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
    }
    if (previousSupabaseAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousSupabaseAnonKey;
    }
    dom.window.close();
  }
}

test("stopping a recommendation search preserves the assistant text and thinking logs", () => verifyStop(true));
test("stopping an ordinary request preserves partial text without inventing recommendation status", () => verifyStop(false));
test("Stop before the first SSE event persists the client request identity", () => verifyStop(false, true));

test("a queued continuation remains stoppable after the HTTP response ends", () => verifyStop(false, false, true));

test("a failed Stop stays retryable and does not claim that the active request stopped", () => verifyStop(false, false, false, { failFirst: true }));

test("a delayed Stop response cannot mark a newer request stopped", () => verifyStop(false, false, false, { switchDuringStop: true }));

test("server-confirmed Stop does not run successful-reply callbacks", () => verifyStop(false, false, false, { serverStopped: true }));
