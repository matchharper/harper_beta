/**
 * #5 Ashley's reply agent (design 3장, 4장, 5장): for each inbound mail no one decided on yet, oldest first, decide
 * (reply / no_reply / stop / hand_to_human), write, check, send and hand off. Everything outside is injected
 * (AshleyIO: the conversation store, the model, Resend, Slack, the opt-out path), so the rules are tested with fakes
 * and the replay (scripts/gtm-agent/ashley-replay.ts) runs the same decide-and-write with nothing sent.
 *
 * Rules held by structure, not by the model:
 * - one Ashley mail per inbound mail at most (store.queueReply refuses a second; the decision is written once);
 * - while the reply agent is off on /ops nothing runs (no model call: the mails wait undecided, and the backlog is
 *   decided when it is switched on); outside the sending hours nothing is decided, and a reply decided just before the
 *   hours closed stays queued and goes at the next open tick as written (no second decide);
 * - nothing goes to an address on the opt-out list or into a thread a person answered (checked again right before
 *   the provider call);
 * - every mail passes checkBeforeSend (ashleyCheck.ts); a failure is held and handed to a person;
 * - a company's words reach a candidate once per company–candidate pair (gtm_agent_relays), word for word; after that
 *   each side gets one fixed answer and nothing more.
 */
import { checkBeforeSend, type PreSendResult } from "./ashleyCheck";
import {
  ASHLEY_COPY, ashleySignupLink, companyLandingLink, gmailThreadSearchLink, handoffSlackText, listUnsubscribeHeaders,
  noteSlackText, renderAshleyMail, replySubject, replyThreadHeaders, sentReplySlackText, signupLinkLabel,
  type AshleyLanguage, type AshleyNextStep,
} from "./ashleyMail";
import {
  applyCheckText, ASHLEY_COMPANY_PROMPT, DECISION_LABEL, ASHLEY_PROMPT, candidateContext, CODE_REASON, COMPANY_DECIDE_TOOL,
  companyContext, DECIDE_STEP, DECIDE_TOOL, decisionReason, harperCanApply, outreachText, parseCandidateDecision,
  parseCompanyDecision, parseSignupCall, postingLine, postingResultText, similarRolesText, verbatimIn, WRITE_STEP,
  LINK_STEP, WRITER_TOOLS, type CandidateDecision, type CandidateType, type CompanyType, type ContextPerson, type ContextPosting,
  type SummaryFact,
} from "./ashleyPrompt";
import type { AshleyDecisionKind, ConversationMessage, ConversationStore, HistoryEntry, InterestSignal } from "./conversation";
import type { AskCompany } from "./companyMail";
import { agentPersonLink } from "./replies";
import type { AgentEvent, AgentPerson, AgentPosting } from "./types";

// ---------------------------------------------------------------------------------------------------------------
// What the agent is given

export type AshleySettings = {
  /** /ops: Ashley's mails may go out (off: drafts are held and handed to a person). */
  replyAgentEnabled: boolean;
  /** The Slack user hand-offs @mention (null: no mention). */
  handoffSlackUserId: string | null;
  /** The signature's name when the mail it answers names none. */
  senderName: string;
  senderEmail: string;
  /** The sending hours (Korea time) are open at this moment. */
  windowOpen: (at: Date) => boolean;
  /** Links in mails and in Slack (gtmMailLinkOrigin). */
  origin: string;
  /** Ashley's Gmail, for the "open the thread" link. */
  mailbox: string | null;
};

/** A gtm_mails row a thread hangs on. */
export type AshleyMail = {
  id: string;
  audience: "candidate" | "company";
  toEmail: string;
  fromName: string | null;
  fromEmail: string | null;
  subject: string;
  language: AshleyLanguage | null;
  postings: AgentPosting[];
  personId: string | null;
  rfcMessageId: string | null;
  createdAt: string;
  /** A company mail: the interested candidates it counted (gtm_mails.company_mail.interestedPersonIds). */
  interestedPersonIds: string[];
};

export type AshleyPerson = Pick<
  AgentPerson,
  "id" | "name" | "headline" | "location" | "currentCompany" | "profileText" | "source" | "language" | "email" | "postings"
  | "mailId" | "followupMailId" | "sentAt" | "isTest" | "events"
>;

type Tool = (typeof WRITER_TOOLS)[number];

/** One model call: the system blocks, the one user message, the tools; returns the final text and what it cost. */
export type AshleyLlmCall = {
  label: string;
  system: Array<{ key: string; text: string }>;
  message: string;
  tools: Tool[];
  stopAfter: string[];
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>;
};
export type AshleyLlm = (call: AshleyLlmCall) => Promise<{ text: string; costUsd: number }>;

