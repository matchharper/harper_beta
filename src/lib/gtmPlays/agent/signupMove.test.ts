import assert from "node:assert/strict";
import test from "node:test";
import { careerContentDateOnly, formatCareerContentSuggestion, readCareerContentSuggestionRow } from "@/lib/career/contentSuggestions";
import type { HistoryEntry } from "./conversation";
import {
  MAIL_CONVERSATION_PAYLOAD_KEY, SIGNUP_QUESTION_MAX, gtmMailIdFromPath, intentSource, intentSummary, introQuestionLine,
  introQuestions, mailContentItems, mailConversationBlock, moveMailConversation, parseIntentSource, parseSignupNext, questionFromIntentSummary,
  sameMailAddress, signupLanding, signupNextFromPath, signupNextQuery, stepPosting, type MailPosting, type SignupMail, type SignupMoveDeps,
  type SignupNext,
} from "./signupMove";
import type { AgentOfferEvent } from "./types";

const MAIL_ID = "0b7a3c1e-4f2d-4a8b-9c6d-1e2f3a4b5c6d";
const ROLE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const USER_ID = "user-1";
const POSTING: MailPosting = { url: "https://jobs.example.com/company-a/backend", roleId: ROLE_ID, kind: "harper", companyName: "Company A", title: "Backend Engineer" };
const EXTERNAL: MailPosting = { url: "https://careers.example.org/b/data", roleId: null, kind: "external", companyName: "Company B", title: "Data Engineer" };

const entry = (patch: Partial<HistoryEntry> = {}): HistoryEntry => ({
  at: "2026-11-18T01:00:00.000Z", author: "agent_mail", kind: "first", subject: "Two backend roles", text: "Hi, two roles that may fit.",
  postings: [], threadKey: "thread-1", ...patch,
});

/** Fake database: every call is recorded, history answers only for its own address. */
function fakeDeps(patch: {
  toEmail?: string; accountEmail?: string | null; confirmed?: boolean; history?: Record<string, HistoryEntry[]> | null;
  postings?: MailPosting[]; mail?: boolean; offer?: SignupMail["offer"]; events?: AgentOfferEvent[];
} = {}) {
  const calls = {
    history: [] as string[], blocks: [] as Array<{ content: string; payload: Record<string, unknown> }>, intents: [] as Array<{ source: string; summary: string }>,
    added: [] as string[], content: [] as Array<{ conversationId: string; item: Record<string, unknown> }>,
  };
  const historyByAddress = patch.history === undefined
    ? { "candidate@example.com": [entry(), entry({ at: "2026-11-19T02:00:00.000Z", author: "counterpart", kind: "reply", subject: "Re: Two backend roles", text: "Interested in the first one." })] }
    : patch.history;
  const deps: SignupMoveDeps = {
    async readMail(mailId) {
      return patch.mail === false ? null : {
        id: mailId, toEmail: patch.toEmail ?? "Candidate@Example.com", postings: patch.postings ?? [POSTING, EXTERNAL],
        offer: patch.offer, events: patch.events,
      };
    },
    async readAccount() {
      return { email: patch.accountEmail === undefined ? "candidate@example.com" : patch.accountEmail, emailConfirmed: patch.confirmed ?? true };
    },
    history: historyByAddress === null ? null : async (address) => {
      calls.history.push(address);
      return historyByAddress[address] ?? [];
    },
    async conversationId(_userId, preferred) {
      return preferred ?? "conversation-1";
    },
    async movedAlready(_userId, address) {
      return calls.blocks.some((block) => (block.payload[MAIL_CONVERSATION_PAYLOAD_KEY] as { address: string }).address === address);
    },
    async insertBlock(row) {
      calls.blocks.push({ content: row.content, payload: row.payload });
    },
    async intentSummaries(_userId, source) {
      return calls.intents.filter((intent) => intent.source === source).map((intent) => intent.summary.replace(/\s+/g, " "));
    },
    async recordIntent(row) {
      calls.intents.push({ source: row.source, summary: row.summary });
    },
    async addPosting(_userId, url) {
      calls.added.push(url);
    },
    async addContent(row) {
      calls.content.push({ conversationId: row.conversationId, item: row.item });
    },
    now: () => new Date("2026-11-20T10:00:00.000Z"),
  };
  return { deps, calls };
}

