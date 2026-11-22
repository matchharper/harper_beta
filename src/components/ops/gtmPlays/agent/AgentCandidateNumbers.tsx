import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { shortConfigId } from "@/lib/gtmPlays/agent/config";
import {
  ashleyCostUsd, averageScore, cappedCostBy, cappedCostPerContact, cappedCostUsd, gradedCount, searchCostPerContactable,
} from "@/lib/gtmPlays/agent/daily";
import { agentRate, type FunnelColumn } from "@/lib/gtmPlays/agent/funnel";
import {
  costPerSignup, dayLines, NO_QUERY, numbersPick, QUERY_ROWS_SHOWN, signupsPerDay, type NumbersAllTime, type NumbersPick, type NumbersRow,
  type NumbersRows,
} from "@/lib/gtmPlays/agent/numbers";
import { kstDay, type AgentPeriodInput } from "@/lib/gtmPlays/agent/period";
import { gmailSpamLine } from "@/lib/gtmPlays/agent/postmaster";
import { ratePercent } from "@/lib/gtmPlays/rate";
import type { AgentFunnel, AgentNumbers } from "@/lib/gtmPlays/agent/views.server";
import { useGtmAction } from "../api";
import { ErrorNotice, Hint, Select } from "../ui";
import { configOptionLabel, useAgentConfigs } from "./AgentConfig";
import { COLUMN_LABEL, sourceLabel, usd } from "./labels";
import {
  ConfigStarts, CostStat, costTitle, Count, DAY_HINTS, dayLabel, excludedTitle, FUNNEL_HINTS, HeaderLabel, noReplyTitle,
  NumberCell, runText, runTitle, Segmented, TODAY_COST_HINT,
} from "./numberCells";

/**
 * #5 수치 · 후보 (Shaun 11/22: one panel instead of 수치 and 하루별 성능; "같은 정보를 보여주되, 최적화를 해"). Rows by
 * 사이트 / 날짜 / 검색어 (NumbersRowsControl, in the panel header next to the period), 합계 first in every kind. The
 * columns follow the agent's work, one step at a time (찾기 → 공고 → 메일 → 답장), each column in one step only; 메일
 * first, so the first screen reads like the old 수치. Filters 찾은 곳 (날짜 and 검색어 rows: on 사이트 rows each row is a
 * site) and 설정 묶음. Test rows never count.
 *
 * What a click opens (the number and the log are the same set, Shaun 11/17):
 *   - a number column of funnel.ts (찾음, 제외, 연락 … 답장 후 가입): onPick(numbersPick(row), column): the row's key as
 *     its source / day / query, with the panel's 찾은 곳 and 설정 묶음. The log filters with inFunnelColumn (stage.ts
 *     filtersForColumn), so it shows exactly the counted people. 보낸 공고 opens the 연락 people the postings went to.
 *   - 이메일 찾기 and 연락 가능 (people of the row, with no log filter of their own): the row's 찾음 people, a set that
 *     holds exactly them.
 *   - 검색, 이미 찾은 사람, 검색 비용, 비용 (what the searches did and cost, which no person row carries):
 *     onSearches({ source, day, config }): the row's searches; for a 검색어 row the period's searches under the filters
 *     (the search log lists each search's queries; it cannot filter by one).
 *   - 지금까지's 가입: onPick(all of it, "signedUp", { from, to }): every signup since the agent started.
 * 반송/스팸신고/수신거부, 평균 적합 점수, 따로 채점, 사람 판단 and the per-person costs (연락 1명당, Ashley 비용 …) open
 * nothing.
 *
 * Costs (Shaun 11/22 15:51: every real cost shown, split by step; the cap figure only what the cap counts): 찾기's 검색
 * 비용 is the search step; 메일's 비용 is what the daily cap counts (every step but Ashley's replies, daily.ts
 * cappedCostUsd) and 연락 1명당 is that ÷ 연락; 답장's Ashley 비용 is the reply step, which has no cap. The cards above:
 * 오늘 is the capped cost against the cap, the period's is everything.
 */

