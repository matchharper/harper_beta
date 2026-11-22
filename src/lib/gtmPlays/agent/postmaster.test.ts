import assert from "node:assert/strict";
import test from "node:test";
import {
  gmailSpamLine, isScopeNotAllowed, parseSpamRates, POSTMASTER_DAYS, SCOPE_NOT_ALLOWED, setupStepMissing, spamPercent, spamRateQuery,
} from "./postmaster";

const NOW = new Date("2026-11-22T05:00:00.000Z");

test("query: SPAM_RATE per day for the last 14 days, ending yesterday (UTC)", () => {
  const body = spamRateQuery(NOW);
  assert.deepEqual(body.metricDefinitions, [{ name: "spam", baseMetric: { standardMetric: "SPAM_RATE" } }]);
  assert.equal(body.aggregationGranularity, "DAILY");
  assert.deepEqual(body.timeQuery.dateRanges.dateRanges[0], {
    start: { year: 2026, month: 11, day: 22 - POSTMASTER_DAYS }, end: { year: 2026, month: 11, day: 21 },
  });
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

test("the /ops line: the latest day's rate, red from 0.1%; no number, a missing step and a failed read each say so", () => {
  const ok = gmailSpamLine({ status: "ok", domain: "matchharper.com", days: [{ day: "2026-11-19", rate: 0 }, { day: "2026-11-20", rate: 0.0004 }] });
  assert.deepEqual(ok, { text: "Gmail 스팸 0.04% · 11/20", title: "11/19 0.00% · 11/20 0.04%", alert: false });
  assert.equal(gmailSpamLine({ status: "ok", domain: "matchharper.com", days: [{ day: "2026-11-20", rate: 0.001 }] })?.alert, true);
  assert.match(gmailSpamLine({ status: "ok", domain: "matchharper.com", days: [] })?.text ?? "", /숫자 없음/);
  assert.deepEqual(gmailSpamLine({ status: "setup", domain: "matchharper.com", reason: SCOPE_NOT_ALLOWED }), { text: "Gmail 스팸 연결 전", title: SCOPE_NOT_ALLOWED, alert: false });
  assert.equal(gmailSpamLine({ status: "error", domain: "matchharper.com", reason: "timeout" })?.text, "Gmail 스팸 못 읽음");
  assert.equal(gmailSpamLine(null), null);
  assert.equal(spamPercent(0.0031), "0.31%");
});
