import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MessagesProvider } from "@/i18n/useMessage";
import { supabase } from "@/lib/supabase";

test("an email link opens the exact owned browser after authentication, even with another conversation loaded", async (t) => {
  const sessionId = "10000000-0000-4000-8000-000000000001";
  const otherId = "20000000-0000-4000-8000-000000000002";
  const dom = new JSDOM('<div id="root"></div>', { url: `https://example.test/career?browserSession=${sessionId}`, pretendToBeVisual: true });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, DOMRect: dom.window.DOMRect, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { BrowserSessionProvider, BrowserSessionDock } = await import("./BrowserSessionDock");
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: { access_token: "synthetic" } }, error: null }));
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push(url);
    assert.equal(init.method, undefined, "opening a link must not execute a browser action");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer synthetic");
    if (url.includes("conversationId=")) return Response.json({ sessions: [] });
    assert.ok(url.includes(`sessionId=${sessionId}`), "history must not override the linked browser");
    return Response.json({ session: { id: sessionId, status: "human", revision: 2 }, browserAvailability: "active", liveUrl: "https://example.test/owned-viewer", executions: [] });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  let authenticated = false;
  const router = { query: { browserSession: sessionId }, isReady: true } as any;
  const render = () => root.render(
    <RouterContext.Provider value={router}>
      <QueryClientProvider client={client}>
        <MessagesProvider locale="ko">
          <BrowserSessionProvider conversationId="different-conversation" enabled={authenticated} messages={[{ id: 10, role: "assistant", content: `[[browser:${otherId}]]` } as any]}>
            <div style={{ position: "relative" }}><BrowserSessionDock /></div>
          </BrowserSessionProvider>
        </MessagesProvider>
      </QueryClientProvider>
    </RouterContext.Provider>
  );
  try {
    await act(async () => render());
    assert.equal(requests.length, 0, "viewer data requires an authenticated user");
    authenticated = true;
    await act(async () => render());
    for (let i = 0; i < 20 && !dom.window.document.querySelector("iframe"); i++)
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    const viewer = dom.window.document.querySelector(`[data-browser-session-id="${sessionId}"]`);
    assert.ok(viewer);
    assert.ok(viewer.querySelector("iframe"));
    assert.equal(viewer.getAttribute("data-browser-expanded"), "true");
    assert.equal(dom.window.document.querySelector(`[data-browser-session-id="${otherId}"]`), null);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    await new Promise(resolve => setTimeout(resolve, 0));
    await supabase.auth.stopAutoRefresh();
    dom.window.close();
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
