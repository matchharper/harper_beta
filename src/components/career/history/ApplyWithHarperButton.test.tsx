import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "@/lib/supabase";
import { OpportunityType } from "@/lib/opportunityType";
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
  const { default: ApplyWithHarperButton } = require("./ApplyWithHarperButton");
  const {
    HistoryOpportunityInlinePage,
  } = require("./HistoryOpportunityDetailContent");
  const { CareerChatPanelProvider } = require("../CareerChatPanelContext");
  const { MessagesProvider } = require("@/i18n/useMessage");
  const { supabase: browserSupabase } = require("@/lib/supabase");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const calls: Parameters<
    CareerChatPanelContextValue["onSendChatMessage"]
  >[0][] = [];
  const events: string[] = [];
  let finish: () => void = () => {};
  const context = {
    user: { id: "fixture-user" },
    conversationId: "fixture-conversation",
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
  } as CareerChatPanelContextValue;
  const render = async (
    locale: "ko" | "en",
    roleId: string,
    overrides: Partial<CareerChatPanelContextValue> = {},
    itemOverrides: Partial<CareerHistoryOpportunity> = {}
  ) =>
    act(async () =>
      root.render(
        <MessagesProvider locale={locale}>
          <CareerChatPanelProvider value={{ ...context, ...overrides }}>
            <ApplyWithHarperButton
              key={roleId}
              item={
                {
                  id: `saved-${roleId}`,
                  roleId,
                  companyName: "Example",
                  title: "Engineer",
                  ...itemOverrides,
                } as CareerHistoryOpportunity
              }
              onOpenChat={() => events.push("open")}
            />
          </CareerChatPanelProvider>
        </MessagesProvider>
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
      text: "이 포지션에 하퍼와 함께 지원하고 싶어. 지원 준비를 시작해줘.",
      opportunityMentions: [{ label: "Example · Engineer", roleId: "role-a" }],
    });
    await act(async () => finish());
    assert.equal(button().disabled, false);

    await render("en", "role-b");
    await act(async () => button().click());
    assert.equal(
      calls[1].text,
      "I'd like to apply to this role with Harper. Please start preparing my application."
    );
    assert.equal(calls[1].opportunityMentions?.[0].roleId, "role-b");
    await act(async () => finish());

    for (const blocked of [
      { chatPending: true },
      { assistantTyping: true },
      { sessionPending: true },
      { profilePending: true },
      { isOnboardingDone: false },
      { stage: "profile" as const },
      { opportunityFeedbackFollowUpPending: true },
      { user: null },
      { conversationId: null },
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

    await act(async () =>
      root.render(
        <MessagesProvider locale="ko">
          <CareerChatPanelProvider value={context}>
            <HistoryOpportunityInlinePage
              item={
                {
                  id: "saved-applied",
                  roleId: "role-applied",
                  companyName: "Example",
                  title: "Engineer",
                  recommendationReasons: [],
                  employmentTypes: [],
                  recommendationConcerns: [],
                  clickedAt: null,
                  companyDescription: null,
                  companyHomepageUrl: null,
                  companyLinkedinUrl: null,
                  companyLogoUrl: null,
                  description: null,
                  externalJdUrl: null,
                  feedbackAt: null,
                  feedbackReason: null,
                  href: null,
                  isAccepted: false,
                  location: null,
                  postedAt: null,
                  sourceJobId: null,
                  sourceProvider: null,
                  viewedAt: null,
                  workMode: null,
                  isInternal: false,
                  savedStage: "applied",
                  feedback: "positive",
                  opportunityType: OpportunityType.ExternalJd,
                  sourceType: "external",
                  kind: "recommendation",
                  recommendedAt: "2026-10-12T00:00:00Z",
                  status: "active",
                } as CareerHistoryOpportunity
              }
              pending={false}
              onBack={() => {}}
              onOpenLink={() => {}}
              onOpenOpportunityInfo={() => {}}
              onOpenChat={() => events.push("open")}
            />
          </CareerChatPanelProvider>
        </MessagesProvider>
      )
    );
    const cta = [...dom.window.document.querySelectorAll("button")].find(
      (el) => el.textContent === "Apply with Harper"
    );
    const activityTitle = [
      ...dom.window.document.querySelectorAll("span"),
    ].find((el) => el.textContent === "내 활동");
    assert.ok(cta);
    assert.ok(activityTitle);
    assert.ok(
      cta.compareDocumentPosition(activityTitle) &
        dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      "Apply with Harper is above My activity on an applied role page"
    );
    await act(async () => cta.click());
    assert.equal(calls.at(-1)?.opportunityMentions?.[0].roleId, "role-applied");
    await act(async () => finish());
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
