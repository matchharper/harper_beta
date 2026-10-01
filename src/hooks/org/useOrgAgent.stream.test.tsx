import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { OrgLocaleProvider } from "@/i18n/org/OrgLocaleProvider";
import { useOrgAgentChat } from "./useOrgAgent";
import { getOrgAgentLiveChatKey, useOrgAgentLiveChatStore } from "@/store/useOrgAgentLiveChatStore";

test("SSE text renders before completion, reconciles once, and old cleanup cannot clear the next turn", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  dom.window.localStorage.setItem("harper:org-locale", "en");
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const originalFetch = globalThis.fetch;
  const originalGetSession = supabase.auth.getSession;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let releaseInvalidation!: () => void;
  const invalidation = new Promise<void>((resolve) => { releaseInvalidation = resolve; });
  client.invalidateQueries = () => invalidation;
  (supabase.auth as any).getSession = async () => ({ data: { session: { access_token: "test-token" } } });
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/org/agent/chat");
    assert.equal(JSON.parse(String(init?.body)).responseLocale, "en");
    return new Response(new ReadableStream<Uint8Array>({ start(controller) { streams.push(controller); } }), {
      headers: { "Content-Type": "text/event-stream" },
    });
  };
  const messages: any[] = [];
  let chat!: ReturnType<typeof useOrgAgentChat>;
  function Harness() {
    chat = useOrgAgentChat({ workspaceId: "workspace", roleId: "role", mode: "role", appendMessagesToCache: (items) => messages.push(...items) });
    return <div data-status={chat.assistantStatus}>{chat.streamingText}</div>;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const encoder = new TextEncoder();
  const emit = async (index: number, event: string, data: unknown) => {
    await act(async () => {
      // Split the SSE frame to exercise incremental parsing, too.
      const frame = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      streams[index].enqueue(frame.slice(0, 9));
      streams[index].enqueue(frame.slice(9));
    });
  };
  let first!: Promise<void>;
  let second!: Promise<void>;
  try {
    await act(async () => { root.render(<QueryClientProvider client={client}><OrgLocaleProvider><Harness /></OrgLocaleProvider></QueryClientProvider>); });
    await act(async () => { first = chat.sendMessage({ message: "첫 요청" }); });
    await emit(0, "text_delta", { delta: "먼저 도착한 문장" });
    assert.equal(dom.window.document.getElementById("root")!.textContent, "먼저 도착한 문장");
    assert.equal(chat.isStreaming, true);
    await emit(0, "text_replace", { text: "최종 답변과 정확한 초안" });
    assert.equal(chat.streamingText, "최종 답변과 정확한 초안");
    await emit(0, "assistant_message", { id: 1, role: "assistant", content: "최종 답변과 정확한 초안" });
    await emit(0, "done", { ok: true });
    assert.equal(chat.isStreaming, false);
    assert.equal(chat.streamingText, "");
    assert.equal(messages.length, 1);
    await act(async () => { streams[0].close(); });

    await act(async () => { second = chat.sendMessage({ message: "다음 요청" }); });
    await emit(1, "text_delta", { delta: "다음 답변" });
    await act(async () => { releaseInvalidation(); await first; });
    assert.equal(chat.isStreaming, true);
    assert.equal(chat.streamingText, "다음 답변");
    await emit(1, "text_replace", { text: "" });
    await emit(1, "error", { error: "연결이 끊겼습니다" });
    await emit(1, "done", { ok: false });
    await act(async () => { streams[1].close(); await second; });
    assert.equal(chat.isStreaming, false);
    assert.equal(chat.error, "연결이 끊겼습니다");
    assert.equal(chat.streamingText, "");
  } finally {
    releaseInvalidation();
    await act(async () => { root.unmount(); });
    client.clear();
    useOrgAgentLiveChatStore.getState().finish(getOrgAgentLiveChatKey({ workspaceId: "workspace", roleId: "role", mode: "role" }));
    globalThis.fetch = originalFetch;
    supabase.auth.getSession = originalGetSession;
    Object.assign(globalThis, { window: originalWindow, document: originalDocument, IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  }
});
