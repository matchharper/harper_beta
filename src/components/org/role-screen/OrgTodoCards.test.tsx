import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrgTodoItem } from "@/lib/org/todo";

async function loadWithStubs(getItems: () => OrgTodoItem[], suggestions: () => number) {
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function (name, ...args) {
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (name === "next/link") return {
      __esModule: true,
      default: ({ children, className, href }: { children: ReactNode; className?: string; href: string }) => (
        <a className={className} href={href}>{children}</a>
      ),
    };
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({ c: (ko: string, _en: string, values?: Record<string, string | number>) =>
        ko.replace(/\{(\w+)\}/g, (_m, key: string) => String(values?.[key] ?? "")), locale: "ko" }),
    };
    if (name === "@/hooks/org/useOrgRoleTodo") return {
      useOrgRoleTodo: () => ({ data: { items: getItems(), myTurn: 2, suggestions: suggestions() }, isError: false, isLoading: false }),
      useDecideOrgTodoSuggestion: () => ({ isError: false, isPending: false, mutate: () => {} }),
      useAnswerOrgCriteriaProposal: () => ({ isError: false, isPending: false, mutate: () => {} }),
      useCancelOrgHarperSchedule: () => ({ isPending: false, mutate: () => {} }),
      useMarkOrgTodoRead: () => ({ mutate: () => {} }),
    };
    return original.call(this, name, ...args);
  };
  try {
    const chip = await import("../OrgTodoChip");
    const cards = await import("./OrgTodoCards");
    return { ...chip, ...cards };
  } finally {
    loader._load = original;
  }
}

