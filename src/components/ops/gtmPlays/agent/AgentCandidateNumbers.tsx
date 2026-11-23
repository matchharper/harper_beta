import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { CHANNEL_LABELS, isFillChannel, type AgentCandidateChannel, type ChannelSettings } from "@/lib/gtmPlays/agent/channels";
import { shortConfigId } from "@/lib/gtmPlays/agent/config";
import {
  ashleyCostUsd, averageScore, cappedCostBy, cappedCostPerContact, cappedCostUsd, gradedCount, searchCostPerContactable,
} from "@/lib/gtmPlays/agent/daily";
import { agentRate, type FunnelColumn } from "@/lib/gtmPlays/agent/funnel";
import {
  costPerSignup, dayLines, NO_QUERY, noSearchRecord, numbersPick, QUERY_ROWS_SHOWN, signupsPerDay, type NoSearchRecord,
  type NumbersAllTime, type NumbersPick, type NumbersRow, type NumbersRows,
} from "@/lib/gtmPlays/agent/numbers";
import { kstDay, type AgentPeriodInput } from "@/lib/gtmPlays/agent/period";
import { gmailSpamDayLine, gmailSpamLine, gmailSpamQuietLine } from "@/lib/gtmPlays/agent/postmaster";
import { DEFAULT_SEND_WEEKDAYS } from "@/lib/gtmPlays/agent/sendTiming";
import { ratePercent } from "@/lib/gtmPlays/rate";
import type { AgentChannelsToday, AgentFunnel, AgentNumbers } from "@/lib/gtmPlays/agent/views.server";
import { formatKst, useGtmAction } from "../api";
import { ErrorNotice, Hint, Select } from "../ui";
import { configOptionLabel, useAgentConfigs } from "./AgentConfig";
import { brakedChannels, COLUMN_LABEL, sourceLabel, usd, weekdaysLabel } from "./labels";
import {
  ConfigStarts, CostStat, costTitle, Count, DAY_HINTS, dayLabel, excludedTitle, FUNNEL_HINTS, HeaderLabel, noReplyTitle,
  NumberCell, runText, runTitle, Segmented, TODAY_COST_HINT,
} from "./numberCells";

/**
 * #5 수치 · 후보 (Shaun 11/22: one panel instead of 수치 and 하루별 성능; "같은 정보를 보여주되, 최적화를 해"). Rows by
 * 사이트 / 날짜 / 검색어 / 채널 (NumbersRowsControl, in the panel header next to the period), 합계 first in every kind. The
 * columns follow the agent's work, one step at a time (찾기 → 공고 → 메일 → 답장 → 결과), each column in one step only;
 * 메일 first, so the first screen reads like the old 수치. Shaun 11/22 16:44: 메일 keeps only how the mail itself fared,
 * 답장 only the replies and what Ashley did with them, 결과 what happened on Harper (가입, 관심·지원, 회사 연결); 답장 후
 * 가입 is part of 가입, so it is shown inside 가입's cell ("16 (10%) · 답장 후 3") and not as a column that reads as more
 * people. A reply's interest is not counted (Shaun 16:43: no need to track it). Filters 찾은 곳 (날짜 and 검색어 rows: on 사이트 rows each row is a
 * site) and 설정 묶음. Test rows never count.
 *
 * What a click opens (the number and the log are the same set, Shaun 11/17):
 *   - a number column of funnel.ts (찾음, 이메일 찾기, 연락 가능, 제외, 연락 … 답장 후 가입): onPick(numbersPick(row),
 *     column): the row's key as its source / day / query, with the panel's 찾은 곳 and 설정 묶음. The log filters with
 *     inFunnelColumn (stage.ts filtersForColumn: 단계, 메일 반응 or 찾기), so it shows exactly the counted people.
 *     이메일 찾기 ("성공 / 시도") opens the people a lookup was tried for (Shaun 11/22). 보낸 공고 opens the 연락 people
 *     the postings went to.
 *   - 검색, 이미 찾은 사람, 검색 비용, 비용 (what the searches did and cost, which no person row carries):
 *     onSearches({ source, day, config }): the row's searches; for a 검색어 row the period's searches under the filters
 *     (the search log lists each search's queries; it cannot filter by one). Rows of people never searched (an uploaded
 *     file's: numbers.ts noSearchRecord) say "검색 안 함" there instead, and their 비용 opens nothing.
 *   - 지금까지's 가입: onPick(all of it, "signedUp", { from, to }): every signup since the agent started.
 * 반송/스팸신고/수신거부, 평균 적합 점수, 따로 채점, 사람 판단 and the per-person costs (연락 1명당, Ashley 비용 …) open
 * nothing.
 *   - 채널 rows (11/23): a new channel's "오늘 3/20" (its candidate mails today / its daily max) opens the people those
 *     mails went to (onIds), shown only while the period reaches today.
 *   - Under the table, 돕는 쪽으로 기록한 사람 N명 (funnel.ts isGiver: in no number above): onGivers, exactly those people.
 *
 * Costs (Shaun 11/22 15:51: every real cost shown, split by step; the cap figure only what the cap counts): 찾기's 검색
 * 비용 is the search step; 메일's 비용 is what the daily cap counts (every step but Ashley's replies, daily.ts
 * cappedCostUsd) and 연락 1명당 is that ÷ 연락; 답장's Ashley 비용 is the reply step, which has no cap. The cards above:
 * 오늘 is the capped cost against the cap, the period's is everything.
 */

