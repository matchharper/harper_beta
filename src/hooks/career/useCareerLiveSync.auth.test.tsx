import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { RealtimeClient, type Session } from "@supabase/supabase-js";

test("Career channels follow session ownership, refresh, logout and re-login, including pending joins", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55431";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
  const { supabase } = await import("@/lib/supabase");
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { useCareerLiveSync } = await import("./useCareerLiveSync");
  const previousAuth = useAuthStore.getState();
  const dom = new JSDOM("<div id='root'></div>");
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const channels: Array<{
    owner: RealtimeClient;
    topic: string;
    joined: boolean;
    removed: boolean;
    on: () => unknown;
    subscribe: () => unknown;
    unsubscribe: () => Promise<string>;
  }> = [];
  const pendingAuth: Array<() => void> = [];
  const tokens: unknown[] = [];
  let holdRemoval = false;
  let finishRemoval: (() => void) | undefined;
  t.mock.method(RealtimeClient.prototype, "setAuth", (token: unknown) => {
    tokens.push(token);
    return new Promise<void>((resolve) => pendingAuth.push(resolve));
  });
  t.mock.method(
    RealtimeClient.prototype,
    "channel",
    function (this: RealtimeClient, topic: string) {
      const channel = {
        owner: this,
        topic,
        joined: false,
        removed: false,
        on() {
          return this;
        },
        subscribe() {
          this.joined = true;
          return this;
        },
        async unsubscribe() {
          this.removed = true;
          if (holdRemoval)
            await new Promise<void>((resolve) => {
              finishRemoval = resolve;
            });
          return "ok";
        },
      };
      channels.push(channel);
      return channel;
    }
  );
  t.mock.method(
    RealtimeClient.prototype,
    "removeAllChannels",
    async function (this: RealtimeClient) {
      await Promise.all(
        channels.filter((c) => c.owner === this).map((c) => c.unsubscribe())
      );
      return ["ok"];
    }
  );
  const session = (userId: string, token: string) =>
    ({ user: { id: userId }, access_token: token }) as Session;
  // Keep the visible user ID stale on purpose: the session is authoritative.
  function Harness({ userId = "a" }: { userId?: string }) {
    useCareerLiveSync({ enabled: true, userId, onSync() {} });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const resolveAuth = async () =>
    act(async () => {
      while (pendingAuth.length) pendingAuth.shift()!();
    });
  const setSession = async (value: Session | null) =>
    act(async () => {
      useAuthStore.setState({ session: value });
    });
  try {
    await setSession(null);
    await act(async () => root.render(<Harness />));
    assert.equal(
      channels.length,
      0,
      "a user ID without a session cannot join a private channel"
    );
    await setSession(session("a", "first-token"));
    await resolveAuth();
    assert.equal(channels[0].joined, true);
    assert.deepEqual(tokens, ["first-token"]);
    await setSession(null);
    assert.equal(channels[0].removed, true);
    await setSession(session("a", "relogin-token"));
    await resolveAuth();
    assert.equal(channels[1].joined, true);
    holdRemoval = true;
    await setSession(session("a", "refreshed-token"));
    assert.equal(channels[1].removed, true);
    await resolveAuth();
    assert.notEqual(
      channels[1].owner,
      channels[2].owner,
      "a new session cannot reuse a socket still closing the old topic"
    );
    await act(async () => {
      finishRemoval!();
    });
    holdRemoval = false;
    assert.equal(
      channels[2].joined,
      true,
      "refresh re-establishes a previously rejected channel"
    );
    await setSession(session("b", "other-user-token"));
    assert.equal(channels[2].removed, true);
    assert.equal(
      channels.length,
      3,
      "a stale user ID cannot subscribe as a different user"
    );
    await act(async () => root.render(<Harness userId="b" />));
    assert.equal(
      channels.length,
      3,
      "a channel is not created before authentication finishes"
    );
    // Simulate logout before React commits its cleanup and before setAuth resolves.
    await act(async () => {
      useAuthStore.setState({ session: null });
      while (pendingAuth.length) pendingAuth.shift()!();
    });
    assert.equal(
      channels.length,
      3,
      "logout cancels the pending join entirely"
    );
  } finally {
    await act(async () => root.unmount());
    useAuthStore.setState(previousAuth);
    t.mock.restoreAll();
    await supabase.auth.stopAutoRefresh();
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