type Step = "find" | "postings" | "mail" | "reply";
const STEPS: ReadonlyArray<{ id: Step; label: string }> = [
  { id: "find", label: "찾기" }, { id: "postings", label: "공고" }, { id: "mail", label: "메일" }, { id: "reply", label: "답장" },
];

/** The row control's words (Shaun 11/22 15:42: no "줄" label; the panel header, next to the period). */
const ROWS: ReadonlyArray<{ id: NumbersRows; label: string }> = [
  { id: "source", label: "사이트별" }, { id: "day", label: "날짜별" }, { id: "query", label: "검색어별" },
];

const ROW_HINTS: Record<NumbersRows, string> = {
  source: FUNNEL_HINTS.source,
  day: DAY_HINTS.day,
  query: `그 사람을 찾은 검색어예요. 찾은 사람이 많은 순서이고, 처음 ${QUERY_ROWS_SHOWN}개를 먼저 보여 줘요. 검색어 옆 작은 글씨는 찾은 곳이에요. 지원자 파일로 올린 사람은 검색어가 없어서 '지원자 파일 (검색어 없음)' 한 줄로 모아요. 검색 비용은 한 번의 검색이 여러 검색어를 함께 쓰고 결과를 같이 판단해서 검색어마다 나눌 수 없어요. 그래서 검색어 줄에는 비용 칸이 없어요(비용은 사이트별·날짜별에서 보세요). 구조조정 소식을 찾는 뉴스 검색은 사람을 찾지 않아서 검색 수에 넣지 않아요. 한 검색이 시간 제한에 끊겨 다음에 이어서 돌면 검색 기록은 마지막 것만 남아서, 사람은 있는데 검색 기록이 없는 검색어는 '기록 없음'으로 보여요.`,
};

const ROW_HEADER: Record<NumbersRows, string> = { source: "찾은 곳", day: "날짜", query: "검색어" };

const COST_HINTS = {
  /** 메일's 비용: what the daily cap counts. */
  capped: "그 사람들을 찾고(검색), 프로필을 읽고, 이메일을 찾고, 공고를 고르고, 따로 채점하고, 메일과 후속 메일을 쓰는 데 쓴 돈이에요. 하루 비용 한도가 세는 돈과 같아요. Ashley 답장에 든 돈은 한도에 세지 않아서 빼고, 답장 단계의 'Ashley 비용'에 따로 보여요. 마우스를 올리면 단계별로 보여요. 줄을 모두 더하면 합계와 같아요.",
  ashley: "Ashley가 답장을 판단하고 쓰는 데 든 돈이에요. 하루 비용 한도에는 세지 않아요.",
  period: "고른 기간(한국 시간 날짜) 동안 쓴 돈 전부예요: 검색, 프로필 읽기, 이메일 찾기, 공고 고르기, 따로 채점, 메일 쓰기, 후속 메일, 그리고 하루 한도에 세지 않는 Ashley 답장까지요. 테스트 실행에 쓴 돈도 들어가요.",
  allTime: "에이전트를 켠 날부터 지금까지 쓴 돈 전부(검색, 이메일 찾기, 공고 고르기, 메일 쓰기, 후속 메일, Ashley 답장) ÷ 메일 링크로 가입한 사람이에요. 테스트는 빼요. 아직 메일을 기다리는 사람에게 쓴 돈도 들어가서, 그 사람들이 메일을 받고 가입하면 내려가요. 예: $33.39 ÷ 16명 = $2.09.",
} as const;

/** 지금까지's ⓘ (가입 1명당 비용 uses COST_HINTS.allTime). */
const ALL_TIME_HINTS = {
  signedUp: "에이전트를 켠 날부터 지금까지 메일 링크로 하퍼에 가입한 사람이에요. 아래 표의 가입과 같은 기준이고, 테스트는 빼요. 위의 기간과 상관없이 처음부터 세요. 누르면 그 사람들을 로그에서 봐요.",
  perDay: "누적 가입 ÷ 에이전트를 켠 날부터 오늘까지의 날짜 수(한국 시간, 첫날과 오늘 포함)예요. 메일을 보내지 않는 주말도 날짜에 들어가요. 예: 5일 동안 16명이 가입했으면 3.2명.",
} as const;

