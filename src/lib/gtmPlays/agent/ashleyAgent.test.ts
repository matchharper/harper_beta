import assert from "node:assert/strict";
import test from "node:test";
import {
  askedBefore, asksFor, ASHLEY_NOTE, COMPANY_ASK_WAIT_MS, historyBefore, historyForMails, MEMBER_INTRO_WAIT_MS, processAshleyMessage,
  finishIntroEnds, JOINED_GAVE_UP, JOINED_HANDED_OFF, JOINED_MEMBER, JOINED_NOT_SENT, JOINED_PENDING, joinedFailures, MEMBER_INTRO_TRIES, MEMBER_TELL_TRIES,
  processAshleyReplies, SUPERSEDED_REASON, UNREACHABLE_NOTICE_TRIES,
  tellCompanyIntroAsks, tellJoinedCompanies, type AshleyIO, type AshleyLlmCall, type AshleyMail, type AshleyPerson, type CompanyIntroAsk,
  type CompanyIntroEnd, type JoinedPair, type MemberIntro, type OutgoingMail, type RelayRow,
} from "./ashleyAgent";
import { CODE_REASON, historyText, parseCandidateDecision } from "./ashleyPrompt";
import type { CompanyAsk } from "./companyMail";
import type { ConversationMessage, ConversationStore, HistoryEntry, InterestSignal } from "./conversation";
import type { AgentPosting } from "./types";
import { kstDayWindow } from "../sendLimit";

// ---------------------------------------------------------------------------------------------------------------
// Fakes

const NOW = new Date("2026-11-20T03:00:00.000Z"); // 12:00 KST, a Friday
const DAY = 86_400_000;
const NEXT_SEND_DAY = new Date(NOW.getTime() + 3 * DAY); // Monday 12:00 KST
const ROOT_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const COMPANY_MAIL_ID = "33333333-3333-4333-8333-333333333333";

const EXTERNAL: AgentPosting = {
  kind: "external", roleId: "44444444-4444-4444-8444-444444444444", url: "https://jobs.example.com/company-a/backend",
  companyName: "Company A", title: "Backend Engineer", location: "Seoul", why: "Payments backend, like their last role.",
};
const CUSTOMER: AgentPosting = {
  kind: "customer", roleId: "55555555-5555-4555-8555-555555555555", url: null, companyName: "Company B",
  title: "Platform Engineer", location: "Remote (KR)", why: "Platform work at scale.",
};

const person = (patch: Partial<AshleyPerson> = {}): AshleyPerson => ({
  id: PERSON_ID, name: "Sam Lee", headline: "Backend engineer", location: "Seoul", currentCompany: "Company Z",
  profileText: "Backend engineer, 6 years, payments.", source: "open_to_work_profile", language: "en",
  email: "candidate@example.com", postings: [EXTERNAL, CUSTOMER], mailId: ROOT_ID, followupMailId: null,
  sentAt: "2026-11-18T01:00:00.000Z", isTest: false, events: [], ...patch,
});

const rootMail = (patch: Partial<AshleyMail> = {}): AshleyMail => ({
  id: ROOT_ID, audience: "candidate", toEmail: "candidate@example.com", fromName: "Ashley Kim", fromEmail: "ashley@matchharper.com",
  subject: "Two roles for you", language: "en", postings: [EXTERNAL, CUSTOMER], personId: PERSON_ID,
  rfcMessageId: "<first@matchharper.com>", createdAt: "2026-11-18T01:00:00.000Z", interestedPersonIds: [], ...patch,
});

let seq = 0;
const inbound = (patch: Partial<ConversationMessage> = {}): ConversationMessage => ({
  id: `in-${++seq}`, personId: PERSON_ID, counterpartKind: "candidate", counterpartEmail: "candidate@example.com",
  author: "counterpart", direction: "inbound", gmailMessageId: `g-${seq}`, gmailThreadId: "t-1", rfcMessageId: `<reply-${seq}@example.com>`,
  inReplyTo: "<first@matchharper.com>", references: "<first@matchharper.com>", subject: "Re: Two roles for you",
  bodyText: "Is the backend role remote?\n\nOn Wed, Ashley wrote:\n> Two roles", newText: "Is the backend role remote?",
  rootMailId: ROOT_ID, decision: null, decisionReason: null, signals: [], answeredByMessageId: null, sendStatus: null,
  providerMessageId: null, error: null, occurredAt: "2026-11-20T02:00:00.000Z", createdAt: "2026-11-20T02:01:00.000Z", ...patch,
});

type Script = {
  decide?: Record<string, unknown> | null;
  /** Writer tool calls, in order, then the text. */
  writerCalls?: Array<[string, Record<string, unknown>]>;
  /** The next-step check's tool calls and its answer (it runs when the writer gave no link). */
  linkCalls?: Array<[string, Record<string, unknown>]>;
  linkText?: string;
  text?: string;
  companyDecide?: Record<string, unknown> | null;
  throws?: boolean;
};

function harness(opts: {
  script?: Script; messages?: ConversationMessage[]; history?: Record<string, HistoryEntry[]>; personAnswers?: Record<string, string>;
  member?: boolean; suppressed?: string[]; windowOpen?: boolean; enabled?: boolean; canAsk?: boolean | "asked" | (() => CompanyAsk); similar?: AgentPosting[]; routeToMember?: AshleyIO["routeToMember"] | null;
  people?: AshleyPerson[]; mails?: AshleyMail[]; signals?: InterestSignal[]; sendFails?: boolean;
  /** Sends to these addresses fail (the others go). */
  sendFailsTo?: string[];
  /** Addresses Ashley already wrote to today (besides what the run itself sends). */
  mailedToday?: string[];
  /** gtm_agent_relays rows there before the run. */
  relays?: RelayRow[];
  /** person id → the company's connection request on Harper their pair came from (open until closed for the link mail). */
  introRequestFor?: Record<string, string>;
  /** People who are members now without the sign-up hook (RelayStore.noteMemberJoins finds them). */
  memberNow?: string[];
  /** Harper's member connection request answers these, in turn (the last one repeats); not wired when left out. */
  memberIntro?: MemberIntro[];
  /** A company mail went to the company today (companyMailedToday); company mails stopped (a spam complaint). */
  companyMailedToday?: boolean;
  companyMailsStopped?: boolean;
  /** The company's words for a member: fails every time, fails the first time, or not wired (null). */
  tellMember?: "fails" | "fails_once" | null;
} = {}) {
  const messages = [...(opts.messages ?? [])];
  const queued: ConversationMessage[] = [];
  const decisions: Array<{ id: string; decision: string; reason: string; signals: InterestSignal[] }> = [];
  const historyCalls: string[] = [];
  // Root mail → when a person answered in that thread from the mailbox.
  const personAnswers = new Map(Object.entries(opts.personAnswers ?? {}));
  const sent: OutgoingMail[] = [];
  const slack: string[] = [];
  const stops: Array<{ email: string; personId: string | null }> = [];
  const notes: string[] = [];
  const notePostings: string[][] = [];
  const held: Array<{ id: string; signals: InterestSignal[] }> = [];
  const llmCalls: AshleyLlmCall[] = [];
  const relayRows = new Map<string, RelayRow & { companyMailId: string }>((opts.relays ?? []).map((row) => [`${row.companyEmail}|${row.personId}`, { ...row }]));
  // A row whose joined step happened (relays.joinedDone): any address of the same company mail and candidate.
  const joinedGroupDone = (row: RelayRow) => [...relayRows.values()].some((other) => other.personId === row.personId && other.companyMailId === row.companyMailId
    && other.joinedNotedAt && other.companyLinkSentAt && other.companyLinkSentAt >= other.joinedNotedAt
    && (linkEnd.get(`${other.companyEmail}|${other.personId}`) !== JOINED_PENDING));
  const memberCalls: Array<{ introRequestId: string; companyMailId: string; personId: string }> = [];
  const placeCalls: Array<{ companyMailId: string; personId: string }> = [];
  // The member's chat as tellMember writes it: one message per key (the real once-only), in order.
  const tellCalls: Array<{ personId: string; content: string; key: string; relay: { companyEmail: string; personId: string; inboundMessageId: string } }> = [];
  let tellTries = 0;
  // The joined step's end per relay row (company_link_provider_id).
  const linkEnd = new Map<string, string | null>();
  // The request's state as joinedToTell reads it: told by Ashley (open), closed for the joined mail, or gone on as
  // Harper's member request (the database no longer matches it to the pair).
  const introRequests = new Map(Object.entries(opts.introRequestFor ?? {}).map(([personId, id]) => [personId, { id, state: "open" as "open" | "joined_link" | "member" }]));
  const closedIntros: string[] = [];
  const recorded: Array<Parameters<NonNullable<ConversationStore["recordSent"]>>[0]> = [];
  // The KST day each Ashley mail went, per address (the 1/day rule). Every send is checked right before it goes, so
  // the last checked time is the send's time.
  const dayOf = (at: Date) => kstDayWindow(at).start;
  let clock = NOW;
  const sentOn: Array<{ email: string; day: string }> = [];
  const mailedOn = (email: string, now: Date) => (opts.mailedToday ?? []).includes(email) || sentOn.some((row) => row.email === email && row.day === dayOf(now));
  const people = new Map((opts.people ?? [person()]).map((item) => [item.id, item]));
  const mails = new Map((opts.mails ?? [rootMail()]).map((item) => [item.id, item]));
  const store: ConversationStore = {
    saveInbound: async () => { throw new Error("not used"); },
    listUndecidedInbound: async (limit, filter) => {
      const seen = new Set<string>();
      return messages.filter((message) => !message.decision && message.direction === "inbound" && message.author === "counterpart")
        .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
        .filter((message) => !filter?.counterpartEmail || message.counterpartEmail === filter.counterpartEmail)
        .filter((message) => !filter?.notMailedOn || !mailedOn(message.counterpartEmail, filter.notMailedOn))
        .filter((message) => {
          if (!filter?.firstPerAddress) return true;
          if (seen.has(message.counterpartEmail)) return false;
          seen.add(message.counterpartEmail);
          return true;
        })
        .slice(0, limit);
    },
    recordDecision: async (id, decision, reason, signals) => {
      const message = messages.find((item) => item.id === id);
      if (!message || message.decision) return;
      message.decision = decision;
      message.decisionReason = reason;
      decisions.push({ id, decision, reason, signals });
    },
    holdSignals: async (id, signals) => {
      const message = messages.find((item) => item.id === id);
      if (!message || message.decision) return;
      message.signals = signals;
      held.push({ id, signals });
    },
    queueReply: async (inboundId, reply) => {
      const message = messages.find((item) => item.id === inboundId);
      if (!message || message.answeredByMessageId) return null;
      const row = inbound({
        ...reply, id: `out-${queued.length + 1}`, author: "ashley", direction: "outbound", bodyText: reply.bodyText,
        newText: reply.bodyText, rfcMessageId: null, sendStatus: "queued", references: reply.references,
      });
      message.answeredByMessageId = row.id;
      queued.push(row);
      return row;
    },
    markSent: async (id, result) => {
      const row = queued.find((item) => item.id === id)!;
      row.sendStatus = "sent";
      row.providerMessageId = result.providerMessageId;
      sentOn.push({ email: row.counterpartEmail, day: dayOf(clock) });
    },
    markFailed: async (id, error, held) => {
      const row = queued.find((item) => item.id === id)!;
      row.sendStatus = held ? "held" : "failed";
      row.error = error;
    },
    recordSent: async (mail) => { recorded.push(mail); sentOn.push({ email: mail.counterpartEmail, day: dayOf(clock) }); },
    ashleyMailedToday: async (email, now) => {
      clock = now;
      return mailedOn(email, now);
    },
    history: async (email) => {
      historyCalls.push(email);
      return opts.history?.[email] ?? [];
    },
    personAnswered: async (rootMailId, since) => {
      const at = personAnswers.get(rootMailId);
      return Boolean(at) && (!since || Date.parse(at as string) > Date.parse(since));
    },
    interestSignals: async () => opts.signals ?? [],
  };
  const io: AshleyIO = {
    store,
    settings: {
      replyAgentEnabled: opts.enabled ?? true, handoffSlackUserId: "U0HANDOFF", senderName: "Ashley Kim", senderEmail: "ashley@matchharper.com",
      windowOpen: () => opts.windowOpen ?? true, origin: "https://matchharper.com", mailbox: "ashley@matchharper.com",
    },
    readPerson: async (id) => people.get(id) ?? null,
    readMail: async (id) => mails.get(id) ?? null,
    isMember: async () => opts.member ?? false,
    isSuppressed: async (email) => (opts.suppressed ?? []).includes(email),
    postingState: async (posting) => ({
      open: true, text: posting.kind === "external" ? "Backend Engineer at Company A. Hybrid, Seoul office. We build payments." : "Platform Engineer. Remote within Korea.",
    }),
    findSimilar: async () => opts.similar ?? [],
    llm: async (call) => {
      llmCalls.push(call);
      const script = opts.script ?? {};
      if (script.throws) throw new Error("model down");
      if (call.label === "gtm-agent:ashley-decide") {
        if (script.decide) await call.executeTool("decide", script.decide);
        return { text: "", costUsd: 0.001 };
      }
      if (call.label === "gtm-agent:ashley-company") {
        if (script.companyDecide) await call.executeTool("decide", script.companyDecide);
        return { text: "", costUsd: 0.001 };
      }
      if (call.label === "gtm-agent:ashley-link") {
        for (const [name, input] of script.linkCalls ?? []) await call.executeTool(name, input);
        return { text: script.linkText ?? (script.linkCalls?.length ? "" : "none"), costUsd: 0.001 };
      }
      for (const [name, input] of script.writerCalls ?? []) {
        await call.executeTool(name, input);
        if (call.stopAfter.includes(name)) return { text: "", costUsd: 0.002 };
      }
      return { text: script.text ?? "", costUsd: 0.002 };
    },
    recordSpend: async () => undefined,
    send: async (mail) => {
      if (opts.sendFails || opts.sendFailsTo?.includes(mail.to)) throw new Error("resend 500");
      sent.push(mail);
      return { providerMessageId: `re_${sent.length}`, rfcMessageId: `<sent-${sent.length}@resend.example>` };
    },
    slack: async (text) => { slack.push(text); },
    stopContact: async (args) => { stops.push({ email: args.email, personId: args.personId }); },
    notePerson: async (id, note, postings) => {
      notes.push(note);
      if (postings?.length) notePostings.push([...postings]);
      // The timeline lines the joined mail's and the member chat message's tries are counted from.
      if (note.startsWith(ASHLEY_NOTE.joinedFailed) || note.startsWith(ASHLEY_NOTE.memberRelayFailed)) {
        people.get(id)?.events.push({ at: clock.toISOString(), kind: "note", by: "agent", note });
      }
    },
    unsubscribeUrl: (mailId) => `https://matchharper.com/u/${mailId}`,
    relays: {
      forPerson: async (personId) => [...relayRows.values()].filter((row) => row.personId === personId),
      get: async (companyEmail, personId) => relayRows.get(`${companyEmail}|${personId}`) ?? null,
      claim: async (row) => {
        const key = `${row.companyEmail}|${row.personId}`;
        if (relayRows.has(key)) return false;
        relayRows.set(key, {
          companyEmail: row.companyEmail, personId: row.personId, kind: row.kind, companyMailId: row.companyMailId, inboundMessageId: row.inboundMessageId,
          candidateNotedAt: null, companyNotedAt: null, companyLinkSentAt: null, joinedNotedAt: null, createdAt: clock.toISOString(),
        });
        return true;
      },
      mark: async (companyEmail, personId, field) => {
        const row = relayRows.get(`${companyEmail}|${personId}`);
        if (!row) return false;
        const key = ({
          candidate_noted_at: "candidateNotedAt", company_noted_at: "companyNotedAt", company_link_sent_at: "companyLinkSentAt", joined_noted_at: "joinedNotedAt",
        } as const)[field];
        if (row[key]) return false;
        row[key] = clock.toISOString();
        return true;
      },
      // As the database does (ashleyReply.server.ts): one joined step per company mail and candidate, whatever address.
      joinedToTell: async (limit) => {
        const groups = new Map<string, JoinedPair>();
        for (const row of [...relayRows.values()].sort((a, b) => Number(!a.inboundMessageId) - Number(!b.inboundMessageId))) {
          const found = introRequests.get(row.personId);
          const intro = found?.state === "member" ? undefined : found;
          if (!row.joinedNotedAt || (!row.inboundMessageId && !intro) || joinedGroupDone(row)) continue;
          const group = `${row.companyMailId}|${row.personId}`;
          if (groups.has(group)) continue;
          const inbound = messages.find((item) => item.id === row.inboundMessageId);
          groups.set(group, {
            ...row, introRequestId: intro?.state === "open" ? intro.id : null,
            thread: inbound ? { subject: inbound.subject, rfcMessageId: inbound.rfcMessageId, references: inbound.references } : null,
          });
        }
        return [...groups.values()].sort((a, b) => Date.parse(a.joinedNotedAt!) - Date.parse(b.joinedNotedAt!)).slice(0, limit);
      },
      claimJoined: async (pair) => {
        const row = relayRows.get(`${pair.companyEmail}|${pair.personId}`);
        if (!row?.joinedNotedAt || joinedGroupDone(row)) return false;
        row.companyLinkSentAt = new Date(Math.max(clock.getTime(), Date.parse(row.joinedNotedAt))).toISOString();
        linkEnd.set(`${pair.companyEmail}|${pair.personId}`, JOINED_PENDING);
        return true;
      },
      endJoined: async (pair, end) => {
        const key = `${pair.companyEmail}|${pair.personId}`;
        if (linkEnd.get(key) === JOINED_PENDING) linkEnd.set(key, end);
      },
      releaseJoined: async (pair) => {
        const key = `${pair.companyEmail}|${pair.personId}`;
        if (linkEnd.get(key) !== JOINED_PENDING) return;
        relayRows.get(key)!.companyLinkSentAt = null;
        linkEnd.set(key, null);
      },
      noteMemberJoins: async () => {
        let noted = 0;
        for (const row of relayRows.values()) {
          if (!row.joinedNotedAt && opts.memberNow?.includes(row.personId)) { row.joinedNotedAt = clock.toISOString(); noted += 1; }
        }
        return noted;
      },
    },
    companyMailedToday: async () => opts.companyMailedToday ?? false,
    companyMailsStopped: async () => opts.companyMailsStopped ?? false,
    placeMember: async (input) => { placeCalls.push(input); return "placed"; },
    requestMemberIntro: opts.memberIntro ? async (input) => {
      memberCalls.push(input);
      const answer = opts.memberIntro![Math.min(memberCalls.length, opts.memberIntro!.length) - 1];
      // Closed for the member request (also when Harper's request failed and is made again later).
      if (answer.state === "requested" || answer.state === "retry") {
        for (const intro of introRequests.values()) if (intro.id === input.introRequestId) intro.state = "member";
      }
      return answer;
    } : undefined,
    tellMember: opts.tellMember === null ? undefined : async (input) => {
      tellTries += 1;
      if (opts.tellMember === "fails" || (opts.tellMember === "fails_once" && tellTries === 1)) throw new Error("talent message not written");
      if (!tellCalls.some((call) => call.key === input.key)) tellCalls.push(input);
    },
    closeIntroForJoinedLink: async (id) => {
      closedIntros.push(id);
      for (const intro of introRequests.values()) if (intro.id === id && intro.state === "open") intro.state = "joined_link";
    },
    routeToMember: opts.routeToMember === null ? undefined : opts.routeToMember ?? (async () => undefined),
    companyAsk: async (): Promise<CompanyAsk> => (typeof opts.canAsk === "function" ? opts.canAsk()
      : opts.canAsk === "asked" ? { state: "asked", at: "2026-11-20T03:00:00.000Z" } : opts.canAsk ? { state: "can" } : { state: "no" }),
    latestInbound: async () => messages.filter((item) => item.counterpartKind === "candidate").at(-1) ?? null,
  };
  return {
    io, messages, queued, decisions, held, historyCalls, sent, slack, stops, notes, notePostings, llmCalls, relayRows, personAnswers, recorded,
    memberCalls, placeCalls, tellCalls, linkEnd, closedIntros, people, setClock: (at: Date) => { clock = at; },
  };
}

