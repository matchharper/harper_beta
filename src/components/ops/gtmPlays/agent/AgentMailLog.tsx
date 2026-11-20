import { useCallback, useEffect, useState } from "react";
import { mailLineWords } from "@/lib/gtmPlays/agent/conversationView";
import type { AgentPeriodInput } from "@/lib/gtmPlays/agent/period";
import type { AgentMailLogLine } from "@/lib/gtmPlays/agent/conversationViews.server";
import { useGtmAction } from "../api";
import { Badge, Button, ErrorNotice } from "../ui";
import { Timeline } from "./AgentPeople";
import { LogSplit, LogTable, MailText, PersonCell, type LogRowView } from "./AgentLogTable";
import { personName, sourceLabel } from "./labels";

const PAGE = 50;

/** 로그 · 메일's one filter: only the 사람이 볼 답장 (the red line's), whenever they came. */
export type MailFilter = { awaitingHuman: boolean };
export const NO_MAIL_FILTER: MailFilter = { awaitingHuman: false };

/**
 * 로그 · 메일: one line per agent mail and per conversation row (시각 · 사람 · 찾은 곳 · 받음/보냄 · Ashley's decision or
 * the send status). A line with a person opens them on the right.
 */
export default function AgentMailLog({ period, includeTest, refreshKey, filter, onFilter }: {
  period: AgentPeriodInput; includeTest: boolean; refreshKey: number; filter: MailFilter; onFilter: (filter: MailFilter) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const key = JSON.stringify([period, includeTest, filter]);
  const [page, setPage] = useState({ key, offset: 0 });
  const offset = page.key === key ? page.offset : 0;
  const setOffset = (value: number) => setPage({ key, offset: value });
  const list = useGtmAction<{ lines: AgentMailLogLine[]; total: number; unmatchedSkipped: number | null }>();
  const { run } = list;
  const load = useCallback(() => {
    void run("agent.mails", { ...period, includeTest, awaitingHuman: filter.awaitingHuman, limit: PAGE, offset });
  }, [run, period, includeTest, filter, offset]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const lines = list.result?.lines ?? [];
  const total = list.result?.total ?? 0;
  const unmatched = list.result?.unmatchedSkipped ?? null;
  const picked = lines.find((line) => line.key === selected) ?? null;
  const views: LogRowView[] = lines.map((line) => {
    const words = mailLineWords(line);
    const who = line.person ? personName(line.person) : null;
    return {
      key: line.key, at: line.at,
      person: <PersonCell name={who?.name ?? line.counterpartEmail} intro={who?.intro} email={who ? line.counterpartEmail : null} />,
      source: line.person ? sourceLabel(line.person.source) : "—",
      stage: <Badge tone={words.trouble ? "critical" : "default"}>{words.way}</Badge>,
      content: (
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{words.what}</p>
          {line.subject ? <p className="truncate text-[12px] text-neutral-muted">{line.subject}</p> : null}
          {line.text ? <div className="rounded-md bg-bg-weak px-3 py-2"><MailText text={line.text} clamp /></div> : null}
        </div>
      ),
    };
  });
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
        {filter.awaitingHuman ? (
          <span className="flex items-center gap-1 rounded-full border border-neutral-1000-a10 bg-bg-weak px-2.5 py-0.5">
            사람이 볼 답장
            <button type="button" aria-label="사람이 볼 답장 빼기" onClick={() => onFilter(NO_MAIL_FILTER)} className="text-neutral-muted hover:text-neutral-primary">×</button>
          </span>
        ) : null}
        <span className="text-neutral-muted">{total}통</span>
        {unmatched !== null ? <span className="text-neutral-muted">· 안 읽고 넘긴 메일 {unmatched}통</span> : null}
      </div>
      <ErrorNotice message={list.error} />
      <LogSplit
        detail={picked?.person ? <Timeline key={picked.person.id} id={picked.person.id} onClose={() => setSelected(null)} /> : null}
        list={(
          <LogTable
            rows={views}
            selected={picked?.person ? selected : null}
            onSelect={(next) => setSelected(next && lines.find((line) => line.key === next)?.person ? next : null)}
            loading={list.loading}
            empty={filter.awaitingHuman ? "사람이 볼 답장이 없어요." : "이 기간에 오간 메일이 없어요."}
          />
        )}
      />
      {total > PAGE ? (
        <div className="mt-2 flex items-center gap-2 text-[12px]">
          <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>이전</Button>
          <span className="text-neutral-muted">{offset + 1}–{Math.min(offset + PAGE, total)} / {total}</span>
          <Button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>다음</Button>
        </div>
      ) : null}
    </div>
  );
}
