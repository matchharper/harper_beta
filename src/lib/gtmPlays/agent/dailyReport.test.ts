import assert from "node:assert/strict";
import test from "node:test";
import { agentDailyRows } from "./daily";
import { dailyReportMessage, reportLink, reportPeriod } from "./dailyReport";

test("the report covers the 7 days before today, and its link opens 하루별 성능 on them", () => {
  assert.deepEqual(reportPeriod("2026-11-18"), { from: "2026-11-11", to: "2026-11-17" });
  assert.deepEqual(reportPeriod("2026-12-03"), { from: "2026-11-26", to: "2026-12-02" });
  assert.equal(reportLink("https://matchharper.com", { from: "2026-11-11", to: "2026-11-17" }),
    "https://matchharper.com/ops/gtm-plays?tab=5&open=daily&from=2026-11-11&to=2026-11-17");
});

test("the Slack message: the title, a table block (a row per day, newest first, 합계 last) and the link", () => {
  const period = { from: "2026-11-11", to: "2026-11-17" };
  const { days, total } = agentDailyRows({ ...period, people: [], spend: [], runs: [] });
  const { text, blocks } = dailyReportMessage({ days, total, link: "https://matchharper.com/ops/gtm-plays?tab=5" });
  assert.equal(text, "후보자 소싱 에이전트 (최근 7일): 연락 0, 클릭 0, 가입 0, 총 비용 $0.00");
  assert.deepEqual(blocks[0], { type: "section", text: { type: "mrkdwn", text: "*후보자 소싱 에이전트 (최근 7일)*" } });
  const table = blocks[1] as { type: string; column_settings: unknown[]; rows: Array<Array<{ type: string; text: string }>> };
  assert.equal(table.type, "table");
  // The date column left, the numbers right, so the columns line up whatever the font.
  assert.deepEqual(table.column_settings, [{ align: "left" }, { align: "right" }, { align: "right" }, { align: "right" }, { align: "right" }]);
  const rows = table.rows.map((row) => row.map((cell) => cell.text));
  assert.ok(table.rows.flat().every((cell) => cell.type === "raw_text"));
  // Only the outcome numbers (Shaun 11/18); 7 days, newest first, then 합계.
  assert.deepEqual(rows[0], ["날짜", "연락", "클릭", "가입", "총 비용"]);
  assert.deepEqual(rows[1], ["11/17 화", "0", "0", "0", "$0.00"]);
  assert.equal(rows[7][0], "11/11 수");
  assert.deepEqual(rows[8], ["합계", "0", "0", "0", "$0.00"]);
  assert.equal(rows.length, 9);
  assert.deepEqual(blocks[2], {
    type: "section", text: { type: "mrkdwn", text: "<https://matchharper.com/ops/gtm-plays?tab=5|/ops 하루별 성능에서 보기>" },
  });
});