type Step = "find" | "postings" | "mail" | "reply" | "outcome";
const STEPS: ReadonlyArray<{ id: Step; label: string }> = [
  { id: "find", label: "찾기" }, { id: "postings", label: "공고" }, { id: "mail", label: "메일" }, { id: "reply", label: "답장" },
  { id: "outcome", label: "결과" },
];

/** The row control's words (Shaun 11/22 15:42: no "줄" label; the panel header, next to the period). */
const ROWS: ReadonlyArray<{ id: NumbersRows; label: string }> = [
  { id: "source", label: "사이트별" }, { id: "day", label: "날짜별" }, { id: "query", label: "검색어별" }, { id: "channel", label: "채널별" },
];

const ROW_HINTS: Record<NumbersRows, string> = {
  source: FUNNEL_HINTS.source,
  day: DAY_HINTS.day,
  query: `사람을 찾은 검색어예요(찾은 사람이 많은 순). 검색 비용은 검색어별로 나눌 수 없어서 이 보기에는 비용 칸이 없어요.`,
  channel: "사람을 찾은 곳과 글을 쓴 이유로 나눈 채널이에요. 검색은 채널별로 나눌 수 없어서 검색·비용 칸이 없어요. 보충 채널 옆 '오늘 3/20'은 오늘 보낸 메일 수 / 하루 최대예요.",
};

const ROW_HEADER: Record<NumbersRows, string> = { source: "찾은 곳", day: "날짜", query: "검색어", channel: "채널" };

/** Rows whose searches can be told apart (a 채널 row's cannot: one search finds people of several channels). */
const searchedRows = (kind: NumbersRows) => kind !== "channel";
/** Rows with a cost of their own (a search's cost is the whole search's: none on 검색어 and 채널 rows). */
const costRows = (kind: NumbersRows) => kind !== "query" && kind !== "channel";

const GIVERS_HINT = "채용하는 대표·리더, 리크루터, 코치·멘토, 행사 주최예요. 위 수치에는 넣지 않고 회사 쪽에 써요.";

const COST_HINTS = {
  /** 메일's 비용: what the daily cap counts. */
  capped: "하루 한도에 세는 비용이에요(검색부터 메일 쓰기까지). Ashley 답장 비용은 빼고 답장 단계에 따로 보여요.",
  ashley: "Ashley가 답장을 판단하고 쓰는 데 쓴 비용이에요. 하루 비용 한도에는 세지 않아요.",
  period: "고른 기간에 쓴 비용 전부예요(Ashley 답장, 테스트 실행 포함).",
  allTime: "처음부터(길어도 최근 1년) 지금까지 쓴 비용 전부 ÷ 누적 가입이에요. 테스트는 빼고, Ashley 답장 비용도 넣어요.",
} as const;

