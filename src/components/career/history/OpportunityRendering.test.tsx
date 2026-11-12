import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { MessagesProvider } from "@/i18n/useMessage";
import {
  CareerSidebarProvider,
  type CareerSidebarContextValue,
} from "../CareerSidebarContext";
import type { CareerHistoryOpportunity } from "../types";
import { OpportunityType } from "@/lib/opportunityType";

// Counting property reads observes the real card rendering without replacing it.
function fixture(
  id: string,
  reads: Map<string, number>
): CareerHistoryOpportunity {
  return {
    id,
    roleId: id,
    title: `Role ${id}`,
    get companyName() {
      reads.set(id, (reads.get(id) ?? 0) + 1);
      return `Company ${id}`;
    },
    clickedAt: null,
    companyDescription: null,
    companyHomepageUrl: null,
    companyLinkedinUrl: null,
    companyLogoUrl: null,
    description: null,
    employmentTypes: [],
    externalJdUrl: null,
    feedback: "positive",
    feedbackAt: null,
    feedbackReason: null,
    href: null,
    isAccepted: false,
    isInternal: false,
    kind: "recommendation",
    location: null,
    opportunityType: OpportunityType.ExternalJd,
    postedAt: null,
    recommendedAt: "2026-10-30T00:00:00Z",
    recommendationReasons: [],
    savedStage: "saved",
    sourceJobId: null,
    sourceProvider: null,
    sourceType: "external",
    status: "active",
    viewedAt: null,
    workMode: null,
  };
}

