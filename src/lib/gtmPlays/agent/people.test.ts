import assert from "node:assert/strict";
import test from "node:test";
import { parseApplicants, splitRow } from "./importRows";
import { cleanProfileUrl, exclusionReason, personKey, sourceOfProfileUrl, sumCounts, withinSendHours, type ExclusionFacts } from "./people";

const now = new Date("2026-11-17T03:00:00Z");
const base: ExclusionFacts = {
  method: "signal", email: "a@gmail.com", signalAt: "2026-11-10T00:00:00Z", isMember: false, isSuppressed: false,
  isInternal: false, lastMailedAt: null, lastEndedAt: null, seenInRun: false,
};

test("one key per person: email first, else the profile URL", () => {
  assert.equal(personKey({ email: " A@Gmail.com ", profileUrl: "https://kr.linkedin.com/in/jane/" }), "email:a@gmail.com");
  assert.equal(personKey({ email: null, profileUrl: "https://www.linkedin.com/in/jane-doe?trk=x" }), "url:linkedin.com/in/jane-doe");
  assert.equal(cleanProfileUrl("https://kr.linkedin.com/in/jane/"), "linkedin.com/in/jane");
  assert.equal(personKey({ email: "not an email", profileUrl: "" }), null);
});

test("who is never contacted, in order", () => {
  assert.equal(exclusionReason(base, now, 90), null);
  assert.equal(exclusionReason({ ...base, seenInRun: true, isMember: true }, now, 90), "duplicate");
  assert.equal(exclusionReason({ ...base, isMember: true }, now, 90), "member");
  assert.equal(exclusionReason({ ...base, isSuppressed: true }, now, 90), "suppressed");
  assert.equal(exclusionReason({ ...base, lastMailedAt: "2026-11-01T00:00:00Z" }, now, 90), "recent_contact");
  assert.equal(exclusionReason({ ...base, lastMailedAt: "2026-10-01T00:00:00Z" }, now, 90), null);
  assert.equal(exclusionReason({ ...base, lastEndedAt: "2026-09-01T00:00:00Z" }, now, 90), "quiet_after_end");
  assert.equal(exclusionReason({ ...base, signalAt: "2026-10-30T00:00:00Z" }, now, 90), "stale_signal");
  assert.equal(exclusionReason({ ...base, method: "applicant", signalAt: null }, now, 90), null);
  assert.equal(exclusionReason({ ...base, notJobSeeking: true }, now, 90), "not_job_seeking");
});

test("send hours are Korea time", () => {
  assert.equal(withinSendHours(new Date("2026-11-17T00:00:00Z"), 8, 21), true); // 09:00 KST
  assert.equal(withinSendHours(new Date("2026-11-17T12:30:00Z"), 8, 21), false); // 21:30 KST
  assert.equal(withinSendHours(new Date("2026-11-16T22:59:00Z"), 8, 21), false); // 07:59 KST
});

test("pasted applicants: CSV or tab-separated, header by name", () => {
  assert.deepEqual(splitRow('"Doe, Jane",a@b.com,"say ""hi"""', ","), ["Doe, Jane", "a@b.com", 'say "hi"']);
  const csv = 'Name,Email,LinkedIn Profile,Headline,Job,Notes\n"Jane Doe",Jane@Gmail.com,https://www.linkedin.com/in/jane,Backend Engineer,Senior Backend,"line1\nline2"\nNo Contact,,,x,y,z\n';
  const parsed = parseApplicants(csv);
  assert.equal(parsed.people.length, 1);
  assert.equal(parsed.people[0].email, "jane@gmail.com");
  assert.equal(parsed.people[0].appliedJob, "Senior Backend");
  assert.equal(parsed.people[0].extra, "Notes: line1\nline2");
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
