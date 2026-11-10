import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

// Home's 역할: the former 역할 page and Home's 역할 현황 in one card per role.
test("역할: one row of numbers per role — the two decision lists and Harper's checking, then 파이프라인", async (t) => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://fixture.invalid" });
  const original = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const doc = dom.window.document;
  const root = createRoot(doc.getElementById("root")!);
  t.after(async () => {
    await act(async () => root.unmount());
    Object.assign(globalThis, original, { IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  });

  const workspaceId = "synthetic-workspace";
  const roles = [
    { roleId: "r1", name: "Backend Engineer", status: "active", updatedAt: "2026-11-01T00:00:00.000Z" },
    { roleId: "r2", name: "Draft Role", status: "draft", updatedAt: "2026-11-01T00:00:00.000Z" },
  ];
  const stage = (id: string, label: string, roleId?: string) => ({ id, label, roleId });
  const stages = [
    stage("accepted", "Harper가 확인 중"),
    stage("pending_connection", "연결을 기다리는 후보"),
    stage("connected", "연결됨"),
    stage("custom:interview", "Backend Engineer · 인터뷰", "r1"),
    stage("final_offer", "오퍼"),
    stage("process_stopped", "진행 종료"),
    stage("archived", "보관"),
  ];
  const counts = new Map([
    ["r1:pending_connection", 3],
    ["r1:company_intro", 1],
    ["r1:connected", 2],
    ["r1:process_stopped", 1],
  ]);
  const pushes: string[] = [];
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const load = loader._load;
  const empty = new Proxy({}, { get: () => () => null });
  loader._load = function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "next/router") return { useRouter: () => ({ push: async (href: string) => pushes.push(href) }) };
    if (name === "lucide-react") return empty;
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({
        c: (ko: string, _en?: string, values?: Record<string, unknown>) =>
          ko.replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? "")),
        locale: "ko",
      }),
      useOrgSourceT: () => (text: string) => text,
    };
    if (name === "@/hooks/org/useOrgJobs") return {
      useOrgJobsBoard: () => ({ board: { items: [], stages }, boardQuery: { isLoading: false } }),
      useOrgJobsRoleActions: () => ({ roleActionPending: false }),
    };
    if (name === "@/hooks/org/useOrgRoleTodo") return {
      useOrgWorkspaceTodo: () => ({
        data: { roles: [{ roleId: "r1", counts: { pending_connection: 3, company_intro: 1, saved: 0, reviewing: 2 } }] },
      }),
    };
    if (name === "@/hooks/org/useOrgWorkspace") return {
      useOrgWorkspace: () => ({ permissions: { canManageCandidates: false }, roles, workspace: { workspaceId } }),
    };
    if (name === "@/lib/org/roleBoardSummary") return {
      buildRoleOverviewCounts: () => counts,
      buildRoleStages: () => stages,
      getRoleStageLabel: (value: { label: string }) => value.label.replace("Backend Engineer · ", ""),
    };
    if (name === "@/components/org/internal/InternalOnlySurface") return {
      InternalOnlySurface: ({ children }: { children: ReactNode }) => <div data-internal-only>{children}</div>,
    };
    if (["@/components/org/OrgRoleActionsMenu", "@/components/ui/dropdown-menu", "@/components/ui/input"].includes(name))
      return empty;
    return load.call(this, name, ...args);
  };
  let OrgAllRolesOverview: typeof import("./OrgAllRolesOverview")["OrgAllRolesOverview"];
  try {
    ({ OrgAllRolesOverview } = await import("./OrgAllRolesOverview"));
  } finally {
    loader._load = load;
  }
  await act(async () => {
    root.render(<OrgAllRolesOverview embedded />);
  });

  const card = [...doc.querySelectorAll("article")].find((article) => article.textContent?.includes("Backend Engineer"))!;
  // Each number with its label, in order (a cell's label, then its number).
  const cells = [...card.querySelectorAll<HTMLElement>(".border-l-2")].map((cell) => ({
    label: cell.children[0]?.textContent,
    count: Number(cell.children[1]?.textContent),
    opens: cell.tagName === "BUTTON",
  }));
  assert.deepEqual(cells.slice(0, 3), [
    { label: "연결을 기다리는 후보", count: 3, opens: true },
    { label: "연결을 요청할 후보", count: 1, opens: true },
    // A number only: there is no list of the people Harper is checking.
    { label: "Harper가 확인 중", count: 2, opens: false },
  ]);
  assert.deepEqual(
    cells.slice(3).map(({ label, count }) => `${label} ${count}`),
    ["연결됨 2", "인터뷰 0", "오퍼 0", "진행 종료 1", "보관 0"],
    "파이프라인's stages; the decision list and Harper's checking are not repeated"
  );
  assert.ok(!card.textContent?.includes("파이프라인"), "the stages need no label");
  // The former page's 전체 · 진행 종료 column repeated the 후보 N명 chip and the 진행 종료 stage.
  assert.ok(!card.textContent?.includes("전체 후보자") && !/전체\d/.test(card.textContent ?? ""));
  assert.equal(card.textContent?.match(/진행 종료/g)?.length, 1);
  assert.ok(card.querySelector("[data-internal-only]")?.textContent?.includes("보관"));

  // The decision numbers open that role's list; a stage opens 파이프라인.
  const button = (label: string) =>
    [...card.querySelectorAll("button")].find((element) => element.textContent?.startsWith(label))!;
  await act(async () => button("연결을 요청할 후보").click());
  await act(async () => button("연결을 기다리는 후보").click());
  await act(async () => button("연결됨").click());
  assert.deepEqual(pushes, [
    `/org/role?orgId=${workspaceId}&roleId=r1&tab=inbox&inboxStage=company_intro`,
    `/org/role?orgId=${workspaceId}&roleId=r1&tab=inbox&inboxStage=pending_connection`,
    `/org/role?orgId=${workspaceId}&roleId=r1&tab=pipeline&view=pipeline`,
  ]);

  // A draft role has no numbers yet.
  const draft = [...doc.querySelectorAll("article")].find((article) => article.textContent?.includes("Draft Role"))!;
  assert.equal(draft.querySelectorAll(".border-l-2").length, 0);
});