/** 사이트별 | 날짜별 | 검색어별, for the panel header (AgentTab puts it next to the period). */
export function NumbersRowsControl({ value, onChange }: { value: NumbersRows; onChange: (rows: NumbersRows) => void }) {
  return <Segmented label="수치 · 후보 줄" items={ROWS} value={value} onChange={onChange} />;
}

type Column = { label: string; hint: string };

/** Each step's columns, left to right; a column that does not apply to a row kind is not there (Shaun 11/22). */
function columnsOf(step: Step, kind: NumbersRows): Column[] {
  const costs = kind !== "query";
  const L = COLUMN_LABEL;
  if (step === "find") {
    return [
      { label: "검색", hint: DAY_HINTS.searches }, { label: L.found, hint: FUNNEL_HINTS.found }, { label: "이미 찾은 사람", hint: DAY_HINTS.known },
      { label: "이메일 찾기", hint: DAY_HINTS.lookup }, { label: "연락 가능", hint: DAY_HINTS.withAddress }, { label: L.excluded, hint: FUNNEL_HINTS.excluded },
      ...(costs ? [{ label: "검색 비용", hint: DAY_HINTS.searchCost }, { label: "연락 가능 1명당", hint: DAY_HINTS.perWithAddress }] : []),
    ];
  }
  if (step === "postings") {
    return [
      { label: "보낸 공고", hint: DAY_HINTS.sentPostings }, { label: "평균 적합 점수", hint: DAY_HINTS.score },
      { label: "따로 채점", hint: DAY_HINTS.graded }, { label: "사람 판단", hint: DAY_HINTS.verdict },
    ];
  }
  if (step === "mail") {
    return [
      { label: L.contacted, hint: FUNNEL_HINTS.contacted }, { label: L.clicked, hint: FUNNEL_HINTS.clicked },
      { label: `${L.signedUp} (가입률)`, hint: FUNNEL_HINTS.signedUp }, { label: L.interested, hint: FUNNEL_HINTS.interested },
      { label: L.connected, hint: FUNNEL_HINTS.connected }, { label: "반송/스팸신고/수신거부", hint: FUNNEL_HINTS.delivery },
      ...(costs ? [{ label: "비용", hint: COST_HINTS.capped }, { label: "연락 1명당", hint: DAY_HINTS.perContact }] : []),
    ];
  }
  return [
    { label: L.replied, hint: FUNNEL_HINTS.replied }, { label: L.ashleyReplied, hint: FUNNEL_HINTS.ashleyReplied },
    { label: L.noReply, hint: FUNNEL_HINTS.noReply }, { label: L.handedOff, hint: FUNNEL_HINTS.handedOff },
    { label: L.signedUpAfterReply, hint: FUNNEL_HINTS.signedUpAfterReply },
    // Per person (the reply step's spend), so on 검색어 rows too.
    { label: "Ashley 비용", hint: COST_HINTS.ashley },
  ];
}

type Ctx = {
  kind: NumbersRows; strong: boolean;
  /** A number column: its people in the log. */
  pick: (column: FunnelColumn) => void;
  /** What the searches did or cost: the row's searches. */
  searches: () => void;
};

const quiet = (text: string) => <span className="text-[12px] text-neutral-muted">{text}</span>;
const PEOPLE_TITLE = "눌러서 이 줄의 찾은 사람 보기";
const SEARCHES_TITLE = "눌러서 검색 기록 보기";

/** "12 (33%)", as 가입 (가입률) reads; the % only when there is something to divide by. */
function CountWithRate({ n, of, strong }: { n: number; of: number; strong?: boolean }) {
  return (
    <>
      <span className={strong ? "font-medium" : undefined}>{n}</span>
      {of ? <span className="ml-1 text-[12px] text-neutral-muted">({ratePercent(n, of)})</span> : null}
    </>
  );
}

