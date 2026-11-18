import assert from "node:assert/strict";
import test from "node:test";
import { appliedAtIso, applicantSignal, parseApplicants, splitRow } from "./importRows";
import {
  clampSendHours, cleanProfileUrl, exclusionReason, personKey, SEND_HOURS_LIMIT, sourceOfProfileUrl, sumCounts, withinSendHours,
  type ExclusionFacts,
} from "./people";

const now = new Date("2026-11-17T03:00:00Z");
const base: ExclusionFacts = {
  method: "signal_post", email: "a@gmail.com", signalAt: "2026-11-10T00:00:00Z", isMember: false, isSuppressed: false,
  isInternal: false, lastMailedAt: null, lastEndedAt: null, seenInRun: false,
};

test("one key per person: email first, else the profile URL", () => {
  assert.equal(personKey({ email: " A@Gmail.com ", profileUrl: "https://kr.linkedin.com/in/jane/" }), "email:a@gmail.com");
  assert.equal(personKey({ email: null, profileUrl: "https://www.linkedin.com/in/jane-doe?trk=x" }), "url:linkedin.com/in/jane-doe");
  assert.equal(cleanProfileUrl("https://kr.linkedin.com/in/jane/"), "linkedin.com/in/jane");
  assert.equal(personKey({ email: "not an email", profileUrl: "" }), null);
});

test("a search's page keys: a blog's home by its host, a forum post by the query that names it", () => {
  const page = { home: true, query: true };
  // By default (imports) unchanged: a path is needed and the query goes.
  assert.equal(cleanProfileUrl("https://jane.tistory.com/"), null);
  assert.equal(cleanProfileUrl("https://news.ycombinator.com/item?id=42"), "news.ycombinator.com/item");
  // A personal blog's home or an own site: the host.
  assert.equal(cleanProfileUrl("https://jane.tistory.com/", page), "jane.tistory.com");
  assert.equal(personKey({ profileUrl: "https://www.janedoe.dev" }, page), "url:janedoe.dev");
  // Identity in the query string: those parameters stay, sorted; tracking goes.
  assert.equal(cleanProfileUrl("https://news.ycombinator.com/item?id=42", page), "news.ycombinator.com/item?id=42");
  assert.equal(cleanProfileUrl("https://cafe.example.co.kr/board.php?wr_id=12&utm_source=x&bo_table=free#c", page),
    "cafe.example.co.kr/board.php?bo_table=free&wr_id=12");
  assert.equal(cleanProfileUrl("https://example.com/?p=12", page), "example.com/?p=12");
  assert.equal(cleanProfileUrl("https://someone.dev/posts/job-hunt?utm_source=feed", page), "someone.dev/posts/job-hunt");
  // Unknown parameters: the page cannot be told apart from the board's other posts, so no key.
  assert.equal(cleanProfileUrl("https://forum.example.com/read.cgi?k=12", page), null);
  assert.equal(cleanProfileUrl("not a url", page), null);
});

test("who is never contacted, in order", () => {
  assert.equal(exclusionReason(base, now, 90), null);
  assert.equal(exclusionReason({ ...base, seenInRun: true, isMember: true }, now, 90), "duplicate");
  assert.equal(exclusionReason({ ...base, isMember: true }, now, 90), "member");
  assert.equal(exclusionReason({ ...base, isSuppressed: true }, now, 90), "suppressed");
  assert.equal(exclusionReason({ ...base, lastMailedAt: "2026-11-01T00:00:00Z" }, now, 90), "recent_contact");
  assert.equal(exclusionReason({ ...base, lastMailedAt: "2026-10-01T00:00:00Z" }, now, 90), null);
  assert.equal(exclusionReason({ ...base, lastEndedAt: "2026-09-01T00:00:00Z" }, now, 90), "quiet_after_end");
  // The last 30 days count (Shaun 11/18); older is stale.
  assert.equal(exclusionReason({ ...base, signalAt: "2026-10-30T00:00:00Z" }, now, 90), null);
  assert.equal(exclusionReason({ ...base, signalAt: "2026-10-01T00:00:00Z" }, now, 90), "stale_signal");
  assert.equal(exclusionReason({ ...base, method: "applicant", signalAt: null }, now, 90), null);
  assert.equal(exclusionReason({ ...base, notJobSeeking: true }, now, 90), "not_job_seeking");
});

test("send hours are Korea time", () => {
  assert.equal(withinSendHours(new Date("2026-11-17T00:00:00Z"), 8, 21), true); // 09:00 KST
  assert.equal(withinSendHours(new Date("2026-11-17T12:30:00Z"), 8, 21), false); // 21:30 KST
  assert.equal(withinSendHours(new Date("2026-11-16T22:59:00Z"), 8, 21), false); // 07:59 KST
});

