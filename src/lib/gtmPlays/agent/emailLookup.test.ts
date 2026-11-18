import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_LOOKUP_ESTIMATE_USD, EMAIL_LOOKUP_SCHEMA, EMAIL_LOOKUP_SYSTEM_PROMPT, emailLookupQuery, emptyLookup,
  lookupOrgNames, lookupRunCostUsd, lookupSourceProblem, lookupTimedOut, needsEmailLookup, noEmailReason, parseLookupOutput,
  settleEmailLookup, verifyLookup, type EmailLookupDone,
} from "./emailLookup";
import type { AgentEmailLookup } from "./types";

const person = {
  name: "Jane Doe", profileUrl: "https://www.linkedin.com/in/jane-doe-000", contactUrl: null as string | null,
  headline: "Backend Engineer at Acme Labs | Seoul", currentCompany: "Acme", location: "Seoul",
};

test("the query names the person, their pages and current work; missing parts are '-'", () => {
  const query = emailLookupQuery(person);
  assert.match(query, /^Person: Jane Doe$/m);
  assert.match(query, /^Profile: https:\/\/www\.linkedin\.com\/in\/jane-doe-000$/m);
  assert.match(query, /^Own link: -$/m);
  assert.match(query, /^Current: Backend Engineer at Acme Labs \| Seoul at Acme$/m);
  assert.match(emailLookupQuery({ ...person, name: null, headline: "  ", currentCompany: null }), /^Person: -$/m);
  // The person's background from their own page goes in (cut), so the run can tell them from namesakes.
  assert.match(query, /^Background \(from their own page; employers, schools, projects\): -$/m);
  const withPage = emailLookupQuery({ ...person, profileText: "Backend engineer.\n\nBuilt the payments ledger at Example Pay (2019-2024). B.S. Example University. " + "x".repeat(3000) });
  assert.match(withPage, /^Background \(from their own page; employers, schools, projects\): Backend engineer\. Built the payments ledger at Example Pay/m);
  assert.ok(withPage.length < 2_000);
  assert.match(EMAIL_LOOKUP_SYSTEM_PROMPT, /Never invent or pattern-guess/);
  assert.match(EMAIL_LOOKUP_SYSTEM_PROMPT, /GitHub/);
  assert.deepEqual([...EMAIL_LOOKUP_SCHEMA.required], ["email", "email_kind", "source_url", "same_person_basis"]);
});

test("who gets a lookup: none yet, a page to start from, no address the agent may mail", () => {
  const base = { ...person, emailLookup: null, email: null, emailSource: null, signalUrl: null } as const;
  assert.equal(needsEmailLookup(base), true);
  assert.equal(needsEmailLookup({ ...base, emailLookup: { runId: "r", startedAt: "2026-11-17T00:00:00Z", state: "done" } }), false);
  assert.equal(needsEmailLookup({ ...base, profileUrl: null, contactUrl: null }), false);
  assert.equal(needsEmailLookup({ ...base, profileUrl: null, contactUrl: "https://janedoe.dev" }), true);
  // A personal mailbox is enough; a work address from the application is not.
  assert.equal(needsEmailLookup({ ...base, email: "jane@gmail.com", emailSource: "import" }), false);
  assert.equal(needsEmailLookup({ ...base, email: "jane@acme.example", emailSource: "import" }), true);
  // An address from their post counts on the domain of the page they were found on, not on a shared platform.
  assert.equal(needsEmailLookup({ ...base, email: "me@janedoe.dev", emailSource: "post", signalUrl: "https://janedoe.dev/now" }), false);
  assert.equal(needsEmailLookup({ ...base, email: "me@janedoe.dev", emailSource: "post", signalUrl: "https://velog.io/@jane/now" }), false);
  assert.equal(needsEmailLookup({ ...base, email: "me@otherdomain.dev", emailSource: "post", signalUrl: "https://velog.io/@jane/now" }), true);
  assert.equal(needsEmailLookup({ ...base, email: "me@otherdomain.dev", emailSource: "post" }), true);
  // A domain named after their handle (linkedin.com/in/jane-doe-000 → janedoe.dev) is theirs wherever the address came
  // from (11/18 evaluation); another domain is an employer's.
  assert.equal(needsEmailLookup({ ...base, email: "me@janedoe.dev", emailSource: "lookup" }), false);
  assert.equal(needsEmailLookup({ ...base, email: "jane@acme.example", emailSource: "lookup" }), true);
});

