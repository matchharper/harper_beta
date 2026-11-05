import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { MessagesProvider } from "@/i18n/useMessage";
import type { CareerMessagePayload } from "@/components/career/types";

for (const {merged, finish} of [{merged:false,finish:true}, {merged:true,finish:true}, {merged:true,finish:false}]) test(`progress messages survive further tools, failure, and history hydration (${merged ? "merged" : "separate"}, final=${finish})`, async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { useCareerChat } = await import("./useCareerChat");
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/career" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let chat!: ReturnType<typeof useCareerChat>;
  const saved = new Map<number | string, CareerMessagePayload>();
  const history: Parameters<typeof useCareerChat>[0]["persistedMessages"] = [];
  function Harness() {
    chat = useCareerChat({ conversationId: "conversation", user: { id: "user" } as User,
      persistedMessages: history, sessionPending: false,
      onMessagesChanged: messages => { for (const message of messages) saved.set(message.id, message); },
      fetchWithAuth: async () => new Response(new ReadableStream({ start(c) { controller = c; } }),
        { headers: { "Content-Type": "text/event-stream" } }),
    });
    return <>{chat.messages.map(message => <p key={message.workReplyId ?? message.id}>{message.content}{message.workEvents?.map(event => event.text).join("\n")}</p>)}</>;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const emit = async (event: string, data: unknown) => act(async () => {
    controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  });
  const message = (id: number, content: string) => ({ id, role: "assistant", content,
    messageType: "chat", createdAt: `2026-10-29T00:00:0${id}.000Z` });
  let pending!: Promise<void>;
  try {
    await act(async () => root.render(<MessagesProvider locale="ko"><Harness /></MessagesProvider>));
    await act(async () => chat.setStage("chat"));
    await act(async () => { pending = chat.sendChatMessage({ text: "자료를 확인해줘" }); });
    await emit("user_message", { message: { ...message(1, "자료를 확인해줘"), role: "user" } });
    let cumulative = "";
    for (const [id, text] of [[2, "자료부터 확인할게요."], [3, "관련 경험을 찾았어요. 추가 내용을 확인할게요."]] as const) {
      if (!merged) await emit("text_delta", { delta: text });
      cumulative = [cumulative, text].filter(Boolean).join("\n\n");
      if (!merged) assert.ok(dom.window.document.body.textContent?.includes(text));
      await emit(merged ? "assistant_progress" : "assistant_message", {
        message: merged ? { ...message(2, ""), messageType: "career_turn_activity", workEvents: [{id:"message:0",kind:"message",text:cumulative}], workReplyId: "message:1", workPending: true } : message(id, text), continuing: true });
      assert.equal(chat.chatPending, true);
      await emit("tool_status", { message: "자료 확인 중" });
      assert.equal(chat.messages.filter(item => merged ? item.workEvents?.[0]?.text === cumulative : item.content === text).length, 1);
    }
    if (merged && finish) {
      await emit("assistant_message", { message: { ...message(2, cumulative), workReplyId: "message:1", workPending: false } });
    }
    assert.deepEqual([...saved.keys()], !finish ? [] : merged ? [1, 2] : [1, 2, 3]);
    await emit("error", { error: "연결이 끊겼습니다" });
    await act(async () => { controller.close(); await pending; });
    assert.equal(chat.chatPending, false);
    if (!finish) {
      const partial = chat.messages.find(item => item.workEvents);
      assert.ok(partial);
      assert.ok(partial.workEvents?.[0].text.includes("자료"));
      assert.equal(partial.workPending, false);
      return;
    }
    assert.equal(chat.messages.filter(item => item.role === "assistant" && item.content).length, merged ? 1 : 2);
    // Read the same persisted rows back as a fresh page would.
    history.push(...[...saved.values()].map(item => ({ ...item, id: String(item.id) })) as typeof history);
    await act(async () => root.render(<MessagesProvider locale="ko"><Harness key="reloaded" /></MessagesProvider>));
    assert.deepEqual(chat.messages.map(item => item.content), [...saved.values()].map(item => item.content));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
