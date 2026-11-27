import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MessagesProvider } from "@/i18n/useMessage";
import type { BrowserSessionReopen, BrowserSessionViewData } from "./BrowserSessionCard";

// The dock module reaches the Supabase client, which needs these at import time.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

async function setup({ measured = false } = {}) {
  // Created before the DOM exists, the Supabase client opens no cross-tab channel that would keep the test running.
  await import("@/lib/supabase");
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
  // Desktop: the dock (not the phone sheet) places the cards.
  dom.window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as never;
  if (measured) {
    // Measured like a page: the chat 900px tall, the dock above the composer at 800px, each folded card 60px.
    const box = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 1000, width: 1000, height, x: 0, y: top, toJSON() {} });
    Object.defineProperty(dom.window.HTMLElement.prototype, "getBoundingClientRect", { configurable: true,
      value(this: HTMLElement) { return this.hasAttribute("data-career-chat-layout") ? box(0, 900) : box(800, 0); } });
    Object.defineProperty(dom.window.HTMLElement.prototype, "offsetHeight", { configurable: true,
      get(this: HTMLElement) { return this.hasAttribute("data-browser-placement") ? 60 : 0; } });
  }
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
  const root = createRoot(dom.window.document.getElementById("root")!);
  const state = { selected: null as string | null };
  const render = (views: BrowserSessionViewData[], claimed: ReadonlySet<string>,
    reopen?: (sessionId: string) => BrowserSessionReopen | null, anchors?: ReadonlyMap<string, HTMLElement>) => {
    const draw = () => root.render(
      <MessagesProvider locale="ko"><div data-career-chat-layout style={{ position: "relative" }}>
        <BrowserSessionDockView views={views} claimedSessionIds={claimed} selectedId={state.selected} reopen={reopen}
          anchors={anchors} onSelect={id => { state.selected = id; draw(); }} />
      </div></MessagesProvider>);
    return act(async () => draw());
  };
  const card = (id: string) => dom.window.document.querySelector(`[data-browser-session-id="${id}"]`)
    ?.closest<HTMLElement>("[data-browser-placement]");
  // Placement updates wait for an animation frame.
  const frames = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const cleanup = async () => {
    await act(async () => root.unmount());
    // A dialog returns focus on a timer after it unmounts: let it run while its document is still in place.
    await new Promise(resolve => setTimeout(resolve, 0));
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  };
  return { dom, state, render, card, frames, cleanup };
}

const running = (id: string): BrowserSessionViewData => ({
  session: { id, status: "running", revision: 1 }, liveUrl: `https://example.com/${id}`, browserAvailability: "active", executions: [],
});

test("a browser the progress panel stands for floats only once opened from there", async () => {
  const { dom, state, render, card, cleanup } = await setup();
  const views = ["application", "other"].map(running);
  const claimed = new Set(["application"]);
  try {
    await render(views, claimed);
    // Both stay mounted: the live viewer must not reconnect when the person opens it.
    assert.equal(dom.window.document.querySelectorAll("iframe").length, 2);
    assert.equal(card("application")?.getAttribute("data-browser-placement"), "claimed");
    assert.ok(card("application")?.classList.contains("invisible"));
    assert.equal(card("application")?.getAttribute("aria-hidden"), "true");
    assert.equal(card("other")?.getAttribute("data-browser-placement"), "dock");
    assert.equal(card("other")?.classList.contains("invisible"), false);

    // Opened from its row, the claimed browser shows like any selected one; closed again, it hides.
    state.selected = "application";
    await render(views, claimed);
    assert.equal(card("application")?.getAttribute("data-browser-placement"), "dock");
    assert.equal(card("application")?.classList.contains("invisible"), false);
    assert.equal(card("application")?.style.visibility, "", "not left hidden from when it waited out of sight");
    state.selected = null;
    await render(views, claimed);
    assert.equal(card("application")?.getAttribute("data-browser-placement"), "claimed");
  } finally {
    await cleanup();
  }
});

test("docked cards stack by their real heights, and one opened from a row goes on top instead of over the first", async () => {
  const { state, render, card, frames, cleanup } = await setup({ measured: true });
  const views = ["application", "other", "third"].map(running);
  const claimed = new Set(["application"]);
  const top = (id: string) => Number.parseFloat(card(id)?.style.top ?? "");
  try {
    await render(views, claimed);
    await frames();
    assert.equal(card("other")?.getAttribute("data-browser-dock-depth"), "0");
    assert.equal(card("third")?.getAttribute("data-browser-dock-depth"), "1");
    // 788px (12px above the dock) minus its own 60px; the next one a whole card and an 8px gap higher, not 40px.
    assert.equal(top("other"), 728);
    assert.equal(top("third"), 660);

    state.selected = "application";
    await render(views, claimed);
    await frames();
    assert.equal(card("application")?.getAttribute("data-browser-dock-depth"), "2");
    assert.equal(top("application"), 592, "above both, covering neither");
    assert.equal(top("other"), 728);
  } finally {
    await cleanup();
  }
});

