/** The job-page request's rules (agent/request.ts) and what they change in the shared agent rules. Synthetic data only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelOf, defaultChannelSettings, normalizeChannelSettings } from "./channels";
import { exclusionReason } from "./people";
import { agentMailableAddress } from "./mailRules";
import { renderAgentMail } from "./render";
import {
  REQUEST_RECHECK_DAYS, cleanRequestFacts, mailDomainSuggestion, newRequestRow, nextKstDay, requestAfterCheck, requestContentCleared,
  requestContextLine, requestEmail, requestError, requestExclusionReason, requestFollowupAllowed, requestLinkedin, requestMailFacts,
  requestRateLimit, requestRecheckAt, requestSendAt, type RequestSeed,
} from "./request";
import { requestPostingsToMail } from "./review";
import type { AgentJobPageRequest, AgentPosting } from "./types";

const NOW = new Date("2026-11-24T05:00:00.000Z"); // 14:00 Korea time
const DAY_MS = 86_400_000;

const SEED: RequestSeed = {
  officialJobId: "job-1", slug: "backend-engineer", roleId: "11111111-1111-4111-8111-111111111111", kind: "role", companyName: "회사A",
  roleTitle: "백엔드 개발자", seniority: "Senior", location: "Seoul", description: "결제 백엔드를 만들어요. ![logo](https://img.example/x.png)",
};

const row = (patch: Partial<Parameters<typeof newRequestRow>[0]> = {}) => newRequestRow({
  email: "jane@example.com", linkedinUrl: null, cvText: null, seed: SEED, locale: "ko", ipHash: "ip", lid: null, now: NOW, ...patch,
});

test("a request's row is keyed by the address they typed, with a CV or a LinkedIn URL alike", () => {
  const cv = row({ cvText: "  Jane Doe   Backend engineer, 6 years of payments. ".repeat(10) });
  const linkedin = row({ linkedinUrl: "https://www.linkedin.com/in/jane-doe" });
  assert.equal(cv.personKey, "email:jane@example.com");
  assert.equal(linkedin.personKey, "email:jane@example.com");
  assert.equal(cv.request.material, "cv");
  assert.equal(linkedin.request.material, "linkedin");
  assert.equal(linkedin.profileUrl, "https://www.linkedin.com/in/jane-doe");
  assert.equal(linkedin.profileText, null);
  assert.match(cv.profileText ?? "", /Their CV/);
  assert.equal(cv.request.checks, 0);
  assert.equal(cv.isTest, false);
  assert.equal(row({ email: "staff@matchharper.com" }).isTest, true);
  // The posting as the signal: when and what, then its own text without images.
  assert.match(cv.signalText, /^Asked Harper on 2026-11-24 for roles similar to: 회사A · 백엔드 개발자 · Senior · Seoul\n결제 백엔드를 만들어요\./);
  assert.doesNotMatch(cv.signalText, /img\.example/);
  assert.ok(!("description" in cv.request));
});

test("rate limits: 1 in 10 minutes and 3 a day per address, 20 an hour per IP (counts include the request itself)", () => {
  assert.equal(requestRateLimit({ email10m: 1, emailDay: 3, ip1h: 20 }), null);
  assert.equal(requestRateLimit({ email10m: 2, emailDay: 2, ip1h: 2 }), "email_recent");
  assert.equal(requestRateLimit({ email10m: 1, emailDay: 4, ip1h: 2 }), "email_daily");
  assert.equal(requestRateLimit({ email10m: 1, emailDay: 1, ip1h: 21 }), "ip");
});

test("the form's address: a real form, a possible mailbox, a common domain not mistyped", () => {
  assert.deepEqual(requestEmail(" Jane@Example.com ", "ko"), { ok: true, email: "jane@example.com" });
  assert.equal(requestEmail("not-an-address", "en").ok, false);
  const typo = requestEmail("jane@gmial.com", "ko");
  assert.equal(typo.ok, false);
  assert.match(typo.ok ? "" : typo.error, /gmail\.com/);
  assert.equal(mailDomainSuggestion("jane@naver.con"), "naver.com");
  assert.equal(mailDomainSuggestion("jane@mail.com"), null);
  assert.equal(mailDomainSuggestion("jane@example.com"), null);
});

test("the form's messages name the CV before LinkedIn, as the rest of the page does", () => {
  assert.equal(requestError("MATERIAL_REQUIRED", "ko"), "이력서나 LinkedIn 주소 중 하나를 넣어 주세요.");
  assert.equal(requestError("MATERIAL_REQUIRED", "en"), "Add a CV or your LinkedIn URL.");
});

test("the LinkedIn field: a profile URL as kept, empty when none, refused when not a profile", () => {
  assert.equal(requestLinkedin("linkedin.com/in/jane-doe/?trk=x"), "https://www.linkedin.com/in/jane-doe");
  assert.equal(requestLinkedin("   "), "");
  assert.equal(requestLinkedin("https://www.linkedin.com/company/acme"), null);
});

test("the mail goes right away at any hour (REQUEST_SEND_HOURS null); with hours, a night request waits for the start", () => {
  const night = new Date("2026-11-24T15:30:00.000Z"); // 00:30 Korea time
  assert.equal(requestSendAt(night).toISOString(), night.toISOString());
  assert.equal(requestSendAt(night, { start: 8, end: 21 }).toISOString(), "2026-11-24T23:00:00.000Z");
  assert.equal(requestSendAt(NOW, { start: 8, end: 21 }).toISOString(), NOW.toISOString());
  assert.equal(requestSendAt(new Date("2026-11-24T13:00:00.000Z"), { start: 8, end: 21 }).toISOString(), "2026-11-24T23:00:00.000Z");
});

test("nothing to send: looked at again in 14 days, the check counted apart from attempts", () => {
  assert.equal(REQUEST_RECHECK_DAYS, 14);
  assert.equal(requestRecheckAt(NOW).getTime() - NOW.getTime(), 14 * DAY_MS);
  const request = row().request;
  const once = requestAfterCheck(request, NOW);
  const twice = requestAfterCheck(once, new Date(NOW.getTime() + 14 * DAY_MS));
  assert.equal(once.checks, 1);
  assert.equal(twice.checks, 2);
  assert.equal(twice.lastCheckedAt, "2026-12-08T05:00:00.000Z");
  assert.equal(nextKstDay(NOW).toISOString(), "2026-11-24T15:00:00.000Z");
});

test("an opt-out clears the CV's or profile's text and what was read from it, and keeps the address", () => {
  const request = row().request;
  const cleared = requestContentCleared(request, NOW);
  assert.deepEqual({ ...cleared, request: undefined }, { profileText: null, headline: null, currentCompany: null, location: null, request: undefined });
  assert.equal(cleared.request?.clearedAt, NOW.toISOString());
  assert.equal(cleared.request?.slug, "backend-engineer");
  assert.ok(!("email" in cleared));
  assert.ok(!("request" in requestContentCleared(null, NOW)));
});

test("the follow-up goes only after a click on the first mail (or a reply)", () => {
  assert.equal(requestFollowupAllowed({ clicked: false, replied: false }), false);
  assert.equal(requestFollowupAllowed({ clicked: true, replied: false }), true);
  assert.equal(requestFollowupAllowed({ clicked: false, replied: true }), true);
});

test("a request keeps only the rules about the person: Harper's own address, the opt-out list, a member", () => {
  const base = { email: "jane@example.com", signalAt: new Date(NOW.getTime() - 60 * DAY_MS).toISOString(), isMember: false, isSuppressed: false, isInternal: false };
  assert.equal(requestExclusionReason(base, NOW), null, "a 60-day-old request is not a stale signal");
  assert.equal(requestExclusionReason({ ...base, isMember: true }, NOW), "member");
  assert.equal(requestExclusionReason({ ...base, isSuppressed: true }, NOW), "suppressed");
  assert.equal(requestExclusionReason({ ...base, isInternal: true }, NOW), "internal");
  assert.equal(requestExclusionReason({ ...base, isBlockedCompany: true }, NOW), "blocked_company", "Ops' blocked domains stop a request too");
  // The shared rule itself: a request's signal never goes stale; a searched post's does.
  const facts = { ...base, lastMailedAt: null, lastEndedAt: null, seenInRun: false };
  assert.equal(exclusionReason({ ...facts, method: "request" }, NOW, 90), null);
  assert.equal(exclusionReason({ ...facts, method: "signal_post" }, NOW, 90), "stale_signal");
});

test("the request channel: its own, on by default with 30 a day", () => {
  assert.equal(channelOf({ method: "request", source: "harper_jobs", intent: null }), "request");
  assert.deepEqual(defaultChannelSettings().request, { enabled: true, dailyMax: 30 });
  assert.deepEqual(normalizeChannelSettings({ request: { enabled: false, dailyMax: 5 } }).settings.request, { enabled: false, dailyMax: 5 });
  assert.deepEqual(normalizeChannelSettings({}).settings.request, { enabled: true, dailyMax: 30 });
});

test("an address they typed themselves is mailable on any domain, never an impossible mailbox", () => {
  assert.equal(agentMailableAddress("jane@company-a.example", "self", [], []), true);
  assert.equal(agentMailableAddress("jane@company-a.example", "post", [], []), false);
  assert.equal(agentMailableAddress("jane_doe@gmail.com", "self", [], []), false);
});

const posting = (index: number, grade: "good" | "unsure" | "poor"): AgentPosting => ({
  kind: "external", roleId: null, url: `https://jobs.example/${index}`, companyName: `회사${index}`, title: "Backend Engineer", location: "Seoul",
  why: "결제 경험이 맞아요", review: { grade, reason: "", at: NOW.toISOString() },
} as AgentPosting);

test("the grader's gate for a request: 잘 맞음 first, filled to 3 with 애매, never 안 맞음", () => {
  const { kept, dropped } = requestPostingsToMail([posting(1, "unsure"), posting(2, "poor"), posting(3, "good"), posting(4, "unsure"), posting(5, "unsure")], 3);
  assert.deepEqual(kept.map((item) => item.companyName), ["회사3", "회사1", "회사4"]);
  assert.deepEqual(dropped.map((item) => item.companyName), ["회사2", "회사5"]);
  assert.deepEqual(requestPostingsToMail([posting(1, "poor")], 3).kept, []);
});

const requested = (patch: Partial<AgentJobPageRequest> = {}): AgentJobPageRequest => ({ ...row().request, ...patch });

test("what the mail says around its postings: the seed, what they gave, and the late line only after a check found nothing", () => {
  const createdAt = NOW.toISOString();
  const cv = requestMailFacts({ request: requested({ material: "cv" }), createdAt, language: "ko", profileText: "x" });
  assert.deepEqual(cv, { seed: { company: "회사A", title: "백엔드 개발자" }, material: "cv", lateDay: null });
  const unread = requestMailFacts({ request: requested({ material: "linkedin", readFailed: true }), createdAt, language: "ko", profileText: null });
  assert.equal(unread.material, "posting");
  const late = requestMailFacts({
    request: requested({ material: "linkedin", mailCompany: "Company A", mailTitle: "Backend Engineer", checks: 1 }), createdAt, language: "en", profileText: "x",
  });
  assert.deepEqual(late, { seed: { company: "Company A", title: "Backend Engineer" }, material: "linkedin", lateDay: "November 24" });
  assert.equal(requestMailFacts({ request: requested({ checks: 2 }), createdAt, language: "ko", profileText: "x" }).lateDay, "11월 24일");
  // A first pass that only waited (agent off, sender, cost) says "요청해 주셔서", not "새로 열려서".
  assert.equal(requestMailFacts({ request: requested({ checks: 0 }), createdAt, language: "ko", profileText: "x" }).lateDay, null);
});

test("the request mail in Korean and English: the asked or late line, the postings, the opt-out for a mail they may not have asked for", () => {
  const postings = [posting(1, "good"), posting(2, "unsure")];
  const base = {
    subject: "제목", body: "", name: "Jane", harperUrl: "https://harper.example/jobs/invite/m1", postings, senderName: "Ashley Kim",
    senderEmail: "ashley@harper.example", unsubscribeUrl: "https://harper.example/u/m1", offer: "posting" as const,
  };
  const ko = renderAgentMail({ ...base, language: "ko", request: { seed: { company: "회사A", title: "백엔드 개발자" }, material: "cv", lateDay: null } });
  assert.match(ko.text, /Harper에서 보신 회사A · 백엔드 개발자 공고에서 비슷한 공고를 요청해 주셔서 메일 드려요\. 남겨 주신 이력서를 보고 잘 맞을 만한 두 팀을 골랐어요\./);
  assert.match(ko.text, /회사1/);
  assert.match(ko.text, /요청하지 않으셨거나/);
  const lateKo = renderAgentMail({ ...base, language: "ko", request: { seed: { company: "회사A", title: "백엔드 개발자" }, material: "linkedin", lateDay: "11월 24일" } });
  assert.match(lateKo.text, /11월 24일에 요청하신 회사A · 백엔드 개발자 공고와 비슷한 공고가 새로 열려서 메일 드려요\. 남겨 주신 LinkedIn 프로필을 보고/);
  const en = renderAgentMail({ ...base, language: "en", request: { seed: { company: "Company A", title: "Backend Engineer" }, material: "posting", lateDay: "November 24" } });
  assert.match(en.text, /On November 24 you asked for roles like Backend Engineer at Company A; similar ones have opened, so here they are\. I picked these two teams with roles like that one\./);
  assert.match(en.text, /If you didn't ask for this/);
  // A cold mail is as before: no request line.
  const cold = renderAgentMail({ ...base, language: "ko" });
  assert.doesNotMatch(cold.text, /요청/);
});

test("the facts step's answer as kept, and how Ashley learns they asked", () => {
  const facts = cleanRequestFacts({ name: " Jane Doe ", headline: "Backend Engineer at https://acme.example", currentCompany: "Company B", location: "", seedCompanyEn: "Company A", seedTitleEn: "Backend Engineer" }, false);
  assert.equal(facts.name, "Jane Doe");
  assert.doesNotMatch(facts.headline, /https?:/);
  assert.equal(facts.seedCompanyEn, "", "English names only for an English mail");
  assert.deepEqual(cleanRequestFacts("nonsense", true), { name: "", headline: "", currentCompany: "", location: "", seedCompanyEn: "", seedTitleEn: "" });
  assert.equal(requestContextLine(requested()),
    "They asked for this mail on Harper's job page (roles similar to 회사A · 백엔드 개발자, on 2026-11-24) and typed this address themselves.");
  assert.equal(requestContextLine(null), null);
});
