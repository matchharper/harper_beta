import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { MessagesProvider } from "@/i18n/useMessage";

test("durable Stop includes all in-flight identities, remains retryable, and permits new input after confirmation", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { useCareerChat } = await import("./useCareerChat");
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/career" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let api!: ReturnType<typeof useCareerChat>;
  let hasDurableWork = false;
  let failStop = true;
  let stopBody: any;
  const requests: any[] = [];
  const responses: Array<(stopped?: boolean) => void> = [];
  const fetchWithAuth = async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/stop")) {
      stopBody = body;
      if (failStop) return Response.json({ error: "Try Stop again" }, { status: 503 });
      return Response.json({ ok: true, userMessages: requests.map((request, index) => ({ id: index + 1, role: "user", content: request.message,
        messageType: "chat", clientRequestId: request.clientRequestId, turnStopped: true })) });
    }
    requests.push(body);
    const id = requests.length;
    return await new Promise<Response>(resolve => responses.push((stopped = false) => resolve(Response.json({ userMessage: {
      id, role: "user", content: body.message, messageType: "chat", clientRequestId: body.clientRequestId, turnStopped: stopped,
    } }, { status: 202 }))));
  };
  function Harness() { api = useCareerChat({ user: { id: "user" } as User, conversationId: "conversation", isOnboardingDone: true,
    sessionPending: false, persistedMessages: [], fetchWithAuth, hasDurableWork }); return null; }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = () => root.render(<MessagesProvider locale="ko"><Harness /></MessagesProvider>);
  try {
    await act(async () => render());
    let pending!: Promise<void>[];
    await act(async () => { pending = Array.from({ length: 5 }, (_, i) => api.sendChatMessage({ text: `Request ${i}` })); });
    assert.equal(api.canStopChat, true);
    assert.equal(api.chatPending, false, "ongoing durable work must not lock sending");
    await act(async () => api.cancelActiveChat());
    assert.equal(api.canStopChat, true, "failed Stop leaves requests attached and retryable");
    assert.equal(api.chatError, "Try Stop again");
    assert.equal(stopBody.stopAll, true);
    assert.equal(stopBody.clientRequestIds.length,5,"Stop includes queued admissions before they reach the server");
    assert.ok(stopBody.clientRequestIds.includes(requests[0].clientRequestId));
    failStop = false;
    await act(async () => api.cancelActiveChat());
    assert.equal(api.canStopChat, false);
    assert.equal(api.chatAdmissionPending, false);
    assert.equal(api.messages.length, 5, "confirmed and queued inputs remain visible");
    for (let index=0; index<5; index++) {
      await act(async () => { responses[index](true); await pending[index]; });
    }
    assert.equal(api.messages.length, 5);
    assert.ok(api.messages.every(message => message.turnStopped));
    let fresh!: Promise<void>;
    await act(async () => { fresh = api.sendChatMessage({ text: "Start again" }); });
    assert.equal(api.canStopChat, true);
    assert.ok(!stopBody.clientRequestIds.includes(requests[5].clientRequestId));
    await act(async () => { responses[5](); await fresh; });
    assert.equal(api.chatError, "");
    assert.equal(api.messages.at(-1)?.turnStopped, false);
    hasDurableWork = true;
    await act(async () => render());
    assert.equal(api.canStopChat, true, "a reloaded conversation derives Stop from durable work");
    await act(async () => api.cancelActiveChat());
    assert.deepEqual(stopBody.clientRequestIds, []);
    assert.equal(stopBody.stopAll, true, "a reloaded tab can Stop without a local active message");
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