const next = (patch: Partial<SignupNext> = {}): SignupNext => ({ step: "connect_request", posting: POSTING.url, question: "Is the team remote-friendly?", ...patch });
const run = (deps: SignupMoveDeps, value: SignupNext = next()) => moveMailConversation(deps, { userId: USER_ID, mailId: MAIL_ID, next: value, locale: "ko" });

test("next step: the four known steps, case and spaces ignored; anything else is no step", () => {
  for (const step of ["connect_request", "apply_on_behalf", "opportunities_first", "onboarding"] as const) {
    assert.equal(parseSignupNext({ next: step }).step, step);
  }
  assert.equal(parseSignupNext({ next: "  Apply_On_Behalf " }).step, "apply_on_behalf");
  assert.equal(parseSignupNext({ next: "apply_now" }).step, null);
  assert.equal(parseSignupNext({ next: "" }).step, null);
  assert.equal(parseSignupNext({ next: ["connect_request"] }).step, null);
  assert.deepEqual(parseSignupNext(undefined), { step: null, posting: null, question: null });
  assert.deepEqual(parseSignupNext(null), { step: null, posting: null, question: null });
});

test("next step: only http(s) posting URLs, and a one-line question capped at 300 characters", () => {
  assert.equal(parseSignupNext({ posting: "https://jobs.example.com/a" }).posting, "https://jobs.example.com/a");
  assert.equal(parseSignupNext({ posting: "javascript:alert(1)" }).posting, null);
  assert.equal(parseSignupNext({ posting: "ftp://example.com/a" }).posting, null);
  assert.equal(parseSignupNext({ posting: "not a url" }).posting, null);
  assert.equal(parseSignupNext({ posting: `https://example.com/${"a".repeat(2_100)}` }).posting, null);
  assert.equal(parseSignupNext({ question: "  Is it\nremote?\u0007 " }).question, "Is it remote?");
  assert.equal(parseSignupNext({ question: "   " }).question, null);
  const long = parseSignupNext({ question: "q".repeat(500) }).question ?? "";
  assert.equal(long.length, SIGNUP_QUESTION_MAX);
  assert.ok(long.endsWith("…"));
});

test("link paths: the mail id from ?gtm=, the next step from the same query, and the query carried on", () => {
  assert.equal(gtmMailIdFromPath(`/career?gtm=${MAIL_ID.toUpperCase()}&utm_source=harper_gtm`), MAIL_ID);
  assert.equal(gtmMailIdFromPath("/career?gtm=not-an-id"), null);
  assert.equal(gtmMailIdFromPath(null), null);
  const query = signupNextQuery(next());
  assert.deepEqual(signupNextFromPath(`/career?gtm=${MAIL_ID}&${query}`), next());
  assert.deepEqual(parseSignupNext(Object.fromEntries(new URLSearchParams(query))), next());
  assert.equal(signupNextQuery(parseSignupNext({ next: "unknown" })), "");
});

test("same address: verified, equal after trim and lower-case; never an unverified or other address", () => {
  assert.equal(sameMailAddress({ email: " Candidate@Example.com ", emailConfirmed: true }, "candidate@example.com"), true);
  assert.equal(sameMailAddress({ email: "candidate@example.com", emailConfirmed: false }, "candidate@example.com"), false);
  assert.equal(sameMailAddress({ email: "other@example.com", emailConfirmed: true }, "candidate@example.com"), false);
  assert.equal(sameMailAddress({ email: null, emailConfirmed: true }, ""), false);
  assert.equal(sameMailAddress(null, "candidate@example.com"), false);
});