export type OutgoingMail = {
  idempotencyKey: string;
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

export type RelayRow = {
  companyEmail: string;
  personId: string;
  /** The company mail the company answered. */
  companyMailId: string;
  kind: "answer" | "wants_more";
  candidateNotedAt: string | null;
  companyNotedAt: string | null;
  companyLinkSentAt: string | null;
  createdAt: string;
};
export type RelayMark = "candidate_noted_at" | "company_noted_at" | "company_link_sent_at";

/** gtm_agent_relays: one row per company address and candidate, the first time the company's words reach them. */
export type RelayStore = {
  forPerson(personId: string): Promise<RelayRow[]>;
  get(companyEmail: string, personId: string): Promise<RelayRow | null>;
  /** Inserts the pair's row; false when it is there already (a relay happened, or another worker is doing it). */
  claim(row: { companyEmail: string; personId: string; kind: RelayRow["kind"]; companyMailId: string; inboundMessageId: string }): Promise<boolean>;
  /** Sets one time column when it is still empty; true when this call set it. */
  mark(companyEmail: string, personId: string, field: RelayMark, providerId?: string | null): Promise<boolean>;
};

export type AshleyIO = {
  store: ConversationStore;
  settings: AshleySettings;
  readPerson(id: string): Promise<AshleyPerson | null>;
  readMail(id: string): Promise<AshleyMail | null>;
  /** A Harper member signed in with this address. */
  isMember(email: string): Promise<boolean>;
  /** On the shared opt-out list (read right before). */
  isSuppressed(email: string): Promise<boolean>;
  /** A posting now: still open (null: not known) and its text (null: none stored). */
  postingState(posting: AgentPosting): Promise<{ open: boolean | null; text: string | null }>;
  /** The first-mail matcher with the conditions from the mail; the spend is recorded inside (step match). */
  findSimilar(person: AshleyPerson, conditions: string, sent: readonly AgentPosting[]): Promise<AgentPosting[]>;
  llm: AshleyLlm;
  /** The day's cost cap still has room. */
  maySpend(): Promise<boolean>;
  recordSpend(usd: number, person: Pick<AshleyPerson, "id" | "isTest"> | null): Promise<void>;
  /** Resend. Missing in the replay: nothing can go out. */
  send?: (mail: OutgoingMail) => Promise<{ providerMessageId: string | null; rfcMessageId: string | null }>;
  /** A line in the reply alert's Slack thread of this person (or the day's thread). */
  slack(text: string, personId: string | null): Promise<void>;
  /** The opt-out path (the mail's own unsubscribe; a person ended). */
  stopContact(args: { personId: string | null; mailId: string | null; email: string; note: string }): Promise<void>;
  /** A line on the person's timeline. */
  notePerson(personId: string, note: string): Promise<void>;
  unsubscribeUrl(mailId: string): string | null;
  relays: RelayStore;
  /** A member's mail goes to Harper (default: not wired, a person answers). */
  routeToMember?: (message: ConversationMessage) => Promise<unknown>;
  /** Whether a company mail can carry a question on this posting: now, once more candidates are interested, or no (default: no). */
  canAskCompany?: (input: { postingUrl: string; personId: string }) => Promise<AskCompany>;
  /** Replies decided and queued in an earlier tick and not sent yet, oldest first (none: nothing to flush). */
  queuedReplies?: (limit: number) => Promise<QueuedReply[]>;
  /** The candidate's latest mail to us (a relay goes in that thread). */
  latestInbound(personId: string): Promise<Pick<ConversationMessage, "subject" | "rfcMessageId" | "references" | "newText" | "bodyText"> | null>;
};

// ---------------------------------------------------------------------------------------------------------------
// Timeline notes Ashley reads back (fixed prefixes)

export const ASHLEY_NOTE = {
  asked: "Ashley가 물어봄 · ",
  searched: "Ashley가 다시 찾음 · ",
} as const;

/** What earlier replies asked (summary_consent, title, years, location), from the person's timeline. */
export function askedBefore(events: readonly AgentEvent[]): string[] {
  return [...new Set(events.flatMap((event) => (event.kind === "note" && event.note?.startsWith(ASHLEY_NOTE.asked)
    ? event.note.slice(ASHLEY_NOTE.asked.length).split(",").map((item) => item.trim()).filter(Boolean) : [])))];
}

export const searchedBefore = (events: readonly AgentEvent[]) =>
  events.some((event) => event.kind === "note" && Boolean(event.note?.startsWith(ASHLEY_NOTE.searched)));

/**
 * What to ask in this reply (design 5장 "넣는 정보와 동의", D): interest in an outside posting with the consent to a
 * nameless summary not given yet, or a fact of the summary's first line not known. Never what was asked before.
 * Only for postings a company mail could go for now (askCompanyNow): with none, no summary goes, so nothing is asked
 * (replay 11/21: "I can't ask Company A" followed by "May Harper send the company a nameless summary?").
 */
export function asksFor(args: {
  decision: CandidateDecision; postings: readonly ContextPosting[]; person: Pick<AshleyPerson, "headline" | "location">;
  alreadyAsked: readonly string[];
}): string[] {
  const outside = args.decision.signals.filter((signal) => {
    const item = args.postings.find((posting) => posting.label === signal.posting);
    return item?.posting.kind === "external" && item.posting.url && item.askCompanyNow;
  });
  if (!outside.length || outside.every((signal) => signal.summaryConsent === "no")) return [];
  const wanted: string[] = [];
  if (outside.some((signal) => signal.summaryConsent === "unknown")) wanted.push("summary_consent");
  const facts = new Set<SummaryFact>(args.decision.missingFacts);
  if (!args.person.headline?.trim()) facts.add("title");
  if (!args.person.location?.trim()) facts.add("location");
  wanted.push(...(["title", "years", "location"] as const).filter((fact) => facts.has(fact)));
  return wanted.filter((item) => !args.alreadyAsked.includes(item));
}

/** History before this mail (the store gives the whole address; the mail itself and later ones are left out). */
export function historyBefore(entries: readonly HistoryEntry[], inbound: Pick<ConversationMessage, "occurredAt">): HistoryEntry[] {
  const at = Date.parse(inbound.occurredAt);
  return entries.filter((entry) => {
    const time = Date.parse(entry.at);
    return time < at || (time === at && entry.author !== "counterpart");
  });
}

const languageOf = (...values: Array<string | null | undefined>): AshleyLanguage =>
  values.some((value) => /[가-힣]/.test(value ?? "")) ? "ko" : "en";

const mailText = (message: Pick<ConversationMessage, "newText" | "bodyText">) => (message.newText.trim() || message.bodyText.trim());

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

// ---------------------------------------------------------------------------------------------------------------
// Candidate: decide and write (no sending: the replay uses this as it is)

export type CandidateDraft =
  | { kind: "decided"; action: Exclude<AshleyDecisionKind, "reply">; type: CandidateType | null; reason: string }
  | {
    kind: "reply";
    type: CandidateType;
    reason: string;
    signals: InterestSignal[];
    body: string;
    link: { label: string; url: string; nextStep: AshleyNextStep } | null;
    check: PreSendResult;
    language: AshleyLanguage;
    /** What this reply asks (recorded once it went out). */
    asks: string[];
    searched: boolean;
    /** Fixed words (after a relay): checked without the salary/visa rule. */
    fixedCopy: boolean;
  };

type CandidateCase = { message: ConversationMessage; person: AshleyPerson; root: AshleyMail; now: Date };

/** The postings this person was sent (the person's snapshot and the thread's mails), labelled P1 …, with their state. */
async function sentPostings(io: AshleyIO, person: AshleyPerson, root: AshleyMail): Promise<ContextPosting[]> {
  const seen = new Set<string>();
  const postings = [...person.postings, ...root.postings].filter((posting) => {
    const key = (posting.url || posting.roleId || `${posting.companyName}/${posting.title}`).trim().toLowerCase();
    return seen.has(key) ? false : (seen.add(key), true);
  }).slice(0, 6);
  return Promise.all(postings.map(async (posting, index) => {
    const state = await io.postingState(posting).catch(() => ({ open: null, text: null }));
    const ask: AskCompany = posting.kind === "external" && posting.url && io.canAskCompany
      ? await io.canAskCompany({ postingUrl: posting.url, personId: person.id }).catch(() => "no" as const) : "no";
    return {
      label: `P${index + 1}`, posting, open: state.open, harperCanApply: harperCanApply(posting, state.open),
      askCompanyNow: ask !== "no", askNeedsMore: ask === "more", text: state.text,
    };
  }));
}

const contextPerson = (person: AshleyPerson): ContextPerson => ({
  name: person.name, headline: person.headline, location: person.location, currentCompany: person.currentCompany,
  profileText: person.profileText, source: person.source, language: person.language,
});

function signalsOf(decision: CandidateDecision, postings: readonly ContextPosting[], message: ConversationMessage, personId: string): InterestSignal[] {
  return decision.signals.flatMap((signal) => {
    const item = postings.find((posting) => posting.label === signal.posting);
    if (!item?.posting.url) return [];
    return [{
      personId, postingUrl: item.posting.url, companyName: item.posting.companyName, postingTitle: item.posting.title,
      question: signal.question, summaryConsent: signal.summaryConsent === "yes", at: message.occurredAt, messageId: message.id,
    }];
  });
}

/**
 * The mail as Ashley reads it: who it came from and, for a reply from another address, where our mail went (she
 * judges whether it is the same person; code keeps any answer on the address our mail went to, see outgoing).
 */
const inboundOf = (message: ConversationMessage) => ({
  fromEmail: message.fromEmail || message.counterpartEmail, toEmail: message.counterpartEmail,
  at: message.occurredAt, subject: message.subject, text: mailText(message),
});

/** Ashley's decision on a candidate's mail (the first call: only `decide` is offered). */
export async function decideCandidate(io: AshleyIO, c: CandidateCase, postings: readonly ContextPosting[], history: readonly HistoryEntry[]): Promise<{ decision: CandidateDecision | null; costUsd: number }> {
  let called: unknown = null;
  const context = candidateContext({
    now: c.now, person: contextPerson(c.person), postings, history, alreadyAsked: askedBefore(c.person.events),
    inbound: inboundOf(c.message),
  });
  const result = await io.llm({
    label: "gtm-agent:ashley-decide",
    system: [{ key: "career_main", text: ASHLEY_PROMPT }, { key: "ashley_context", text: context }, { key: "ashley_step", text: DECIDE_STEP }],
    message: "Decide on the mail above: call decide.",
    tools: [DECIDE_TOOL],
    stopAfter: ["decide"],
    executeTool: async (name, input) => {
      if (name === "decide" && called === null) called = input;
      return "Recorded.";
    },
  });
  return { decision: called === null ? null : parseCandidateDecision(called, postings.map((item) => item.label)), costUsd: result.costUsd };
}

/**
 * Decide, and for a reply write and check it. Throws when a model call fails (the mail stays undecided and is tried
 * again). The only effects are through io (the spend; a re-search's matcher spend).
 */
export async function draftCandidateReply(io: AshleyIO, c: CandidateCase): Promise<CandidateDraft> {
  const { message, person, root, now } = c;
  const postings = await sentPostings(io, person, root);
  const history = historyBefore(await io.store.history(message.counterpartEmail, { threadKey: root.id }), message);
  const decided = await decideCandidate(io, c, postings, history);
  let costUsd = decided.costUsd;
  try {
    const decision = decided.decision;
    if (!decision) return { kind: "decided", action: "hand_to_human", type: null, reason: `${CODE_REASON.noDecision} · decide를 부르지 않았어요` };
    const reason = decisionReason(decision.type, decision.reason);
    if (decision.action !== "reply") return { kind: "decided", action: decision.action, type: decision.type, reason };
    const signals = signalsOf(decision, postings, message, person.id);
    const language: AshleyLanguage = languageOf(mailText(message)) === "ko" || (!/[a-z]{3,}/i.test(mailText(message)) && person.language === "ko") ? "ko" : "en";

    // After a relay: one fixed answer, then nothing (design 5장 "메일 중계는 한 쌍에 한 번").
    const relays = (await io.relays.forPerson(person.id)).filter((relay) => Date.parse(relay.createdAt) <= Date.parse(message.occurredAt));
    if (relays.length) {
      if (relays.every((relay) => relay.candidateNotedAt)) return { kind: "decided", action: "no_reply", type: decision.type, reason: CODE_REASON.relayDone };
      const relayMail = await io.readMail(relays[relays.length - 1].companyMailId);
      const posting = relayMail?.postings[0] ?? null;
      const company = posting?.companyName?.trim() ?? "";
      const link = { label: ASHLEY_COPY[language].relayLabel(company || "Harper"), url: ashleySignupLink({ origin: io.settings.origin, rootMailId: root.id, next: "connect_request", posting }), nextStep: "connect_request" as const };
      const body = [ASHLEY_COPY[language].greeting(person.name), ...ASHLEY_COPY[language].relayAfter].join("\n\n");
      const check = checkBeforeSend({
        draft: body, postingTexts: [], fixedCopy: true, suppressed: await io.isSuppressed(message.counterpartEmail),
        windowOpen: io.settings.windowOpen(now), personAnswered: await io.store.personAnswered(root.id, message.occurredAt),
      });
      return { kind: "reply", type: decision.type, reason, signals, body, link, check, language, asks: [], searched: false, fixedCopy: true };
    }

    const alreadyAsked = askedBefore(person.events);
    const asks = asksFor({ decision, postings, person, alreadyAsked });
    const signalLabels = new Set(decision.signals.map((signal) => signal.posting));
    const shown = postings.map((item) => (signalLabels.has(item.label) ? item : { ...item, text: null }));
    const context = candidateContext({
      now, person: contextPerson(person), postings: shown, history, alreadyAsked, askNow: asks,
      inbound: inboundOf(message),
    });
    const given: string[] = [...shown.map(postingLine), ...shown.flatMap((item) => (item.text ? [item.text] : []))];
    const labels = new Map(postings.map((item) => [item.label, item]));
    const state: { link: { label: string; url: string; nextStep: AshleyNextStep } | null; handOff: string | null; searched: boolean } = {
      link: null, handOff: null, searched: false,
    };
    const mayReSearch = !searchedBefore(person.events);
    const executeWriterTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
      const item = labels.get(String(input.posting ?? "").trim().toUpperCase());
      switch (name) {
        case "read_outreach":
          return outreachText({
            person: contextPerson(person), postings, foundBy: person.source, firstMailAt: person.sentAt,
            followupSent: Boolean(person.followupMailId), now,
          });
        case "read_posting": {
          if (!item) return `No posting with that label. Labels: ${[...labels.keys()].join(", ")}.`;
          const result = postingResultText(item);
          given.push(result);
          return result;
        }
        case "check_apply_on_behalf":
          return item ? applyCheckText(item) : `No posting with that label. Labels: ${[...labels.keys()].join(", ")}.`;
        case "find_similar_roles": {
          if (!mayReSearch || state.searched) return "Already searched once in this thread: use what you have.";
          state.searched = true;
          const found = await io.findSimilar(person, String(input.conditions ?? "").slice(0, 500), postings.map((posting) => posting.posting));
          const items = found.slice(0, 2).map((posting, index): ContextPosting => ({
            label: `R${index + 1}`, posting, open: true, harperCanApply: harperCanApply(posting, true), askCompanyNow: false,
          }));
          for (const role of items) labels.set(role.label, role);
          const result = similarRolesText(items);
          given.push(result);
          return result;
        }
        case "signup_link": {
          const call = parseSignupCall(input, [...labels.keys()]);
          if (!call) return `next_step must be one of connect_request, apply_on_behalf, opportunities_first, onboarding.`;
          const posting = call.posting ? labels.get(call.posting)?.posting ?? null : null;
          state.link = {
            nextStep: call.nextStep,
            label: signupLinkLabel(language, call.nextStep, posting?.companyName),
            url: ashleySignupLink({
              origin: io.settings.origin, rootMailId: root.id, next: call.nextStep, posting,
              question: decision.signals.find((signal) => signal.posting === call.posting)?.question ?? null,
            }),
          };
          return `Link ready ("${state.link.label}"). Code puts it on its own line under your text: do not write it.`;
        }
        case "hand_to_human":
          state.handOff = String(input.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || "작성 중 사람에게 넘김";
          return "Handed to a person.";
        default:
          return "Unknown tool.";
      }
    };
    const system = (step: string) => [
      { key: "career_main", text: ASHLEY_PROMPT },
      { key: "ashley_context", text: context },
      { key: "ashley_step", text: step },
    ];
    const written = await io.llm({
      label: "gtm-agent:ashley-write",
      system: system(`${WRITE_STEP}\nYour decision: ${decision.type} — ${decision.reason}`),
      message: "Write your reply to the mail above.",
      tools: WRITER_TOOLS,
      stopAfter: ["hand_to_human"],
      executeTool: executeWriterTool,
    });
    costUsd += written.costUsd;
    if (state.handOff) return { kind: "decided", action: "hand_to_human", type: decision.type, reason: decisionReason(decision.type, state.handOff) };
    let body = written.text.trim();
    if (!body) return { kind: "decided", action: "hand_to_human", type: decision.type, reason: `${CODE_REASON.noText} · 답장 글이 비어 있어요` };
    // No link: Ashley reads her reply once more for its next step (LINK_STEP): the signup link, and her one closing
    // sentence when the reply lacks the step. A polite decline's reply never carries one.
    if (!state.link && decision.type !== "mild_decline") {
      const linked = await io.llm({
        label: "gtm-agent:ashley-link",
        system: system(LINK_STEP),
        message: `Your reply:\n\n${body}`,
        tools: WRITER_TOOLS.filter((item) => item.function.name === "signup_link"),
        stopAfter: ["signup_link"],
        executeTool: (name, input) => (name === "signup_link" ? executeWriterTool(name, input) : Promise.resolve("Only signup_link here.")),
      });
      costUsd += linked.costUsd;
      const closing = linked.text.trim();
      if (state.link && closing && !/^none\W*$/i.test(closing) && closing.length <= CLOSING_MAX && !closing.includes("\n")) body = `${body}\n\n${closing}`;
    }
    const check = checkBeforeSend({
      draft: body, postingTexts: given, suppressed: await io.isSuppressed(message.counterpartEmail), windowOpen: io.settings.windowOpen(now),
      personAnswered: await io.store.personAnswered(root.id, message.occurredAt),
    });
    return { kind: "reply", type: decision.type, reason, signals, body, link: state.link, check, language, asks, searched: state.searched, fixedCopy: false };
  } finally {
    await io.recordSpend(costUsd, person);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Sending (one queued reply per inbound mail)

type Sendable = {
  message: ConversationMessage;
  to: { email: string; kind: "candidate" | "company"; personId: string | null; rootMailId: string | null };
  thread: { subject: string; rfcMessageId: string | null; references: string | null };
  root: AshleyMail;
  language: AshleyLanguage;
  body: string;
  link: { label: string; url: string } | null;
  quote: boolean;
  check: PreSendResult;
  decision: { reason: string; signals: InterestSignal[] };
  who: string;
  slackPersonId: string | null;
};

/** queued: decided and stored, sent by the next open tick (the hours closed meanwhile). */
export type SendOutcome = "sent" | "queued" | "held" | "failed" | "already";

/** What one Ashley mail is made of (a queued reply is rebuilt from its row the same way). */
type MailParts = {
  root: AshleyMail;
  language: AshleyLanguage;
  body: string;
  link: { label: string; url: string } | null;
  subject: string;
  /** The mail it answers (In-Reply-To) and that mail's References. */
  rfcMessageId: string | null;
  references: string | null;
  quote: { fromEmail: string; at: string; text: string } | null;
};

/**
 * The mail to the provider. It only ever goes to the address the thread's own mail went to (parts.root.toEmail):
 * whatever a reply says, or whichever address it came from, Ashley never writes to anyone we did not write to.
 */
function outgoing(io: AshleyIO, parts: MailParts, idempotencyKey: string): OutgoingMail {
  const fromEmail = (parts.root.fromEmail || io.settings.senderEmail).trim().toLowerCase();
  const fromName = parts.root.fromName?.trim() || io.settings.senderName;
  const unsubscribeUrl = io.unsubscribeUrl(parts.root.id);
  const rendered = renderAshleyMail({ language: parts.language, body: parts.body, link: parts.link, senderName: fromName, unsubscribeUrl, quote: parts.quote });
  return {
    idempotencyKey, to: parts.root.toEmail.trim().toLowerCase(), fromName, fromEmail, subject: parts.subject, html: rendered.html, text: rendered.text,
    headers: { ...replyThreadHeaders({ rfcMessageId: parts.rfcMessageId, references: parts.references }), ...listUnsubscribeHeaders(unsubscribeUrl, fromEmail) },
  };
}

const partsOf = (item: Omit<Sendable, "check" | "decision">): MailParts => ({
  root: item.root, language: item.language, body: item.body, link: item.link,
  subject: replySubject(item.thread.subject, item.root.subject), rfcMessageId: item.thread.rfcMessageId, references: item.thread.references,
  quote: item.quote ? { fromEmail: item.message.fromEmail || item.message.counterpartEmail, at: item.message.occurredAt, text: item.message.bodyText } : null,
});

/** The stored text of a reply: Ashley's words, then the link line ("<words>: <url>"), as the conversation row keeps it. */
export const storedReplyText = (body: string, link: { label: string; url: string } | null) =>
  [body.trim(), link ? `${link.label}: ${link.url}` : ""].filter(Boolean).join("\n\n");

/** A stored reply's words and link line back (the link only when it is one of ours). */
export function parseStoredReply(text: string, origin: string): { body: string; link: { label: string; url: string } | null } {
  const match = text.trim().match(/^([\s\S]*?)\n\n([^\n]+): (https?:\/\/\S+)$/);
  if (!match || !match[3].startsWith(`${origin.replace(/\/+$/, "")}/`)) return { body: text.trim(), link: null };
  return { body: match[1].trim(), link: { label: match[2].trim(), url: match[3] } };
}

async function sendOnce(io: AshleyIO, mail: OutgoingMail) {
  if (!io.send) throw new Error("no sender");
  try {
    return await io.send(mail);
  } catch {
    // One more try with the same idempotency key (the provider sends it once).
    return io.send(mail);
  }
}

/**
 * A queued reply to the provider: the thread read again right before (a person may have answered the mail while Ashley
 * wrote, design 5장), sent (tried twice with one key), recorded, and posted in the Slack thread.
 */
async function deliver(io: AshleyIO, args: {
  queuedId: string; parts: MailParts; message: Pick<ConversationMessage, "personId" | "counterpartEmail" | "rfcMessageId" | "occurredAt">;
  rootMailId: string | null; who: string; slackPersonId: string | null;
}): Promise<SendOutcome> {
  const { store } = io;
  if (args.rootMailId && await store.personAnswered(args.rootMailId, args.message.occurredAt)) {
    await store.markFailed(args.queuedId, "사람이 그사이 답했어요", true);
    await io.slack(noteSlackText(args.who, "사람이 그사이 답해서 Ashley 답장은 보내지 않았어요"), args.slackPersonId);
    return "held";
  }
  try {
    const sent = await sendOnce(io, outgoing(io, args.parts, `gtm-agent-reply:${args.queuedId}`));
    await store.markSent(args.queuedId, sent);
  } catch (error) {
    await store.markFailed(args.queuedId, errorText(error));
    await handOff(io, args.message, `${CODE_REASON.sendFailed} · ${errorText(error)}`, {
      draft: args.parts.body, link: args.parts.link, root: args.parts.root, who: args.who, personId: args.slackPersonId,
    });
    return "failed";
  }
  await io.slack(sentReplySlackText({ who: args.who, text: args.parts.body, link: args.parts.link }), args.slackPersonId).catch(() => undefined);
  return "sent";
}

/**
 * Records the reply decision and queues the one reply (store.queueReply: one per inbound mail). A check failure (or no
 * sender) is held and handed to a person. Outside the sending hours the reply stays queued and the next open tick
 * sends it (flushQueuedReplies), with no second decide. Otherwise it goes now.
 */
async function sendReply(io: AshleyIO, item: Sendable, now: Date): Promise<SendOutcome> {
  const { store } = io;
  const held = item.check.status === "fail" ? `${CODE_REASON.preSend} · ${item.check.reasons.join(" · ")}`
    : !io.settings.replyAgentEnabled || !io.send ? CODE_REASON.replyOff : null;
  await store.recordDecision(item.message.id, "reply", held && item.check.status === "fail" ? held : item.decision.reason, item.decision.signals);
  const parts = partsOf(item);
  const queued = await store.queueReply(item.message.id, {
    subject: parts.subject, bodyText: storedReplyText(item.body, item.link), inReplyTo: item.thread.rfcMessageId,
    references: item.thread.references, counterpartEmail: item.to.email, counterpartKind: item.to.kind, personId: item.to.personId,
    rootMailId: item.to.rootMailId,
  });
  if (!queued) return "already";
  if (held) {
    await store.markFailed(queued.id, held, true);
    await handOff(io, item.message, held, { draft: item.body, link: item.link, root: item.root, who: item.who, personId: item.slackPersonId });
    return "held";
  }
  if (item.check.status === "wait" || !io.settings.windowOpen(now)) return "queued";
  return deliver(io, { queuedId: queued.id, parts, message: item.message, rootMailId: item.to.rootMailId, who: item.who, slackPersonId: item.slackPersonId });
}

/**
 * A second mail in one decision (the company's link after a candidate notice): not a reply row, recorded on the relay.
 * The thread is read again right before (a person may have answered meanwhile), as for a reply.
 */
async function sendExtra(
  io: AshleyIO, item: Omit<Sendable, "check" | "decision">, key: string, now: Date,
): Promise<{ providerId: string } | { notSent: string }> {
  if (!io.send || !io.settings.replyAgentEnabled || !io.settings.windowOpen(now)) return { notSent: "보내는 시간이 지나 보내지 못했어요" };
  if (item.to.rootMailId && await io.store.personAnswered(item.to.rootMailId, item.message.occurredAt)) return { notSent: "사람이 그사이 이 회사 스레드에 답해서 보내지 않았어요" };
  const sent = await sendOnce(io, outgoing(io, partsOf(item), key));
  await io.slack(sentReplySlackText({ who: item.who, text: item.body, link: item.link }), item.slackPersonId).catch(() => undefined);
  return { providerId: sent.providerMessageId ?? "" };
}

/** An Ashley reply decided and queued in an earlier tick, not sent yet (the mail it answers comes with it). */
export type QueuedReply = Pick<
  ConversationMessage, "id" | "counterpartEmail" | "counterpartKind" | "personId" | "rootMailId" | "subject" | "bodyText" | "inReplyTo" | "references"
> & { inbound: Pick<ConversationMessage, "id" | "counterpartEmail" | "fromEmail" | "bodyText" | "occurredAt" | "decisionReason" | "rfcMessageId" | "personId"> };

/**
 * The replies decided and queued while the hours were closed (or left queued by a crash): sent now as they were
 * written, after the same last looks (opt-out list, a person's answer). A reply to a polite decline stops contact once
 * it went (as when it is sent right away).
 */
export async function flushQueuedReplies(io: AshleyIO, limit: number): Promise<Partial<Record<SendOutcome, number>>> {
  const counts: Partial<Record<SendOutcome, number>> = {};
  for (const row of (await io.queuedReplies?.(limit)) ?? []) {
    const root = row.rootMailId ? await io.readMail(row.rootMailId) : null;
    const person = row.personId ? await io.readPerson(row.personId) : null;
    const who = whoOf(person, row.counterpartEmail);
    let outcome: SendOutcome;
    if (!root) {
      await io.store.markFailed(row.id, "이 답장의 스레드를 찾지 못했어요", true);
      await handOff(io, row.inbound, "기다리던 답장의 스레드를 찾지 못했어요", { who, personId: row.personId });
      outcome = "held";
    } else if (await io.isSuppressed(row.counterpartEmail)) {
      await io.store.markFailed(row.id, "연락 받지 않기 목록에 있어요", true);
      await io.slack(noteSlackText(who, "연락 받지 않기 목록에 올라 기다리던 Ashley 답장은 보내지 않았어요"), row.personId);
      outcome = "held";
    } else {
      const { body, link } = parseStoredReply(row.bodyText, io.settings.origin);
      const quoted = row.inbound.counterpartEmail === row.counterpartEmail;
      outcome = await deliver(io, {
        queuedId: row.id, rootMailId: row.rootMailId, who, slackPersonId: row.personId, message: row.inbound,
        parts: {
          root, language: languageOf(body), body, link, subject: row.subject,
          rfcMessageId: row.inReplyTo, references: row.references,
          quote: quoted ? { fromEmail: row.inbound.fromEmail || row.inbound.counterpartEmail, at: row.inbound.occurredAt, text: row.inbound.bodyText } : null,
        },
      });
      if (outcome === "sent" && row.personId && row.counterpartKind === "candidate" && row.inbound.decisionReason?.startsWith(`${DECISION_LABEL.mild_decline} · `)) {
        await io.stopContact({ personId: row.personId, mailId: root.id, email: row.counterpartEmail, note: "Ashley · 보통 거절에 한 번 답하고 연락 멈춤" });
      }
    }
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------------------------------------------

/** Hand-off in the reply alert's Slack thread: @mention, the reason, /ops, the Gmail thread, the signup link. */
export async function handOff(
  io: AshleyIO, message: Pick<ConversationMessage, "personId" | "counterpartEmail" | "rfcMessageId">, reason: string,
  extra: { draft?: string; link?: { label: string; url: string } | null; root?: AshleyMail | null; who?: string; personId?: string | null } = {},
): Promise<void> {
  const root = extra.root ?? null;
  const signupUrl = root?.audience === "candidate" ? ashleySignupLink({ origin: io.settings.origin, rootMailId: root.id, next: "onboarding" }) : null;
  const personId = extra.personId !== undefined ? extra.personId : message.personId;
  const opsUrl = personId ? agentPersonLink(io.settings.origin, { id: personId, email: message.counterpartEmail })
    : new URL("/ops/gtm-plays?tab=5", io.settings.origin).toString();
  const text = handoffSlackText({
    mentionUserId: io.settings.handoffSlackUserId, reason, who: extra.who ?? message.counterpartEmail, opsUrl,
    gmailUrl: gmailThreadSearchLink(root?.fromEmail || io.settings.mailbox, message.rfcMessageId), signupUrl,
  });
  const draft = extra.draft?.trim()
    ? `\nAshley가 쓴 답장 (보내지 않음):\n${extra.draft.trim().split("\n").map((line) => `> ${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}`).join("\n")}${extra.link ? `\n링크: ${extra.link.url}` : ""}`
    : "";
  await io.slack(`${text}${draft}`, personId);
}

// ---------------------------------------------------------------------------------------------------------------
// One inbound mail

/** The closing sentence the next-step check may add (one sentence; anything longer is not added). */
const CLOSING_MAX = 300;

/** Why an inbound mail got no reply of its own: the same address wrote again, and that newer mail is answered. */
export const SUPERSEDED_REASON = "같은 분이 그 뒤에 다시 메일을 보내 그 메일에 한 번에 답해요";

export type MessageOutcome =
  | "member" | "human_answered" | "no_reply" | "stop" | "hand_to_human" | "budget" | "skipped" | SendOutcome;

const whoOf = (person: Pick<AshleyPerson, "name"> | null, email: string) =>
  person?.name?.trim() && person.name.trim().toLowerCase() !== email ? `${person.name.trim()} <${email}>` : `<${email}>`;

async function decideAndAct(io: AshleyIO, message: ConversationMessage, decision: AshleyDecisionKind, reason: string, extra: { root?: AshleyMail | null; who: string; personId: string | null; stop?: { mailId: string | null; personId: string | null } }): Promise<MessageOutcome> {
  await io.store.recordDecision(message.id, decision, reason, []);
  if (decision === "stop") {
    await io.stopContact({ personId: extra.stop?.personId ?? null, mailId: extra.stop?.mailId ?? null, email: message.counterpartEmail, note: `Ashley · ${reason}` });
    return "stop";
  }
  if (decision === "hand_to_human") {
    await handOff(io, message, reason, { root: extra.root, who: extra.who, personId: extra.personId });
    return "hand_to_human";
  }
  return "no_reply";
}

/** A candidate's mail. */
async function candidateMail(io: AshleyIO, message: ConversationMessage, now: Date): Promise<MessageOutcome> {
  const root = message.rootMailId ? await io.readMail(message.rootMailId) : null;
  const person = message.personId ? await io.readPerson(message.personId) : null;
  const who = whoOf(person, message.counterpartEmail);
  const base = { root, who, personId: message.personId };
  if (await io.isMember(message.counterpartEmail)) {
    if (!io.routeToMember) return decideAndAct(io, message, "hand_to_human", CODE_REASON.memberNoRoute, base);
    try {
      await io.routeToMember(message);
    } catch (error) {
      return decideAndAct(io, message, "hand_to_human", `${CODE_REASON.member} · 하퍼로 넘기지 못했어요 · ${errorText(error)}`, base);
    }
    await io.store.recordDecision(message.id, "no_reply", CODE_REASON.member, []);
    return "member";
  }
  // A person already answered this mail from the mailbox: it is done. A later mail is Ashley's again (Shaun 11/21 16:13:
  // one mail, one handling; a person's answer covers the mail it answered).
  if (root && await io.store.personAnswered(root.id, message.occurredAt)) {
    await io.store.recordDecision(message.id, "no_reply", CODE_REASON.humanAnswered, []);
    return "human_answered";
  }
  if (!person || !root) return decideAndAct(io, message, "hand_to_human", CODE_REASON.noPerson, base);
  if (!(await io.maySpend())) return "budget";
  const draft = await draftCandidateReply(io, { message, person, root, now });
  if (draft.kind === "decided") {
    return decideAndAct(io, message, draft.action, draft.reason, { ...base, stop: { mailId: root.id, personId: person.id } });
  }
  const outcome = await sendReply(io, {
    message, root, language: draft.language, body: draft.body, link: draft.link, quote: true, check: draft.check,
    to: { email: root.toEmail, kind: "candidate", personId: person.id, rootMailId: root.id },
    thread: { subject: message.subject, rfcMessageId: message.rfcMessageId, references: message.references },
    decision: { reason: draft.reason, signals: draft.signals }, who, slackPersonId: person.id,
  }, now);
  // Queued (the hours closed while writing) counts as going: the next open tick sends it as written.
  if (outcome !== "sent" && outcome !== "queued") return outcome;
  if (draft.fixedCopy) {
    for (const relay of await io.relays.forPerson(person.id)) await io.relays.mark(relay.companyEmail, person.id, "candidate_noted_at");
  }
  if (draft.asks.length) await io.notePerson(person.id, `${ASHLEY_NOTE.asked}${draft.asks.join(", ")}`);
  if (draft.searched) await io.notePerson(person.id, `${ASHLEY_NOTE.searched}${draft.link?.nextStep ?? "답장"}`);
  // A polite decline was answered with "I won't write again": the address goes on the opt-out list (design 4장).
  // Queued: flushQueuedReplies stops contact once the reply went (the opt-out list would hold it back otherwise).
  if (draft.type === "mild_decline" && outcome === "sent") {
    await io.stopContact({ personId: person.id, mailId: root.id, email: message.counterpartEmail, note: "Ashley · 보통 거절에 한 번 답하고 연락 멈춤" });
  }
  return outcome;
}

// ---------------------------------------------------------------------------------------------------------------
// A company's reply to a company mail (design 5장 "회사가 답장하면")

async function companyMail(io: AshleyIO, message: ConversationMessage, now: Date): Promise<MessageOutcome> {
  const root = message.rootMailId ? await io.readMail(message.rootMailId) : null;
  const company = root?.postings[0]?.companyName?.trim() || message.counterpartEmail.split("@")[1] || "";
  const who = `${company} <${message.counterpartEmail}>`;
  const base = { root, who, personId: null };
  if (!root) return decideAndAct(io, message, "hand_to_human", "회사 그 밖 · 이 답장의 회사 메일을 찾지 못했어요", base);
  if (await io.store.personAnswered(root.id, message.occurredAt)) {
    await io.store.recordDecision(message.id, "no_reply", CODE_REASON.humanAnswered, []);
    return "human_answered";
  }
  if (!(await io.maySpend())) return "budget";
  const posting = root.postings[0] ?? null;
  const people = (await Promise.all(root.interestedPersonIds.slice(0, 10).map((id) => io.readPerson(id)))).filter((person): person is AshleyPerson => Boolean(person));
  const signals = posting?.url ? await io.store.interestSignals({ postingUrl: posting.url }).catch(() => []) : [];
  const candidates = people.map((person, index) => ({
    label: `C${index + 1}`, person,
    question: signals.find((signal) => signal.personId === person.id && signal.question)?.question ?? null,
  }));
  const history = historyBefore(await io.store.history(message.counterpartEmail, { threadKey: root.id }), message);
  let called: unknown = null;
  const result = await io.llm({
    label: "gtm-agent:ashley-company",
    system: [
      { key: "career_main", text: ASHLEY_COMPANY_PROMPT },
      { key: "ashley_context", text: companyContext({
        now, companyName: company, posting, history,
        candidates: candidates.map((item) => ({ label: item.label, question: item.question, line: null })),
        inbound: inboundOf(message),
      }) },
    ],
    message: "Read the company's reply above: call decide.",
    tools: [COMPANY_DECIDE_TOOL as Tool],
    stopAfter: ["decide"],
    executeTool: async (name, input) => {
      if (name === "decide" && called === null) called = input;
      return "Recorded.";
    },
  });
  await io.recordSpend(result.costUsd, null);
  const decision = called === null ? null : parseCompanyDecision(called, candidates.map((item) => item.label));
  if (!decision) return decideAndAct(io, message, "hand_to_human", `${CODE_REASON.noDecision} · 회사 답장`, base);
  const reason = decisionReason(decision.type, decision.reason);
  if (decision.type === "not_interested") return decideAndAct(io, message, "stop", reason, { ...base, stop: { mailId: root.id, personId: null } });
  if (decision.type === "other") return decideAndAct(io, message, "hand_to_human", reason, base);

  const target = candidates.find((item) => item.label === decision.candidate) ?? (candidates.length === 1 ? candidates[0] : null);
  const companyLanguage = languageOf(mailText(message), root.subject);
  const replyToCompany = (body: string[], link: { label: string; url: string } | null, why: string, check: PreSendResult) => sendReply(io, {
    message, root, language: companyLanguage, body: body.join("\n\n"), link, quote: true, check,
    to: { email: root.toEmail, kind: "company", personId: null, rootMailId: root.id },
    thread: { subject: message.subject, rfcMessageId: message.rfcMessageId, references: message.references },
    decision: { reason: why, signals: [] }, who, slackPersonId: null,
  }, now);
  const suppressedCompany = await io.isSuppressed(message.counterpartEmail);
  const companyCheck = (body: string[]) => checkBeforeSend({
    draft: body.join("\n\n"), postingTexts: [], fixedCopy: true, suppressed: suppressedCompany,
    windowOpen: io.settings.windowOpen(now), personAnswered: false,
  });
  const copy = ASHLEY_COPY[companyLanguage];
  const companyAfterRelay = async () => {
    const pair = target ? await io.relays.get(message.counterpartEmail, target.person.id) : null;
    if (!pair || !target) return null;
    if (pair.companyNotedAt) return decideAndAct(io, message, "no_reply", CODE_REASON.relayDone, base);
    const body = [copy.companyGreeting(company || null), ...copy.companyAfterRelay];
    const outcome = await replyToCompany(body, null, `${reason} · 중계 뒤 한 번 답함`, companyCheck(body));
    if (outcome === "sent" || outcome === "queued") await io.relays.mark(message.counterpartEmail, target.person.id, "company_noted_at");
    return outcome;
  };
  const after = await companyAfterRelay();
  if (after) return after;

  const candidateBlocked = async (person: AshleyPerson) => {
    if (!person.email || !person.mailId) return "후보의 메일 주소나 첫 메일이 없어요";
    if (await io.isMember(person.email)) return "후보가 이미 Harper 회원이에요";
    if (await io.isSuppressed(person.email)) return "후보가 연락 받지 않기 목록에 있어요";
    if (await io.store.personAnswered(person.mailId, message.occurredAt)) return "이 회사 메일이 온 뒤 사람이 후보에게 직접 답했어요";
    return null;
  };

  if (decision.type === "answer") {
    if (!target || !decision.relayText || !verbatimIn(decision.relayText, mailText(message))) {
      return decideAndAct(io, message, "hand_to_human", `${reason} · 어느 후보의 질문에 대한 답인지, 회사 글 그대로인지 확인하지 못했어요`, base);
    }
    const blocked = await candidateBlocked(target.person);
    if (blocked) return decideAndAct(io, message, "hand_to_human", `${reason} · ${blocked}`, base);
    const relayText = decision.relayText.trim();
    const relayed = await relayToCandidate(io, {
      message, root, person: target.person, company, now, reason, kind: "answer",
      body: (language) => [ASHLEY_COPY[language].greeting(target.person.name), ...ASHLEY_COPY[language].relay(company), `"${relayText}"`, ...ASHLEY_COPY[language].relayAfter],
    });
    return relayed === "taken" ? decideAndAct(io, message, "no_reply", CODE_REASON.relayDone, base) : relayed;
  }

  // wants_more: the company gets its link; a candidate not on Harper is told the company wants to talk.
  const companyLink = { label: copy.companyLinkLabel, url: companyLandingLink(io.settings.origin, root.id) };
  const companyBody = [copy.companyGreeting(company || null), ...copy.companyLink];
  const blocked = target ? await candidateBlocked(target.person) : "어느 후보인지 알 수 없어요";
  const outcome = target && !blocked ? await relayToCandidate(io, {
    message, root, person: target.person, company, now, reason, kind: "wants_more",
    body: (language) => [ASHLEY_COPY[language].greeting(target.person.name), ...ASHLEY_COPY[language].wantsToTalk(company)],
  }) : "taken";
  if (outcome === "taken") {
    // No candidate to tell (none named, already on Harper, opted out): the company's link is the one reply.
    const sent = await replyToCompany(companyBody, companyLink, reason, companyCheck(companyBody));
    if (sent === "sent" && candidates.length > 0 && blocked) {
      await handOff(io, message, `${reason} · 회사가 더 보고 싶어 해요. 관심 후보에게 알릴지 정해 주세요 (${blocked})`, base);
    }
    return sent;
  }
  if ((outcome !== "sent" && outcome !== "queued") || !target) return outcome;
  const check = companyCheck(companyBody);
  if (check.status === "fail") return outcome;
  try {
    const extra = await sendExtra(io, {
      message, root, language: companyLanguage, body: companyBody.join("\n\n"), link: companyLink, quote: true,
      to: { email: root.toEmail, kind: "company", personId: null, rootMailId: root.id },
      thread: { subject: message.subject, rfcMessageId: message.rfcMessageId, references: message.references }, who, slackPersonId: null,
    }, `gtm-agent-company-link:${message.id}`, now);
    if ("providerId" in extra) await io.relays.mark(message.counterpartEmail, target.person.id, "company_link_sent_at", extra.providerId || null);
    else await handOff(io, message, `${reason} · 회사에 보낼 링크 메일은 ${extra.notSent}`, { ...base, draft: companyBody.join("\n\n"), link: companyLink });
  } catch (error) {
    await handOff(io, message, `${CODE_REASON.sendFailed} · 회사에 링크 메일을 보내지 못했어요 · ${errorText(error)}`, { ...base, draft: companyBody.join("\n\n"), link: companyLink });
  }
  return outcome;
}

/** The company's words (or its wish to talk) to the candidate, in the candidate's thread: the one reply to its mail. */
async function relayToCandidate(io: AshleyIO, args: {
  message: ConversationMessage; root: AshleyMail; person: AshleyPerson; company: string; now: Date; reason: string;
  kind: RelayRow["kind"]; body: (language: AshleyLanguage) => string[];
}): Promise<MessageOutcome | "taken"> {
  const { person } = args;
  // The candidate's own first mail: its address is the only one this relay may go to (outgoing).
  const candidateRoot = person.mailId ? await io.readMail(person.mailId) : null;
  if (!candidateRoot) {
    return decideAndAct(io, args.message, "hand_to_human", `${args.reason} · 후보의 첫 메일을 찾지 못했어요`, {
      root: args.root, who: whoOf(null, args.message.counterpartEmail), personId: null,
    });
  }
  const latest = await io.latestInbound(person.id);
  const language: AshleyLanguage = person.language ?? languageOf(latest ? mailText(latest) : "");
  const posting = args.root.postings[0] ?? null;
  const body = args.body(language);
  const link = {
    label: ASHLEY_COPY[language].relayLabel(args.company || "Harper"),
    url: ashleySignupLink({ origin: io.settings.origin, rootMailId: candidateRoot.id, next: "connect_request", posting }),
  };
  const who = whoOf(person, person.email ?? "");
  const check = checkBeforeSend({
    draft: body.join("\n\n"), postingTexts: [], fixedCopy: true,
    suppressed: await io.isSuppressed(person.email ?? ""), windowOpen: io.settings.windowOpen(args.now),
    personAnswered: await io.store.personAnswered(candidateRoot.id, args.message.occurredAt),
  });
  // The pair's one relay (claimed before anything is recorded; a second worker or a later mail finds it taken).
  const claimed = await io.relays.claim({
    companyEmail: args.message.counterpartEmail, personId: person.id, kind: args.kind, companyMailId: args.root.id, inboundMessageId: args.message.id,
  });
  if (!claimed) return "taken";
  return sendReply(io, {
    message: args.message, root: candidateRoot, language, body: body.join("\n\n"), link, quote: false, check,
    to: { email: candidateRoot.toEmail, kind: "candidate", personId: person.id, rootMailId: candidateRoot.id },
    thread: { subject: latest?.subject ?? candidateRoot.subject, rfcMessageId: latest?.rfcMessageId ?? candidateRoot.rfcMessageId, references: latest?.references ?? null },
    decision: { reason: args.reason, signals: [] }, who, slackPersonId: person.id,
  }, args.now);
}

/** One inbound mail, whoever it is from. */
export async function processAshleyMessage(io: AshleyIO, message: ConversationMessage, now: Date): Promise<MessageOutcome> {
  if (message.direction !== "inbound" || message.author !== "counterpart" || message.decision) return "skipped";
  return message.counterpartKind === "company" ? companyMail(io, message, now) : candidateMail(io, message, now);
}

// ---------------------------------------------------------------------------------------------------------------
// A tick

export type AshleyTick = {
  ran: boolean;
  reason?: string;
  /** Replies queued in an earlier tick, sent (or held) now. */
  flushed?: Partial<Record<SendOutcome, number>>;
  outcomes: Partial<Record<MessageOutcome | "error", number>>;
  errors: string[];
};

/**
 * Off on /ops: nothing. Inside the sending hours only (outside them nothing is decided: the mails wait for the next
 * open tick, design 4장): first the replies queued in an earlier tick, then the undecided inbound mails, oldest first,
 * one at a time. A model or provider failure on one mail leaves it
 * undecided (tried again next tick) and the tick goes on; the day's cost cap ends the tick.
 */
export async function processAshleyReplies(io: AshleyIO, opts: { limit: number; now: Date; deadline?: number }): Promise<AshleyTick> {
  const tick: AshleyTick = { ran: true, outcomes: {}, errors: [] };
  // Off on /ops: nothing at all (the mails stay undecided; switched on, the backlog is decided and answered).
  if (!io.settings.replyAgentEnabled) return { ...tick, ran: false, reason: "reply_agent_off" };
  if (!io.settings.windowOpen(opts.now)) return { ...tick, ran: false, reason: "window_closed" };
  try {
    tick.flushed = await flushQueuedReplies(io, opts.limit);
  } catch (error) {
    tick.errors.push(`queued: ${errorText(error)}`);
  }
  const messages = await io.store.listUndecidedInbound(opts.limit);
  for (const [index, message] of messages.entries()) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    let outcome: MessageOutcome | "error";
    try {
      // The same address wrote again after this one: only the newest is answered (its history holds this one), so
      // an older mail never gets a reply that ignores what came after it.
      const address = message.counterpartEmail.trim().toLowerCase();
      const newerInBatch = messages.slice(index + 1).some((later) => later.counterpartEmail.trim().toLowerCase() === address);
      if (newerInBatch || (io.store.hasNewerInbound && await io.store.hasNewerInbound(message))) {
        await io.store.recordDecision(message.id, "no_reply", SUPERSEDED_REASON, []);
        outcome = "no_reply";
      } else {
        outcome = await processAshleyMessage(io, message, opts.now);
      }
    } catch (error) {
      outcome = "error";
      tick.errors.push(`${message.id}: ${errorText(error)}`);
    }
    tick.outcomes[outcome] = (tick.outcomes[outcome] ?? 0) + 1;
    if (outcome === "budget") return { ...tick, reason: "cost_cap" };
  }
  return tick;
}