/**
 * A 검색어 row with people but no search record of its own: the uploaded files (never searched), or a query whose
 * search was cut off and run again in a later tick (the run's log keeps the last try's queries only).
 */
function missingSearchRecord(row: NumbersRow, kind: NumbersRows): string | null {
  if (kind !== "query" || row.key === null || row.run.searches) return null;
  if (row.key === NO_QUERY) return "검색 안 함";
  return row.numbers.found ? "기록 없음" : null;
}

function FindCells({ row, ctx }: { row: NumbersRow; ctx: Ctx }) {
  const { numbers } = row;
  const perAddress = searchCostPerContactable(row);
  const missing = missingSearchRecord(row, ctx.kind);
  const searchCell = (text: string) => (missing
    ? <td className="whitespace-nowrap px-2 py-1.5 text-right align-top">{quiet(missing)}</td>
    : <NumberCell onClick={ctx.searches} title={SEARCHES_TITLE}>{text}</NumberCell>);
  return (
    <>
      {searchCell(`${row.run.searches}번`)}
      <NumberCell onClick={() => ctx.pick("found")}><Count n={numbers.found} strong={ctx.strong} /></NumberCell>
      {searchCell(`${row.run.knownPeople}명`)}
      <NumberCell onClick={() => ctx.pick("found")} title={PEOPLE_TITLE}>
        {row.lookups.tried
          ? <>{row.lookups.found} / {row.lookups.tried}<span className="ml-1 text-[11px] text-neutral-muted">· {agentRate(row.lookups.found, row.lookups.tried)}%</span></>
          : <span className="text-neutral-muted">0</span>}
      </NumberCell>
      <NumberCell onClick={() => ctx.pick("found")} title={PEOPLE_TITLE}><CountWithRate n={row.withAddress} of={numbers.found} strong /></NumberCell>
      <NumberCell onClick={() => ctx.pick("excluded")} title={excludedTitle(numbers.excludedBy)}><Count n={numbers.excluded} /></NumberCell>
      {ctx.kind !== "query" ? (
        <>
          <NumberCell onClick={ctx.searches} title={SEARCHES_TITLE}><span className="text-neutral-muted">{usd(row.costBy.search ?? 0)}</span></NumberCell>
          <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums text-neutral-muted">
            {perAddress === null ? quiet("연락 가능 없음") : usd(perAddress)}
          </td>
        </>
      ) : null}
    </>
  );
}

/** 공고: the mailed postings, the matcher's average score, the separate grader's reads and Ops's calls. */
function PostingCells({ row, ctx }: { row: NumbersRow; ctx: Ctx }) {
  const { quality, numbers } = row;
  const average = averageScore(quality);
  const graded = gradedCount(quality);
  const judged = quality.verdicts.right + quality.verdicts.wrong;
  return (
    <>
      <NumberCell onClick={() => ctx.pick("contacted")} title={`메일 ${numbers.contacted}통에 담긴 공고 · 눌러서 그 사람들 보기`}>
        {quality.postings ? <span className={ctx.strong ? "font-medium" : undefined}>{quality.postings}개</span> : quiet("보낸 메일 없음")}
      </NumberCell>
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
    </>
  );
}