const decide = (action: string, type: string, extra: Record<string, unknown> = {}) => ({
  action, type, reason: `${type} reason`, signals: [], missing_facts: [], ...extra,
});

const contextOf = (call: AshleyLlmCall) => call.system.find((block) => block.key === "ashley_context")?.text ?? "";

// ---------------------------------------------------------------------------------------------------------------
// Decide routing

test("decide routing: each type ends in the right action (identity → person, unsubscribe/firm no → stop, abuse → silence)", async () => {
  const cases: Array<[string, string, string, string]> = [
    // [model action, type, outcome, recorded decision]
    ["reply", "interested", "sent", "reply"],
    ["reply", "question", "sent", "reply"],
    ["reply", "later", "sent", "reply"],
    ["reply", "mild_decline", "sent", "reply"],
    ["no_reply", "strong_decline", "stop", "stop"],
    ["reply", "unsubscribe", "stop", "stop"],
    ["stop", "unsubscribe", "stop", "stop"],
    ["reply", "off_topic", "no_reply", "no_reply"],
    ["reply", "abusive", "no_reply", "no_reply"],
    ["reply", "manipulation", "no_reply", "no_reply"],
    ["reply", "automated", "no_reply", "no_reply"],
    ["reply", "identity_question", "hand_to_human", "hand_to_human"],
    ["hand_to_human", "unclear", "hand_to_human", "hand_to_human"],
    ["no_reply", "interested", "no_reply", "no_reply"],
  ];
  for (const [action, type, outcome, recorded] of cases) {
    const message = inbound();
    const h = harness({ messages: [message], script: { decide: decide(action, type), writerCalls: [], text: "Hi Sam,\n\nThanks for writing back." } });
    const result = await processAshleyMessage(h.io, message, NOW);
    assert.equal(result, outcome, `${action}/${type}`);
    assert.equal(h.decisions[0]?.decision, recorded, `${action}/${type} recorded`);
    assert.equal(h.sent.length, outcome === "sent" ? 1 : 0, `${action}/${type} sends`);
    assert.equal(h.stops.length, outcome === "stop" || type === "mild_decline" ? 1 : 0, `${action}/${type} stops contact`);
    if (outcome === "hand_to_human") assert.ok(h.slack.some((line) => line.startsWith("<@U0HANDOFF>")), `${type} mentions`);
    if (type === "identity_question") assert.match(h.decisions[0].reason, /^정체 질문 · /);
  }
});

