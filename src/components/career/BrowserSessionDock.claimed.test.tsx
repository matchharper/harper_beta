import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MessagesProvider } from "@/i18n/useMessage";
import type { BrowserSessionViewData } from "./BrowserSessionCard";

// The dock module reaches the Supabase client, which needs these at import time.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

test("a browser the progress panel stands for floats only once opened from there", async () => {
  // Created before the DOM exists, the Supabase client opens no cross-tab channel that would keep the test running.
  await import("@/lib/supabase");
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
  // Desktop: the dock (not the phone sheet) places the cards.
  dom.window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as never;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, DOMRect: dom.window.DOMRect,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent, sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage,
    MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0), cancelAnimationFrame: clearTimeout,
    IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  // Import after the DOM is ready so Radix enables its browser layout effects.
  const { BrowserSessionDockView } = await import("./BrowserSessionDock");
  const views: BrowserSessionViewData[] = ["application", "other"].map(id => ({
    session: { id, status: "running", revision: 1 }, liveUrl: `https://example.com/${id}`, browserAvailability: "active", executions: [],
  }));
  const claimed = new Set(["application"]);
  const root = createRoot(dom.window.document.getElementById("root")!);
  let selected: string | null = null;
  const render = () => root.render(
    <MessagesProvider locale="ko"><div data-career-chat-layout style={{ position: "relative" }}>
      <BrowserSessionDockView views={views} claimedSessionIds={claimed} selectedId={selected}
        onSelect={id => { selected = id; render(); }} />
    </div></MessagesProvider>);
  const card = (id: string) => dom.window.document.querySelector(`[data-browser-session-id="${id}"]`)
    ?.closest<HTMLElement>("[data-browser-placement]");
  try {
    await act(async () => render());
    // Both stay mounted: the live viewer must not reconnect when the person opens it.
    assert.equal(dom.window.document.querySelectorAll("iframe").length, 2);
    assert.equal(card("application")?.getAttribute("data-browser-placement"), "claimed");
    assert.ok(card("application")?.classList.contains("invisible"));
    assert.equal(card("application")?.getAttribute("aria-hidden"), "true");
    assert.equal(card("other")?.getAttribute("data-browser-placement"), "dock");
    assert.equal(card("other")?.classList.contains("invisible"), false);

    // Opened from its row, the claimed browser shows like any selected one; closed again, it hides.
    await act(async () => { selected = "application"; render(); });
    assert.equal(card("application")?.getAttribute("data-browser-placement"), "dock");
    assert.equal(card("application")?.classList.contains("invisible"), false);
    await act(async () => { selected = null; render(); });
    assert.equal(card("application")?.getAttribute("data-browser-placement"), "claimed");
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});