function MailCells({ row, ctx, spamLine }: { row: NumbersRow; ctx: Ctx; spamLine?: ReturnType<typeof gmailSpamLine> }) {
  const { numbers } = row;
  const perContact = cappedCostPerContact(row);
  return (
    <>
      <NumberCell onClick={() => ctx.pick("contacted")}><Count n={numbers.contacted} rate={agentRate(numbers.contacted, numbers.found)} strong={ctx.strong} /></NumberCell>
      <NumberCell onClick={() => ctx.pick("clicked")}><Count n={numbers.clicked} rate={agentRate(numbers.clicked, numbers.contacted)} /></NumberCell>
      <NumberCell onClick={() => ctx.pick("signedUp")}><CountWithRate n={numbers.signedUp} of={numbers.contacted} strong /></NumberCell>
      <NumberCell onClick={() => ctx.pick("interested")}><Count n={numbers.interested} /></NumberCell>
      <NumberCell onClick={() => ctx.pick("connected")}><Count n={numbers.connected} strong /></NumberCell>
      <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums">
        <DeliveryPart n={numbers.bounced} label={COLUMN_LABEL.bounced} onClick={() => ctx.pick("bounced")} />/
        <DeliveryPart n={numbers.complained} label={COLUMN_LABEL.complained} onClick={() => ctx.pick("complained")} />/
        <DeliveryPart n={numbers.unsubscribed} label={COLUMN_LABEL.unsubscribed} onClick={() => ctx.pick("unsubscribed")} />
        {spamLine ? (
          <div title={spamLine.title} className={cx("mt-0.5 text-[11px] font-normal", spamLine.alert ? "text-critical" : "text-neutral-muted")}>{spamLine.text}</div>
        ) : null}
      </td>
      {ctx.kind !== "query" ? (
        <>
          <NumberCell onClick={ctx.searches} title={`${costTitle(cappedCostBy(row.costBy))} · 눌러서 검색 기록 보기`}>
            <span className="text-neutral-muted">{usd(cappedCostUsd(row))}</span>
          </NumberCell>
          <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums text-neutral-muted">
            {perContact === null ? quiet("연락 없음") : usd(perContact)}
          </td>
        </>
      ) : null}
    </>
  );
}

/** One of 반송 / 스팸 신고 / 수신 거부: a button to its people, plain when 0. */
function DeliveryPart({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  if (n <= 0) return <span className="px-0.5">{n}</span>;
  return (
    <button type="button" title={`${label} · 눌러서 이 사람들 보기`} onClick={onClick} className="rounded px-0.5 tabular-nums hover:bg-bg-weak hover:underline">
      {n}
    </button>
  );
}

function ReplyCells({ row, ctx }: { row: NumbersRow; ctx: Ctx }) {
  const { numbers } = row;
  return (
    <>
      <NumberCell onClick={() => ctx.pick("replied")}><CountWithRate n={numbers.replied} of={numbers.contacted} strong /></NumberCell>
      <NumberCell onClick={() => ctx.pick("ashleyReplied")}><Count n={numbers.ashleyReplied} /></NumberCell>
      <NumberCell onClick={() => ctx.pick("noReply")} title={noReplyTitle(numbers.noReplyBy)}><Count n={numbers.noReply} /></NumberCell>
      <NumberCell onClick={() => ctx.pick("handedOff")}><Count n={numbers.handedOff} /></NumberCell>
      <NumberCell onClick={() => ctx.pick("signedUpAfterReply")}><Count n={numbers.signedUpAfterReply} /></NumberCell>
      <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums text-neutral-muted">{usd(ashleyCostUsd(row))}</td>
    </>
  );
}

/** "11.18~", with the year when it is not this year's. */
function sinceLabel(from: string, today: string) {
  const [y, m, d] = from.split("-");
  return `${y === today.slice(0, 4) ? "" : `${y}.`}${Number(m)}.${Number(d)}~`;
}

/**
 * 지금까지, three large figures above everything (Shaun 11/22 15:56 "1명 가입을 위해 들어간 돈을 실시간으로 트래킹하자",
 * 16:03 "누적가입 · 하루당 가입 · 총가입/총비용 … 3 지표 보자 (크게)"): since the agent started, whatever the panel's period
 * and filters; refreshed with the panel. 누적 가입 opens those people.
 */
function AllTimeStats({ allTime, today, onSignedUp }: { allTime: NumbersAllTime; today: string; onSignedUp: () => void }) {
  const perSignup = costPerSignup(allTime);
  const { days, perDay } = signupsPerDay(allTime);
  const since = sinceLabel(allTime.from, today);
  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-3">
      <BigStat label="누적 가입" hint={ALL_TIME_HINTS.signedUp} note={since}>
        <button
          type="button"
          onClick={onSignedUp}
          title="눌러서 가입한 사람 보기"
          className="rounded tabular-nums hover:underline"
        >
          {allTime.signedUp}명
        </button>
      </BigStat>
      <BigStat label="하루 평균 가입" hint={ALL_TIME_HINTS.perDay} note={`${allTime.signedUp}명 ÷ ${days}일`}>
        <span className="tabular-nums">{perDay}명</span>
      </BigStat>
      <BigStat
        label="가입 1명당 비용"
        hint={COST_HINTS.allTime}
        note={perSignup === null ? `비용 ${usd(allTime.costUsd)} · 아직 가입 없음` : `${usd(allTime.costUsd)} ÷ ${allTime.signedUp}명`}
      >
        <span className="tabular-nums">{perSignup === null ? "가입 없음" : usd(perSignup)}</span>
      </BigStat>
    </div>
  );
}

