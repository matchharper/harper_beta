import { useCallback, useEffect, useState } from "react";
import { cx } from "@/components/ops/theme";
import { AGENT_EXCLUDE_BUCKETS, isGiver, type AgentExcludeBucket, type FunnelColumn } from "@/lib/gtmPlays/agent/funnel";
import { filtersForColumn, type AgentStage, type LogAfterFilter, type LogFindFilter } from "@/lib/gtmPlays/agent/stage";
import { shortConfigId } from "@/lib/gtmPlays/agent/config";
import { CHANNEL_LABELS, type AgentCandidateChannel } from "@/lib/gtmPlays/agent/channels";
import type { AgentPeriodInput } from "@/lib/gtmPlays/agent/period";
import { kstMonthDay, type ThreadColumn, type ThreadSummary } from "@/lib/gtmPlays/agent/thread";
import type { AgentPeopleLogLine } from "@/lib/gtmPlays/agent/views.server";
import { formatKst, useGtmAction } from "../api";
import { Button, ErrorNotice, Select, TextInput } from "../ui";
import { PersonCell } from "./AgentLogTable";
import AgentThread from "./AgentThread";
import {
  AFTER_FILTER_LABEL, COLUMN_LABEL, EVENT_LABEL, EXCLUDE_BUCKET_LABEL, STAGE_LABEL, personName, personStage, sourceLabel,
} from "./labels";

const PAGE = 50;

/** One search (its run and tuning version; the source only when there is no search log) or one uploaded file. */
export type FoundBy = { id: string; source: string | null; tuningVersion: string | null; label: string };

export type PeopleFilter = {
  source: string | null;
  stage: AgentStage | null;
  after: LogAfterFilter | null;
  /** The people of a 찾기 number of 수치 · 후보: a paid lookup tried (이메일 찾기), or an address (연락 가능). */
  find: LogFindFilter | null;
  /** With 상태 제외: only the people of this reason (the 제외 number's hover words). */
  reason: AgentExcludeBucket | null;
  /** The people one search (a site in a run) or one uploaded file found, with the chip's words. */
  run: FoundBy | null;
  /** The people found on one KST day (a 하루별 성능 number), instead of the whole period. */
  day: string | null;
  /** The people found or uploaded with one 설정 묶음 (a 하루별 성능 number under its filter). */
  config: string | null;
  q: string;
  /** The people one search query found (a 검색어 row of 수치 · 후보); "" = the uploaded files' people (no query). */
  query: string | null;
  /** Exactly these people, whenever they were found (a 수치 · 회사 number), with the chip's words. */
  ids: { ids: string[]; label: string } | null;
  /** Only the people with a reply handed to a person that no one answered yet (사람이 볼 답장), whenever it came. */
  awaitingHuman: boolean;
  /** The people of one channel (a 채널별 row of 수치 · 후보, numbers.ts channelOfPerson). */
  channel: AgentCandidateChannel | null;
  /** Only the givers (수치 · 후보's 돕는 쪽 line); otherwise they are left out, as every candidate number leaves them out. */
  givers: boolean;
};

export const NO_PEOPLE_FILTER: PeopleFilter = {
  source: null, stage: null, after: null, find: null, reason: null, run: null, day: null, config: null, q: "", query: null, ids: null,
  awaitingHuman: false, channel: null, givers: false,
};

/** A line of agent.people, with its 지금 · 마지막 (null: no mail or message yet). */
type PeopleLine = AgentPeopleLogLine & { thread?: ThreadSummary | null };

type StatusFilter = Pick<PeopleFilter, "stage" | "after" | "find" | "awaitingHuman">;

/**
 * The 상태 choices (Shaun 11/22 15:46), in this order: 처리 중, the numbers' own columns (COLUMN_LABEL, each the people its
 * number counts via filtersForColumn), then 사람이 볼 답장 (the red line's people). 찾기's 이메일 찾기 and 연락 가능 are
 * not 상태: a click on them shows a chip.
 */
const STATUS_COLUMNS: readonly FunnelColumn[] = [
  "excluded", "contacted", "clicked", "signedUp", "interested", "connected", "bounced", "complained", "unsubscribed",
  "replied", "ashleyReplied", "noReply", "handedOff", "signedUpAfterReply",
];
const STATUS_OPTIONS: ReadonlyArray<{ id: string; label: string; filter: StatusFilter }> = [
  { id: "working", label: STAGE_LABEL.working, filter: { stage: "working", after: null, find: null, awaitingHuman: false } },
  ...STATUS_COLUMNS.map((column) => ({ id: column, label: COLUMN_LABEL[column], filter: { ...filtersForColumn(column), awaitingHuman: false } })),
  { id: "awaiting", label: "사람이 볼 답장", filter: { stage: null, after: null, find: null, awaitingHuman: true } },
];
const NO_STATUS: StatusFilter = { stage: null, after: null, find: null, awaitingHuman: false };

const statusOf = (filter: StatusFilter) => STATUS_OPTIONS.find((option) => option.filter.stage === filter.stage
  && option.filter.after === filter.after && option.filter.find === filter.find && option.filter.awaitingHuman === filter.awaitingHuman) ?? null;