test("the step's posting is found in the mail's snapshot by URL, without query or trailing slash", () => {
  assert.equal(stepPosting([POSTING, EXTERNAL], "https://JOBS.example.com/company-a/backend/?utm=x"), POSTING);
  assert.equal(stepPosting([POSTING], "https://jobs.example.com/company-a/frontend"), null);
  assert.equal(stepPosting([POSTING], null), null);
});

test("move: the recipient's verified account gets that address's conversation once, and the entry record with the question", async () => {
  const { deps, calls } = fakeDeps();
  const result = await run(deps);
  assert.deepEqual(result, { status: "moved", conversationId: "conversation-1" });
  assert.deepEqual(calls.history, ["candidate@example.com"]);
  assert.equal(calls.blocks.length, 1);
  const payload = calls.blocks[0].payload[MAIL_CONVERSATION_PAYLOAD_KEY] as Record<string, unknown>;
  assert.deepEqual(payload, {
    address: "candidate@example.com", mailId: MAIL_ID, entries: 2, step: "connect_request", postingUrl: POSTING.url,
    movedAt: "2026-11-20T10:00:00.000Z",
  });
  assert.ok(calls.blocks[0].content.indexOf("Two backend roles") < calls.blocks[0].content.indexOf("Interested in the first one."));
  assert.equal(calls.intents.length, 1);
  assert.equal(calls.intents[0].source, intentSource(MAIL_ID, "connect_request", ROLE_ID));
  assert.equal(questionFromIntentSummary(calls.intents[0].summary), "Is the team remote-friendly?");
  assert.deepEqual(calls.added, []);
});

test("move: another address never reads or moves any conversation; the entry record has no question", async () => {
  const { deps, calls } = fakeDeps({ accountEmail: "someone.else@example.com" });
  assert.equal((await run(deps)).status, "other_address");
  assert.deepEqual(calls.history, []);
  assert.deepEqual(calls.blocks, []);
  assert.equal(calls.intents.length, 1);
  assert.equal(questionFromIntentSummary(calls.intents[0].summary), null);
  assert.match(calls.intents[0].summary, /different address/);
});

test("move: the same address but unverified counts as another address", async () => {
  const { deps, calls } = fakeDeps({ confirmed: false });
  assert.equal((await run(deps)).status, "other_address");
  assert.deepEqual(calls.history, []);
  assert.deepEqual(calls.blocks, []);
});

test("move: a history that would hand back another address's rows is only ever asked for the recipient", async () => {
  const { deps, calls } = fakeDeps({
    history: { "candidate@example.com": [entry()], "someone.else@example.com": [entry({ text: "Not theirs." })] },
  });
  await run(deps);
  assert.deepEqual(calls.history, ["candidate@example.com"]);
  assert.ok(!calls.blocks[0].content.includes("Not theirs."));
});

test("move: a reply from another address in the thread (a colleague it was forwarded to) is not moved", async () => {
  const { deps, calls } = fakeDeps({
    history: { "candidate@example.com": [entry(), entry({ author: "counterpart", kind: "reply", text: "I'm their teammate, send me the details.", fromEmail: "teammate@example.org" })] },
  });
  assert.equal((await run(deps)).status, "moved");
  assert.ok(!calls.blocks[0].content.includes("teammate"));
});

test("move: repeated sign-up touches move once and record once", async () => {
  const { deps, calls } = fakeDeps();
  assert.equal((await run(deps)).status, "moved");
  assert.equal((await run(deps)).status, "already_moved");
  assert.equal((await run(deps)).status, "already_moved");
  assert.equal(calls.blocks.length, 1);
  assert.equal(calls.intents.length, 1);
  assert.equal(calls.history.length, 1);
});

test("move: a later touch that carries the question adds a record, and the intro reads that question", async () => {
  const { deps, calls } = fakeDeps();
  await run(deps, next({ question: null }));
  await run(deps, next());
  await run(deps, next({ question: null }));
  assert.equal(calls.intents.length, 2);
  const rows = [...calls.intents].reverse().map((intent) => ({ talent_id: USER_ID, source: intent.source, summary: intent.summary }));
  assert.equal(introQuestions(rows).get(`${ROLE_ID}:${USER_ID}`), "Is the team remote-friendly?");
});

