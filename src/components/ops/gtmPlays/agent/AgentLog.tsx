import { useCallback, useEffect, useState } from "react";
import { cx } from "@/components/ops/theme";
import type { AgentLogRow } from "@/lib/gtmPlays/agent/log.server";
import { formatKst, useGtmAction } from "../api";
import { Badge, Button, ErrorNotice } from "../ui";
import { LogSplit, Timeline } from "./AgentPeople";
import { CONTACT_OUTCOME_LABEL, sourceLabel } from "./labels";

const PAGE = 50;

/**
 * The mail as it went out, and why: subject, the body itself (a few lines, 더 보기 for the rest), the proposed
 * postings and how the agent picked them. Shown on every line (Shaun 11/17: the log's own text, without a click).
 */
function MailAndWhy({ row }: { row: AgentLogRow }) {
  const [full, setFull] = useState(false);
  const body = row.body?.trim() ?? "";
  const long = body.split("\n").length > 6 || body.length > 420;
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium">{row.kind === "followup_sent" ? "후속 · " : ""}{row.subject ?? "(제목 없음)"}</p>
      {body ? (
        <div className="rounded-md bg-bg-weak px-3 py-2 text-[12px] leading-5 text-neutral-primary">
          <p className={cx("whitespace-pre-line", !full && "line-clamp-6")}>{body}</p>
          {long ? (
            <button
              type="button"
              className="mt-1 text-[12px] text-neutral-muted underline"
              onClick={(event) => { event.stopPropagation(); setFull(!full); }}
            >
              {full ? "접기" : "더 보기"}
            </button>
          ) : null}
        </div>
      ) : null}
      {row.postings.length ? (
        <p className="text-[12px] text-neutral-muted">
          제안한 공고: {row.postings.map((posting) => `${posting.companyName} · ${posting.title}`).join("  /  ")}
        </p>
      ) : null}
      {row.kind === "sent" && row.reason ? <p className="text-[12px] text-neutral-muted">공고 고르기: {row.reason}</p> : null}
    </div>
  );
}

/**
 * 로그 · 보낸 메일: who the agent wrote to, where it found them, the mail itself, what it proposed and why, and what
 * came of it, newest first. A line opens the person's whole timeline (every step, 답장 옴).
 */
export default function AgentLog({ days, source, includeTest, refreshKey }: {
  days: number; source: string | null; includeTest: boolean; refreshKey: number;
}) {
  // A page belongs to one set of filters; changing a filter starts again at the first page.
  const filters = `${days}:${source ?? ""}:${includeTest}`;
  const [page, setPage] = useState({ filters, offset: 0 });
  const offset = page.filters === filters ? page.offset : 0;
  const setOffset = (value: number) => setPage({ filters, offset: value });
  const [open, setOpen] = useState<string | null>(null);
  const list = useGtmAction<{ rows: AgentLogRow[]; total: number }>();
  const { run } = list;
  const load = useCallback(() => {
    void run("agent.log", { days, source, mailsOnly: true, includeTest, limit: PAGE, offset });
  }, [run, days, source, includeTest, offset]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const rows = list.result?.rows ?? [];
  const total = list.result?.total ?? 0;
  const openRow = rows.find((row) => `${row.personId}:${row.at}:${row.kind}` === open) ?? null;
  return (
    <div>
      <ErrorNotice message={list.error} />
      <LogSplit
        detail={openRow ? <Timeline key={openRow.personId} id={openRow.personId} onClose={() => setOpen(null)} /> : null}
        list={(
          <div className="overflow-x-auto">
            <table className={cx("w-full table-fixed text-sm", openRow ? "min-w-[640px]" : "min-w-[860px]")}>
              <colgroup>
                <col className="w-32" />
                <col className="w-52" />
                <col className="w-28" />
                <col />
                <col className="w-24" />
              </colgroup>
              <thead className="text-left text-[12px] text-neutral-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-normal">보낸 때</th>
                  <th className="px-2 py-1.5 font-normal">누구에게</th>
                  <th className="px-2 py-1.5 font-normal">찾은 곳</th>
                  <th className="px-2 py-1.5 font-normal">메일 · 제안한 공고 · 이유</th>
                  <th className="px-2 py-1.5 font-normal">그 뒤</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-1000-a05">
                {rows.map((row) => {
                  const key = `${row.personId}:${row.at}:${row.kind}`;
                  // The same words as the numbers and the people log: 답장 옴, or how far the person got (회사 연결 … 보냄).
                  const after = row.status === "replied" ? "답장 옴" : row.outcome ? CONTACT_OUTCOME_LABEL[row.outcome] : null;
                  const tone = row.status === "replied" || ["connected", "interested", "signed_up"].includes(row.outcome ?? "") ? "positive"
                    : row.outcome === "bounced" || row.outcome === "unsubscribed" ? "critical" : "default";
                  return (
                    <tr
                      key={key}
                      onClick={() => setOpen(open === key ? null : key)}
                      className={cx("cursor-pointer align-top", open === key ? "bg-bg-weak" : "hover:bg-bg-weak/70")}
                    >
                      <td className="py-1.5 pr-3 text-[12px] tabular-nums text-neutral-muted">{formatKst(row.at)}</td>
                      <td className="px-2 py-1.5">
                        <p className="truncate">
                          <span className="font-medium">{row.name ?? "이름 없음"}</span>
                          {row.isTest ? <span className="ml-1 text-[11px] text-neutral-muted">테스트</span> : null}
                        </p>
                        {row.headline ? <p className="line-clamp-2 text-[12px] text-neutral-muted">{row.headline}</p> : null}
                        {row.email ? <p className="truncate text-[12px] text-neutral-muted">{row.email}</p> : null}
                      </td>
                      <td className="px-2 py-1.5 text-[12px] text-neutral-muted">{sourceLabel(row.source)}</td>
                      <td className="px-2 py-1.5">
                        <MailAndWhy row={row} />
                      </td>
                      <td className="px-2 py-1.5">
                        {after ? <Badge tone={tone}>{after}</Badge> : <span className="text-[12px] text-neutral-muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && !list.loading ? (
                  <tr><td colSpan={5} className="py-4 text-center text-[12px] text-neutral-muted">이 기간에 보낸 메일이 없어요.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      />
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
