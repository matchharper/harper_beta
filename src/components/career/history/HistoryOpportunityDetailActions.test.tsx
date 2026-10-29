import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MessagesProvider } from "@/i18n/useMessage";
import { OpportunityType } from "@/lib/opportunityType";
import type { CareerHistoryOpportunity } from "../types";

test("detail actions follow the saved stage and preserve internal decision boundaries", async () => {
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
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };
  const { default: HistoryOpportunityDetailActions } =
    require("./HistoryOpportunityDetailActions") as typeof import("./HistoryOpportunityDetailActions");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const events: string[] = [];
  const render = async (
    overrides: Partial<CareerHistoryOpportunity> = {},
    pending = false,
    locale: "ko" | "en" = "ko"
  ) => {
    events.length = 0;
    const item = {
      id: "fixture",
      sourceType: "external",
      isInternal: false,
      opportunityType: OpportunityType.ExternalJd,
      feedback: "positive",
      savedStage: "saved",
      status: "active",
      ...overrides,
    } as CareerHistoryOpportunity;
    await act(async () =>
      root.render(
        <MessagesProvider locale={locale}>
          <HistoryOpportunityDetailActions
            item={item}
            pending={pending}
            onApply={() => events.push("apply")}
            onSavedStatusChange={(stage) => events.push(`stage:${stage}`)}
            onKeepDecision={(action) => events.push(`consent:${action}`)}
            onInternalDecisionAction={(action) =>
              events.push(`decision:${action}`)
            }
          />
        </MessagesProvider>
      )
    );
    return [...dom.window.document.querySelectorAll("button")];
  };
  const clickAll = async (buttons: HTMLButtonElement[]) => {
    for (const button of buttons) await act(async () => button.click());
  };
  try {
    let buttons = await render();
    assert.deepEqual(
      buttons.map((button) => button.textContent),
      ["보관하기", "지원함으로 이동", "지원하기"]
    );
    await clickAll(buttons);
    assert.deepEqual(events, ["stage:hidden", "stage:applied", "apply"]);
    for (const savedStage of ["applied", "connected", "closed"] as const) {
      await clickAll(await render({ savedStage }));
      assert.deepEqual(events, ["stage:hidden"]);
    }
    for (const overrides of [
      { savedStage: "hidden" },
      { feedback: "negative" },
    ] as const) {
      await clickAll(await render(overrides));
      assert.deepEqual(events, ["stage:saved", "stage:applied", "apply"]);
    }
    await clickAll(await render({ isExpired: true }));
    assert.deepEqual(events, ["stage:hidden", "stage:applied"]);
    buttons = await render({}, true);
    assert.ok(buttons.every((button) => button.disabled));
    await clickAll(buttons);
    assert.deepEqual(events, []);
    buttons = await render({}, false, "en");
    assert.ok(
      buttons.some((button) => button.textContent === "Move to applied")
    );

    const internal = {
      sourceType: "internal",
      isInternal: true,
      opportunityType: OpportunityType.InternalRecommendation,
      savedStage: "connected",
    } as const;
    await clickAll(
      await render({ ...internal, feedback: "keep", status: "top_priority" })
    );
    assert.deepEqual(events, ["consent:decline", "consent:accept"]);
    await clickAll(
      await render({ ...internal, feedback: "keep", isExpired: true })
    );
    assert.deepEqual(events, ["consent:decline"]);
    await clickAll(await render({ ...internal, feedback: "negative" }));
    assert.deepEqual(events, ["decision:revert"]);
    await clickAll(
      await render({ ...internal, feedbackAt: new Date().toISOString() })
    );
    assert.deepEqual(events, ["decision:revert", "decision:stop_process"]);
    await clickAll(
      await render({ ...internal, feedbackAt: "2020-01-01T00:00:00Z" })
    );
    assert.deepEqual(events, ["decision:stop_process"]);
    assert.equal(
      (await render({ ...internal, savedStage: "closed" })).length,
      0
    );
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else delete require.extensions[".css"];
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
