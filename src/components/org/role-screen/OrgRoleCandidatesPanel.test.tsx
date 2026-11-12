import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

// 전체 화면 keeps the split view's tabs; 진행 종료 lives inside 파이프라인.
// switching a tab stays in 전체 화면, and each list's sort, view and search
// history go into the one row at the end of the tabs.
test("전체 화면 has the split view's tabs and one toolbar row for every list", async (t) => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://fixture.invalid" });
  const original = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  t.after(async () => {
    await act(async () => root.unmount());
    Object.assign(globalThis, original, { IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  });

  let tabItems: string[] = [];
  let activeTab: string | undefined;
  let onTab: ((value: string) => void) | undefined;
  const boardViews: Array<{ tab: string; stageTabs?: boolean; toolbarTarget?: HTMLElement | null }> = [];
  const talentBoards: Array<{ ids: string[] }> = [];
  const query: Record<string, string> = {};
  let split = true;
  const items = [
    { recommendationId: "open", stage: "first_interview", savedAt: null },
    { recommendationId: "closed-old", stage: "process_stopped", savedAt: null, companyPresentedAt: "2026-10-01T00:00:00Z" },
    { recommendationId: "closed-new", stage: "process_stopped", savedAt: null, companyPresentedAt: "2026-11-01T00:00:00Z" },
    { recommendationId: "closed-saved", stage: "process_stopped", savedAt: "2026-11-02T00:00:00Z" },
    // Passed a moment ago, still in the undo window: already shown under 진행 종료.
    { recommendationId: "passing", stage: "company_intro", savedAt: null, companyPresentedAt: "2026-09-01T00:00:00Z" },
    // Decided with no new stage: off every list until it runs.
    { recommendationId: "leaving", stage: "process_stopped", savedAt: null, companyPresentedAt: "2026-11-06T00:00:00Z" },
  ];
  const deferredStages = new Map<string, string | null>([["passing", "process_stopped"], ["leaving", null]]);
  const empty = () => null;
  const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const nodeModule = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const load = nodeModule._load;
  nodeModule._load = function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "next/router") return { useRouter: () => ({ query, pathname: "/org/role", push: empty }) };
    if (name === "@/hooks/useMediaQuery") return { useMediaQuery: () => split };
    if (name === "@/components/org/TalentDetailSimpleView") return {
      TalentDetailSimpleView: ({ presentation = "modal" }: { presentation?: string }) =>
        query.talentId ? <div data-candidate-detail={presentation} /> : null,
    };
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({ c: (ko: string) => ko, locale: "ko" }),
      useOrgSourceT: () => (value: unknown) => value,
    };
    if (name === "@/hooks/org/useOrgWorkspace") return {
      useOrgWorkspace: () => ({ workspace: { workspaceId: "workspace" }, internalOpsAccess: false }),
    };
    if (name === "@/hooks/org/useOrgJobs") return {
      OrgJobsProvider: passthrough,
      useOrgJobsBoard: () => ({ board: { items, stages: [] }, boardQuery: { data: {}, error: null, isLoading: false } }),
      useOrgJobsNavigation: () => ({ activeRole: { roleId: "role" }, workspaceId: "workspace", selectTalent: empty }),
    };
    if (name === "@/store/useOrgDeferredActionStore") return {
      useOrgDeferredActionStore: (select: (state: { deferredStages: ReadonlyMap<string, string | null> }) => unknown) =>
        select({ deferredStages }),
    };
    if (name === "@/components/ui/tab-boxes") return {
      TabBoxes: ({ activeValue, items: tabs, onValueChange }: { activeValue: string; items: Array<{ value: string }>; onValueChange: (value: string) => void }) => {
        activeTab = activeValue;
        tabItems = tabs.map((item) => item.value);
        onTab = onValueChange;
        return <div data-tabs />;
      },
    };
    if (name === "./OrgRoleBoardViews") return {
      OrgRoleCandidatesTab: (props: { tab: string; stageTabs?: boolean; toolbarTarget?: HTMLElement | null }) => {
        boardViews.push(props);
        return <div data-board-view={props.tab} />;
      },
      RoleStartRegisteredNotice: empty,
    };
    if (name === "@/components/org/OrgRoleTalentBoard") return {
      OrgRoleTalentBoard: ({ inboxItems }: { inboxItems?: Array<{ recommendationId: string }> }) => {
        talentBoards.push({ ids: (inboxItems ?? []).map((item) => item.recommendationId) });
        return <div data-closed-grid />;
      },
    };
    if (name === "@/components/org/OrgCandidateToolbar") return {
      OrgCandidateSortMenu: ({ value }: { value: string }) => <span data-sort={value} />,
    };
    if (name === "@/components/org/OrgSearchHistory") return { OrgSearchHistory: () => <span data-history /> };
    if (name === "@/components/org/OrgHomeInbox") return { ReviewEmptyState: () => <div data-empty /> };
    if (
      name.startsWith("@/components/org/") ||
      name === "./OrgRoleCandidateCard" ||
      name === "@/components/ui/badge" ||
      name === "lucide-react"
    ) {
      return new Proxy({}, { get: (_target, key) => (key === "__esModule" ? true : key === "OrgCandidateListContext" ? { Provider: passthrough } : empty) });
    }
    if (name === "@/components/ui/button") return { MuteButton: ({ children }: { children?: ReactNode }) => <button>{children}</button> };
    return load.call(this, name, ...args);
  };
  const require = Module.createRequire(import.meta.url);
  let OrgRoleCandidatesPanel: typeof import("./OrgRoleCandidatesPanel")["OrgRoleCandidatesPanel"];
  try {
    ({ OrgRoleCandidatesPanel } = require("./OrgRoleCandidatesPanel") as typeof import("./OrgRoleCandidatesPanel"));
  } finally {
    nodeModule._load = load;
  }

  const tabChanges: string[] = [];
  const wideChanges: boolean[] = [];
  const render = (tab: string, wide = true) =>
    act(async () => {
      root.render(
        <OrgRoleCandidatesPanel
          counts={{ pending_connection: 1, company_intro: 5, saved: 0, reviewing: 0 } as never}
          externalCount={3}
          externalEnabled
          onAskHarper={empty}
          onPipelineDisplayChange={empty}
          onTabChange={(value) => tabChanges.push(value)}
          onWideChange={(value) => wideChanges.push(value)}
          pipelineDisplay="pipeline"
          role={{ roleId: "role" } as never}
          tab={tab as never}
          wide={wide}
          wideAvailable
        />
      );
    });

  await render("company_intro");
  assert.deepEqual(tabItems, ["pending_connection", "company_intro", "saved", "external", "pipeline"]);
  const slot = dom.window.document.querySelector(".org-role-wide-toolbar");
  assert.ok(slot, "a place for the toolbar at the end of the tabs' row");
  const inbox = boardViews.at(-1)!;
  assert.equal(inbox.tab, "inbox");
  assert.equal(inbox.stageTabs, false, "the inbox's own sub-tabs give way to the shared tabs");
  assert.equal(inbox.toolbarTarget, slot, "the inbox puts its sort, view and search history in that row");

  onTab!("pipeline");
  assert.deepEqual(tabChanges, ["pipeline"]);
  assert.deepEqual(wideChanges, [], "changing the tab stays in 전체 화면");

  await render("pipeline");
  assert.equal(boardViews.at(-1)!.tab, "pipeline");
  assert.equal(boardViews.at(-1)!.toolbarTarget, slot);

  boardViews.length = 0;
  await render("closed");
  assert.equal(boardViews.length, 0, "older closed-only links keep their filtered grid");
  assert.equal(activeTab, "pipeline", "closed-only links belong to the pipeline tab");
  assert.deepEqual(talentBoards.at(-1)?.ids, ["closed-new", "closed-old", "passing"], "closed people only (a pass in its undo window included), newest first, saved ones left out");
  assert.ok(slot.querySelector("[data-sort='latest']") && slot.querySelector("[data-history]"));

  await render("pipeline", false);
  assert.deepEqual(new Set(talentBoards.at(-1)?.ids), new Set(["open", "closed-new", "closed-old", "passing"]), "the split pipeline also includes closed candidates");
  assert.ok(!tabItems.includes("closed"), "no separate closed tab in split view");

  query.talentId = "candidate";
  await render("company_intro", false);
  assert.ok(dom.window.document.querySelector('[data-candidate-detail="inline"]'));
  assert.ok(dom.window.document.querySelector("[data-tabs]")?.closest("[hidden]"), "the profile replaces the list header");
  assert.ok(dom.window.document.querySelector("[data-empty]")?.closest("[hidden]"), "the list stays mounted behind the profile");
  delete query.talentId;
  await render("company_intro", false);
  assert.equal(dom.window.document.querySelector("[data-tabs]")?.closest("[hidden]"), null, "back returns to the same list");

  split = false;
  query.talentId = "candidate";
  await render("company_intro", false);
  assert.ok(dom.window.document.querySelector('[data-candidate-detail="modal"]'), "mobile keeps its existing full profile presentation");
});
