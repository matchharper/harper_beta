import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { InterestSignal } from "./conversation";
import {
  COMPANY_MAILS_STOPPED, canAskCompanyFrom, checkedLines, companyAddressStep, companyContactProblem, companyMailStep, hiringEmailFromText,
  interestByPosting, mailTokens, matchesCustomer, meetsCompanySendRule, parseCompanyLines, personFactsText, plainTitle, postingKey, runCompanyMailsWith, safeLine1,
  textLeaks, type CompanyAddress, type CompanyMailIo, type CompanyMailRecord, type CompanyPostingFacts, type InterestedPerson,
  type LineRequest, type OutgoingCompanyMail, type StrongMember, type WrittenLine, companyContactQuery, lookupCanConfirm, usablePostAddress,
} from "./companyMail";
import { SOURCING_SKIP, type RecentCompanyMail, type SourcedOpening, type SourcingLead } from "./companySourcing";

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
  lines?: (request: LineRequest) => Record<string, string | WrittenLine>;
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
      const written = options.lines ? options.lines(request) : Object.fromEntries(request.candidates.map((candidate) => [candidate.label, `Shipped payments work (${candidate.label})`]));
      return Object.fromEntries(Object.entries(written).map(([label, line]) => [label, typeof line === "string" ? { line, head: "" } : line]));
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