test("move: until the reply pipeline's history is wired, only the entry record is written", async () => {
  const { deps, calls } = fakeDeps({ history: null });
  assert.equal((await run(deps)).status, "not_wired");
  assert.equal(calls.intents.length, 1);
  assert.deepEqual(calls.blocks, []);
});

test("move: no history for the address leaves the chat as it is", async () => {
  const { deps, calls } = fakeDeps({ history: {} });
  assert.equal((await run(deps)).status, "no_history");
  assert.deepEqual(calls.blocks, []);
});

test("move: an unknown or unsent mail does nothing", async () => {
  const { deps, calls } = fakeDeps({ mail: false });
  assert.deepEqual(await run(deps), { status: "not_found", conversationId: null });
  assert.deepEqual(calls, { history: [], blocks: [], intents: [], added: [], content: [] });
});

test("move: a posting the mail did not carry goes to the opportunities; an external posting has no Role in the source", async () => {
  const found = fakeDeps();
  await run(found.deps, next({ posting: "https://jobs.example.com/company-c/platform" }));
  assert.deepEqual(found.calls.added, ["https://jobs.example.com/company-c/platform"]);
  assert.equal(parseIntentSource(found.calls.intents[0].source)?.roleId, null);
  const external = fakeDeps();
  await run(external.deps, next({ posting: EXTERNAL.url }));
  assert.deepEqual(external.calls.added, []);
  assert.deepEqual(parseIntentSource(external.calls.intents[0].source), { mailId: MAIL_ID, step: "connect_request", roleId: null });
});

test("block: oldest mail first, who wrote it, the next step and (when asked) the question", () => {
  const entries = [
    entry({ at: "2026-11-19T02:00:00.000Z", author: "counterpart", kind: "reply", text: "Second." }),
    entry({ at: "2026-11-18T01:00:00.000Z", text: "First." }),
  ];
  const ko = mailConversationBlock({ entries, locale: "ko", next: next(), posting: POSTING, withQuestion: true });
  assert.ok(ko.startsWith("**Ashley와 나눈 메일 (가입 전)**"));
  assert.ok(ko.indexOf("First.") < ko.indexOf("Second."));
  assert.match(ko, /Ashley가 보낸 메일/);
  assert.match(ko, /보내신 답장/);
  assert.match(ko, /가입 링크에 담긴 다음 단계: 이 공고 회사에 연결 요청 \(Company A · Backend Engineer\)/);
  assert.match(ko, /회사에 물어볼 질문: Is the team remote-friendly\?/);
  const en = mailConversationBlock({ entries, locale: "en", next: next(), posting: POSTING, withQuestion: false });
  assert.match(en, /Your emails with Ashley/);
  assert.ok(!en.includes("remote-friendly"));
  const huge = mailConversationBlock({ entries: Array.from({ length: 20 }, () => entry({ text: "x".repeat(5_000) })), locale: "en", next: next(), posting: null, withQuestion: true });
  assert.ok(huge.length <= 16_000);
});

test("entry record: one line within 1,200 characters, the question last and only for the recipient", () => {
  const longUrl: MailPosting = { ...POSTING, url: `https://jobs.example.com/${"a".repeat(1_500)}` };
  const summary = intentSummary({ next: next({ question: "q".repeat(300) }), posting: longUrl, sameAddress: true });
  assert.ok(summary.length <= 1_200);
  assert.ok(!summary.includes("\n"));
  assert.ok(!summary.includes(longUrl.url ?? ""));
  assert.equal(questionFromIntentSummary(summary.replace(/\s+/g, " ")), "q".repeat(300));
  assert.equal(questionFromIntentSummary(intentSummary({ next: next(), posting: POSTING, sameAddress: false })), null);
  assert.match(intentSummary({ next: next(), posting: POSTING, sameAddress: true }), /not introduction or profile-sharing consent/);
});