/** The 제외 이유 choices: a giver is in no 제외 (funnel.ts isGiver), so its reason is no choice. */
const REASON_OPTIONS = AGENT_EXCLUDE_BUCKETS.filter((bucket) => bucket !== "giver");

/** 지금's words for a numbers' column. */
const columnWords = (column: ThreadColumn) => COLUMN_LABEL[column];

/**
 * 지금 · 마지막: the latest thing that happened with them and when; before any mail, where the agent is with them
 * ("처리 중 · 공고 고르는 중", "제외 · 30일 안에 연락함") at the line's time.
 */
function nowOf(line: PeopleLine): { words: string; trouble: boolean; at: string } {
  const thread = line.thread ?? null;
  const words = thread
    ? (thread.column ? columnWords(thread.column) : thread.words ?? (thread.step ? EVENT_LABEL[thread.step] ?? thread.step : null))
    : null;
  const { label, detail } = personStage({ ...line.person, reached: line.reached });
  // A giver always shows which kind (돕는 쪽's own words), with what happened last when there is a thread (a company mail).
  const giver = isGiver(line.person) ? (detail ?? label) : null;
  if (thread && words) return { words: giver ? `${giver} · ${words}` : words, trouble: thread.trouble, at: thread.at };
  return { words: detail ? `${label} · ${detail}` : label, trouble: line.person.status === "failed", at: line.at };
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-neutral-1000-a10 bg-bg-weak px-2.5 py-0.5 text-[12px]">
      {label}
      <button type="button" aria-label={`${label} 빼기`} onClick={onClear} className="text-neutral-muted hover:text-neutral-primary">×</button>
    </span>
  );
}

/**
 * 로그 · 사람 (Shaun 11/22 15:46): everyone the agent found in the numbers' period, one row each (사람 · 찾은 곳 · 지금 ·
 * 마지막), filtered by 찾은 곳, 상태 (the numbers' own sets, so a clicked number shows exactly its people) and text. A
 * row opens the person on the right: everything that happened with them in one time order.
 */