/** 지금까지's ⓘ (가입 1명당 비용 uses COST_HINTS.allTime). */
const ALL_TIME_HINTS = {
  signedUp: "에이전트를 처음 켠 날부터(길어도 최근 1년) 메일 링크로 가입한 사람이에요. 고른 기간과 상관없이 세요(테스트는 빼요).",
} as const;

/** 하루 평균 가입's ⓘ: the days counted are the send days chosen in 설정. */
const perDayHint = (weekdays: readonly number[]) => `누적 가입 ÷ 처음 켠 날부터 오늘까지 메일을 보내는 날(${weekdaysLabel(weekdays)})의 수예요.`;

/** 사이트별 | 날짜별 | 검색어별, for the panel header (AgentTab puts it next to the period). */
export function NumbersRowsControl({ value, onChange }: { value: NumbersRows; onChange: (rows: NumbersRows) => void }) {
  return <Segmented label="수치 · 후보 줄" items={ROWS} value={value} onChange={onChange} />;
}

type Column = { label: string; hint: string };

/** Each step's columns, left to right; a column that does not apply to a row kind is not there (Shaun 11/22). */
function columnsOf(step: Step, kind: NumbersRows): Column[] {
  const costs = costRows(kind);
  const L = COLUMN_LABEL;
  if (step === "find") {
    const searched = searchedRows(kind);
    return [
      ...(searched ? [{ label: "검색", hint: DAY_HINTS.searches }] : []), { label: L.found, hint: FUNNEL_HINTS.found },
      ...(searched ? [{ label: "이미 찾은 사람", hint: DAY_HINTS.known }] : []),
      { label: L.lookupTried, hint: DAY_HINTS.lookup }, { label: L.withAddress, hint: DAY_HINTS.withAddress }, { label: L.excluded, hint: FUNNEL_HINTS.excluded },
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
      { label: "반송/스팸신고/수신거부", hint: FUNNEL_HINTS.delivery },
      ...(costs ? [{ label: "비용", hint: COST_HINTS.capped }, { label: "연락 1명당", hint: DAY_HINTS.perContact }] : []),
    ];
  }
  if (step === "reply") {
    return [
      { label: L.replied, hint: FUNNEL_HINTS.replied }, { label: L.ashleyReplied, hint: FUNNEL_HINTS.ashleyReplied },
      { label: L.noReply, hint: FUNNEL_HINTS.noReply }, { label: L.handedOff, hint: FUNNEL_HINTS.handedOff },
      // Per person (the reply step's spend), so on 검색어 rows too.
      { label: "Ashley 비용", hint: COST_HINTS.ashley },
    ];
  }
  return [
    { label: `${L.signedUp} (가입률)`, hint: FUNNEL_HINTS.signedUp }, { label: L.interested, hint: FUNNEL_HINTS.interested },
    { label: L.connected, hint: FUNNEL_HINTS.connected },
  ];
}

type Ctx = {
  kind: NumbersRows; strong: boolean;
  /** A number column: its people in the log. */
  pick: (column: FunnelColumn) => void;
  /** What the searches did or cost: the row's searches. */
  searches: () => void;
  /** Why the row has no searches to show (numbers.ts noSearchRecord), or null. */
  noSearch: NoSearchRecord | null;
};

const quiet = (text: string) => <span className="text-[12px] text-neutral-muted">{text}</span>;
const SEARCHES_TITLE = "눌러서 검색 기록 보기";
const NO_SEARCH_LABEL: Record<NoSearchRecord, string> = { not_searched: "검색 안 함", no_record: "기록 없음" };

/** "12 (33%)", as 가입 (가입률) reads; the % only when there is something to divide by. */
function CountWithRate({ n, of, strong }: { n: number; of: number; strong?: boolean }) {
  return (
    <>
      <span className={strong ? "font-medium" : undefined}>{n}</span>
      {of ? <span className="ml-1 text-[12px] text-neutral-muted">({ratePercent(n, of)})</span> : null}
    </>
  );
}