test("the run's output is cleaned: address lower-cased, http(s) source only, unknown kind is none", () => {
  assert.deepEqual(parseLookupOutput({ email: " Jane.Doe@Gmail.com ", email_kind: "personal", source_url: "https://janedoe.dev/about", same_person_basis: "name + Acme" }), {
    email: "jane.doe@gmail.com", emailKind: "personal", sourceUrl: "https://janedoe.dev/about", samePersonBasis: "name + Acme",
  });
  const bad = parseLookupOutput({ email: "jane at gmail", email_kind: "guess", source_url: "javascript:alert(1)" });
  assert.deepEqual(bad, { email: null, emailKind: "none", sourceUrl: null, samePersonBasis: "" });
  assert.deepEqual(parseLookupOutput(null), { email: null, emailKind: "none", sourceUrl: null, samePersonBasis: "" });
});

test("cost: what Exa reports, else $0.10 a run plus $0.02 for an email", () => {
  assert.equal(lookupRunCostUsd({ costDollars: { total: 0.137 } }), 0.137);
  assert.equal(lookupRunCostUsd({ costDollars: 0.11 }), 0.11);
  assert.equal(lookupRunCostUsd({ output: { structured: { email: null } } }), 0.1);
  assert.equal(lookupRunCostUsd({ output: { structured: { email: "jane@gmail.com" } } }), EMAIL_LOOKUP_ESTIMATE_USD);
});

test("before reading the page: no address, GitHub, no source, resale sites and social media", () => {
  assert.equal(lookupSourceProblem({ email: null, sourceUrl: "https://janedoe.dev" }), "not_found");
  assert.equal(lookupSourceProblem({ email: "123+jane@users.noreply.github.com", sourceUrl: "https://janedoe.dev" }), "github");
  assert.equal(lookupSourceProblem({ email: "jane@gmail.com", sourceUrl: "https://github.com/jane-doe" }), "github");
  assert.equal(lookupSourceProblem({ email: "jane@gmail.com", sourceUrl: null }), "no_source");
  assert.equal(lookupSourceProblem({ email: "jane@gmail.com", sourceUrl: "https://rocketreach.co/jane-doe" }), "vendor_source");
  assert.equal(lookupSourceProblem({ email: "jane@gmail.com", sourceUrl: "https://m.facebook.com/jane" }), "vendor_source");
  // A personal site on GitHub Pages is the person's own page.
  assert.equal(lookupSourceProblem({ email: "jane@gmail.com", sourceUrl: "https://jane-doe.github.io/" }), null);
});

test("employers and schools: the current company and 'at / @ / ex-' in the headline", () => {
  assert.deepEqual(lookupOrgNames(person), ["acme", "acme labs"]);
  assert.deepEqual(lookupOrgNames({ currentCompany: null, headline: "ML Engineer @Beta Corp · ex-Gamma - Seoul" }), ["beta corp", "gamma"]);
  // "at" only as a word: no employer is read out of "Atlas".
  assert.deepEqual(lookupOrgNames({ currentCompany: null, headline: "Data Engineer · Atlas team" }), []);
});

test("an address is used only when it is on its page with the person's name and an employer, school or own page", () => {
  const found = { email: "jane.doe@gmail.com", sourceUrl: "https://blog.example.org/team/jane" };
  const page = "Team | Jane Doe — Backend engineer at Acme. Reach me: jane.doe@gmail.com";
  assert.deepEqual(verifyLookup(person, found, page), { verified: true, reason: null, sourceHost: "blog.example.org", failedCheck: null });
  assert.equal(verifyLookup(person, found, "Jane Doe at Acme. Contact: jane.doe [at] gmail [dot] com").verified, true);
  assert.equal(verifyLookup(person, found, "Doe, Jane (Acme) jane.doe@gmail.com").verified, true);
  assert.equal(verifyLookup(person, found, "").reason, "page_unreadable");
  assert.equal(verifyLookup(person, found, "Jane Doe at Acme, write to hello@acme.example").reason, "not_on_page");
  assert.equal(verifyLookup(person, found, "John Roe at Acme jane.doe@gmail.com").reason, "other_person");
  // The address itself is not the name: "jane.doe@…" alone does not show Jane Doe.
  assert.equal(verifyLookup(person, found, "Acme staff list: jane.doe@gmail.com").reason, "other_person");
  // The name without any known employer or school, on a page that is not the person's own: not enough.
  assert.equal(verifyLookup(person, found, "Jane Doe likes hiking. jane.doe@gmail.com").reason, "other_person");
});

