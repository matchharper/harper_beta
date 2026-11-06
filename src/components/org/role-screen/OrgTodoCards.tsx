import { useEffect, useState, type ReactNode } from "react";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgTodoColumn, OrgTodoItem } from "@/lib/org/todo";
import type { OrgTodoShortcut } from "@/components/org/OrgTodoChip";

/**
 * The role screen's 채팅 column order: what the team decides, what blocks it,
 * what Harper is doing and will do, updates, then what Harper offers.
 */
export const ORG_TODO_CARD_COLUMNS: OrgTodoColumn[] = [
  "my_turn",
  "blocked",
  "in_progress",
  "scheduled",
  "notice",
  "suggestion",
];

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  // Read on the client only, so a server render never shows another time.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  return now;
}

function TodoCard({
  action,
  emphasis,
  footer,
  title,
}: {
  action?: ReactNode;
  emphasis: boolean;
  footer?: ReactNode;
  title: ReactNode;
}) {
  return (
    <li className="career-followup-item">
      <article className="career-followup-card career-glass org-todo-card">
        <span className={emphasis ? "career-followup-title" : "career-content-title"}>
          {title}
        </span>
        {action || footer ? (
          <div className="org-todo-card-actions">
            {action ? <div className="flex flex-wrap items-center gap-1.5">{action}</div> : null}
            {footer}
          </div>
        ) : null}
      </article>
    </li>
  );
}

/**
 * The To-do in the candidate side's follow-up style: the decisions as large
 * cards under the date, then the other sections with small headings. Data and
 * actions come from OrgTodoList, so the chip and the cards stay the same.
 */
export function OrgTodoCards({
  columns,
  decideError,
  decidePending,
  headings,
  items,
  onMute,
  renderAction,
  shortcuts,
  suggestionCount,
  title,
}: {
  columns: OrgTodoColumn[];
  decideError: boolean;
  decidePending: boolean;
  headings: Record<OrgTodoColumn, string>;
  items: OrgTodoItem[];
  onMute: (item: OrgTodoItem) => void;
  renderAction: (item: OrgTodoItem) => ReactNode;
  shortcuts: OrgTodoShortcut[];
  suggestionCount: number;
  title: (item: OrgTodoItem) => string;
}) {
  const { c, locale } = useOrgLocale();
  const now = useNow();
  const tag = locale === "ko" ? "ko-KR" : "en-US";
  const sections = columns.map((column) => {
    const group = items.filter((item) => item.column === column);
    const extra = column === "suggestion" ? shortcuts : [];
    return {
      column,
      count: column === "suggestion" ? suggestionCount + extra.length : group.length,
      extra,
      group,
    };
  });
  const [first, ...rest] = sections;
  const card = (item: OrgTodoItem, emphasis: boolean) => (
    <TodoCard
      action={renderAction(item)}
      emphasis={emphasis}
      footer={
        item.kind === "suggestion" ? (
          <button
            className="career-card-close"
            disabled={decidePending}
            onClick={() => onMute(item)}
            type="button"
          >
            {c("이런 제안 그만", "Stop suggesting this")}
          </button>
        ) : undefined
      }
      key={item.id}
      title={title(item)}
    />
  );
  const shortcutCard = (shortcut: OrgTodoShortcut) => (
    <TodoCard
      action={
        <MuteButton
          aria-busy={shortcut.busy || undefined}
          disabled={shortcut.busy}
          onClick={shortcut.onRun}
          size="sm"
          type="button"
          variant="dark"
        >
          {shortcut.busy ? shortcut.busyLabel : shortcut.actionLabel}
        </MuteButton>
      }
      emphasis={false}
      key={shortcut.id}
      title={shortcut.title}
    />
  );

  return (
    <div className="career-followups org-todo-cards" data-org-todo-cards>
      {first ? (
        <section aria-label={headings[first.column]}>
          <header className="career-followups-header">
            <div className="career-followups-date" suppressHydrationWarning>
              {now
                ? `${new Intl.DateTimeFormat(tag, { month: "long", day: "numeric", weekday: "long" }).format(now)} · ${new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit" }).format(now)}`
                : " "}
            </div>
            <h1>
              {headings[first.column]} {first.count}
            </h1>
          </header>
          {decideError ? (
            <p className="mb-3 text-[12px] text-critical" role="alert">
              {c(
                "제안에 답하지 못했어요. 다시 눌러 주세요.",
                "Couldn't answer the suggestion. Try again."
              )}
            </p>
          ) : null}
          {first.group.length || first.extra.length ? (
            <ul className="space-y-3">
              {first.group.map((item) => card(item, true))}
              {first.extra.map(shortcutCard)}
            </ul>
          ) : null}
        </section>
      ) : null}
      {rest
        .filter((section) => section.group.length || section.extra.length)
        .map((section) => (
          <section
            aria-label={headings[section.column]}
            className="career-content"
            key={section.column}
          >
            <h2 className="career-content-heading">
              {headings[section.column]} {section.count}
            </h2>
            <ul className="space-y-3">
              {section.group.map((item) => card(item, false))}
              {section.extra.map(shortcutCard)}
            </ul>
          </section>
        ))}
    </div>
  );
}
