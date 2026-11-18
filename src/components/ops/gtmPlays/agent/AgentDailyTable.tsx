import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { cx } from "@/components/ops/theme";
import { averageScore, costPerContact, gradedCount, searchCostPerContactable, type AgentDayRow } from "@/lib/gtmPlays/agent/daily";
import { agentRate, type FunnelColumn } from "@/lib/gtmPlays/agent/funnel";
import { kstDay, periodDayLabel, type AgentPeriod, type AgentPeriodInput } from "@/lib/gtmPlays/agent/period";
import type { AgentSpendStep } from "@/lib/gtmPlays/agent/spend";
import { ratePercent } from "@/lib/gtmPlays/rate";
import { useGtmAction } from "../api";
import { ErrorNotice, Select } from "../ui";
import { Count, excludedTitle, FUNNEL_HINTS, HeaderLabel } from "./AgentFunnelTable";
import { sourceLabel, usd } from "./labels";

type Daily = { period: AgentPeriod; source: string | null; total: AgentDayRow; days: AgentDayRow[]; available: boolean };

/** What the columns only this table has count (ⓘ); the rest are 수치's own words (FUNNEL_HINTS). */
const HINTS = {
  day: "에이전트가 그 사람을 찾은 날(한국 시간)이에요. 그날 찾은 사람이 그 뒤 어떻게 됐는지 세요. 그래서 최근 날짜의 클릭·가입·답장은 며칠 더 늘어날 수 있어요. 날짜를 모두 더하면 위 수치의 합계와 같아요.",
  run: "그날 에이전트가 검색한 곳(사이트 수, 목록 밖 웹은 한 곳)과 올린 지원자 파일 수예요. 하루 비용 한도에 닿아 건너뛴 곳은 따로 적어요. 아무것도 없으면 '실행 없음'이에요(꺼져 있었거나 실행되지 않음).",
  lookup: "그날 찾은 사람 중 페이지나 파일에 이메일이 없어서 돈을 내고(한 번에 약 $0.10) 찾아본 사람 수와, 그중 쓸 수 있는 이메일을 찾은 사람 수예요. 못 찾으면 제외(이메일 없음)가 돼요.",
  cost: "그날 한 검색 비용 + 그날 찾은 사람의 이메일 찾기·공고 고르기·따로 채점·메일 쓰기 비용이에요. 마우스를 올리면 단계별로 보여요. 날짜를 모두 더하면 위 수치의 합계 비용과 같아요.",
  perContact: "비용 ÷ 연락이에요. 그날 찾은 사람에게 메일 한 통을 보내기까지 든 돈이에요.",
  searches: "그날 검색한 횟수(검색어 수)예요. 사이트마다 여러 번 검색해요.",
  kept: "검색 결과 중 에이전트가 '본인이 새 일을 찾고 있다'고 판단해 남긴 사람이에요. 이미 전에 찾은 사람도 들어가요.",
  fresh: "그날 검색에서 처음 찾은 사람이에요(지원자 파일은 빼요). %는 처음 찾음 ÷ 남긴 사람이고, 나머지는 전에 이미 찾은 사람이에요.",
  contactable: "처음 찾은 사람 중 메일을 보낼 수 있는 주소가 있는 사람이에요(페이지에 본인이 쓴 주소, 또는 이메일 찾기로 찾은 주소). %는 연락 가능 ÷ 처음 찾음이에요.",
  searchCost: "그날 검색에 쓴 돈이에요(검색 + 결과 판단). 이메일 찾기 비용은 빼요.",
  perContactable: "검색 비용 ÷ 연락 가능이에요. 메일을 보낼 수 있는 새 사람 한 명을 검색으로 찾는 데 든 돈이에요.",
  sentPostings: "그날 찾은 사람에게 실제로 나간 메일에 담긴 공고 수예요(한 통에 2~3개). 눌러서 그 사람들을 볼 수 있어요.",
  score: "에이전트가 공고를 고를 때 매긴 적합 점수(0~100)의 평균이에요. 높을수록 그 사람과 잘 맞는다고 본 공고예요. 점수를 남기기 전에 고른 공고는 빼고 계산해요.",
  graded: "공고를 고른 바로 뒤에, 고를 때와 다른 더 엄격한 기준으로 한 번 더 채점한 결과예요. 직무와 연차가 맞는지, 꼭 필요한 조건이 빠지지 않았는지, 근무 지역·원격 근무, 업계 경험을 봐요. %는 잘 맞음 ÷ 채점한 공고예요. 지금은 재기만 하고, 결과와 상관없이 메일은 그대로 나가요.",
  verdict: "운영팀이 로그에서 사람을 열어 공고마다 누른 '맞음 / 안 맞음' 수예요. 일치는 따로 채점이 '잘 맞음'이나 '안 맞음'이라고 한 공고 중 운영팀 판단과 같은 비율이에요('애매'는 빼요).",
} as const;