test("an address is someone else's when it is not near the name, or the page lists other people's addresses", () => {
  const found = { email: "jane.doe@gmail.com", sourceUrl: "https://conference.example.org/speakers" };
  const speakers = "Speakers: Jane Doe (Acme) jane.doe@gmail.com · John Roe (Beta) john.roe@gmail.com · Ann Lee (Gamma) ann.lee@naver.com";
  assert.equal(verifyLookup(person, found, speakers).reason, "other_person");
  const far = `Jane Doe, backend engineer at Acme. ${"The team ships payment APIs every week. ".repeat(10)}Other contact: jane.doe@gmail.com`;
  assert.equal(verifyLookup(person, found, far).reason, "other_person");
  // A comment thread: an address in another commenter's comment is never this person's.
  const thread = "Jane Doe (Acme) 3 days ago: great talk! John Roe 2 days ago: thanks, write me at roe.writes@gmail.com";
  assert.equal(verifyLookup(person, { ...found, email: "roe.writes@gmail.com" }, thread).reason, "other_person");
  const theirs = "Jane Doe (Acme) 3 days ago: write me at jane.doe@gmail.com John Roe 2 days ago: thanks!";
  assert.equal(verifyLookup(person, found, theirs).verified, true);
  assert.equal(verifyLookup({ ...person, name: "John Roe" }, found, theirs).reason, "other_person");
  // The person's own page may list several of their addresses.
  const own = { ...person, contactUrl: "https://janedoe.dev" };
  const ownPage = "Jane Doe — backend at Acme. Work: jane@acme.example, personal: jane.doe@gmail.com, old: jdoe@naver.com";
  assert.equal(verifyLookup(own, { email: "jane.doe@gmail.com", sourceUrl: "https://janedoe.dev/contact" }, ownPage).verified, true);
  assert.equal(verifyLookup(person, { email: "jane.doe@gmail.com", sourceUrl: "https://blog.example.org/x" }, ownPage).reason, "other_person");
});

test("the person's own page (under their profile or a link they wrote) needs no employer", () => {
  const own = { ...person, currentCompany: null, headline: null, contactUrl: "https://janedoe.dev" };
  const page = "Hi, I'm Jane Doe. I build backends. jane.doe@gmail.com";
  assert.equal(verifyLookup(own, { email: "jane.doe@gmail.com", sourceUrl: "https://www.janedoe.dev/about" }, page).verified, true);
  assert.equal(verifyLookup(own, { email: "jane.doe@gmail.com", sourceUrl: "https://janedoe.dev.example.org/" }, page).verified, false);
  // A bare link to a shared site is everyone's page.
  const shared = { ...own, contactUrl: "https://medium.com" };
  assert.equal(verifyLookup(shared, { email: "jane.doe@gmail.com", sourceUrl: "https://medium.com/@someone" }, page).verified, false);
  const blog = { ...own, contactUrl: "https://medium.com/@janedoe" };
  assert.equal(verifyLookup(blog, { email: "jane.doe@gmail.com", sourceUrl: "https://medium.com/@janedoe/about-me" }, page).verified, true);
});

