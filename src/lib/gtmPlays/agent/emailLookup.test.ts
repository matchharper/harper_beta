import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_LOOKUP_ESTIMATE_USD, EMAIL_LOOKUP_SCHEMA, EMAIL_LOOKUP_SYSTEM_PROMPT, emailLookupQuery, emptyLookup,
  lookupOrgNames, lookupRunCostUsd, lookupSourceProblem, lookupTimedOut, needsEmailLookup, parseLookupOutput,
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
  assert.equal(needsEmailLookup({ ...base, email: "me@janedoe.dev", emailSource: "post", signalUrl: "https://velog.io/@jane/now" }), true);
  assert.equal(needsEmailLookup({ ...base, email: "me@janedoe.dev", emailSource: "post" }), true);
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
  assert.deepEqual(verifyLookup(person, found, page), { verified: true, reason: null, sourceHost: "blog.example.org" });
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
  const timedOut = settleEmailLookup(lookup, emptyLookup("timeout", 0.1), now);
  assert.equal(timedOut.note, "이메일 못 찾음 · 15분 안에 끝나지 않았어요");
  assert.equal(timedOut.emailLookup.costUsd, 0.1);
});

test("a lookup running for 15 minutes is given up", () => {
  assert.equal(lookupTimedOut(lookup, new Date("2026-11-17T00:14:59.000Z")), false);
  assert.equal(lookupTimedOut(lookup, new Date("2026-11-17T00:15:00.000Z")), true);
  assert.equal(lookupTimedOut({ startedAt: "not a time" }, now), true);
});
