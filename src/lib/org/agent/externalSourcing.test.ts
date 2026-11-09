import assert from "node:assert/strict";
import Module from "node:module";
import test, { type TestContext } from "node:test";
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
  formatExternalCandidateStatuses,
  formatExternalSearchRequestResult,
  parseExternalCareerLines,
  parseExternalSourcingTrigger,
  type ExternalCandidateRow,
  type ExternalRunRow,
  type ExternalSourcingHistory,
} from "./externalSourcing";

const NOW = new Date("2026-11-02T03:00:00Z");
const limits = externalSourcingLimits({});
const quiet: ExternalSourcingHistory = { activeRunId: null, roleRunsLast24h: 0, workspaceRunsLast24h: 0 };

test("external sourcing is off unless the workspace is listed", () => {
  assert.equal(externalSourcingEnabledFor("w1", {}), false);
  assert.equal(externalSourcingEnabledFor("w1", { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "w2, w1" }), true);
  assert.equal(externalSourcingEnabledFor("w3", { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "w2,w1" }), false);
  assert.equal(externalSourcingEnabledFor("w3", { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" }), true);
  assert.equal(externalSourcingEnabledFor(undefined, { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" }), false);
});

test("default limits: five runs a day per Role, twenty per company", () => {
  assert.deepEqual(externalSourcingLimits({}), { roleDaily: 5, workspaceDaily: 20 });
});

test("a free workspace gets one run a day per Role; paid, scale and legacy keep the limits", () => {
  assert.deepEqual(externalSourcingLimits({}, "free"), { roleDaily: 1, workspaceDaily: 20 });
  for (const plan of ["slot", "scale", "legacy", null]) assert.deepEqual(externalSourcingLimits({}, plan), { roleDaily: 5, workspaceDaily: 20 });
  // A Role limit switched off stays off on the free plan.
  assert.equal(externalSourcingLimits({ ORG_EXTERNAL_SOURCING_DAILY_LIMIT: "0" }, "free").roleDaily, 0);
  const free = (roleRunsLast24h: number) => decideExternalSourcing({ enabled: true, trigger: "company_request",
    history: { ...quiet, roleRunsLast24h }, now: NOW, limits: externalSourcingLimits({}, "free"), plan: "free" });
  assert.deepEqual(free(0), { allowed: true });
  assert.deepEqual(free(1), { allowed: false, status: "not_queued", reason: "free_plan_daily_limit" });
  assert.match(formatExternalSearchRequestResult({ status: "not_queued", reason: "free_plan_daily_limit" }), /On the free plan each Role can start one external search per 24 hours/);
});

test("a workspace listed as having no Role limit keeps only the company limit, free or paid", () => {
  const env = { ORG_EXTERNAL_SOURCING_NO_ROLE_LIMIT_WORKSPACE_IDS: " ws-harper , ws-other" };
  for (const plan of ["free", "slot", null]) {
    assert.deepEqual(externalSourcingLimits(env, plan, "ws-harper"), { roleDaily: Number.POSITIVE_INFINITY, workspaceDaily: 20 });
  }
  assert.deepEqual(externalSourcingLimits(env, "free", "ws-customer"), { roleDaily: 1, workspaceDaily: 20 });
  assert.deepEqual(externalSourcingLimits({}, "free", "ws-harper"), { roleDaily: 1, workspaceDaily: 20 });
  const decide = (roleRunsLast24h: number, workspaceRunsLast24h: number) => decideExternalSourcing({ enabled: true,
    trigger: "company_request", history: { ...quiet, roleRunsLast24h, workspaceRunsLast24h }, now: NOW, plan: "free",
    limits: externalSourcingLimits(env, "free", "ws-harper") });
  assert.deepEqual(decide(5, 5), { allowed: true });
  assert.deepEqual(decide(20, 20), { allowed: false, status: "not_queued", reason: "workspace_daily_limit" });
});

test("one active run per Role, daily limits per Role and per company, and Harper never starts one on its own", () => {
  const decide = (trigger: "company_request" | "agent_initiative", history = quiet, enabled = true) =>
    decideExternalSourcing({ enabled, trigger, history, now: NOW, limits });
  assert.deepEqual(decide("company_request"), { allowed: true });
  assert.deepEqual(decide("company_request", quiet, false), { allowed: false, status: "not_queued", reason: "not_enabled" });
  assert.deepEqual(decide("company_request", { ...quiet, activeRunId: "r1" }), { allowed: false, status: "already_running", runId: "r1" });
  assert.deepEqual(decide("company_request", { ...quiet, roleRunsLast24h: 4 }), { allowed: true });
  assert.deepEqual(decide("company_request", { ...quiet, roleRunsLast24h: 5 }), { allowed: false, status: "not_queued", reason: "daily_limit" });
  assert.deepEqual(decide("company_request", { ...quiet, roleRunsLast24h: 1, workspaceRunsLast24h: 20 }),
    { allowed: false, status: "not_queued", reason: "workspace_daily_limit" });
  assert.deepEqual(decide("company_request", { ...quiet, roleRunsLast24h: 1, workspaceRunsLast24h: 19 }), { allowed: true });
  assert.deepEqual(decide("agent_initiative"), { allowed: false, status: "not_queued", reason: "company_request_only" });
});

test("a Harper-initiated turn is always recorded as Harper's own initiative", () => {
  assert.equal(parseExternalSourcingTrigger("company_request", true), "agent_initiative");
  assert.equal(parseExternalSourcingTrigger("harper_suggestion", false), "harper_suggestion");
  assert.equal(parseExternalSourcingTrigger("agent_initiative", false), "company_request");
  assert.equal(parseExternalSourcingTrigger(undefined, false), "company_request");
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
  const refused = formatExternalSearchRequestResult({ status: "not_queued", roleName: "Product Engineer", reason: "company_request_only" });
  assert.match(refused, /unavailable_reason=company_request_only/);
  assert.match(refused, /Harper does not start an external search on its own/);
});

test("notice facts carry verified state, never wording or quotes", () => {
  const facts = externalSearchNoticeFacts({ run, roleName: "Product Engineer", candidates: [person] });
  assert.equal(facts.externalSearch.startedBy, "company");
  assert.equal(facts.externalSearch.shown, 1);
  assert.equal(facts.candidateState.contacted, false);
  assert.equal(facts.externalCandidates.people[0].linkedinUrl, "https://www.linkedin.com/in/ada-1");
  assert.doesNotMatch(JSON.stringify(facts), /not for the company model/);
  // How much new ground the run covered, from the Worker's counts; absent for runs without counts.
  const reached = externalSearchNoticeFacts({ run: { ...run, counts: { pool: 40, skippedShown: 3, skippedJudged: 9 } },
    roleName: "Product Engineer", candidates: [] });
  assert.equal(reached.externalSearch.reach,
    "40 people new to this Role were reviewed; 12 people already shown to this company or already judged for this Role were skipped");
  assert.equal(externalSearchNoticeFacts({ run: { ...run, counts: { pool: 40 } }, roleName: "x", candidates: [] }).externalSearch.reach,
    "40 people were reviewed");
  assert.equal("reach" in externalSearchNoticeFacts({ run: { ...run, counts: {} }, roleName: "x", candidates: [] }).externalSearch, false);
});

test("contact status never carries the address and says how far it was confirmed", () => {
  assert.equal(externalContactStatus(null), "email not looked up");
  assert.equal(externalContactStatus({ status: "running", email_kind: null, source_kind: null, finished_at: null }), "email lookup in progress");
  assert.match(externalContactStatus({ status: "found", email_kind: "work", source_kind: "self_published", finished_at: "x" }),
    /work address\); the person's own page shows it, so the address and identity are confirmed/);
  assert.match(externalContactStatus({ status: "found", email_kind: "personal", source_kind: "data_vendor", finished_at: "x" }),
    /contact-data site; not confirmed as this person's/);
  // B's real people (11/3): a contact record keyed to the LinkedIn profile, the address on no page that was read.
  assert.match(externalContactStatus({ status: "found", email_kind: "work", source_kind: "unverified", finished_at: "x" }),
    /^email found \(work address\); source unconfirmed: no page Harper read shows this address$/);
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
  assert.deepEqual(view.intro, { status: "requested", requestedAt: "2026-11-02T08:00:00Z", invitedAt: null, openedAt: null, replyType: null,
    acceptedAt: null, connectedAt: null });
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

function serverModules(t: TestContext, env: Record<string, string> = {}) {
  const nodeModule = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const load = nodeModule._load;
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key", SUPABASE_SERVICE_ROLE_KEY: "fixture-key", OPENAI_API_KEY: "unused-fixture-key", ...env })) {
    const before = process.env[key];
    process.env[key] = key in env ? value : before ?? value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  t.mock.method(nodeModule, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    return name === "server-only" ? {} : load.call(this, name, ...args);
  });
}

test("a failed email lookup can be retried once per person; there is no daily lookup count", async (t) => {
  serverModules(t, { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" });
  const { requestExternalEmailLookup } = await import("./externalSourcing.server");
  const run = async (contactResult: Record<string, unknown>) => {
    const calls: Array<{ table: string; op: string; patch?: Record<string, unknown> }> = [];
    const row = { id: "c1", name: "Ada Kim", role_id: "r1", run: { trigger: "company_request" }, company_decision: null,
      contact: { status: "failed", email_kind: null, source_kind: null, finished_at: "2026-11-03T00:00:00Z" }, intro: null };
    const admin = { from: (table: string) => {
      const call: { table: string; op: string; patch?: Record<string, unknown> } = { table, op: "select" };
      const builder: object = new Proxy({}, { get(_t, key) {
        if (key === "then") return (resolve: (v: unknown) => unknown) => { calls.push(call); return Promise.resolve({ data: [row], error: null }).then(resolve); };
        if (key === "maybeSingle" || key === "single") return () => { calls.push(call);
          return Promise.resolve({ data: table === "external_candidate_contacts" ? { result: contactResult } : row, error: null }); };
        return (...args: unknown[]) => { if (key === "update" || key === "insert") { call.op = String(key); call.patch = args[0] as Record<string, unknown>; } return builder; };
      } });
      return builder;
    } } as never;
    const result = await requestExternalEmailLookup({ admin, workspaceId: "w1", roleId: "r1", userId: "u1", candidateRef: "c1" });
    return { result, update: calls.find((call) => call.op === "update") };
  };
  const first = await run({});
  assert.equal(first.result.status, "queued");
  assert.ok((first.update?.patch?.result as { retriedAt?: string }).retriedAt);
  const second = await run({ retriedAt: "2026-11-03T01:00:00Z" });
  assert.equal(second.result.status, "not_queued");
  assert.equal(second.result.reason, "retry_used");
  assert.equal(second.update, undefined);
  assert.match(second.result.modelOutput, /already failed again after its one retry/);
});


test("the Role's default context lists every shown person with the company's current decision, passed people included", () => {
  const base = { headline: null, current_company: null, contact: null, intro: null, company_decided_at: null, created_at: "2026-11-03T07:43:00Z" };
  const text = formatExternalCandidateStatuses({ total: 4, people: [
    { ...base, id: "p1", name: "Seo Kim", headline: "Vision engineer", company_decision: "passed", company_decided_at: "2026-11-03T08:05:08Z" },
    { ...base, id: "p2", name: "Ada Lee", company_decision: "intro_requested",
      intro: { status: "invited", created_at: "2026-11-03T06:00:00Z", invited_at: "2026-11-03T06:25:00Z" } },
    { ...base, id: "p3", name: "Min Park", company_decision: null,
      contact: { status: "found", email_kind: "work", source_kind: "unverified", finished_at: "2026-11-03T07:43:00Z" } },
  ] }) ?? "";
  assert.match(text, /external_candidates_for_this_role=4 shown \(newest 3 listed\)/);
  assert.match(text, /- Seo Kim, Vision engineer \(ref p1; shown 2026-11-03 16:43\): the company passed \(decided not to proceed\) 2026-11-03 17:05; Harper sends this person nothing more/);
  assert.match(text, /- Ada Lee \(ref p2;[^\n]*connection requested 2026-11-03 15:00; invitation emailed 2026-11-03 15:25; no reply yet/);
  assert.match(text, /- Min Park \(ref p3;[^\n]*no company decision yet; email found \(work address\)/);
  assert.equal(formatExternalCandidateStatuses({ total: 0, people: [] }), null);
});

test("an external search asked inside a company Harper run carries that run; one asked in chat does not", async (t) => {
  serverModules(t, { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" });
  const { requestExternalSourcing } = await import("./externalSourcing.server");
  const { withLlmUsageContext } = await import("@/lib/llm/usageContext");
  const inserted: Array<Record<string, unknown>> = [];
  const admin = { from: () => {
    const builder: object = new Proxy({}, { get(_t, key) {
      if (key === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
      if (key === "single") return () => Promise.resolve({ data: { id: `ext-${inserted.length}` }, error: null });
      return (...args: unknown[]) => { if (key === "insert") inserted.push(args[0] as Record<string, unknown>); return builder; };
    } });
    return builder;
  }, rpc: () => Promise.resolve({ data: { model: "slot", creditSlots: [] }, error: null }) } as never;
  const ask = () => requestExternalSourcing({ admin, workspaceId: "w1", roleId: "r1", roleName: "Engineer",
    userId: "u1", trigger: "company_request", reason: "few strong candidates", now: NOW });
  const run = "20000000-0000-4000-8000-000000000001";
  const queued = await withLlmUsageContext({ requestId: run, companyRunId: run }, ask);
  assert.equal(queued.status, "queued");
  assert.deepEqual(inserted[0]!.input, { reason: "few strong candidates", webActionJobId: run });
  // What Harper reads back is unchanged.
  assert.equal(queued.modelOutput.includes(run), false);
  await ask();
  assert.deepEqual(inserted[1]!.input, { reason: "few strong candidates" });
});

/** Admin for the plan and request checks: runs counted as `roleRuns`, the plan summary and Role access from `billing`. */
function billingAdmin(billing: { model: string; creditSlots?: Array<Record<string, unknown>>; slotType?: string }, roleRuns = 0) {
  const inserts: string[] = [];
  const rpcs: string[] = [];
  const admin = {
    rpc: (name: string) => {
      rpcs.push(name);
      if (name === "workspace_billing_summary_v2") return Promise.resolve({ data: { model: billing.model, creditSlots: billing.creditSlots ?? [] }, error: null });
      if (name === "role_matching_slot_type_v1") return Promise.resolve({ data: billing.slotType ?? "free", error: null });
      return Promise.resolve({ data: true, error: null });
    },
    from: (table: string) => {
      const builder: object = new Proxy({}, { get(_t, key) {
        if (key === "then") return (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null, count: table === "external_sourcing_runs" ? roleRuns : 0 }).then(resolve);
        if (key === "single" || key === "maybeSingle") return () => Promise.resolve({ data: { id: "new", status: "requested" }, error: null });
        return (...args: unknown[]) => { if (key === "insert") inserts.push(table); void args; return builder; };
      } });
      return builder;
    },
  };
  return { admin: admin as never, inserts, rpcs };
}

test("a free workspace that used today's search for a Role is told so; a paid one is not held to it", async (t) => {
  serverModules(t, { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" });
  const { requestExternalSourcing } = await import("./externalSourcing.server");
  const ask = (model: string) => {
    const fake = billingAdmin({ model }, 1);
    return requestExternalSourcing({ admin: fake.admin, workspaceId: "w1", roleId: "r1", roleName: "Engineer",
      userId: "u1", trigger: "company_request", reason: "", now: NOW }).then((result) => ({ result, fake }));
  };
  const free = await ask("free");
  assert.equal(free.result.status, "not_queued");
  assert.equal((free.result as { reason?: string }).reason, "free_plan_daily_limit");
  assert.deepEqual(free.fake.inserts, []);
  for (const model of ["slot", "scale", "legacy"]) assert.equal((await ask(model)).result.status, "queued", model);
});

test("an outside connection request needs a connection left, like a member Intro request", async (t) => {
  serverModules(t, { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" });
  const { requestExternalIntro } = await import("./externalSourcing.server");
  const { WorkspaceBillingError, billingErrorCopy } = await import("@/lib/org/billing/types");
  const shared = (remaining: number) => ({ id: "free", slotId: null, roleId: null, remaining });
  const candidate = { id: "c1", name: "Ada", role_id: "r1", contact: { status: "found" }, intro: null } as never;
  const ask = (fake: ReturnType<typeof billingAdmin>, person = candidate) => requestExternalIntro({ admin: fake.admin, workspaceId: "w1",
    roleId: "r1", userId: "u1", candidate: person, companyAppeal: "Agent infra", introRecipientEmails: ["me@acme.example"], channel: "web" });

  const empty = billingAdmin({ model: "free", creditSlots: [shared(0)] });
  await assert.rejects(ask(empty), (error: unknown) => error instanceof WorkspaceBillingError && error.code === "credits_exhausted");
  assert.deepEqual(empty.inserts, []);
  // The same message as a member Intro request.
  assert.match(billingErrorCopy("credits_exhausted", "ko"), /연결이 모두 소진됐어요/);

  for (const [label, fake] of [
    ["one left", billingAdmin({ model: "free", creditSlots: [shared(1)] })],
    ["own slot credits", billingAdmin({ model: "slot", creditSlots: [shared(0), { id: "s1", slotId: "s1", roleId: "r1", remaining: 12 }] })],
    ["Harper-tailored Role", billingAdmin({ model: "free", creditSlots: [shared(0)], slotType: "paid" })],
    ["legacy", billingAdmin({ model: "legacy" })],
    ["scale", billingAdmin({ model: "scale" })],
  ] as const) {
    assert.equal((await ask(fake)).status, "requested", label);
    assert.deepEqual(fake.inserts, ["external_intro_requests"], label);
  }
  // An existing request is answered as before, without a credit check.
  const repeat = billingAdmin({ model: "free", creditSlots: [shared(0)] });
  await ask(repeat, { ...(candidate as object), intro: { status: "invited" } } as never);
  assert.equal(repeat.rpcs.includes("workspace_billing_summary_v2"), false);
});