test("an other_person address says which check failed", () => {
  const found = { email: "jane.doe@gmail.com", sourceUrl: "https://blog.example.org/team/jane" };
  const check = (who: Parameters<typeof verifyLookup>[0], page: string, at = found) => verifyLookup(who, at, page).failedCheck;
  // Other people's addresses on a page that is not theirs (a speakers list).
  assert.equal(check(person, "Speakers: Jane Doe (Acme) jane.doe@gmail.com · John Roe (Beta) john.roe@gmail.com"), "other_addresses");
  // The name is on the page, but far from the address; or another name is next to it.
  assert.equal(check(person, `Jane Doe, backend engineer at Acme. ${"The team ships payment APIs every week. ".repeat(10)}Other contact: jane.doe@gmail.com`), "not_near");
  assert.equal(check(person, "John Roe at Acme jane.doe@gmail.com"), "not_near");
  // Next to the address but no known employer or school, and not their own page.
  assert.equal(check(person, "Jane Doe likes hiking. jane.doe@gmail.com"), "no_org_not_own");
  // Their own page with their handle next to the address, but the page never names them.
  const handleOnly = { ...person, name: null, currentCompany: null, headline: null, contactUrl: "https://medium.com/@janedoe" };
  assert.equal(check(handleOnly, "Notes on Rust and queues. Reach me: hello.there@gmail.com", { email: "hello.there@gmail.com", sourceUrl: "https://medium.com/@janedoe/about" }), "not_near");
  // A verified address, and the reasons that are not other_person, carry no failed check.
  assert.equal(check(person, "Team | Jane Doe — Backend engineer at Acme. Reach me: jane.doe@gmail.com"), null);
  assert.equal(check(person, "Jane Doe at Acme, write to hello@acme.example"), null);
});

test("a person known only by a handle: their own page may show the handle instead of a name", () => {
  const handleOnly = { ...person, name: "@janedoe", currentCompany: null, headline: null, profileUrl: "https://velog.io/@janedoe", contactUrl: null };
  const about = "janedoe · Backend notes. I build payment systems. Contact: jd.writes@gmail.com (janedoe)";
  assert.equal(verifyLookup(handleOnly, { email: "jd.writes@gmail.com", sourceUrl: "https://velog.io/@janedoe/about" }, about).verified, true);
  // The handle alone on a page that is not theirs is never enough (no real name, no employer).
  const other = verifyLookup(handleOnly, { email: "jd.writes@gmail.com", sourceUrl: "https://forum.example.org/t/1" }, about);
  assert.equal(other.reason, "other_person");
  assert.equal(other.failedCheck, "name_missing");
  // "@name" is never read as a real name.
  assert.equal(emailLookupQuery(handleOnly).includes("Person: @janedoe"), true);
});

test("Korean names and companies are matched inside words (particles attach)", () => {
  const korean = { ...person, name: "홍길동", currentCompany: "가나다랩", headline: null };
  const page = "안녕하세요, 홍길동입니다. 가나다랩에서 백엔드 개발을 합니다. 연락: gildong.hong@naver.com";
  assert.equal(verifyLookup(korean, { email: "gildong.hong@naver.com", sourceUrl: "https://gildong.example.kr/" }, page).verified, true);
});

const lookup: AgentEmailLookup = { runId: "run_1", startedAt: "2026-11-17T00:00:00.000Z", state: "running" };
const now = new Date("2026-11-17T00:06:00.000Z");
const done = (patch: Partial<EmailLookupDone>): EmailLookupDone => ({
  state: "done", email: "jane.doe@gmail.com", emailKind: "personal", sourceUrl: "https://www.janedoe.dev/about",
  verified: true, costUsd: 0.121, reason: null, ...patch,
});

