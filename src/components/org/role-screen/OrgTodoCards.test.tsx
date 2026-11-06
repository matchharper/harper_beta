import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrgTodoItem } from "@/lib/org/todo";

// OrgTodoList's own data and buttons, drawn as the role screen's cards.
test("the To-do as cards: decisions first and large, other sections only when they have something", async () => {
  let items: OrgTodoItem[] = [
    { id: "pc", column: "my_turn", kind: "pending_connection", at: null, count: 3 },
    { id: "cd", column: "my_turn", kind: "contact_draft", at: null, detail: "question", talent: { id: "t8", name: "오세린", recommendationId: "rec-t8" } },
    { id: "sg", column: "suggestion", kind: "suggestion", at: null, detail: "기준을 좁혀 볼까요?", suggestionId: "s1" },
    { id: "ia", column: "notice", kind: "intro_declined", at: null, talent: { id: "t1", name: "이서준", recommendationId: "rec-t1" } },
  ];
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function (name, ...args) {
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (name === "next/link") return {
      __esModule: true,
      default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
    };
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({ c: (ko: string, _en: string, values?: Record<string, string | number>) =>
        ko.replace(/\{(\w+)\}/g, (_m, key: string) => String(values?.[key] ?? "")), locale: "ko" }),
    };
    if (name === "@/hooks/org/useOrgRoleTodo") return {
      useOrgRoleTodo: () => ({ data: { items, myTurn: 2, suggestions: 1 }, isError: false, isLoading: false }),
      useDecideOrgTodoSuggestion: () => ({ isError: false, isPending: false, mutate: () => {} }),
      useAnswerOrgCriteriaProposal: () => ({ isError: false, isPending: false, mutate: () => {} }),
      useCancelOrgHarperSchedule: () => ({ isPending: false, mutate: () => {} }),
      useMarkOrgTodoRead: () => ({ mutate: () => {} }),
    };
    return original.call(this, name, ...args);
  };
  let OrgTodoList: typeof import("../OrgTodoChip")["OrgTodoList"];
  let ORG_TODO_CARD_COLUMNS: typeof import("./OrgTodoCards")["ORG_TODO_CARD_COLUMNS"];
  try {
    ({ OrgTodoList } = await import("../OrgTodoChip"));
    ({ ORG_TODO_CARD_COLUMNS } = await import("./OrgTodoCards"));
  } finally {
    loader._load = original;
  }
  const render = (shortcuts: Parameters<typeof OrgTodoList>[0]["shortcuts"] = []) =>
    renderToStaticMarkup(
      <OrgTodoList
        columns={ORG_TODO_CARD_COLUMNS}
        onApprove={() => {}}
        range="recent"
        roleId="role-1"
        shortcuts={shortcuts}
        variant="cards"
        workspaceId="w"
      />
    );
  const html = render([{ actionLabel: "요약 받기", id: "pipeline_summary", onRun: () => {}, title: "파이프라인을 요약해 드릴까요?" }]);
  // 결정할 것 is the page title; 알림 and Harper가 할 수 있는 일 follow; 하는 중 is empty and left out.
  assert.match(html, /<h1>결정할 것 2<\/h1>/);
  assert.ok(html.indexOf("결정할 것 2") < html.indexOf("알림 1"));
  assert.ok(html.indexOf("알림 1") < html.indexOf("Harper가 할 수 있는 일 2"));
  assert.ok(!html.includes("Harper가 하는 중"));
  // Decisions use the follow-up title, the rest the smaller one; the actions are the list's own.
  assert.match(html, /class="career-followup-title">연결을 기다리는 후보 3명</);
  assert.match(html, /class="career-content-title">이서준님이 연결을 거절했어요</);
  assert.ok(html.includes('href="/org/role?orgId=w&amp;roleId=role-1&amp;tab=inbox&amp;inboxStage=pending_connection"'));
  assert.ok(html.includes(">결정하기<") && html.includes(">읽음<"));
  assert.ok(html.includes(">진행하기<") && html.includes(">이런 제안 그만<"));
  assert.ok(html.includes(">파이프라인을 요약해 드릴까요?<") && html.includes(">요약 받기<"));

  // Nothing to decide: the title still says so, nothing else is invented.
  items = [];
  const empty = render();
  assert.match(empty, /<h1>결정할 것 0<\/h1>/);
  assert.ok(!empty.includes("<li"));
});
