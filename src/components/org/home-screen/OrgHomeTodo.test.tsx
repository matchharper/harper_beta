import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrgTodoItem } from "@/lib/org/todo";

// 소식's 할 일 as the candidate side's panels, from two roles' To-do; the numbers are on 역할.
test("Home panels: 결정할 것, Harper가 할 수 있는 일 · 알림, Harper's work, each line with its role, for every role or one", async () => {
  const workspaceId = "synthetic-workspace";
  const roles = [
    { roleId: "r1", name: "Backend Engineer", status: "active" },
    { roleId: "r2", name: "Product Designer", status: "paused" },
    { roleId: "r3", name: "Old Role", status: "ended" },
  ];
  const at = "2026-11-05T01:00:00.000Z";
  const items: OrgTodoItem[] = [
    { id: "a", roleId: "r1", column: "my_turn", kind: "pending_connection", at: null, count: 3 },
    { id: "b", roleId: "r2", column: "blocked", kind: "search_failed", at },
    { id: "c", roleId: "r1", column: "suggestion", kind: "suggestion", at, source: "harper", suggestionId: "s1" },
    { id: "d", roleId: "r2", column: "notice", kind: "intro_accepted", at, source: "email" },
    { id: "e", roleId: "r1", column: "in_progress", kind: "search_running", at },
    { id: "f", roleId: "r2", column: "scheduled", kind: "scheduled_search", at: null },
    { id: "g", roleId: "r1", column: "done", kind: "search_done", at },
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
    if (name === "@/hooks/org/useOrgRoleTodo") return {
      orgWorkspaceTodoKey: () => ["org", "board", "now", workspaceId],
      useOrgWorkspaceTodo: () => ({ data: { items, myTurn: 0, suggestions: 1, roles: [] }, isError: false, isLoading: false }),
    };
    if (name === "@/components/org/OrgTodoChip") return {
      OrgTodoGo: ({ act }: { act: { href?: string; label: string } }) =>
        act.href ? <a className="org-todo-go" href={act.href}>{act.label}</a> : <button className="org-todo-go" type="button">{act.label}</button>,
      OrgTodoQuiet: ({ act }: { act: { label: string } }) => <button className="career-card-close" type="button">{act.label}</button>,
      orgTodoHeadings: () => ({
        blocked: "막힌 것", done: "한 일", in_progress: "Harper가 하는 중", my_turn: "결정할 것",
        notice: "알림", scheduled: "예정", suggestion: "Harper가 할 수 있는 일",
      }),
      orgTodoItemDescription: () => null,
      orgTodoItemText: (item: OrgTodoItem) => `text:${item.kind}`,
      orgTodoItemTitle: (item: OrgTodoItem) => `text:${item.kind}`,
      orgTodoItemWhen: () => "",
      useOrgTodoActions: ({ roleId }: { roleId: string }) => ({
        actionParts: (item: OrgTodoItem) => ({
          primary: <button data-action={`${roleId}:${item.kind}`} type="button" />,
          secondary: [],
        }),
        answer: () => {},
        decide: { isError: false, isPending: false },
        detail: () => undefined,
      }),
    };
    return original.call(this, name, ...args);
  };
  let OrgHomeTodo: typeof import("./OrgHomeTodo")["OrgHomeTodo"];
  try {
    ({ OrgHomeTodo } = await import("./OrgHomeTodo"));
  } finally {
    loader._load = original;
  }
  const render = (roleId?: string) => renderToStaticMarkup(<OrgHomeTodo roleId={roleId} />);
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
  // Harper's offers and the updates under the role screen's names (one name for
  // one thing), as compact rows with role · when · source.
  assert.ok(!html.includes("볼 만한 것"));
  const worth = sectionText(html, "Harper가 할 수 있는 일");
  assert.ok(html.includes("Harper가 할 수 있는 일 1") && html.includes("알림 1"));
  assert.match(worth, /org-todo-row-meta">Backend Engineer · [^<]+ · Harper</);
  assert.ok(!worth.includes("Product Designer"), "the update has its own section");
  assert.match(sectionText(html, "알림"), /org-todo-row-meta">Product Designer · [^<]+ · 메일</);
  // A suggestion's plan is sent from its role's chat, so it goes on there.
  assert.ok(worth.includes(`class="org-todo-go" href="/org/role?orgId=${workspaceId}&amp;roleId=r1&amp;tab=chat"`));
  assert.ok(worth.includes("괜찮아요") && worth.includes("이런 제안 그만"));
  // Harper's work and plans: compact rows, never large cards.
  assert.ok(html.includes("Harper가 하는 중 1") && html.includes("예정 1"));
  const later = sectionText(html, "Harper가 하는 중") + sectionText(html, "예정");
  assert.ok(!later.includes("career-followup-title"));
  assert.equal((later.match(/class="org-todo-row"/g) ?? []).length, 2);
  assert.ok(!html.includes("search_done"), "finished work stays on each role");
  // The numbers per role are on 역할 now (one place for them).
  assert.ok(!html.includes("역할 현황") && !html.includes("data-org-role-overview"));

  // 소식 narrowed to one role: its 할 일 shows that role's lines only.
  html = render("r2");
  assert.match(html, /<h1>결정할 것 1<\/h1>/);
  assert.ok(html.includes('data-action="r2:search_failed"') && !html.includes("r1:pending_connection"));
  assert.ok(html.includes("알림 1") && html.includes("예정 1"));
  assert.ok(!html.includes("Harper가 할 수 있는 일") && !html.includes("Harper가 하는 중"), "r1's lines are left out");
  assert.ok(!html.includes("Backend Engineer"));
});