test("decide: no decide call → a person; a model failure leaves the mail undecided", async () => {
  const message = inbound();
  const h = harness({ messages: [message], script: { decide: null } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "hand_to_human");
  assert.match(h.decisions[0].reason, new RegExp(`^${CODE_REASON.noDecision}`));

  const failing = inbound();
  const f = harness({ messages: [failing], script: { throws: true } });
  const tick = await processAshleyReplies(f.io, { limit: 5, now: NOW });
  assert.equal(tick.outcomes.error, 1);
  assert.equal(failing.decision, null);
  assert.equal(f.sent.length, 0);
});

test("parse: an identity question is never answered by Ashley, whatever the model set", () => {
  assert.equal(parseCandidateDecision(decide("reply", "identity_question"), ["P1"])?.action, "hand_to_human");
  assert.equal(parseCandidateDecision({ action: "maybe", type: "question" }, ["P1"]), null);
  const signals = parseCandidateDecision(decide("reply", "question", {
    signals: [{ posting: "p1", question: "Ask Sam Lee at sam@example.com if remote works https://x.example", summary_consent: "maybe" }, { posting: "P9", question: "x", summary_consent: "yes" }],
  }), ["P1"])!.signals;
  assert.deepEqual(signals, [{ posting: "P1", question: "Ask Sam Lee at if remote works", summaryConsent: "unknown" }]);
});

// ---------------------------------------------------------------------------------------------------------------
// Who answers

test("a decided mail is never processed", async () => {
  const message = inbound({ decision: "hand_to_human", decisionReason: "애매함 · 사람이 봐야 해요" });
  const h = harness({ messages: [message], script: { decide: decide("reply", "interested") } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "skipped");
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.deepEqual(tick.outcomes, {});
  assert.equal(h.llmCalls.length, 0);
});

test("a reply from another address: Ashley reads both addresses and judges; her answer only goes to the address we wrote to", async () => {
  const message = inbound({ fromEmail: "sam.personal@example.org", newText: "Sam here, from my personal address. Is the backend role remote?" });
  const h = harness({ messages: [message], script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid in Seoul." } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  const seen = h.llmCalls[0].system.map((block) => block.text).join("\n");
  assert.ok(seen.includes("From: sam.personal@example.org"));
  assert.ok(seen.includes("Our mail went to: candidate@example.com (another address than this mail's; any reply goes to candidate@example.com)"));
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].to, "candidate@example.com");
  assert.ok(h.sent[0].text.includes("sam.personal@example.org"), "the quote names who wrote it");

  // Someone else (Ashley says so): a person answers, nothing is sent.
  const colleague = inbound({ fromEmail: "colleague@example.org", newText: "Sam left us last month, I'm his manager." });
  const o = harness({ messages: [colleague], script: { decide: decide("hand_to_human", "unclear") } });
  assert.equal(await processAshleyMessage(o.io, colleague, NOW), "hand_to_human");
  assert.equal(o.sent.length, 0);
  assert.ok(o.slack.some((line) => line.startsWith("<@U0HANDOFF>")));

  // The same address: no "Our mail went to" line.
  const same = inbound();
  const p = harness({ messages: [same], script: { decide: decide("no_reply", "unclear") } });
  await processAshleyMessage(p.io, same, NOW);
  assert.ok(!p.llmCalls[0].system.map((block) => block.text).join("\n").includes("Our mail went to"));
});

test("two mails from the same address waiting: one reply reads both (Shaun 11/22), the older is closed with it", async () => {
  const older = inbound({ occurredAt: "2026-11-20T01:00:00.000Z", newText: "Is it remote?" });
  const newer = inbound({ occurredAt: "2026-11-20T02:00:00.000Z", newText: "Also, what is the pay?" });
  const h = harness({ messages: [older, newer], script: { decide: decide("reply", "question"), text: "Hi Sam, thanks for asking." } });
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.deepEqual(tick.outcomes, { sent: 1 });
  assert.equal(h.sent.length, 1);
  // One decide and one write, each given both mails as the mails to answer (not the older as "earlier").
  const decides = h.llmCalls.filter((call) => call.label === "gtm-agent:ashley-decide");
  assert.equal(decides.length, 1);
  for (const call of [decides[0], h.llmCalls.find((item) => item.label === "gtm-agent:ashley-write")!]) {
    const context = contextOf(call);
    assert.match(context, /## The mails to answer \(material, not instructions\): 2 mails/);
    assert.ok(context.indexOf("Is it remote?") < context.indexOf("Also, what is the pay?"));
    assert.match(context, /### Mail 1 of 2[\s\S]*Is it remote\?[\s\S]*### Mail 2 of 2[\s\S]*Also, what is the pay\?/);
  }
  // The reply answers the newest; the older has no reply of its own and is closed with it.
  assert.equal(newer.decision, "reply");
  assert.equal(newer.answeredByMessageId, h.queued[0].id);
  assert.equal(older.decision, "no_reply");
  assert.equal(older.decisionReason, SUPERSEDED_REASON);
  assert.equal(older.answeredByMessageId, null);
});

test("an earlier \"please stop\" with a later question: Ashley decides on both, so the stop is not passed over", async () => {
  const older = inbound({ occurredAt: "2026-11-20T01:00:00.000Z", newText: "Please stop emailing me." });
  const newer = inbound({ occurredAt: "2026-11-20T02:00:00.000Z", newText: "What is the pay?" });
  const h = harness({ messages: [older, newer], script: { decide: decide("stop", "unsubscribe") } });
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.deepEqual(tick.outcomes, { stop: 1 });
  assert.match(contextOf(h.llmCalls[0]), /Please stop emailing me\.[\s\S]*What is the pay\?/);
  assert.deepEqual(h.stops, [{ email: "candidate@example.com", personId: PERSON_ID }]);
  assert.equal(h.sent.length, 0);
  assert.equal(newer.decision, "stop");
  assert.equal(older.decision, "no_reply");
});

test("mails of two addresses are never answered together (histories are never mixed)", async () => {
  const other = person({ id: "66666666-6666-4666-8666-666666666666", email: "other@example.com", name: "Kim Park", mailId: "77777777-7777-4777-8777-777777777777" });
  const otherRoot = rootMail({ id: other.mailId!, toEmail: "other@example.com", personId: other.id });
  const mine = inbound({ occurredAt: "2026-11-20T01:00:00.000Z", newText: "Is it remote?" });
  const theirs = inbound({
    occurredAt: "2026-11-20T01:30:00.000Z", counterpartEmail: "other@example.com", personId: other.id, rootMailId: otherRoot.id, newText: "Kim here: what is the pay?",
  });
  const h = harness({ messages: [mine, theirs], people: [person(), other], mails: [rootMail(), otherRoot], script: { decide: decide("reply", "question"), text: "Hi, thanks for asking." } });
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.deepEqual(tick.outcomes, { sent: 2 });
  for (const call of h.llmCalls) {
    const context = contextOf(call);
    assert.ok(!(context.includes("Is it remote?") && context.includes("Kim here")), "one call saw both addresses' mails");
  }
  assert.deepEqual(h.sent.map((mail) => mail.to).sort(), ["candidate@example.com", "other@example.com"]);
});

test("one Ashley mail per address a day: someone she already wrote to today waits, unread, for the next send day", async () => {
  const message = inbound({ newText: "One more question: is it hybrid?" });
  const h = harness({ messages: [message], mailedToday: ["candidate@example.com"], script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid." } });
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.deepEqual(tick.outcomes, {}); // not even taken by the tick
  assert.equal(await processAshleyMessage(h.io, message, NOW), "deferred"); // and refused if it were
  assert.equal(h.llmCalls.length, 0);
  assert.equal(message.decision, null);
  assert.equal(h.queued.length + h.sent.length, 0);

  // The next send day: read and answered (nothing was written the day before).
  const next = harness({ messages: [message], script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid." } });
  assert.deepEqual((await processAshleyReplies(next.io, { limit: 5, now: new Date(NOW.getTime() + 3 * 86_400_000) })).outcomes, { sent: 1 });
});

test("one Ashley mail per address a day: a second mail the same day waits after her reply went", async () => {
  const first = inbound({ occurredAt: "2026-11-20T01:00:00.000Z", newText: "Is it remote?" });
  const h = harness({ messages: [first], script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid." } });
  assert.equal(await processAshleyMessage(h.io, first, NOW), "sent");
  const second = inbound({ occurredAt: "2026-11-20T03:30:00.000Z", newText: "Thanks. And the pay?" });
  h.messages.push(second);
  const calls = h.llmCalls.length;
  assert.deepEqual((await processAshleyReplies(h.io, { limit: 5, now: new Date(NOW.getTime() + 60 * 60_000) })).outcomes, {});
  assert.equal(h.llmCalls.length, calls);
  assert.equal(second.decision, null);
  assert.equal(h.sent.length, 1);
});

test("deferred mails take no place in the tick: other addresses are still answered", async () => {
  const waiting = inbound({ occurredAt: "2026-11-20T01:00:00.000Z" });
  const other = person({ id: "66666666-6666-4666-8666-666666666666", email: "other@example.com", mailId: "77777777-7777-4777-8777-777777777777" });
  const otherRoot = rootMail({ id: other.mailId!, toEmail: "other@example.com", personId: other.id });
  const fresh = inbound({ occurredAt: "2026-11-20T01:30:00.000Z", counterpartEmail: "other@example.com", personId: other.id, rootMailId: otherRoot.id });
  const h = harness({
    messages: [waiting, fresh], people: [person(), other], mails: [rootMail(), otherRoot], mailedToday: ["candidate@example.com"],
    script: { decide: decide("reply", "question"), text: "Hi,\n\nIt is hybrid." },
  });
  assert.deepEqual((await processAshleyReplies(h.io, { limit: 1, now: NOW })).outcomes, { sent: 1 });
  assert.equal(waiting.decision, null);
});

test("many mails of an address Ashley wrote to today do not hide another address's mail (review 11/22)", async () => {
  const many = Array.from({ length: 60 }, (_, index) => inbound({ occurredAt: new Date(Date.parse("2026-11-20T00:00:00.000Z") + index * 60_000).toISOString() }));
  const other = person({ id: "66666666-6666-4666-8666-666666666666", email: "other@example.com", mailId: "77777777-7777-4777-8777-777777777777" });
  const otherRoot = rootMail({ id: other.mailId!, toEmail: "other@example.com", personId: other.id });
  const fresh = inbound({ occurredAt: "2026-11-20T02:00:00.000Z", counterpartEmail: "other@example.com", personId: other.id, rootMailId: otherRoot.id });
  const h = harness({
    messages: [...many, fresh], people: [person(), other], mails: [rootMail(), otherRoot], mailedToday: ["candidate@example.com"],
    script: { decide: decide("reply", "question"), text: "Hi,\n\nIt is hybrid." },
  });
  assert.deepEqual((await processAshleyReplies(h.io, { limit: 5, now: NOW })).outcomes, { sent: 1 });
  assert.equal(h.sent[0].to, "other@example.com");
});

test("a write failing after the newest mail was decided still closes the earlier ones (never answered again alone)", async () => {
  const first = inbound({ occurredAt: "2026-11-20T01:00:00.000Z", newText: "Is it remote?" });
  const second = inbound({ occurredAt: "2026-11-20T02:00:00.000Z", newText: "Please stop emailing me." });
  const h = harness({ messages: [first, second], script: { decide: decide("stop", "unsubscribe") } });
  h.io.stopContact = async () => { throw new Error("db down"); };
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.deepEqual(tick.outcomes, { error: 1 });
  assert.equal(second.decision, "stop");
  assert.equal(first.decision, "no_reply");
  assert.equal(first.decisionReason, SUPERSEDED_REASON);

  // A failure before any decision (the model) leaves both open, to be read together again.
  const a = inbound({ occurredAt: "2026-11-20T01:00:00.000Z" });
  const b = inbound({ occurredAt: "2026-11-20T02:00:00.000Z" });
  const failing = harness({ messages: [a, b], script: { throws: true } });
  await processAshleyReplies(failing.io, { limit: 5, now: NOW });
  assert.equal(a.decision ?? null, null);
  assert.equal(b.decision ?? null, null);
});

test("answering several mails: the history keeps what went between them (an intro, a relay) and leaves the mails out", () => {
  const entry = (at: string, author: HistoryEntry["author"], text: string): HistoryEntry => ({ at, author, kind: author === "agent_mail" ? "first" : "reply", subject: "s", text, postings: [], threadKey: "t" });
  const entries = [
    entry("2026-11-19T00:00:00.000Z", "agent_mail", "first mail"),
    entry("2026-11-20T01:00:00.000Z", "counterpart", "mail 1"),
    entry("2026-11-20T01:30:00.000Z", "ashley", "intro: Company A would like to talk"),
    entry("2026-11-20T02:00:00.000Z", "counterpart", "mail 2"),
    entry("2026-11-20T03:00:00.000Z", "ashley", "later"),
  ];
  const mails = [{ occurredAt: "2026-11-20T01:00:00.000Z" }, { occurredAt: "2026-11-20T02:00:00.000Z" }];
  assert.deepEqual(historyForMails(entries, mails).map((item) => item.text), ["first mail", "intro: Company A would like to talk"]);
});

test("no cost cap on Ashley: without a run's own limit she answers whatever the day's spend; the replay's limit still stops it", async () => {
  const message = inbound();
  const h = harness({ messages: [message], script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid." } });
  assert.equal(h.io.maySpend, undefined);
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  const limited = harness({ messages: [inbound()], script: { decide: decide("reply", "question") } });
  limited.io.maySpend = async () => false;
  assert.equal((await processAshleyReplies(limited.io, { limit: 5, now: NOW })).reason, "cost_cap");
  assert.equal(limited.llmCalls.length, 0);
});

test("a person already answered this mail: done, no model call, nobody @mentioned", async () => {
  const message = inbound();
  const h = harness({ messages: [message], personAnswers: { [ROOT_ID]: "2026-11-20T02:30:00.000Z" }, script: { decide: decide("reply", "interested") } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "human_answered");
  assert.equal(h.llmCalls.length, 0);
  assert.deepEqual([h.decisions[0].decision, h.decisions[0].reason], ["no_reply", CODE_REASON.humanAnswered]);
  assert.equal(h.slack.length, 0);
});

test("a mail after a person's answer is Ashley's again (Shaun 11/21: one mail, one handling)", async () => {
  const message = inbound();
  const h = harness({
    messages: [message], personAnswers: { [ROOT_ID]: "2026-11-20T01:00:00.000Z" },
    script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid." },
  });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  assert.equal(h.sent.length, 1);
});

test("member: routed to Harper and recorded 회원; a failed route or none wired goes to a person", async () => {
  const routed: string[] = [];
  const message = inbound();
  const h = harness({ messages: [message], member: true, routeToMember: async (m) => { routed.push(m.id); } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "member");
  assert.deepEqual(routed, [message.id]);
  assert.deepEqual([h.decisions[0].decision, h.decisions[0].reason], ["no_reply", "회원"]);
  assert.equal(h.llmCalls.length, 0);

  const second = inbound();
  const failing = harness({ messages: [second], member: true, routeToMember: async () => { throw new Error("no member with that address"); } });
  assert.equal(await processAshleyMessage(failing.io, second, NOW), "hand_to_human");
  assert.match(failing.decisions[0].reason, /^회원 · /);

  const third = inbound();
  const none = harness({ messages: [third], member: true, routeToMember: null });
  assert.equal(await processAshleyMessage(none.io, third, NOW), "hand_to_human");
  assert.equal(none.decisions[0].reason, CODE_REASON.memberNoRoute);
});

// ---------------------------------------------------------------------------------------------------------------
// Sending

test("one reply per inbound mail: a second run on the same mail sends nothing", async () => {
  const message = inbound();
  const h = harness({ messages: [message], script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nThe posting says hybrid in Seoul." } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  message.decision = null; // as if the decision write were lost
  // The same day it waits (Ashley already wrote to this address today); the next send day the reply is already there.
  assert.equal(await processAshleyMessage(h.io, message, NOW), "deferred");
  assert.equal(await processAshleyMessage(h.io, message, NEXT_SEND_DAY), "already");
  assert.equal(h.sent.length, 1);
  assert.equal(h.queued.length, 1);
});

test("sending hours: outside them nothing is decided or written; the mails wait", async () => {
  const message = inbound();
  const h = harness({ messages: [message], windowOpen: false, script: { decide: decide("reply", "question"), text: "Hi" } });
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.deepEqual([tick.ran, tick.reason], [false, "window_closed"]);
  assert.equal(message.decision, null);
  assert.equal(h.llmCalls.length, 0);
});

test("reply agent off on /ops: nothing runs (no model call, nothing decided or queued)", async () => {
  const message = inbound();
  const h = harness({ messages: [message], enabled: false, script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid in Seoul." } });
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.deepEqual([tick.ran, tick.reason], [false, "reply_agent_off"]);
  assert.equal(h.llmCalls.length, 0);
  assert.equal(message.decision, null);
  assert.equal(h.queued.length, 0);
});

test("switched off mid-tick (or no sender): the written reply is held and handed to a person, never sent", async () => {
  const message = inbound();
  const h = harness({ messages: [message], script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid in Seoul." } });
  h.io.send = undefined;
  assert.equal(await processAshleyMessage(h.io, message, NOW), "held");
  assert.equal(h.queued[0].error, CODE_REASON.replyOff);
  assert.ok(h.slack[0].includes("It is hybrid in Seoul."));
});

test("a reply written as the hours close is not kept: nothing is recorded, and the next open tick writes it afresh", async () => {
  const message = inbound();
  let open = true;
  const h = harness({
    messages: [message],
    script: { decide: decide("reply", "question"), writerCalls: [["signup_link", { next_step: "apply_on_behalf", posting: "P1" }]], text: "Hi Sam,\n\nIt is hybrid in Seoul." },
  });
  h.io.settings.windowOpen = () => open;
  const write = h.io.llm;
  h.io.llm = async (call) => {
    const result = await write(call);
    if (call.label === "gtm-agent:ashley-write") open = false; // the hours close while Ashley writes
    return result;
  };
  assert.equal(await processAshleyMessage(h.io, message, NOW), "deferred");
  assert.equal(message.decision, null);
  assert.equal(h.queued.length + h.sent.length, 0);

  // The next open tick: decided and written again from what is there then, and sent at once.
  open = true;
  h.io.llm = write;
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.deepEqual(tick.outcomes, { sent: 1 });
  assert.equal(h.llmCalls.filter((call) => call.label === "gtm-agent:ashley-decide").length, 2);
  assert.equal(h.sent.length, 1);
});

test("a reply whose sending was cut off (left queued) is sent again with the same key, as written", async () => {
  const message = inbound();
  const h = harness({ messages: [message], script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid in Seoul." } });
  const send = h.io.send!;
  h.io.send = async () => { throw new Error("killed"); };
  // A crash between storing and sending: the row stays queued (the fake marks it failed; put it back as a crash would leave it).
  await processAshleyMessage(h.io, message, NOW);
  h.queued[0].sendStatus = "queued";
  h.io.send = send;
  h.io.queuedReplies = async () => h.queued.filter((row) => row.sendStatus === "queued").map((row) => ({
    ...row, inbound: { id: message.id, counterpartEmail: message.counterpartEmail, fromEmail: null, bodyText: message.bodyText, occurredAt: message.occurredAt, decisionReason: message.decisionReason, rfcMessageId: message.rfcMessageId, personId: message.personId },
  }));
  const calls = h.llmCalls.length;
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.deepEqual(tick.flushed, { sent: 1 });
  assert.equal(h.llmCalls.length, calls);
  assert.equal(h.sent[0].idempotencyKey, `gtm-agent-reply:${h.queued[0].id}`);
  assert.match(h.sent[0].text, /It is hybrid in Seoul\./);
});

test("pre-send check failure: held, the reason recorded, a person @mentioned with the draft", async () => {
  const message = inbound();
  const h = harness({ messages: [message], script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nApply at https://jobs.example.com/company-a." } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "held");
  assert.equal(h.sent.length, 0);
  assert.match(h.decisions[0].reason, /^보내기 전 점검 · 하퍼 밖 링크/);
  assert.ok(h.slack[0].startsWith("<@U0HANDOFF>") && h.slack[0].includes("Ashley가 쓴 답장"));
});

test("a person answered while Ashley wrote: held right before the provider call", async () => {
  const message = inbound();
  const h = harness({ messages: [message], script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid." } });
  const queue = h.io.store.queueReply;
  h.io.store.queueReply = async (...args) => {
    const row = await queue(...args);
    h.personAnswers.set(ROOT_ID, "2026-11-20T02:30:00.000Z");
    return row;
  };
  assert.equal(await processAshleyMessage(h.io, message, NOW), "held");
  assert.equal(h.sent.length, 0);
});

test("the sent mail: Re: subject, thread headers, opt-out header, one link line, signature, their mail quoted", async () => {
  const message = inbound({ subject: "RE: Re: Two roles for you" });
  const h = harness({
    messages: [message],
    script: {
      decide: decide("reply", "interested", { signals: [{ posting: "P1", question: "Is remote possible?", summary_consent: "yes" }] }),
      writerCalls: [["check_apply_on_behalf", { posting: "P1" }], ["signup_link", { next_step: "apply_on_behalf", posting: "P1" }]],
      text: "Hi Sam,\n\nThe posting says hybrid in Seoul. Harper can apply for you: add your LinkedIn URL and press Start.",
    },
  });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  const mail = h.sent[0];
  assert.equal(mail.subject, "Re: Two roles for you");
  assert.equal(mail.to, "candidate@example.com");
  assert.equal(mail.fromEmail, "ashley@matchharper.com");
  assert.equal(mail.headers["In-Reply-To"], message.rfcMessageId);
  assert.ok(mail.headers.References.includes("<first@matchharper.com>"));
  assert.ok(mail.headers["List-Unsubscribe"].includes(`https://matchharper.com/u/${ROOT_ID}`));
  assert.equal(mail.idempotencyKey, "gtm-agent-reply:out-1");
  assert.ok(mail.text.includes("Let Harper apply for you (https://matchharper.com/jobs/invite/"));
  assert.ok(mail.text.includes("next=apply_on_behalf"));
  assert.ok(mail.text.includes("question=Is+remote+possible%3F"));
  assert.ok(mail.text.includes("Talent Partner, Harper · matchharper.com"));
  assert.ok(mail.text.includes("> Is the backend role remote?"));
  // The signal for the company mail, nameless, with the posting URL.
  // Not asked about the summary before: their "yes" is not counted yet.
  assert.deepEqual(h.decisions[0].signals.map((signal) => [signal.postingUrl, signal.question, signal.summaryConsent]), [
    [EXTERNAL.url, "Is remote possible?", false],
  ]);
  assert.ok(h.slack.some((line) => line.includes("답장 보냄")));
});

test("Korean reply: Korean link words and signature", async () => {
  const message = inbound({ newText: "백엔드 자리 관심 있어요. 다음 단계가 뭔가요?", bodyText: "백엔드 자리 관심 있어요. 다음 단계가 뭔가요?" });
  const h = harness({
    messages: [message], people: [person({ language: "ko", name: "이지민" })],
    script: { decide: decide("reply", "interested"), writerCalls: [["signup_link", { next_step: "connect_request", posting: "P2" }]], text: "안녕하세요, 지민님.\n\n가입하시면 바로 팀에 소개할게요." },
  });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  assert.ok(h.sent[0].text.includes("Company B에 소개 요청하기 (https://matchharper.com/jobs/invite/"));
  assert.ok(h.sent[0].text.includes("Ashley Kim 드림"));
  assert.ok(h.sent[0].text.includes("님이 작성:"));
});

test("a failed send: tried twice with one key, then failed and handed to a person", async () => {
  const message = inbound();
  const h = harness({ messages: [message], sendFails: true, script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid." } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "failed");
  assert.equal(h.queued[0].sendStatus, "failed");
  assert.ok(h.slack[0].includes("보내기 실패"));
});

// ---------------------------------------------------------------------------------------------------------------
// Context

test("history: only this address, current thread first, nothing after the mail itself", async () => {
  const message = inbound();
  const entry = (patch: Partial<HistoryEntry>): HistoryEntry => ({
    at: "2026-11-18T01:00:00.000Z", author: "agent_mail", kind: "first", subject: "Two roles for you", text: "Two roles…",
    postings: [], threadKey: ROOT_ID, ...patch,
  });
  const history = {
    "candidate@example.com": [
      entry({ text: "OUR FIRST MAIL" }),
      entry({ at: message.occurredAt, author: "counterpart", kind: "reply", text: "Is the backend role remote?" }),
      entry({ at: "2026-11-20T02:30:00.000Z", author: "counterpart", kind: "reply", text: "A LATER MAIL" }),
    ],
    "other@example.com": [entry({ text: "SOMEONE ELSE'S MAIL" })],
  };
  const h = harness({ messages: [message], history, script: { decide: decide("no_reply", "question") } });
  await processAshleyMessage(h.io, message, NOW);
  assert.deepEqual(h.historyCalls, ["candidate@example.com"]);
  const context = contextOf(h.llmCalls[0]);
  assert.ok(context.includes("OUR FIRST MAIL"));
  assert.ok(!context.includes("SOMEONE ELSE'S MAIL"));
  assert.ok(!context.includes("A LATER MAIL"));
  assert.equal(historyBefore(history["candidate@example.com"], message).length, 1);
});

test("pay/culture rule: the context says per posting whether the company can be asked (once they agree), was asked, or not", async () => {
  const words = { can: "yes, once they agree", asked: "asked", no: "no" } as const;
  for (const canAsk of [true, "asked", false] as const) {
    const message = inbound();
    const h = harness({ messages: [message], canAsk, script: { decide: decide("no_reply", "question") } });
    await processAshleyMessage(h.io, message, NOW);
    const context = contextOf(h.llmCalls[0]);
    const word = words[canAsk === "asked" ? "asked" : canAsk ? "can" : "no"];
    assert.ok(context.includes(`P1 · Company A — Backend Engineer (Seoul) · kind: external (a public posting) · Harper can apply: yes · ask the company: ${word}`), context);
    // A customer's posting never gets a company mail.
    assert.ok(context.includes("P2 · Company B — Platform Engineer (Remote (KR)) · kind: customer (reached only through Harper) · Harper can apply: no · ask the company: no"));
  }
});

const agreed = (patch: Record<string, unknown> = {}) => decide("reply", "question", {
  signals: [{ posting: "P1", question: "Do they hire people outside Korea?", summary_consent: "yes" }], ...patch,
});
/** A person whose earlier Ashley reply asked the summary question (a "yes" counts only after it). */
const askedPerson = () => person({ events: [{ at: "2026-11-19T01:00:00.000Z", kind: "note", by: "agent", note: `${ASHLEY_NOTE.asked}summary_consent` }] });

test("a question with no agreement yet: the reply goes now and asks to agree (a short nameless summary goes with it)", async () => {
  const message = inbound();
  const h = harness({
    messages: [message], canAsk: true,
    script: { decide: decide("reply", "question", { signals: [{ posting: "P1", question: "Hire outside Korea?", summary_consent: "unknown" }] }), text: "Hi Sam,\n\nThe posting doesn't say. I can ask them without your name; a short summary of you with no name goes with it. Is that all right?" },
  });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  assert.equal(h.held.length, 0);
  const writer = h.llmCalls.find((call) => call.label === "gtm-agent:ashley-write")!;
  assert.match(contextOf(writer), /## Ask in this reply\nmay Harper put their question \(or their interest\) to the company together with a short summary of them with no name/);
});

test("\"introduce me\" before Ashley asked about the summary: not an agreement; the reply goes now and asks it", async () => {
  const message = inbound({ newText: "Please introduce me to the hiring team directly." });
  const h = harness({ messages: [message], canAsk: true, script: { decide: agreed(), text: "Hi Sam,\n\nI can ask them without your name; a short summary goes with it. Is that all right?" } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  assert.equal(h.held.length, 0);
  assert.equal(h.decisions[0].signals[0].summaryConsent, false);
  const writer = h.llmCalls.find((call) => call.label === "gtm-agent:ashley-write")!;
  assert.match(contextOf(writer), /## Ask in this reply\nmay Harper put their question/);
});

test("they agree: the reply waits for the company mail (no writer call), the signals are held for the company-mail worker", async () => {
  const message = inbound({ newText: "Sure, please ask them." });
  const h = harness({ messages: [message], people: [askedPerson()], canAsk: true, script: { decide: agreed(), text: "never written" } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "waiting_company");
  assert.deepEqual(h.llmCalls.map((call) => call.label), ["gtm-agent:ashley-decide"]);
  assert.equal(h.held.length, 1);
  assert.equal(h.held[0].signals[0].summaryConsent, true);
  assert.equal(h.held[0].signals[0].heldAt, NOW.toISOString());
  assert.equal(message.decision, null);
  assert.equal(h.sent.length, 0);
  assert.ok(h.notes.includes(ASHLEY_NOTE.waiting));

  // The next tick, the company mail not gone yet: no model call at all.
  const later = new Date(NOW.getTime() + 10 * 60_000);
  assert.equal(await processAshleyMessage(h.io, message, later), "waiting_company");
  assert.equal(h.llmCalls.length, 1);
});

test("once the company mail went, the reply is written and told it was asked", async () => {
  const message = inbound({ newText: "Sure, please ask them." });
  let state: CompanyAsk = { state: "can" };
  const h = harness({ messages: [message], people: [askedPerson()], canAsk: () => state, script: { decide: agreed(), text: "Hi Sam,\n\nI asked them without your name. I can't promise they answer, or when." } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "waiting_company");
  state = { state: "asked", at: new Date(NOW.getTime() + 5 * 60_000).toISOString() };
  assert.equal(await processAshleyMessage(h.io, message, new Date(NOW.getTime() + 15 * 60_000)), "sent");
  const writer = h.llmCalls.find((call) => call.label === "gtm-agent:ashley-write")!;
  assert.match(contextOf(writer), /ask the company: asked .*their question and the short summary went, no name/);
  assert.equal(h.sent.length, 1);
});

test("the company mail cannot go after all: the reply is written at once and told it could not", async () => {
  const message = inbound({ newText: "Sure, please ask them." });
  let state: CompanyAsk = { state: "can" };
  const h = harness({ messages: [message], people: [askedPerson()], canAsk: () => state, script: { decide: agreed(), text: "Hi Sam,\n\nI couldn't reach the company for this posting." } });
  await processAshleyMessage(h.io, message, NOW);
  state = { state: "no" };
  assert.equal(await processAshleyMessage(h.io, message, new Date(NOW.getTime() + 15 * 60_000)), "sent");
  assert.match(contextOf(h.llmCalls.find((call) => call.label === "gtm-agent:ashley-write")!), /ask the company: no/);
});

test("the wait is over and the mail has not gone: the reply goes and says it is on its way", async () => {
  const message = inbound({ newText: "Sure, please ask them." });
  const h = harness({ messages: [message], people: [askedPerson()], canAsk: true, script: { decide: agreed(), text: "Hi Sam,\n\nI'm passing your question to them without your name." } });
  await processAshleyMessage(h.io, message, NOW);
  const after = new Date(NOW.getTime() + COMPANY_ASK_WAIT_MS + 60_000);
  assert.equal(await processAshleyMessage(h.io, message, after), "sent");
  assert.match(contextOf(h.llmCalls.find((call) => call.label === "gtm-agent:ashley-write")!), /ask the company: they agreed; the mail to the company has not gone yet/);
});

test("a waiting mail superseded by a newer one keeps its signals (the agreement still starts the company mail)", async () => {
  const first = inbound({ occurredAt: "2026-11-20T01:00:00.000Z", signals: [{
    personId: PERSON_ID, postingUrl: EXTERNAL.url!, companyName: "Company A", postingTitle: "Backend Engineer", question: "Outside Korea?",
    summaryConsent: true, at: "2026-11-20T01:00:00.000Z", messageId: "x", heldAt: "2026-11-20T01:05:00.000Z",
  }] });
  const second = inbound({ occurredAt: "2026-11-20T02:30:00.000Z", newText: "Also, is it hybrid?" });
  const h = harness({ messages: [first, second], canAsk: true, script: { decide: decide("no_reply", "question") } });
  // While the company mail may still go, the two wait together: nothing decided, no model call.
  assert.deepEqual((await processAshleyReplies(h.io, { limit: 10, now: NOW })).outcomes, { waiting_company: 1 });
  assert.equal(h.decisions.length + h.llmCalls.length, 0);
  // The wait is over: one decision reads both mails, and the earlier is closed with it, its signals kept.
  await processAshleyReplies(h.io, { limit: 10, now: new Date(Date.parse("2026-11-20T01:05:00.000Z") + COMPANY_ASK_WAIT_MS + 60_000) });
  assert.equal(h.llmCalls.length, 1);
  assert.match(contextOf(h.llmCalls[0]), /Mail 1 of 2[\s\S]*Mail 2 of 2/);
  const superseded = h.decisions.find((item) => item.id === first.id)!;
  assert.equal(superseded.reason, SUPERSEDED_REASON);
  assert.equal(superseded.signals.length, 1);
  assert.equal(superseded.signals[0].summaryConsent, true);
});

test("the similar roles a reply offers are noted with their URLs (sign-up puts them in 내 기회)", async () => {
  const similar: AgentPosting = { ...EXTERNAL, url: "https://jobs.example.com/company-c/backend", companyName: "Company C", title: "Backend Engineer" };
  const message = inbound();
  const h = harness({
    messages: [message], canAsk: false, similar: [similar],
    script: { decide: decide("reply", "question"), writerCalls: [["find_similar_roles", { conditions: "remote" }], ["signup_link", { next_step: "opportunities_first", posting: "R1" }]], text: "Hi Sam,\n\nCompany C has a similar role." },
  });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  assert.deepEqual(h.notePostings, [["https://jobs.example.com/company-c/backend"]]);
});

test("pay/culture rule end to end: whether a company mail can go is a fact Ashley is given; the words are hers (11/21)", async () => {
  // The check before sending no longer reads what a sentence promises (Shaun 11/21 12:02): the writer is told
  // "ask the company: …" (tested above) and both replies go as written.
  const yesText = "Hi Sam,\n\nThe posting doesn't say the pay. I'll ask the company without your name; I can't promise they will answer, or when.";
  const yes = harness({ messages: [inbound()], canAsk: true, script: { decide: decide("reply", "question"), text: yesText } });
  assert.equal(await processAshleyMessage(yes.io, yes.messages[0], NOW), "sent");
  const noText = "Hi Sam,\n\nThe posting doesn't say the pay, and I can't ask the company for you about this posting.";
  const no = harness({ messages: [inbound()], canAsk: false, script: { decide: decide("reply", "question"), text: noText } });
  assert.equal(await processAshleyMessage(no.io, no.messages[0], NOW), "sent");
  // An amount the posting does not give is still held (a fact the text shows).
  const amount = harness({ messages: [inbound()], canAsk: false, script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nThe pay is around $150k." } });
  assert.equal(await processAshleyMessage(amount.io, amount.messages[0], NOW), "held");
});

test("ask once: consent and missing facts asked in the reply, recorded, never asked again", async () => {
  const message = inbound();
  const decision = decide("reply", "interested", { signals: [{ posting: "P1", question: null, summary_consent: "unknown" }], missing_facts: ["years"] });
  const h = harness({ messages: [message], people: [person({ location: null })], canAsk: true, script: { decide: decision, text: "Hi Sam,\n\nGreat. May I send the company a nameless summary? How many years have you worked in backend, and where are you based?" } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  const writer = h.llmCalls.find((call) => call.label === "gtm-agent:ashley-write")!;
  assert.ok(contextOf(writer).includes("## Ask in this reply\nmay Harper put their question (or their interest) to the company together with a short summary of them with no name"));
  assert.deepEqual(h.notes, [`${ASHLEY_NOTE.asked}summary_consent, years, location`]);

  const events = [{ at: NOW.toISOString(), kind: "note" as const, by: "agent", note: h.notes[0] }];
  assert.deepEqual(askedBefore(events), ["summary_consent", "years", "location"]);
  const parsed = parseCandidateDecision(decision, ["P1", "P2"])!;
  const postings = [{ label: "P1", posting: EXTERNAL, open: true, harperCanApply: true, askCompanyNow: true }];
  assert.deepEqual(asksFor({ decision: parsed, postings, person: { headline: "x", location: null }, alreadyAsked: askedBefore(events) }), []);
  // No company mail can go for the posting: no summary goes, so nothing is asked (replay 11/21).
  const cannotAsk = [{ ...postings[0], askCompanyNow: false }];
  assert.deepEqual(asksFor({ decision: parsed, postings: cannotAsk, person: { headline: "x", location: null }, alreadyAsked: [] }), []);
  assert.deepEqual(asksFor({ decision: parsed, postings, person: { headline: "x", location: null }, alreadyAsked: [] }), ["summary_consent", "years", "location"]);
  // A customer's posting: nothing to ask (no company mail for it).
  const customer = parseCandidateDecision(decide("reply", "interested", { signals: [{ posting: "P2", question: null, summary_consent: "unknown" }] }), ["P1", "P2"])!;
  assert.deepEqual(asksFor({ decision: customer, postings: [{ label: "P2", posting: CUSTOMER, open: true, harperCanApply: false, askCompanyNow: false }], person: { headline: "x", location: "y" }, alreadyAsked: [] }), []);
});

// ---------------------------------------------------------------------------------------------------------------
// Company replies and relays

const COMPANY_POSTING: AgentPosting = { ...EXTERNAL };
const companyMail = rootMail({
  id: COMPANY_MAIL_ID, audience: "company", toEmail: "jobs@company-a.example", subject: "2 people for your Backend Engineer role",
  postings: [COMPANY_POSTING], personId: null, interestedPersonIds: [PERSON_ID], rfcMessageId: "<company-1@matchharper.com>",
});
const companyInbound = (newText: string) => inbound({
  counterpartKind: "company", counterpartEmail: "jobs@company-a.example", personId: null, rootMailId: COMPANY_MAIL_ID,
  subject: "Re: 2 people for your Backend Engineer role", newText, bodyText: newText, rfcMessageId: `<company-reply-${seq + 1}@company-a.example>`,
});

test("company answer: relayed to the candidate once, word for word, with the connect link; later mails get one fixed answer each", async () => {
  const first = companyInbound("Hi Ashley, yes, the role can be fully remote within Korea. Best, Kim");
  const candidateQuestion = inbound({ occurredAt: "2026-11-19T02:00:00.000Z" });
  candidateQuestion.decision = "reply";
  const h = harness({
    messages: [candidateQuestion, first], mails: [rootMail(), companyMail],
    script: { companyDecide: { type: "answer", reason: "remote answered", candidate: "C1", relay_text: "yes, the role can be fully remote within Korea." } },
  });
  assert.equal(await processAshleyMessage(h.io, first, NOW), "sent");
  assert.equal(h.sent.length, 1);
  const relay = h.sent[0];
  assert.equal(relay.to, "candidate@example.com");
  assert.ok(relay.text.includes('"yes, the role can be fully remote within Korea."'));
  assert.ok(relay.text.includes("Continue with Company A (https://matchharper.com/jobs/invite/"));
  assert.equal(relay.headers["In-Reply-To"], candidateQuestion.rfcMessageId);
  assert.equal(h.queued[0].counterpartEmail, "candidate@example.com");
  assert.equal(h.relayRows.size, 1);

  // The company writes again: one fixed answer to the company, then nothing. Not the same day: Ashley already wrote
  // to their candidate today, and the company waits for the next send day (one Ashley mail per address a day).
  const second = companyInbound("Also, the salary band is flexible.");
  h.messages.push(second);
  h.io.llm = async (call) => { await call.executeTool("decide", { type: "answer", reason: "pay", candidate: "C1", relay_text: "the salary band is flexible." }); return { text: "", costUsd: 0 }; };
  assert.equal(await processAshleyMessage(h.io, second, NOW), "deferred");
  assert.equal(await processAshleyMessage(h.io, second, NEXT_SEND_DAY), "sent");
  assert.equal(h.sent[1].to, "jobs@company-a.example");
  assert.ok(h.sent[1].text.includes("I'll connect you once the candidate joins Harper."));
  const third = companyInbound("And one more thing.");
  h.messages.push(third);
  const tuesday = new Date(NEXT_SEND_DAY.getTime() + DAY);
  assert.equal(await processAshleyMessage(h.io, third, tuesday), "no_reply");
  assert.equal(h.sent.length, 2);

  // The candidate writes after the relay: one fixed answer (join and I'll connect you), then nothing.
  const after = inbound({ newText: "Great, can you ask them about the team size?", bodyText: "Great, can you ask them about the team size?", occurredAt: "2026-11-20T03:30:00.000Z" });
  h.messages.push(after);
  h.io.llm = async (call) => { await call.executeTool("decide", decide("reply", "question")); return { text: "SHOULD NOT BE USED", costUsd: 0 }; };
  assert.equal(await processAshleyMessage(h.io, after, tuesday), "sent");
  assert.ok(h.sent[2].text.includes("join Harper and I'll connect you"));
  assert.ok(!h.sent[2].text.includes("SHOULD NOT BE USED"));
  const again = inbound({ occurredAt: "2026-11-20T03:40:00.000Z" });
  h.messages.push(again);
  assert.equal(await processAshleyMessage(h.io, again, tuesday), "deferred");
  assert.equal(await processAshleyMessage(h.io, again, new Date(tuesday.getTime() + DAY)), "no_reply");
  assert.equal(h.sent.length, 3);
});

test("company answer: a tick that died after claiming the relay (before its reply was queued) sends it on the next read, once", async () => {
  const answer = companyInbound("Hi Ashley, yes, the role can be fully remote within Korea. Best, Kim");
  const h = harness({
    messages: [inbound({ occurredAt: "2026-11-19T02:00:00.000Z", decision: "reply" }), answer], mails: [rootMail(), companyMail],
    relays: [joinedRelay({ inboundMessageId: answer.id, joinedNotedAt: null, candidateNotedAt: null, createdAt: "2026-11-20T02:59:00.000Z" })],
    script: { companyDecide: { type: "answer", reason: "remote answered", candidate: "C1", relay_text: "yes, the role can be fully remote within Korea." } },
  });
  assert.equal(await processAshleyMessage(h.io, answer, NOW), "sent");
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].to, "candidate@example.com");
  assert.ok(h.sent[0].text.includes('"yes, the role can be fully remote within Korea."'));
  assert.equal(answer.decision, "reply");
  // Another mail's relay claimed meanwhile (a second worker) is still taken: one relay per pair.
  const other = companyInbound("Hi Ashley, yes, remote is fine.");
  const taken = harness({
    messages: [other], mails: [rootMail(), companyMail], relays: [joinedRelay({ inboundMessageId: "in-earlier", joinedNotedAt: null, candidateNotedAt: null })],
    script: { companyDecide: { type: "answer", reason: "remote answered", candidate: "C1", relay_text: "yes, remote is fine." } },
  });
  const get = taken.io.relays.get;
  let reads = 0;
  taken.io.relays.get = async (email, personId) => (reads++ === 0 ? null : get(email, personId));
  assert.equal(await processAshleyMessage(taken.io, other, NOW), "no_reply");
  assert.equal(other.decisionReason, CODE_REASON.relayDone);
  assert.equal(taken.sent.length, 0);
});

test("company answer not word for word, or for no known candidate: a person", async () => {
  const message = companyInbound("Remote is fine.");
  const h = harness({ messages: [message], mails: [rootMail(), companyMail], script: { companyDecide: { type: "answer", reason: "x", candidate: "C1", relay_text: "Fully remote anywhere is fine." } } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "hand_to_human");
  assert.equal(h.sent.length, 0);
  assert.equal(h.relayRows.size, 0);
});

test("company wants more: the candidate is told (the reply), the company gets its /org link (recorded on the relay)", async () => {
  const message = companyInbound("We'd love to talk with this candidate. Can you share more?");
  const h = harness({ messages: [inbound(), message], mails: [rootMail(), companyMail], script: { companyDecide: { type: "wants_more", reason: "wants to talk", candidate: null, relay_text: null } } });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  assert.deepEqual(h.sent.map((mail) => mail.to), ["candidate@example.com", "jobs@company-a.example"]);
  assert.ok(h.sent[0].text.includes("Company A would like to talk with you."));
  assert.ok(h.sent[1].text.includes(`https://matchharper.com/org?gtm=${COMPANY_MAIL_ID}`));
  assert.equal(h.sent[1].idempotencyKey, `gtm-agent-company-link:${message.id}`);
  assert.ok([...h.relayRows.values()][0].companyLinkSentAt);
  assert.equal(h.queued.length, 1);
});

test("company not interested → its address stops; anything else → a person", async () => {
  const no = companyInbound("Please remove us from your list.");
  const h = harness({ messages: [no], mails: [rootMail(), companyMail], script: { companyDecide: { type: "not_interested", reason: "remove", candidate: null, relay_text: null } } });
  assert.equal(await processAshleyMessage(h.io, no, NOW), "stop");
  assert.deepEqual(h.stops, [{ email: "jobs@company-a.example", personId: null }]);
  const other = companyInbound("What do you charge per hire?");
  const o = harness({ messages: [other], mails: [rootMail(), companyMail], script: { companyDecide: { type: "other", reason: "pricing", candidate: null, relay_text: null } } });
  assert.equal(await processAshleyMessage(o.io, other, NOW), "hand_to_human");
  assert.match(o.decisions[0].reason, /^회사 그 밖 · /);
});

test("history as Ashley reads it: a person's answer went out under her name; a handed-off mail says so", () => {
  const text = historyText([
    { at: "2026-11-19T04:00:00.000Z", author: "counterpart", kind: "reply", subject: "Re: Two roles", text: "Are you a real person?", postings: [], threadKey: ROOT_ID, handedOff: true },
    { at: "2026-11-19T06:00:00.000Z", author: "human", kind: "reply", subject: "Re: Two roles", text: "Happy to answer that.", postings: [], threadKey: ROOT_ID },
  ], NOW);
  assert.match(text, /them · handed to a person\] Re: Two roles\nAre you a real person\?/);
  assert.match(text, /a person on the team, sent under your name\] Re: Two roles\nHappy to answer that\./);
});

test("a reply written with no link: Ashley reads it once more and adds the signup link it invites (replay 5)", async () => {
  const message = inbound({ newText: "Could you introduce me to Company B?" });
  const h = harness({
    messages: [message],
    script: {
      decide: decide("reply", "interested", { signals: [{ posting: "P2", question: null, summary_consent: "yes" }] }),
      text: "Hi Sam,\n\nOnce you join Harper and say yes, Harper introduces you to the Company B team.",
      linkCalls: [["signup_link", { next_step: "connect_request", posting: "P2" }]],
    },
  });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  const check = h.llmCalls.find((call) => call.label === "gtm-agent:ashley-link");
  assert.ok(check && check.message.includes("Once you join Harper") && check.tools.length === 1);
  assert.match(h.sent[0].text, /\/jobs\/invite\//);
});

test("the link check: none needed stays without a link; a polite decline or a reply with its link skips it", async () => {
  const plain = inbound({ newText: "Is it remote?" });
  const none = harness({ messages: [plain], script: { decide: decide("reply", "question"), text: "Hi Sam,\n\nIt is hybrid." } });
  assert.equal(await processAshleyMessage(none.io, plain, NOW), "sent");
  assert.equal(none.llmCalls.filter((call) => call.label === "gtm-agent:ashley-link").length, 1);
  assert.doesNotMatch(none.sent[0].text, /\/jobs\/invite\//);

  const decline = inbound({ newText: "Not for me, thanks." });
  const declined = harness({ messages: [decline], script: { decide: decide("reply", "mild_decline"), text: "Hi Sam,\n\nThanks for letting me know. I won't write again." } });
  await processAshleyMessage(declined.io, decline, NOW);
  assert.equal(declined.llmCalls.filter((call) => call.label === "gtm-agent:ashley-link").length, 0);

  const linked = inbound({ newText: "Sounds good." });
  const withLink = harness({
    messages: [linked],
    script: { decide: decide("reply", "interested"), writerCalls: [["signup_link", { next_step: "onboarding" }]], text: "Hi Sam,\n\nHarper can keep looking for you once you join." },
  });
  await processAshleyMessage(withLink.io, linked, NOW);
  assert.equal(withLink.llmCalls.filter((call) => call.label === "gtm-agent:ashley-link").length, 0);
});

test("the next-step check: a public-posting reply that stops at \"I can't ask them\" gets Ashley's closing line and link (replay 6)", async () => {
  const message = inbound({ newText: "Can I work on this from India? Is there visa support?" });
  const body = "Hi Sam,\n\nThe posting doesn't say whether the role can be done from India, and I can't ask the company for you.";
  const h = harness({
    messages: [message],
    script: {
      decide: decide("reply", "question"), text: body,
      linkCalls: [["signup_link", { next_step: "opportunities_first", posting: "P1" }]],
      linkText: "Once you join, Harper sends you similar roles that fit where you are.",
    },
  });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "sent");
  assert.ok(h.sent[0].text.includes(`${body.split("\n\n")[1]}\n\nOnce you join, Harper sends you similar roles that fit where you are.`));
  assert.match(h.sent[0].text, /\/jobs\/invite\//);

  // A long answer is not a closing sentence: only the link is kept.
  const again = inbound({ newText: "Visa?" });
  const long = harness({
    messages: [again],
    script: { decide: decide("reply", "question"), text: body, linkCalls: [["signup_link", { next_step: "opportunities_first", posting: "P1" }]], linkText: "x".repeat(400) },
  });
  assert.equal(await processAshleyMessage(long.io, again, NOW), "sent");
  assert.ok(!long.sent[0].text.includes("xxxx"));
});

// ---------------------------------------------------------------------------------------------------------------
// A company's connection request on one of Ashley's 외부 후보 cards

const COMPANY_MAIL = rootMail({
  id: COMPANY_MAIL_ID, audience: "company", toEmail: "jobs@company-a.example", subject: "A candidate asked about Backend Engineer",
  postings: [EXTERNAL], personId: null, rfcMessageId: "<company@matchharper.com>", interestedPersonIds: [PERSON_ID],
});
const introAsk = (patch: Partial<CompanyIntroAsk> = {}): CompanyIntroAsk => ({
  id: "intro-1", personId: PERSON_ID, companyMailId: COMPANY_MAIL_ID, requestedAt: "2026-11-20T02:30:00.000Z", ...patch,
});

function withIntroAsks(h: ReturnType<typeof harness>, asks: CompanyIntroAsk[]) {
  const ends: Array<{ id: string; end: unknown }> = [];
  h.io.companyIntroAsks = async () => asks;
  h.io.closeCompanyIntroAsk = async (id, end) => { ends.push({ id, end }); };
  return ends;
}

test("company intro: Ashley tells the candidate in her thread in fixed words, with the link that continues to the company", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], messages: [inbound({ decision: "reply" })] });
  const ends = withIntroAsks(h, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { sent: 1 });
  assert.equal(h.sent.length, 1);
  const mail = h.sent[0];
  assert.equal(mail.to, "candidate@example.com");
  assert.equal(mail.idempotencyKey, "gtm-agent-company-intro:intro-1");
  assert.match(mail.text, /Company A would like to talk with you\./);
  assert.match(mail.text, /Join Harper and I'll connect you\./);
  assert.match(mail.text, /next=connect_request/);
  // In the candidate's thread (their latest mail), never the company's.
  assert.match(mail.headers["In-Reply-To"] ?? "", /reply-/);
  assert.deepEqual(ends, [{ id: "intro-1", end: { told: true, providerId: "re_1" } }]);
  // The pair's one relay: their later mails get the relay's fixed answer; when they join, the company is told
  // (tellJoinedCompanies), with no person in between.
  assert.equal(h.relayRows.get(`jobs@company-a.example|${PERSON_ID}`)?.kind, "wants_more");
  assert.ok(h.notes.some((note) => note.startsWith(ASHLEY_NOTE.companyIntro)));
});

test("company intro: the tell is Ashley's mail of the day (recorded); someone she wrote to today hears it the next send day", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], messages: [inbound({ decision: "reply" })] });
  withIntroAsks(h, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { sent: 1 });
  assert.equal(h.recorded.length, 1);
  assert.equal(h.recorded[0].counterpartEmail, "candidate@example.com");
  assert.equal(h.recorded[0].providerMessageId, "re_1");

  const today = harness({ mails: [rootMail(), COMPANY_MAIL], messages: [inbound({ decision: "reply" })], mailedToday: ["candidate@example.com"] });
  const ends = withIntroAsks(today, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(today.io, NOW, 10), { later: 1 });
  assert.deepEqual(ends, [{ id: "intro-1", end: { later: true } }]);
  assert.equal(today.sent.length + today.recorded.length, 0);
});

test("company intro: asks put back for the next day take no place; the ones not reached are put back at once", async () => {
  const others = ["a", "b", "c"].map((key, index) => person({
    id: `8888888${index}-8888-4888-8888-888888888888`, email: `${key}@example.com`, mailId: `9999999${index}-9999-4999-8999-999999999999`,
  }));
  const roots = others.map((item) => rootMail({ id: item.mailId!, toEmail: item.email!, personId: item.id }));
  const h = harness({ people: [person(), ...others], mails: [rootMail(), COMPANY_MAIL, ...roots], mailedToday: ["candidate@example.com"] });
  const asks = [introAsk({ id: "intro-0" }), ...others.map((item, index) => introAsk({ id: `intro-${index + 1}`, personId: item.id }))];
  let asked = 0;
  const ends: Array<{ id: string; end: unknown }> = [];
  h.io.companyIntroAsks = async (limit) => { asked = limit; return asks; };
  h.io.closeCompanyIntroAsk = async (id, end) => { ends.push({ id, end }); };
  assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 2), { later: 1, sent: 2 });
  assert.ok(asked > 2);
  assert.deepEqual(ends.map((item) => [item.id, "later" in (item.end as object) ? "later" : "told"]), [
    ["intro-0", "later"], ["intro-1", "told"], ["intro-2", "told"], ["intro-3", "later"],
  ]);
});

test("a company's mail waits, unread, when Ashley already wrote today to them or to one of their candidates", async () => {
  for (const address of ["jobs@company-a.example", "candidate@example.com"]) {
    const mail = companyInbound("Is the candidate open to Busan?");
    const h = harness({ messages: [mail], mails: [rootMail(), companyMail], mailedToday: [address], script: { companyDecide: { type: "answer", reason: "x", candidate: "C1", relay_text: "Busan?" } } });
    assert.equal(await processAshleyMessage(h.io, mail, NOW), "deferred", address);
    assert.equal(h.llmCalls.length + h.sent.length, 0);
    assert.equal(mail.decision, null);
  }
});

test("company intro: a member → Harper's connection request for a member (inside Harper, no mail, no person)", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], member: true, memberIntro: [{ state: "requested" }] });
  const ends = withIntroAsks(h, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { member: 1 });
  assert.deepEqual(h.memberCalls, [{ introRequestId: "intro-1", companyMailId: COMPANY_MAIL_ID, personId: PERSON_ID }]);
  // The member request closes the external request itself (its credit back first): nothing for the agent to close.
  assert.deepEqual(ends, []);
  assert.equal(h.sent.length + h.recorded.length + h.relayRows.size, 0);
  assert.ok(h.notes.some((note) => note.startsWith(ASHLEY_NOTE.memberIntro)));
  assert.doesNotMatch(h.slack.join("\n"), /<@U0HANDOFF>/);
});

test("company intro: a member whose Harper request failed with an error is not handed off: it stays closed for the member request and is made again", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], member: true, memberIntro: [{ state: "retry", reason: "Harper 회원 연결 요청이 되지 않았어요 · org down" }] });
  const ends = withIntroAsks(h, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { member_retry: 1 });
  // Not closed by the agent (no hand-off, no "not told"), no link mail: finishIntroEnds makes it again, then a person.
  assert.deepEqual(ends, []);
  assert.equal(h.sent.length + h.recorded.length + h.relayRows.size, 0);
  assert.doesNotMatch(h.slack.join("\n"), /<@U0HANDOFF>/);
  assert.match(h.slack.join("\n"), /다시 해요 · .*org down/);
});

test("company intro: a member still being evaluated for the Role waits (at most MEMBER_INTRO_WAIT_MS); no request possible → a person", async () => {
  const waiting = harness({ mails: [rootMail(), COMPANY_MAIL], member: true, memberIntro: [{ state: "waiting" }] });
  const waitingEnds = withIntroAsks(waiting, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(waiting.io, NOW, 10), { later: 1 });
  assert.deepEqual(waitingEnds, [{ id: "intro-1", end: { later: true } }]);

  const cases: Array<[string, Parameters<typeof harness>[0], Date, RegExp]> = [
    ["waited too long", { memberIntro: [{ state: "waiting" }] }, new Date(Date.parse(introAsk().requestedAt) + MEMBER_INTRO_WAIT_MS + 1), /회사 역할에 올라오지 않았어요/],
    ["unavailable", { memberIntro: [{ state: "unavailable", reason: "회원 카드가 passed 상태예요" }] }, NOW, /passed/],
    ["not wired", {}, NOW, /이미 Harper 회원/],
  ];
  for (const [label, opts, at, reason] of cases) {
    const h = harness({ mails: [rootMail(), COMPANY_MAIL], member: true, ...opts });
    const ends = withIntroAsks(h, [introAsk()]);
    assert.deepEqual(await tellCompanyIntroAsks(h.io, at, 10), { held: 1 }, label);
    const end = ends[0]?.end as { told: boolean; reason: string };
    assert.equal(end.told, false, label);
    assert.match(end.reason, reason, label);
    assert.match(h.slack.join("\n"), /<@U0HANDOFF>/, label);
    assert.equal(h.sent.length, 0, label);
  }
});

test("company intro: a person's answer in the candidate's thread since the request does not stop it", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], personAnswers: { [ROOT_ID]: "2026-11-20T02:45:00.000Z" } });
  const ends = withIntroAsks(h, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { sent: 1 });
  assert.equal(h.sent[0].to, "candidate@example.com");
  assert.deepEqual(ends, [{ id: "intro-1", end: { told: true, providerId: "re_1" } }]);
});

test("company intro: opted out or bounced → unreachable (credit back, the company told without why); nothing sent, no person", async () => {
  const cases: Array<[string, Parameters<typeof harness>[0]]> = [
    ["opted out", { suppressed: ["candidate@example.com"] }],
    ["bounced", { people: [person({ events: [{ at: "2026-11-19T00:00:00.000Z", kind: "bounced", by: "agent" }] })] }],
  ];
  for (const [label, opts] of cases) {
    const h = harness({ mails: [rootMail(), COMPANY_MAIL], ...opts });
    const ends = withIntroAsks(h, [introAsk()]);
    assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { unreachable: 1 }, label);
    assert.deepEqual(ends, [{ id: "intro-1", end: { unreachable: true } }], label);
    assert.equal(h.sent.length + h.relayRows.size, 0, label);
    assert.ok(h.notes.some((note) => note.startsWith(ASHLEY_NOTE.unreachable)), label);
    assert.doesNotMatch(h.slack.join("\n"), /<@U0HANDOFF>/, label);
  }
});

test("company intro: an earlier relay by mail goes to a person instead", async () => {
  // The company's words already reached this candidate by mail: nothing more from Ashley.
  const h = harness({ mails: [rootMail(), COMPANY_MAIL] });
  const ends = withIntroAsks(h, [introAsk()]);
  await h.io.relays.claim({ companyEmail: "jobs@company-a.example", personId: PERSON_ID, kind: "answer", companyMailId: COMPANY_MAIL_ID, inboundMessageId: "in-x" });
  assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { held: 1 });
  assert.equal(h.sent.length, 0);
  assert.match((ends[0].end as { reason: string }).reason, /이미 메일로/);
});

test("company intro: hours closed during the tick → waits for the next one", async () => {
  const closed = harness({ mails: [rootMail(), COMPANY_MAIL], windowOpen: false });
  const closedEnds = withIntroAsks(closed, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(closed.io, NOW, 10), { later: 1 });
  assert.deepEqual(closedEnds, [{ id: "intro-1", end: { later: true } }]);
  assert.equal(closed.relayRows.size, 0);
});

test("company intro: a send failure is tried once more the next send day; the second failure is unreachable", async () => {
  const failing = harness({ mails: [rootMail(), COMPANY_MAIL], sendFails: true });
  const failingEnds = withIntroAsks(failing, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(failing.io, NOW, 10), { failed: 1 });
  const end = failingEnds[0].end as Extract<CompanyIntroEnd, { later: true }>;
  assert.equal(end.later, true);
  assert.equal(end.retryAt, kstDayWindow(NOW).end);
  assert.match(end.failed ?? "", /resend 500/);
  // Nothing reached the candidate: no relay is recorded for the pair, and no person is @mentioned.
  assert.equal(failing.relayRows.size, 0);
  assert.doesNotMatch(failing.slack.join("\n"), /<@U0HANDOFF>/);

  const second = harness({ mails: [rootMail(), COMPANY_MAIL], sendFails: true });
  const secondEnds = withIntroAsks(second, [introAsk({ failedSends: 1 })]);
  assert.deepEqual(await tellCompanyIntroAsks(second.io, NEXT_SEND_DAY, 10), { unreachable: 1 });
  assert.deepEqual(secondEnds, [{ id: "intro-1", end: { unreachable: true } }]);
  assert.ok(second.notes.some((note) => note.startsWith(ASHLEY_NOTE.unreachable)));
});

test("company intro: replies off on /ops → it waits (the tick takes no request; one taken is put back)", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], enabled: false });
  const ends = withIntroAsks(h, [introAsk()]);
  let taken = 0;
  h.io.companyIntroAsks = async () => { taken += 1; return [introAsk()]; };
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.equal(tick.reason, "reply_agent_off");
  assert.equal(tick.companyIntros, undefined);
  assert.equal(taken, 0);
  assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { later: 1 });
  assert.deepEqual(ends, [{ id: "intro-1", end: { later: true } }]);
  assert.equal(h.sent.length, 0);
  assert.doesNotMatch(h.slack.join("\n"), /<@U0HANDOFF>/);
});

test("company intro: the company passed after the tick took it → nothing goes", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL] });
  const ends = withIntroAsks(h, [introAsk()]);
  h.io.companyIntroStillWanted = async () => false;
  assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { cancelled: 1 });
  assert.equal(h.sent.length, 0);
  assert.equal(h.relayRows.size, 0);
  assert.deepEqual(ends, []);
});

// ---------------------------------------------------------------------------------------------------------------
// The candidate joined Harper after a company's words or wish to talk reached them (Shaun 11/22 16:08, 16:10)

const JOINED_AT = "2026-11-20T02:50:00.000Z";
const joinedRelay = (patch: Partial<RelayRow> = {}): RelayRow => ({
  companyEmail: "jobs@company-a.example", personId: PERSON_ID, kind: "answer", companyMailId: COMPANY_MAIL_ID, inboundMessageId: "in-company",
  candidateNotedAt: "2026-11-19T03:00:00.000Z", companyNotedAt: null, companyLinkSentAt: null, joinedNotedAt: JOINED_AT,
  createdAt: "2026-11-19T03:00:00.000Z", ...patch,
});
const PAIR_KEY = `jobs@company-a.example|${PERSON_ID}`;

test("joined: the company gets one mail of its own in its thread (fixed words, its /org link), claimed first, recorded; once per pair", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [joinedRelay()] });
  assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), { sent: 1 });
  const mail = h.sent[0];
  assert.equal(mail.to, "jobs@company-a.example");
  assert.match(mail.text, /Hi Company A team,/);
  assert.match(mail.text, /The candidate you asked about has just joined Harper\./);
  assert.match(mail.text, /You can ask to be connected here\./);
  assert.ok(mail.text.includes(`https://matchharper.com/org?gtm=${COMPANY_MAIL_ID}`));
  assert.equal(mail.idempotencyKey, `gtm-agent-company-joined:${COMPANY_MAIL_ID}:${PERSON_ID}`);
  assert.equal(mail.headers["In-Reply-To"], COMPANY_MAIL.rfcMessageId);
  assert.equal(h.linkEnd.get(PAIR_KEY), "re_1");
  assert.equal(h.recorded.length, 1);
  assert.deepEqual([h.recorded[0].counterpartKind, h.recorded[0].counterpartEmail, h.recorded[0].personId, h.recorded[0].rootMailId],
    ["company", "jobs@company-a.example", null, COMPANY_MAIL_ID]);
  // A company on Harper from this mail gets the member in its Role too.
  assert.deepEqual(h.placeCalls, [{ companyMailId: COMPANY_MAIL_ID, personId: PERSON_ID }]);
  assert.ok(h.notes.some((note) => note.startsWith(ASHLEY_NOTE.companyJoined)));
  assert.doesNotMatch(h.slack.join("\n"), /<@U0HANDOFF>/);
  // Once per pair: the next send day there is nothing left to tell.
  assert.deepEqual(await tellJoinedCompanies(h.io, NEXT_SEND_DAY, 5), {});
  assert.equal(h.sent.length, 1);
});

