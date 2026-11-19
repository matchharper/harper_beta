import assert from "node:assert/strict";
import test from "node:test";
import { formatCompanySignals, formatSignalSources, parseFoundSignals, signalsDue, SIGNAL_RECHECK_DAYS, type CompanySignals } from "./signals";

const company = { companyId: "w1", name: "Orbit", website: "https://orbit.example", linkedinUrl: null };
const signals = (patch: Partial<CompanySignals>): CompanySignals => ({ ...company, checkedAt: null, total: 0, items: [], ...patch });

test("signals read as one dated line, latest first, with the date of the last check", () => {
  assert.equal(formatCompanySignals(undefined), "");
  // Never checked and nothing on record: nothing to say.
  assert.equal(formatCompanySignals(signals({})), "");
  assert.equal(formatCompanySignals(signals({ checkedAt: "2026-11-19T01:30:00+00:00" })), "no public hiring signal found as of 2026-11-19");
  assert.equal(formatCompanySignals(signals({
    checkedAt: "2026-11-18T23:30:00Z", total: 5,
    items: [
      { date: "2026-11-03", content: "Building an applied AI team\n in Seoul.", url: "https://www.linkedin.com/posts/orbit-1" },
      { date: "2026-10-09", content: "Began hiring engineers in Korea.", url: "https://news.example/a" },
      { date: null, content: "Opened an office.", url: null },
    ],
  })), "hiring signals as of 2026-11-19: 2026-11-03 Building an applied AI team in Seoul. (linkedin.com); " +
    "2026-10-09 Began hiring engineers in Korea. (news.example); undated Opened an office.; +2 earlier");
  // Written by the agent on a company that was never checked: the signals without a check date.
  assert.equal(formatCompanySignals(signals({ total: 1, items: [{ date: "2026-09-01", content: "Raised a Series B to grow the team.", url: null }] })),
    "hiring signals: 2026-09-01 Raised a Series B to grow the team.");
});

test("the agent's line says how long ago each signal was; the evaluator's line keeps absolute dates", () => {
  const dated = signals({ checkedAt: "2026-11-10T03:00:00Z", total: 2, items: [
    { date: "2026-11-03", content: "Building an applied AI team in Seoul.", url: "https://www.linkedin.com/posts/orbit-1" },
    { date: "2026-08-20", content: "Raised a Series B.", url: "https://news.example/b" },
  ] });
  assert.equal(formatCompanySignals(dated, { now: new Date("2026-11-19T12:14:00Z") }),
    "hiring signals as of 2026-11-10: 2026-11-03 (2 weeks ago) Building an applied AI team in Seoul. (linkedin.com); " +
    "2026-08-20 (3 months ago) Raised a Series B. (news.example)");
  assert.equal(formatCompanySignals(dated),
    "hiring signals as of 2026-11-10: 2026-11-03 Building an applied AI team in Seoul. (linkedin.com); 2026-08-20 Raised a Series B. (news.example)");
});

test("a company is due a check when never checked or checked longer ago than the recheck period", () => {
  const now = Date.parse("2026-11-19T00:00:00Z"), day = 86_400_000;
  assert.equal(signalsDue(undefined, now), true);
  assert.equal(signalsDue({ checkedAt: null }, now), true);
  assert.equal(signalsDue({ checkedAt: new Date(now - (SIGNAL_RECHECK_DAYS - 1) * day).toISOString() }, now), false);
  assert.equal(signalsDue({ checkedAt: new Date(now - (SIGNAL_RECHECK_DAYS + 1) * day).toISOString() }, now), true);
});

test("found signals keep one listed result each, with a real date that is not in the future", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  assert.deepEqual(parseFoundSignals({ signals: [
    { result: 1, date: "2026-11-03", content: " Hiring  engineers. " },
    { result: 1, date: "2026-11-04", content: "A second record for the same page." },
    { result: 2, date: "2026-02-30", content: "Not a calendar date." },
    { result: 3, date: "2026-12-25", content: "After today." },
    { result: 4, date: "Nov 3", content: "Not a date." },
    { result: 9, date: "2026-11-01", content: "No such result." },
    { result: 5, date: "2026-11-19", content: "" },
    { result: 6, date: "2026-11-19", content: "Published today." },
  ] }, 6, now), [
    { result: 1, date: "2026-11-03", content: "Hiring engineers." },
    { result: 6, date: "2026-11-19", content: "Published today." },
  ]);
  assert.deepEqual(parseFoundSignals({ nothing: true }, 3, now), []);
});

test("the extractor reads each result with its number, date, source and excerpt", () => {
  assert.equal(formatSignalSources({ name: "Orbit", website: "https://orbit.example", linkedinUrl: null }, [
    { number: 1, title: "We are hiring in Seoul", url: "https://www.linkedin.com/posts/orbit-1", publishedDate: "2026-11-03T02:00:00.000Z",
      highlights: ["Join our\nSeoul team."] },
    { number: 2, title: "Orbit enters Korea", url: "https://news.example/a", highlights: [] },
  ]), [
    "Company: Orbit · https://orbit.example",
    "",
    "[1] published 2026-11-03 · We are hiring in Seoul\nhttps://www.linkedin.com/posts/orbit-1\nJoin our Seoul team.",
    "",
    "[2] publication date not given · Orbit enters Korea\nhttps://news.example/a",
  ].join("\n"));
});
