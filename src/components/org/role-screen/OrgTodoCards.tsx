import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  Circle,
  CircleDashed,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgTodoColumn, OrgTodoItem } from "@/lib/org/todo";
import type { OrgTodoActionParts } from "@/components/org/OrgTodoChip";

/** Each To-do column's icon, the same on every surface. */
export const ORG_TODO_COLUMN_ICON: Record<OrgTodoColumn, LucideIcon> = {
  blocked: AlertTriangle,
  done: Check,
  in_progress: Clock,
  my_turn: Circle,
  notice: Bell,
  scheduled: CalendarClock,
  suggestion: CircleDashed,
};

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

/** "11월 6일 금요일 · 오후 9:06", the candidate side's line above 지금 팔로업. */
export function OrgTodoDate() {
  const { locale } = useOrgLocale();
  const now = useNow();
  const tag = locale === "ko" ? "ko-KR" : "en-US";
  return (
    <div className="career-followups-date" suppressHydrationWarning>
      {now
        ? `${new Intl.DateTimeFormat(tag, { month: "long", day: "numeric", weekday: "long" }).format(now)} · ${new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit" }).format(now)}`
        : "\u00a0"}
    </div>
  );
}

/**
 * What the team decides, as the candidate side's follow-up card: a sentence
 * title, who it is about, then the step forward with an arrow and the quiet
 * answers (괜찮아요, 읽음) at the end of the line.
 */
export function OrgTodoFollowupCard({
  description,
  detail,
  meta,
  parts,
  title,
}: {
  /** One line the title does not say, e.g. who is waiting. */
  description?: ReactNode;
  /** Under the actions: an error, or who set up the work. */
  detail?: ReactNode;
  /** A line above the title, e.g. the Role on Home. */
  meta?: ReactNode;
  parts: OrgTodoActionParts;
  title: ReactNode;
}) {
  return (
    <li className="career-followup-item">
      <article className="career-followup-card career-glass org-todo-card">
        {meta ? <span className="org-todo-card-meta">{meta}</span> : null}
        <span className="career-followup-title">{title}</span>
        {description ? (
          <span className="career-followup-description">{description}</span>
        ) : null}
        {parts.primary || parts.secondary.length ? (
          <div className="org-todo-followup-actions">
            {parts.primary ?? <span />}
            {parts.secondary.length ? (
              <span className="org-todo-quiet">{parts.secondary}</span>
            ) : null}
          </div>
        ) : null}
        {detail ? <div className="org-todo-row-meta">{detail}</div> : null}
      </article>
    </li>
  );
}

/**
 * Everything else as a compact row, like the candidate side's 다음 일정: an
 * icon, the time when it is the point, the line, a small meta line. A step
 * forward sits on its own line under it; quiet answers alone sit at the right.
 */
export function OrgTodoCompactRow({
  icon: Icon,
  meta,
  parts,
  title,
  trailing,
  when,
}: {
  icon: LucideIcon;
  meta?: ReactNode;
  parts: OrgTodoActionParts;
  title: ReactNode;
  /** At the end of the action line, e.g. a suggestion's 이런 제안 그만. */
  trailing?: ReactNode;
  when?: string;
}) {
  const below = Boolean(parts.primary);
  return (
    <li className="org-todo-row">
      <Icon aria-hidden className="org-todo-row-icon" strokeWidth={1.5} />
      <div className="org-todo-row-body">
        {when ? <span className="org-todo-row-when">{when}</span> : null}
        <span className="org-todo-row-title">{title}</span>
        {meta ? <span className="org-todo-row-meta">{meta}</span> : null}
        {below ? (
          <div className="org-todo-row-actions">
            {parts.primary}
            {parts.secondary}
            {trailing ? <span className="org-todo-row-trailing">{trailing}</span> : null}
          </div>
        ) : null}
      </div>
      {!below && (parts.secondary.length || trailing) ? (
        <div className="org-todo-row-side">
          {parts.secondary}
          {trailing}
        </div>
      ) : null}
    </li>
  );
}