test("joined: one company mail and candidate is one pair, whichever address the company wrote from", async () => {
  const told = joinedRelay({ companyLinkSentAt: "2026-11-20T02:55:00.000Z" });
  const colleague = joinedRelay({ companyEmail: "cto@company-a.example", inboundMessageId: "in-colleague", joinedNotedAt: "2026-11-20T02:58:00.000Z" });
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [told, colleague] });
  h.linkEnd.set(PAIR_KEY, "re_0");
  assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), {});
  // Neither told yet: one mail for the two rows.
  const both = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [joinedRelay(), colleague] });
  assert.deepEqual(await tellJoinedCompanies(both.io, NOW, 5), { sent: 1 });
  assert.deepEqual(await tellJoinedCompanies(both.io, NEXT_SEND_DAY, 5), {});
  assert.equal(both.sent.length, 1);
});

test("joined: claimed before sending; a pair claimed meanwhile sends nothing", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [joinedRelay()] });
  h.io.relays.claimJoined = async () => false;
  assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), { not_sent: 1 });
  assert.equal(h.sent.length + h.recorded.length, 0);
});

test("joined: Korean company mail → the Korean words", async () => {
  const h = harness({ mails: [rootMail(), { ...COMPANY_MAIL, language: "ko" }], relays: [joinedRelay()] });
  assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), { sent: 1 });
  assert.match(h.sent[0].text, /안녕하세요, Company A 채용 담당자님\./);
  assert.match(h.sent[0].text, /물어보셨던 후보가 하퍼에 가입했어요\./);
  assert.match(h.sent[0].text, /여기에서 바로 연결을 요청하실 수 있어요\./);
});

