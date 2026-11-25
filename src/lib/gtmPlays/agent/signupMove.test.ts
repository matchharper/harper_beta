import assert from "node:assert/strict";
import test from "node:test";
import { careerContentDateOnly, formatCareerContentSuggestion, readCareerContentSuggestionRow } from "@/lib/career/contentSuggestions";
import type { HistoryEntry } from "./conversation";
import {
  MAIL_CONVERSATION_PAYLOAD_KEY, SIGNUP_QUESTION_MAX, copyMailHistory, entriesToMove, entryKey, gtmMailIdFromPath, intentSource, intentSummary,
  introQuestionLine, introQuestions, mailContentItems, mailConversationBlock, mailLocale, movedMarks, moveMailConversation, parseIntentSource,
  parseSignupNext, questionFromIntentSummary, sameMailAddress, signupLanding, signupNextFromPath, signupNextQuery, stepPosting,
  type MailPosting, type SignupMail, type SignupMoveDeps, type SignupNext,
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

/**
 * Fake database: every call is recorded, history answers only for its own address. `moved`: blocks already in the
 * chat before the test (their payloads, e.g. one written before keys were kept).
 */
function fakeDeps(patch: {
  toEmail?: string; accountEmail?: string | null; confirmed?: boolean; history?: Record<string, HistoryEntry[]> | null;
  postings?: MailPosting[]; mail?: boolean; offer?: SignupMail["offer"]; events?: AgentOfferEvent[]; moved?: Array<Record<string, unknown>>;
} = {}) {
  const calls = {
    history: [] as string[], blocks: [] as Array<{ conversationId: string; content: string; payload: Record<string, unknown> }>,
    intents: [] as Array<{ source: string; summary: string }>, added: [] as string[],
    content: [] as Array<{ conversationId: string; item: Record<string, unknown> }>,
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
    async movedBlocks(_userId, address) {
      const written = calls.blocks.map((block) => block.payload[MAIL_CONVERSATION_PAYLOAD_KEY] as Record<string, unknown>);
      return [...(patch.moved ?? []), ...written].filter((payload) => payload.address === address);
    },
    async insertBlock(row) {
      calls.blocks.push({ conversationId: row.conversationId, content: row.content, payload: row.payload });
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
    address: "candidate@example.com", mailId: MAIL_ID, entries: 2,
    keys: ["thread-1|agent_mail|2026-11-18T01:00:00.000Z", "thread-1|counterpart|2026-11-19T02:00:00.000Z"],
    step: "connect_request", postingUrl: POSTING.url, movedAt: "2026-11-20T10:00:00.000Z",
  });
  assert.equal(calls.blocks[0].conversationId, "conversation-1");
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
  // Each touch reads the history to find a mail the chat does not hold yet; only ever the recipient's.
  assert.deepEqual(calls.history, ["candidate@example.com", "candidate@example.com", "candidate@example.com"]);
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
  // A general mail of events only has no posting to open: Harper's home, where its events are kept.
  assert.equal(signupLanding("general", { postings: false, events: true }), "events");
  // Events all passed (or none): 내 기회, where Harper keeps sending postings.
  assert.equal(signupLanding("general", { postings: false, events: false }), "opportunities");
  assert.equal(signupLanding("general", { postings: true, events: true }), "opportunities");
  assert.equal(signupLanding("posting", { postings: false }), "opportunities");
  assert.equal(signupLanding("coaching", { postings: false }), "chat");
});

