import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

test("call identity and explicit completion stay separate from hanging up", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const require = createRequire(import.meta.url);
  const { supabase } = require("@/lib/supabase");
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "http://localhost", pretendToBeVisual: true }
  );
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Event: dom.window.Event,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    DocumentFragment: dom.window.DocumentFragment,
    MutationObserver: dom.window.MutationObserver,
    CustomEvent: dom.window.CustomEvent,
    NodeFilter: dom.window.NodeFilter,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  }

  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };
  const { default: CareerCallScreen } = require("./CareerCallScreen");
  const { CareerChatPanelProvider } = require("../CareerChatPanelContext");
  const { MessagesProvider } = require("@/i18n/useMessage");
  const root = createRoot(dom.window.document.getElementById("root")!);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: { access_token: "fixture" } }, error: null }));
  t.mock.method(globalThis, "fetch", async () => Response.json({ sessions: [] }));
  let onboarding = false;
  let screenKey = 0;
  const endings: unknown[] = [];
  const render = async () => act(async () => {
      root.render(
        <QueryClientProvider client={client}>
        <RouterContext.Provider value={{ isReady: true, locale: "ko", query: {} } as NextRouter}>
        <MessagesProvider locale="ko">
          <CareerChatPanelProvider
            value={
              {
                forceCompletePending: false,
                interviewProgress: {
                  canForceComplete: onboarding,
                  filledCount: 2,
                  percent: 20,
                  remainingCount: 8,
                  totalCount: 10,
                },
                isOnboardingDone: false,
                onboardingWrapupPending: false,
              } as never
            }
            callValue={{
              callConnectionStatus: "connected",
              callTranscriptEntries: [],
              isAssistantSpeaking: false,
              isVoiceToolExecuting: false,
              liveUserTranscriptPlacement: "beforeCurrentAssistant",
              mockInterviewDisplay: onboarding ? null : {
                companyLogoUrl: "https://example.com/logo.png",
                companyName: "Example Company",
                roleTitle: "Staff Engineer",
              },
              onEndCallMode: (options?: { forceCompleteOnboarding?: boolean }) => { endings.push(options); },
              onToggleVoiceMute: () => {},
              voiceActiveToolNames: [],
              voiceMuted: false,
              voiceTranscript: "",
            }}
          >
            <CareerCallScreen key={screenKey} />
          </CareerChatPanelProvider>
        </MessagesProvider>
        </RouterContext.Provider>
        </QueryClientProvider>
      );
    });
  try {
    await render();

    const text = dom.window.document.body.textContent ?? "";
    assert.match(text, /Harper/);
    assert.match(text, /Example Company/);
    assert.match(text, /Staff Engineer/);
    assert.ok(dom.window.document.querySelector('img[alt="Example Company"]'));
    assert.equal(
      dom.window.document.querySelector('[role="progressbar"]'),
      null
    );
    onboarding = true;
    await render();
    assert.equal(dom.window.document.querySelector('[role="progressbar"]'), null);
    const stop = dom.window.document.querySelector('button[aria-label="통화 종료"]') as HTMLButtonElement;
    assert.ok(stop);
    await act(async () => { stop.click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
    assert.deepEqual(endings, [undefined]);
    screenKey++;
    await render();
    const complete = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.includes('지금 마무리하기'));
    assert.ok(complete);
    await act(async () => { complete.click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
    assert.deepEqual(endings, [undefined, { forceCompleteOnboarding: true }]);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else Reflect.deleteProperty(require.extensions, ".css");
    client.clear();
    await supabase.auth.stopAutoRefresh();
    dom.window.close();
  }
});