function FindCells({ row, ctx }: { row: NumbersRow; ctx: Ctx }) {
  const { numbers } = row;
  const perAddress = searchCostPerContactable(row);
  // A row of people never searched (an uploaded file's) says so in every search cell, instead of 0번 / $0.00 that
  // open an empty 검색 기록.
  const noSearch = ctx.noSearch ? <td className="whitespace-nowrap px-2 py-1.5 text-right align-top">{quiet(NO_SEARCH_LABEL[ctx.noSearch])}</td> : null;
  const searchCell = (children: ReactNode) => (!searchedRows(ctx.kind) ? null
    : noSearch ?? <NumberCell onClick={ctx.searches} title={SEARCHES_TITLE}>{children}</NumberCell>);
  return (
    <>
      {searchCell(`${row.run.searches}번`)}
      <NumberCell onClick={() => ctx.pick("found")}><Count n={numbers.found} strong={ctx.strong} /></NumberCell>
      {searchCell(`${row.run.knownPeople}명`)}
      {/* 성공 / 시도; opens the people a lookup was tried for (the 시도). */}
      <NumberCell onClick={() => ctx.pick("lookupTried")} title="눌러서 이메일 찾기를 한 사람 보기">
        {numbers.lookupTried
          ? <>{row.lookupFound} / {numbers.lookupTried}<span className="ml-1 text-[11px] text-neutral-muted">· {agentRate(row.lookupFound, numbers.lookupTried)}%</span></>
          : <span className="text-neutral-muted">0</span>}
      </NumberCell>
      <NumberCell onClick={() => ctx.pick("withAddress")} title="눌러서 연락 가능한 사람 보기">
        <CountWithRate n={numbers.withAddress} of={numbers.found} strong />
      </NumberCell>
      <NumberCell onClick={() => ctx.pick("excluded")} title={excludedTitle(numbers.excludedBy)}><Count n={numbers.excluded} /></NumberCell>
      {costRows(ctx.kind) ? (
        <>
          {searchCell(<span className="text-neutral-muted">{usd(row.costBy.search ?? 0)}</span>)}
          {noSearch ?? (
            <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums text-neutral-muted">
              {perAddress === null ? quiet("연락 가능 없음") : usd(perAddress)}
            </td>
          )}
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
      <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums">
        <DeliveryPart n={numbers.bounced} label={COLUMN_LABEL.bounced} onClick={() => ctx.pick("bounced")} />/
        <DeliveryPart n={numbers.complained} label={COLUMN_LABEL.complained} onClick={() => ctx.pick("complained")} />/
        <DeliveryPart n={numbers.unsubscribed} label={COLUMN_LABEL.unsubscribed} onClick={() => ctx.pick("unsubscribed")} />
        {spamLine ? (
          <div title={spamLine.title} className={cx("mt-0.5 text-[11px] font-normal", spamLine.alert ? "text-critical" : "text-neutral-muted")}>{spamLine.text}</div>
        ) : null}
      </td>
      {costRows(ctx.kind) ? (
        <>
          {/* The people's own costs only, when no search found them: nothing in 검색 기록 to open. */}
          {ctx.noSearch ? (
            <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums text-neutral-muted" title={costTitle(cappedCostBy(row.costBy))}>
              {usd(cappedCostUsd(row))}
            </td>
          ) : (
            <NumberCell onClick={ctx.searches} title={`${costTitle(cappedCostBy(row.costBy))} · 눌러서 검색 기록 보기`}>
              <span className="text-neutral-muted">{usd(cappedCostUsd(row))}</span>
            </NumberCell>
          )}
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
      <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums text-neutral-muted">{usd(ashleyCostUsd(row))}</td>
    </>
  );
}

/**
 * 결과: what happened on Harper. 가입 holds 답장 후 가입 (funnel.ts: a sign-up at or after the reply), so that part is
 * shown inside 가입's cell as its own button ("16 (10%) · 답장 후 3"), never as a column of its own (Shaun 11/22 16:43).
 */
function OutcomeCells({ row, ctx }: { row: NumbersRow; ctx: Ctx }) {
  const { numbers } = row;
  return (
    <>
      <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums">
        <PartButton n={numbers.signedUp} title="가입 · 눌러서 이 사람들 보기" onClick={() => ctx.pick("signedUp")}>
          <CountWithRate n={numbers.signedUp} of={numbers.contacted} strong />
        </PartButton>
        {numbers.signedUpAfterReply ? (
          <span className="ml-1 text-[12px] text-neutral-muted">
            · <PartButton n={numbers.signedUpAfterReply} title={`${COLUMN_LABEL.signedUpAfterReply} · 눌러서 이 사람들 보기`} onClick={() => ctx.pick("signedUpAfterReply")}>
              답장 후 {numbers.signedUpAfterReply}
            </PartButton>
          </span>
        ) : null}
      </td>
      <NumberCell onClick={() => ctx.pick("interested")}><Count n={numbers.interested} /></NumberCell>
      <NumberCell onClick={() => ctx.pick("connected")}><Count n={numbers.connected} strong /></NumberCell>
    </>
  );
}

/** A part of a cell that opens its own people (as DeliveryPart); plain when 0. */
function PartButton({ n, title, onClick, children }: { n: number; title: string; onClick: () => void; children: ReactNode }) {
  if (n <= 0) return <span className="px-0.5">{children}</span>;
  return (
    <button type="button" title={title} onClick={onClick} className="rounded px-0.5 tabular-nums hover:bg-bg-weak hover:underline">
      {children}
    </button>
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
function AllTimeStats({ allTime, today, sendWeekdays, onSignedUp }: {
  allTime: NumbersAllTime; today: string; sendWeekdays: readonly number[]; onSignedUp: () => void;
}) {
  const perSignup = costPerSignup(allTime);
  const { days, perDay } = signupsPerDay(allTime, sendWeekdays);
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
      <BigStat label="하루 평균 가입" hint={perDayHint(sendWeekdays)} note={`${allTime.signedUp}명 ÷ ${days}일`}>
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

/**
 * A new channel's today next to its name (Shaun 11/23: each sends at most its daily max): "오늘 3/20", the 3 opening
 * the people those mails went to; "꺼짐" when off, in red with why when the brake turned it off.
 */
function ChannelToday({ channel, settings, today, onIds }: {
  channel: AgentCandidateChannel; settings: ChannelSettings; today: AgentChannelsToday;
  onIds: (ids: string[], label: string) => void;
}) {
  const setting = settings[channel];
  const label = CHANNEL_LABELS[channel];
  if (!setting?.enabled) {
    const braked = brakedChannels(settings, today.brakes).find((item) => item.channel === channel);
    return braked
      ? <span title={braked.at ? `${braked.reason} · ${formatKst(braked.at)}` : braked.reason} className="ml-1.5 text-[11px] text-critical">자동으로 꺼짐</span>
      : <span className="ml-1.5 text-[11px] text-neutral-muted">꺼짐</span>;
  }
  if (!isFillChannel(channel) || setting.dailyMax === null) return null;
  const sent = today.sent[channel] ?? { mails: 0, personIds: [] };
  return (
    <span className="ml-1.5 text-[11px] text-neutral-muted">
      오늘{" "}
      <PartButton
        n={sent.mails}
        title={`오늘 메일 ${sent.mails}통 · ${sent.personIds.length}명 · 눌러서 그 사람들 보기`}
        onClick={() => onIds(sent.personIds, `${label} · 오늘 보낸 메일`)}
      >
        {sent.mails}
      </PartButton>/{setting.dailyMax}
    </span>
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
  /** The send days in 설정 (하루 평균 가입 counts only these); null until the overview is read: 월~금. */
  sendWeekdays: readonly number[] | null;
  /** Each channel's on/off and daily max (설정), and today's mails per channel with the brake's reasons: 채널 rows' "오늘 3/20". */
  channels: ChannelSettings | null;
  channelsToday: AgentChannelsToday | null;
  rows: NumbersRows;
  /** The row control is in the panel header (NumbersRowsControl, Shaun 11/22 15:42); AgentTab gives both the same state. */
  onRows: (rows: NumbersRows) => void;
  /**
   * A number's people in the log. `period` is the log's period when it is not the panel's own: only 지금까지's 가입
   * (every day since the agent started, NumbersAllTime from..to).
   */
  onPick: (pick: NumbersPick, column: FunnelColumn, period?: { from: string; to: string }) => void;
  onSearches: (pick: { source: string | null; day: string | null; config: string | null }) => void;
  /** 돕는 쪽으로 기록한 사람 N명: the givers among the panel's people (the 합계's pick: its 찾은 곳 and 설정 묶음). */
  onGivers: (pick: NumbersPick) => void;
  /** An explicit set of people with the log chip's words (a channel's mails today). */
  onIds: (ids: string[], label: string) => void;
};

export default function AgentCandidateNumbers(props: AgentCandidateNumbersProps) {
  const { period, refreshKey, sources, funnel, sendWeekdays, channels, channelsToday, rows: kind, onPick, onSearches, onGivers, onIds } = props;
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
      noSearch: noSearchRecord(kind, row, filters),
    };
  };
  const cells = (row: NumbersRow, ctx: Ctx, spamLine?: ReturnType<typeof gmailSpamLine>) => (
    step === "find" ? <FindCells row={row} ctx={ctx} />
      : step === "postings" ? <PostingCells row={row} ctx={ctx} />
        : step === "mail" ? <MailCells row={row} ctx={ctx} spamLine={spamLine} />
          : step === "reply" ? <ReplyCells row={row} ctx={ctx} /> : <OutcomeCells row={row} ctx={ctx} />
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
    if (kind === "channel") {
      const channel = key as AgentCandidateChannel;
      return (
        <tr key={key}>
          <td className="whitespace-nowrap py-1.5 pr-3">
            {CHANNEL_LABELS[channel] ?? key}
            {/* Today's figures only while the period reaches today (each panel keeps its own period). */}
            {channels && channelsToday && data && data.period.to >= today
              ? <ChannelToday channel={channel} settings={channels} today={channelsToday} onIds={onIds} /> : null}
          </td>
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
        {/* That day's Gmail spam rate, when Google gave one (Shaun 11/23 13:02: 합계 the period, a day its own). */}
        {cells(row, ctxOf(row, false), gmailSpamDayLine(funnel?.gmailSpam, key))}
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
          sendWeekdays={sendWeekdays ?? DEFAULT_SEND_WEEKDAYS}
          onSignedUp={() => onPick({ source: null, day: null, query: null, config: null, channel: null }, "signedUp", { from: allTime.from, to: allTime.to })}
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
                  const quietSpam = gmailSpamQuietLine(funnel?.gmailSpam, line.oldest, line.newest);
                  return (
                    <tr key={`quiet:${line.newest}`} className="text-neutral-muted">
                      <td className="whitespace-nowrap py-1.5 pr-3">{days}</td>
                      {runColumn ? <td className="whitespace-nowrap px-2 py-1.5 text-[12px]">실행 없음{line.count > 1 ? ` · ${line.count}일` : ""}</td> : null}
                      <td colSpan={columns.length} className="px-2 py-1.5 text-[12px]">
                        {runColumn ? "" : `실행 없음${line.count > 1 ? ` · ${line.count}일` : ""} · `}찾은 사람도 쓴 돈도 없어요
                        {quietSpam ? <span title={quietSpam.title} className="ml-2 text-critical">{quietSpam.text}</span> : null}
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
      {/* The givers: in no number above, one line of their own (Shaun 11/23), only when there are any. */}
      {data && data.total.numbers.givers > 0 ? (
        <p className="mt-2 flex items-center gap-1 text-[12px] text-neutral-muted">
          <button
            type="button"
            title="눌러서 이 사람들 보기"
            onClick={() => onGivers(numbersPick(kind, null, filters))}
            className="rounded tabular-nums hover:bg-bg-weak hover:underline"
          >
            돕는 쪽으로 기록한 사람 {data.total.numbers.givers}명
          </button>
          (후보 메일 안 보냄)
          <Hint label="돕는 쪽" text={GIVERS_HINT} />
        </p>
      ) : null}
      {data && !data.available ? <p className="mt-2 text-[12px] text-neutral-muted">아직 기록을 저장할 곳이 준비되지 않았어요(배포 전).</p> : null}
    </div>
  );
}
