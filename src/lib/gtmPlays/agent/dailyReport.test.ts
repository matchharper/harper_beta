import assert from "node:assert/strict";
import test from "node:test";
import { agentDailyRows } from "./daily";
import { dailyReportText, reportLink, reportPeriod } from "./dailyReport";

test("the report covers the 7 days before today, and its link opens 하루별 성능 on them", () => {
  assert.deepEqual(reportPeriod("2026-11-18"), { from: "2026-11-11", to: "2026-11-17" });
  assert.deepEqual(reportPeriod("2026-12-03"), { from: "2026-11-26", to: "2026-12-02" });
  assert.equal(reportLink("https://matchharper.com", { from: "2026-11-11", to: "2026-11-17" }),
    "https://matchharper.com/ops/gtm-plays?tab=5&open=daily&from=2026-11-11&to=2026-11-17");
});

test("the Slack table: a row per day, newest first, 합계 last, columns lined up, and the link", () => {
  const period = { from: "2026-11-11", to: "2026-11-17" };
  const { days, total } = agentDailyRows({ ...period, people: [], spend: [], runs: [] });
  const text = dailyReportText({ days, total, period, link: "https://matchharper.com/ops/gtm-plays?tab=5", agentOn: false });
  const lines = text.split("\n");
  assert.match(lines[0], /^\*#5 후보자 소싱 에이전트 · 최근 7일\* \(11\/11 수 ~ 11\/17 화\) · 에이전트 꺼짐$/);
  assert.equal(lines[1], "```");
  assert.match(lines[2], /^날짜\s+연락\s+클릭\s+가입\s+총 비용$/);
  // 7 days, newest first, then 합계.
  assert.match(lines[3], /^11\/17 화 /);
  assert.match(lines[9], /^11\/11 수 /);
  assert.match(lines[10], /^합계 /);
  assert.equal(lines[11], "```");
  assert.equal(lines[12], "<https://matchharper.com/ops/gtm-plays?tab=5|/ops 하루별 성능에서 보기>");
  // Only the outcome numbers (Shaun 11/18); every row ends at the same column (Hangul counted as two).
  assert.match(lines[3], /^11\/17 화\s+0\s+0\s+0\s+\$0\.00$/);
  const width = (line: string) => [...line].reduce((sum, char) => sum + (/[가-힣]/.test(char) ? 2 : 1), 0);
  assert.equal(new Set(lines.slice(2, 11).map(width)).size, 1);
});
