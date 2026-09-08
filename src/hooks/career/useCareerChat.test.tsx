import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import { JSDOM } from "jsdom";
import { act } from "react";
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
  chatPending: boolean;
  messages: CareerMessage[];
  sendChatMessage: (args: { text: string }) => Promise<void>;
  setStage: (stage: CareerStage) => void;
};

const createSseEvent = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

test("stopping a recommendation search preserves the assistant text and thinking logs", async () => {
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
      return Response.json({
        ok: true,
        userMessage: {
          id: body.userMessageId,
          role: "user",
          content: "포지션 찾아줘",
          messageType: "chat",
          createdAt: "2026-09-07T00:00:00.000Z",
          thinkingLogs: ["[[recommend_job_postings:stopped]]"],
        },
        assistantMessage: {
          id: 2,
          role: "assistant",
          content: body.assistantMessage?.content ?? "",
          messageType: "chat",
          createdAt: "2026-09-07T00:00:01.000Z",
          thinkingLogs: body.assistantMessage?.thinkingLogs ?? [],
          recommendationStatusAfterCharCount:
            body.assistantMessage?.recommendationStatusAfterCharCount,
        },
      });
    }

    assert.equal(url, "/api/talent/chat");
    const signal = init?.signal;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
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
              createSseEvent("recommendation_status_anchor", {
                contentLength: 10,
              }),
              createSseEvent("tool_status", {
                message: "요청 조건을 확인했습니다.",
              }),
              createSseEvent("recommendation_search_status", {
                state: "running",
              }),
            ].join("")
          )
        );
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
        <MessagesProvider locale="ko">
          <Harness />
        </MessagesProvider>
      );
    });
    assert.ok(chatRef.current);

    await act(async () => {
      chatRef.current?.setStage("chat");
    });
    await act(async () => {
      void chatRef.current?.sendChatMessage({ text: "포지션 찾아줘" });
    });
    await waitFor(
      () =>
        chatRef.current?.activeRecommendationSearchStatus?.state === "running"
    );

    await act(async () => {
      chatRef.current?.cancelActiveRecommendationSearch();
    });
    await waitFor(
      () => stoppedRequests.length === 1 && !chatRef.current?.chatPending
    );

    const assistantMessage = chatRef.current?.messages.find(
      (message) => message.role === "assistant"
    );
    assert.ok(assistantMessage);
    assert.equal(assistantMessage.content.trim(), "네 찾아볼게요.");
    assert.deepEqual(assistantMessage.thinkingLogs, [
      "요청 조건을 확인했습니다.",
      "[[recommend_job_postings:stopped]]",
    ]);
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
});
