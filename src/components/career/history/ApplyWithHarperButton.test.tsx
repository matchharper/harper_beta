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

test("role CTA sends the selected role immediately, opens chat during streaming and prevents duplicates", async () => {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "http://localhost", pretendToBeVisual: true }
  );
  const globals = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Event: dom.window.Event,
    HTMLElement: dom.window.HTMLElement,
    CustomEvent: dom.window.CustomEvent,
    Element: dom.window.Element,
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
  require.extensions[".css"] = (module) => { module.exports = {}; };
  const { default: ApplyWithHarperButton } = require("./ApplyWithHarperButton");
  const { CareerChatPanelProvider } = require("../CareerChatPanelContext");
  const { MessagesProvider } = require("@/i18n/useMessage");
  const { supabase: browserSupabase } = require("@/lib/supabase");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const calls: Parameters<
    CareerChatPanelContextValue["onSendChatMessage"]
  >[0][] = [];
  const events: string[] = [];
  let finish: () => void = () => {};
  const context = {
    user: { id: "fixture-user" },
    messages: [], conversationId: "fixture-conversation",
    stage: "completed",
    isOnboardingDone: true,
    sessionPending: false,
    profilePending: false,
    chatPending: false,
    assistantTyping: false,
    onSendChatMessage: (
      args: Parameters<CareerChatPanelContextValue["onSendChatMessage"]>[0]
    ) => {
      calls.push(args);
      events.push("send");
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
  } as unknown as CareerChatPanelContextValue;
  const render = async (
    locale: "ko" | "en",
    roleId: string,
    overrides: Partial<CareerChatPanelContextValue> = {},
    itemOverrides: Partial<CareerHistoryOpportunity> = {}
  ) =>
    act(async () =>
      root.render(
        <RouterContext.Provider value={{ query: {}, pathname: "/career", isReady: true } as any}><QueryClientProvider client={queryClient}><MessagesProvider locale={locale}>
          <CareerChatPanelProvider value={{ ...context, ...overrides }}>
            <ApplyWithHarperButton
              key={roleId}
              item={
                {
                  id: `saved-${roleId}`,
                  roleId,
                  companyName: "Example",
                  title: "Engineer",
                  description: "Stored JD must not be copied into the visible request",
                  externalJdUrl: "https://example.invalid/jobs/engineer",
                  ...itemOverrides,
                } as CareerHistoryOpportunity
              }
              onOpenChat={() => events.push("open")}
            />
          </CareerChatPanelProvider>
        </MessagesProvider></QueryClientProvider></RouterContext.Provider>
      )
    );
  const button = () => dom.window.document.querySelector("button")!;
  try {
    for (const itemOverrides of [
      { isInternal: true }, { sourceType: "internal" as const },
      { savedStage: "connected" as const }, { savedStage: "closed" as const },
      { status: "ended" }, { status: "deleted" },
    ]) {
      await render("ko", "hidden-cta", {}, itemOverrides);
      assert.equal(button(), null);
    }
    await render("ko", "role-a");
    assert.equal(button().textContent, "Apply with Harper");
    await act(async () => {
      button().click();
      button().click();
    });
    assert.deepEqual(events, ["send", "open"]);
    assert.equal(calls.length, 1);
    assert.equal(button().disabled, true);
    assert.deepEqual(calls[0], {
      text: "Example · Engineer에 지원해줘.",
      opportunityMentions: [{ label: "Example · Engineer", roleId: "role-a" }],
    });
    await act(async () => finish());
    assert.equal(button().disabled, false);

    await render("en", "role-b");
    await act(async () => button().click());
    assert.equal(
      calls[1].text,
      "Apply to Example · Engineer for me."
    );
    assert.equal(calls[1].opportunityMentions?.[0].roleId, "role-b");
    await act(async () => finish());

    for (const active of [{ chatPending: true }, { assistantTyping: true }]) {
      await render("ko", "role-b", active);
      assert.equal(button().disabled, false, "independent work can be admitted during another reply");
    }
    for (const blocked of [
      { sessionPending: true },
      { profilePending: true },
      { isOnboardingDone: false },
      { stage: "profile" as const },
      { opportunityFeedbackFollowUpPending: true },
      { user: null },
      { messages: [], conversationId: null },
    ]) {
      await render("ko", "role-b", blocked);
      assert.equal(button().disabled, true);
      await act(async () => button().click());
    }
    assert.equal(calls.length, 2);
    await render("ko", "role-c", {
      onSendChatMessage: async () => {
        throw new Error("Shared chat error");
      },
    });
    await act(async () => button().click());
    assert.equal(
      button().disabled,
      false,
      "a failed shared request permits retry"
    );

  } finally {
    await act(async () => root.unmount());
    await supabase.auth.stopAutoRefresh();
    await browserSupabase.auth.stopAutoRefresh();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