test("send rule: one candidate who agreed is enough, with an address (Shaun 11/21 17:04)", () => {
  assert.equal(meetsCompanySendRule({ agreed: 1, hasAddress: true }), true);
  assert.equal(meetsCompanySendRule({ agreed: 0, hasAddress: true }), false);
  assert.equal(meetsCompanySendRule({ agreed: 2, hasAddress: false }), false);
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

test("Ashley already wrote to the company's address today (a reply, the joined mail): the company mail waits for the next send day", async () => {
  const { io, sent } = fake({ signals: [signal({ personId: "p1" })] });
  io.ashleyMailedToday = async (email) => email === "jobs@company-a.example";
  const result = await runCompanyMailsWith(io);
  assert.equal(sent.length, 0);
  assert.equal(result.waiting.ashley_mailed_today, 1);
  io.ashleyMailedToday = async () => false;
  assert.equal((await runCompanyMailsWith(io)).sent, 1);
});

test("nobody agreed, no address, a closed posting, a customer: no mail (and no paid lookup without an agreement)", async () => {
  const notAgreed = fake({ signals: [signal({ summaryConsent: false, question: "Remote from Mexico?" })] });
  assert.equal((await runCompanyMailsWith(notAgreed.io)).waiting.not_agreed, 1);
  assert.equal(notAgreed.calls.address, 0);

  // One candidate who agreed is enough, even with no Harper member for the posting (Shaun 11/21 16:50).
  const noMembers = fake({ signals: [signal({})], members: { [URL_A]: [] } });
  assert.equal((await runCompanyMailsWith(noMembers.io)).sent, 1);
  assert.deepEqual(noMembers.sent[0].facts.memberIds, []);

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
  assert.deepEqual(mail.facts.askedPersonIds, ["p1", "p2"]);
  // The first mail's members stay the thread's (the landing of this mail shows them too).
  assert.deepEqual(mail.facts.memberIds, ["m1"]);
  assert.equal(mail.facts.previousVisible, 2);
  assert.equal(mail.facts.visible, 3);
  assert.equal(mail.facts.interestedCards.length, 2);
  assert.match(mail.text, /Last time I shared 2 people who fit your Backend Engineer role/);
  assert.match(mail.text, /Is visa support offered\?/);
  assert.match(mail.text, /candidates so far in one place/);
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

test("agreed candidates first, then at most 2 members; only the members shown are stored and counted", async () => {
  const { io, sent } = fake({
    signals: [signal({ personId: "p1" }), signal({ personId: "p2" })],
    members: { [URL_A]: [member("m1"), member("m2"), member("m3"), member("m4"), member("m5"), member("m6")] },
  });
  await runCompanyMailsWith(io);
  const mail = sent[0];
  assert.deepEqual(mail.facts.lines.map((line) => line.id), ["p1", "p2", "m1", "m2"]);
  assert.deepEqual(mail.facts.memberIds, ["m1", "m2"]);
  assert.equal(mail.facts.visible, 4);
  assert.equal((mail.text.match(/^• /gm) ?? []).length, 4);
  assert.match(mail.text, /See all 4 candidates/);
});

test("a candidate who did not agree is only a number: no line and never their question", async () => {
  const { io, sent } = fake({
    signals: [signal({ personId: "p1" }), signal({ personId: "p2", summaryConsent: false, question: "Do you sponsor visas?" })],
  });
  await runCompanyMailsWith(io);
  const mail = sent[0];
  assert.deepEqual(mail.facts.askedPersonIds, ["p1"]);
  assert.ok(!mail.facts.lines.some((line) => line.id === "p2"));
  assert.doesNotMatch(mail.text, /sponsor visas/);
});

test("a candidate counted earlier without agreeing who agrees later gets a mail in the thread", async () => {
  const counted = earlier({ facts: { ...earlier().facts!, interestedPersonIds: ["p1", "p2"], askedPersonIds: ["p1"] } });
  const { io, sent } = fake({
    signals: [signal({ personId: "p1", at: "2026-11-21T01:00:00Z" }), signal({ personId: "p2", question: "Is visa support offered?" })],
    previous: { [URL_A]: [counted] },
  });
  assert.equal((await runCompanyMailsWith(io)).sent, 1);
  assert.equal(sent[0].facts.variant, "S3");
  assert.deepEqual(sent[0].facts.newPersonIds, ["p2"]);
});

test("S3: a person counted earlier who still has not agreed is not new interest again", async () => {
  // Mail 1: p1 agreed, p2 counted only. Now p3 agrees: one new person, not two.
  const counted = earlier({ facts: { ...earlier().facts!, interestedPersonIds: ["p1", "p2"], askedPersonIds: ["p1"] } });
  const { io, sent, notes } = fake({
    signals: [signal({ personId: "p1", at: "2026-11-21T01:00:00Z" }), signal({ personId: "p2", summaryConsent: false }), signal({ personId: "p3" })],
    previous: { [URL_A]: [counted] },
  });
  assert.equal((await runCompanyMailsWith(io)).sent, 1);
  assert.deepEqual(sent[0].facts.newPersonIds, ["p3"]);
  assert.ok(!notes.some((note) => note.personId === "p2" && note.text.startsWith("회사 메일 보냄")));
});

test("an English mail's Korean line 1 is given in English by the line writer; a leaking or still-Korean one stays as code wrote it", async () => {
  const korean = (id: string) => member(id, {
    headline: "백엔드 개발자", location: "서울", years: 6,
    experiences: [{ role: "백엔드 개발자", company: "Bluecomet Telecom", description: "Settlement systems", current: true }],
  });
  // m2's English line 1 names its employer: it stays as code wrote it.
  const heads: Record<string, string> = { M1: "Backend Engineer · 6 years · Seoul", M2: "Backend Engineer at Bluecomet · 6 years · Seoul" };
  const { io, sent, calls } = fake({
    signals: [signal({ personId: "p1" })],
    members: { [URL_A]: [korean("m1"), korean("m2")] },
    lines: (request) => Object.fromEntries(request.candidates.map((candidate) => [
      candidate.label, { line: `Shipped payments work (${candidate.label})`, head: heads[candidate.label] ?? "" },
    ])),
  });
  await runCompanyMailsWith(io);
  assert.equal(sent.length, 1);
  // Asked only for the Korean ones (p1's line 1 is "Backend Engineer · Mexico City" by code).
  assert.deepEqual(calls.lines[0].candidates.map((candidate) => candidate.head ?? null), [null, "백엔드 개발자 · 6 years · 서울", "백엔드 개발자 · 6 years · 서울"]);
  assert.deepEqual(sent[0].facts.lines.map((line) => line.line1), [
    "Backend Engineer · Mexico City", "Backend Engineer · 6 years · Seoul", "백엔드 개발자 · 6 years · 서울",
  ]);
  assert.doesNotMatch(sent[0].text, /Bluecomet/);
  // An English line 1 that still has Korean letters is not used either.
  const kept = await checkedLines({
    write: async () => ({ M1: { line: "Shipped payments work", head: "백엔드 Engineer · Seoul" } }),
    request: { language: "en", posting: { companyName: "Company A", title: "Backend Engineer", text: "" }, personId: "p1" },
    candidates: [{ label: "M1", facts: "x", head: "백엔드 개발자 · 서울" }], tokens: [],
  });
  assert.deepEqual(kept.get("M1"), { line: "Shipped payments work", head: null });
});

test("a Korean mail never asks the line writer for line 1", async () => {
  const { io, calls } = fake({
    signals: [signal({ personId: "p1" })],
    postings: { [URL_A]: posting({ language: "ko" }) },
    members: { [URL_A]: [member("m1", { location: "서울" })] },
  });
  await runCompanyMailsWith(io);
  assert.ok(calls.lines.length >= 1);
  assert.ok(calls.lines.every((request) => request.candidates.every((candidate) => candidate.head === undefined)));
});

test("the line writer's output is read by label; anything malformed is no line", () => {
  assert.deepEqual(parseCompanyLines({ lines: [{ label: "I1", line: "Built it" }, { label: "", line: "x" }, { nope: 1 }] }), { I1: { line: "Built it", head: "" } });
  assert.deepEqual(parseCompanyLines({ lines: [{ label: "M1", line: "Built it", head: "Backend Engineer · Seoul" }] }), { M1: { line: "Built it", head: "Backend Engineer · Seoul" } });
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

test("the line writer never reads an outside candidate's free profile text (its employers and schools are not checkable)", () => {
  const facts = personFactsText({
    personId: "00000000-0000-4000-8000-000000000001", name: "Test Person", headline: "Backend Engineer",
    location: "Seoul", currentCompany: "Company A", profileText: "Worked at Company B, studied at School C", isTest: true,
  });
  assert.match(facts, /Backend Engineer/);
  assert.doesNotMatch(facts, /Company B|School C/);
});

test("a customer is found by workspace, by name without (주) or a legal suffix, or by web domain", () => {
  const customers = [{ id: "w1", names: ["(주)컴퍼니에이", "Company A Inc."], domains: ["https://www.company-a.example.com/about", null] }];
  const posting = (patch: Partial<{ names: string[]; domain: string | null; workspaceId: string | null }>) => ({
    names: ["Other"], domain: null, workspaceId: null, ...patch,
  });
  assert.equal(matchesCustomer(customers, posting({ workspaceId: "w1" })), true);
  assert.equal(matchesCustomer(customers, posting({ names: ["컴퍼니에이"] })), true);
  assert.equal(matchesCustomer(customers, posting({ names: ["company a"] })), true);
  assert.equal(matchesCustomer(customers, posting({ domain: "company-a.example.com" })), true);
  assert.equal(matchesCustomer(customers, posting({ domain: "careers.company-a.example.com" })), true);
  assert.equal(matchesCustomer(customers, posting({ names: ["Company B"], domain: "company-b.example.com" })), false);
  // A host many companies share is never a match.
  assert.equal(matchesCustomer([{ id: "w2", names: [], domains: ["https://company-c.notion.site"] }], posting({ domain: "company-d.notion.site" })), false);
});

test("a candidate who asked us to stop (or is on the opt-out list) is never pitched to a company", async () => {
  const { io, sent, calls } = fake({ signals: [signal({})], people: { p1: person("p1", { stopped: true }) } });
  assert.equal((await runCompanyMailsWith(io)).waiting.stopped_only, 1);
  assert.equal(sent.length, 0);
  assert.equal(calls.address, 0);
});

// ---------------------------------------------------------------------------------------------------------------
// Company sourcing (Shaun 11/23 17:13)

const POST_A = "https://www.linkedin.com/posts/riley-moss_hiring-backend-1";
const POST_B = "https://www.linkedin.com/posts/sam-park_hiring-data-2";

const lead = (patch: Partial<SourcingLead> = {}): SourcingLead => ({
  personId: "lead-1", name: "Riley Moss", headline: "Head of Engineering at Company B", profileUrl: "https://www.linkedin.com/in/riley-moss",
  currentCompany: "Company B", location: "Seoul", postUrl: POST_A,
  postText: "We're hiring a Backend Engineer for our payments team in Seoul. Go and Postgres.", postAt: "2026-11-22T01:00:00.000Z",
  email: "riley@company-b.example", searchGroup: null, opening: null, ...patch,
});

type SourcingFake = {
  skips: Array<{ personId: string; reason: string; detail: string | null }>;
  kept: Array<{ personId: string; opening: SourcedOpening }>;
  calls: { readOpening: number; address: number; customer: number };
};

/** The fake's sourcing I/O on top of fake() (its sent mails are the recent ones too, as the server reads them). */
function withSourcing(base: Fake, options: {
  leads: SourcingLead[];
  room?: number;
  recent?: RecentCompanyMail[];
  customers?: string[];
  domain?: string | null;
  opening?: (lead: SourcingLead) => SourcedOpening | null;
  address?: CompanyAddress;
} ): SourcingFake {
  const result: SourcingFake = { skips: [], kept: [], calls: { readOpening: 0, address: 0, customer: 0 } };
  let room = options.room ?? 20;
  const handled = new Set<string>();
  const send = base.io.send;
  base.io.send = async (mail) => {
    const sent = await send(mail);
    if (sent.status === "sent" && mail.facts.channel === "company_post") room -= 1;
    if (sent.status === "sent" && mail.facts.variant === "S0") handled.add(mail.personId);
    return sent;
  };
  base.io.sourcing = {
    roomLeft: async () => room,
    leads: async () => options.leads.filter((item) => !handled.has(item.personId)),
    recentMails: async () => [...(options.recent ?? []), ...base.sent.map((mail) => ({ companyName: mail.posting.companyName, toEmail: mail.to }))],
    customer: async (names) => { result.calls.customer += 1; return names.some((name) => (options.customers ?? []).includes(name)); },
    companyDomain: async () => options.domain ?? null,
    readOpening: async (item) => {
      result.calls.readOpening += 1;
      return options.opening ? options.opening(item) : { companyName: null, title: "Backend Engineer", location: "Seoul", requirements: "Go, Postgres", website: null };
    },
    keepOpening: async (personId, opening) => { result.kept.push({ personId, opening }); },
    address: async () => { result.calls.address += 1; return options.address ?? { email: "talent@company-b.example", source: "lookup" }; },
    skip: async (personId, reason, detail) => { handled.add(personId); result.skips.push({ personId, reason, detail: detail ?? null }); },
  };
  return result;
}

test("sourcing: a hiring post with fitting members gets one S0 to the address the poster wrote, greeting them by name", async () => {
  const base = fake({ signals: [], members: { [POST_A]: [member("m1"), member("m2"), member("m3")] } });
  const sourcing = withSourcing(base, { leads: [lead()] });
  const result = await runCompanyMailsWith(base.io);
  assert.equal(result.sent, 1);
  const mail = base.sent[0];
  assert.equal(mail.to, "riley@company-b.example");
  assert.equal(mail.personId, "lead-1");
  assert.equal(mail.posting.postingUrl, POST_A);
  assert.equal(mail.posting.companyName, "Company B");
  assert.equal(mail.posting.title, "Backend Engineer");
  assert.match(mail.posting.text, /^Go, Postgres\n\nWe're hiring a Backend Engineer/);
  assert.equal(mail.facts.variant, "S0");
  assert.equal(mail.facts.channel, "company_post");
  assert.equal(mail.facts.sourcedPersonId, "lead-1");
  assert.equal(mail.facts.recipientName, "Riley");
  assert.deepEqual(mail.facts.memberIds, ["m1", "m2"]);
  assert.equal(mail.facts.visible, 2);
  assert.deepEqual(mail.facts.interestedPersonIds, []);
  assert.match(mail.text, /^Hi Riley,/);
  assert.match(mail.text, /I know of 2 people who'd fit your Backend Engineer role/);
  assert.doesNotMatch(mail.text, /interest|Jordan|Bluecomet|Hanbit/);
  // Read once and kept; no paid lookup for an address the post gives.
  assert.equal(sourcing.calls.readOpening, 1);
  assert.equal(sourcing.kept.length, 1);
  assert.equal(sourcing.calls.address, 0);
  assert.ok(base.notes.some((note) => note.personId === "lead-1" && note.text.startsWith("회사 메일 보냄 (S0) · Company B · Backend Engineer")));
  // Handled: nothing more for it.
  assert.equal((await runCompanyMailsWith(base.io)).sent, 0);
});

test("sourcing: the interest mails go first, and the tick's 3 mails are shared", async () => {
  const base = fake({
    signals: [signal({ personId: "p1" }), signal({ personId: "p2", postingUrl: URL_C, companyName: "Company C", postingTitle: "PM" })],
    postings: { [URL_C]: posting({ postingUrl: URL_C, companyName: "Company C", title: "PM" }) },
    address: { [URL_C]: { email: "jobs@company-c.example", source: "posting" } },
  });
  withSourcing(base, {
    leads: [lead(), lead({ personId: "lead-2", postUrl: POST_B, currentCompany: "Company D", email: "sam@company-d.example" }),
      lead({ personId: "lead-3", postUrl: "https://www.linkedin.com/posts/x-3", currentCompany: "Company E", email: "x@company-e.example" })],
  });
  const result = await runCompanyMailsWith(base.io);
  assert.equal(result.sent, 3);
  assert.deepEqual(base.sent.map((mail) => mail.facts.variant), ["S2", "S2", "S0"]);
});

test("sourcing: a customer, a company mailed within 30 days, no fitting member, no address: no mail, the reason on the row", async () => {
  const customer = fake({ signals: [] });
  const c = withSourcing(customer, { leads: [lead()], customers: ["Company B"] });
  await runCompanyMailsWith(customer.io);
  assert.deepEqual(c.skips.map((item) => item.reason), [SOURCING_SKIP.customer]);
  assert.equal(c.calls.readOpening, 0);

  const recent = fake({ signals: [] });
  const r = withSourcing(recent, { leads: [lead()], recent: [{ companyName: "Company B Inc.", toEmail: "jobs@company-b.example" }] });
  await runCompanyMailsWith(recent.io);
  assert.deepEqual(r.skips.map((item) => item.reason), [SOURCING_SKIP.recent]);

  // The same address domain, known only once the lookup found it.
  const domain = fake({ signals: [] });
  const d = withSourcing(domain, {
    leads: [lead({ email: null, currentCompany: "Company B" })],
    recent: [{ companyName: "Other name", toEmail: "careers@company-b.example" }],
  });
  await runCompanyMailsWith(domain.io);
  assert.equal(d.calls.address, 1);
  assert.deepEqual(d.skips.map((item) => item.reason), [SOURCING_SKIP.recent]);
  assert.equal(domain.sent.length, 0);

  const noMembers = fake({ signals: [], members: { [POST_A]: [] } });
  const m = withSourcing(noMembers, { leads: [lead({ email: null })] });
  await runCompanyMailsWith(noMembers.io);
  assert.deepEqual(m.skips.map((item) => item.reason), [SOURCING_SKIP.noMembers]);
  assert.equal(m.calls.address, 0, "no paid lookup without a fitting member");
  assert.equal(noMembers.sent.length, 0);

  const none = fake({ signals: [] });
  const n = withSourcing(none, { leads: [lead({ email: null })], address: { none: "채용 담당자 주소를 찾지 못했어요" } });
  await runCompanyMailsWith(none.io);
  assert.deepEqual(n.skips, [{ personId: "lead-1", reason: SOURCING_SKIP.noAddress, detail: "채용 담당자 주소를 찾지 못했어요" }]);

  const suppressed = fake({ signals: [], suppressed: ["riley@company-b.example"] });
  const s = withSourcing(suppressed, { leads: [lead()] });
  await runCompanyMailsWith(suppressed.io);
  assert.deepEqual(s.skips.map((item) => item.reason), [SOURCING_SKIP.noAddress]);
  assert.equal(suppressed.sent.length, 0);

  // A lookup still running: the post waits, unmarked.
  const waiting = fake({ signals: [] });
  const w = withSourcing(waiting, { leads: [lead({ email: null })], address: { waiting: "채용 담당자 주소를 찾는 중이에요" } });
  assert.equal((await runCompanyMailsWith(waiting.io)).waiting.sourcing_address_waiting, 1);
  assert.deepEqual(w.skips, []);
});

test("sourcing: a lookup only when its address could be confirmed; a team mailbox is not greeted by name", async () => {
  const korean = fake({ signals: [] });
  const k = withSourcing(korean, { leads: [lead({ email: null, currentCompany: "컴퍼니비" })] });
  await runCompanyMailsWith(korean.io);
  assert.equal(k.calls.address, 0);
  assert.deepEqual(k.skips.map((item) => item.reason), [SOURCING_SKIP.noAddress]);

  const team = fake({ signals: [] });
  withSourcing(team, { leads: [lead({ email: null })], address: { email: "careers@company-b.example", source: "lookup" } });
  await runCompanyMailsWith(team.io);
  assert.equal(team.sent[0].facts.recipientName, null);
  assert.match(team.sent[0].text, /^Hi Company B team,/);

  const own = fake({ signals: [] });
  withSourcing(own, { leads: [lead({ email: null })], address: { email: "riley.moss@company-b.example", source: "lookup" } });
  await runCompanyMailsWith(own.io);
  assert.match(own.sent[0].text, /^Hi Riley,/);
});

test("sourcing: the opening is read once (the search's title when the post says it, or the kept one); a post with no opening is marked", async () => {
  const group = fake({ signals: [] });
  const g = withSourcing(group, { leads: [lead({ searchGroup: "backend engineer" })] });
  await runCompanyMailsWith(group.io);
  assert.equal(g.calls.readOpening, 0);
  assert.equal(group.sent[0].posting.title, "backend engineer");

  const kept = fake({ signals: [] });
  const k = withSourcing(kept, {
    leads: [lead({ opening: { companyName: "Company B", title: "Payments Engineer", location: "Remote", requirements: null, website: null } })],
  });
  await runCompanyMailsWith(kept.io);
  assert.equal(k.calls.readOpening, 0);
  assert.equal(kept.sent[0].posting.title, "Payments Engineer");
  assert.equal(kept.sent[0].posting.location, "Remote");

  const nothing = fake({ signals: [] });
  const n = withSourcing(nothing, { leads: [lead()], opening: () => ({ companyName: null, title: null, location: null, requirements: null, website: null }) });
  await runCompanyMailsWith(nothing.io);
  assert.deepEqual(n.skips.map((item) => item.reason), [SOURCING_SKIP.noOpening]);
  assert.equal(n.kept.length, 0);

  // The post names another company than the profile: that one is checked too.
  const other = fake({ signals: [] });
  const o = withSourcing(other, {
    leads: [lead()], customers: ["Company F"],
    opening: () => ({ companyName: "Company F", title: "Backend Engineer", location: null, requirements: null, website: null }),
  });
  await runCompanyMailsWith(other.io);
  assert.deepEqual(o.skips.map((item) => item.reason), [SOURCING_SKIP.customer]);

  const down = fake({ signals: [] });
  const dn = withSourcing(down, { leads: [lead()], opening: () => { throw new Error("model down"); } });
  assert.equal((await runCompanyMailsWith(down.io)).waiting.sourcing_opening_error, 1);
  assert.deepEqual(dn.skips, []);

  // Today's cost cap: the post waits, unmarked, and is read on a later tick.
  let capped = true;
  const cap = fake({ signals: [] });
  const cp = withSourcing(cap, {
    leads: [lead()],
    opening: () => (capped ? null : { companyName: null, title: "Backend Engineer", location: null, requirements: null, website: null }),
  });
  assert.equal((await runCompanyMailsWith(cap.io)).waiting.sourcing_cost_cap, 1);
  assert.deepEqual(cp.skips, []);
  assert.equal(cap.sent.length, 0);
  capped = false;
  assert.equal((await runCompanyMailsWith(cap.io)).sent, 1);
});

test("sourcing: a sourced posting without a Role row is still read for its thread's S3, and its title call is under the cost cap", () => {
  const server = readFileSync(new URL("./companyMail.server.ts", import.meta.url), "utf8");
  assert.match(server, /if \(!role\) return readSourcedPosting\(url\);/);
  const sourced = server.slice(server.indexOf("async function readSourcedPosting"), server.indexOf("export async function readCompanyPosting"));
  assert.match(sourced, /from public\.gtm_agent_company_postings c/);
  assert.match(sourced, /company_mail ->> 'channel' = 'company_post'/);
  const opening = server.slice(server.indexOf("async function readSourcedOpening"));
  assert.match(opening.slice(0, 400), /if \(!\(await mayAgentSpend\(newWorkCapUsd\(ctx\.settings\.dailyCostUsd\)\)\)\) return null;/);
});

test("sourcing: within the company_post channel's daily max, the company day cap, and not after a stopped tick", async () => {
  const two = [lead(), lead({ personId: "lead-2", postUrl: POST_B, currentCompany: "Company D", email: "sam@company-d.example" })];
  const room = fake({ signals: [] });
  withSourcing(room, { leads: two, room: 1 });
  const result = await runCompanyMailsWith(room.io);
  assert.equal(result.sent, 1);
  assert.equal(result.waiting.channel_full, 1);

  const off = fake({ signals: [] });
  withSourcing(off, { leads: two, room: 0 });
  assert.equal((await runCompanyMailsWith(off.io)).sent, 0);

  const capped = fake({ signals: [], quota: 0 });
  withSourcing(capped, { leads: two });
  assert.equal((await runCompanyMailsWith(capped.io)).sent, 0);

  const closed = fake({ signals: [], windowOpen: false });
  withSourcing(closed, { leads: two });
  assert.equal((await runCompanyMailsWith(closed.io)).sent, 0);

  const stopped = fake({ signals: [], stopped: true });
  withSourcing(stopped, { leads: two });
  assert.equal((await runCompanyMailsWith(stopped.io)).sent, 0);
});

test("sourcing: a later interest on a sourced posting is an S3 in its thread, counted on the channel, greeting the same person", async () => {
  const root = earlier({
    id: "s0-mail", toEmail: "riley@company-b.example", subject: "Candidates for your Backend Engineer role",
    facts: {
      ...earlier().facts!, variant: "S0", visible: 2, interestedPersonIds: [], newPersonIds: [], askedPersonIds: [], memberIds: ["m1", "m2"],
      interestedCards: [], contactSource: "posting", channel: "company_post", sourcedPersonId: "lead-1", recipientName: "Riley",
    },
  });
  const options = {
    signals: [signal({ personId: "p1", postingUrl: POST_A, companyName: "Company B" })],
    postings: { [POST_A]: posting({ postingUrl: POST_A, companyName: "Company B" }) },
    previous: { [POST_A]: [root] },
  };
  const full = fake(options);
  withSourcing(full, { leads: [], room: 0 });
  assert.equal((await runCompanyMailsWith(full.io)).waiting.channel_full, 1);
  assert.equal(full.sent.length, 0);

  const open = fake(options);
  withSourcing(open, { leads: [] });
  assert.equal((await runCompanyMailsWith(open.io)).sent, 1);
  const mail = open.sent[0];
  assert.equal(mail.facts.variant, "S3");
  assert.equal(mail.facts.channel, "company_post");
  assert.equal(mail.facts.sourcedPersonId, "lead-1");
  assert.equal(mail.to, "riley@company-b.example");
  assert.deepEqual(mail.facts.memberIds, ["m1", "m2"]);
  assert.equal(mail.facts.visible, 3);
  assert.match(mail.text, /^Hi Riley,/);
  assert.match(mail.text, /Last time I shared 2 people/);

  // An interest thread (not sourced) never needs the channel's room.
  const plain = fake({ signals: [signal({ personId: "p1", at: "2026-11-21T01:00:00Z" }), signal({ personId: "p2" })], previous: { [URL_A]: [earlier()] } });
  withSourcing(plain, { leads: [], room: 0 });
  assert.equal((await runCompanyMailsWith(plain.io)).sent, 1);
  assert.equal(plain.sent[0].facts.channel, undefined);
});

test("sourcing: the poster's own address first in the lookup, and only addresses that may take the mail", () => {
  const query = companyContactQuery({
    companyName: "Company B", title: "Backend Engineer", postingUrl: POST_A, companyDomain: null, location: "Seoul",
    poster: { name: "Riley Moss", title: "Head of Engineering", profileUrl: "https://www.linkedin.com/in/riley-moss" },
  });
  assert.match(query, /Who: Riley Moss \(Head of Engineering\), who posted this opening \(profile: https:\/\/www\.linkedin\.com\/in\/riley-moss\): their own work email at Company B first/);
  assert.match(companyContactQuery({ companyName: "Company B", title: "PM", postingUrl: URL_A, companyDomain: null, location: null }), /Who: the company's hiring mailbox/);
  assert.equal(usablePostAddress(" Riley@Company-B.example "), "riley@company-b.example");
  assert.equal(usablePostAddress("noreply@company-b.example"), null);
  assert.equal(usablePostAddress("jobs@greenhouse.io"), null);
  assert.equal(usablePostAddress("not an address"), null);
  assert.equal(lookupCanConfirm({ companyName: "컴퍼니비", companyDomain: null }), false);
  assert.equal(lookupCanConfirm({ companyName: "컴퍼니비", companyDomain: "company-b.example" }), true);
  assert.equal(lookupCanConfirm({ companyName: "Company B", companyDomain: null }), true);
});
