import assert from "node:assert/strict";
import test from "node:test";
import {
  gmailSpamDayLine, gmailSpamLine, isScopeNotAllowed, nextPageToken, parseOverallSpamRate, parseSpamRates, POSTMASTER_DAYS,
  readSpam, SCOPE_NOT_ALLOWED, setupStepMissing, spamPercent, spamRateQuery, spamRateRange, type GmailSpam,
} from "./postmaster";


const NOW = new Date("2026-11-22T05:00:00.000Z");

test("query: SPAM_RATE per day for the last 14 days, ending yesterday (UTC)", () => {
  const body = spamRateQuery(spamRateRange(NOW)!);
  assert.deepEqual(body.metricDefinitions, [{ name: "spam", baseMetric: { standardMetric: "SPAM_RATE" } }]);
  assert.equal(body.aggregationGranularity, "DAILY");
  assert.deepEqual(body.timeQuery.dateRanges.dateRanges[0], {
    start: { year: 2026, month: 11, day: 22 - POSTMASTER_DAYS }, end: { year: 2026, month: 11, day: 21 },
  });
  assert.equal("pageToken" in body, false);
});

test("query: a period's days, its end kept at yesterday; OVERALL for the whole period; nothing left for today only", () => {
  const range = spamRateRange(NOW, { from: "2026-10-24", to: "2026-11-22" })!;
  const body = spamRateQuery(range, { granularity: "OVERALL" });
  assert.equal(body.aggregationGranularity, "OVERALL");
  assert.deepEqual(body.timeQuery.dateRanges.dateRanges[0], { start: { year: 2026, month: 10, day: 24 }, end: { year: 2026, month: 11, day: 21 } });
  assert.deepEqual(spamRateQuery(range, { pageToken: "next" }).pageToken, "next");
  assert.deepEqual(spamRateRange(NOW, { from: "2026-11-01", to: "2026-11-10" })?.end.toISOString().slice(0, 10), "2026-11-10");
  assert.equal(spamRateRange(NOW, { from: "2026-11-22", to: "2026-11-22" }), null);
});

test("parse: the OVERALL rate and the next page", () => {
  assert.equal(parseOverallSpamRate({ domainStats: [{ metric: "spam", value: { doubleValue: 0.0007 } }] }), 0.0007);
  assert.equal(parseOverallSpamRate({ domainStats: [{ metric: "spam", value: {} }] }), null);
  assert.equal(parseOverallSpamRate(null), null);
  assert.equal(nextPageToken({ nextPageToken: "abc" }), "abc");
  assert.equal(nextPageToken({ nextPageToken: "" }), null);
});

test("parse: days oldest first; a day without a number is left out (it is not 0%)", () => {
  const days = parseSpamRates({ domainStats: [
    { metric: "spam", date: { year: 2026, month: 11, day: 20 }, value: { doubleValue: 0.0004 } },
    { metric: "spam", date: { year: 2026, month: 11, day: 9 }, value: { doubleValue: 0 } },
    { metric: "spam", date: { year: 2026, month: 11, day: 19 }, value: {} },
    { metric: "other", date: { year: 2026, month: 11, day: 18 }, value: { doubleValue: 0.5 } },
  ] });
  assert.deepEqual(days, [{ day: "2026-11-09", rate: 0 }, { day: "2026-11-20", rate: 0.0004 }]);
  assert.deepEqual(parseSpamRates({}), []);
  assert.deepEqual(parseSpamRates(null), []);
});

test("setup errors say which step is missing; other errors are not setup", () => {
  assert.match(setupStepMissing(403, { error: { status: "PERMISSION_DENIED", message: "Gmail Postmaster Tools API has not been used in project 1 before or it is disabled.", details: [{ reason: "SERVICE_DISABLED" }] } }) ?? "", /API를 켜야/);
  assert.match(setupStepMissing(403, { error: { status: "PERMISSION_DENIED", message: "denied" } }) ?? "", /도메인 확인/);
  assert.match(setupStepMissing(404, { error: { status: "NOT_FOUND" } }) ?? "", /등록되지 않았/);
  assert.equal(setupStepMissing(500, { error: { status: "INTERNAL" } }), null);
  assert.equal(isScopeNotAllowed(new Error("unauthorized_client: Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested.")), true);
  assert.equal(isScopeNotAllowed(new Error("socket hang up")), false);
});

test("the /ops line without a period: the latest day's rate, red from 0.1%; no number, a missing step and a failed read each say so", () => {
  const ok = gmailSpamLine({ status: "ok", domain: "matchharper.com", days: [{ day: "2026-11-19", rate: 0 }, { day: "2026-11-20", rate: 0.0004 }] });
  assert.deepEqual(ok, { text: "Gmail 스팸 0.04% · 11/20", title: "11/20 하루 값이에요 (누적 아님). Gmail 받은편지함에 들어간 우리 도메인 메일 중 스팸 신고 비율이에요. 보낸 날 기준이고 하퍼 서비스 메일도 포함돼요. 최근 7일: 11/19 0.00% · 11/20 0.04%", alert: false });
  assert.equal(gmailSpamLine({ status: "ok", domain: "matchharper.com", days: [{ day: "2026-11-20", rate: 0.001 }] })?.alert, true);
  assert.match(gmailSpamLine({ status: "ok", domain: "matchharper.com", days: [] })?.text ?? "", /숫자 없음/);
  assert.deepEqual(gmailSpamLine({ status: "setup", domain: "matchharper.com", reason: SCOPE_NOT_ALLOWED }), { text: "Gmail 스팸 연결 전", title: SCOPE_NOT_ALLOWED, alert: false });
  assert.equal(gmailSpamLine({ status: "error", domain: "matchharper.com", reason: "timeout" })?.text, "Gmail 스팸 못 읽음");
  assert.equal(gmailSpamLine(null), null);
  assert.equal(spamPercent(0.0031), "0.31%");
});

