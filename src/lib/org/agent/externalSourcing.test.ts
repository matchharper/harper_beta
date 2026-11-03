import assert from "node:assert/strict";
import test from "node:test";
import {
  decideExternalSourcing,
  externalContactNoticeFacts,
  externalContactStatus,
  externalIntroStatus,
  formatExternalIntroRequestResult,
  formatExternalContactRequestResult,
  externalCandidatesForCompany,
  externalSearchNoticeFacts,
  externalSourcingEnabledFor,
  externalSourcingLimits,
  formatExternalCandidatesResult,
  formatExternalSearchRequestResult,
  kstMonthStart,
  parseExternalCareerLines,
  parseExternalSourcingTrigger,
  type ExternalCandidateRow,
  type ExternalRunRow,
  type ExternalSourcingHistory,
} from "./externalSourcing";

const NOW = new Date("2026-11-02T03:00:00Z");
const limits = externalSourcingLimits({ ORG_EXTERNAL_SOURCING_AGENT_MONTHLY_LIMIT: "2" });
const quiet: ExternalSourcingHistory = { activeRunId: null, workspaceRunsLast24h: 0, agentRunsThisMonth: 0, lastRoleRunAt: null };

test("external sourcing is off unless the workspace is listed", () => {
  assert.equal(externalSourcingEnabledFor("w1", {}), false);
  assert.equal(externalSourcingEnabledFor("w1", { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "w2, w1" }), true);
  assert.equal(externalSourcingEnabledFor("w3", { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "w2,w1" }), false);
  assert.equal(externalSourcingEnabledFor("w3", { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" }), true);
  assert.equal(externalSourcingEnabledFor(undefined, { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" }), false);
});

test("default limits: one run a day, Harper may only suggest", () => {
  assert.deepEqual(externalSourcingLimits({}), { workspaceDaily: 1, agentMonthly: 0, agentRoleIntervalDays: 14, emailDaily: 10 });
});

test("one active run per Role, a daily workspace limit and stricter limits for Harper's own runs", () => {
  const decide = (trigger: "company_request" | "agent_initiative", history = quiet, enabled = true) =>
    decideExternalSourcing({ enabled, trigger, history, now: NOW, limits });
  assert.deepEqual(decide("company_request"), { allowed: true });
  assert.deepEqual(decide("company_request", quiet, false), { allowed: false, status: "not_queued", reason: "not_enabled" });
  assert.deepEqual(decide("company_request", { ...quiet, activeRunId: "r1" }), { allowed: false, status: "already_running", runId: "r1" });
  assert.deepEqual(decide("company_request", { ...quiet, workspaceRunsLast24h: 3 }), { allowed: false, status: "not_queued", reason: "daily_limit" });
  assert.deepEqual(decide("agent_initiative", { ...quiet, agentRunsThisMonth: 2 }), { allowed: false, status: "not_queued", reason: "agent_monthly_limit" });
  assert.deepEqual(decide("agent_initiative", { ...quiet, lastRoleRunAt: "2026-10-25T00:00:00Z" }),
    { allowed: false, status: "not_queued", reason: "recently_searched", retryAfter: "2026-11-08T00:00:00.000Z" });
  assert.deepEqual(decide("company_request", { ...quiet, lastRoleRunAt: "2026-11-01T00:00:00Z" }), { allowed: true });
  assert.deepEqual(decide("agent_initiative", { ...quiet, lastRoleRunAt: "2026-10-01T00:00:00Z" }), { allowed: true });
});

test("a Harper-initiated turn is always recorded as Harper's own initiative", () => {
  assert.equal(parseExternalSourcingTrigger("company_request", true), "agent_initiative");
  assert.equal(parseExternalSourcingTrigger("harper_suggestion", false), "harper_suggestion");
  assert.equal(parseExternalSourcingTrigger("agent_initiative", false), "company_request");
  assert.equal(parseExternalSourcingTrigger(undefined, false), "company_request");
});

test("the month for Harper's limit starts in Korea time", () => {
  assert.equal(kstMonthStart(new Date("2026-10-31T16:00:00Z")), "2026-10-31T15:00:00.000Z");   // Nov 1, 01:00 KST
  assert.equal(kstMonthStart(new Date("2026-10-31T14:00:00Z")), "2026-09-30T15:00:00.000Z");   // Oct 31, 23:00 KST
});

const run: ExternalRunRow = { id: "run-1", status: "succeeded", trigger: "company_request", error_code: null,
  created_at: "2026-11-02T01:00:00Z", finished_at: "2026-11-02T01:09:00Z", counts: { pool: 120, shortlisted: 8, passed: 4 } };
const person: ExternalCandidateRow = {
  id: "c-1", name: "Ada Kim", headline: "Software Engineer", current_company: "Alpha", location: "Seoul",
  linkedin_url: "https://www.linkedin.com/in/ada-1", career_lines: ["경력: Software Engineer · Alpha · 2021-03 ~ 현재 (5년 8개월)", "학력: BS · KAIST"],
  evidence: [{ criterion: "TypeScript", url: "https://blog.example/post", quote: "not for the company model" }],
  verdict: { overall: "meet", fit: 0.82, reason: "Ships TypeScript products", criteria: [{ name: "TypeScript", level: "good" }, { name: "React", level: "uncertain" }] },
  rank: 1, company_decision: null,
};

test("candidate results are text: criteria named once, numbered per person, no quotes or JSON", () => {
  const text = formatExternalCandidatesResult({ roleName: "Product Engineer", run, candidates: [person, { ...person, id: "c-2", name: "Bo" }] });
  assert.match(text, /criteria: criteria1: TypeScript; criteria2: React/);
  assert.match(text, /assessment: overall meet, fit 0.82; criteria1: good; criteria2: uncertain/);
  assert.match(text, /info: Ada Kim · Software Engineer · Alpha · Seoul/);
  assert.match(text, /- Software Engineer · Alpha · 2021-03 ~ 현재/);
  assert.match(text, /- TypeScript: https:\/\/blog.example\/post/);
  assert.match(text, /not contacted/);
  assert.equal(text.split("TypeScript; criteria2").length, 2);
  assert.doesNotMatch(text, /not for the company model|\{"|\[\{/);
  assert.match(formatExternalCandidatesResult({ roleName: "Product Engineer", run: null, candidates: [] }), /status=no_external_search/);
});

test("request results explain queued, running and refused searches", () => {
  assert.match(formatExternalSearchRequestResult({ status: "queued", runId: "r", roleName: "Product Engineer" }), /nobody is contacted/);
  assert.match(formatExternalSearchRequestResult({ status: "already_running", runId: "r", roleName: "Product Engineer" }), /No new search was started/);
  const refused = formatExternalSearchRequestResult({ status: "not_queued", roleName: "Product Engineer", reason: "recently_searched", retryAfter: "2026-11-08T00:00:00.000Z" });
  assert.match(refused, /unavailable_reason=recently_searched/);
  assert.match(refused, /retry_after=2026-11-08 09:00/);
});

test("notice facts carry verified state, never wording or quotes", () => {
  const facts = externalSearchNoticeFacts({ run, roleName: "Product Engineer", candidates: [person] });
  assert.equal(facts.externalSearch.startedBy, "company");
  assert.equal(facts.externalSearch.shown, 1);
  assert.equal(facts.candidateState.contacted, false);
  assert.equal(facts.externalCandidates.people[0].linkedinUrl, "https://www.linkedin.com/in/ada-1");
  assert.doesNotMatch(JSON.stringify(facts), /not for the company model/);
});

test("contact status never carries the address and says how far it was confirmed", () => {
  assert.equal(externalContactStatus(null), "email not looked up");
  assert.equal(externalContactStatus({ status: "running", email_kind: null, source_kind: null, finished_at: null }), "email lookup in progress");
  assert.match(externalContactStatus({ status: "found", email_kind: "work", source_kind: "self_published", finished_at: "x" }),
    /work address; published by the person/);
  assert.match(externalContactStatus({ status: "found", email_kind: "personal", source_kind: "data_vendor", finished_at: "x" }),
    /contact-data site, not confirmed/);
  const text = formatExternalContactRequestResult({ status: "queued", candidateRef: "c-1", name: "Ada Kim" });
  assert.match(text, /status=queued/);
  assert.match(text, /never shown/);
  const withContact = { ...person, contact: { status: "found", email_kind: "work", source_kind: "unverified", finished_at: "x" } };
  assert.match(formatExternalCandidatesResult({ roleName: "Product Engineer", run, candidates: [withContact] }), /contact: email found \(work address/);
  const facts = externalContactNoticeFacts({ contactId: "k-1", roleName: "Product Engineer", candidate: withContact });
  assert.equal(facts.candidateState.addressShown, false);
  assert.doesNotMatch(JSON.stringify(facts), /@/);
});

test("connection requests are recorded only after confirmation and never claim contact", () => {
  assert.equal(externalIntroStatus(null), "no connection request");
  assert.match(externalIntroStatus({ status: "requested", created_at: "2026-11-02T08:00:00Z" }),
    /connection requested 2026-11-02 17:00; the person has not been contacted \(invitation emails are turned off/);
  const asking = formatExternalIntroRequestResult({ status: "confirmation_required", candidateRef: "c-1", name: "Ada Kim",
    roleName: "Product Engineer", companyAppeal: "Agent infra experience", introRecipientEmails: ["cto@acme.example"] });
  assert.match(asking, /Nothing was recorded yet/);
  assert.match(asking, /company_recipients=cto@acme.example/);
  assert.match(formatExternalIntroRequestResult({ status: "details_required", candidateRef: "c-1", missingInputs: ["company_appeal"] }),
    /missing=company_appeal/);
  assert.match(formatExternalIntroRequestResult({ status: "requested", candidateRef: "c-1" }), /has not been contacted/);
  const shown = { ...person, intro: { status: "requested", created_at: "2026-11-02T08:00:00Z" } };
  assert.match(formatExternalCandidatesResult({ roleName: "Product Engineer", run, candidates: [shown] }), /connection: connection requested 2026-11-02 17:00/);
});

test("the /org screen gets public facts and states only: page quotes and addresses stay out, unsafe links dropped, unknown levels uncertain", () => {
  const [view] = externalCandidatesForCompany([{
    ...person, created_at: "2026-11-02T01:09:00Z",
    linkedin_url: "javascript:alert(1)",
    evidence: [...(person.evidence as unknown[]), { criterion: "React", url: "javascript:alert(1)", quote: "x" }],
    verdict: { reason: "Ships TypeScript products", criteria: [{ name: "TypeScript", level: "good", quote: "Led the TypeScript migration" }, { name: "React", level: "weird" }] },
    contact: { status: "found", email_kind: "work", source_kind: "self_published", finished_at: "x" },
    intro: { status: "requested", created_at: "2026-11-02T08:00:00Z" },
  }]);
  assert.equal(view.linkedinUrl, null);
  assert.deepEqual(view.evidence, [{ criterion: "TypeScript", url: "https://blog.example/post" }]);
  assert.deepEqual(view.criteria, [{ name: "TypeScript", fitness: "good", content: "Led the TypeScript migration" },
    { name: "React", fitness: "uncertain", content: "" }]);
  assert.equal(view.career[0], "Software Engineer · Alpha · 2021-03 ~ 현재 (5년 8개월)");
  assert.deepEqual(view.experiences, [{ role: "Software Engineer", company: "Alpha", start: "2021-03", end: null }]);
  assert.deepEqual(view.educations, [{ school: "KAIST", degree: "BS", start: null, end: null }]);
  assert.equal(view.contact, "found");
  assert.equal(view.contactConfirmed, true);
  assert.deepEqual(view.intro, { status: "requested", requestedAt: "2026-11-02T08:00:00Z", invitedAt: null, openedAt: null, replyType: null });
  assert.doesNotMatch(JSON.stringify(view), /not for the company model|"quote"|@/);
  const [plain] = externalCandidatesForCompany([{ ...person, created_at: "x", contact: { status: "running", email_kind: null, source_kind: null, finished_at: null } }]);
  assert.equal(plain.linkedinUrl, "https://www.linkedin.com/in/ada-1");
  assert.equal(plain.contact, "looking");
  assert.equal(plain.intro, null);
});

test("with invitations on, the plan and the result say exactly what will be sent and when", () => {
  const plan = formatExternalIntroRequestResult({ status: "confirmation_required", candidateRef: "c-1", name: "Ada Kim", roleName: "Product Engineer",
    companyAppeal: "Agent infra experience", introRecipientEmails: ["cto@acme.example"], inviteSending: true });
  assert.match(plan, /Nothing was recorded or sent yet/);
  assert.match(plan, /emails this person one invitation/);
  const done = formatExternalIntroRequestResult({ status: "requested", candidateRef: "c-1", inviteSending: true, emailLookup: "queued (about $0.12)" });
  assert.match(done, /email_lookup=queued/);
  assert.match(done, /Nothing has been sent yet/);
});

test("career lines become structured history, tolerating missing parts", () => {
  assert.deepEqual(parseExternalCareerLines([
    "경력: Staff Engineer · Acme · Labs · 2023-01 ~ 2025-06 (2년 6개월)",
    "경력: - · Beta · 기간 없음",
    "학력: - · Seoul National University · 2012~2016",
    "학력: MS · KAIST · 2017~",
  ]), {
    experiences: [
      { role: "Staff Engineer · Acme", company: "Labs", start: "2023-01", end: "2025-06" },
      { role: null, company: "Beta", start: null, end: null },
    ],
    educations: [
      { school: "Seoul National University", degree: null, start: "2012", end: "2016" },
      { school: "KAIST", degree: "MS", start: "2017", end: null },
    ],
  });
});

test("a person the company passed is marked in the model text", () => {
  const text = formatExternalCandidatesResult({ roleName: "Product Engineer", run, candidates: [{ ...person, company_decision: "passed" }] });
  assert.match(text, /company_decision: passed by the company/);
  assert.doesNotMatch(formatExternalCandidatesResult({ roleName: "Product Engineer", run, candidates: [person] }), /company_decision/);
});

test("a person whose lookup found no address cannot be asked for", () => {
  const text = formatExternalIntroRequestResult({ status: "no_email", candidateRef: "c-1", name: "Ada Kim", roleName: "Product Engineer" });
  assert.match(text, /status=no_email/);
  assert.match(text, /Nothing was recorded or sent/);
});