type View = "people" | "search" | "quality";
const VIEWS: Array<{ id: View; label: string }> = [
  { id: "people", label: "사람 흐름" }, { id: "search", label: "검색 수율" }, { id: "quality", label: "추천 품질" },
];
const VIEW_COLUMNS: Record<View, number> = { people: 10, search: 7, quality: 6 };

const STEP_LABEL: Record<AgentSpendStep, string> = {
  search: "검색", profile: "프로필 읽기", lookup: "이메일 찾기", match: "공고 고르기", review: "따로 채점", compose: "메일 쓰기",
  followup: "후속 메일",
};
const STEP_ORDER: AgentSpendStep[] = ["search", "profile", "lookup", "match", "review", "compose", "followup"];

const costTitle = (costBy: AgentDayRow["costBy"]) => STEP_ORDER
  .filter((step) => costBy[step])
  .map((step) => `${STEP_LABEL[step]} ${usd(costBy[step] ?? 0)}`).join(" · ") || "쓴 돈이 없어요";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function dayLabel(day: string, today: string) {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${periodDayLabel(day, today.slice(0, 4))} (${weekday})`;
}

/** The run cell's hover: what the day's searches did. */
function runTitle(run: AgentDayRow["run"]): string | undefined {
  if (!run.searchedSources) return undefined;
  return `검색어 ${run.searches}번 · 새로 찾은 사람 ${run.newPeople}명 · 이미 아는 사람 ${run.knownPeople}명`;
}

function runText(run: AgentDayRow["run"]): string | null {
  const parts = [
    run.searchedSources ? `검색 ${run.searchedSources}곳` : null,
    run.files ? `파일 ${run.files}개` : null,
    run.skippedBudget ? `한도로 ${run.skippedBudget}곳 건너뜀` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** A number that opens its people in the log (the same set: funnel.ts inFunnelColumn, on that day). */
function Cell({ onPick, children, title }: { onPick: () => void; children: ReactNode; title?: string }) {
  return (
    <td className="px-2 py-1.5 text-right align-top">
      <button type="button" title={title ?? "눌러서 이 사람들 보기"} onClick={onPick} className="rounded px-1 hover:bg-bg-weak hover:underline">
        {children}
      </button>
    </td>
  );
}

/** A day with no run, no one found and nothing spent; a stretch of them is one line. */
const isQuietDay = (row: AgentDayRow) => !runText(row.run) && !row.numbers.found && !row.numbers.costUsd;

type Line = { kind: "day"; row: AgentDayRow } | { kind: "quiet"; newest: string; oldest: string; count: number };

/** The days newest first, each stretch of quiet days as one line (Shaun 11/17: no screens of zeros). */
function linesOf(days: readonly AgentDayRow[]): Line[] {
  const lines: Line[] = [];
  for (const row of days) {
    const last = lines[lines.length - 1];
    if (isQuietDay(row)) {
      if (last?.kind === "quiet") { last.oldest = row.day as string; last.count += 1; } else lines.push({ kind: "quiet", newest: row.day as string, oldest: row.day as string, count: 1 });
    } else {
      lines.push({ kind: "day", row });
    }
  }
  return lines;
}

function Row({ row, label, run, strong, onPick, onCost }: {
  row: AgentDayRow; label: ReactNode; run: ReactNode; strong?: boolean;
  onPick: (column: FunnelColumn) => void; onCost: () => void;
}) {
  const { numbers } = row;
  const perContact = costPerContact(numbers);
  return (
    <tr className={cx(strong && "bg-bg-weak font-medium")}>
      <td className="whitespace-nowrap py-1.5 pr-3">{label}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-[12px]" title={runTitle(row.run)}>{run}</td>
      <Cell onPick={() => onPick("found")}><Count n={numbers.found} strong={strong} /></Cell>
      <Cell onPick={() => onPick("excluded")} title={excludedTitle(numbers.excludedBy)}><Count n={numbers.excluded} /></Cell>
      <Cell onPick={() => onPick("contacted")}><Count n={numbers.contacted} rate={agentRate(numbers.contacted, numbers.found)} /></Cell>
      <Cell onPick={() => onPick("clicked")}><Count n={numbers.clicked} rate={agentRate(numbers.clicked, numbers.contacted)} /></Cell>
      <Cell onPick={() => onPick("signedUp")}>
        <span className="whitespace-nowrap tabular-nums">
          <span className="font-medium">{numbers.signedUp}</span>
          {numbers.contacted ? <span className="ml-1 text-[12px] text-neutral-muted">({ratePercent(numbers.signedUp, numbers.contacted)})</span> : null}
        </span>
      </Cell>
      <Cell onPick={() => onPick("interested")}><Count n={numbers.interested} /></Cell>
      <Cell onPick={() => onPick("connected")}><Count n={numbers.connected} strong /></Cell>
      <Cell onPick={() => onPick("replied")}><Count n={numbers.replied} /></Cell>
      <td className="px-2 py-1.5 text-right align-top">
        <button type="button" title={`${costTitle(row.costBy)} · 눌러서 그날 검색 기록 보기`} onClick={onCost} className="rounded px-1 tabular-nums text-neutral-muted hover:bg-bg-weak hover:underline">
          {usd(numbers.costUsd)}
        </button>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums text-neutral-muted">
        {perContact === null ? <span className="text-[12px]">연락 없음</span> : usd(perContact)}
      </td>
    </tr>
  );
}

/** 검색 수율 for one day (or the 합계): plain numbers; any of them opens that day's searches. */
function SearchRow({ row, label, run, strong, onCost }: { row: AgentDayRow; label: ReactNode; run: ReactNode; strong?: boolean; onCost: () => void }) {
  const kept = row.run.newPeople + row.run.knownPeople;
  const perContactable = searchCostPerContactable(row);
  const cell = (children: ReactNode) => (
    <td className="px-2 py-1.5 text-right align-top">
      <button type="button" title="눌러서 그날 검색 기록 보기" onClick={onCost} className="whitespace-nowrap rounded px-1 tabular-nums hover:bg-bg-weak hover:underline">
        {children}
      </button>
    </td>
  );
  return (
    <tr className={cx(strong && "bg-bg-weak font-medium")}>
      <td className="whitespace-nowrap py-1.5 pr-3">{label}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-[12px]">{run}</td>
      {cell(<>{row.run.searches}번</>)}
      {cell(<>{kept}명</>)}
      {cell(<Count n={row.search.found} rate={kept ? agentRate(row.search.found, kept) : undefined} strong={strong} />)}
      {cell(<Count n={row.search.contactable} rate={row.search.found ? agentRate(row.search.contactable, row.search.found) : undefined} strong />)}
      {cell(row.lookups.tried
        ? <>{row.lookups.found} / {row.lookups.tried}<span className="ml-1 text-[11px] text-neutral-muted">· {agentRate(row.lookups.found, row.lookups.tried)}%</span></>
        : <span className="text-neutral-muted">0</span>)}
      {cell(<span className="text-neutral-muted">{usd(row.costBy.search ?? 0)}</span>)}
      <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums text-neutral-muted">
        {perContactable === null ? <span className="text-[12px]">연락 가능 없음</span> : usd(perContactable)}
      </td>
    </tr>
  );
}

/**
 * 추천 품질 for one day (or the 합계): the postings in the mails that went out, the matcher's average score, the separate
 * grader's reads, Ops's calls (and how often they agree with the grader), then 관심·지원 and 회사 연결. A number about
 * the mailed postings opens the people they went to.
 */
function QualityRow({ row, label, run, strong, onPick }: {
  row: AgentDayRow; label: ReactNode; run: ReactNode; strong?: boolean; onPick: (column: FunnelColumn) => void;
}) {
  const { quality, numbers } = row;
  const average = averageScore(quality);
  const graded = gradedCount(quality);
  const judged = quality.verdicts.right + quality.verdicts.wrong;
  const quiet = (text: string) => <span className="text-[12px] text-neutral-muted">{text}</span>;
  return (
    <tr className={cx(strong && "bg-bg-weak font-medium")}>
      <td className="whitespace-nowrap py-1.5 pr-3">{label}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-[12px]">{run}</td>
      <Cell onPick={() => onPick("contacted")} title={`메일 ${numbers.contacted}통에 담긴 공고 · 눌러서 그 사람들 보기`}>
        {quality.postings ? <span className="whitespace-nowrap tabular-nums">{quality.postings}개</span> : quiet("보낸 메일 없음")}
      </Cell>
      <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums">
        {average === null ? quiet(quality.postings ? "점수 없음" : "보낸 공고 없음") : `${average}점`}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums" title={graded && graded < quality.postings ? `보낸 공고 ${quality.postings}개 중 ${graded}개 채점` : undefined}>
        {graded ? (
          <>
            <span className="text-positive">잘 맞음 {quality.graded.good}</span>
            <span className="ml-1 text-[11px] text-neutral-muted">· {Math.round((quality.graded.good / graded) * 100)}%</span>
            <span className="ml-2 text-[12px] text-neutral-muted">애매 {quality.graded.unsure} / 안 맞음 {quality.graded.poor}</span>
          </>
        ) : quiet("채점 없음")}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums">
        {judged ? (
          <>
            맞음 {quality.verdicts.right} / 안 맞음 {quality.verdicts.wrong}
            <span className="ml-1 text-[11px] text-neutral-muted">
              {quality.compared ? `· 채점과 일치 ${Math.round((quality.agreed / quality.compared) * 100)}% (${quality.agreed}/${quality.compared})` : "· 비교할 채점 없음"}
            </span>
          </>
        ) : quiet("판단 없음")}
      </td>
      <Cell onPick={() => onPick("interested")}><Count n={numbers.interested} /></Cell>
      <Cell onPick={() => onPick("connected")}><Count n={numbers.connected} strong /></Cell>
    </tr>
  );
}

/**
 * #5 하루별 성능 (Shaun 11/17: under the log; the agent runs once a day, so its performance is tracked a day at a time):
 * one row per Korea-time day of the period, newest first, under a 합계 row that equals 수치's 합계. The columns are
 * 수치's (the same words and predicates), plus what the day's runs did, the day's cost and 연락 1명당 비용. A number
 * opens exactly its people in the log; a cost opens that day's searches. Two more views of the same days: 검색 수율 and
 * 추천 품질.
 */
export default function AgentDailyTable({ period, includeTest, refreshKey, sources, source, onSource, onPick, onCost }: {
  period: AgentPeriodInput; includeTest: boolean; refreshKey: number; sources: string[];
  source: string | null; onSource: (source: string | null) => void;
  onPick: (day: string | null, column: FunnelColumn) => void;
  onCost: (day: string | null) => void;
}) {
  const daily = useGtmAction<Daily>();
  const { run } = daily;
  const load = useCallback(() => { void run("agent.daily", { ...period, includeTest, source }); }, [run, period, includeTest, source]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const data = daily.result;
  const today = kstDay();
  const [view, setView] = useState<View>("people");
  const ranDays = data ? data.days.filter((row) => runText(row.run)).length : 0;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="flex items-center gap-2">
          <span className="text-neutral-muted">찾은 곳</span>
          <span className="w-36 shrink-0">
            <Select value={source ?? ""} onChange={(event) => onSource(event.target.value || null)} className="w-36">
              <option value="">전체</option>
              {sources.map((value) => <option key={value} value={value}>{sourceLabel(value)}</option>)}
            </Select>
          </span>
        </span>
        <div className="inline-flex overflow-hidden rounded-md border border-neutral-1000-a05">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={cx("px-3 py-1", view === item.id ? "bg-bg-weak font-medium text-neutral-primary" : "text-neutral-muted hover:bg-bg-weak/70")}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <ErrorNotice message={daily.error} />
      {data ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="text-left text-[12px] text-neutral-muted">
              <tr>
                <th className="py-1.5 pr-3 font-normal"><HeaderLabel label="날짜" hint={HINTS.day} align="left" /></th>
                <th className="px-2 py-1.5 font-normal"><HeaderLabel label="그날 실행" hint={HINTS.run} align="left" /></th>
                {view === "people" ? (
                  <>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="찾음" hint={FUNNEL_HINTS.found} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="제외" hint={FUNNEL_HINTS.excluded} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="연락" hint={FUNNEL_HINTS.contacted} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="클릭" hint={FUNNEL_HINTS.clicked} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="가입 (가입률)" hint={FUNNEL_HINTS.signedUp} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="관심·지원" hint={FUNNEL_HINTS.interested} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="회사 연결" hint={FUNNEL_HINTS.connected} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="답장" hint={FUNNEL_HINTS.replied} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="비용" hint={HINTS.cost} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="연락 1명당" hint={HINTS.perContact} /></th>
                  </>
                ) : view === "quality" ? (
                  <>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="보낸 공고" hint={HINTS.sentPostings} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="평균 적합 점수" hint={HINTS.score} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="따로 채점" hint={HINTS.graded} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="사람 판단" hint={HINTS.verdict} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="관심·지원" hint={FUNNEL_HINTS.interested} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="회사 연결" hint={FUNNEL_HINTS.connected} /></th>
                  </>
                ) : (
                  <>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="검색" hint={HINTS.searches} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="남긴 사람" hint={HINTS.kept} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="처음 찾음" hint={HINTS.fresh} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="연락 가능" hint={HINTS.contactable} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="이메일 찾기" hint={HINTS.lookup} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="검색 비용" hint={HINTS.searchCost} /></th>
                    <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="연락 가능 1명당" hint={HINTS.perContactable} /></th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-1000-a05">
              {view === "people" ? (
                <Row
                  row={data.total}
                  label="합계"
                  run={`${data.days.length}일 중 ${ranDays}일 실행`}
                  strong
                  onPick={(column) => onPick(null, column)}
                  onCost={() => onCost(null)}
                />
              ) : view === "quality" ? (
                <QualityRow row={data.total} label="합계" run={`${data.days.length}일 중 ${ranDays}일 실행`} strong onPick={(column) => onPick(null, column)} />
              ) : (
                <SearchRow row={data.total} label="합계" run={`${data.days.length}일 중 ${ranDays}일 실행`} strong onCost={() => onCost(null)} />
              )}
              {linesOf(data.days).map((line) => {
                if (line.kind === "quiet") {
                  return (
                    <tr key={`quiet:${line.newest}`} className="text-neutral-muted">
                      <td className="whitespace-nowrap py-1.5 pr-3">
                        {line.count > 1 ? `${dayLabel(line.oldest, today)} ~ ${dayLabel(line.newest, today)}` : dayLabel(line.newest, today)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-[12px]">실행 없음{line.count > 1 ? ` · ${line.count}일` : ""}</td>
                      <td colSpan={VIEW_COLUMNS[view]} className="px-2 py-1.5 text-[12px]">찾은 사람도 쓴 돈도 없어요</td>
                    </tr>
                  );
                }
                const day = line.row.day as string;
                const label = <>{dayLabel(day, today)}{day === today ? <span className="ml-1 text-[11px] text-neutral-muted">오늘</span> : null}</>;
                const run = runText(line.row.run) ?? <span className="text-neutral-muted">실행 없음</span>;
                if (view === "search") return <SearchRow key={day} row={line.row} label={label} run={run} onCost={() => onCost(day)} />;
                if (view === "quality") return <QualityRow key={day} row={line.row} label={label} run={run} onPick={(column) => onPick(day, column)} />;
                return (
                  <Row
                    key={day}
                    row={line.row}
                    label={label}
                    run={run}
                    onPick={(column) => onPick(day, column)}
                    onCost={() => onCost(day)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : daily.loading ? <p className="text-[12px] text-neutral-muted">불러오는 중…</p> : null}
      {data && !data.available ? <p className="mt-2 text-[12px] text-neutral-muted">아직 기록을 저장할 곳이 준비되지 않았어요(배포 전).</p> : null}
    </div>
  );
}
