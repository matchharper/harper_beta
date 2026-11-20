import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { InterestSignal } from "./conversation";
import {
  COMPANY_MAILS_STOPPED, canAskCompanyFrom, companyAddressStep, companyContactProblem, companyMailStep, hiringEmailFromText,
  interestByPosting, mailTokens, meetsCompanySendRule, parseCompanyLines, plainTitle, postingKey, runCompanyMailsWith, safeLine1,
  textLeaks, type CompanyAddress, type CompanyMailIo, type CompanyMailRecord, type CompanyPostingFacts, type InterestedPerson,
  type LineRequest, type OutgoingCompanyMail, type StrongMember,
} from "./companyMail";

// Made-up people, companies and addresses only (public repo).
const NOW = new Date("2026-11-23T03:00:00Z"); // Monday 12:00 KST
const URL_A = "https://jobs.example.com/company-a/backend";
const URL_B = "https://jobs.example.com/company-a/data";
const URL_C = "https://jobs.example.com/company-c/pm";

const signal = (patch: Partial<InterestSignal>): InterestSignal => ({
  personId: "p1", postingUrl: URL_A, companyName: "Company A", postingTitle: "Backend Engineer", question: null,
  summaryConsent: true, at: "2026-11-23T01:00:00.000Z", messageId: "msg-1", ...patch,
});

const posting = (patch: Partial<CompanyPostingFacts> = {}): CompanyPostingFacts => ({
  postingUrl: URL_A, roleId: "role-a", companyName: "Company A", title: "Backend Engineer", location: "Seoul", open: true,
  outside: true, customer: false, text: "We build payment systems.", companyDomain: "company-a.example", language: "en", ...patch,
});

const NAMES: Record<string, string> = { p1: "Taylor Quill", p2: "Morgan Reed", p3: "Casey Lark" };
const person = (id: string, patch: Partial<InterestedPerson> = {}): InterestedPerson => ({
  personId: id, name: NAMES[id] ?? "Riley Stone", headline: "Backend Engineer at Northwind Pay", location: "Mexico City",
  currentCompany: "Northwind Pay", profileText: "Built payment APIs.", isTest: false, ...patch,
});

const member = (id: string, patch: Partial<StrongMember> = {}): StrongMember => ({
  talentId: id, name: "Jordan Vale", headline: "Senior Backend Engineer", location: "Seoul", years: 8,
  experiences: [{ role: "Senior Backend Engineer", company: "Bluecomet Telecom", description: "Settlement systems", current: true }],
  educations: [{ school: "Hanbit National University" }], ...patch,
});

type Fake = {
  io: CompanyMailIo;
  sent: OutgoingCompanyMail[];
  notes: Array<{ personId: string; text: string }>;
  calls: { address: number; members: number; lines: LineRequest[] };
};