test("a finished lookup: the address is used only when verified and mailable; the reason otherwise", () => {
  const used = settleEmailLookup(lookup, done({}), now);
  assert.equal(used.email, "jane.doe@gmail.com");
  assert.equal(used.note, "이메일 찾음 · janedoe.dev");
  assert.deepEqual(used.emailLookup, {
    runId: "run_1", startedAt: "2026-11-17T00:00:00.000Z", state: "done", finishedAt: "2026-11-17T00:06:00.000Z",
    costUsd: 0.121, verified: true, used: true, emailKind: "personal", sourceUrl: "https://www.janedoe.dev/about", reason: null,
  });
  const work = settleEmailLookup(lookup, done({ email: "jane@acme.example", emailKind: "work" }), now);
  assert.equal(work.email, null);
  assert.equal(work.emailLookup.reason, "work_address");
  assert.equal(work.emailLookup.used, false);
  const unverified = settleEmailLookup(lookup, done({ verified: false, reason: "other_person" }), now);
  assert.equal(unverified.email, null);
  assert.equal(unverified.note, "이메일 못 찾음 · 그 페이지가 같은 사람인지 확인되지 않아요");
  // Which check failed goes on the lookup and in the note (older rows without it read as before).
  const checked = settleEmailLookup(lookup, done({ verified: false, reason: "other_person", failedCheck: "not_near" }), now);
  assert.equal(checked.emailLookup.failedCheck, "not_near");
  assert.equal(checked.note, "이메일 못 찾음 · 그 페이지가 같은 사람인지 확인되지 않아요 · 이름·아이디 옆에 주소가 없음");
  for (const [failedCheck, label] of [
    ["other_addresses", "본인 페이지가 아닌데 다른 사람 주소도 있음"], ["name_missing", "페이지에 이름이 없음"],
    ["no_org_not_own", "아는 회사·학교가 페이지에 없고 본인 페이지도 아님"], ["other_name_near", "주소 옆에 다른 사람 이름이 있음"],
  ] as const) {
    assert.ok(settleEmailLookup(lookup, done({ verified: false, reason: "other_person", failedCheck }), now).note.endsWith(label), failedCheck);
  }
  // Only other_person keeps a failed check.
  assert.equal(settleEmailLookup(lookup, done({ verified: false, reason: "not_on_page", failedCheck: "not_near" }), now).emailLookup.failedCheck, undefined);
  const timedOut = settleEmailLookup(lookup, emptyLookup("timeout", 0.1), now);
  assert.equal(timedOut.note, "이메일 못 찾음 · 15분 안에 끝나지 않았어요");
  assert.equal(timedOut.emailLookup.costUsd, 0.1);
});

test("a lookup running for 15 minutes is given up", () => {
  assert.equal(lookupTimedOut(lookup, new Date("2026-11-17T00:14:59.000Z")), false);
  assert.equal(lookupTimedOut(lookup, new Date("2026-11-17T00:15:00.000Z")), true);
  assert.equal(lookupTimedOut({ startedAt: "not a time" }, now), true);
});

test("why a person without an address is excluded: nothing to look up from, nothing found, someone else's, the rest", () => {
  const searched = { method: "signal_post" as const, profileUrl: null, contactUrl: null };
  const ended = (reason: AgentEmailLookup["reason"]) => ({ runId: "run_1", reason });
  // A searched person without a profile or own link never gets a lookup: 찾을 곳 없음.
  assert.equal(noEmailReason(searched, null), "no_lookup_source");
  assert.equal(noEmailReason({ ...searched, profileUrl: "  " }, undefined), "no_lookup_source");
  // An applicant file row without an address and no lookup stays plain no_email.
  assert.equal(noEmailReason({ ...searched, method: "applicant" }, null), "no_email");
  assert.equal(noEmailReason({ ...searched, profileUrl: "https://www.linkedin.com/in/jane-doe-000" }, null), "no_email");
  // A paid lookup that gave no address the agent may use: 찾아도 없음 (timeouts and failed runs end as nothing found).
  for (const reason of ["not_found", "timeout", "failed", "github", "work_address", "not_on_page", "no_source", "vendor_source", "page_unreadable", null] as const) {
    assert.equal(noEmailReason(searched, ended(reason)), "lookup_not_found", String(reason));
  }
  // The lookup's address is on a page not shown to be the person's: 다른 사람 메일.
  assert.equal(noEmailReason(searched, ended("other_person")), "lookup_other_person");
  // A lookup that never started is no paid lookup: plain no_email.
  assert.equal(noEmailReason(searched, { runId: null, reason: "start_failed" }), "no_email");
  assert.equal(noEmailReason(searched, { runId: "run_1", reason: "start_failed" }), "no_email");
});

test("who a paid lookup is spent on: applicants always; searched people with a clear signal (no daily count)", async () => {
  const { lookupAllowance, LOOKUP_MIN_SIGNAL_SCORE } = await import("./emailLookup");
  assert.equal(lookupAllowance({ method: "applicant", signalScore: null }), "go");
  assert.equal(lookupAllowance({ method: "signal_post", signalScore: LOOKUP_MIN_SIGNAL_SCORE - 1 }), "skip");
  assert.equal(lookupAllowance({ method: "open_to_work_profile", signalScore: null }), "skip");
  assert.equal(lookupAllowance({ method: "open_to_work_profile", signalScore: 85 }), "go");
});

