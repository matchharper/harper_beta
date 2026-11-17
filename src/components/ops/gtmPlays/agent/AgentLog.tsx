import { Fragment, useCallback, useEffect, useState } from "react";
import { cx } from "@/components/ops/theme";
import type { AgentLogRow } from "@/lib/gtmPlays/agent/log.server";
import { formatKst, useGtmAction } from "../api";
import { Badge, Button, ErrorNotice } from "../ui";
import { Timeline } from "./AgentPeople";
import { EVENT_LABEL, EXCLUDE_LABEL, byLabel, sourceLabel } from "./labels";

const PAGE = 50;

/** What happened and why, in one cell: the mail and the reason for a sent line, the reason for any other. */
function WhatAndWhy({ row }: { row: AgentLogRow }) {
  if (row.kind === "sent" || row.kind === "followup_sent") {
    return (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.subject ?? "(제목 없음)"}</p>
        {row.postings.length ? (
          <p className="truncate text-[12px] text-neutral-muted">
            {row.postings.map((posting) => `${posting.companyName} · ${posting.title}`).join("  /  ")}
          </p>
        ) : null}
        {row.kind === "sent" && row.reason ? <p className="line-clamp-2 text-[12px] text-neutral-muted">이유: {row.reason}</p> : null}
      </div>
    );
  }
  const why = row.kind === "excluded" && row.excludeReason ? EXCLUDE_LABEL[row.excludeReason] : null;
  const text = [why, row.note].filter(Boolean).join(" · ");
  return <p className="line-clamp-2 text-[12px] text-neutral-muted">{text || "—"}</p>;
}

/**
 * #5 로그: who the agent wrote to, what it sent and why, newest first; "모든 일" adds every other step (found,
 * excluded and why, no fitting company, clicks, sign-ups, replies). A line opens the person's whole timeline with
 * the mail bodies.
 */
export default function AgentLog({ days, source, includeTest, refreshKey }: {
  days: number; source: string | null; includeTest: boolean; refreshKey: number;
}) {
  const [mailsOnly, setMailsOnly] = useState(true);
  // A page belongs to one set of filters; changing a filter starts again at the first page.
  const filters = `${days}:${source ?? ""}:${mailsOnly}:${includeTest}`;
  const [page, setPage] = useState({ filters, offset: 0 });
  const offset = page.filters === filters ? page.offset : 0;
  const setOffset = (value: number) => setPage({ filters, offset: value });
  const [open, setOpen] = useState<string | null>(null);
  const list = useGtmAction<{ rows: AgentLogRow[]; total: number }>();
  const { run } = list;
  const load = useCallback(() => {
    void run("agent.log", { days, source, mailsOnly, includeTest, limit: PAGE, offset });
  }, [run, days, source, mailsOnly, includeTest, offset]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const rows = list.result?.rows ?? [];
  const total = list.result?.total ?? 0;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-neutral-1000-a05">
          {([[true, "보낸 메일"], [false, "모든 일"]] as const).map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setMailsOnly(value)}
              className={cx("px-3 py-1 text-[12px]", mailsOnly === value ? "bg-bg-weak font-medium text-neutral-primary" : "text-neutral-muted hover:bg-bg-weak/70")}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-neutral-muted">최근 {days}일 · {total}줄</span>
      </div>
      <ErrorNotice message={list.error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed text-sm">
          <colgroup>
            <col className="w-32" />
            <col className="w-56" />
            <col className="w-28" />
            <col className="w-28" />
            <col />
          </colgroup>
          <thead className="text-left text-[12px] text-neutral-muted">
            <tr>
              <th className="py-1.5 pr-3 font-normal">언제</th>
              <th className="px-2 py-1.5 font-normal">누구에게</th>
              <th className="px-2 py-1.5 font-normal">찾은 곳</th>
              <th className="px-2 py-1.5 font-normal">한 일</th>
              <th className="px-2 py-1.5 font-normal">무엇을 · 왜</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-1000-a05">
            {rows.map((row) => {
              const key = `${row.personId}:${row.at}:${row.kind}`;
              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => setOpen(open === key ? null : key)}
                    className={cx("cursor-pointer align-top", open === key ? "bg-bg-weak" : "hover:bg-bg-weak/70")}
                  >
                    <td className="py-1.5 pr-3 text-[12px] tabular-nums text-neutral-muted">{formatKst(row.at)}</td>
                    <td className="truncate px-2 py-1.5">
                      <span className="font-medium">{row.name ?? "이름 없음"}</span>
                      {row.isTest ? <span className="ml-1 text-[11px] text-neutral-muted">테스트</span> : null}
                      <p className="truncate text-[12px] text-neutral-muted">{row.email ?? row.headline ?? ""}</p>
                    </td>
                    <td className="px-2 py-1.5 text-[12px] text-neutral-muted">{sourceLabel(row.source)}</td>
                    <td className="px-2 py-1.5">
                      <Badge tone={row.kind === "failed" ? "critical" : row.kind === "sent" || row.kind === "followup_sent" || row.kind === "signed_up" ? "positive" : "default"}>
                        {EVENT_LABEL[row.kind] ?? row.kind}
                      </Badge>
                      {row.by !== "agent" ? <span className="ml-1 text-[11px] text-neutral-muted">{byLabel(row.by)}</span> : null}
                    </td>
                    <td className="px-2 py-1.5"><WhatAndWhy row={row} /></td>
                  </tr>
                  {open === key ? (
                    <tr><td colSpan={5} className="bg-bg-weak px-2 pb-3"><Timeline id={row.personId} onClose={() => setOpen(null)} /></td></tr>
                  ) : null}
                </Fragment>
              );
            })}
            {!rows.length && !list.loading ? (
              <tr><td colSpan={5} className="py-4 text-center text-[12px] text-neutral-muted">{mailsOnly ? "이 기간에 보낸 메일이 없어요." : "이 기간에 한 일이 없어요."}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {total > PAGE ? (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-neutral-muted">
          <Button onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={offset === 0}>이전</Button>
          <span>{offset + 1}–{Math.min(offset + PAGE, total)} / {total}</span>
          <Button onClick={() => setOffset(offset + PAGE)} disabled={offset + PAGE >= total}>다음</Button>
        </div>
      ) : null}
    </div>
  );
}