function fake(options: {
  signals: InterestSignal[];
  postings?: Record<string, CompanyPostingFacts | null>;
  people?: Record<string, InterestedPerson>;
  members?: Record<string, StrongMember[] | null>;
  address?: Record<string, CompanyAddress>;
  previous?: Record<string, CompanyMailRecord[]>;
  minCandidates?: number;
  windowOpen?: boolean;
  stopped?: boolean;
  humanOwned?: string[];
  companyReplied?: boolean;
  suppressed?: string[];
  lines?: (request: LineRequest) => Record<string, string>;
  writeWithHistory?: CompanyMailIo["writeWithHistory"];
  quota?: number;
}): Fake {
  const sent: OutgoingCompanyMail[] = [];
  const notes: Fake["notes"] = [];
  const calls: Fake["calls"] = { address: 0, members: 0, lines: [] };
  const previous: Record<string, CompanyMailRecord[]> = { ...(options.previous ?? {}) };
  let quota = options.quota ?? 30;
  let ids = 0;
  const io: CompanyMailIo = {
    now: NOW,
    minCandidates: options.minCandidates ?? 2,
    senderName: "Ashley Kim",
    windowOpen: options.windowOpen ?? true,
    timeLeft: () => true,
    quotaLeft: async () => quota,
    stopped: async () => options.stopped ?? false,
    signals: async () => options.signals,
    posting: async (group) => {
      const url = group[0].postingUrl;
      return options.postings && url in options.postings ? options.postings[url] : posting({ postingUrl: url });
    },
    previousMails: async (url) => previous[url] ?? [],
    mailedToday: async () => sent.map((mail) => ({ companyName: mail.posting.companyName, toEmail: mail.to })),
    isHumanOwned: async (mailId) => (options.humanOwned ?? []).includes(mailId),
    companyReplied: async () => options.companyReplied ?? false,
    person: async (id) => options.people?.[id] ?? person(id),
    members: async (item) => {
      calls.members += 1;
      return options.members && item.postingUrl in options.members ? options.members[item.postingUrl] : [member("m1")];
    },
    address: async (item) => {
      calls.address += 1;
      return options.address?.[item.postingUrl] ?? { email: "jobs@company-a.example", source: "posting" };
    },
    suppressed: async (email) => (options.suppressed ?? []).includes(email),
    writeLines: async (request) => {
      calls.lines.push(request);
      return options.lines ? options.lines(request) : Object.fromEntries(request.candidates.map((candidate) => [candidate.label, `Shipped payments work (${candidate.label})`]));
    },
    newMailId: () => `mail-${++ids}`,
    links: (mailId) => ({ landingUrl: `https://matchharper.com/org?gtm=${mailId}`, unsubscribeUrl: `https://matchharper.com/u/${mailId}` }),
    send: async (mail) => {
      sent.push(mail);
      quota -= 1;
      const record: CompanyMailRecord = {
        id: mail.id, toEmail: mail.to, subject: mail.subject, createdAt: NOW.toISOString(), rfcMessageId: `${mail.id}@resend.example`, facts: mail.facts,
      };
      previous[mail.posting.postingUrl] = [...(previous[mail.posting.postingUrl] ?? []), record];
      return { status: "sent" };
    },
    note: async (personId, text) => { notes.push({ personId, text }); },
    writeWithHistory: options.writeWithHistory,
  };
  return { io, sent, notes, calls };
}

const earlier = (patch: Partial<CompanyMailRecord> = {}): CompanyMailRecord => ({
  id: "mail-0", toEmail: "jobs@company-a.example", subject: "Candidates for your Backend Engineer role", createdAt: "2026-11-20T03:00:00.000Z",
  rfcMessageId: "first@resend.example",
  facts: {
    variant: "S2", visible: 2, previousVisible: null, interestedPersonIds: ["p1"], newPersonIds: ["p1"], memberIds: ["m1"],
    lines: [], interestedCards: [{ personId: "p1", line1: "Backend Engineer · Mexico City", line2: "Built payment APIs" }],
    threadRootId: null, headers: null, contactSource: "posting",
  },
  ...patch,
});

// ---------------------------------------------------------------------------------------------------------------

test("signals group by posting: one per person (the latest), keeping the latest question", () => {
  const groups = interestByPosting([
    signal({ personId: "p1", at: "2026-11-22T01:00:00Z", question: "Remote from Mexico?" }),
    signal({ personId: "p1", at: "2026-11-22T05:00:00Z", question: null }),
    signal({ personId: "p2", at: "2026-11-22T03:00:00Z", postingUrl: `${URL_A}/` }),
    signal({ personId: "p3", at: "2026-11-22T03:00:00Z", postingUrl: URL_C }),
    signal({ personId: "p4", at: "2026-10-01T03:00:00Z" }),
  ], "2026-11-01T00:00:00Z");
  assert.deepEqual([...groups.keys()], [postingKey(URL_A), postingKey(URL_C)]);
  const a = groups.get(postingKey(URL_A)) ?? [];
  assert.deepEqual(a.map((item) => item.personId), ["p2", "p1"]);
  assert.equal(a.find((item) => item.personId === "p1")?.question, "Remote from Mexico?");
});

