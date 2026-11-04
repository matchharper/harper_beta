import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import type { CareerChatPanelContextValue } from "./CareerChatPanelContext";
import type { CareerSidebarContextValue } from "./CareerSidebarContext";

test("jobs draft survives URL cleanup and session bootstrap without remounting the chat", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { supabase } = await import("@/lib/supabase");
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/career?source=official_jobs&job=Engineer",
    pretendToBeVisual: true,
  });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => { module.exports = {}; };
  t.after(() => {
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else delete require.extensions[".css"];
  });

  const { createRoot } = await import("react-dom/client");
  const { MessagesProvider } = await import("@/i18n/useMessage");
  const { CareerChatPanelProvider } = await import("./CareerChatPanelContext");
  const { CareerSidebarProvider } = await import("./CareerSidebarContext");
  const { default: CareerChatPanel } = await import("./CareerChatPanel");
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: { access_token: "fixture" } }, error: null }));
  t.mock.method(globalThis, "fetch", async () => Response.json({ sessions: [], outputs: [], opportunities: [], actions: [] }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const draft = "Engineer 역할에 관심이 있어요.";
  let panel = {
    user: { id: "bootstrap-user" },
    conversationId: null,
    sessionPending: true,
    stage: "completed",
    inputMode: "text",
    isOnboardingDone: true,
    messages: [],
    activeThinkingLogs: [],
    sessionReengagementThinkingLogs: [],
    thinkingLogsByMessageId: {},
    profileLinks: [],
    pendingActionsOverride: [],
    interviewProgress: { percent: 100 },
    scrollRef: { current: null },
    initialChatDraft: draft,
    initialChatDraftKey: "official_jobs:ko:engineer",
    initialChatOpportunityMention: { roleId: "role-engineer", label: "Engineer" },
  } as unknown as CareerChatPanelContextValue;
  const render = () => act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterContext.Provider value={{ isReady: true, locale: "ko", query: {} } as NextRouter}>
          <MessagesProvider locale="ko">
            <CareerSidebarProvider value={{} as CareerSidebarContextValue}>
              <CareerChatPanelProvider value={panel}>
                <CareerChatPanel />
              </CareerChatPanelProvider>
            </CareerSidebarProvider>
          </MessagesProvider>
        </RouterContext.Provider>
      </QueryClientProvider>
    );
  });
  const composer = () => dom.window.document.querySelector<HTMLTextAreaElement>("#career-chat-composer")!;
  try {
    await render();
    const original = composer();
    assert.ok(original);
    assert.equal(original.value, draft);

    // The onboarding-status request finishes before the slower session request.
    dom.window.history.replaceState(null, "", "/career?source=official_jobs");
    panel = { ...panel, initialChatDraft: undefined, initialChatDraftKey: undefined, initialChatOpportunityMention: undefined };
    await render();
    panel = { ...panel, conversationId: "conversation-a", sessionPending: false };
    await render();
    assert.equal(composer(), original, "session bootstrap preserves the actual input node");
    assert.equal(composer().value, draft);

    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(original, `${draft} 근무 방식도 궁금해요.`);
      original.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    panel = { ...panel, conversationId: null, sessionPending: true };
    await render();
    panel = { ...panel, conversationId: "conversation-a", sessionPending: false };
    await render();
    assert.equal(composer(), original, "refreshing the same conversation preserves edits");
    assert.equal(composer().value, `${draft} 근무 방식도 궁금해요.`);

    panel = { ...panel, conversationId: "conversation-b" };
    await render();
    assert.notEqual(composer(), original, "a different conversation resets local chat state");
    assert.equal(composer().value, "");
    const second = composer();
    panel = { ...panel, user: { ...panel.user!, id: "another-user" } };
    await render();
    assert.notEqual(composer(), second, "a different account also resets local chat state");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    await supabase.auth.stopAutoRefresh();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