// OrgTodoList's own data and buttons, drawn as the role screen's right column.
test("the To-do keeps the chat in focus: only decisions are large cards, the rest compact rows", async () => {
  let items: OrgTodoItem[] = [
    { id: "pc", column: "my_turn", kind: "pending_connection", at: null, count: 3,
      people: [{ name: "김하늘", since: null }, { name: "박도윤", since: null }] },
    { id: "cd", column: "my_turn", kind: "contact_draft", at: null, detail: "question", talent: { id: "t8", name: "오세린", recommendationId: "rec-t8" } },
    { id: "ip", column: "in_progress", kind: "search_running", at: null },
    { id: "hs", column: "scheduled", kind: "harper_scheduled", at: null, detail: "후보 답장 다시 확인",
      nextAt: "2026-11-11T00:00:00.000Z", scheduleId: "sch-1", scheduleRevision: 2, scheduleStatus: "active", scheduledBy: "harper" },
    { id: "ia", column: "notice", kind: "intro_declined", at: null, talent: { id: "t1", name: "이서준", recommendationId: "rec-t1" } },
    { id: "sg1", column: "suggestion", kind: "suggestion", at: null, detail: "기준을 좁혀 볼까요?", suggestionId: "s1" },
    { id: "sg2", column: "suggestion", kind: "suggestion", at: null, detail: "다음 주에 다시 찾아볼까요?", suggestionId: "s2" },
  ];
  const { OrgTodoList, ORG_TODO_CARD_COLUMNS } = await loadWithStubs(() => items, () => 2);
  const render = () =>
    renderToStaticMarkup(
      <OrgTodoList
        columns={ORG_TODO_CARD_COLUMNS}
        onApprove={() => {}}
        range="recent"
        roleId="role-1"
        variant="cards"
        workspaceId="w"
      />
    );
  const html = render();
  // 결정할 것 is the page title; only its lines are large follow-up cards.
  assert.match(html, /<h1>결정할 것 2<\/h1>/);
  assert.equal((html.match(/class="career-followup-title"/g) ?? []).length, 2);
  assert.match(html, /career-followup-title">연결을 기다리는 후보 3명</);
  // Who is waiting, from the line's own people, then how many more.
  assert.match(html, /career-followup-description">김하늘, 박도윤 외 1명</);
  // The step forward reads as words with an arrow, not a black pill.
  assert.ok(html.includes('class="org-todo-go" href="/org/role?orgId=w&amp;roleId=role-1&amp;tab=inbox&amp;inboxStage=pending_connection"'));
  assert.match(html, /class="org-todo-go"[^>]*>결정하기</);

  // Harper's work, plans and updates: compact rows, in the column order.
  assert.ok(html.indexOf("결정할 것 2") < html.indexOf("Harper가 하는 중 1"));
  assert.ok(html.indexOf("Harper가 하는 중 1") < html.indexOf("예정 1"));
  assert.ok(html.indexOf("예정 1") < html.indexOf("알림 1"));
  assert.ok(html.indexOf("알림 1") < html.indexOf("Harper가 할 수 있는 일 2"));
  assert.equal((html.match(/class="org-todo-row"/g) ?? []).length, 4, "하는 중, 예정, 알림 and the first suggestion");
  // A scheduled line shows its time on its own line, who set it up, and 취소 as a quiet answer.
  assert.match(html, /org-todo-row-when">11월 11일\(수\) 오전 9:00</);
  assert.match(html, /org-todo-row-title">Harper 예정: 후보 답장 다시 확인</);
  assert.match(html, /org-todo-row-meta">Harper가 정한 일</);
  assert.match(html, /class="career-card-close"[^>]*>취소</);
  // An update: open it, or mark it read.
  assert.match(html, /class="org-todo-go"[^>]*>보기</);
  assert.match(html, /class="career-card-close"[^>]*>읽음</);

  // Harper's suggestions: the first one with its answers, the rest behind a toggle.
  assert.ok(html.includes("기준을 좁혀 볼까요?"));
  assert.ok(!html.includes("다음 주에 다시 찾아볼까요?"), "the second suggestion waits behind the toggle");
  assert.match(html, /class="org-todo-go"[^>]*>진행하기</);
  assert.match(html, /class="career-card-close"[^>]*>괜찮아요</);
  assert.match(html, /class="career-card-close"[^>]*>이런 제안 그만</);
  assert.match(html, /aria-expanded="false" class="org-todo-more"[^>]*>1개 더 보기</);
  // The requests the team can always make are not cards any more.
  assert.ok(!html.includes("파이프라인을 요약해 드릴까요?"));

  // Nothing to decide: the title still says so, nothing else is invented.
  // Someone who left Harper is an update with no link to a profile that no longer opens.
  items = [{ id: "talent-withdrew:t9", column: "notice", kind: "talent_withdrew", at: null,
    talent: { id: "t9", name: "한지우", recommendationId: null } }];
  const withdrew = render();
  // Why (leaving Harper, a privacy setting) stays the candidate's own.
  assert.match(withdrew, /한지우님과 더 이상 진행할 수 없어요/);
  assert.ok(!withdrew.includes("탈퇴"));
  assert.match(withdrew, /class="career-card-close"[^>]*>읽음</);
  assert.ok(!withdrew.includes("talentId=t9"), "no link to the profile");
  assert.ok(!/class="org-todo-go"[^>]*>보기</.test(withdrew), "nothing to open");

  items = [];
  const empty = render();
  assert.match(empty, /<h1>결정할 것 0<\/h1>/);
  assert.ok(!empty.includes("<li"));
});

test("the requests the team can always make are chips in its words, busy while running", async () => {
  const { OrgTodoShortcutChips } = await loadWithStubs(() => [], () => 0);
  const html = renderToStaticMarkup(
    <OrgTodoShortcutChips
      shortcuts={[
        { actionLabel: "요약 받기", chipLabel: "파이프라인 요약해줘", id: "pipeline_summary", onRun: () => {}, title: "파이프라인을 요약해 드릴까요?" },
        { actionLabel: "찾아 주세요", busy: true, busyLabel: "찾는 중", chipLabel: "후보 더 찾아줘", id: "run_search", onRun: () => {}, title: "지금 목록에 없는 후보를 더 찾아볼까요?" },
      ]}
    />
  );
  assert.match(html, /data-org-todo-shortcut="pipeline_summary"[^>]*>파이프라인 요약해줘</);
  assert.match(html, /aria-busy="true"[^>]*data-org-todo-shortcut="run_search"[^>]*disabled=""[^>]*>찾는 중</);
  assert.ok(!html.includes("요약 받기") && !html.includes("파이프라인을 요약해 드릴까요?"));
});

// The two requests (파이프라인 요약해줘, 후보 더 찾아줘) left the chat input: the
// To-do's last row, fixed, apart from Harper's suggestions.
test("요청하기 is the To-do's last row, in the right column and in the list above the chat", async () => {
  const items: OrgTodoItem[] = [
    { id: "sg1", column: "suggestion", kind: "suggestion", at: null, detail: "기준을 좁혀 볼까요?", suggestionId: "s1" },
  ];
  const { OrgTodoList, ORG_TODO_CARD_COLUMNS } = await loadWithStubs(() => items, () => 1);
  const shortcuts = [
    { actionLabel: "요약 받기", chipLabel: "파이프라인 요약해줘", id: "pipeline_summary", onRun: () => {}, title: "" },
    { actionLabel: "찾아 주세요", busy: true, busyLabel: "찾는 중", chipLabel: "후보 더 찾아줘", id: "run_search", onRun: () => {}, title: "" },
  ];
  for (const variant of ["cards", "rows"] as const) {
    const html = renderToStaticMarkup(
      <OrgTodoList
        columns={ORG_TODO_CARD_COLUMNS}
        onApprove={() => {}}
        range="recent"
        roleId="role-1"
        shortcuts={shortcuts}
        variant={variant}
        workspaceId="w"
      />
    );
    const row = html.indexOf('aria-label="요청하기"');
    assert.ok(row > html.indexOf("기준을 좁혀 볼까요?"), `${variant}: after Harper's suggestions`);
    const tail = html.slice(row);
    assert.match(tail, /data-org-todo-shortcut="pipeline_summary"[^>]*>파이프라인 요약해줘</, variant);
    assert.match(tail, /data-org-todo-shortcut="run_search"[^>]*disabled=""[^>]*>찾는 중</, variant);
    assert.ok(!tail.includes("<section", 1), `${variant}: the last row`);
  }
  // Without requests (a read-only view), no row.
  const html = renderToStaticMarkup(
    <OrgTodoList columns={ORG_TODO_CARD_COLUMNS} onApprove={() => {}} range="recent" roleId="role-1" variant="cards" workspaceId="w" />
  );
  assert.ok(!html.includes("요청하기"));
});
