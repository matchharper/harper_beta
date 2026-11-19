import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

test("/career waits for the onboarding status and redirects only a user who needs onboarding", async () => {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "http://localhost/career", pretendToBeVisual: true }
  );
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  const require = createRequire(import.meta.url);
  const { useTalentOnboardingRedirect } = require("./useTalentOnboardingStatus");
  const { MessagesProvider } = require("@/i18n/useMessage");
  const { supabase } = require("@/lib/supabase");
  const originalGetSession = supabase.auth.getSession;
  const originalFetch = globalThis.fetch;
  supabase.auth.getSession = async () => ({
    data: { session: { access_token: "fixture-token" } },
    error: null,
  });

  let respond: (needsOnboarding: boolean) => void = () => {};
  globalThis.fetch = (async (url: string) => {
    assert.equal(url, "/api/talent/onboarding/status");
    const needsOnboarding = await new Promise<boolean>((resolve) => {
      respond = resolve;
    });
    return new Response(JSON.stringify({ needsOnboarding }), { status: 200 });
  }) as typeof fetch;

  const replaced: unknown[] = [];
  let latest: { isOnboardingDone: boolean; needsOnboarding: boolean } | null =
    null;
  const Probe = () => {
    latest = useTalentOnboardingRedirect({
      enabled: true,
      inviteToken: null,
      mail: null,
      userId: "fixture-user",
    });
    return null;
  };
  const router = {
    query: { source: "landing", lid: "fixture-lid" },
    pathname: "/career/[[...tab]]",
    asPath: "/career?source=landing&lid=fixture-lid",
    isReady: true,
    replace: async (target: unknown) => {
      replaced.push(target);
      return true;
    },
  };
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = async (queryClient: QueryClient) =>
    act(async () =>
      root.render(
        <RouterContext.Provider value={router as any}>
          <QueryClientProvider client={queryClient}>
            <MessagesProvider locale="ko">
              <Probe />
            </MessagesProvider>
          </QueryClientProvider>
        </RouterContext.Provider>
      )
    );
  const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

  try {
    // Existing member: the workspace stays on loading until the status arrives, then opens without a redirect.
    const existing = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(existing);
    await flush();
    assert.equal(latest!.isOnboardingDone, false);
    assert.deepEqual(replaced, []);
    await act(async () => respond(false));
    await flush();
    assert.equal(latest!.isOnboardingDone, true);
    assert.deepEqual(replaced, []);

    // New member: the loading screen goes straight to onboarding, keeping the landing attribution.
    await act(async () => root.render(null));
    const fresh = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(fresh);
    await flush();
    assert.deepEqual(replaced, []);
    await act(async () => respond(true));
    await flush();
    assert.equal(latest!.isOnboardingDone, false);
    assert.deepEqual(replaced, [
      {
        pathname: "/career/onboarding",
        query: { lid: "fixture-lid", source: "landing" },
      },
    ]);
  } finally {
    await act(async () => root.unmount());
    supabase.auth.getSession = originalGetSession;
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
});