test("send rule: visible ≥ the minimum, at least one interested, and an address", () => {
  assert.equal(meetsCompanySendRule({ visible: 2, interested: 1, minCandidates: 2, hasAddress: true }), true);
  assert.equal(meetsCompanySendRule({ visible: 1, interested: 1, minCandidates: 2, hasAddress: true }), false);
  assert.equal(meetsCompanySendRule({ visible: 5, interested: 0, minCandidates: 2, hasAddress: true }), false);
  assert.equal(meetsCompanySendRule({ visible: 5, interested: 1, minCandidates: 2, hasAddress: false }), false);
  assert.equal(meetsCompanySendRule({ visible: 3, interested: 1, minCandidates: 4, hasAddress: true }), false);
  assert.equal(meetsCompanySendRule({ visible: 2, interested: 1, minCandidates: Number.NaN, hasAddress: true }), true);
});

test("the posting's own hiring address: a hiring mailbox first, never support/ATS, a personal one only after hiring words", () => {
  assert.equal(hiringEmailFromText("Questions: support@company-a.example. Apply: careers@company-a.example", "company-a.example"), "careers@company-a.example");
  assert.equal(hiringEmailFromText("Contact privacy@company-a.example or help@company-a.example", "company-a.example"), null);
  assert.equal(hiringEmailFromText("Send applications to jobs@greenhouse.io", "company-a.example"), null);
  assert.equal(hiringEmailFromText("Send your resume to jordan.vale@gmail.com", null), "jordan.vale@gmail.com");
  assert.equal(hiringEmailFromText("Our CTO is jordan.vale@gmail.com", null), null);
  assert.equal(hiringEmailFromText("지원 및 문의: hire.kr@company-a.example", "company-a.example"), "hire.kr@company-a.example");
  assert.equal(hiringEmailFromText("Reach the team at hello@company-a.example", "company-a.example"), null);
  assert.equal(hiringEmailFromText("recruit@other.example and recruit@company-a.example", "company-a.example"), "recruit@company-a.example");
});

test("address priority: the posting's address, then the lookup's, then a lookup (once, within the money)", () => {
  const text = "Apply at jobs@company-a.example";
  const found = { email: "talent@company-a.example", lookup: { runId: "r", startedAt: NOW.toISOString(), state: "done" as const } };
  assert.deepEqual(companyAddressStep({ postingText: text, companyDomain: "company-a.example", contact: found, mayLookup: true }),
    { kind: "address", email: "jobs@company-a.example", source: "posting" });
  assert.deepEqual(companyAddressStep({ postingText: "", companyDomain: null, contact: found, mayLookup: true }),
    { kind: "address", email: "talent@company-a.example", source: "lookup" });
  assert.equal(companyAddressStep({ postingText: "", companyDomain: null, contact: { email: null, lookup: { runId: "r", startedAt: "", state: "running" } }, mayLookup: true }).kind, "waiting");
  const none = companyAddressStep({ postingText: "", companyDomain: null, contact: { email: null, lookup: { runId: "r", startedAt: "", state: "done", reason: "other_domain" } }, mayLookup: true });
  assert.equal(none.kind, "none");
  assert.match(none.kind === "none" ? none.reason : "", /회사 도메인이 아닌 주소예요/);
  assert.deepEqual(companyAddressStep({ postingText: "", companyDomain: null, contact: null, mayLookup: true }), { kind: "start_lookup" });
  assert.equal(companyAddressStep({ postingText: "", companyDomain: null, contact: null, mayLookup: false }).kind, "waiting");
});

test("a lookup's address is used only on its page, on the company's domain, and not personal or generic", () => {
  const company = { companyName: "Company A", companyDomain: "company-a.example" };
  const page = "Talent team: talent@company-a.example";
  const found = (email: string, sourceUrl = "https://company-a.example/team") => ({ email, sourceUrl });
  assert.equal(companyContactProblem(found("talent@company-a.example"), page, company), null);
  assert.equal(companyContactProblem(found("talent@company-a.example"), "no address here", company), "not_on_page");
  assert.equal(companyContactProblem(found("talent@company-a.example"), null, company), "page_unreadable");
  assert.equal(companyContactProblem(found("talent@other.example"), "talent@other.example", company), "other_domain");
  assert.equal(companyContactProblem(found("jordan@gmail.com"), "jordan@gmail.com", company), "personal");
  assert.equal(companyContactProblem(found("support@company-a.example"), "support@company-a.example", company), "generic");
  assert.equal(companyContactProblem({ email: null, sourceUrl: null }, page, company), "not_found");
  // No known site: a domain named after the company.
  assert.equal(companyContactProblem(found("hr@companya.example"), "hr@companya.example", { companyName: "Company A", companyDomain: null }), null);
});

