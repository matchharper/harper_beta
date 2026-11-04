import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { supabase } from "@/lib/supabase";
import { MessagesProvider } from "@/i18n/useMessage";
import {
  CareerChatPanelProvider,
  type CareerChatPanelContextValue,
} from "../CareerChatPanelContext";
import {
  ApplicationHistoryProvider,
  useApplicationHistory,
} from "./ApplicationPreparationContext";

test("historical active applications hydrate cards without reopening a mode or continuing work", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const globals = {
    window: dom.window,
    document: dom.window.document,
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
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const auth = mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { access_token: "test" } },
    error: null,
  }));
  const requests: { url: string; method?: string }[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), method: init?.method });
    return Response.json({
      session: {
        messageId: 10,
        state: { status: "active", browser: { status: "waiting" } },
      },
      outputs: [
        {
          id: 20,
          role: "assistant",
          content: "과거 준비 내용",
          messageType: "application_draft",
          createdAt: "2026-10-29T00:00:00Z",
        },
      ],
    });
  });
  let history: ReturnType<typeof useApplicationHistory> | undefined;
  let sends = 0;
  function Capture() {
    history = useApplicationHistory();
    return null;
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = (chatPending: boolean) =>
    root.render(
      <RouterContext.Provider value={{ query: {}, pathname: "/career", isReady: true } as any}><QueryClientProvider client={queryClient}><MessagesProvider locale="ko">
        <CareerChatPanelProvider
          value={
            {
              messages: [], conversationId: "conversation",
              chatPending,
              onSendChatMessage: async () => {
                sends++;
              },
            } as unknown as CareerChatPanelContextValue
          }
        >
          <ApplicationHistoryProvider>
            <Capture />
          </ApplicationHistoryProvider>
        </CareerChatPanelProvider>
      </MessagesProvider></QueryClientProvider></RouterContext.Provider>
    );
  try {
    await act(async () => render(false));
    assert.equal(history?.record, null);
    assert.equal(history?.drafts[0]?.content, "과거 준비 내용");
    await act(async () => render(true));
    await act(async () => render(false));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, undefined);
    assert.equal(sends, 0);
    assert.equal(await history?.command({ operation: "resume" }), false);
    assert.equal(requests.length, 1);
  } finally {
    await act(async () => root.unmount());
    auth.mock.restore();
    fetchMock.mock.restore();
    dom.window.close();
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
  }
});
