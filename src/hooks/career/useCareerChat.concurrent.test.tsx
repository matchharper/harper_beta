import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { MessagesProvider } from "@/i18n/useMessage";
import { useCareerChatAutoScroll } from "./useCareerChatAutoScroll";

for (const stop of [false, true]) test(`onboarding accepts input while streaming and ${stop ? "Stop cancels queued input" : "processes it after final reply post-processing"}`, async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { useCareerChat } = await import("./useCareerChat");
  const dom = new JSDOM("<div id='root'></div><div id='scroll'></div>", { url: "http://localhost/career" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const scroll = dom.window.document.getElementById("scroll") as HTMLDivElement;
  const scrollRef = { current: scroll } as RefObject<HTMLDivElement>;
  let height = 1000;
  Object.defineProperties(scroll, { scrollHeight: { get: () => height }, clientHeight: { value: 400 } });
  const scrolls: ScrollToOptions[] = [];
  scroll.scrollTo = options => { scrolls.push(options as ScrollToOptions); scroll.scrollTop = height - 400; };
  const requests: Record<string, unknown>[] = [];
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  let chat!: ReturnType<typeof useCareerChat>;
  let releaseStop!: () => void;
  const stopGate = new Promise<void>(resolve => { releaseStop = resolve; });
  function Harness() {
    chat = useCareerChat({ user: { id: "user" } as User, conversationId: "conversation",
      sessionPending: false, persistedMessages: [], fetchWithAuth: async (url, init) => {
        if (url.endsWith("/stop")) { await stopGate; return Response.json({ ok: true }); }
        requests.push(JSON.parse(String(init?.body)));
        return new Response(new ReadableStream<Uint8Array>({ start(controller) { streams.push(controller); } }),
          { headers: { "Content-Type": "text/event-stream" } });
      } });
    useCareerChatAutoScroll({ conversationId: "conversation", initialScrollPending: false,
      messageCount: chat.messages.length, scrollRef, scrollTick: chat.scrollTick,
      sentMessageTick: chat.sentMessageTick, preserveReadingPosition: true });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const emit = (index: number, event: string, data: unknown) => streams[index].enqueue(
    new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  let first!: Promise<void>, second!: Promise<void>;
  try {
    await act(async () => root.render(<MessagesProvider locale="ko"><Harness /></MessagesProvider>));
    await act(async () => chat.setStage("chat"));
    // Sending while reading older messages always reveals the new message.
    scroll.scrollTop = 0;
    scroll.dispatchEvent(new dom.window.Event("scroll"));
    scrolls.length = 0;
    height += 100;
    await act(async () => { first = chat.sendChatMessage({ text: "한국만" }); });
    assert.equal(scrolls.at(-1)?.top, height, "scroll before any HTTP receipt or assistant output");
    assert.equal(requests.length, 1);
    assert.ok(!chat.messages.find(message => message.content === "한국만")?.inputPending, "the first inline send is not queued");
    await act(async () => {
      emit(0, "user_message", { message: { id: 1, role: "user", content: "한국만" } });
      emit(0, "text_delta", { delta: "한국에서 찾아볼게요." });
    });
    assert.equal(chat.assistantTyping, true);
    height += 100;
    await act(async () => { second = chat.sendChatMessage({ text: "연봉도 중요해" }); });
    assert.ok(chat.messages.some(message => message.content === "연봉도 중요해"));
    assert.equal(chat.messages.find(message => message.content === "연봉도 중요해")?.inputPending, true);
    assert.equal(chat.sentMessageTick, 2);
    assert.equal(scrolls.at(-1)?.top, height);
    assert.equal(requests.length, 1, "the extra send cannot replace the active SSE controller");

    if (stop) await act(async () => { chat.cancelActiveChat(); });
    await act(async () => {
      emit(0, "assistant_message", { message: { id: 2, role: "assistant", content: "한국에서 찾아볼게요.", workCompletedAt: "2026-11-08T05:03:48Z" } });
    });
    assert.equal(chat.chatPending, false, "a saved final reply ends Thinking before extraction finishes");
    assert.equal(chat.assistantTyping, false);
    await act(async () => { emit(0, "done", { ok: true }); streams[0].close(); await first; });
    if (stop) {
      assert.equal(requests.length, 1, "queued input waits for the in-flight Stop receipt");
      await act(async () => { releaseStop(); await second; });
      assert.equal(requests.length, 1);
      assert.ok(!chat.messages.some(message => message.content === "연봉도 중요해"));
    } else {
      assert.equal(requests.length, 2);
      assert.equal(requests[1].message, "연봉도 중요해");
      assert.equal(chat.messages.filter(message => message.content === "연봉도 중요해").length, 1);
      assert.equal(chat.messages.find(message => message.content === "연봉도 중요해")?.inputPending, true, "queue dispatch is not yet a receipt");
      await act(async () => {
        emit(1, "user_message", { message: { id: 3, role: "user", content: "연봉도 중요해", clientRequestId: requests[1].clientRequestId } });
        emit(1, "assistant_message", { message: { id: 4, role: "assistant", content: "보상도 함께 살펴볼게요." } });
        emit(1, "done", { ok: true }); streams[1].close(); await second;
      });
      assert.equal(chat.messages.filter(message => message.content === "연봉도 중요해").length, 1);
      assert.ok(!chat.messages.find(message => message.content === "연봉도 중요해")?.inputPending);
      assert.equal(chat.chatPending, false);
      assert.equal(chat.chatError, "");
    }
    assert.equal(chat.chatAdmissionPending, false);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