test("entry record: says what the mail offered; a posting mail reads as before", () => {
  const before = intentSummary({ next: next({ step: null, question: null }), posting: null, sameAddress: true });
  assert.equal(intentSummary({ next: next({ step: null, question: null }), posting: null, sameAddress: true, offer: "posting" }), before);
  const coaching = intentSummary({ next: next({ step: null, question: null }), posting: null, sameAddress: true, offer: "coaching" });
  assert.match(coaching, /offered career help, no postings: résumé or portfolio feedback/);
  // Only where to start: anything else they ask for is answered as for any member (Shaun 11/23 18:41).
  assert.match(coaching, /Start with that; when they ask for something else \(postings, applying, events\), help with it as for any member/);
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

const ADDRESS = "candidate@example.com";
const FIRST = entry();
const REPLY = entry({ at: "2026-11-19T02:00:00.000Z", author: "counterpart", kind: "reply", subject: "Re: Two backend roles", text: "Interested in the first one." });
const ASHLEY_ANSWER = entry({ at: "2026-11-25T03:00:00.000Z", author: "ashley", kind: "reply", subject: "Re: Two backend roles", text: "Here is the team's setup." });
const THEIR_NEXT = entry({ at: "2026-11-25T05:00:00.000Z", author: "counterpart", kind: "reply", subject: "Re: Two backend roles", text: "Thanks, sounds good." });

/** copyMailHistory on the fake, with a conversation thunk that counts how often it is asked. */
function copier(deps: SignupMoveDeps, patch: { continued?: boolean; locale?: "ko" | "en" } = {}) {
  const asked = { count: 0 };
  const copy = () => copyMailHistory(deps, {
    userId: USER_ID, address: ADDRESS, locale: patch.locale ?? "en", continued: patch.continued ?? true,
    conversation: async () => {
      asked.count += 1;
      return "conversation-2";
    },
  });
  return { copy, asked };
}

test("entry key: the mail's thread, author and time, the same for the same mail on every read", () => {
  assert.equal(entryKey(FIRST), "thread-1|agent_mail|2026-11-18T01:00:00.000Z");
  assert.equal(entryKey(entry({ ...REPLY, text: "changed text" })), entryKey(REPLY));
  assert.notEqual(entryKey({ ...REPLY, author: "ashley" }), entryKey(REPLY));
  assert.notEqual(entryKey({ ...REPLY, threadKey: "gmail:thread-2" }), entryKey(REPLY));
});

test("moved marks: a keyed block's keys; a block from before keys holds every mail up to its move", () => {
  const marks = movedMarks([
    { address: ADDRESS, keys: [entryKey(ASHLEY_ANSWER), 7], movedAt: "2026-11-30T00:00:00.000Z" },
    { address: ADDRESS, entries: 2, movedAt: "2026-11-20T10:00:00.000Z" },
    { address: ADDRESS, entries: 1, movedAt: "2026-11-19T10:00:00.000Z" },
    null, "not a block", { address: ADDRESS, movedAt: "not a date" },
  ]);
  assert.deepEqual([...marks.keys], [entryKey(ASHLEY_ANSWER)]);
  // The newest move of a block without keys; a keyed block's own movedAt is not a cut-off.
  assert.equal(marks.movedUntil, Date.parse("2026-11-20T10:00:00.000Z"));
  assert.equal(movedMarks([{ keys: [entryKey(FIRST)], movedAt: "2026-11-30T00:00:00.000Z" }]).movedUntil, null);
  assert.deepEqual(movedMarks([]), { keys: new Set(), movedUntil: null });
});

test("entries to move: not another address's reply, not a keyed mail, not one at or before a block without keys", () => {
  const atMove = entry({ at: "2026-11-20T10:00:00.000Z", author: "counterpart", kind: "reply", text: "Sent as it moved." });
  const forwarded = entry({ at: "2026-11-25T04:00:00.000Z", author: "counterpart", kind: "reply", text: "Teammate here.", fromEmail: "teammate@example.org" });
  const marks = movedMarks([
    { address: ADDRESS, entries: 2, movedAt: "2026-11-20T10:00:00.000Z" },
    { address: ADDRESS, keys: [entryKey(ASHLEY_ANSWER)], movedAt: "2026-11-25T03:30:00.000Z" },
  ]);
  assert.deepEqual(entriesToMove([FIRST, REPLY, atMove, ASHLEY_ANSWER, forwarded, THEIR_NEXT], marks), [THEIR_NEXT]);
  assert.deepEqual(entriesToMove([FIRST, forwarded], movedMarks([])), [FIRST]);
});

test("copy: only the mails the chat does not hold, with their keys, in a continued block; a repeat writes nothing", async () => {
  const history = { [ADDRESS]: [FIRST, REPLY] };
  const { deps, calls } = fakeDeps({ history });
  assert.equal((await run(deps)).status, "moved");
  history[ADDRESS].push(ASHLEY_ANSWER, THEIR_NEXT);
  const { copy, asked } = copier(deps);
  assert.equal(await copy(), "moved");
  assert.equal(calls.blocks.length, 2);
  assert.equal(calls.blocks[1].conversationId, "conversation-2");
  assert.deepEqual(calls.blocks[1].payload[MAIL_CONVERSATION_PAYLOAD_KEY], {
    address: ADDRESS, entries: 2, keys: [entryKey(ASHLEY_ANSWER), entryKey(THEIR_NEXT)], step: null, postingUrl: null,
    movedAt: "2026-11-20T10:00:00.000Z", continued: true,
  });
  const content = calls.blocks[1].content;
  assert.ok(content.startsWith("**Your emails with Ashley (continued)**"));
  assert.ok(content.indexOf("Here is the team's setup.") < content.indexOf("Thanks, sounds good."));
  assert.ok(!content.includes("Interested in the first one."));
  assert.equal(await copy(), "already_moved");
  assert.equal(calls.blocks.length, 2);
  assert.equal(asked.count, 1);
});

test("copy: the conversation is never asked for (or made) when there is nothing to write", async () => {
  const none = copier(fakeDeps({ history: {} }).deps);
  assert.equal(await none.copy(), "no_history");
  const unwired = copier(fakeDeps({ history: null }).deps);
  assert.equal(await unwired.copy(), "not_wired");
  const onlyForwarded = copier(fakeDeps({ history: { [ADDRESS]: [entry({ author: "counterpart", kind: "reply", fromEmail: "teammate@example.org" })] } }).deps);
  assert.equal(await onlyForwarded.copy(), "no_history");
  // A block moved before keys were kept holds every mail up to its move.
  const legacy = fakeDeps({ history: { [ADDRESS]: [FIRST, REPLY] }, moved: [{ address: ADDRESS, mailId: MAIL_ID, entries: 2, movedAt: "2026-11-20T10:00:00.000Z" }] });
  const before = copier(legacy.deps);
  assert.equal(await before.copy(), "already_moved");
  assert.deepEqual(legacy.calls.blocks, []);
  for (const asked of [none.asked, unwired.asked, onlyForwarded.asked, before.asked]) assert.equal(asked.count, 0);
});

test("copy: after a block moved before keys were kept, only the later mails go in", async () => {
  const history = { [ADDRESS]: [FIRST, REPLY, THEIR_NEXT] };
  const { deps, calls } = fakeDeps({ history, moved: [{ address: ADDRESS, mailId: MAIL_ID, entries: 2, movedAt: "2026-11-20T10:00:00.000Z" }] });
  const { copy, asked } = copier(deps, { locale: "ko" });
  assert.equal(await copy(), "moved");
  assert.deepEqual((calls.blocks[0].payload[MAIL_CONVERSATION_PAYLOAD_KEY] as { keys: string[] }).keys, [entryKey(THEIR_NEXT)]);
  assert.ok(calls.blocks[0].content.startsWith("**Ashley와 나눈 메일 (이어서)**"));
  assert.ok(calls.blocks[0].content.includes("Thanks, sounds good."));
  assert.ok(!calls.blocks[0].content.includes("Interested in the first one."));
  assert.equal(asked.count, 1);
});

test("move: a later sign-up touch with a new mail adds a continued block, without the next step or question again", async () => {
  const history = { [ADDRESS]: [FIRST, REPLY] };
  const { deps, calls } = fakeDeps({ history });
  assert.equal((await run(deps)).status, "moved");
  history[ADDRESS].push(THEIR_NEXT);
  assert.equal((await run(deps)).status, "moved");
  assert.equal(calls.blocks.length, 2);
  const [first, later] = calls.blocks;
  assert.match(first.content, /회사에 물어볼 질문/);
  assert.ok(later.content.startsWith("**Ashley와 나눈 메일 (이어서)**"));
  assert.ok(!later.content.includes("회사에 물어볼 질문"));
  assert.ok(!later.content.includes("가입 링크에 담긴 다음 단계"));
  assert.deepEqual(later.payload[MAIL_CONVERSATION_PAYLOAD_KEY], {
    address: ADDRESS, mailId: MAIL_ID, entries: 1, keys: [entryKey(THEIR_NEXT)], step: "connect_request", postingUrl: POSTING.url,
    movedAt: "2026-11-20T10:00:00.000Z", continued: true,
  });
});

test("copy: a block that would run long keeps the newest mails whole; the older ones left out are not copied later", async () => {
  const long = Array.from({ length: 10 }, (_, index) => entry({
    at: `2026-11-${String(10 + index).padStart(2, "0")}T01:00:00.000Z`, author: index % 2 ? "counterpart" : "ashley", kind: "reply",
    text: `mail-${index} ${"x".repeat(2_900)}`,
  }));
  const { deps, calls } = fakeDeps({ history: { [ADDRESS]: long } });
  const { copy } = copier(deps);
  assert.equal(await copy(), "moved");
  const { content, payload } = calls.blocks[0];
  const block = payload[MAIL_CONVERSATION_PAYLOAD_KEY] as { entries: number; keys: string[] };
  assert.ok(content.length < 16_000);
  assert.ok(content.includes(`mail-9 ${"x".repeat(2_900)}`));
  assert.ok(!content.includes("mail-0 "));
  assert.ok(block.entries < 10 && block.entries > 1);
  assert.deepEqual(block.keys, long.map(entryKey));
  assert.equal(await copy(), "already_moved");
});

test("block: a continued block has its own heading and no next step or question line", () => {
  const entries = [entry({ at: "2026-11-25T05:00:00.000Z", author: "counterpart", kind: "reply", text: "Later." })];
  const ko = mailConversationBlock({ entries, locale: "ko", next: next(), posting: POSTING, withQuestion: true, continued: true });
  assert.ok(ko.startsWith("**Ashley와 나눈 메일 (이어서)**"));
  assert.match(ko, /메일 답장은 Ashley가 해요/);
  assert.ok(!ko.includes("회사에 물어볼 질문"));
  assert.ok(!ko.includes("가입 링크에 담긴 다음 단계"));
  const en = mailConversationBlock({ entries, locale: "en", next: next(), posting: POSTING, withQuestion: true, continued: true });
  assert.ok(en.startsWith("**Your emails with Ashley (continued)**"));
  assert.ok(!en.includes("Your question for the company"));
  assert.ok(!en.includes("before sign-up"));
});

test("locale: Korean when their mails are; with no English words of theirs, the language of our mails to them", () => {
  const korean = entry({ subject: "백엔드 공고 두 개", text: "안녕하세요, 맞을 만한 공고예요." });
  assert.equal(mailLocale([FIRST, entry({ author: "counterpart", kind: "reply", text: "네, 관심 있어요." })]), "ko");
  assert.equal(mailLocale([korean, REPLY]), "en");
  assert.equal(mailLocale([korean]), "ko");
  assert.equal(mailLocale([korean, entry({ author: "counterpart", kind: "reply", text: "👍" })]), "ko");
  assert.equal(mailLocale([FIRST]), "en");
  // A colleague's reply from another address is not theirs.
  assert.equal(mailLocale([FIRST, entry({ author: "counterpart", kind: "reply", text: "제가 대신 볼게요.", fromEmail: "teammate@example.org" })]), "en");
  assert.equal(mailLocale([]), "en");
});
