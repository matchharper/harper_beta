import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { Session } from "@supabase/supabase-js";
import { MessagesProvider } from "@/i18n/useMessage";
import { OpportunityType } from "@/lib/opportunityType";
import {
  assignHistoryFeedbackVariant,
  HISTORY_FEEDBACK_CLICK_EVENT,
  HISTORY_FEEDBACK_EXPERIMENT,
  HISTORY_FEEDBACK_VIEW_EVENT,
  type HistoryFeedbackVariant,
} from "@/lib/career/historyFeedbackExperiment";
import { buildHistoryFeedbackExperiment } from "@/lib/ops/historyFeedbackExperiment";
import type { CareerHistoryOpportunity } from "../types";

const opportunity = {
  id: "opportunity",
  roleId: "role",
  title: "Product Engineer",
  companyName: "Example",
  sourceType: "external",
  isInternal: false,
  feedback: null,
  opportunityType: OpportunityType.ExternalJd,
  recommendedAt: "2026-11-03T00:00:00Z",
  employmentTypes: [],
  recommendationReasons: [],
} as unknown as CareerHistoryOpportunity;

test("only actual feedback button clicks produce the experiment input, before saving succeeds", async () => {
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };
  const { default: NewOpportunityCard } = await import("./NewOpportunityCard");
  const { useAuthStore } =
    require("@/store/useAuthStore") as typeof import("@/store/useAuthStore");
  const previousAuth = useAuthStore.getState();
  useAuthStore.setState({ session: { access_token: "test-token" } as Session });
  const dom = new JSDOM("<div id='root'></div>", {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  dom.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  const logged: {
    type: string;
    metadata: {
      experiment: string;
      variant: HistoryFeedbackVariant;
      opportunityId: string;
      feedback: string;
    };
  }[] = [];
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url: string, init?: RequestInit) => {
      assert.equal(url, "/api/logs");
      logged.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true });
    },
  };
  const previous = Object.keys(globals).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const actions: string[] = [];
  const render = (
    variant: HistoryFeedbackVariant,
    expanded: boolean,
    item = opportunity,
    pending = false
  ) =>
    act(async () => {
      root.render(
        <MessagesProvider locale="ko" persistPreference={false}>
          <NewOpportunityCard
            feedbackVariant={variant}
            expanded={expanded}
            item={item}
            pending={pending}
            onPositive={() => {
              actions.push("positive");
              return Promise.resolve(false);
            }}
            onNegative={() => {
              actions.push("negative");
            }}
            onApply={() => {}}
            onKeep={() => {}}
            onToggleOpportunity={() => {}}
          />
        </MessagesProvider>
      );
    });
  const clickFeedbackButtons = () =>
    act(async () => {
      const buttons = [
        ...container.querySelectorAll<HTMLButtonElement>("button"),
      ].filter((button) => {
        if (button.closest("[inert]")) return false;
        const label =
          button.getAttribute("aria-label") ?? button.textContent ?? "";
        return /(관심 있어요|이번엔 넘길게요|저장|저장하기|목록에서 숨기기)$/.test(
          label
        );
      });
      assert.equal(buttons.length, 2);
      for (const button of buttons) button.click();
    });
  try {
    for (const variant of ["thumbs", "save_hide"] as const) {
      for (const expanded of [false, true]) {
        logged.length = 0;
        actions.length = 0;
        await render(variant, expanded);
        assert.equal(logged.length, 0, "rendering a card is not a click");
        await clickFeedbackButtons();
        assert.deepEqual(actions, ["negative", "positive"]);
        assert.deepEqual(
          logged.map((event) => event.type),
          [HISTORY_FEEDBACK_CLICK_EVENT, HISTORY_FEEDBACK_CLICK_EVENT]
        );
        for (const event of logged)
          assert.deepEqual(event.metadata, {
            experiment: HISTORY_FEEDBACK_EXPERIMENT,
            variant,
            opportunityId: opportunity.id,
            feedback: event.metadata.feedback,
          });
        assert.deepEqual(
          logged.map((event) => event.metadata.feedback),
          ["negative", "positive"]
        );
        const user = Array.from(
          { length: 20 },
          (_, index) => `user-${index}`
        ).find((id) => assignHistoryFeedbackVariant(id) === variant)!;
        const row = { user_id: user, created_at: "2026-11-03T00:00:00Z" };
        const summary = buildHistoryFeedbackExperiment([
          {
            ...row,
            type: HISTORY_FEEDBACK_VIEW_EVENT,
            meta_data: {
              experiment: HISTORY_FEEDBACK_EXPERIMENT,
              variant,
              opportunityId: opportunity.id,
            },
          },
          ...logged.map((event) => ({
            ...row,
            type: event.type,
            meta_data: event.metadata,
          })),
        ]);
        assert.deepEqual(
          summary.variants.find((entry) => entry.id === variant)?.primary,
          { numerator: 1, denominator: 1, rate: 1 }
        );
      }
    }
    for (const item of [
      opportunity,
      { ...opportunity, feedback: "positive" as const },
      { ...opportunity, isInternal: true },
    ]) {
      logged.length = 0;
      await render("thumbs", false, item, item === opportunity);
      await clickFeedbackButtons();
      assert.equal(
        logged.length,
        0,
        "pending, previously answered and internal cards are excluded"
      );
    }
  } finally {
    await act(async () => root.unmount());
    useAuthStore.setState(previousAuth);
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else delete require.extensions[".css"];
    dom.window.close();
  }
});
