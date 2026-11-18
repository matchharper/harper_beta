/**
 * #5 하루 수치 in Slack (Shaun 11/18: no problem alerts, just the daily numbers of the last 7 days as a table, with a
 * link that opens the feature): every morning one message to #gtm-talent with the same numbers /ops #5 하루별 성능
 * shows (찾음, 제외, 연락, 클릭, 가입, 답장, 비용, 연락 1명당 비용) for the 7 Korea-time days before today, and a link
 * that opens 하루별 성능 on that period. Pure: the cron route builds the rows (views.server.ts agentDaily) and sends it.
 */
import { costPerContact, type AgentDayRow } from "./daily";

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

/** Columns as wide as a monospace font draws them (Hangul takes two). */
const width = (text: string) => [...text].reduce((sum, char) => sum + (/[ᄀ-ᇿ㄰-㆏가-힣]/.test(char) ? 2 : 1), 0);
const padStart = (text: string, size: number) => `${" ".repeat(Math.max(0, size - width(text)))}${text}`;
const padEnd = (text: string, size: number) => `${text}${" ".repeat(Math.max(0, size - width(text)))}`;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} ${WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]}`;
const money = (usd: number | null) => (usd === null ? "-" : `$${usd.toFixed(2)}`);

const COLUMNS: Array<{ label: string; value: (row: AgentDayRow) => string }> = [
  { label: "찾음", value: (row) => String(row.numbers.found) },
  { label: "제외", value: (row) => String(row.numbers.excluded) },
  { label: "연락", value: (row) => String(row.numbers.contacted) },
  { label: "클릭", value: (row) => String(row.numbers.clicked) },
  { label: "가입", value: (row) => String(row.numbers.signedUp) },
  { label: "답장", value: (row) => String(row.numbers.replied) },
  { label: "비용", value: (row) => money(row.numbers.costUsd) },
  { label: "연락당", value: (row) => money(costPerContact(row.numbers)) },
];

/**
 * The Slack message: a title line, the table in a code block (newest day first, 합계 last) and the link. `agentOn`
 * says whether the agent is on now (a quiet week reads differently when it is off).
 */
export function dailyReportText(args: {
  days: readonly AgentDayRow[]; total: AgentDayRow; period: { from: string; to: string }; link: string; agentOn: boolean;
}): string {
  const rows = [...args.days].filter((row) => row.day).sort((a, b) => String(b.day).localeCompare(String(a.day)));
  const labels = [...rows.map((row) => dayLabel(String(row.day))), "합계"];
  const firstWidth = Math.max(...labels.map(width), width("날짜"));
  const cells = [...rows, args.total].map((row) => COLUMNS.map((column) => column.value(row)));
  const widths = COLUMNS.map((column, index) => Math.max(width(column.label), ...cells.map((line) => width(line[index]))));
  const line = (first: string, values: string[]) =>
    [padEnd(first, firstWidth), ...values.map((value, index) => padStart(value, widths[index]))].join("  ").trimEnd();
  const table = [
    line("날짜", COLUMNS.map((column) => column.label)),
    ...rows.map((row, index) => line(labels[index], cells[index])),
    line("합계", cells[cells.length - 1]),
  ].join("\n");
  const range = `${dayLabel(args.period.from)} ~ ${dayLabel(args.period.to)}`;
  return [
    `*#5 후보자 소싱 에이전트 · 최근 7일* (${range}) · 에이전트 ${args.agentOn ? "켜짐" : "꺼짐"}`,
    "```",
    table,
    "```",
    `<${args.link}|/ops 하루별 성능에서 보기>`,
  ].join("\n");
}