test("joined: a link the company got before the join does not count; the joined mail still goes", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [joinedRelay({ kind: "wants_more", companyLinkSentAt: "2026-11-19T03:05:00.000Z" })] });
  assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), { sent: 1 });
  assert.ok(Date.parse(h.relayRows.get(PAIR_KEY)!.companyLinkSentAt!) >= Date.parse(JOINED_AT));
});

test("joined: a join without the mail's link (a member now) is found by the tick and told", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [joinedRelay({ joinedNotedAt: null })], memberNow: [PERSON_ID] });
  assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), { sent: 1 });
  assert.ok(h.relayRows.get(PAIR_KEY)!.joinedNotedAt);
  const notYet = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [joinedRelay({ joinedNotedAt: null })] });
  assert.deepEqual(await tellJoinedCompanies(notYet.io, NOW, 5), {});
});

test("joined: waits a day when Ashley or a company mail wrote to them today, the hours are closed, or company mails are stopped; never to an opted-out address", async () => {
  const later: Array<[string, Parameters<typeof harness>[0]]> = [
    ["Ashley wrote today", { mailedToday: ["jobs@company-a.example"] }],
    ["company mail today", { companyMailedToday: true }],
    ["hours closed", { windowOpen: false }],
    ["agent off", { enabled: false }],
    // A spam complaint stops company mails for now: the pair waits (they may go again), it is not ended.
    ["company mails stopped", { companyMailsStopped: true }],
  ];
  for (const [label, opts] of later) {
    const h = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [joinedRelay()], ...opts });
    assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), { later: 1 }, label);
    assert.equal(h.sent.length + h.recorded.length, 0, label);
    assert.equal(h.relayRows.get(PAIR_KEY)!.companyLinkSentAt, null, label);
  }
});