export default function AgentPeople({ period, includeTest, refreshKey, sources, filter, onFilter, openPerson = null }: {
  /** The numbers' period (최근 N일 or a KST date range), so a number and its people match. */
  period: AgentPeriodInput; includeTest: boolean; refreshKey: number; sources: string[];
  filter: PeopleFilter; onFilter: (filter: PeopleFilter) => void;
  /** A person to open on the right (a Slack reply alert's link). */
  openPerson?: string | null;
}) {
  const [q, setQ] = useState(filter.q);
  // The log opens (and this mounts) with the linked person already set (AgentTab.tsx), so it is the first selection.
  const [selected, setSelected] = useState<string | null>(openPerson);
  // A page belongs to one set of filters; changing a filter starts again at the first page.
  const key = JSON.stringify([period, includeTest, filter]);
  const [page, setPage] = useState({ key, offset: 0 });
  const offset = page.key === key ? page.offset : 0;
  const setOffset = (value: number) => setPage({ key, offset: value });
  const list = useGtmAction<{ lines: PeopleLine[]; total: number }>();
  const { run } = list;
  const load = useCallback(() => {
    void run("agent.people", {
      ...(filter.day ? { from: filter.day, to: filter.day } : period), includeTest, source: filter.run ? (filter.run.tuningVersion ? null : filter.run.source) : filter.source,
      stage: filter.stage, after: filter.after, find: filter.find, reason: filter.reason, runId: filter.run?.id ?? null, tuningVersion: filter.run?.tuningVersion ?? null,
      configId: filter.config, q: filter.q || null, searchQuery: filter.query, ids: filter.ids?.ids ?? null, awaitingHuman: filter.awaitingHuman,
      channel: filter.channel, givers: filter.givers, limit: PAGE, offset,
    });
  }, [run, period, includeTest, filter, offset]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const lines = list.result?.lines ?? [];
  const total = list.result?.total ?? 0;
  const set = (patch: Partial<PeopleFilter>) => onFilter({ ...filter, ...patch });
  const status = statusOf(filter);
  const [, dayMonth, dayDate] = filter.day?.split("-") ?? [];
  // The filters with no control of their own (a clicked number, a search, a file), each removable. A 찾은 곳 the
  // select cannot show, or a 상태 mix none of its choices is, shows here too, so nothing narrows the list unseen.
  const chips = [
    filter.run ? { label: filter.run.label, clear: () => set({ run: null }) } : null,
    !filter.run && filter.source && !sources.includes(filter.source) ? { label: sourceLabel(filter.source), clear: () => set({ source: null }) } : null,
    filter.day ? { label: `${Number(dayMonth)}.${Number(dayDate)}`, clear: () => set({ day: null }) } : null,
    filter.query !== null ? { label: filter.query === "" ? "지원자 파일 (검색어 없음)" : `검색어: ${filter.query}`, clear: () => set({ query: null }) } : null,
    filter.config ? { label: `설정 묶음 ${shortConfigId(filter.config)}`, clear: () => set({ config: null }) } : null,
    filter.ids ? { label: filter.ids.label, clear: () => set({ ids: null }) } : null,
    filter.channel ? { label: CHANNEL_LABELS[filter.channel], clear: () => set({ channel: null }) } : null,
    filter.givers ? { label: "돕는 쪽", clear: () => set({ givers: false }) } : null,
    !status && (filter.stage || filter.after || filter.find || filter.awaitingHuman) ? {
      label: [
        filter.stage ? STAGE_LABEL[filter.stage] : null, filter.after ? AFTER_FILTER_LABEL[filter.after] : null,
        filter.find ? COLUMN_LABEL[filter.find] : null, filter.awaitingHuman ? "사람이 볼 답장" : null,
      ].filter(Boolean).join(" · "),
      clear: () => set({ ...NO_STATUS, reason: null }),
    } : null,
  ].filter((chip): chip is { label: string; clear: () => void } => Boolean(chip));
  const filtered = JSON.stringify(filter) !== JSON.stringify(NO_PEOPLE_FILTER);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-neutral-muted">찾은 곳</span>
        <span className="w-36 shrink-0">
          <Select value={filter.source ?? ""} onChange={(event) => set({ source: event.target.value || null, run: null })} className="w-36">
            <option value="">전체</option>
            {sources.map((value) => <option key={value} value={value}>{sourceLabel(value)}</option>)}
          </Select>
        </span>
        <span className="text-neutral-muted">상태</span>
        <span className="w-36 shrink-0">
          <Select value={status?.id ?? ""} onChange={(event) => {
            const option = STATUS_OPTIONS.find((item) => item.id === event.target.value) ?? null;
            set({ ...(option?.filter ?? NO_STATUS), ...(option?.filter.stage === "excluded" ? {} : { reason: null }) });
          }} className="w-36">
            <option value="">전체</option>
            {STATUS_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </Select>
        </span>
        {filter.stage === "excluded" ? (
          <>
            <span className="text-neutral-muted">제외 이유</span>
            <span className="w-40 shrink-0">
              <Select value={filter.reason ?? ""} onChange={(event) => set({ reason: (event.target.value || null) as AgentExcludeBucket | null })} className="w-40">
                <option value="">전체</option>
                {REASON_OPTIONS.map((value) => <option key={value} value={value}>{EXCLUDE_BUCKET_LABEL[value]}</option>)}
              </Select>
            </span>
          </>
        ) : null}
        <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); set({ q: q.trim() }); }}>
          <TextInput value={q} onChange={(event) => setQ(event.target.value)} placeholder="이름·회사·메일·글 검색" className="w-52" />
          <Button type="submit" className="whitespace-nowrap">찾기</Button>
        </form>
        <span className="text-neutral-muted">{total}명</span>
      </div>
      {chips.length || filtered ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {chips.map((chip) => <Chip key={chip.label} label={chip.label} onClear={chip.clear} />)}
          <button type="button" className="text-[12px] text-neutral-muted underline" onClick={() => { setQ(""); onFilter(NO_PEOPLE_FILTER); }}>모두 지우기</button>
        </div>
      ) : null}
      <ErrorNotice message={list.error} />
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <table className="w-full min-w-[480px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-48" />
              <col className="w-16" />
            </colgroup>
            <thead className="text-left text-[12px] text-neutral-muted">
              <tr>
                <th className="py-1.5 pr-2 font-normal">사람</th>
                <th className="px-2 py-1.5 font-normal">찾은 곳</th>
                <th className="px-2 py-1.5 font-normal">지금</th>
                <th className="py-1.5 pl-2 font-normal">마지막</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-1000-a05">
              {lines.map((line) => {
                const who = personName(line.person);
                const now = nowOf(line);
                const id = line.person.id;
                return (
                  <tr
                    key={id}
                    onClick={() => setSelected(selected === id ? null : id)}
                    className={cx("cursor-pointer align-top", selected === id ? "bg-bg-weak" : "hover:bg-bg-weak/70")}
                  >
                    <td className="min-w-0 py-2 pr-2"><PersonCell name={who.name} intro={who.intro} email={line.person.email} /></td>
                    <td className="px-2 py-2 text-[12px] text-neutral-muted">{sourceLabel(line.person.source)}</td>
                    <td className={cx("break-words px-2 py-2 text-[12px] font-medium", now.trouble && "text-critical")}>{now.words}</td>
                    <td className="whitespace-nowrap py-2 pl-2 text-[12px] tabular-nums text-neutral-muted" title={formatKst(now.at)}>{kstMonthDay(now.at)}</td>
                  </tr>
                );
              })}
              {!lines.length && !list.loading ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[12px] text-neutral-muted">
                    {filtered ? "이 조건에 맞는 사람이 없어요." : "이 기간에 찾은 사람이 없어요. 에이전트가 찾은 사람과 그 사람과 있었던 일이 여기에 쌓여요."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {selected ? (
          <aside className="sticky top-4 max-h-[calc(100vh-2rem)] w-[min(46rem,62%)] shrink-0 overflow-y-auto overflow-x-hidden">
            <AgentThread key={selected} personId={selected} onClose={() => setSelected(null)} />
          </aside>
        ) : null}
      </div>
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
