import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { MessagesProvider } from "@/i18n/useMessage";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";
import type { CareerMessagePayload } from "@/components/career/types";
import { toUiMessage } from "./careerHelpers";

test("saved form replies continue through ordinary chat and survive failed replies and retries", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { useCareerChat } = await import("./useCareerChat");
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/career" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const formSnapshot = { formId: 10, revision: 2, kind: "form", items: [{ id: "experience", type: "textarea", label: "경험", content: "처음 값" }], positive: { id: "continue", label: "진행", message: "이 내용으로 진행해줘." } };
  const response = { formId: 10, revision: 2, actionId: "continue", values: { experience: "사용자 수정값" }, requestId: "saved-click", formSnapshot };
  const saved = toTalentMessageResponse({ id: 20, user_id: "user", conversation_id: "conversation", role: "user", message_type: "career_form_response", content: "이 내용으로 진행해줘.\n경험: 사용자 수정값", payload: response, created_at: "2026-10-30T00:00:00Z" });
  const requests: Record<string, unknown>[] = [];
  let blocked = false;
  let api!: ReturnType<typeof useCareerChat>;
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const send = (event: string, data: unknown) => stream.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  function Harness() {
    api = useCareerChat({
      conversationId: "conversation", user: { id: "user" } as User,
      persistedMessages: [], sessionPending: blocked,
      fetchWithAuth: async (url, init) => {
        assert.equal(url, "/api/talent/chat");
        requests.push(JSON.parse(String(init?.body)));
        return new Response(new ReadableStream({ start(controller) { stream = controller; } }), { headers: { "Content-Type": "text/event-stream" } });
      },
    });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = () => root.render(<MessagesProvider locale="ko"><Harness /></MessagesProvider>);
  let successes = 0, failures = 0, pending!: Promise<void>;
  const submit = () => { pending = api.sendChatMessage({ text: saved.content, formResponseMessageId: saved.id, onSuccess: () => { successes++; }, onError: () => { failures++; } }); };
  try {
    await act(async () => render());
    await act(async () => api.setStage("chat"));
    blocked = true;
    await act(async () => render());
    await act(async () => { submit(); await pending; });
    assert.equal(failures, 1, "a saved form response must not silently lose its chat continuation");
    assert.equal(requests.length, 0);
    blocked = false;
    await act(async () => render());
    await act(async () => submit());
    assert.equal(api.chatPending, true, "form replies use the ordinary chat working indicator");
    assert.equal(requests[0].formResponseMessageId, 20);
    assert.equal(requests[0].allowedToolNames, undefined);
    assert.equal(requests[0].simulationAction, undefined);
    assert.equal(api.messages.filter(message => message.role === "user").length, 0, "do not create a second optimistic user message");
    await act(async () => send("user_message", { message: saved }));
    await act(async () => send("tool_status", { message: "지원 페이지를 확인하고 있어요." }));
    assert.deepEqual(api.activeThinkingLogs, ["지원 페이지를 확인하고 있어요."]);
    await act(async () => { send("error", { error: "Provider unavailable" }); stream.close(); await pending; });
    assert.equal(failures, 2);
    assert.equal(api.chatPending, false);
    assert.equal(api.assistantTyping, false, "failed tool progress cannot leave the next send locked");
    assert.equal(successes, 0);
    assert.equal(api.messages.filter(message => message.role === "user").length, 1, "the response was already saved before the provider failed");
    assert.equal(api.messages[0].formResponse?.values.experience, "사용자 수정값");
    await act(async () => submit());
    assert.equal(requests.length, 2);
    await act(async () => {
      send("user_message", { message: saved });
      send("assistant_message", { message: { id: 21, role: "assistant", messageType: "chat", content: "답변을 반영했어요.", createdAt: "2026-10-30T00:00:01Z" } });
      send("done", { ok: true }); stream.close(); await pending;
    });
    assert.equal(successes, 1);
    assert.equal(api.chatPending, false);
    assert.equal(api.messages.filter(message => message.role === "user").length, 1);
    assert.equal(api.messages.filter(message => String(message.id) === "21").length, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("final forms render after streamed explanations and keep that order after history reload", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { useCareerChat } = await import("./useCareerChat");
  const { CareerFormView } = await import("@/components/career/chat/CareerFormCard");
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/career" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let chat!: ReturnType<typeof useCareerChat>;
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  let history: ReturnType<typeof toUiMessage>[] = [];
  const saved = new Map<string | number, CareerMessagePayload>();
  function Harness() {
    chat = useCareerChat({
      conversationId: "conversation", user: { id: "user" } as User,
      persistedMessages: history, sessionPending: false,
      onMessagesChanged: messages => { for (const message of messages) saved.set(message.id, message); },
      fetchWithAuth: async () => new Response(new ReadableStream({ start(controller) { stream = controller; } }),
        { headers: { "Content-Type": "text/event-stream" } }),
    });
    return <>{chat.messages.map(message => <div key={message.id} data-message={message.id}>
      <p>{message.content}</p>
      {message.careerForm && <CareerFormView form={message.careerForm} onRespond={() => {}} />}
    </div>)}</>;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = (key = "live") => root.render(<MessagesProvider locale="ko"><Harness key={key} /></MessagesProvider>);
  const emit = (event: string, data: unknown) => act(async () => {
    stream.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  });
  const message = (id: number, content: string): CareerMessagePayload => ({
    id, role: "assistant", messageType: "chat", content, createdAt: `2026-11-02T02:15:0${id}Z`,
  });
  const progress = message(2, "저장된 이력서를 확인할게요.");
  const final = message(3, "지원서를 준비했어요. 아래에서 연락처를 확인해 주세요.");
  const forms = [4, 5].map(id => toTalentMessageResponse({
    id, user_id: "user", conversation_id: "conversation", role: "assistant",
    message_type: "career_form_presentation", content: "", created_at: `2026-11-02T02:15:0${id}Z`,
    payload: { formId: id * 10, revision: 1, kind: "form", title: `지원 확인 ${id - 3}`,
      items: [{ id: "phone", label: `연락처 ${id - 3}`, type: "text", content: "" }] },
  }));
  let pending!: Promise<void>;
  try {
    await act(async () => render());
    await act(async () => chat.setStage("chat"));
    await act(async () => { pending = chat.sendChatMessage({ text: "지원서를 준비해줘" }); });
    await emit("user_message", { message: { ...message(1, "지원서를 준비해줘"), role: "user" } });
    await emit("text_delta", { delta: progress.content });
    await emit("assistant_message", { message: progress, continuing: true });
    await emit("tool_status", { message: "지원 양식을 준비하고 있어요." });
    assert.equal(dom.window.document.querySelectorAll("input").length, 0);
    await emit("text_delta", { delta: final.content });
    assert.equal(dom.window.document.querySelectorAll("input").length, 0, "forms stay hidden through the final text stream");
    await emit("assistant_text_done", { ok: true });
    await emit("assistant_messages", { messages: [final, ...forms] });
    await act(async () => {
      stream.enqueue(new TextEncoder().encode('event: done\ndata: {"ok":true}\n\n'));
      stream.close(); await pending;
    });
    const assertOrder = () => {
      assert.deepEqual(chat.messages.map(item => Number(item.id)), [1, 2, 3, 4, 5]);
      const text = dom.window.document.body.textContent!;
      assert.ok(text.includes(final.content));
      assert.ok(text.indexOf(final.content) < text.indexOf("연락처 1"));
      assert.ok(text.indexOf("연락처 1") < text.indexOf("연락처 2"));
      assert.equal(dom.window.document.querySelectorAll("input").length, 2);
    };
    assertOrder();
    history = [...saved.values()].sort((a, b) => Number(a.id) - Number(b.id)).map(toUiMessage);
    await act(async () => render("reloaded"));
    assertOrder();
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