test("send hours never reach the night (21:00-08:00 Korea time), whatever the setting", () => {
  // A setting from before the limit (0-24, or a night window) still sends only within 8-21.
  assert.equal(withinSendHours(new Date("2026-11-16T16:00:00Z"), 0, 24), false); // 01:00 KST
  assert.equal(withinSendHours(new Date("2026-11-17T12:00:00Z"), 0, 24), false); // 21:00 KST
  assert.equal(withinSendHours(new Date("2026-11-17T11:59:00Z"), 0, 24), true); // 20:59 KST
  assert.equal(withinSendHours(new Date("2026-11-17T13:00:00Z"), 22, 6), false); // 22:00 KST
  assert.equal(withinSendHours(new Date("2026-11-16T23:00:00Z"), 0, 24), true); // 08:00 KST
  // The setting is moved inside 8-21: start 8-20, end 9-21.
  assert.deepEqual(clampSendHours(9, 21), { startHour: 9, endHour: 21 });
  assert.deepEqual(clampSendHours(0, 24), { startHour: 8, endHour: 21 });
  assert.deepEqual(clampSendHours(7, 22), { startHour: 8, endHour: 21 });
  assert.deepEqual(clampSendHours(23, 3), { startHour: 20, endHour: 9 });
  assert.deepEqual(clampSendHours(Number.NaN, Number.NaN), { startHour: 8, endHour: 21 });
  assert.deepEqual(SEND_HOURS_LIMIT, { start: 8, end: 21 });
});

test("pasted applicants: CSV or tab-separated, header by name", () => {
  assert.deepEqual(splitRow('"Doe, Jane",a@b.com,"say ""hi"""', ","), ["Doe, Jane", "a@b.com", 'say "hi"']);
  const csv = 'Name,Email,LinkedIn Profile,Headline,Job,Notes,자기소개\n"Jane Doe",Jane@Gmail.com,https://www.linkedin.com/in/jane,Backend Engineer,Senior Backend,"line1\nline2","결제 백엔드\n5년"\nNo Contact,,,x,y,z,\n';
  const parsed = parseApplicants(csv);
  assert.equal(parsed.people.length, 1);
  assert.equal(parsed.people[0].email, "jane@gmail.com");
  assert.equal(parsed.people[0].appliedJob, "Senior Backend");
  // Notes are not read; a profile column is kept as profile text.
  assert.equal(parsed.people[0].extra, "자기소개: 결제 백엔드\n5년");
  assert.equal(parsed.skipped[0].line, 3);
  const tsv = "이름\t이메일\t프로필 URL\n지수\tjisoo@naver.com\thttps://linkedin.com/in/jisoo";
  assert.equal(parseApplicants(tsv).people[0].profileUrl, "https://linkedin.com/in/jisoo");
  assert.equal(parseApplicants("foo,bar\n1,2").people.length, 0);
});

test("a profile URL's platform is where the person was found", () => {
  assert.equal(sourceOfProfileUrl("https://www.linkedin.com/in/someone"), "linkedin");
  assert.equal(sourceOfProfileUrl("https://kr.linkedin.com/in/someone"), "linkedin");
  assert.equal(sourceOfProfileUrl("https://github.com/someone"), "github");
  assert.equal(sourceOfProfileUrl("https://someone.github.io"), "github");
  assert.equal(sourceOfProfileUrl("https://twitter.com/someone"), "x");
  assert.equal(sourceOfProfileUrl("https://example.com/about"), "other");
  assert.equal(sourceOfProfileUrl(null), "other");
});

test("a run's counts add up over its ticks", () => {
  assert.deepEqual(sumCounts({ found: 6, signal_cost_linkedin: 0.12 }, { found: 1, excluded: 1, signal_cost_linkedin: 0.24 }),
    { found: 7, excluded: 1, signal_cost_linkedin: 0.36 });
});

test("an applicant's signal is when they applied (the export's Date Applied), read the same on any server", () => {
  const cases: Array<[string, string | null]> = [
    ["2026-11-15", "2026-11-15T00:00:00.000Z"],
    ["2026-11-15T12:30:00", "2026-11-15T12:30:00.000Z"],
    ["2026-11-15 12:30", "2026-11-15T12:30:00.000Z"],
    ["2026-11-15T12:30:00+09:00", "2026-11-15T03:30:00.000Z"],
    ["2026. 11. 15.", "2026-11-15T00:00:00.000Z"],
    ["2026.11.15", "2026-11-15T00:00:00.000Z"],
    ["2026/11/5", "2026-11-05T00:00:00.000Z"],
    ["2026년 11월 15일", "2026-11-15T00:00:00.000Z"],
    ["11/15/2026", "2026-11-15T00:00:00.000Z"],
    ["11/15/26, 3:05 PM", "2026-11-15T15:05:00.000Z"],
    ["Nov 15, 2026", "2026-11-15T00:00:00.000Z"],
    ["15 November 2026", "2026-11-15T00:00:00.000Z"],
    // Not a date, a day that does not exist, a bare number, the future, too old.
    ["", null], ["어제", null], ["2026-02-31", null], ["15/11/2026", null], ["46340", null], ["2026-12-01", null], ["1999-12-31", null],
  ];
  for (const [value, expected] of cases) assert.equal(appliedAtIso(value, now), expected, value);
  assert.equal(appliedAtIso(null, now), null);
  assert.deepEqual(applicantSignal({ appliedJob: " Backend  Engineer ", appliedAt: "2026-11-15" }, now), {
    signalText: "링크드인 공고 지원 시작 · Backend Engineer", signalAt: "2026-11-15T00:00:00.000Z",
  });
  assert.deepEqual(applicantSignal({ appliedJob: null, appliedAt: null }, now), { signalText: "링크드인 공고 지원 시작", signalAt: null });
});
