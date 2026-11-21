import assert from "node:assert/strict";
import test from "node:test";
import {
  askedBefore, asksFor, ASHLEY_NOTE, COMPANY_ASK_WAIT_MS, historyBefore, processAshleyMessage, processAshleyReplies, SUPERSEDED_REASON,
  tellCompanyIntroAsks, type AshleyIO, type AshleyLlmCall, type AshleyMail, type AshleyPerson, type CompanyIntroAsk, type OutgoingMail, type RelayRow,
} from "./ashleyAgent";
import { CODE_REASON, historyText, parseCandidateDecision } from "./ashleyPrompt";
import type { CompanyAsk } from "./companyMail";
import type { ConversationMessage, ConversationStore, HistoryEntry, InterestSignal } from "./conversation";
import type { AgentPosting } from "./types";

// ---------------------------------------------------------------------------------------------------------------
// Fakes

const NOW = new Date("2026-11-20T03:00:00.000Z"); // 12:00 KST, a Friday
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
  const relayRows = new Map<string, RelayRow & { companyMailId: string }>();
  const people = new Map((opts.people ?? [person()]).map((item) => [item.id, item]));
  const mails = new Map((opts.mails ?? [rootMail()]).map((item) => [item.id, item]));
  const store: ConversationStore = {
    saveInbound: async () => { throw new Error("not used"); },
    listUndecidedInbound: async (limit) => messages.filter((message) => !message.decision).slice(0, limit),
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
    },
    markFailed: async (id, error, held) => {
      const row = queued.find((item) => item.id === id)!;
      row.sendStatus = held ? "held" : "failed";
      row.error = error;
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
    maySpend: async () => true,
    recordSpend: async () => undefined,
    send: async (mail) => {
      if (opts.sendFails) throw new Error("resend 500");
      sent.push(mail);
      return { providerMessageId: `re_${sent.length}`, rfcMessageId: `<sent-${sent.length}@resend.example>` };
    },
    slack: async (text) => { slack.push(text); },
    stopContact: async (args) => { stops.push({ email: args.email, personId: args.personId }); },
    notePerson: async (_id, note, postings) => { notes.push(note); if (postings?.length) notePostings.push([...postings]); },
    unsubscribeUrl: (mailId) => `https://matchharper.com/u/${mailId}`,
    relays: {
      forPerson: async (personId) => [...relayRows.values()].filter((row) => row.personId === personId),
      get: async (companyEmail, personId) => relayRows.get(`${companyEmail}|${personId}`) ?? null,
      claim: async (row) => {
        const key = `${row.companyEmail}|${row.personId}`;
        if (relayRows.has(key)) return false;
        relayRows.set(key, {
          companyEmail: row.companyEmail, personId: row.personId, kind: row.kind, companyMailId: row.companyMailId,
          candidateNotedAt: null, companyNotedAt: null, companyLinkSentAt: null, createdAt: NOW.toISOString(),
        });
        return true;
      },
      mark: async (companyEmail, personId, field) => {
        const row = relayRows.get(`${companyEmail}|${personId}`);
        const key = ({ candidate_noted_at: "candidateNotedAt", company_noted_at: "companyNotedAt", company_link_sent_at: "companyLinkSentAt" } as const)[field];
        if (!row || row[key]) return false;
        row[key] = NOW.toISOString();
        return true;
      },
    },
    routeToMember: opts.routeToMember === null ? undefined : opts.routeToMember ?? (async () => undefined),
    companyAsk: async (): Promise<CompanyAsk> => (typeof opts.canAsk === "function" ? opts.canAsk()
      : opts.canAsk === "asked" ? { state: "asked", at: "2026-11-20T03:00:00.000Z" } : opts.canAsk ? { state: "can" } : { state: "no" }),
    latestInbound: async () => messages.filter((item) => item.counterpartKind === "candidate").at(-1) ?? null,
  };
  return { io, messages, queued, decisions, held, historyCalls, sent, slack, stops, notes, notePostings, llmCalls, relayRows, personAnswers };
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

