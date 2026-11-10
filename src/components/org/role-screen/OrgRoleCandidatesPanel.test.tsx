import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

// 전체 화면 keeps the split view's tabs (외부 후보 → 저장 → 파이프라인; 진행 종료 is
// the pipeline's last stage, not a tab), switching a tab stays in 전체 화면, and
// each list's sort, view and search history go into the one row at the end of
// the tabs. The split view's 파이프라인 lists every stage of the board.
test("전체 화면 has the split view's tabs and one toolbar row; 분할 화면's 파이프라인 shows every stage", async (t) => {
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
  let onTab: ((value: string) => void) | undefined;
  const boardViews: Array<{ tab: string; stageTabs?: boolean; toolbarTarget?: HTMLElement | null }> = [];
  const talentBoards: Array<{ ids: string[] }> = [];
  const query: Record<string, string> = {};
  const stages = [
    { id: "company_intro", label: "연결 요청할 후보" },
    { id: "pending_connection", label: "연결 기다리는 후보" },
    { id: "intro_requested", label: "연결 요청함" },
    { id: "connected", label: "연결됨" },
    { id: "first_interview", label: "1차 인터뷰", roleId: "role" },
    { id: "custom:other", label: "다른 역할 · 과제", roleId: "other" },
    { id: "final_offer", label: "오퍼" },
    { id: "process_stopped", label: "진행 종료" },
    { id: "archived", label: "보관" },
  ];
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
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({ c: (ko: string) => ko, locale: "ko" }),
      useOrgSourceT: () => (value: unknown) => value,
    };
    if (name === "@/hooks/org/useOrgWorkspace") return {
      useOrgWorkspace: () => ({ workspace: { workspaceId: "workspace" }, internalOpsAccess: false }),
    };
    if (name === "@/hooks/org/useOrgJobs") return {
      OrgJobsProvider: passthrough,
      useOrgJobsBoard: () => ({ board: { items, stages }, boardQuery: { data: {}, error: null, isLoading: false } }),
      useOrgJobsNavigation: () => ({ activeRole: { roleId: "role" }, workspaceId: "workspace", selectTalent: empty }),
    };
    if (name === "@/store/useOrgDeferredActionStore") return {
      useOrgDeferredActionStore: (select: (state: { deferredStages: ReadonlyMap<string, string | null> }) => unknown) =>
        select({ deferredStages }),
    };
    if (name === "@/components/ui/tab-boxes") return {
      TabBoxes: ({ items: tabs, onValueChange }: { items: Array<{ value: string }>; onValueChange: (value: string) => void }) => {
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
      OrgRoleTalentBoard: ({
        inboxItems = [],
        renderLayout,
      }: {
        inboxItems?: Array<{ recommendationId: string; stage: string }>;
        renderLayout?: (
          cards: Array<{ recommendationId: string; stage: string }>,
          renderCard: (item: { recommendationId: string }) => ReactNode
        ) => ReactNode;
      }) => {
        talentBoards.push({ ids: inboxItems.map((item) => item.recommendationId) });
        return (
          <div data-talent-board>
            {renderLayout?.(inboxItems, (item) => (
              <div data-card={item.recommendationId} key={item.recommendationId} />
            ))}
          </div>
        );
      },
    };
    if (name === "@/components/org/OrgHomeInbox") return { ReviewEmptyState: () => <div data-empty /> };
    if (name === "@/components/org/OrgCandidateInPlace") return {
      OrgCandidateInPlace: ({ backLabel, children }: { backLabel: string; children?: ReactNode }) => (
        <div data-in-place={backLabel}>{children}</div>
      ),
    };
    if (
      name.startsWith("@/components/org/") ||
      name === "./OrgRoleCandidateCard" ||
      name === "@/components/ui/badge" ||
      name === "lucide-react"
    ) {
      return new Proxy({}, { get: (_target, key) => (key === "__esModule" ? true : key === "OrgCandidateListContext" ? { Provider: passthrough } : empty) });
    }
    if (name === "@/components/ui/button") return {
      BareButton: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
        <button {...props}>{children}</button>
      ),
      MuteButton: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
    };
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
  assert.deepEqual(tabItems, ["pending_connection", "company_intro", "external", "saved", "pipeline"]);
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
  assert.equal(boardViews.at(-1)!.tab, "pipeline", "진행 종료 is a column of the pipeline board");
  assert.equal(boardViews.at(-1)!.toolbarTarget, slot);

  // 분할 화면: every stage of the board, in its order, even empty ones, and everyone in it.
  const doc = dom.window.document;
  const sections = () =>
    [...doc.querySelectorAll<HTMLElement>("[data-pipeline-stage]")].map((section) => [
      section.dataset.pipelineStage,
      section.querySelector("h2")?.textContent,
      [...section.querySelectorAll<HTMLElement>("[data-card]")].map((card) => card.dataset.card),
    ]);
  await render("pipeline", false);
  assert.deepEqual(sections(), [
    ["intro_requested", "연결 요청함0", []],
    ["connected", "연결됨0", []],
    ["first_interview", "1차 인터뷰1", ["open"]],
    ["final_offer", "오퍼0", []],
    ["process_stopped", "진행 종료3", ["closed-new", "closed-old", "passing"]],
  ]);
  assert.deepEqual(
    talentBoards.at(-1)?.ids,
    ["closed-new", "closed-old", "open", "passing"],
    "the board's order; saved ones and a decision that takes the person off the list are left out; a pass in its undo window shows under 진행 종료"
  );
  assert.equal(doc.querySelector("[data-pipeline-stage] button"), null, "nothing folded");
  // 전체 프로필 opens in this column, in the list's place, not over the screen.
  assert.ok(doc.querySelector("[data-in-place] [data-pipeline-stage]"));
  await render("pending_connection", false);
  assert.ok(doc.querySelector(".org-candidate-tabs + [data-in-place] .org-candidate-caption"), "under the tabs");
});