test("opportunity lists isolate expansion, pending updates and board dragging to the affected card", async () => {
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };
  const { default: NewOpportunityList } = await import("./NewOpportunityList");
  const { default: OpportunityListCard } =
    await import("./OpportunityListCard");
  const { CareerMobileJobsList } =
    await import("../mobile/jobs/CareerMobileJobsList");
  const { default: SavedOpportunityBoard } =
    await import("./SavedOpportunityBoard");
  const { default: SavedOpportunityList } =
    await import("./SavedOpportunityList");
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
  const scrolled: string[] = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function () {
    scrolled.push(this.dataset.opportunityId ?? "");
  };
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.keys(globals).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const reads = new Map<string, number>();
  const first = fixture("first", reads),
    second = fixture("second", reads);
  const items = [first, second];
  const sidebar = {
    user: null,
    talentPreferences: null,
  } as unknown as CareerSidebarContextValue;
  const opened: CareerHistoryOpportunity[] = [];
  const onOpenDetail = (item: CareerHistoryOpportunity) => {
    opened.push(item);
  };
  const noop = () => {};
  const render = (children: React.ReactNode) =>
    act(async () =>
      root.render(
        <MessagesProvider locale="ko" persistPreference={false}>
          <CareerSidebarProvider value={sidebar}>
            {children}
          </CareerSidebarProvider>
        </MessagesProvider>
      )
    );
  const unchanged = (before: number, action: string) =>
    assert.equal(
      reads.get("second"),
      before,
      `${action} must not render the other card`
    );
  try {
    const newList = (
      expandedOpportunityId?: string,
      pendingOpportunityIds = new Set<string>(),
      listItems = items
    ) => (
      <NewOpportunityList
        items={listItems}
        expandedOpportunityId={expandedOpportunityId}
        pendingOpportunityIds={pendingOpportunityIds}
        onApply={noop}
        onKeep={noop}
        onPositive={noop}
        onNegative={noop}
        onToggleOpportunity={onOpenDetail}
      />
    );
    await render(newList());
    let before = reads.get("second")!;
    assert.ok(before > 0);
    await render(newList("first"));
    unchanged(before, "expanding a new opportunity");
    await render(newList("first", new Set(["first"])));
    unchanged(before, "marking a new opportunity pending");
    await render(newList());
    const newCard = container.querySelector(
      '[data-opportunity-id="first"] [role="button"]'
    ) as HTMLElement;
    assert.ok(newCard);
    await act(async () => newCard.click());
    assert.equal(opened.pop(), first);

    scrolled.length = 0;
    await render(newList("fetched"));
    await act(async () => new Promise<void>(resolve => dom.window.requestAnimationFrame(() => resolve())));
    assert.deepEqual(scrolled, []);
    const fetched = fixture("fetched", reads);
    await render(newList("fetched", new Set(), [...items, fetched]));
    await act(async () => new Promise<void>(resolve => dom.window.requestAnimationFrame(() => resolve())));
    assert.deepEqual(scrolled, ["fetched"], "a linked opportunity must scroll into view when its data arrives");

    const list = (pending = false, item = first) => (
      <>
        <OpportunityListCard
          item={item}
          pending={pending}
          savedStatus="saved"
          onOpenOpportunityInfo={noop}
          onOpenDetail={onOpenDetail}
        />
        <OpportunityListCard
          item={second}
          pending={false}
          savedStatus="saved"
          onOpenOpportunityInfo={noop}
          onOpenDetail={onOpenDetail}
        />
      </>
    );
    await render(list());
    before = reads.get("second")!;
    await render(list(true));
    unchanged(before, "changing a desktop opportunity's pending state");
    const updated = { ...first, title: "Updated role" };
    await render(list(false, updated));
    unchanged(before, "updating a desktop opportunity");
    await act(async () =>
      (container.querySelector('[role="button"]') as HTMLElement).click()
    );
    assert.equal(
      opened.pop(),
      updated,
      "detail actions must receive the current item"
    );

    const mobile = (pendingOpportunityIds = new Set<string>()) => (
      <CareerMobileJobsList
        onApply={noop}
        activeTab="saved"
        bottomReservePx={120}
        hasMore={false}
        isLoading={false}
        opportunities={items}
        pendingOpportunityIds={pendingOpportunityIds}
        onOpenDetail={onOpenDetail}
        onStatusChange={noop}
        onInternalDecisionAction={noop}
      />
    );
    await render(mobile());
    before = reads.get("second")!;
    await render(mobile(new Set(["first"])));
    unchanged(before, "changing a mobile opportunity's pending state");
    await act(async () =>
      (container.querySelector('[role="button"]') as HTMLElement).click()
    );
    assert.equal(opened.pop(), first);

    const applied: CareerHistoryOpportunity[] = [];
    const closed = { ...second, status: "deleted" };
    await render(
      <SavedOpportunityList
        items={[first, closed]}
        onOpenDetail={onOpenDetail}
        onApply={(item) => applied.push(item)}
      />
    );
    await act(async () =>
      (container.querySelector('[role="button"]') as HTMLElement).click()
    );
    assert.equal(opened.pop(), first, "saved row opens the selected position");
    const applyButtons = [...container.querySelectorAll("button")].filter(
      (button) => button.textContent === "지원하기"
    );
    assert.equal(applyButtons.length, 2);
    await act(async () => applyButtons[0].click());
    assert.equal(
      applied.pop(),
      first,
      "saved row uses the existing application flow"
    );
    assert.equal(opened.length, 0, "applying must not also open details");
    assert.equal(
      applyButtons[1].disabled,
      true,
      "saved row cannot apply to a closed position"
    );
    assert.ok(container.textContent?.includes("마감됨"));
    const savedRow = container.querySelector(
      '[data-opportunity-id="first"] [role="button"]'
    ) as HTMLElement;
    assert.equal(savedRow.hasAttribute("aria-expanded"), false);
    assert.equal(savedRow.hasAttribute("aria-controls"), false);
    assert.equal(container.querySelector(".lucide-chevron-right"), null);
    assert.equal(
      container.querySelector(".lucide-thumbs-up, .lucide-thumbs-down"),
      null
    );
    await act(async () =>
      savedRow.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    );
    assert.equal(opened.pop(), first, "keyboard activation opens details");

    const column = {
      hasMore: false,
      loadedCount: 0,
      loading: false,
      totalCount: 0,
    };
    const changes: [CareerHistoryOpportunity, string][] = [];
    await render(
      <SavedOpportunityBoard
        items={items}
        pendingOpportunityIds={new Set()}
        counts={{
          all: 2,
          saved: 2,
          applied: 0,
          connected: 0,
          offer: 0,
          closed: 0,
          hidden: 0,
        }}
        columnLoadState={{
          saved: column,
          applied: column,
          connected: column,
          offer: column,
          closed: column,
        }}
        onOpenDetail={onOpenDetail}
        onLoadMoreColumn={noop}
        onStatusChange={(item, status) => {
          changes.push([item, status]);
        }}
      />
    );
    before = reads.get("second")!;
    const draggable = container.querySelector('[draggable="true"]')!;
    assert.ok(draggable);
    const drag = new dom.window.Event("dragstart", { bubbles: true });
    const dataTransfer = { effectAllowed: "" };
    Object.defineProperty(drag, "dataTransfer", { value: dataTransfer });
    await act(async () => {
      draggable.dispatchEvent(drag);
    });
    assert.equal(dataTransfer.effectAllowed, "move");
    assert.ok(draggable.classList.contains("opacity-45"));
    unchanged(before, "starting a board drag");
    const appliedColumn = [...container.querySelectorAll("div")].find(
      (node) =>
        node.classList.contains("min-h-[520px]") &&
        node.textContent?.startsWith("지원함")
    );
    assert.ok(appliedColumn);
    await act(async () => {
      appliedColumn.dispatchEvent(
        new dom.window.Event("drop", { bubbles: true, cancelable: true })
      );
    });
    assert.deepEqual(changes, [[first, "applied"]]);
    assert.ok(!draggable.classList.contains("opacity-45"));
    unchanged(before, "dropping a board card");
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


test("development history cards show estimated salary without ranking scores", async () => {
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  const previousEnvironment = process.env.NODE_ENV;
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };

  try {
    const { default: OpportunityCard } = await import("./OpportunityCard");
    const scored = {
      ...fixture("scored", new Map()),
      externalRankingScore: 84.8,
      estimatedAnnualSalary: { min: 70_000_000, max: 90_000_000, currency: "KRW" },
    };
    const render = (item: CareerHistoryOpportunity, expanded = false) =>
      renderToStaticMarkup(
        <MessagesProvider locale="ko" persistPreference={false}>
          <OpportunityCard item={item} expanded={expanded} />
        </MessagesProvider>
      );

    Object.assign(process.env, { NODE_ENV: "development" });
    const collapsed = render(scored);
    const expanded = render(scored, true);
    assert.match(collapsed, /7,000 ~ 9,000만원 \(추정\)/);
    assert.match(expanded, /추정 연봉/);
    assert.doesNotMatch(collapsed, /정렬 점수|84\.8/);
    assert.doesNotMatch(expanded, /정렬 점수|84\.8/);
  } finally {
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else delete require.extensions[".css"];
    if (previousEnvironment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previousEnvironment });
  }
});