test("a card the progress panel stands for appears in its conversation place without flying in from the dock", async () => {
  const { dom, render, card, cleanup } = await setup();
  const document = dom.window.document;
  // The conversation: each browser's place in a reply, scrolled out of view above it to start with.
  const timeline = document.createElement("div");
  timeline.setAttribute("data-career-timeline", "");
  const places = new Map(["application", "other"].map(id => [id, document.createElement("div")] as const));
  timeline.append(...places.values());
  document.body.append(timeline);
  const top = new Map([["application", -400], ["other", -400]]);
  const box = (left: number, y: number, width: number, height: number) =>
    ({ left, top: y, width, height, right: left + width, bottom: y + height, x: left, y, toJSON() {} });
  Object.defineProperty(dom.window.HTMLElement.prototype, "getBoundingClientRect", { configurable: true,
    value(this: HTMLElement) {
      const id = [...places].find(([, place]) => place === this)?.[0];
      if (id) return box(100, top.get(id)!, 526, 52);
      if (this.hasAttribute("data-career-timeline") || this.hasAttribute("data-career-chat-layout")) return box(0, 0, 1000, 700);
      // A card, wherever it is placed; the dock is the layout's bottom right corner.
      return this.hasAttribute("data-browser-placement") ? box(600, 600, 320, 56) : box(1000, 700, 0, 0);
    } });
  // Each placement move that is animated (a flight from where the card was to where it goes).
  const flights: string[] = [];
  Object.defineProperty(dom.window.HTMLElement.prototype, "animate", { configurable: true,
    value(this: HTMLElement) {
      flights.push(this.querySelector("[data-browser-session-id]")?.getAttribute("data-browser-session-id") ?? "?");
      return { cancel() {} };
    } });
  const scroll = (id: string, to: number) => act(async () => {
    top.set(id, to);
    document.dispatchEvent(new dom.window.Event("scroll"));
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  try {
    await render(["application", "other"].map(running), new Set(["application"]), undefined, places);
    assert.equal(card("application")?.getAttribute("data-browser-placement"), "claimed");
    assert.equal(card("other")?.getAttribute("data-browser-placement"), "dock");

    // 11/27: scrolled back to its reply, the panel's browser flew in from the bottom right corner, where it had waited
    // out of sight. It appears in place instead, and leaves the same way.
    await scroll("application", 300);
    assert.equal(card("application")?.getAttribute("data-browser-placement"), "inline");
    assert.equal(card("application")?.style.visibility, "");
    await scroll("application", -400);
    assert.equal(card("application")?.getAttribute("data-browser-placement"), "claimed");
    // Hidden the moment it is moved to the dock, not a frame later when it is marked hidden.
    assert.equal(card("application")?.style.visibility, "hidden");
    assert.deepEqual(flights, []);

    // A browser that waits in sight in the dock still moves there and back visibly.
    await scroll("other", 300);
    assert.equal(card("other")?.getAttribute("data-browser-placement"), "inline");
    assert.deepEqual(flights, ["other"]);
  } finally {
    timeline.remove();
    await cleanup();
  }
});

test("an open viewer whose browser stopped stays with its notice, and asking for it again folds it", async () => {
  const { dom, state, render, card, cleanup } = await setup();
  const login: BrowserSessionViewData = { ...running("application"), session: { id: "application", status: "human", revision: 2 } };
  const claimed = new Set(["application"]);
  const asked: string[] = [];
  const reopen = (sessionId: string): BrowserSessionReopen | null =>
    sessionId === "application" ? { onReopen: () => asked.push(sessionId) } : null;
  try {
    state.selected = "application";
    await render([login, running("other")], claimed, reopen);
    assert.equal(card("application")?.getAttribute("data-browser-placement"), "fullscreen");
    assert.doesNotMatch(card("application")?.textContent ?? "", /다시 열기/, "nothing to reopen while it is live");

    // The provider stopped it while the person had it open: it does not vanish under them.
    const stopped: BrowserSessionViewData = { ...login, browserAvailability: "stopped", liveUrl: null };
    await render([stopped, running("other")], claimed, reopen);
    const panel = card("application");
    assert.equal(panel?.getAttribute("data-browser-placement"), "dock");
    assert.match(panel?.textContent ?? "", /종료된 브라우저/);
    assert.match(panel?.textContent ?? "", /창이 닫혔어요\. 다시 열기를 누르면 Harper에게 다시 열어 달라고 보내요\./);
    assert.equal(panel?.querySelector("iframe"), null);
    assert.ok(![...panel!.querySelectorAll("button")].some(button => button.textContent === "완료"));
    const button = [...panel!.querySelectorAll("button")].find(item => item.textContent === "다시 열기");
    await act(async () => { button!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
    assert.deepEqual(asked, ["application"]);
    // Folded away: Harper's new browser comes as its own card, and the closed one leaves the dock.
    assert.equal(state.selected, null);
    assert.equal(card("application"), undefined);
    assert.ok(card("other"));
  } finally {
    await cleanup();
  }
});
