import assert from "node:assert/strict";
import test from "node:test";
import { RealtimeClient, type Session } from "@supabase/supabase-js";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

test("a visible workspace reconciles missed background replies without a new broadcast or reload", async (context) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { supabase } = await import("@/lib/supabase");
  const { useAuthStore } = await import("@/store/useAuthStore");
  const previousAuth = useAuthStore.getState();
  useAuthStore.setState({ session: { user: { id: "talent" }, access_token: "user-token" } as Session });
  const { useCareerLiveSync } = await import("./useCareerLiveSync");
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let subscribed: ((status: string) => void) | undefined;
  const channel = { on() { return this; }, subscribe(callback: (status: string) => void) { subscribed = callback; return this; }, async unsubscribe() { return "ok"; } };
  context.mock.method(RealtimeClient.prototype, "channel", () => channel);
  context.mock.method(RealtimeClient.prototype, "setAuth", async () => undefined);
  context.mock.method(RealtimeClient.prototype, "removeAllChannels", async () => ["ok"]);
  let reconcile: (() => void) | undefined;
  context.mock.method(dom.window, "setInterval", (callback: () => void, delay: number) => {
    assert.equal(delay, 30_000);
    reconcile = callback;
    return 42;
  });
  const clearInterval = context.mock.method(dom.window, "clearInterval", () => undefined);
  const pending: Array<() => void> = [];
  context.mock.method(dom.window, "setTimeout", (callback: () => void) => { pending.push(callback); return pending.length; });
  context.mock.method(dom.window, "clearTimeout", () => undefined);
  const received: string[][] = [];
  function Harness() {
    useCareerLiveSync({ enabled: true, userId: "talent", onSync: (scopes) => { received.push(scopes); } });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const flush = async () => { while (pending.length) await act(async () => pending.shift()!()); };
  try {
    await act(async () => root.render(<Harness />));
    subscribed?.("SUBSCRIBED");
    await flush();
    assert.deepEqual(received, [["all"]]);
    // A reply is persisted while its broadcast never reaches this subscriber.
    reconcile?.();
    await flush();
    assert.deepEqual(received, [["all"], ["messages"]]);
    Object.defineProperty(dom.window.document, "hidden", { configurable: true, value: true });
    reconcile?.();
    await flush();
    assert.equal(received.length, 2, "hidden tabs do not poll history");
    await act(async () => root.unmount());
    assert.deepEqual(clearInterval.mock.calls[0].arguments, [42]);
    reconcile?.();
    await flush();
    assert.equal(received.length, 2, "unmounted workspaces stop reconciling");
  } finally {
    useAuthStore.setState(previousAuth);
    dom.window.close();
    context.mock.restoreAll();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