test("expanded cards place known posting dates above a separate company facts row", async () => {
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => { module.exports = {}; };
  try {
    const { default: OpportunityCard } = await import("./OpportunityCard");
    const item = {
      ...fixture("dates", new Map()),
      postedAt: "2026-10-15T12:00:00Z",
      expiresAt: "2026-10-31T12:00:00Z",
      companyHqLocation: "서울",
    };
    const rows = (overrides: Partial<CareerHistoryOpportunity> = {}) => {
      const html = renderToStaticMarkup(
        <MessagesProvider locale="ko" persistPreference={false}>
          <OpportunityCard item={{ ...item, ...overrides }} expanded />
        </MessagesProvider>
      );
      const dom = new JSDOM(html);
      const values = Array.from(
        dom.window.document.querySelectorAll(".career-opportunity-facts"),
        (row) => Array.from(row.children, (cell) => ({
          text: cell.textContent,
          dateTime: cell.querySelector("time")?.dateTime,
        }))
      );
      dom.window.close();
      return values;
    };
    const [dates, company] = rows();
    assert.deepEqual(dates.map((cell) => cell.dateTime), [item.postedAt, item.expiresAt]);
    assert.match(dates[0].text ?? "", /^게시일 /);
    assert.match(dates[1].text ?? "", /^마감일 /);
    assert.match(company[0].text ?? "", /^본사 /);
    assert.deepEqual(rows({ expiresAt: null }), [[dates[0]], company]);
    assert.deepEqual(rows({ postedAt: null }), [[dates[1]], company]);
    assert.deepEqual(rows({ postedAt: "invalid", expiresAt: null }), [company]);
  } finally {
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else delete require.extensions[".css"];
  }
});

test("the expanded summary uses the job summary and recommendation prose has its own section", async () => {
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => { module.exports = {}; };
  try {
    const { default: OpportunityCard } = await import("./OpportunityCard");
    const item = { ...fixture("summary", new Map()), roleSummary: "Localized job summary",
      recommendationSummary: "Personal recommendation", recommendationNote: "Additional assessment",
      description: "Full job description" };
    const render = (value: CareerHistoryOpportunity) => renderToStaticMarkup(
      <MessagesProvider locale="ko" persistPreference={false}>
        <OpportunityCard item={value} expanded />
      </MessagesProvider>
    );
    const doc = new JSDOM(render(item)).window.document;
    const sections = [...doc.querySelectorAll("section")];
    const summary = sections.find(section => section.querySelector("h4")?.textContent === "요약");
    const notes = sections.find(section => section.querySelector("h4")?.textContent === "Harper 메모");
    assert.ok(summary?.textContent?.includes("Localized job summary"));
    assert.ok(!summary?.textContent?.includes("Personal recommendation"));
    assert.ok(notes?.textContent?.includes("Personal recommendation"));
    assert.ok(notes?.textContent?.includes("Additional assessment"));
    assert.equal(doc.body.textContent?.split("Personal recommendation").length, 2,
      "recommendation prose must appear only in Harper notes");
    const withoutSummary = new JSDOM(render({ ...item, roleSummary: null })).window.document;
    assert.equal([...withoutSummary.querySelectorAll("h4")].some(heading => heading.textContent === "요약"), false);
  } finally {
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else delete require.extensions[".css"];
  }
});