test("step: customers and Harper postings never, a closed posting stops, S3 only for someone new", () => {
  const interested = [signal({ personId: "p1" })];
  assert.equal(companyMailStep({ posting: { open: true, outside: true, customer: true }, interested, previous: [] }).action, "skip");
  assert.equal(companyMailStep({ posting: { open: true, outside: false, customer: false }, interested, previous: [] }).action, "skip");
  const closed = companyMailStep({ posting: { open: false, outside: true, customer: false }, interested, previous: [] });
  assert.equal(closed.action === "skip" && closed.note, true);
  assert.equal(companyMailStep({ posting: { open: true, outside: true, customer: false }, interested, previous: [] }).action, "first");
  assert.equal(companyMailStep({ posting: { open: true, outside: true, customer: false }, interested, previous: [earlier()] }).action, "skip");
  const next = companyMailStep({ posting: { open: true, outside: true, customer: false }, interested: [...interested, signal({ personId: "p2" })], previous: [earlier()] });
  assert.equal(next.action, "followup");
  assert.deepEqual(next.action === "followup" ? next.interested.map((item) => item.personId) : [], ["p2"]);
});

test("canAskCompany: only when a mail could actually go", () => {
  const open = { open: true, outside: true, customer: false };
  const facts = { posting: open, stopped: false, address: "lookup_possible" as const, suppressed: false, humanOwned: false, testToRealCompany: false };
  assert.equal(canAskCompanyFrom(facts), true);
  assert.equal(canAskCompanyFrom({ ...facts, address: "known" }), true);
  assert.equal(canAskCompanyFrom({ ...facts, address: "none" }), false);
  assert.equal(canAskCompanyFrom({ ...facts, posting: { ...open, customer: true } }), false);
  assert.equal(canAskCompanyFrom({ ...facts, posting: { ...open, open: false } }), false);
  assert.equal(canAskCompanyFrom({ ...facts, posting: { ...open, outside: false } }), false);
  assert.equal(canAskCompanyFrom({ ...facts, posting: null }), false);
  assert.equal(canAskCompanyFrom({ ...facts, stopped: true }), false);
  assert.equal(canAskCompanyFrom({ ...facts, suppressed: true }), false);
  assert.equal(canAskCompanyFrom({ ...facts, humanOwned: true }), false);
  assert.equal(canAskCompanyFrom({ ...facts, testToRealCompany: true }), false);
  assert.equal(canAskCompanyFrom({ ...facts, reachesMinimum: false }), false);
  assert.equal(canAskCompanyFrom({ ...facts, reachesMinimum: null }), true);
});

test("the leak check blocks names, employers, schools, links and addresses of anyone in the mail", () => {
  const tokens = mailTokens([person("p1")], [member("m1")]);
  assert.deepEqual(textLeaks("Built payment APIs at scale", tokens), []);
  assert.ok(textLeaks("Taylor built payment APIs", tokens).includes("taylor"));
  assert.ok(textLeaks("Northwind Pay에서 결제 API", tokens).includes("northwind pay"));
  assert.ok(textLeaks("Led settlement at Bluecomet", tokens).includes("bluecomet"));
  assert.ok(textLeaks("한빛 출신, Hanbit National University 졸업", tokens).includes("hanbit national university"));
  assert.ok(textLeaks("Jordan led settlement", tokens).includes("jordan"));
  assert.deepEqual(textLeaks("see github.com/someone", tokens), ["링크"]);
  assert.ok(textLeaks("write to someone@example.com", tokens).includes("이메일"));
  // Line 1 drops a title that names an employer.
  assert.equal(plainTitle("Backend Engineer at Northwind Pay | ex-Bluecomet"), "Backend Engineer");
  assert.equal(safeLine1({ title: "Northwind Pay Backend Lead", years: 6, location: "Seoul" }, "en", tokens), "6 years · Seoul");
});