/** Harper's suggestions: the first one, then the rest behind "N개 더 보기". */
export function OrgTodoFoldedRows({
  children,
}: {
  children: ReactNode[];
}) {
  const { c } = useOrgLocale();
  const [open, setOpen] = useState(false);
  const rest = children.length - 1;
  return (
    <>
      <ul className="org-todo-rows">{open ? children : children.slice(0, 1)}</ul>
      {rest > 0 ? (
        <button
          aria-expanded={open}
          className="org-todo-more"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open
            ? c("접기", "Show less")
            : c("{n}개 더 보기", "Show {n} more", { n: rest })}
        </button>
      ) : null}
    </>
  );
}

/** Columns whose lines are things the team decides: the only large cards. */
export const ORG_TODO_CARD_DECIDE_COLUMNS: OrgTodoColumn[] = ["my_turn", "blocked"];

/**
 * The To-do in the candidate side's follow-up style, kept small so the chat
 * stays the focus: only 결정할 것 and 막힌 것 as large cards under the date;
 * Harper's work, plans and updates as compact rows; Harper's suggestions
 * compact, the first one shown. Data and actions come from OrgTodoList.
 */
export function OrgTodoCards({
  columns,
  decideError,
  detail,
  headings,
  items,
  parts,
  people,
  suggestionCount,
  text,
  title,
  when,
}: {
  columns: OrgTodoColumn[];
  decideError: boolean;
  /** Under a line: who set up Harper's work, a failed cancel. */
  detail: (item: OrgTodoItem) => ReactNode;
  headings: Record<OrgTodoColumn, string>;
  items: OrgTodoItem[];
  parts: (item: OrgTodoItem) => OrgTodoActionParts;
  people: (item: OrgTodoItem) => string | null;
  suggestionCount: number;
  /** The line without its time (the row shows the time above it). */
  text: (item: OrgTodoItem) => string;
  /** The line with its time, for lines whose time is not shown apart. */
  title: (item: OrgTodoItem) => string;
  when: (item: OrgTodoItem) => string;
}) {
  const { c } = useOrgLocale();
  const [first, ...rest] = columns;
  const group = (column: OrgTodoColumn) =>
    items.filter((item) => item.column === column);
  const card = (item: OrgTodoItem) => (
    <OrgTodoFollowupCard
      description={people(item)}
      detail={detail(item)}
      key={item.id}
      parts={parts(item)}
      title={title(item)}
    />
  );
  const row = (item: OrgTodoItem) => {
    const time = when(item);
    const lineParts = parts(item);
    return (
      <OrgTodoCompactRow
        icon={ORG_TODO_COLUMN_ICON[item.column]}
        key={item.id}
        // A suggestion's own control is its 이런 제안 그만, at the end of its line.
        meta={item.kind === "suggestion" ? undefined : detail(item)}
        parts={lineParts}
        title={time ? text(item) : title(item)}
        trailing={lineParts.trailing}
        when={time || undefined}
      />
    );
  };
  const heading = (column: OrgTodoColumn, count: number) => (
    <h2 className="career-content-heading">
      {headings[column]} {count}
    </h2>
  );
  return (
    <div className="career-followups org-todo-cards" data-org-todo-cards>
      {first ? (
        <section aria-label={headings[first]}>
          <header className="career-followups-header">
            <OrgTodoDate />
            <h1>
              {headings[first]} {group(first).length}
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
          {group(first).length ? (
            <ul className="space-y-3">{group(first).map(card)}</ul>
          ) : null}
        </section>
      ) : null}
      {rest.map((column) => {
        const lines = group(column);
        if (!lines.length) return null;
        if (ORG_TODO_CARD_DECIDE_COLUMNS.includes(column)) {
          return (
            <section aria-label={headings[column]} className="career-content" key={column}>
              {heading(column, lines.length)}
              <ul className="space-y-3">{lines.map(card)}</ul>
            </section>
          );
        }
        if (column === "suggestion") {
          return (
            <section
              aria-label={headings[column]}
              className="career-content org-todo-compact"
              key={column}
            >
              {heading(column, suggestionCount)}
              <OrgTodoFoldedRows>{lines.map(row)}</OrgTodoFoldedRows>
            </section>
          );
        }
        return (
          <section
            aria-label={headings[column]}
            className="career-content org-todo-compact"
            key={column}
          >
            {heading(column, lines.length)}
            <ul className="org-todo-rows">{lines.map(row)}</ul>
          </section>
        );
      })}
    </div>
  );
}