test("11/18 evaluation: correct addresses the checks used to drop", () => {
  const korean = { ...person, name: "김하늘", currentCompany: null, headline: null, profileUrl: "https://www.linkedin.com/in/haneul-kim-1a2b3c" };
  // A site named after their handle is their own page; the address on it is theirs.
  const site = "Haneul Kim — I build payment backends. Contact: hello@haneulkim.dev";
  const fromSite = verifyLookup(korean, { email: "hello@haneulkim.dev", sourceUrl: "https://haneulkim.dev/about" }, site);
  assert.equal(fromSite.verified, true);
  // … and the agent may mail it (a domain named after their handle, not an employer's).
  assert.equal(settleEmailLookup({ runId: "r", startedAt: "2026-11-18T00:00:00Z", state: "running" },
    { state: "done", email: "hello@haneulkim.dev", emailKind: "personal", sourceUrl: "https://haneulkim.dev/about", verified: true, costUsd: 0.1, reason: null },
    new Date("2026-11-18T00:10:00Z"), ["haneul-kim-1a2b3c"]).email, "hello@haneulkim.dev");
  // A Korean name written in Latin letters on an English page, near the address (the handle spells it).
  const english = "Speaker bio: Haneul Kim, backend engineer at Acme. Reach me at hn.kim@gmail.com";
  assert.equal(verifyLookup({ ...korean, currentCompany: "Acme" }, { email: "hn.kim@gmail.com", sourceUrl: "https://events.example.org/bio" }, english).verified, true);
  // A portfolio that links back to their LinkedIn and shows only their address is their own page.
  const portfolio = "Portfolio · linkedin.com/in/haneul-kim-1a2b3c · haneul.k@gmail.com · projects below";
  assert.equal(verifyLookup(korean, { email: "haneul.k@gmail.com", sourceUrl: "https://portfolio.example.app/" }, portfolio).verified, true);
  // Given names written together ("Minjun Lee" for "Min Jun Lee").
  const spaced = { ...person, name: "Min Jun Lee", currentCompany: "Acme", profileUrl: "https://www.linkedin.com/in/mjlee" };
  assert.equal(verifyLookup(spaced, { email: "mj.lee@gmail.com", sourceUrl: "https://blog.example.org/team" }, "Minjun Lee (Acme): mj.lee@gmail.com").verified, true);
  // Still someone else's: the same handle on another person's blog (another name next to the address).
  const namesake = "Blog of Jae Park (Beta Corp). Contact jae.park@gmail.com";
  assert.equal(verifyLookup(korean, { email: "jae.park@gmail.com", sourceUrl: "https://haneul.example.net/" }, namesake).verified, false);
  // The only address on an HN comment, spelled as their distinctive handle, is theirs under another user name.
  const hn = { ...person, name: null, currentCompany: null, headline: null, profileUrl: null, contactUrl: "https://github.com/quietfox7-dev" };
  assert.equal(verifyLookup(hn, { email: "quietfox7@gmail.com", sourceUrl: "https://news.example.com/item?id=1" }, "someone 5 days ago Location: Seoul. Remote: yes. Email: quietfox7@gmail.com").verified, true);
  // A short word handle on someone else's blog (another name signs it) is not enough.
  const word = { ...person, name: "Skyward Lee", currentCompany: null, headline: null, profileUrl: "https://www.linkedin.com/in/skyward" };
  assert.equal(verifyLookup(word, { email: "skyward@skyward.com", sourceUrl: "https://brunch.example.kr/@hop/1" }, "출판사를 찾고 있습니다. - 농부 김바다 드림 skyward@skyward.com").verified, false);
  // A domain named after someone else, or a work domain, stays an employer's address.
  assert.equal(settleEmailLookup({ runId: "r", startedAt: "2026-11-18T00:00:00Z", state: "running" },
    { state: "done", email: "yh@acme.example", emailKind: "work", sourceUrl: "https://acme.example/team", verified: true, costUsd: 0.1, reason: null },
    new Date("2026-11-18T00:10:00Z"), ["haneul-kim-1a2b3c"]).email, null);
});