test("two mails from the same address waiting: only the newest is answered, the older gets no reply of its own", async () => {
  const older = inbound({ occurredAt: "2026-11-20T01:00:00.000Z", newText: "Is it remote?" });
  const newer = inbound({ occurredAt: "2026-11-20T02:00:00.000Z", newText: "Also, what is the pay?" });
  const h = harness({ messages: [older, newer], script: { decide: decide("reply", "question"), text: "Hi Sam, thanks for asking." } });
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.equal(older.decision, "no_reply");
  assert.equal(older.decisionReason, SUPERSEDED_REASON);
  assert.equal(older.answeredByMessageId, null);
  assert.notEqual(newer.decision, null);
  assert.ok((tick.outcomes.no_reply ?? 0) >= 1);
  // Only one decide call: the older mail never reached the model.
  assert.equal(h.llmCalls.filter((call) => call.label === "gtm-agent:ashley-decide").length, 1);
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
  assert.equal(await processAshleyMessage(h.io, message, NOW), "already");
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

test("a reply decided as the hours close: queued, then sent as written at the next open tick (no second decide)", async () => {
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
  assert.equal(await processAshleyMessage(h.io, message, NOW), "queued");
  assert.equal(message.decision, "reply");
  assert.equal(h.sent.length, 0);
  assert.equal(h.queued[0].sendStatus, "queued");

  // Next open tick: the queued reply goes first, rebuilt from its row; the model is not called again.
  open = true;
  const calls = h.llmCalls.length;
  h.io.queuedReplies = async () => h.queued.filter((row) => row.sendStatus === "queued").map((row) => ({
    ...row, inbound: { id: message.id, counterpartEmail: message.counterpartEmail, bodyText: message.bodyText, occurredAt: message.occurredAt, decisionReason: message.decisionReason, rfcMessageId: message.rfcMessageId, personId: message.personId },
  }));
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.deepEqual(tick.flushed, { sent: 1 });
  assert.equal(h.llmCalls.length, calls);
  assert.equal(h.sent.length, 1);
  const mail = h.sent[0];
  assert.equal(mail.idempotencyKey, `gtm-agent-reply:${h.queued[0].id}`);
  assert.equal(mail.subject, "Re: Two roles for you");
  assert.equal(mail.headers["In-Reply-To"], message.rfcMessageId);
  assert.ok(mail.text.includes("It is hybrid in Seoul.\n\nLet Harper apply for you (https://matchharper.com/jobs/invite/"));
  assert.ok(mail.text.includes("> Is the backend role remote?"));
  assert.equal(h.queued[0].sendStatus, "sent");
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
  await processAshleyReplies(h.io, { limit: 10, now: NOW });
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

  // The company writes again: one fixed answer to the company, then nothing.
  const second = companyInbound("Also, the salary band is flexible.");
  h.messages.push(second);
  h.io.llm = async (call) => { await call.executeTool("decide", { type: "answer", reason: "pay", candidate: "C1", relay_text: "the salary band is flexible." }); return { text: "", costUsd: 0 }; };
  assert.equal(await processAshleyMessage(h.io, second, NOW), "sent");
  assert.equal(h.sent[1].to, "jobs@company-a.example");
  assert.ok(h.sent[1].text.includes("I'll connect you once the candidate joins Harper."));
  const third = companyInbound("And one more thing.");
  h.messages.push(third);
  assert.equal(await processAshleyMessage(h.io, third, NOW), "no_reply");
  assert.equal(h.sent.length, 2);

  // The candidate writes after the relay: one fixed answer (join and I'll connect you), then nothing.
  const after = inbound({ newText: "Great, can you ask them about the team size?", bodyText: "Great, can you ask them about the team size?", occurredAt: "2026-11-20T03:30:00.000Z" });
  h.messages.push(after);
  h.io.llm = async (call) => { await call.executeTool("decide", decide("reply", "question")); return { text: "SHOULD NOT BE USED", costUsd: 0 }; };
  assert.equal(await processAshleyMessage(h.io, after, NOW), "sent");
  assert.ok(h.sent[2].text.includes("join Harper and I'll connect you"));
  assert.ok(!h.sent[2].text.includes("SHOULD NOT BE USED"));
  const again = inbound({ occurredAt: "2026-11-20T03:40:00.000Z" });
  h.messages.push(again);
  assert.equal(await processAshleyMessage(h.io, again, NOW), "no_reply");
  assert.equal(h.sent.length, 3);
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
  // The pair's one relay: their later mails get the relay's fixed answer; joining Harper @mentions a person.
  assert.equal(h.relayRows.get(`jobs@company-a.example|${PERSON_ID}`)?.kind, "wants_more");
  assert.ok(h.notes.some((note) => note.startsWith(ASHLEY_NOTE.companyIntro)));
});

test("company intro: a member, an opted-out address, an earlier relay or a person's answer goes to a person instead", async () => {
  const cases: Array<[string, Parameters<typeof harness>[0], RegExp]> = [
    ["member", { member: true }, /이미 Harper 회원/],
    ["opted out", { suppressed: ["candidate@example.com"] }, /연락 받지 않기/],
    ["person answered", { personAnswers: { [ROOT_ID]: "2026-11-20T02:45:00.000Z" } }, /사람/],
    ["replies off", { enabled: false }, /./],
  ];
  for (const [label, opts, reason] of cases) {
    const h = harness({ mails: [rootMail(), COMPANY_MAIL], ...opts });
    const ends = withIntroAsks(h, [introAsk()]);
    assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { held: 1 }, label);
    assert.equal(h.sent.length, 0, label);
    const end = ends[0]?.end as { told: boolean; reason: string };
    assert.equal(end.told, false, label);
    assert.match(end.reason, reason, label);
    assert.match(h.slack.join("\n"), /<@U0HANDOFF>/, label);
  }
  // The company's words already reached this candidate by mail: nothing more from Ashley.
  const h = harness({ mails: [rootMail(), COMPANY_MAIL] });
  const ends = withIntroAsks(h, [introAsk()]);
  await h.io.relays.claim({ companyEmail: "jobs@company-a.example", personId: PERSON_ID, kind: "answer", companyMailId: COMPANY_MAIL_ID, inboundMessageId: "in-x" });
  assert.deepEqual(await tellCompanyIntroAsks(h.io, NOW, 10), { held: 1 });
  assert.equal(h.sent.length, 0);
  assert.match((ends[0].end as { reason: string }).reason, /이미 메일로/);
});

test("company intro: hours closed during the tick → waits for the next one; a send failure goes to a person", async () => {
  const closed = harness({ mails: [rootMail(), COMPANY_MAIL], windowOpen: false });
  const closedEnds = withIntroAsks(closed, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(closed.io, NOW, 10), { later: 1 });
  assert.deepEqual(closedEnds, [{ id: "intro-1", end: { later: true } }]);
  assert.equal(closed.relayRows.size, 0);

  const failing = harness({ mails: [rootMail(), COMPANY_MAIL], sendFails: true });
  const failingEnds = withIntroAsks(failing, [introAsk()]);
  assert.deepEqual(await tellCompanyIntroAsks(failing.io, NOW, 10), { held: 1 });
  assert.equal((failingEnds[0].end as { told: boolean }).told, false);
  // Nothing reached the candidate: no relay is recorded for the pair.
  assert.equal(failing.relayRows.size, 0);
});

test("company intro: replies off on /ops → the request goes to a person at once, not left waiting", async () => {
  const h = harness({ mails: [rootMail(), COMPANY_MAIL], enabled: false });
  const ends = withIntroAsks(h, [introAsk()]);
  const tick = await processAshleyReplies(h.io, { limit: 5, now: NOW });
  assert.equal(tick.reason, "reply_agent_off");
  assert.deepEqual(tick.companyIntros, { held: 1 });
  assert.equal(h.sent.length, 0);
  assert.equal((ends[0].end as { told: boolean }).told, false);
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