const PERIOD = { from: "2026-10-24", to: "2026-11-22", label: "최근 30일" };
const spamOf = (rate: number | null, days: Array<[string, number]>): GmailSpam =>
  ({ status: "ok", domain: "matchharper.com", days: days.map(([day, value]) => ({ day, rate: value })), period: { ...PERIOD, rate } });

test("the 합계 line with a period: the period's rate and its name; red when the period or any one day reached 0.1%", () => {
  const calm = gmailSpamLine(spamOf(0.0002, [["2026-11-20", 0], ["2026-11-21", 0.0004]]));
  assert.equal(calm?.text, "Gmail 스팸 0.02% · 최근 30일");
  assert.equal(calm?.alert, false);
  assert.match(calm?.title ?? "", /^최근 30일을 합친 값이에요\. Gmail은 하루씩 따로 판단해서/);
  assert.match(calm?.title ?? "", /가장 높았던 날: 11\/21 0\.04%/);
  assert.match(calm?.title ?? "", /최근 7일: 11\/20 0\.00% · 11\/21 0\.04%$/);
  // One bad day hidden in a low period rate still turns it red (Gmail judges each day).
  assert.equal(gmailSpamLine(spamOf(0.0003, [["2026-11-20", 0], ["2026-11-21", 0.005]]))?.alert, true);
  assert.equal(gmailSpamLine(spamOf(0.0012, []))?.alert, true);
  // No period rate (Google gave none, or the read failed): the newest day, as before.
  const fallback = gmailSpamLine(spamOf(null, [["2026-11-21", 0]]));
  assert.equal(fallback?.text, "Gmail 스팸 0.00% · 11/21");
  assert.match(fallback?.title ?? "", /^11\/21 하루 값이에요 \(누적 아님\)/);
  assert.match(gmailSpamLine(spamOf(null, []))?.title ?? "", /최근 30일 Google이 준 숫자가 없어요/);
});

test("a 날짜 row's line: that day's rate, nothing when Google gave none for it", () => {
  const spam = spamOf(0.0002, [["2026-11-20", 0], ["2026-11-21", 0.0011]]);
  assert.deepEqual(gmailSpamDayLine(spam, "2026-11-20"), {
    text: "Gmail 스팸 0.00%",
    title: "11/20 하루 값이에요. Gmail 받은편지함에 들어간 우리 도메인 메일 중 스팸 신고 비율이에요. 보낸 날 기준이고 하퍼 서비스 메일도 포함돼요. 이 줄의 다른 숫자는 이날 찾은 사람 기준이라, 세는 메일이 달라요.",
    alert: false,
  });
  assert.equal(gmailSpamDayLine(spam, "2026-11-21")?.alert, true);
  assert.equal(gmailSpamDayLine(spam, "2026-11-22"), null);
  assert.equal(gmailSpamDayLine({ status: "setup", domain: "matchharper.com", reason: SCOPE_NOT_ALLOWED }, "2026-11-20"), null);
  assert.equal(gmailSpamDayLine(null, "2026-11-20"), null);
});

test("reads: days over two pages and the period's rate side by side; a failed OVERALL read leaves the rate empty", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const day = (d: number, rate: number) => ({ metric: "spam", date: { year: 2026, month: 11, day: d }, value: { doubleValue: rate } });
  const ok = await readSpam(async (body) => {
    const b = body as Record<string, unknown>;
    bodies.push(b);
    if (b.aggregationGranularity === "OVERALL") return { ok: true, body: { domainStats: [{ metric: "spam", value: { doubleValue: 0.0001 } }] } };
    return b.pageToken
      ? { ok: true, body: { domainStats: [day(21, 0)] } }
      : { ok: true, body: { domainStats: [day(20, 0.0002)], nextPageToken: "p2" } };
  }, "matchharper.com", PERIOD, NOW);
  assert.deepEqual(ok, { status: "ok", domain: "matchharper.com", days: [{ day: "2026-11-20", rate: 0.0002 }, { day: "2026-11-21", rate: 0 }], period: { ...PERIOD, rate: 0.0001 } });
  assert.equal(bodies.length, 3);
  const overallFailed = await readSpam(async (body) => ((body as Record<string, unknown>).aggregationGranularity === "OVERALL"
    ? { ok: false, status: 400, body: { error: { status: "INVALID_ARGUMENT" } } }
    : { ok: true, body: { domainStats: [day(21, 0)] } }), "matchharper.com", PERIOD, NOW);
  assert.equal(overallFailed.status === "ok" && overallFailed.period?.rate, null);
  const setup = await readSpam(async () => ({ ok: false, status: 404, body: { error: { status: "NOT_FOUND" } } }), "matchharper.com", PERIOD, NOW);
  assert.equal(setup.status, "setup");
  const todayOnly = await readSpam(async () => { throw new Error("not called"); }, "matchharper.com", { from: "2026-11-22", to: "2026-11-22", label: "오늘" }, NOW);
  assert.deepEqual(todayOnly, { status: "ok", domain: "matchharper.com", days: [], period: { from: "2026-11-22", to: "2026-11-22", label: "오늘", rate: null } });
});