/** One of 지금까지's figures: CostStat's box with the value larger (Shaun 16:03 "크게"). */
function BigStat({ label, hint, note, children }: { label: string; hint: string; note: string; children: ReactNode }) {
  return (
    <div className={cx(opsTheme.panelSoft, "px-4 py-3")}>
      <div className="flex items-center gap-1 text-xs text-neutral-soft">
        {label}
        <Hint label={label} text={hint} />
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-neutral-primary">{children}</div>
      <div className="mt-0.5 text-xs tabular-nums text-neutral-muted">{note}</div>
    </div>
  );
}

function QueryLabel({ row }: { row: NumbersRow }) {
  const query = row.key ?? "";
  const places = row.sources.slice(0, 3).map(sourceLabel).join(" · ") + (row.sources.length > 3 ? ` 외 ${row.sources.length - 3}곳` : "");
  return (
    <span className="flex max-w-[420px] items-baseline gap-1.5">
      <span className="truncate" title={query || undefined}>{query === NO_QUERY ? "지원자 파일 (검색어 없음)" : query}</span>
      {places ? <span className="shrink-0 text-[11px] text-neutral-muted">{places}</span> : null}
    </span>
  );
}

export type AgentCandidateNumbersProps = {
  /** This panel's own period (agent/PeriodPicker.tsx). */
  period: AgentPeriodInput; refreshKey: number;
  /** The 찾은 곳 filter's choices (the overview's sources). */
  sources: string[];
  /** agent.overview's numbers, for the cost cards and Gmail's spam rate only. */
  funnel: AgentFunnel | null;
  rows: NumbersRows;
  /** The row control is in the panel header (NumbersRowsControl, Shaun 11/22 15:42); AgentTab gives both the same state. */
  onRows: (rows: NumbersRows) => void;
  /**
   * A number's people in the log. `period` is the log's period when it is not the panel's own: only 지금까지's 가입
   * (every day since the agent started, NumbersAllTime from..to).
   */
  onPick: (pick: NumbersPick, column: FunnelColumn, period?: { from: string; to: string }) => void;
  onSearches: (pick: { source: string | null; day: string | null; config: string | null }) => void;
};