test("intro questions: newest per Role and person; rows without a Role or a question are skipped", () => {
  const otherRole = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
  const rows = [
    { talent_id: "t1", source: intentSource(MAIL_ID, "connect_request", ROLE_ID), summary: "Entry. Question for the company: Newest?" },
    { talent_id: "t1", source: intentSource(MAIL_ID, "connect_request", ROLE_ID), summary: "Entry. Question for the company: Older?" },
    { talent_id: "t1", source: intentSource(MAIL_ID, "apply_on_behalf", null), summary: "Entry. Question for the company: No role?" },
    { talent_id: "t2", source: intentSource(MAIL_ID, "connect_request", otherRole), summary: "Entry without a question." },
    { talent_id: "t3", source: "official_jobs_onboarding:slug", summary: "Question for the company: Not a mail?" },
  ];
  assert.deepEqual([...introQuestions(rows)], [[`${ROLE_ID}:t1`, "Newest?"]]);
  assert.equal(introQuestionLine("Is <b> & ok?", "ko"), "*후보가 회사에 묻는 것:* Is &lt;b&gt; &amp; ok?");
  assert.equal(introQuestionLine("Remote?", "en"), "*The candidate asks:* Remote?");
});

test("every similar role Ashley offered goes into 내 기회 too, once, never one the mail already carried", async () => {
  const { deps, calls } = fakeDeps();
  deps.offeredPostings = async () => ["https://jobs.example.com/company-c/platform", "https://jobs.example.com/company-d/backend", `${EXTERNAL.url}/`];
  await run(deps, next({ step: "opportunities_first", posting: "https://jobs.example.com/company-c/platform", question: null }));
  assert.deepEqual(calls.added, ["https://jobs.example.com/company-c/platform", "https://jobs.example.com/company-d/backend"]);
});

const EVENT: AgentOfferEvent = {
  title: "Data Engineering Meetup", url: "https://events.example.com/data-meetup", startsAt: "2026-12-03T19:00:00+01:00", endsAt: "2026-12-03T21:00:00+01:00",
  place: "Example Hall, Riverside City", online: false, organizer: "Example Data Club", why: "Streaming talks close to your pipeline work.",
};
const WEBINAR: AgentOfferEvent = {
  title: "Streaming Webinar", url: "https://events.example.com/stream-webinar", startsAt: "2026-12-10", endsAt: null, place: null, online: true,
  organizer: null, why: "",
};

test("landing: a coaching mail goes to the chat first (상담 먼저); posting and general mails to the postings (기회 먼저)", () => {
  assert.equal(signupLanding("coaching"), "chat");
  assert.equal(signupLanding("posting"), "opportunities");
  assert.equal(signupLanding("general"), "opportunities");
  assert.equal(signupLanding(null), "opportunities");
});

test("entry record: says what the mail offered; a posting mail reads as before", () => {
  const before = intentSummary({ next: next({ step: null, question: null }), posting: null, sameAddress: true });
  assert.equal(intentSummary({ next: next({ step: null, question: null }), posting: null, sameAddress: true, offer: "posting" }), before);
  const coaching = intentSummary({ next: next({ step: null, question: null }), posting: null, sameAddress: true, offer: "coaching" });
  assert.match(coaching, /offered career help, no postings: résumé or portfolio feedback/);
  assert.match(coaching, /start with it, not with postings/);
  const general = intentSummary({ next: next({ step: null, question: null }), posting: null, sameAddress: false, offer: "general", events: [EVENT, WEBINAR] });
  assert.match(general, /fitting postings and upcoming events/);
  assert.match(general, /apply on their behalf/);
  assert.match(general, /Data Engineering Meetup \(2026-12-03, Example Hall, Riverside City\); Streaming Webinar \(2026-12-10, online\)/);
  assert.match(general, /not introduction or profile-sharing consent\.$/);
  // The question still goes last, for the recipient only.
  assert.equal(questionFromIntentSummary(intentSummary({ next: next(), posting: POSTING, sameAddress: true, offer: "general", events: [EVENT] })), "Is the team remote-friendly?");
});

