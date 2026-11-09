import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import type { CareerMessage } from "@/components/career/types";
import { MessagesProvider } from "@/i18n/useMessage";

test("rapid admissions keep order and a lost acknowledgement retries the same request without blocking later input", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { useCareerChat } = await import("./useCareerChat");
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/career" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const calls: any[] = [], responses: Array<() => void> = [];
  const receipts = new Map<string, any>();
  let api!: ReturnType<typeof useCareerChat>;
  const fetchWithAuth = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); calls.push(body);
    assert.equal(body.durable, true);
    let message = receipts.get(body.clientRequestId);
    if (message) return Response.json({ userMessage: message }, { status: 202 });
    message = { id: receipts.size + 1, role: "user", content: body.message, messageType: "chat", clientRequestId: body.clientRequestId, createdAt: "2026-11-03T00:00:00Z" };
    receipts.set(body.clientRequestId, message);
    return await new Promise<Response>((resolve, reject) => responses.push(() => message.id === 1
      ? reject(new Error("Acknowledgement lost")) : resolve(Response.json({ userMessage: message }, { status: 202 }))));
  };
  function Harness() { api = useCareerChat({ user: { id: "user" } as User, conversationId: "conversation", isOnboardingDone: true,
    sessionPending: false, persistedMessages: [], fetchWithAuth }); return null; }
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<MessagesProvider locale="ko"><Harness /></MessagesProvider>));
    let pending: Promise<void>[] = [];
    await act(async () => { pending = Array.from({ length: 10 }, (_, i) => api.sendChatMessage({ text: `지원 ${i}` })); });
    assert.equal(calls.length, 1);
    assert.equal(api.chatPending, false);
    assert.equal(api.chatAdmissionPending, true);
    for (let index=0; index<10; index++) {
      assert.equal(calls.length,index+1);
      assert.equal(api.chatAdmissionPending,true);
      await act(async () => { responses[index](); await pending[index]; });
    }
    assert.equal(api.chatAdmissionPending, false);
    assert.equal(api.messages.length, 9);
    await act(async () => api.sendChatMessage({ text: "지원 0" }));
    assert.equal(calls[10].clientRequestId, calls[0].clientRequestId);
    assert.equal(receipts.size, 10);
    assert.equal(new Set(api.messages.map(message => message.id)).size, 10);
    assert.equal(api.chatError, "");
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("a streamed source message replaces the optimistic copy when history also receives it", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { useCareerChat } = await import("./useCareerChat");
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/career" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const saved: CareerMessage = { id: 45, role: "user", messageType: "chat", content: "이 공고 지원 준비를 시작해줘.", createdAt: "2026-10-30T00:00:00Z" };
  let history: CareerMessage[] = [];
  let api!: ReturnType<typeof useCareerChat>;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let pending!: Promise<void>;
  const event = (name: string, data: unknown) => controller.enqueue(new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
  function Harness() {
    api = useCareerChat({
      user: { id: "user" } as User, conversationId: "conversation", sessionPending: false,
      persistedMessages: history,
      fetchWithAuth: async () => new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { "Content-Type": "text/event-stream" } }),
    });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = () => root.render(<MessagesProvider locale="ko"><Harness /></MessagesProvider>);
  try {
    await act(async () => render());
    await act(async () => api.setStage("chat"));
    await act(async () => { pending = api.sendChatMessage({ text: saved.content }); });
    assert.equal(api.messages.filter(message => message.role === "user").length, 1);
    assert.ok(String(api.messages[0].id).startsWith("temp-user-"));
    // History can arrive independently of the request's SSE acknowledgement.
    history = [saved];
    await act(async () => render());
    await act(async () => event("user_message", { message: saved }));
    assert.deepEqual(api.messages.filter(message => message.role === "user").map(message => message.id), [45]);
    const reply: CareerMessage = { id: 46, role: "assistant", messageType: "chat", content: "지원 준비를 시작할게요.", createdAt: "2026-10-30T00:00:01Z" };
    await act(async () => event("assistant_message", { message: reply, continuing: true }));
    assert.equal(api.chatPending, true);
    // Polling can see the saved answer while server-side post-processing is still running.
    history = [saved, reply];
    await act(async () => render());
    assert.deepEqual(api.messages.map(message => message.id), [45, 46]);
    await act(async () => {
      event("assistant_message", { message: reply });
      event("done", { ok: true }); controller.close(); await pending;
    });
    assert.deepEqual(api.messages.map(message => message.id), [45, 46]);
    assert.equal(api.chatPending, false);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("a queued reply acknowledgement keeps the saved user request and later merges the background answer", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { useCareerChat } = await import("./useCareerChat");
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/career" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const saved: CareerMessage = { id: 55, role: "user", messageType: "chat", content: "이 공고도 준비해줘.", createdAt: "2026-10-30T00:00:00Z" };
  const reply: CareerMessage = { id: 56, role: "assistant", messageType: "chat", content: "지원 페이지를 열었어요.", createdAt: "2026-10-30T00:00:01Z" };
  let history: CareerMessage[] = [];
  let api!: ReturnType<typeof useCareerChat>;
  let successes = 0, failures = 0;
  const received: number[] = [];
  function Harness() {
    api = useCareerChat({
      user: { id: "user" } as User, conversationId: "conversation", sessionPending: false,
      persistedMessages: history,
      fetchWithAuth: async () => new Response(JSON.stringify({ ok: true, continuationQueued: true, userMessage: saved }), {
        status: 202, headers: { "Content-Type": "application/json" },
      }),
      onMessagesChanged: async (messages) => { received.push(...messages.map(message => Number(message.id))); },
    });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = () => root.render(<MessagesProvider locale="ko"><Harness /></MessagesProvider>);
  try {
    await act(async () => render());
    await act(async () => api.setStage("chat"));
    await act(async () => api.sendChatMessage({ text: saved.content, onSuccess: () => successes++, onError: () => failures++ }));
    assert.equal(successes, 1);
    assert.equal(failures, 0);
    assert.equal(api.chatError, "");
    assert.equal(api.chatPending, false);
    assert.deepEqual(api.messages.map(message => message.id), [55]);
    assert.deepEqual(received, [55]);
    history = [saved, reply];
    await act(async () => render());
    assert.deepEqual(api.messages.map(message => message.id), [55, 56]);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