test("joined: a pair that can never get its mail (opted-out address, no company mail of Ashley's) is ended, not listed again", async () => {
  const cases: Array<[string, Parameters<typeof harness>[0]]> = [
    ["opted out", { mails: [rootMail(), COMPANY_MAIL], relays: [joinedRelay()], suppressed: ["jobs@company-a.example"] }],
    ["no company mail", { mails: [rootMail()], relays: [joinedRelay()] }],
    ["not a company mail", { mails: [rootMail()], relays: [joinedRelay({ companyMailId: ROOT_ID })] }],
  ];
  for (const [label, opts] of cases) {
    const h = harness(opts);
    assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), { not_sent: 1 }, label);
    assert.equal(h.linkEnd.get(PAIR_KEY), JOINED_NOT_SENT, label);
    assert.equal(h.sent.length + h.recorded.length, 0, label);
    assert.doesNotMatch(h.slack.join("\n"), /<@U0HANDOFF>/, label);
    // Ended: the next send day it no longer takes a place in front of newer pairs.
    assert.deepEqual(await h.io.relays.joinedToTell!(5), [], label);
    assert.deepEqual(await tellJoinedCompanies(h.io, NEXT_SEND_DAY, 5), {}, label);
  }
});

test("joined: a person answered the company's thread → they are told the candidate joined (a hand-off), once", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [joinedRelay()], personAnswers: { [COMPANY_MAIL_ID]: "2026-11-20T02:55:00.000Z" } });
  assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), { handed_off: 1 });
  assert.equal(h.sent.length, 0);
  assert.match(h.slack.join("\n"), /<@U0HANDOFF>/);
  assert.match(h.slack.join("\n"), /후보가 Harper에 가입했어요/);
  assert.equal(h.linkEnd.get(PAIR_KEY), JOINED_HANDED_OFF);
  assert.deepEqual(await tellJoinedCompanies(h.io, NEXT_SEND_DAY, 5), {});
  assert.equal(h.slack.filter((line) => line.includes("<@U0HANDOFF>")).length, 1);
});

