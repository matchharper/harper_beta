import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import React, { act } from "react";
import type { CareerHistoryOpportunity } from "../types";
import { OpportunityType } from "@/lib/opportunityType";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(
  role: number,
  title: string,
  recommended = false
): CareerHistoryOpportunity {
  return {
    id: recommended ? uuid(role + 100) : `posting:${uuid(role)}`,
    roleId: uuid(role),
    title,
    companyName: "테스트 회사",
    clickedAt: null,
    companyDescription: null,
    companyHomepageUrl: null,
    companyLinkedinUrl: null,
    companyLogoUrl: null,
    description: "원본 공고 상세 설명",
    employmentTypes: [],
    externalJdUrl: "https://example.com/job",
    feedback: null,
    feedbackAt: null,
    feedbackReason: null,
    href: null,
    isAccepted: false,
    isInternal: false,
    kind: "recommendation",
    location: null,
    opportunityType: OpportunityType.ExternalJd,
    postedAt: null,
    recommendedAt: "2026-11-02T00:00:00Z",
    recommendationReasons: [],
    savedStage: null,
    sourceJobId: null,
    sourceProvider: null,
    sourceType: "external",
    status: "active",
    viewedAt: null,
    workMode: null,
  };
}
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

test("matching panels share dismissal and filter recommended positions with the settings switch", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://matching-ui.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only";
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://matching-ui.invalid",
    pretendToBeVisual: true,
  });
  const keys = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
    "getComputedStyle",
    "CustomEvent",
    "NodeFilter",
    "HTMLInputElement",
    "MutationObserver",
    "BroadcastChannel",
  ];
  const original = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  for (const key of keys)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: (dom.window as any)[key],
    });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const { supabase } = await import("@/lib/supabase");
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { access_token: "test-only" } },
    error: null,
  }));
  const require = createRequire(import.meta.url);
  const originalCss = require.extensions[".css"];
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
  dom.window.matchMedia = () =>
    ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    }) as any;
  const { CareerSidebarProvider } = require("../CareerSidebarContext");
  const { default: CareerMatchingList } = await import("./CareerMatchingList");
  const { MessagesProvider } = createRequire(import.meta.url)(
    "@/i18n/useMessage"
  );
  const requests: URL[] = [];
  const base = [
    fixture(1, "미추천 공고"),
    fixture(2, "기추천 공고", true),
    fixture(3, "피드백 공고"),
    fixture(4, "지원 공고"),
  ];
  const saved = new Map<string, CareerHistoryOpportunity>([
    [base[1].roleId, base[1]],
  ]);
  const actions: string[] = [];
  let failSave = false;
  let releaseSave: (() => void) | null = null;
  let holdSave = false;
  const history = {
    historyUpdateError: "",
    onLoadHistoryOpportunityByRoleId: async (roleId: string) => {
      actions.push("hydrate");
      return saved.get(roleId) ?? null;
    },
  };
  const onAction = (name: string) => (item: CareerHistoryOpportunity) => {
    assert.ok(saved.has(item.roleId));
    assert.equal(item.id, saved.get(item.roleId)?.id);
    assert.ok(!item.id.startsWith("posting:"));
    actions.push(name);
  };
  t.mock.method(
    globalThis,
    "fetch",
    async (input: unknown, init?: RequestInit) => {
      const url = new URL(String(input), "https://matching-ui.invalid");
      if (url.pathname === "/api/logs") return Response.json({ ok: true });
      requests.push(url);
      if (url.pathname === "/api/talent/opportunities") {
        assert.equal(init?.method, "PATCH");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.action, "view");
        const item = base.find((item) => item.id === body.opportunityId)!;
        assert.ok(item);
        actions.push("save-start");
        if (failSave)
          return Response.json(
            { error: "fixture write failed" },
            { status: 500 }
          );
        if (holdSave)
          await new Promise<void>((resolve) => {
            releaseSave = resolve;
          });
        saved.set(item.roleId, {
          ...item,
          id: uuid(Number(item.roleId.slice(-2)) + 100),
        });
        actions.push("saved");
        return Response.json({ ok: true, opportunity: saved.get(item.roleId) });
      }
      assert.equal(url.pathname, "/api/talent/matchings");
      if (!url.searchParams.has("matchingId"))
        return Response.json({
          matchings: [
            { id: "latest", title: "최신 매칭", description: null },
            { id: "older", title: "이전 매칭", description: null },
          ],
          nextCursor: null,
        });
      const all = url.searchParams.get("excludeRecommended") === "false";
      return Response.json({
        opportunities: base
          .filter((item) => all || !saved.has(item.roleId))
          .map((item) => ({
            id: item.roleId,
            roleId: item.roleId,
            title: item.title,
            companyName: item.companyName,
            isRecommended: saved.has(item.roleId),
            opportunity: saved.get(item.roleId) ?? item,
          })),
        nextCursor: null,
      });
    }
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  const root = createRoot(document.getElementById("root")!);
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
  const click = async (element: Element) => {
    assert.ok(element);
    await act(async () => (element as HTMLElement).click());
    await settle();
  };
  const rows = () => [
    ...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
  ];
  try {
    await act(async () =>
      root.render(
        <MessagesProvider locale="ko" persistPreference={false}>
          <QueryClientProvider client={client}>
            <CareerSidebarProvider value={history as any}>
              <CareerMatchingList
                userId="fixture"
                onApply={onAction("apply")}
                onPositive={onAction("positive")}
                onNegative={onAction("negative")}
                onKeep={onAction("keep")}
              />
            </CareerSidebarProvider>
          </QueryClientProvider>
        </MessagesProvider>
      )
    );
    const trigger = document.querySelector("button")!;
    const open = async () => {
      await click(trigger);
      await settle();
      await settle();
    };
    await open();
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
    assert.equal(rows()[0].getAttribute("aria-pressed"), "true");
    assert.ok(rows()[0].querySelector(".lucide-check"));
    const toggle = () => document.querySelector('[role="switch"]')!;
    assert.equal(toggle().getAttribute("aria-checked"), "true");
    assert.ok(document.body.textContent?.includes("미추천 공고"));
    assert.ok(!document.body.textContent?.includes("기추천 공고"));
    assert.equal(
      requests
        .find((url) => url.searchParams.has("matchingId"))
        ?.searchParams.get("excludeRecommended"),
      "true"
    );
    await click(toggle());
    assert.equal(toggle().getAttribute("aria-checked"), "false");
    assert.ok(document.body.textContent?.includes("기추천 공고"));
    const badge = document.querySelector(
      '[role="img"][aria-label="추천된 포지션"]'
    )!;
    assert.ok(badge.querySelector(".fill-action"));
    assert.ok(
      badge
        .querySelector("svg")
        ?.getAttribute("class")
        ?.includes("stroke-white")
    );
    const card = (role: number) =>
      document.querySelector(
        `[data-opportunity-id="${saved.get(uuid(role))?.id ?? `posting:${uuid(role)}`}"]`
      )!;
    const expand = async (role: number) => {
      await click(card(role).querySelector("[aria-expanded]")!);
    };
    const actionButton = (role: number, index: number) =>
      (card(role).querySelector('[aria-expanded="true"]')
        ? card(role).querySelectorAll<HTMLButtonElement>(
            ".grid.grid-cols-2 > button"
          )
        : card(role).querySelectorAll<HTMLButtonElement>("button[aria-label]"))[
        index
      ];
    await expand(1);
    assert.ok(card(1).textContent?.includes("원본 공고 상세 설명"));
    assert.ok(
      [...card(1).querySelectorAll("button")].some(
        (button) => button.textContent === "지원하기"
      )
    );
    assert.deepEqual(
      actions,
      [],
      "opening and expanding a card never creates a recommendation"
    );
    await click(actionButton(1, 1));
    assert.deepEqual(actions, ["save-start", "saved", "hydrate", "positive"]);
    assert.ok(card(1).querySelector('[aria-label="추천된 포지션"]'));
    actions.length = 0;
    await click(actionButton(3, 0));
    assert.deepEqual(actions, ["save-start", "saved", "hydrate", "negative"]);
    actions.length = 0;
    await expand(4);
    const apply = () =>
      [...card(4).querySelectorAll("button")].find(
        (button) => button.textContent === "지원하기"
      )!;
    failSave = true;
    await click(apply());
    assert.deepEqual(
      actions,
      ["save-start"],
      "a failed save cannot open the application flow"
    );
    assert.ok(document.querySelector('[role="alert"]'));
    actions.length = 0;
    failSave = false;
    holdSave = true;
    await act(async () => {
      apply().click();
      apply().click();
    });
    await settle();
    assert.deepEqual(
      actions,
      ["save-start"],
      "repeat clicks share one in-flight write"
    );
    await act(async () => {
      releaseSave!();
    });
    await settle();
    await settle();
    assert.deepEqual(actions, ["save-start", "saved", "hydrate", "apply"]);
    actions.length = 0;
    await click(apply());
    assert.deepEqual(
      actions,
      ["hydrate", "apply"],
      "already recommended positions reuse their saved ID"
    );
    await click(rows()[1]);
    assert.equal(rows()[1].getAttribute("aria-pressed"), "true");
    assert.ok(
      document.querySelector('[role="dialog"]'),
      "selecting the adjacent history stays inside the modal"
    );
    await click(toggle());
    assert.ok(!document.body.textContent?.includes("기추천 공고"));
    const closeButtons = () =>
      [...document.querySelectorAll(".lucide-x")].map(
        (icon) => icon.closest("button")!
      );
    await click(closeButtons()[1]);
    assert.equal(
      document.querySelector('[role="dialog"]'),
      null,
      "positions close also closes history"
    );
    await open();
    assert.equal(toggle().getAttribute("aria-checked"), "true");
    assert.equal(rows()[0].getAttribute("aria-pressed"), "true");
    await click(closeButtons()[0]);
    assert.equal(
      document.querySelector('[role="dialog"]'),
      null,
      "history close also closes positions"
    );
    await open();
    await act(async () =>
      document.body.dispatchEvent(
        new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
    );
    await settle();
    assert.equal(
      document.querySelector('[role="dialog"]'),
      null,
      "outside press closes both panels"
    );
    await open();
    await click(
      document.querySelector(".lucide-arrow-left")!.closest("button")!
    );
    assert.ok(
      document.querySelector('[role="dialog"]'),
      "back keeps the history open"
    );
    assert.equal(document.querySelector('[role="switch"]'), null);
    await act(async () =>
      document.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        })
      )
    );
    await settle();
    assert.equal(document.querySelector('[role="dialog"]'), null);
  } finally {
    await act(async () => root.unmount());
    await settle();
    client.clear();
    require.extensions[".css"] = originalCss;
    globalThis.ResizeObserver = originalResizeObserver;
    supabase.auth.stopAutoRefresh();
    dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