test("content items: the events still to come, as 볼 만한 것 events with exact dates, the place or online, why it fits", () => {
  const items = mailContentItems([EVENT, WEBINAR, { ...EVENT, url: "https://events.example.com/past", startsAt: "2026-11-01" }], { locale: "ko", now: new Date("2026-11-20T10:00:00.000Z") });
  assert.deepEqual(items, [
    {
      kind: "event", url: EVENT.url, title: EVENT.title, reason: EVENT.why, source: "Example Data Club",
      startsAt: "2026-12-03T18:00:00.000Z", endsAt: "2026-12-03T20:00:00.000Z", location: "Example Hall, Riverside City",
    },
    {
      kind: "event", url: WEBINAR.url, title: WEBINAR.title, reason: "메일로 소개해 드린 행사예요.", startsAt: "2026-12-10T00:00:00.000Z",
      endsAt: "2026-12-11T00:00:00.000Z", location: "온라인",
    },
  ]);
  assert.equal(mailContentItems([{ ...WEBINAR, place: "Example Hall" }], { locale: "en", now: new Date("2026-11-20T10:00:00.000Z") })[0].location, "Example Hall · Online");
});

test("move: a general mail's events go to the 볼 만한 것 list in their conversation, whichever address signed up", async () => {
  const { deps, calls } = fakeDeps({ accountEmail: "someone.else@example.com", offer: "general", events: [EVENT, WEBINAR] });
  assert.equal((await run(deps, next({ step: null, question: null }))).status, "other_address");
  assert.deepEqual(calls.content.map((row) => [row.conversationId, row.item.url]), [["conversation-1", EVENT.url], ["conversation-1", WEBINAR.url]]);
  assert.match(calls.intents[0].summary, /Events in the email/);
  const posting = fakeDeps();
  await run(posting.deps);
  assert.deepEqual(posting.calls.content, []);
});

test("move: a coaching mail's entry record tells Harper to start with career help", async () => {
  const { deps, calls } = fakeDeps({ offer: "coaching", postings: [] });
  assert.equal((await run(deps, next({ step: null, posting: null, question: null }))).status, "moved");
  assert.match(calls.intents[0].summary, /offered career help, no postings/);
  assert.deepEqual(calls.content, []);
});

test("content items: a date with no time is kept as whole days, and the card and the chat read it as a date alone", () => {
  const now = new Date("2026-11-20T10:00:00.000Z");
  const [single, multi, timed] = mailContentItems([
    WEBINAR, { ...WEBINAR, url: "https://events.example.com/two-days", endsAt: "2026-12-11" }, { ...EVENT, startsAt: "2026-12-03T09:00:00+09:00", endsAt: null },
  ], { locale: "en", now });
  assert.deepEqual([single.startsAt, single.endsAt], ["2026-12-10T00:00:00.000Z", "2026-12-11T00:00:00.000Z"]);
  assert.deepEqual([multi.startsAt, multi.endsAt], ["2026-12-10T00:00:00.000Z", "2026-12-12T00:00:00.000Z"]);
  const row = (item: Record<string, unknown>) => readCareerContentSuggestionRow({
    id: "0b7a3c1e-4f2d-4a8b-9c6d-1e2f3a4b5c6e", kind: "event", url: item.url, title: item.title, reason: item.reason, starts_at: item.startsAt,
    ends_at: item.endsAt ?? null, expires_at: "2026-12-31T00:00:00.000Z", status: "new", origin: "harper_offer", created_at: now.toISOString(),
  });
  assert.equal(careerContentDateOnly(row(single)), true);
  assert.equal(careerContentDateOnly(row(multi)), true);
  // A real time at 00:00Z (09:00 at +09:00) keeps its time: it has no whole-day end.
  assert.equal(timed.startsAt, "2026-12-03T00:00:00.000Z");
  assert.equal(careerContentDateOnly(row(timed)), false);
  assert.match(formatCareerContentSuggestion(row(single)), /When: 2026-12-10 \(date only, no time given\)/);
});