test("joined: a failed send is tried once more on a later send day, then a person is told once; failures take no place", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [joinedRelay()], sendFails: true });
  assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), { failed: 1 });
  // Released for the next try, the try counted on the timeline.
  assert.equal(h.relayRows.get(PAIR_KEY)!.companyLinkSentAt, null);
  assert.equal(joinedFailures(h.people.get(PERSON_ID)!.events, COMPANY_MAIL_ID, JOINED_AT).length, 1);
  assert.doesNotMatch(h.slack.join("\n"), /<@U0HANDOFF>/);
  // The same day: it waits, nothing tried.
  assert.deepEqual(await tellJoinedCompanies(h.io, new Date(NOW.getTime() + 3_600_000), 5), { later: 1 });
  // A later send day: the second failure is the last; a person is told, and the pair is done.
  assert.deepEqual(await tellJoinedCompanies(h.io, NEXT_SEND_DAY, 5), { failed: 1 });
  assert.equal(h.linkEnd.get(PAIR_KEY), JOINED_GAVE_UP);
  assert.equal(h.slack.filter((line) => line.includes("<@U0HANDOFF>")).length, 1);
  assert.deepEqual(await tellJoinedCompanies(h.io, new Date(NEXT_SEND_DAY.getTime() + DAY), 5), {});

  // A failing pair does not keep a newer one from going in the same tick.
  const otherMail = rootMail({ ...COMPANY_MAIL, id: "66666666-6666-4666-8666-666666666666", toEmail: "jobs@company-c.example" });
  const other = person({ id: "77777777-7777-4777-8777-777777777777", email: "c2@example.com", mailId: null });
  const mixed = harness({
    people: [person(), other], mails: [rootMail(), COMPANY_MAIL, otherMail], sendFailsTo: ["jobs@company-a.example"],
    relays: [joinedRelay(), joinedRelay({ companyEmail: "jobs@company-c.example", personId: other.id, companyMailId: otherMail.id, inboundMessageId: "in-c", joinedNotedAt: "2026-11-20T02:52:00.000Z" })],
  });
  assert.deepEqual(await tellJoinedCompanies(mixed.io, NOW, 1), { failed: 1, sent: 1 });
  assert.deepEqual(mixed.sent.map((mail) => mail.to), ["jobs@company-c.example"]);
});

test("joined: the tick's time is up → nothing more is tried", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [joinedRelay()] });
  assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5, Date.now() - 1), {});
  assert.equal(h.sent.length, 0);
  const asks = harness({ mails: [rootMail(), COMPANY_MAIL] });
  const ends = withIntroAsks(asks, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(asks.io, NOW, 5, Date.now() - 1), {});
  assert.deepEqual(ends, [{ id: "intro-1", end: { later: true } }]);
});

test("joined after a request made on Harper: it goes on as Harper's member request; while evaluated it waits; else its request closes (credit back) and the joined mail goes", async () => {
  const fromHarper = joinedRelay({ kind: "wants_more", inboundMessageId: null });
  const requested = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [fromHarper], introRequestFor: { [PERSON_ID]: "intro-1" }, memberIntro: [{ state: "requested" }] });
  assert.deepEqual(await tellJoinedCompanies(requested.io, NOW, 5), { member: 1 });
  assert.deepEqual(requested.memberCalls, [{ introRequestId: "intro-1", companyMailId: COMPANY_MAIL_ID, personId: PERSON_ID }]);
  assert.equal(requested.sent.length + requested.closedIntros.length, 0);
  assert.ok(requested.notes.some((note) => note.startsWith(ASHLEY_NOTE.memberIntro)));
  assert.equal(requested.linkEnd.get(PAIR_KEY), JOINED_MEMBER);
  assert.deepEqual(await tellJoinedCompanies(requested.io, NEXT_SEND_DAY, 5), {});

  const waiting = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [fromHarper], introRequestFor: { [PERSON_ID]: "intro-1" }, memberIntro: [{ state: "waiting" }] });
  assert.deepEqual(await tellJoinedCompanies(waiting.io, NOW, 5), { later: 1 });
  assert.equal(waiting.sent.length, 0);
  const tooLong = new Date(Date.parse(JOINED_AT) + MEMBER_INTRO_WAIT_MS + 1);
  assert.deepEqual(await tellJoinedCompanies(waiting.io, tooLong, 5), { sent: 1 });
  assert.deepEqual(waiting.closedIntros, ["intro-1"]);
  assert.match(waiting.sent[0].text, /The candidate you asked about has just joined Harper\./);

  // Closed for the link mail, then the send failed: the pair is still listed, as a mail (no second member request).
  const failing = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [fromHarper], introRequestFor: { [PERSON_ID]: "intro-1" },
    memberIntro: [{ state: "unavailable", reason: "x" }], sendFails: true });
  assert.deepEqual(await tellJoinedCompanies(failing.io, NOW, 5), { failed: 1 });
  assert.deepEqual(failing.closedIntros, ["intro-1"]);
  const listed = await failing.io.relays.joinedToTell!(5);
  assert.deepEqual(listed.map((pair) => pair.introRequestId), [null]);

  // The request is no longer the one Ashley told them about (passed, handed on): the pair is not listed.
  const gone = harness({ mails: [rootMail(), COMPANY_MAIL], relays: [fromHarper] });
  assert.deepEqual(await tellJoinedCompanies(gone.io, NOW, 5), {});
});

test("joined after a request made on Harper: the member request ends the joined step of every address; a second tick sends no joined mail", async () => {
  // jobs@ from Ashley's tell of the request (no inbound mail), cto@ from the company's own reply by mail.
  const relays = [
    joinedRelay({ kind: "wants_more", inboundMessageId: null }),
    joinedRelay({ companyEmail: "cto@company-a.example", inboundMessageId: "in-colleague", joinedNotedAt: "2026-11-20T02:58:00.000Z" }),
  ];
  for (const [label, answer, outcome] of [
    ["made", { state: "requested" }, "member"],
    // Harper's request failed with an error: closed for it and made again by finishIntroEnds; still no joined mail.
    ["made again later", { state: "retry", reason: "org down" }, "member_retry"],
  ] as const) {
    const h = harness({ mails: [rootMail(), COMPANY_MAIL], relays: relays.map((row) => ({ ...row })), introRequestFor: { [PERSON_ID]: "intro-1" }, memberIntro: [answer] });
    assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), { [outcome]: 1 }, label);
    assert.equal(h.linkEnd.get(`cto@company-a.example|${PERSON_ID}`), JOINED_MEMBER, label);
    assert.deepEqual(await tellJoinedCompanies(h.io, NEXT_SEND_DAY, 5), {}, label);
    assert.equal(h.sent.length + h.recorded.length + h.closedIntros.length, 0, label);
    assert.equal(h.memberCalls.length, 1, label);
    assert.doesNotMatch(h.slack.join("\n"), /<@U0HANDOFF>/, label);
  }
});

