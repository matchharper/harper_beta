/**
 * #5 하루 수치 in Slack (Shaun 11/18: no problem alerts, just the daily numbers of the last 7 days as a table, with a
 * link that opens the feature; only the outcome numbers): every morning one message to #gtm-talent with 연락, 클릭,
 * 가입 and 총 비용 per Korea-time day for the 7 days before today (the same numbers as /ops #5 하루별 성능), 합계 at
 * the bottom, and a link that opens 하루별 성능 on that period. Pure: the cron route builds the rows (views.server.ts
 * agentDaily) and sends it.
 */
import type { AgentDayRow } from "./daily";

/** The period the report covers: the 7 Korea-time days before `today` (today has barely started at 9 a.m.). */
export function reportPeriod(today: string): { from: string; to: string } {
  const day = (offset: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  return { from: day(-7), to: day(-1) };
}

/** The /ops link that opens 하루별 성능 on the report's period. */
export function reportLink(origin: string, period: { from: string; to: string }): string {
  const url = new URL("/ops/gtm-plays", origin);
  url.searchParams.set("tab", "5");
  url.searchParams.set("open", "daily");
  url.searchParams.set("from", period.from);
  url.searchParams.set("to", period.to);
  return url.toString();
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} ${WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]}`;
const money = (usd: number) => `$${usd.toFixed(2)}`;

/** The title (Shaun 11/19). */
export const REPORT_TITLE = "[후보자 소싱 에이전트 · 최근 7일 수치]";

const COLUMNS: Array<{ label: string; value: (row: AgentDayRow) => string }> = [
  { label: "연락", value: (row) => String(row.numbers.contacted) },
  { label: "클릭", value: (row) => String(row.numbers.clicked) },
  { label: "가입", value: (row) => String(row.numbers.signedUp) },
  { label: "총 비용", value: (row) => money(row.numbers.costUsd) },
];

export type SlackBlock = Record<string, unknown>;

const cell = (text: string) => ({ type: "raw_text", text });

/**
 * The Slack message: the title, the numbers as a Slack table block (newest day first, 합계 last, numbers
 * right-aligned) and the link. A table block, not a code block: Slack draws Hangul narrower than two letters in a code
 * block, so the columns slid apart (11/19). Same block as the company role summary (ops/autoIntroToCompanyMessage.ts).
 * `text` is what the notification shows.
 */
export function dailyReportMessage(args: {
  days: readonly AgentDayRow[]; total: AgentDayRow; link: string;
}): { text: string; blocks: SlackBlock[] } {
  const rows = [...args.days].filter((row) => row.day).sort((a, b) => String(b.day).localeCompare(String(a.day)));
  const table = [
    ["날짜", ...COLUMNS.map((column) => column.label)],
    ...rows.map((row) => [dayLabel(String(row.day)), ...COLUMNS.map((column) => column.value(row))]),
    ["합계", ...COLUMNS.map((column) => column.value(args.total))],
  ];
  const total = COLUMNS.map((column) => `${column.label} ${column.value(args.total)}`).join(", ");
  return {
    text: `${REPORT_TITLE}: ${total}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${REPORT_TITLE}*` } },
      {
        type: "table",
        column_settings: [{ align: "left" }, ...COLUMNS.map(() => ({ align: "right" }))],
        rows: table.map((line) => line.map(cell)),
      },
      { type: "section", text: { type: "mrkdwn", text: `<${args.link}|/ops 하루별 성능에서 보기>` } },
    ],
  };
}
