import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrgTodoItem } from "@/lib/org/todo";

// Home's 채팅 side as the candidate side's panels, from two roles' To-do and numbers.
test("Home panels: 결정할 것, 볼 만한 것, Harper's work and 역할 현황, each line with its role", async () => {
  const workspaceId = "synthetic-workspace";
  const roles = [
    { roleId: "r1", name: "Backend Engineer", status: "active" },
    { roleId: "r2", name: "Product Designer", status: "paused" },
    { roleId: "r3", name: "Old Role", status: "ended" },
  ];
  const at = "2026-11-05T01:00:00.000Z";
  let items: OrgTodoItem[] = [
    { id: "a", roleId: "r1", column: "my_turn", kind: "pending_connection", at: null, count: 3 },
    { id: "b", roleId: "r2", column: "blocked", kind: "search_failed", at },
    { id: "c", roleId: "r1", column: "suggestion", kind: "suggestion", at, source: "harper", suggestionId: "s1" },
    { id: "d", roleId: "r2", column: "notice", kind: "intro_accepted", at, source: "email" },
    { id: "e", roleId: "r1", column: "in_progress", kind: "search_running", at },
    { id: "f", roleId: "r2", column: "scheduled", kind: "scheduled_search", at: null },
    { id: "g", roleId: "r1", column: "done", kind: "search_done", at },
  ];
  let nowRoles = [
    { roleId: "r1", counts: { pending_connection: 3, company_intro: 1, saved: 0, reviewing: 2 } },
    { roleId: "r2", counts: { pending_connection: 0, company_intro: 0, saved: 0, reviewing: 0 } },
    { roleId: "r3", counts: { pending_connection: 0, company_intro: 0, saved: 0, reviewing: 0 } },
  ];
  let boardItems = [
    { roleId: "r1", stage: "connected", savedAt: null },
    { roleId: "r1", stage: "intro_requested", savedAt: null },
    { roleId: "r1", stage: "connected", savedAt: "2026-11-01" },
    { roleId: "r2", stage: "process_stopped", savedAt: null },
  ];
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  const empty = new Proxy({}, { get: () => () => null });
  loader._load = function (name, ...args) {
    if (name === "next/link") return {
      __esModule: true,
      default: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) => (
        <a className={className} href={href}>{children}</a>
      ),
    };
    if (name === "@tanstack/react-query") return { useQueryClient: () => ({ invalidateQueries: async () => {} }) };
    if (name === "lucide-react") return empty;
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({ c: (ko: string) => ko, locale: "ko" }),
      useOrgSourceT: () => (text: string) => text,
    };
    if (name === "@/hooks/org/useOrgWorkspace") return {
      useOrgWorkspace: () => ({ internalOpsAccess: false, roles, workspace: { workspaceId } }),
    };
    if (name === "@/hooks/org/useOrgJobs") return { useOrgJobsBoard: () => ({ board: { items: boardItems } }) };
    if (name === "@/hooks/org/useOrgRoleTodo") return {
      orgWorkspaceTodoKey: () => ["org", "board", "now", workspaceId],
      useOrgWorkspaceTodo: () => ({ data: { items, myTurn: 0, suggestions: 1, roles: nowRoles }, isError: false, isLoading: false }),
    };
    if (name === "@/components/org/OrgTodoChip") return {
      orgTodoHeadings: () => ({
        blocked: "막힌 것", done: "한 일", in_progress: "Harper가 하는 중", my_turn: "결정할 것",
        notice: "알림", scheduled: "예정", suggestion: "Harper가 할 수 있는 일",
      }),
      orgTodoItemText: (item: OrgTodoItem) => `text:${item.kind}`,
      useOrgTodoActions: ({ roleId }: { roleId: string }) => ({
        action: (item: OrgTodoItem) => <button data-action={`${roleId}:${item.kind}`} type="button" />,
        answer: () => {},
        decide: { isError: false, isPending: false },
      }),
    };
    if (name === "@/components/org/OrgHomeInbox") return {
      OrgHomeRoleCards: () => <ul data-role-cards />,
    };
    if (name === "@/components/org/OrgRoleStatusDot") return { OrgRoleStatusDot: () => <span data-dot /> };
    return original.call(this, name, ...args);
  };
  let OrgHomeTodo: typeof import("./OrgHomeTodo")["OrgHomeTodo"];
  try {
    ({ OrgHomeTodo } = await import("./OrgHomeTodo"));
  } finally {
    loader._load = original;
  }
  const render = () => renderToStaticMarkup(<OrgHomeTodo />);
  const sectionText = (html: string, label: string) => {
    const start = html.indexOf(`aria-label="${label}"`);
    assert.ok(start >= 0, `section ${label}`);
    const end = html.indexOf("<section", start + 1);
    return html.slice(start, end < 0 ? undefined : end);
  };

  let html = render();
  // 결정할 것 = what the team decides and what blocks Harper, large, each with its role.
  assert.match(html, /<h1>결정할 것 2<\/h1>/);
  const decide = sectionText(html, "결정할 것");
  assert.ok(decide.includes("Backend Engineer") && decide.includes("Product Designer"));
  assert.ok(decide.includes('data-action="r1:pending_connection"') && decide.includes('data-action="r2:search_failed"'),
    "each line's buttons are its own role's");
  assert.equal((decide.match(/career-followup-title/g) ?? []).length, 2);
  // 볼 만한 것 = Harper's offers and the updates, with role · when · source.
  const worth = sectionText(html, "볼 만한 것");
  assert.ok(html.includes("볼 만한 것 2"));
  assert.match(worth, /career-content-meta">Backend Engineer · [^<]+ · Harper</);
  assert.match(worth, /career-content-meta">Product Designer · [^<]+ · 메일</);
  // A suggestion's plan is sent from its role's chat, so it goes on there.
  assert.ok(worth.includes(`href="/org/role?orgId=${workspaceId}&amp;roleId=r1&amp;tab=chat"`));
  assert.ok(worth.includes("괜찮아요") && worth.includes("이런 제안 그만"));
  assert.ok(html.includes("Harper가 하는 중 1") && html.includes("예정 1"));
  assert.ok(!html.includes("search_done"), "finished work stays on each role");
  // 역할 현황: open roles and their numbers, each opening that role's list.
  const overview = sectionText(html, "역할 현황");
  assert.ok(html.includes("역할 현황 2"), "the ended role with no numbers is left out");
  assert.ok(!overview.includes("Old Role"));
  const stat = (value: number, label: string) =>
    new RegExp(`stat-value">${value}</span><span class="org-home-role-stat-label">${label}<`);
  assert.match(overview, stat(3, "연결을 기다리는 후보"));
  assert.match(overview, stat(1, "연결을 요청할 후보"));
  assert.match(overview, stat(2, "Harper가 확인 중"));
  assert.match(overview, stat(2, "파이프라인"), "open stages only, saved left out");
  assert.ok(overview.includes(`roleId=r1&amp;tab=inbox&amp;inboxStage=company_intro`));
  assert.ok(overview.includes(`roleId=r1&amp;tab=pipeline`));
  assert.ok(!html.includes("data-role-cards"));

  // Nothing to do and nothing to count: the roles as plain cards.
  items = [];
  nowRoles = nowRoles.map((role) => ({ ...role, counts: { pending_connection: 0, company_intro: 0, saved: 0, reviewing: 0 } }));
  boardItems = [];
  html = render();
  assert.match(html, /<h1>결정할 것 0<\/h1>/);
  assert.ok(html.includes("data-role-cards"));
  assert.ok(!html.includes("역할 현황") && !html.includes("볼 만한 것"));
});
