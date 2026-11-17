import { Fragment, useCallback, useEffect, useState } from "react";
import { cx } from "@/components/ops/theme";
import type { AgentLogRow } from "@/lib/gtmPlays/agent/log.server";
import { formatKst, useGtmAction } from "../api";
import { Badge, Button, ErrorNotice } from "../ui";
import { Timeline } from "./AgentPeople";
import { sourceLabel } from "./labels";

const PAGE = 50;

const AFTER_LABEL: Partial<Record<AgentLogRow["kind"], string>> = {
  signed_up: "가입", replied: "답장 옴", clicked: "열어봄", unsubscribed: "연락 그만", bounced: "반송", ended: "반응 없이 끝",
};

/** The mail and why: subject, the proposed postings and the agent's reason. */
function MailAndWhy({ row }: { row: AgentLogRow }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{row.kind === "followup_sent" ? "후속 · " : ""}{row.subject ?? "(제목 없음)"}</p>
      {row.postings.length ? (
        <p className="truncate text-[12px] text-neutral-muted">
          {row.postings.map((posting) => `${posting.companyName} · ${posting.title}`).join("  /  ")}
        </p>
      ) : null}
      {row.kind === "sent" && row.reason ? <p className="line-clamp-2 text-[12px] text-neutral-muted">이유: {row.reason}</p> : null}
    </div>
  );
}

/**
 * #5 로그 · 보낸 메일: who the agent wrote to, where it found them, what it proposed and why, and what came of it,
 * newest first. A line opens the person's whole timeline (mail body, every step, 답장 옴).
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
  // No approval step (Shaun 11/17): the mails themselves are read here to check the agent's quality.
  const [showBodies, setShowBodies] = useState(false);
  const list = useGtmAction<{ rows: AgentLogRow[]; total: number }>();
  const { run } = list;
  const load = useCallback(() => {
    void run("agent.log", { days, source, mailsOnly: true, includeTest, limit: PAGE, offset });
  }, [run, days, source, includeTest, offset]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const rows = list.result?.rows ?? [];
  const total = list.result?.total ?? 0;
  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-[12px] text-neutral-muted">
        <input type="checkbox" checked={showBodies} onChange={(event) => setShowBodies(event.target.checked)} />
        메일 본문 같이 보기
      </label>
      <ErrorNotice message={list.error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed text-sm">
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
              const after = row.after ? AFTER_LABEL[row.after] : null;
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
                      <p className="truncate text-[12px] text-neutral-muted">{row.headline ?? row.email ?? ""}</p>
                    </td>
                    <td className="px-2 py-1.5 text-[12px] text-neutral-muted">{sourceLabel(row.source)}</td>
                    <td className="px-2 py-1.5">
                      <MailAndWhy row={row} />
                      {showBodies && row.body ? (
                        <p className="mt-1.5 whitespace-pre-line rounded-md bg-bg-weak px-3 py-2 text-[12px] leading-5 text-neutral-primary">{row.body}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">
                      {after ? <Badge tone={row.after === "signed_up" || row.after === "replied" ? "positive" : row.after === "bounced" || row.after === "unsubscribed" ? "critical" : "default"}>{after}</Badge>
                        : <span className="text-[12px] text-neutral-muted">아직 없음</span>}
                    </td>
                  </tr>
                  {open === key ? (
                    <tr><td colSpan={5} className="bg-bg-weak px-2 pb-3"><Timeline id={row.personId} onClose={() => setOpen(null)} /></td></tr>
                  ) : null}
                </Fragment>
              );
            })}
            {!rows.length && !list.loading ? (
              <tr><td colSpan={5} className="py-4 text-center text-[12px] text-neutral-muted">이 기간에 보낸 메일이 없어요.</td></tr>
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