test("one mail per posting with every interested candidate of the day, members after them, sent once", async () => {
  const { io, sent, notes } = fake({
    signals: [
      signal({ personId: "p1", question: "Can this role be done remotely from Mexico?", at: "2026-11-23T01:00:00Z" }),
      signal({ personId: "p2", at: "2026-11-23T02:00:00Z" }),
    ],
  });
  const result = await runCompanyMailsWith(io);
  assert.equal(result.sent, 1);
  assert.equal(sent.length, 1);
  const mail = sent[0];
  assert.equal(mail.to, "jobs@company-a.example");
  assert.equal(mail.facts.variant, "S1");
  assert.equal(mail.facts.visible, 3);
  assert.deepEqual(mail.facts.interestedPersonIds, ["p1", "p2"]);
  assert.deepEqual(mail.facts.memberIds, ["m1"]);
  assert.equal(mail.personId, "p1");
  assert.match(mail.text, /I know of 3 people who'd fit your Backend Engineer role/);
  assert.match(mail.text, /Can this role be done remotely from Mexico\?/);
  assert.equal((mail.text.match(/\(interested\)/g) ?? []).length, 2);
  assert.equal(mail.facts.interestedCards.length, 2);
  assert.ok(notes.some((note) => note.personId === "p1" && note.text.startsWith("회사 메일 보냄 (S1)")));
  // Nobody new: the next tick sends nothing.
  assert.equal((await runCompanyMailsWith(io)).sent, 0);
});

test("one mail per company a day: a second posting of the same company waits for tomorrow", async () => {
  const { io, sent } = fake({
    signals: [signal({ personId: "p1" }), signal({ personId: "p2", postingUrl: URL_B, postingTitle: "Data Engineer" })],
    postings: { [URL_B]: posting({ postingUrl: URL_B, title: "Data Engineer" }) },
  });
  const result = await runCompanyMailsWith(io);
  assert.equal(sent.length, 1);
  assert.equal(result.waiting.company_mailed_today, 1);
});

test("below the minimum, no address, a closed posting, a customer: no mail (and no paid lookup below the minimum)", async () => {
  const below = fake({ signals: [signal({})], minCandidates: 3 });
  assert.equal((await runCompanyMailsWith(below.io)).waiting.below_minimum, 1);
  assert.equal(below.calls.address, 0);

  const noMembers = fake({ signals: [signal({})], members: { [URL_A]: [] } });
  assert.equal((await runCompanyMailsWith(noMembers.io)).sent, 0);

  const waiting = fake({ signals: [signal({})], address: { [URL_A]: { waiting: "채용 담당자 주소를 찾는 중이에요" } } });
  assert.equal((await runCompanyMailsWith(waiting.io)).waiting.address_waiting, 1);
  assert.equal(waiting.sent.length, 0);

  const none = fake({ signals: [signal({})], address: { [URL_A]: { none: "채용 담당자 주소를 찾지 못했어요" } } });
  await runCompanyMailsWith(none.io);
  assert.equal(none.sent.length, 0);
  assert.ok(none.notes.some((note) => note.text.includes("주소가 없어요")));

  const closed = fake({ signals: [signal({})], postings: { [URL_A]: posting({ open: false }) } });
  await runCompanyMailsWith(closed.io);
  assert.equal(closed.sent.length, 0);
  assert.ok(closed.notes.some((note) => note.text.includes("공고가 닫혀")));

  const customer = fake({ signals: [signal({})], postings: { [URL_A]: posting({ customer: true }) } });
  await runCompanyMailsWith(customer.io);
  assert.equal(customer.sent.length, 0);

  const suppressed = fake({ signals: [signal({})], suppressed: ["jobs@company-a.example"] });
  await runCompanyMailsWith(suppressed.io);
  assert.equal(suppressed.sent.length, 0);
});

test("outside the send window, stopped after a complaint, or at the daily cap: nothing goes", async () => {
  const closed = fake({ signals: [signal({})], windowOpen: false });
  assert.equal((await runCompanyMailsWith(closed.io)).sent, 0);
  const stopped = fake({ signals: [signal({})], stopped: true });
  const result = await runCompanyMailsWith(stopped.io);
  assert.deepEqual(result.problems, [COMPANY_MAILS_STOPPED]);
  assert.equal(stopped.sent.length, 0);
  const capped = fake({ signals: [signal({})], quota: 0 });
  assert.equal((await runCompanyMailsWith(capped.io)).waiting.daily_cap, 1);
  assert.equal(capped.sent.length, 0);
});

test("test candidates never start a company mail", async () => {
  const { io, sent, calls } = fake({ signals: [signal({})], people: { p1: person("p1", { isTest: true }) } });
  assert.equal((await runCompanyMailsWith(io)).waiting.test_only, 1);
  assert.equal(sent.length, 0);
  assert.equal(calls.address, 0);
});

test("S3: only a new interested candidate sends again, in the same thread; members growing alone never does", async () => {
  const membersGrew = fake({
    signals: [signal({ personId: "p1", at: "2026-11-21T01:00:00Z" })],
    previous: { [URL_A]: [earlier()] },
    members: { [URL_A]: [member("m1"), member("m2"), member("m3")] },
  });
  assert.equal((await runCompanyMailsWith(membersGrew.io)).sent, 0);

  const { io, sent } = fake({
    signals: [signal({ personId: "p1", at: "2026-11-21T01:00:00Z" }), signal({ personId: "p2", question: "Is visa support offered?" })],
    previous: { [URL_A]: [earlier()] },
  });
  const result = await runCompanyMailsWith(io);
  assert.equal(result.sent, 1, JSON.stringify(result));
  const mail = sent[0];
  assert.equal(mail.facts.variant, "S3");
  assert.equal(mail.to, "jobs@company-a.example");
  assert.equal(mail.subject, "Re: Candidates for your Backend Engineer role");
  assert.deepEqual(mail.headers, { "In-Reply-To": "<first@resend.example>", References: "<first@resend.example>" });
  assert.equal(mail.facts.threadRootId, "mail-0");
  assert.deepEqual(mail.facts.newPersonIds, ["p2"]);
  assert.deepEqual(mail.facts.interestedPersonIds, ["p1", "p2"]);
  assert.equal(mail.facts.previousVisible, 2);
  assert.equal(mail.facts.visible, 3);
  assert.equal(mail.facts.interestedCards.length, 2);
  assert.match(mail.text, /Last time I shared 2 people who fit your Backend Engineer role/);
  assert.match(mail.text, /Is visa support offered\?/);
  assert.match(mail.text, /including the ones from my last email/);
});

test("a thread a human answered gets nothing; one the company answered goes to the writer or to a human", async () => {
  const signals = [signal({ personId: "p1", at: "2026-11-21T01:00:00Z" }), signal({ personId: "p2" })];
  const owned = fake({ signals, previous: { [URL_A]: [earlier()] }, humanOwned: ["mail-0"] });
  await runCompanyMailsWith(owned.io);
  assert.equal(owned.sent.length, 0);
  assert.ok(owned.notes.some((note) => note.text.includes("사람이 답한 회사 스레드")));

  const pending = fake({ signals, previous: { [URL_A]: [earlier({ rfcMessageId: null })] } });
  assert.equal((await runCompanyMailsWith(pending.io)).waiting.thread_id_pending, 1);

  const handed = fake({ signals, previous: { [URL_A]: [earlier()] }, companyReplied: true });
  await runCompanyMailsWith(handed.io);
  assert.equal(handed.sent.length, 0);
  assert.ok(handed.notes.some((note) => note.text.includes("사람이 이어 써야 해요")));

  let asked: Parameters<NonNullable<CompanyMailIo["writeWithHistory"]>>[0] | null = null;
  const written = fake({
    signals, previous: { [URL_A]: [earlier()] }, companyReplied: true,
    writeWithHistory: async (input) => { asked = input; return { bodyText: "Thanks for getting back to me.\n\nOne more person is interested now." }; },
  });
  await runCompanyMailsWith(written.io);
  assert.equal(written.sent.length, 1);
  assert.equal(written.sent[0].facts.variant, "written");
  assert.equal(written.sent[0].subject, "Re: Candidates for your Backend Engineer role");
  assert.match(written.sent[0].text, /Thanks for getting back to me\./);
  assert.deepEqual(asked && (asked as { threadMailIds: string[] }).threadMailIds, ["mail-0"]);

  const leaky = fake({
    signals, previous: { [URL_A]: [earlier()] }, companyReplied: true,
    writeWithHistory: async () => ({ bodyText: "Morgan from Northwind Pay is interested." }),
  });
  await runCompanyMailsWith(leaky.io);
  assert.equal(leaky.sent.length, 0);
});

test("lines that leak are written once more, then dropped: never a name, employer or school in the mail", async () => {
  const { io, sent, calls } = fake({
    signals: [signal({ personId: "p1" }), signal({ personId: "p2", summaryConsent: false })],
    members: { [URL_A]: [member("m1"), member("m2")] },
    lines: (request) => Object.fromEntries(request.candidates.map((candidate) => [
      candidate.label, candidate.label === "M1" ? "Led settlement at Bluecomet Telecom" : `Shipped payments work (${candidate.label})`,
    ])),
  });
  await runCompanyMailsWith(io);
  assert.equal(sent.length, 1);
  const text = sent[0].text;
  assert.doesNotMatch(text, /Bluecomet|Northwind|Hanbit|Jordan|Taylor|Morgan/);
  assert.equal(calls.lines.length, 2);
  assert.deepEqual(calls.lines[1].candidates.map((candidate) => candidate.label), ["M1"]);
  // p2 gave no consent: only the "one more" line, never a summary; m1's line leaked twice: m2 is shown instead.
  assert.match(text, /One more person has shown direct interest in the role/);
  assert.deepEqual(sent[0].facts.lines.map((line) => line.id), ["p1", "m2"]);
  assert.deepEqual(sent[0].facts.interestedCards.map((card) => card.personId), ["p1"]);
});

test("a question that names someone holds the mail for a human", async () => {
  const { io, sent, notes } = fake({ signals: [signal({ question: "Does Northwind Pay experience count?" })] });
  await runCompanyMailsWith(io);
  assert.equal(sent.length, 0);
  assert.ok(notes.some((note) => note.text.includes("질문에 이름·회사·학교·링크")));
});

test("at most 3 candidate bullets, interested first; N still counts everyone", async () => {
  const { io, sent } = fake({
    signals: [signal({ personId: "p1" }), signal({ personId: "p2" })],
    members: { [URL_A]: [member("m1"), member("m2"), member("m3"), member("m4"), member("m5"), member("m6")] },
  });
  await runCompanyMailsWith(io);
  const mail = sent[0];
  assert.deepEqual(mail.facts.lines.map((line) => line.id), ["p1", "p2", "m1"]);
  assert.equal(mail.facts.visible, 8);
  assert.equal((mail.text.match(/^• /gm) ?? []).length, 3);
  assert.match(mail.text, /See all 8 candidates/);
});

test("the line writer's output is read by label; anything malformed is no line", () => {
  assert.deepEqual(parseCompanyLines({ lines: [{ label: "I1", line: "Built it" }, { label: "", line: "x" }, { nope: 1 }] }), { I1: "Built it" });
  assert.deepEqual(parseCompanyLines(null), {});
  assert.deepEqual(parseCompanyLines({ lines: "x" }), {});
});

test("candidate counts read only candidate mails (audience filters on the shared gtm_mails reads)", () => {
  const read = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
  const send = read("send.server.ts");
  const pending = send.slice(send.indexOf("export async function listPendingAgentMails"));
  assert.match(pending.slice(0, 600), /\.eq\("audience", "candidate"\)/);
  assert.match(read("views.server.ts"), /m\.agent_person_id = p\.id and m\.campaign = 'agent' and m\.audience = 'candidate'/);
  assert.match(read("run.server.ts"), /m\.agent_person_id = p\.id and m\.audience = 'candidate' and m\.status = 'sending'/);
  // Company mails are written as campaign agent / audience company (the one daily cap counts both).
  assert.match(read("companyMail.server.ts"), /campaign: "agent", audience: "company"/);
});
