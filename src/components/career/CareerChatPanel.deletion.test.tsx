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

test("confirmed deletion removes Harper and Worked immediately, survives stale polls, and preserves failed deletes", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { supabase } = await import("@/lib/supabase");
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/career", pretendToBeVisual: true });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Node: dom.window.Node, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = module => { module.exports = {}; };
  const { createRoot } = await import("react-dom/client");
  const { MessagesProvider } = await import("@/i18n/useMessage");
  const { useCareerWorkspaceUiStore } = await import("@/store/useCareerWorkspaceUiStore");
  const { CareerChatPanelProvider } = await import("./CareerChatPanelContext");
  const { CareerSidebarProvider } = await import("./CareerSidebarContext");
  const { CareerOpenFormsSnapshotContext } = await import("@/hooks/career/useCareerOpenForms");
  const { default: CareerChatPanel } = await import("./CareerChatPanel");
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: { access_token: "fixture" } }, error: null }));
  t.mock.method(globalThis, "fetch", async () => Response.json({ sessions: [], outputs: [], opportunities: [], actions: [] }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  useCareerWorkspaceUiStore.setState({ conversationVersion: "professional" });
  const base = { role: "assistant" as const, createdAt: "2026-11-05T00:00:01Z", workReplyId: "invocation:a", workStartedAt: "2026-11-05T00:00:01Z" };
  const activity = { ...base, id: 2, content: "", messageType: "career_turn_activity", thinkingLogs: ["지원서 확인 중"], workPending: true };
  const final = { ...base, id: 3, messageType: "chat", content: "지원서를 확인했어요.", workPending: false, workCompletedAt: "2026-11-05T00:00:10Z" };
  let finishDelete: (deleted: boolean) => void = () => {};
  let calls = 0;
  const panel = {
    user: { id: "fixture" }, conversationId: "fixture", stage: "completed", inputMode: "text", isOnboardingDone: true,
    messages: [activity, final], activeThinkingLogs: [], sessionReengagementThinkingLogs: [], thinkingLogsByMessageId: {},
    profileLinks: [], pendingActionsOverride: [], interviewProgress: { percent: 100 }, scrollRef: { current: null },
    onDeleteMessage: async (id: string | number) => {
      assert.equal(id, 3);
      calls += 1;
      return new Promise<boolean>(resolve => { finishDelete = resolve; });
    },
  } as unknown as CareerChatPanelContextValue;
  const render = () => act(async () => root.render(
    <QueryClientProvider client={client}>
      <RouterContext.Provider value={{ isReady: true, locale: "ko", query: {} } as NextRouter}>
        <MessagesProvider locale="ko" persistPreference={false}>
          <CareerSidebarProvider value={{} as CareerSidebarContextValue}>
            <CareerChatPanelProvider value={panel}>
              <CareerOpenFormsSnapshotContext.Provider value={{ forms: [], pending: 0, latestMessageId: 3, completionCursor: null, turns: [activity, final], activities: [] }}>
                <CareerChatPanel />
              </CareerOpenFormsSnapshotContext.Provider>
            </CareerChatPanelProvider>
          </CareerSidebarProvider>
        </MessagesProvider>
      </RouterContext.Provider>
    </QueryClientProvider>
  ));
  const deleteButton = () => dom.window.document.querySelector<HTMLButtonElement>('button[aria-label="메시지 삭제"]')!;
  const confirmButton = () => dom.window.document.querySelector<HTMLButtonElement>('button[aria-label="메시지 삭제를 확정하려면 다시 누르세요."]')!;
  try {
    await render();
    assert.match(dom.window.document.body.textContent!, /Worked for 9s/);
    await act(async () => deleteButton().click());
    await act(async () => confirmButton().click());
    assert.equal(calls, 1);
    await act(async () => finishDelete(false));
    assert.match(dom.window.document.body.textContent!, /지원서를 확인했어요/);
    if (deleteButton()) await act(async () => deleteButton().click());
    await act(async () => confirmButton().click());
    await act(async () => finishDelete(true));
    assert.equal(calls, 2);
    assert.doesNotMatch(dom.window.document.body.textContent!, /지원서를 확인했어요|Worked|지원서 확인 중/);
    await render(); // Both history and work snapshots can still contain the deleted reply.
    assert.doesNotMatch(dom.window.document.body.textContent!, /지원서를 확인했어요|Worked|지원서 확인 중/);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    dom.window.close();
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else delete require.extensions[".css"];
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
