import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "@/lib/supabase";
import type { CareerChatPanelContextValue } from "../CareerChatPanelContext";
import type { CareerHistoryOpportunity } from "../types";

test("external application choices persist distinct stages, retry failed saves and start the existing role chat once", async () => {
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
  const root = createRoot(dom.window.document.getElementById("root")!);
  const events: string[] = [];
  let save: (stage: "saved" | "applied") => Promise<boolean> = async () => true;
  let finishChat: () => void = () => {};
  const context = {
    user: { id: "fixture-user" },
    conversationId: "fixture-conversation",
    stage: "completed",
    isOnboardingDone: true,
    onSendChatMessage: (
      args: Parameters<CareerChatPanelContextValue["onSendChatMessage"]>[0]
    ) => {
      assert.deepEqual(args.opportunityMentions, [
        { label: "Example · Engineer", roleId: "external-role" },
      ]);
      events.push("send");
      return new Promise<void>((resolve) => {
        finishChat = resolve;
      });
    },
  } as CareerChatPanelContextValue;
  const item = {
    id: "external-opportunity",
    roleId: "external-role",
    companyName: "Example",
    title: "Engineer",
    externalJdUrl: "https://example.com/jobs/1",
  } as CareerHistoryOpportunity;
  const render = async (
    key: string,
    locale: "ko" | "en" = "ko",
    pending = false,
    error: string | null = null
  ) =>
    act(async () =>
      root.render(
        <MessagesProvider locale={locale}>
          <CareerChatPanelProvider value={context}>
            <ExternalOpportunityApplyModal
              key={key}
              item={item}
              pending={pending}
              error={error}
              onSave={(stage: "saved" | "applied") => {
                events.push(`save:${stage}`);
                return save(stage);
              }}
              onClose={() => events.push("close")}
              onApplied={() => events.push("applied-tab")}
              onOpenLink={(url: string) => {
                assert.equal(url, item.externalJdUrl);
                events.push("posting");
              }}
              onOpenChat={() => events.push("chat")}
            />
          </CareerChatPanelProvider>
        </MessagesProvider>
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
    await render("direct");
    assert.ok(button("직접 지원하기").classList.contains("w-full"));
    assert.ok(button("Harper와 지원하기").classList.contains("w-full"));
    let finishSave: (result: boolean) => void = () => {};
    save = () =>
      new Promise<boolean>((resolve) => {
        finishSave = resolve;
      });
    await act(async () => {
      button("직접 지원하기").click();
      button("직접 지원하기").click();
    });
    assert.deepEqual(events, ["posting", "save:applied"]);
    assert.equal(button("직접 지원하기").disabled, true);
    assert.equal(button("Harper와 지원하기").disabled, true);
    await act(async () => finishSave(true));
    assert.deepEqual(events, [
      "posting",
      "save:applied",
      "close",
      "applied-tab",
    ]);

    events.length = 0;
    save = async () => false;
    await render("harper");
    await act(async () => button("Harper와 지원하기").click());
    assert.deepEqual(events, ["save:saved"]);
    assert.equal(button("Harper와 지원하기").disabled, false);
    await render("harper", "ko", false, "다시 시도해주세요.");
    assert.equal(
      dom.window.document.querySelector('[role="alert"]')?.textContent,
      "다시 시도해주세요."
    );

    save = async () => true;
    await act(async () => {
      button("Harper와 지원하기").click();
      button("Harper와 지원하기").click();
    });
    assert.deepEqual(events, [
      "save:saved",
      "save:saved",
      "send",
      "close",
      "chat",
    ]);
    assert.equal(button("Harper와 지원하기").disabled, true);
    await act(async () => finishChat());

    events.length = 0;
    await render("failed-direct");
    save = async () => false;
    await act(async () => button("직접 지원하기").click());
    assert.deepEqual(events, ["posting", "save:applied"]);

    events.length = 0;
    await render("pending", "en", true);
    assert.equal(button("Apply directly").disabled, true);
    assert.equal(button("Apply with Harper").disabled, true);
    await act(async () => button("Apply directly").click());
    assert.deepEqual(events, []);
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