test("company answers after the candidate joined: the words go once into their Harper chat, as they are; the joined mail is the tick's, not a reply", async () => {
  const candidateQuestion = inbound({ occurredAt: "2026-11-19T02:00:00.000Z", decision: "reply" });
  const answer = companyInbound("Hi Ashley, yes, the role can be fully remote within Korea. Best, Kim");
  const h = harness({
    messages: [candidateQuestion, answer], mails: [rootMail(), companyMail], member: true,
    script: { companyDecide: { type: "answer", reason: "remote answered", candidate: "C1", relay_text: "yes, the role can be fully remote within Korea." } },
  });
  assert.equal(await processAshleyMessage(h.io, answer, NOW), "no_reply");
  // Nothing by mail from the decision: not to the candidate, not to the company.
  assert.equal(h.sent.length + h.queued.length, 0);
  assert.equal(answer.decision, "no_reply");
  assert.match(answer.decisionReason ?? "", /Harper 회원/);
  assert.deepEqual(h.tellCalls.map((call) => [call.personId, call.key, call.relay.inboundMessageId]),
    [[PERSON_ID, `jobs@company-a.example|${PERSON_ID}`, answer.id]]);
  assert.equal(h.tellCalls[0].content, 'Company A answered the question you asked about Backend Engineer:\n\n"yes, the role can be fully remote within Korea."');
  const pair = h.relayRows.get(PAIR_KEY)!;
  assert.equal(pair.kind, "answer");
  // The member relay's marker: candidate_noted_at at or after joined_noted_at.
  assert.ok(pair.joinedNotedAt && pair.candidateNotedAt && pair.candidateNotedAt >= pair.joinedNotedAt);
  assert.equal(pair.companyLinkSentAt, null);
  assert.ok(h.notes.some((note) => note.startsWith(ASHLEY_NOTE.memberRelay)));
  assert.doesNotMatch(h.slack.join("\n"), /<@U0HANDOFF>/);
  // The one joined mail: the tick's, in the thread of the company's answer.
  assert.deepEqual(await tellJoinedCompanies(h.io, NEXT_SEND_DAY, 5), { sent: 1 });
  assert.equal(h.sent[0].to, "jobs@company-a.example");
  assert.equal(h.sent[0].headers["In-Reply-To"], answer.rfcMessageId);
  assert.equal(h.placeCalls.length, 1);
  // A later company mail gets nothing more, and the words were written once.
  const again = companyInbound("Also, the salary band is flexible.");
  h.messages.push(again);
  assert.equal(await processAshleyMessage(h.io, again, new Date(NEXT_SEND_DAY.getTime() + DAY)), "no_reply");
  assert.deepEqual(await tellJoinedCompanies(h.io, new Date(NEXT_SEND_DAY.getTime() + DAY), 5), {});
  assert.equal(h.sent.length, 1);
  assert.equal(h.tellCalls.length, 1);
});

test("company wants more after the candidate joined: no reply of its own; the tick's joined mail is the one; nothing to the candidate, no person", async () => {
  const message = companyInbound("We'd love to talk with this candidate. Can you share more?");
  const h = harness({
    messages: [inbound({ decision: "reply" }), message], mails: [rootMail(), companyMail], member: true,
    script: { companyDecide: { type: "wants_more", reason: "wants to talk", candidate: null, relay_text: null } },
  });
  assert.equal(await processAshleyMessage(h.io, message, NOW), "no_reply");
  assert.equal(h.sent.length + h.tellCalls.length, 0);
  assert.equal(h.relayRows.get(PAIR_KEY)?.kind, "wants_more");
  assert.equal(h.relayRows.get(PAIR_KEY)?.candidateNotedAt, null);
  assert.deepEqual(await tellJoinedCompanies(h.io, NOW, 5), { sent: 1 });
  assert.match(h.sent[0].text, /You can ask to be connected here\./);
  assert.doesNotMatch(h.slack.join("\n"), /<@U0HANDOFF>/);
});

test("company answers after the candidate joined: Ashley wrote to them today → waits; the chat message not written → the mail stays undecided and the pair free, tried again once", async () => {
  const decideAnswer = { companyDecide: { type: "answer", reason: "remote answered", candidate: "C1", relay_text: "yes, remote is fine." } };
  for (const address of ["jobs@company-a.example", "candidate@example.com"]) {
    const answer = companyInbound("Hi, yes, remote is fine.");
    const h = harness({ messages: [answer], mails: [rootMail(), companyMail], member: true, mailedToday: [address], script: decideAnswer });
    assert.equal(await processAshleyMessage(h.io, answer, NOW), "deferred", address);
    assert.equal(h.tellCalls.length + h.sent.length + h.relayRows.size, 0, address);
  }

  const answer = companyInbound("Hi, yes, remote is fine.");
  const h = harness({ messages: [answer], mails: [rootMail(), companyMail], member: true, tellMember: "fails_once", script: decideAnswer });
  await assert.rejects(processAshleyMessage(h.io, answer, NOW), /talent message not written/);
  assert.equal(answer.decision, null);
  assert.equal(h.relayRows.size + h.tellCalls.length, 0);
  assert.equal(await processAshleyMessage(h.io, answer, NOW), "no_reply");
  assert.equal(h.tellCalls.length, 1);
  assert.equal(h.relayRows.size, 1);

  // No way to Harper chat wired: a person.
  const unwired = companyInbound("Hi, yes, remote is fine.");
  const none = harness({ messages: [unwired], mails: [rootMail(), companyMail], member: true, tellMember: null, script: decideAnswer });
  assert.equal(await processAshleyMessage(none.io, unwired, NOW), "hand_to_human");
  assert.equal(none.relayRows.size, 0);
  assert.match(none.slack.join("\n"), /<@U0HANDOFF>/);
});

test("company answers after the candidate joined: the chat message failing every tick is tried MEMBER_TELL_TRIES times, then the mail goes to a person", async () => {
  const answer = companyInbound("Hi, yes, remote is fine.");
  const h = harness({
    messages: [answer], mails: [rootMail(), companyMail], member: true, tellMember: "fails",
    script: { companyDecide: { type: "answer", reason: "remote answered", candidate: "C1", relay_text: "yes, remote is fine." } },
  });
  for (let tick = 1; tick < MEMBER_TELL_TRIES; tick += 1) {
    await assert.rejects(processAshleyMessage(h.io, answer, NOW), /talent message not written/);
    assert.equal(answer.decision, null);
  }
  assert.equal(await processAshleyMessage(h.io, answer, NOW), "hand_to_human");
  assert.equal(answer.decision, "hand_to_human");
  assert.match(answer.decisionReason ?? "", /하퍼 대화에 3번 넣지 못했어요/);
  assert.equal(h.notes.filter((note) => note.startsWith(ASHLEY_NOTE.memberRelayFailed)).length, MEMBER_TELL_TRIES);
  assert.equal(h.llmCalls.length, MEMBER_TELL_TRIES);
  // The pair stays free (a person takes it), nothing by mail.
  assert.equal(h.relayRows.size + h.sent.length, 0);
  assert.equal(h.slack.filter((line) => line.includes("<@U0HANDOFF>")).length, 1);
});

test("company answers after the candidate joined: a tick that died after the claim is finished by the next read (marks, no second message)", async () => {
  const answer = companyInbound("Hi, yes, remote is fine.");
  const h = harness({
    messages: [answer], mails: [rootMail(), companyMail], member: true,
    relays: [joinedRelay({ inboundMessageId: answer.id, joinedNotedAt: null, candidateNotedAt: null, createdAt: "2026-11-20T02:59:00.000Z" })],
    script: { companyDecide: { type: "answer", reason: "remote answered", candidate: "C1", relay_text: "yes, remote is fine." } },
  });
  assert.equal(await processAshleyMessage(h.io, answer, NOW), "no_reply");
  const pair = h.relayRows.get(PAIR_KEY)!;
  assert.ok(pair.joinedNotedAt && pair.candidateNotedAt);
  assert.equal(h.tellCalls.length, 1);
  assert.equal(h.sent.length, 0);
});

// ---------------------------------------------------------------------------------------------------------------
// Ends of companies' requests a tick left unfinished

const NO_ENDS = { done: 0, retry: 0, stopped: 0, handed_off: 0, notices: 0, notice_retry: 0, notice_handed_off: 0, member_notices: 0 };

test("intro ends: an unconfirmed member request is tried again, then handed to a person; members' missing Career runs are made", async () => {
  const h = harness();
  const results: Array<{ done: true } | { done: false; reason: string }> = [{ done: true }, { done: false, reason: "card busy" }, { done: false, reason: "card busy" }];
  const gaveUp: string[] = [];
  h.io.unfinishedMemberIntros = async () => [
    { id: "intro-a", personId: PERSON_ID, tries: 0 }, { id: "intro-b", personId: PERSON_ID, tries: 0 }, { id: "intro-c", personId: PERSON_ID, tries: MEMBER_INTRO_TRIES - 1 },
  ];
  h.io.finishMemberIntro = async () => results.shift()!;
  h.io.giveUpMemberIntro = async (id) => { gaveUp.push(id); };
  h.io.finishMemberNotices = async () => 2;
  assert.deepEqual(await finishIntroEnds(h.io, 5), { ...NO_ENDS, done: 1, retry: 1, handed_off: 1, member_notices: 2 });
  assert.deepEqual(gaveUp, ["intro-c"]);
  assert.equal(h.slack.filter((line) => line.includes("<@U0HANDOFF>")).length, 1);
  assert.match(h.slack.join("\n"), /card busy/);
});

test("intro ends: the company passed meanwhile → stops quietly; it can never be made (opted out, no card) → a person at once, no more tries", async () => {
  const h = harness();
  const gaveUp: string[] = [];
  const finished: string[] = [];
  h.io.unfinishedMemberIntros = async () => [{ id: "intro-passed", personId: PERSON_ID, tries: 0 }, { id: "intro-opted-out", personId: PERSON_ID, tries: 0 }];
  h.io.finishMemberIntro = async (id) => {
    finished.push(id);
    return id === "intro-passed" ? { done: false, reason: "회사가 이 후보를 넘겼어요", stop: "quiet" } : { done: false, reason: "후보가 연락 받지 않기 목록에 있어요", stop: "person" };
  };
  h.io.giveUpMemberIntro = async (id) => { gaveUp.push(id); };
  assert.deepEqual(await finishIntroEnds(h.io, 5), { ...NO_ENDS, stopped: 1, handed_off: 1 });
  assert.deepEqual(finished, ["intro-passed", "intro-opted-out"]);
  assert.deepEqual(gaveUp, ["intro-passed", "intro-opted-out"]);
  assert.equal(h.slack.filter((line) => line.includes("<@U0HANDOFF>")).length, 1);
  assert.match(h.slack.join("\n"), /연락 받지 않기/);
  assert.doesNotMatch(h.slack.join("\n"), /회사가 이 후보를 넘겼어요/);
});

test("intro ends: a failed unreachable notice is sent again (UNREACHABLE_NOTICE_TRIES at most), then a person tells the company once; within the tick's time", async () => {
  const h = harness();
  const sentNotices: string[] = [];
  const gaveUp: string[] = [];
  h.io.unreachableNotices = async () => [
    { id: "notice-a", personId: PERSON_ID, tries: 1 }, { id: "notice-b", personId: PERSON_ID, tries: 1 },
    { id: "notice-c", personId: PERSON_ID, tries: UNREACHABLE_NOTICE_TRIES - 1 }, { id: "notice-d", personId: null, tries: UNREACHABLE_NOTICE_TRIES },
  ];
  h.io.sendUnreachableNotice = async (id) => {
    sentNotices.push(id);
    if (id !== "notice-a") throw new Error("hiring conversation down");
  };
  h.io.giveUpUnreachableNotice = async (id) => { gaveUp.push(id); };
  assert.deepEqual(await finishIntroEnds(h.io, 5), { ...NO_ENDS, notices: 1, notice_retry: 1, notice_handed_off: 2 });
  // One past the cap is not sent again; each given up once, with a person told.
  assert.deepEqual(sentNotices, ["notice-a", "notice-b", "notice-c"]);
  assert.deepEqual(gaveUp, ["notice-c", "notice-d"]);
  assert.equal(h.slack.filter((line) => line.includes("<@U0HANDOFF>")).length, 2);
  assert.match(h.slack.join("\n"), /회사 대화에 알리지 못했어요[\s\S]*hiring conversation down/);

  // The tick's time is up: nothing is read or sent.
  const late = harness();
  let read = 0;
  late.io.unfinishedMemberIntros = async () => { read += 1; return []; };
  late.io.unreachableNotices = async () => { read += 1; return [{ id: "notice-a", personId: PERSON_ID, tries: 0 }]; };
  late.io.sendUnreachableNotice = async () => { throw new Error("should not be called"); };
  late.io.finishMemberNotices = async () => { read += 1; return 0; };
  assert.deepEqual(await finishIntroEnds(late.io, 5, Date.now() - 1), NO_ENDS);
  assert.equal(read, 1);
});

test("company intro: an error while telling it closes it as handed off and tells a person (never a silent end)", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL] });
  const ends = withIntroAsks(h, [introAsk()]);
  h.io.readPerson = async () => { throw new Error("db down"); };
  assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { failed: 1 });
  assert.equal((ends[0].end as { told: boolean }).told, false);
  assert.match(h.slack.join("\n"), /<@U0HANDOFF>[\s\S]*db down/);
});

test("tick: mails waiting for their company mail do not take the places of other mails", async () => {
  const heldAt = "2026-11-20T02:30:00.000Z";
  const waiting = (index: number) => inbound({
    counterpartEmail: `waiting-${index}@example.com`, occurredAt: `2026-11-20T01:0${index}:00.000Z`,
    signals: [{ personId: PERSON_ID, postingUrl: EXTERNAL.url!, companyName: "Company A", postingTitle: "Backend Engineer",
      question: null, summaryConsent: true, at: heldAt, messageId: `w-${index}`, heldAt }],
  });
  const other = inbound({ occurredAt: "2026-11-20T02:00:00.000Z" });
  const h = harness({
    messages: [waiting(1), waiting(2), other], canAsk: true,
    script: { decide: decide("reply", "question"), writerCalls: [["signup_link", { next_step: "onboarding" }]], text: "Hi Sam,\n\nThe posting says hybrid in Seoul." },
  });
  const tick = await processAshleyReplies(h.io, { limit: 1, now: NOW });
  assert.equal(tick.outcomes.waiting_company, 2);
  assert.equal(tick.outcomes.sent, 1);
});
