import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "@/lib/supabase";
import type { CareerChatPanelContextValue } from "../CareerChatPanelContext";
import type { CareerHistoryOpportunity } from "../types";

test("a hiring post asks the user to reach out the way the post says", async () => {
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
    HTMLInputElement: dom.window.HTMLInputElement,
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
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  const require = createRequire(import.meta.url);
  const {
    default: ExternalOpportunityApplyModal,
  } = require("./ExternalOpportunityApplyModal");
  const { CareerChatPanelProvider } = require("../CareerChatPanelContext");
  const { MessagesProvider } = require("@/i18n/useMessage");
  const { supabase: browserSupabase } = require("@/lib/supabase");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const events: string[] = [];
  const context = {
    user: { id: "fixture-user" },
    messages: [], conversationId: "fixture-conversation",
    stage: "completed",
    isOnboardingDone: true,
    onSendChatMessage: (
      args: Parameters<CareerChatPanelContextValue["onSendChatMessage"]>[0]
    ) => {
      events.push(`send:${args.text}`);
      return Promise.resolve();
    },
  } as unknown as CareerChatPanelContextValue;
  const item = {
    id: "hiring-post",
    roleId: "hiring-role",
    companyName: "Example",
    title: "GTM Lead",
    externalJdUrl: "https://www.linkedin.com/posts/founder_hiring",
    hiringPost: {
      posterName: "Founder",
      posterTitle: "CEO",
      posterProfileUrl: null,
      contactMethod: "email",
      contactEmail: "jobs@example.com",
      applyUrl: null,
      postedAt: null,
    },
  } as CareerHistoryOpportunity;
  const render = async (key: string) =>
    act(async () =>
      root.render(
        <RouterContext.Provider value={{ query: {}, pathname: "/career", isReady: true } as any}><QueryClientProvider client={queryClient}><MessagesProvider locale="ko">
          <CareerChatPanelProvider value={context}>
            <ExternalOpportunityApplyModal
              key={key}
              item={item}
              pending={false}
              error={null}
              onSave={async (stage: "saved" | "applied") => {
                events.push(`save:${stage}`);
                return true;
              }}
              onClose={() => events.push("close")}
              onApplied={() => events.push("applied-tab")}
              onOpenLink={(url: string) => events.push(`open:${url}`)}
              onOpenChat={() => events.push("chat")}
            />
          </CareerChatPanelProvider>
        </MessagesProvider></QueryClientProvider></RouterContext.Provider>
      )
    );
  const button = (label: string) => {
    const found = [...dom.window.document.querySelectorAll("button")].find(
      (el) => el.textContent === label
    );
    assert.ok(found, label);
    return found;
  };
  try {
    await render("open");
    const text = dom.window.document.body.textContent ?? "";
    assert.match(text, /연락해 볼래요/);
    assert.match(text, /올린 사람: Founder · CEO/);
    assert.match(text, /글에 적힌 이메일\(jobs@example.com\)로 연락해 달라고 했어요/);
    assert.ok(!text.includes("채용 페이지에서 지원"));
    await act(async () => button("글 열기").click());
    assert.deepEqual(events, ["open:https://www.linkedin.com/posts/founder_hiring"], "opening the post changes nothing");

    events.length = 0;
    await act(async () => button("Harper와 연락 준비하기").click());
    assert.deepEqual(events, [
      "save:saved",
      "send:Example · GTM Lead 채용 글 작성자에게 연락하고 싶어. 보낼 메시지를 같이 준비해줘.",
      "close",
      "chat",
    ]);

    events.length = 0;
    await render("sent");
    await act(async () => button("직접 연락했어요").click());
    assert.deepEqual(events, ["save:applied", "close", "applied-tab"]);
  } finally {
    await act(async () => {
      root.unmount();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await supabase.auth.stopAutoRefresh();
    await browserSupabase.auth.stopAutoRefresh();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
