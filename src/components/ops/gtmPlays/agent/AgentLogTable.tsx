import { Fragment, useState, type ReactNode } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { formatKst } from "../api";

/**
 * The agent log's one row shape (Shaun 11/17), the same on every tab: 시각 · 사람 · 찾은 곳 · 단계 · 내용, in the same
 * order and widths. A row opens its detail on the right (LogSplit).
 */
export type LogRowView = { key: string; at: string | null; person: ReactNode; source: ReactNode; stage: ReactNode; content: ReactNode };

export function LogTable({ rows, selected, onSelect, empty, loading, personHeader = "사람" }: {
  rows: LogRowView[]; selected: string | null; onSelect: (key: string | null) => void; empty: string; loading: boolean;
  /** 검색 기록 lists searches and files, not people. */
  personHeader?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cx("w-full table-fixed text-sm", selected ? "min-w-[680px]" : "min-w-[960px]")}>
        <colgroup>
          <col className="w-28" />
          <col className="w-52" />
          <col className="w-24" />
          <col className="w-48" />
          <col />
        </colgroup>
        <thead className="text-left text-[12px] text-neutral-muted">
          <tr>
            <th className="py-1.5 pr-3 font-normal">시각</th>
            <th className="px-2 py-1.5 font-normal">{personHeader}</th>
            <th className="px-2 py-1.5 font-normal">찾은 곳</th>
            <th className="px-2 py-1.5 font-normal">단계</th>
            <th className="px-2 py-1.5 font-normal">내용</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-1000-a05">
          {rows.map((row) => (
            <tr
              key={row.key}
              onClick={() => onSelect(selected === row.key ? null : row.key)}
              className={cx("cursor-pointer align-top", selected === row.key ? "bg-bg-weak" : "hover:bg-bg-weak/70")}
            >
              <td className="whitespace-nowrap py-2 pr-3 text-[12px] tabular-nums text-neutral-muted">{row.at ? formatKst(row.at) : "—"}</td>
              <td className="min-w-0 px-2 py-2">{row.person}</td>
              <td className="px-2 py-2 text-[12px] text-neutral-muted">{row.source}</td>
              <td className="px-2 py-2">{row.stage}</td>
              <td className="min-w-0 px-2 py-2">{row.content}</td>
            </tr>
          ))}
          {!rows.length && !loading ? (
            <tr><td colSpan={5} className="py-6 text-center text-[12px] text-neutral-muted">{empty}</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** Who: the name (or handle, or the post's title) and one line about them. */
export function PersonCell({ name, intro, email }: { name: string; intro?: string | null; email?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{name}</p>
      {intro ? <p className="line-clamp-1 text-[12px] text-neutral-muted">{intro}</p> : null}
      {email ? <p className="truncate text-[12px] text-neutral-muted">{email}</p> : null}
    </div>
  );
}

/**
 * The log's list with the picked line's detail on the right (Shaun 11/17): the list narrows, the detail stays in view
 * while the list scrolls, × closes it and the list takes the full width again. Not a modal, not a row opening below.
 */
export function LogSplit({ list, detail }: { list: ReactNode; detail: ReactNode | null }) {
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">{list}</div>
      {detail ? <aside className="sticky top-4 max-h-[calc(100vh-2rem)] w-[480px] shrink-0 overflow-y-auto overflow-x-hidden">{detail}</aside> : null}
    </div>
  );
}

const LINK_LINE = /^\s*([^:\n]{1,20}):\s*((?:https?:\/\/|mailto:)\S+)\s*$/;
const URL = /(?:https?:\/\/|mailto:)\S+/g;

/**
 * A mail's plain text as a person reads it: a line that is only "label: link" (공고 보기: http…, 답장하기: mailto:…)
 * becomes that label as a link, and any other link in a line becomes "링크". Never the raw address.
 */
export function MailText({ text, clamp }: { text: string; clamp?: boolean }) {
  const [full, setFull] = useState(false);
  const lines = text.trim().split("\n");
  const long = lines.length > 6 || text.length > 420;
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <div className="text-[12px] leading-5 text-neutral-primary">
      <div className={cx("whitespace-pre-line break-words", clamp && !full && "line-clamp-6")}>
        {lines.map((line, index) => {
          const labelled = LINK_LINE.exec(line);
          const body = labelled ? (
            <a href={labelled[2]} target="_blank" rel="noreferrer" onClick={stop} className={opsTheme.link}>{labelled[1].trim()}</a>
          ) : line.split(URL).map((part, partIndex, parts) => (
            <Fragment key={partIndex}>
              {part}
              {partIndex < parts.length - 1 ? <a href={line.match(URL)?.[partIndex]} target="_blank" rel="noreferrer" onClick={stop} className={opsTheme.link}>링크</a> : null}
            </Fragment>
          ));
          return <Fragment key={index}>{body}{index < lines.length - 1 ? "\n" : ""}</Fragment>;
        })}
      </div>
      {clamp && long ? (
        <button type="button" className="mt-1 text-[12px] text-neutral-muted underline" onClick={(event) => { event.stopPropagation(); setFull(!full); }}>
          {full ? "접기" : "더 보기"}
        </button>
      ) : null}
    </div>
  );
}

/** "11. 17. 하루만 ×": a log narrowed to one KST day (from 하루별 성능). */
export function DayChip({ day, onClear, what = "하루만" }: { day: string; onClear: () => void; what?: string }) {
  const [, m, d] = day.split("-");
  const label = `${Number(m)}. ${Number(d)}. ${what}`;
  return (
    <span className="flex items-center gap-1 rounded-full border border-neutral-1000-a10 bg-bg-weak px-2.5 py-0.5 text-[12px]">
      {label}
      <button type="button" aria-label={`${label} 빼기`} onClick={onClear} className="text-neutral-muted hover:text-neutral-primary">×</button>
    </span>
  );
}