export default function AgentCandidateNumbers(props: AgentCandidateNumbersProps) {
  const { period, refreshKey, sources, funnel, rows: kind, onPick, onSearches } = props;
  const list = useGtmAction<AgentNumbers>();
  const { run } = list;
  const configs = useAgentConfigs();
  // 메일 first: the first screen is the old 수치 (메일 × 사이트별) (Shaun 11/22 15:45).
  const [step, setStep] = useState<Step>("mail");
  const [source, setSource] = useState<string | null>(null);
  const [config, setConfig] = useState<string | null>(null);
  // On 사이트 rows each row is a site: no 찾은 곳 filter there (Shaun 11/22).
  const shownSource = kind === "source" ? null : source;
  const load = useCallback(() => {
    // Test rows never count on the screen (Shaun 11/17).
    void run("agent.numbers", { ...period, includeTest: false, rows: kind, source: shownSource, configId: config });
  }, [run, period, kind, shownSource, config]);
  useEffect(() => { load(); }, [load, refreshKey]);
  // "검색어 N개 더 보기" opens the rest for these controls only.
  const request = JSON.stringify({ ...period, kind, shownSource, config });
  const [allQueriesFor, setAllQueriesFor] = useState<string | null>(null);
  // A late answer for another row kind is not shown under the new one.
  const data = list.result && list.result.kind === kind ? list.result : null;
  const allTime = list.result?.allTime ?? null;
  const today = kstDay();
  const filters = { source: shownSource, config };
  const columns = columnsOf(step, kind);
  // 그날 실행 is what the day's runs did: 찾기 only (Shaun 11/22 15:45).
  const runColumn = kind === "day" && step === "find";
  const ctxOf = (row: NumbersRow, strong: boolean): Ctx => {
    const pick = numbersPick(kind, row.key, filters);
    return {
      kind, strong,
      pick: (column) => onPick(pick, column),
      searches: () => onSearches({ source: pick.source, day: pick.day, config: pick.config }),
    };
  };
  const cells = (row: NumbersRow, ctx: Ctx, spamLine?: ReturnType<typeof gmailSpamLine>) => (
    step === "find" ? <FindCells row={row} ctx={ctx} />
      : step === "postings" ? <PostingCells row={row} ctx={ctx} />
        : step === "mail" ? <MailCells row={row} ctx={ctx} spamLine={spamLine} /> : <ReplyCells row={row} ctx={ctx} />
  );
  const ranDays = data && kind === "day" ? data.rows.filter((row) => runText(row.run)).length : 0;
  const shownRows = data && kind === "query" && allQueriesFor !== request ? data.rows.slice(0, QUERY_ROWS_SHOWN) : data?.rows ?? [];
  const hidden = data ? data.rows.length - shownRows.length : 0;
  const bodyRow = (row: NumbersRow): ReactNode => {
    const key = row.key as string;
    if (kind === "query") {
      return (
        <tr key={`q:${key}`}>
          <td className="py-1.5 pr-3"><QueryLabel row={row} /></td>
          {cells(row, ctxOf(row, false))}
        </tr>
      );
    }
    if (kind === "source") {
      return (
        <tr key={key}>
          <td className="whitespace-nowrap py-1.5 pr-3">{sourceLabel(key)}</td>
          {cells(row, ctxOf(row, false))}
        </tr>
      );
    }
    return (
      <tr key={key}>
        <td className="whitespace-nowrap py-1.5 pr-3">
          {dayLabel(key, today)}{key === today ? <span className="ml-1 text-[11px] text-neutral-muted">오늘</span> : null}
          <ConfigStarts ids={row.configsStarted} onConfig={setConfig} />
        </td>
        {runColumn ? (
          <td className="whitespace-nowrap px-2 py-1.5 text-[12px]" title={runTitle(row.run)}>
            {runText(row.run) ?? <span className="text-neutral-muted">실행 없음</span>}
          </td>
        ) : null}
        {cells(row, ctxOf(row, false))}
      </tr>
    );
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <Segmented label="수치 · 후보 단계" items={STEPS} value={step} onChange={setStep} />
        <span className="flex flex-wrap items-center gap-2">
          {kind !== "source" ? (
            <>
              <span className="text-neutral-muted">찾은 곳</span>
              <span className="w-36 shrink-0">
                <Select aria-label="찾은 곳" value={source ?? ""} onChange={(event) => setSource(event.target.value || null)} className="w-36">
                  <option value="">전체</option>
                  {sources.map((value) => <option key={value} value={value}>{sourceLabel(value)}</option>)}
                  {source && !sources.includes(source) ? <option value={source}>{sourceLabel(source)}</option> : null}
                </Select>
              </span>
            </>
          ) : null}
          <span className="ml-2 flex items-center gap-1 text-neutral-muted">설정 묶음<Hint label="설정 묶음" text={DAY_HINTS.config} /></span>
          <span className="w-48 shrink-0">
            <Select aria-label="설정 묶음" value={config ?? ""} onChange={(event) => setConfig(event.target.value || null)} className="w-48">
              <option value="">전체</option>
              {[...configs].reverse().map((item) => <option key={item.id} value={item.id}>{configOptionLabel(item)}</option>)}
              {config && !configs.some((item) => item.id === config) ? <option value={config}>{shortConfigId(config)}</option> : null}
            </Select>
          </span>
        </span>
      </div>
      {/* The last answer's, whatever its row kind: it does not depend on the panel's controls. */}
      {allTime ? (
        <AllTimeStats
          allTime={allTime}
          today={today}
          onSignedUp={() => onPick({ source: null, day: null, query: null, config: null }, "signedUp", { from: allTime.from, to: allTime.to })}
        />
      ) : null}
      {funnel ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-4">
          {/* Everything spent in the period (Ashley's replies too); 오늘 is the capped cost against the cap (agentCostToday). */}
          <CostStat
            label={`${funnel.period.label} 비용 전부`}
            hint={COST_HINTS.period}
            value={usd(funnel.period.costUsd)}
            note={funnel.period.testCostUsd ? `테스트 ${usd(funnel.period.testCostUsd)} 포함` : undefined}
          />
          <CostStat
            label="오늘 비용"
            hint={TODAY_COST_HINT}
            value={usd(funnel.today.costUsd)}
            note={`한도 ${usd(funnel.today.costCapUsd)}`}
            alert={funnel.today.costUsd >= funnel.today.costCapUsd}
          />
        </div>
      ) : null}
      <ErrorNotice message={list.error} />
      {data ? (
        kind !== "day" && !data.rows.length ? (
          <p className="text-[13px] text-neutral-muted">이 기간에 찾은 사람도, 한 검색도 없어요</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="text-left text-[12px] text-neutral-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-normal"><HeaderLabel label={ROW_HEADER[kind]} hint={ROW_HINTS[kind]} align="left" /></th>
                  {runColumn ? <th className="px-2 py-1.5 font-normal"><HeaderLabel label="그날 실행" hint={DAY_HINTS.run} align="left" /></th> : null}
                  {columns.map((column) => (
                    <th key={column.label} className="px-2 py-1.5 text-right font-normal"><HeaderLabel label={column.label} hint={column.hint} /></th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-1000-a05">
                <tr className="bg-bg-weak font-medium">
                  <td className="whitespace-nowrap py-1.5 pr-3">합계</td>
                  {runColumn ? <td className="whitespace-nowrap px-2 py-1.5 text-[12px]">{`${data.rows.length}일 중 ${ranDays}일 실행`}</td> : null}
                  {cells(data.total, ctxOf(data.total, true), gmailSpamLine(funnel?.gmailSpam))}
                </tr>
                {kind === "day" ? dayLines(data.rows, (row) => row.key as string).map((line) => {
                  if (line.kind === "day") return bodyRow(line.row);
                  const days = line.count > 1 ? `${dayLabel(line.oldest, today)} ~ ${dayLabel(line.newest, today)}` : dayLabel(line.newest, today);
                  return (
                    <tr key={`quiet:${line.newest}`} className="text-neutral-muted">
                      <td className="whitespace-nowrap py-1.5 pr-3">{days}</td>
                      {runColumn ? <td className="whitespace-nowrap px-2 py-1.5 text-[12px]">실행 없음{line.count > 1 ? ` · ${line.count}일` : ""}</td> : null}
                      <td colSpan={columns.length} className="px-2 py-1.5 text-[12px]">
                        {runColumn ? "" : `실행 없음${line.count > 1 ? ` · ${line.count}일` : ""} · `}찾은 사람도 쓴 돈도 없어요
                      </td>
                    </tr>
                  );
                }) : shownRows.map(bodyRow)}
              </tbody>
            </table>
          </div>
        )
      ) : list.loading ? <p className="text-[12px] text-neutral-muted">불러오는 중…</p> : null}
      {hidden > 0 ? (
        <button type="button" onClick={() => setAllQueriesFor(request)} className="mt-2 text-[12px] text-neutral-muted underline hover:text-neutral-primary">
          검색어 {hidden}개 더 보기
        </button>
      ) : null}
      {data && !data.available ? <p className="mt-2 text-[12px] text-neutral-muted">아직 기록을 저장할 곳이 준비되지 않았어요(배포 전).</p> : null}
    </div>
  );
}
