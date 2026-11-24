import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useCareerSeenReceipt } from "./useCareerSeenReceipt";

test("only a chat that is on screen in a visible page reports the newest saved message", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let visibility: DocumentVisibilityState = "hidden";
  Object.defineProperty(dom.window.document, "visibilityState", { configurable: true, get: () => visibility });
  let displayed = true;
  Object.defineProperty(dom.window.HTMLElement.prototype, "checkVisibility", { configurable: true, value: () => displayed });
  const sent: unknown[] = [];
  const fetchWithAuth = async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  };
  function Harness({ messages }: { messages: Array<{ id: string | number }> }) {
    const ref = useRef<HTMLDivElement>(null);
    useCareerSeenReceipt({ conversationId: "conversation", messages, targetRef: ref, fetchWithAuth });
    return <div ref={ref} />;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = async (messages: Array<{ id: string | number }>) => act(async () => root.render(<Harness messages={messages} />));
  try {
    await render([{ id: 7 }, { id: "temp-user-x" }, { id: "live:invocation:a" }]);
    assert.deepEqual(sent, [], "a hidden page has not shown the reply");

    visibility = "visible";
    displayed = false;
    await act(async () => { dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange")); });
    assert.deepEqual(sent, [], "a chat hidden behind another mobile tab has not shown it either");

    displayed = true;
    await act(async () => { dom.window.dispatchEvent(new dom.window.Event("focus")); });
    assert.deepEqual(sent, [{ conversationId: "conversation", messageId: 7 }], "optimistic and live ids never count");

    await act(async () => { dom.window.dispatchEvent(new dom.window.Event("focus")); });
    assert.equal(sent.length, 1, "the same position is reported once");

    await render([{ id: 7 }, { id: "9" }]);
    assert.deepEqual(sent.at(-1), { conversationId: "conversation", messageId: 9 });
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
});
