import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "@/lib/supabase";
import { useCareerPagePresence } from "./useCareerPagePresence";

test("hiding the page never reports a close; only the tab or browser closing it does", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const sent: Array<{ pageId: string; closed: boolean; auth: string | null; keepalive?: boolean }> = [];
  const fakeFetch = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push({ ...body, auth: (init?.headers as Record<string, string>)?.Authorization ?? null, keepalive: init?.keepalive });
    return new Response("{}", { status: 200 });
  };
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true, fetch: fakeFetch })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const auth = supabase.auth as any;
  const [getSession, onAuthStateChange] = [auth.getSession, auth.onAuthStateChange];
  auth.getSession = async () => ({ data: { session: { access_token: "token" } } });
  auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } });
  const pageEvent = (type: string, persisted: boolean) => {
    const event = new dom.window.Event(type) as Event & { persisted?: boolean };
    Object.defineProperty(event, "persisted", { value: persisted });
    return event;
  };
  function Harness({ enabled }: { enabled: boolean }) {
    useCareerPagePresence(enabled);
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<Harness enabled />));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].closed, false, "the page reports that it is open");
    assert.equal(sent[0].auth, "Bearer token");
    const pageId = sent[0].pageId;

    // Another tab, another app, or a phone screen turning off: the page is hidden, not closed.
    await act(async () => {
      dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
      dom.window.dispatchEvent(new dom.window.Event("blur"));
      dom.window.dispatchEvent(pageEvent("pagehide", true)); // kept in the back/forward cache
    });
    assert.ok(sent.every((report) => !report.closed), "hiding never reports a close");

    // Moving to another Harper screen keeps the same page open.
    await act(async () => root.render(<Harness enabled />));
    assert.ok(sent.every((report) => !report.closed));

    // The tab or browser closes the page.
    await act(async () => { dom.window.dispatchEvent(pageEvent("pagehide", false)); });
    assert.deepEqual(sent.at(-1), { pageId, closed: true, auth: "Bearer token", keepalive: true });

    // Leaving Career inside the same tab is not closing it.
    const before = sent.length;
    await act(async () => root.render(<Harness enabled={false} />));
    await act(async () => { dom.window.dispatchEvent(pageEvent("pagehide", false)); });
    assert.equal(sent.length, before);
  } finally {
    await act(async () => root.unmount());
    auth.getSession = getSession;
    auth.onAuthStateChange = onAuthStateChange;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
});
