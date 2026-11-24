/**
 * #5 Ashley's reply agent (design 3장, 4장, 5장): for each inbound mail no one decided on yet, oldest first, decide
 * (reply / no_reply / stop / hand_to_human), write, check, send and hand off. Everything outside is injected
 * (AshleyIO: the conversation store, the model, Resend, Slack, the opt-out path), so the rules are tested with fakes
 * and the replay (scripts/gtm-agent/ashley-replay.ts) runs the same decide-and-write with nothing sent.
 *
 * Rules held by structure, not by the model:
 * - one Ashley mail per inbound mail at most (store.queueReply refuses a second; the decision is written once);
 * - one Ashley mail per address a Korea-time day, whatever kind (Shaun 11/22, no exceptions: a reply, a company's words
 *   passed on, a connection request told, the company's link): a mail of someone Ashley already wrote to today waits,
 *   unread by the model, for the next send day, and is then written from everything that came in by then;
 * - the mails one address sent since it was last answered are answered together, in one reply that reads them all
 *   (the newest is the one the reply answers; the others are closed with it);
 * - while the reply agent is off on /ops nothing runs (no model call: the mails wait undecided, and the backlog is
 *   decided when it is switched on); outside the sending hours nothing is decided;
 * - a reply is written only to go at once (Shaun 11/22: check, write, send): one that cannot go now is not kept, and its
 *   mail is written afresh on the next send day. A reply left queued is one whose sending was cut off (a crash): it is
 *   sent again with the same idempotency key, so it goes at most once;
 * - nothing goes to an address on the opt-out list or into a thread a person answered (checked again right before
 *   the provider call);
 * - every mail passes checkBeforeSend (ashleyCheck.ts); a failure is held and handed to a person;
 * - a company's words reach a candidate once per company–candidate pair (gtm_agent_relays), word for word; after that
 *   each side gets one fixed answer and nothing more;
 * - no person stands between a candidate who joins Harper and the company that wanted them (Shaun 11/22 16:08, 16:10):
 *   whichever comes first (the join or the company's answer), the company gets one mail of its own in its thread, "the
 *   candidate you asked about joined Harper" with its /org link, from one sender only (tellJoinedCompanies; a company
 *   that answers after the join gets no reply of its own, companyMail), once per company mail and candidate, claimed
 *   before it goes (gtm_agent_relays.company_link_sent_at after joined_noted_at, company_link_provider_id its end). A
 *   company's words for a member go to their Harper chat as they are, not by mail (tellMember). A company that signed
 *   up from its company mail gets the member in its Role's "연결을 요청할 후보" (placeMember); one that already asked to
 *   connect on Harper has it go on as Harper's connection request for a member (requestMemberIntro), or, when that
 *   cannot be made, its request closed with its credit back before the joined mail goes;
 * - a company's connection request on Harper (an 외부 후보 card) is told to the candidate by Ashley, handed to Harper's
 *   member connection request when they are a member, tried once more the next send day when the send fails, and
 *   given back to the company (its credit back, a notice in its hiring conversation that says no why) when the
 *   candidate cannot be reached (opted out, bounced, or the second send failed) (tellCompanyIntroAsk, Shaun 11/22).
 */
import { storedOffer } from "./channels";
import { checkBeforeSend, type PreSendResult } from "./ashleyCheck";
import {
  ASHLEY_COPY, ashleySignupLink, companyLandingLink, gmailThreadSearchLink, handoffSlackText, harperChatLink, listUnsubscribeHeaders,
  memberAnswerContent, memberRedirectChatContent, noteSlackText, renderAshleyMail, replySubject, replyThreadHeaders, sentReplySlackText, signupLinkLabel,
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
import type { CompanyAsk } from "./companyMail";
import { agentPersonLink } from "./replies";
import type { AgentEvent, AgentPerson, AgentPosting } from "./types";
import { kstDayWindow } from "../sendLimit";

// ---------------------------------------------------------------------------------------------------------------
// What the agent is given

export type AshleySettings = {
  /** /ops: the agent is on (its one 켜짐/꺼짐, Shaun 11/22). Off: nothing is decided, and nothing of Ashley's goes out. */
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
> & Partial<Pick<AgentPerson, "messageKind" | "offerEvents">>;

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
  /** The company's mail the relay came from; null for a connection request made on Harper (a 외부 후보 card). */
  inboundMessageId?: string | null;
  candidateNotedAt: string | null;
  companyNotedAt: string | null;
  /**
   * When the company last got its /org link for this pair: after the candidate notice, or the joined step (the joined
   * mail, or its end without one: JoinedEnd). A time at or after joinedNotedAt is the pair's joined step.
   */
  companyLinkSentAt: string | null;
  /** The candidate joined Harper (the sign-up hook, the tick's member check, or the company answered after they had joined). */
  joinedNotedAt?: string | null;
  createdAt: string;
};
export type RelayMark = "candidate_noted_at" | "company_noted_at" | "company_link_sent_at" | "joined_noted_at";

/**
 * How a pair's joined step ended (gtm_agent_relays.company_link_provider_id, beside company_link_sent_at after the join;
 * no column of its own): the joined mail's provider id, or one of these. JOINED_PENDING is a claim being sent (a tick
 * that died leaves it; it is taken again after JOINED_CLAIM_STALE_MS, with the same idempotency key).
 */
export const JOINED_PENDING = "joined:pending";
export const JOINED_HANDED_OFF = "joined:handed_off";
export const JOINED_GAVE_UP = "joined:gave_up";
/** The joined mail went and the provider gave no id. */
export const JOINED_SENT = "joined:sent";
/** The company's request on Harper went on as Harper's member request: its word to the company, instead of a mail. */
export const JOINED_MEMBER = "joined:member";
/** No mail can ever go for it (its company mail is not one Ashley has, or the address opted out): not listed again. */
export const JOINED_NOT_SENT = "joined:not_sent";
export const JOINED_CLAIM_STALE_MS = 15 * 60_000;
/** Sends of one pair's joined mail at most: the first, and once more on a later send day. */
export const JOINED_TRIES = 2;

/**
 * A pair whose candidate joined Harper and whose company was not told yet (RelayStore.joinedToTell), with the company's
 * mail it came from (the joined mail goes in that thread) and, for a request made on Harper, that request.
 */
export type JoinedPair = RelayRow & {
  thread: { subject: string; rfcMessageId: string | null; references: string | null } | null;
  /** The company's connection request on Harper this pair came from, while it is still open (told by Ashley). */
  introRequestId: string | null;
};

/** gtm_agent_relays: one row per company address and candidate, the first time the company's words reach them. */
export type RelayStore = {
  forPerson(personId: string): Promise<RelayRow[]>;
  get(companyEmail: string, personId: string): Promise<RelayRow | null>;
  /** Inserts the pair's row; false when it is there already (a relay happened, or another worker is doing it). */
  /** inboundMessageId: the company's mail; null for a connection request made on Harper (a 외부 후보 card). */
  claim(row: { companyEmail: string; personId: string; kind: RelayRow["kind"]; companyMailId: string; inboundMessageId: string | null }): Promise<boolean>;
  /** Sets one time column when it is still empty; true when this call set it. */
  mark(companyEmail: string, personId: string, field: RelayMark, providerId?: string | null): Promise<boolean>;
  /**
   * The pairs whose candidate joined Harper in the last JOINED_TELL_DAYS days and whose joined step has not happened,
   * one per company mail and candidate (a company that answered from two addresses is one company), oldest join first.
   * A pair from a request made on Harper is listed only while that request is the one Ashley told the candidate about,
   * or was closed for the joined mail (not passed, not handed on).
   */
  joinedToTell?(limit: number): Promise<JoinedPair[]>;
  /**
   * Claims the joined step of the pair's company mail and candidate (all its addresses), before anything goes:
   * company_link_sent_at after the join, JOINED_PENDING. False when it is done or being done.
   */
  claimJoined?(pair: Pick<RelayRow, "companyEmail" | "personId">): Promise<boolean>;
  /** The claimed step ended: the joined mail's provider id, JOINED_HANDED_OFF, JOINED_GAVE_UP, JOINED_MEMBER or JOINED_NOT_SENT. */
  endJoined?(pair: Pick<RelayRow, "companyEmail" | "personId">, end: string): Promise<void>;
  /** The claimed mail did not go: the claim is taken back, so the pair is tried again. */
  releaseJoined?(pair: Pick<RelayRow, "companyEmail" | "personId">): Promise<void>;
  /**
   * A join that did not come through the mail's link (they signed up on their own with the mail's address, or a
   * claimed account): pairs whose candidate is a member now get joined_noted_at. How many.
   */
  noteMemberJoins?(): Promise<number>;
};

/** How long after a join the company's joined mail (or a member's connection request) is still tried. */
export const JOINED_TELL_DAYS = 14;
/** How long a company's request for a member waits for the member's card in its Role before it takes another way. */
export const MEMBER_INTRO_WAIT_MS = 2 * 86_400_000;

/**
 * Harper's connection request for a member, made for a company's request on Harper (requestMemberIntro). waiting: the
 * member is being evaluated for, or written into, the company's Role; retry: the company's request was closed for it
 * but Harper's request failed (an error): finishIntroEnds makes it again, MEMBER_INTRO_TRIES at most, then a person
 * takes it; unavailable: it cannot be made (no card, the card cannot take one, the company passed, opted out: why).
 */
export type MemberIntro =
  | { state: "requested" } | { state: "waiting" } | { state: "retry"; reason: string } | { state: "unavailable"; reason: string };

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
  /**
   * The first-mail matcher with the conditions from the mail, and where they said they can work (null: not said); the
   * spend is recorded inside (step match).
   */
  findSimilar(person: AshleyPerson, conditions: string, sent: readonly AgentPosting[], workLocation: string | null): Promise<AgentPosting[]>;
  llm: AshleyLlm;
  /** A run's own spend limit (the replay's). Production has none: Ashley's replies have no cost cap (Shaun 11/22). */
  maySpend?(): Promise<boolean>;
  recordSpend(usd: number, person: Pick<AshleyPerson, "id" | "isTest"> | null): Promise<void>;
  /** Resend. Missing in the replay: nothing can go out. */
  send?: (mail: OutgoingMail) => Promise<{ providerMessageId: string | null; rfcMessageId: string | null }>;
  /** A line in the reply alert's Slack thread of this person (or the day's thread). */
  slack(text: string, personId: string | null): Promise<void>;
  /** The opt-out path (the mail's own unsubscribe; a person ended). */
  stopContact(args: { personId: string | null; mailId: string | null; email: string; note: string }): Promise<void>;
  /** A line on the person's timeline (postings: the URLs it is about, Ashley's similar roles). */
  notePerson(personId: string, note: string, postings?: readonly string[]): Promise<void>;
  unsubscribeUrl(mailId: string): string | null;
  relays: RelayStore;
  /** A member's mail goes to Harper (default: not wired, a person answers). */
  routeToMember?: (message: ConversationMessage) => Promise<unknown>;
  /**
   * Members' mails routed to Harper (decided 회원) in the last MEMBER_REDIRECT_DAYS days, oldest first, that nobody
   * wrote after in their thread (Ashley or a person) and that the person has not seen in Harper since (no message of
   * theirs in the chat, no Harper mail to them after it): with whether Harper's answer is in the chat. Not wired: none.
   */
  memberRedirects?: (limit: number) => Promise<MemberRedirect[]>;
  /** Ashley's mail that told them, as it went, into the member's Harper chat, with the routed mails it covers (best effort). */
  noteMemberChat?: (chat: { userId: string; conversationId: string; inboundMessageIds: readonly string[] }, content: string) => Promise<void>;
  /** Where asking this posting's company stands for the candidate: asked (when), can, or no (default: no). */
  companyAsk?: (input: { postingUrl: string; personId: string }) => Promise<CompanyAsk>;
  /** Replies decided and queued in an earlier tick and not sent yet, oldest first (none: nothing to flush). */
  queuedReplies?: (limit: number) => Promise<QueuedReply[]>;
  /** The candidate's latest mail to us (a relay goes in that thread). */
  latestInbound(personId: string): Promise<Pick<ConversationMessage, "subject" | "rfcMessageId" | "references" | "newText" | "bodyText"> | null>;
  /** Connection requests companies made on Ashley's 외부 후보 cards, taken for this tick, oldest first (none: nothing). */
  companyIntroAsks?: (limit: number) => Promise<CompanyIntroAsk[]>;
  /** Where a taken request ended (CompanyIntroEnd). */
  closeCompanyIntroAsk?: (id: string, end: CompanyIntroEnd) => Promise<void>;
  /** The taken request is still one to tell (not cancelled, the company did not pass on the person meanwhile). */
  companyIntroStillWanted?: (id: string) => Promise<boolean>;
  /** A company mail (gtm_mails campaign agent, audience company, sending/sent) went to this company or address on now's KST day. */
  companyMailedToday?: (company: { companyName: string; toEmail: string }, now: Date) => Promise<boolean>;
  /** Company mails are stopped after a spam complaint (companyMail.server.ts companyMailsStopped). */
  companyMailsStopped?: () => Promise<boolean>;
  /**
   * The company signed up from this company mail (/org?gtm=…): the joined candidate goes into its Role's "연결을 요청할
   * 후보" through the landing's own sync (companyInvite.server.ts, the mail's members' path: evaluated, then published).
   * placed: there now; waiting: being evaluated or written; none: the company is not on Harper from this mail, or the
   * candidate cannot be shown there.
   */
  placeMember?: (input: { companyMailId: string; personId: string }) => Promise<"placed" | "waiting" | "none">;
  /**
   * A company's connection request on Harper for a candidate who is (now) a member: placed as above, then Harper's own
   * connection request for a member (requestOrgCompanyIntro, in the requester's name, their appeal and recipients),
   * the request's credit given back first. The candidate gets it inside Harper.
   */
  requestMemberIntro?: (input: { introRequestId: string; companyMailId: string; personId: string }) => Promise<MemberIntro>;
  /**
   * A company's words for a member, into their Harper chat, as they are (memberAnswerContent): one Harper message, once
   * per key; then Harper is asked to tell them (a Career run that names the message, never the company's words). Throws
   * when the message could not be written (nothing was recorded: the company's mail is read again next tick).
   */
  tellMember?: (input: {
    personId: string; content: string; key: string;
    /** The relay row it is for (gtm_agent_relays' key, and the company's mail): kept on the message. */
    relay: { companyEmail: string; personId: string; inboundMessageId: string };
  }) => Promise<void>;
  /**
   * The joined mail goes instead of Harper's member request for a request made on Harper: that request is closed and
   * its credit given back first (the company asks, and pays, on Harper itself).
   */
  closeIntroForJoinedLink?: (introRequestId: string) => Promise<void>;
  /**
   * Member requests whose external request was closed for them but that were never confirmed made (a tick died in
   * between), JOINED_CLAIM_STALE_MS after: with the tries so far.
   */
  unfinishedMemberIntros?: (limit: number) => Promise<Array<{ id: string; personId: string; tries: number }>>;
  /**
   * Makes (or finds made) Harper's member request for it once more: done (made now, or the card is past ready), or why
   * not (the try is counted). stop: it is not tried again: quiet when the company passed on the candidate meanwhile
   * (nothing to make, no person), person when it can never be made (the candidate opted out, no card): a person takes it.
   */
  finishMemberIntro?: (id: string) => Promise<{ done: true } | { done: false; reason: string; stop?: "quiet" | "person" }>;
  /** Stops trying it (MEMBER_INTRO_TRIES, or a stop): a person takes it, or nobody when the company passed. */
  giveUpMemberIntro?: (id: string, reason: string) => Promise<void>;
  /** Requests closed as unreachable whose notice to the company has not gone (and was not given up), oldest first, with the tries so far. */
  unreachableNotices?: (limit: number) => Promise<Array<{ id: string; personId: string | null; tries: number }>>;
  /** Sends one again (its key keeps it to one); a failure is counted on the request, moves it behind the others, and throws. */
  sendUnreachableNotice?: (id: string) => Promise<void>;
  /** Stops trying it (UNREACHABLE_NOTICE_TRIES): a person tells the company. */
  giveUpUnreachableNotice?: (id: string, reason: string) => Promise<void>;
  /** Company words written into a member's chat whose Career run was not made (it failed after the message): made now. How many. */
  finishMemberNotices?: (limit: number) => Promise<number>;
};

/** Tries of a member request that a tick left unconfirmed, before a person takes it. */
export const MEMBER_INTRO_TRIES = 3;
/** Tries of a company's unreachable notice (the first at the close), before a person tells the company. */
export const UNREACHABLE_NOTICE_TRIES = 3;
/** Ticks that try to write a company's words into a member's chat (each reads the company's mail again), before a person takes the mail. */
export const MEMBER_TELL_TRIES = 3;

/**
 * Where a taken connection request ended: told (Ashley's mail went), not told (a person takes it, why), later (back to
 * waiting; retryAt: not before then, failed: the send that failed), unreachable (the candidate cannot be reached: the
 * credit goes back and the company is told in its hiring conversation, without why).
 */
export type CompanyIntroEnd =
  | { told: true; providerId: string | null }
  | { told: false; reason: string }
  | { later: true; retryAt?: string; failed?: string }
  | { unreachable: true };

/**
 * A company's connection request on one of Ashley's 외부 후보 cards (Shaun 11/21 17:01: a candidate not on Harper is in
 * 외부 후보; its 연결 요청 has Ashley tell the candidate in her thread with them, not Harper's invitation email).
 */
export type CompanyIntroAsk = {
  id: string; personId: string; companyMailId: string | null; requestedAt: string;
  /** Ashley's sends for it that failed so far (one more is tried the next send day). */
  failedSends?: number;
};

// ---------------------------------------------------------------------------------------------------------------
// Timeline notes Ashley reads back (fixed prefixes)

export const ASHLEY_NOTE = {
  asked: "Ashley가 물어봄 · ",
  searched: "Ashley가 다시 찾음 · ",
  waiting: "Ashley · 후보가 회사에 묻는 데 동의해서, 회사 메일이 나간 뒤 답장해요",
  companyIntro: "Ashley · 회사가 Harper에서 연결을 요청해 후보에게 알림 · ",
  memberRelay: "Ashley · 후보가 이미 Harper 회원이라 회사의 답을 하퍼 대화로 넘김 · ",
  memberIntro: "Ashley · 회사의 연결 요청을 Harper 회원 연결 요청으로 넘김 · ",
  unreachable: "Ashley · 회사가 Harper에서 연결을 요청했지만 연락할 수 없어 회사에 알리고 크레딧을 돌려줌 · ",
  companyJoined: "Ashley · 후보가 Harper에 가입해 회사에 알림 · ",
  /** "<prefix><company> · <company mail id>": the tries of a pair's joined mail are counted from these (JOINED_TRIES). */
  joinedFailed: "Ashley · 회사에 가입 소식 메일을 보내지 못함 · ",
  /** "<prefix><company> · <company's inbound message id>": the tries of writing its words into a member's chat (MEMBER_TELL_TRIES). */
  memberRelayFailed: "Ashley · 회사의 답을 하퍼 대화에 넣지 못함 · ",
  memberRedirect: "Ashley · 회원의 메일에 하퍼가 대화창에서 답해서, 같은 스레드로 하퍼에서 보시라고 한 통 보냄",
} as const;

/** What earlier replies asked (summary_consent, title, years, location), from the person's timeline. */
export function askedBefore(events: readonly AgentEvent[]): string[] {
  return [...new Set(events.flatMap((event) => (event.kind === "note" && event.note?.startsWith(ASHLEY_NOTE.asked)
    ? event.note.slice(ASHLEY_NOTE.asked.length).split(",").map((item) => item.trim()).filter(Boolean) : [])))];
}

export const searchedBefore = (events: readonly AgentEvent[]) =>
  events.some((event) => event.kind === "note" && Boolean(event.note?.startsWith(ASHLEY_NOTE.searched)));

/**
 * What to ask in this reply (design 5장 "넣는 정보와 동의", D; Shaun 11/21 17:04): a question or interest about an
 * outside posting without the agreement yet that it goes to the company with a short nameless summary, or a fact of
 * the summary's first line not known. Never what was asked before. Only for postings a company mail could go for now
 * (askCompanyNow): with none, nothing goes, so nothing is asked (replay 11/21: "I can't ask Company A" followed by
 * "May Harper send the company a nameless summary?").
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

/**
 * The history for answering several mails at once: everything before the newest, without the mails being answered
 * (they are given apart, as "the mails to answer"). What went between them stays: Ashley's own mail of an earlier
 * day (an intro, a relay) or a person's answer.
 */
export function historyForMails(entries: readonly HistoryEntry[], mails: ReadonlyArray<Pick<ConversationMessage, "occurredAt">>): HistoryEntry[] {
  const newest = mails[mails.length - 1];
  if (!newest) return [...entries];
  const answering = new Set(mails.map((mail) => Date.parse(mail.occurredAt)));
  return historyBefore(entries, newest).filter((entry) => !(entry.author === "counterpart" && answering.has(Date.parse(entry.at))));
}

const languageOf = (...values: Array<string | null | undefined>): AshleyLanguage =>
  values.some((value) => /[가-힣]/.test(value ?? "")) ? "ko" : "en";

const mailText = (message: Pick<ConversationMessage, "newText" | "bodyText">) => (message.newText.trim() || message.bodyText.trim());

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

// ---------------------------------------------------------------------------------------------------------------
// Candidate: decide and write (no sending: the replay uses this as it is)

/**
 * How long a reply waits for the company mail its candidate's agreement starts (Shaun 11/21 16:53: tell them once it
 * was asked). Then it goes anyway and says the mail is on its way.
 */
export const COMPANY_ASK_WAIT_MS = 2 * 60 * 60_000;

/**
 * The agreements of this mail no company mail carried yet while one can go: the reply waits for that mail, so that
 * "I asked them without your name" is true when Ashley writes it.
 */
export function openAsks(signals: readonly InterestSignal[], postings: readonly ContextPosting[]): InterestSignal[] {
  return signals.filter((signal) => signal.summaryConsent
    && postings.some((item) => item.posting.kind === "external" && item.posting.url === signal.postingUrl && item.askCompanyNow));
}

/** When this mail's reply began waiting for a company mail (its held signals), or null. */
export function heldSince(message: Pick<ConversationMessage, "signals">): string | null {
  const times = (message.signals ?? []).map((signal) => signal.heldAt).filter((at): at is string => Boolean(at && Number.isFinite(Date.parse(at))));
  return times.length ? times.sort()[0] : null;
}

export type CandidateDraft =
  | { kind: "decided"; action: Exclude<AshleyDecisionKind, "reply">; type: CandidateType | null; reason: string }
  /** The reply waits for the company mail these agreements start (the mail stays undecided; the signals are held). */
  | { kind: "wait"; type: CandidateType; reason: string; signals: InterestSignal[] }
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
    /** The similar roles it offers (their URLs): sign-up puts them in 내 기회 (signupMove.ts). */
    found: string[];
    /** Fixed words (after a relay): checked without the salary/visa rule. */
    fixedCopy: boolean;
  };

/**
 * message: the newest mail to answer; earlier: the same address's other mails since it was last answered, oldest first
 * (one reply answers them all).
 */
type CandidateCase = { message: ConversationMessage; earlier?: readonly ConversationMessage[]; person: AshleyPerson; root: AshleyMail; now: Date };

/** The mails one reply answers, oldest first: the earlier unanswered ones, then the newest. */
const mailsOf = (c: { message: ConversationMessage; earlier?: readonly ConversationMessage[] }) => [...(c.earlier ?? []), c.message];

/** When the reply to these mails began waiting for a company mail (the earliest held signal), or null. */
const heldSinceAll = (mails: readonly Pick<ConversationMessage, "signals">[]) => heldSince({ signals: mails.flatMap((mail) => mail.signals ?? []) });

const waitedOut = (since: string | null, now: Date) => Boolean(since) && now.getTime() - Date.parse(since!) >= COMPANY_ASK_WAIT_MS;

/** The postings this person was sent (the person's snapshot and the thread's mails), labelled P1 …, with their state. */
async function sentPostings(io: AshleyIO, person: AshleyPerson, root: AshleyMail): Promise<ContextPosting[]> {
  const seen = new Set<string>();
  const postings = [...person.postings, ...root.postings].filter((posting) => {
    const key = (posting.url || posting.roleId || `${posting.companyName}/${posting.title}`).trim().toLowerCase();
    return seen.has(key) ? false : (seen.add(key), true);
  }).slice(0, 6);
  return Promise.all(postings.map(async (posting, index) => {
    const state = await io.postingState(posting).catch(() => ({ open: null, text: null }));
    const ask: CompanyAsk = posting.kind === "external" && posting.url && io.companyAsk
      ? await io.companyAsk({ postingUrl: posting.url, personId: person.id }).catch((): CompanyAsk => ({ state: "no" })) : { state: "no" };
    return {
      label: `P${index + 1}`, posting, open: state.open, harperCanApply: harperCanApply(posting, state.open),
      askCompanyNow: ask.state === "can", askedAt: ask.state === "asked" ? ask.at : null, text: state.text,
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

/** Ashley's decision on a candidate's mails (the first call: only `decide` is offered). */
export async function decideCandidate(io: AshleyIO, c: CandidateCase, postings: readonly ContextPosting[], history: readonly HistoryEntry[]): Promise<{ decision: CandidateDecision | null; costUsd: number }> {
  let called: unknown = null;
  const context = candidateContext({
    now: c.now, person: contextPerson(c.person), postings, history, alreadyAsked: askedBefore(c.person.events),
    inbound: mailsOf(c).map(inboundOf),
  });
  const result = await io.llm({
    label: "gtm-agent:ashley-decide",
    system: [{ key: "career_main", text: ASHLEY_PROMPT }, { key: "ashley_context", text: context }, { key: "ashley_step", text: DECIDE_STEP }],
    message: "Decide on the mail(s) to answer above: call decide.",
    tools: [DECIDE_TOOL],
    stopAfter: ["decide"],
    executeTool: async (name, input) => {
      if (name === "decide" && called === null) called = input;
      return "Recorded.";
    },
  });
  const decision = called === null ? null : parseCandidateDecision(called, postings.map((item) => item.label));
  return { decision: decision && consentOnlyAfterAsk(decision, askedBefore(c.person.events)), costUsd: result.costUsd };
}

/**
 * A "yes" to the summary counts only once Ashley has told them what goes with it (Shaun 11/21 17:04: before a question
 * goes, the candidate is told a short summary may go to the company, and agrees). Until her reply asked it, an
 * "introduce me" is not that agreement: the consent stays unknown, so this reply asks (replay 8: two such mails).
 */
export function consentOnlyAfterAsk(decision: CandidateDecision, alreadyAsked: readonly string[]): CandidateDecision {
  if (alreadyAsked.includes("summary_consent")) return decision;
  return { ...decision, signals: decision.signals.map((signal) => signal.summaryConsent === "yes" ? { ...signal, summaryConsent: "unknown" as const } : signal) };
}

/**
 * Decide, and for a reply write and check it. Throws when a model call fails (the mail stays undecided and is tried
 * again). The only effects are through io (the spend; a re-search's matcher spend).
 */
export async function draftCandidateReply(io: AshleyIO, c: CandidateCase): Promise<CandidateDraft> {
  const { message, person, root, now } = c;
  const mails = mailsOf(c);
  const postings = await sentPostings(io, person, root);
  // The history before the newest mail, without the mails to answer (they are all new to her: none is "earlier").
  const history = historyForMails(await io.store.history(message.counterpartEmail, { threadKey: root.id }), mails);
  const decided = await decideCandidate(io, c, postings, history);
  let costUsd = decided.costUsd;
  try {
    const decision = decided.decision;
    if (!decision) return { kind: "decided", action: "hand_to_human", type: null, reason: `${CODE_REASON.noDecision} · decide를 부르지 않았어요` };
    const reason = decisionReason(decision.type, decision.reason);
    if (decision.action !== "reply") return { kind: "decided", action: decision.action, type: decision.type, reason };
    const signals = signalsOf(decision, postings, message, person.id);
    const theirText = mails.map(mailText).join("\n");
    const language: AshleyLanguage = languageOf(theirText) === "ko" || (!/[a-z]{3,}/i.test(theirText) && person.language === "ko") ? "ko" : "en";

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
      return { kind: "reply", type: decision.type, reason, signals, body, link, check, language, asks: [], searched: false, found: [], fixedCopy: true };
    }

    // An agreement no company mail carried yet: the reply waits for that mail (at most COMPANY_ASK_WAIT_MS, then it
    // says the mail is on its way).
    const open = openAsks(signals, postings);
    const since = heldSinceAll(mails);
    if (open.length && !waitedOut(since, now)) {
      const heldAt = since ?? now.toISOString();
      return { kind: "wait", type: decision.type, reason, signals: signals.map((signal) => ({ ...signal, heldAt })) };
    }
    const pending = new Set(open.map((signal) => signal.postingUrl));

    const alreadyAsked = askedBefore(person.events);
    const asks = asksFor({ decision, postings, person, alreadyAsked });
    const signalLabels = new Set(decision.signals.map((signal) => signal.posting));
    const shown = postings.map((item) => ({
      ...item, text: signalLabels.has(item.label) ? item.text : null,
      ...(item.posting.url && pending.has(item.posting.url) ? { askCompanyNow: false, askPending: true } : {}),
    }));
    const context = candidateContext({
      now, person: contextPerson(person), postings: shown, history, alreadyAsked, askNow: asks,
      inbound: mails.map(inboundOf),
    });
    const given: string[] = [...shown.map(postingLine), ...shown.flatMap((item) => (item.text ? [item.text] : []))];
    const labels = new Map(postings.map((item) => [item.label, item]));
    const state: { link: { label: string; url: string; nextStep: AshleyNextStep } | null; handOff: string | null; searched: boolean; found: string[] } = {
      link: null, handOff: null, searched: false, found: [],
    };
    const mayReSearch = !searchedBefore(person.events);
    const executeWriterTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
      const item = labels.get(String(input.posting ?? "").trim().toUpperCase());
      switch (name) {
        case "read_outreach":
          return outreachText({
            person: contextPerson(person), postings, foundBy: person.source, firstMailAt: person.sentAt,
            followupSent: Boolean(person.followupMailId), now, offer: storedOffer(person.messageKind), events: person.offerEvents ?? [],
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
          const workLocation = typeof input.work_location === "string" ? input.work_location.trim().slice(0, 300) || null : null;
          const found = await io.findSimilar(person, String(input.conditions ?? "").slice(0, 500), postings.map((posting) => posting.posting), workLocation);
          const items = found.slice(0, 2).map((posting, index): ContextPosting => ({
            label: `R${index + 1}`, posting, open: true, harperCanApply: harperCanApply(posting, true), askCompanyNow: false,
          }));
          for (const role of items) labels.set(role.label, role);
          state.found = items.flatMap((role) => (role.posting.url ? [role.posting.url] : []));
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
      message: "Write your one reply to the mail(s) above.",
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
    return { kind: "reply", type: decision.type, reason, signals, body, link: state.link, check, language, asks, searched: state.searched, found: state.found, fixedCopy: false };
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

/**
 * queued: stored and not sent (its sending was cut off, or Ashley wrote to that address since); deferred: not written
 * down at all, the mail waits undecided for the next send day (the hours closed, or Ashley already wrote to that
 * address today).
 */
export type SendOutcome = "sent" | "queued" | "held" | "failed" | "already" | "deferred";

/** Ashley already wrote to this address today (Korea time): one Ashley mail per address a day (Shaun 11/22). */
const mailedToday = async (io: AshleyIO, email: string, now: Date) =>
  Boolean(email.trim()) && Boolean(await io.store.ashleyMailedToday?.(email.trim().toLowerCase(), now));

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
 * An Ashley mail that answers no mail of theirs, recorded once it went: it is in the history and counts as that
 * address's mail of the day. Best effort (the mail went either way).
 */
async function recordSent(
  io: AshleyIO, parts: MailParts, to: Sendable["to"], sent: { providerMessageId: string | null; rfcMessageId: string | null },
): Promise<void> {
  if (!io.store.recordSent) return;
  try {
    await io.store.recordSent({
      personId: to.personId, counterpartKind: to.kind, counterpartEmail: to.email, rootMailId: to.rootMailId, subject: parts.subject,
      bodyText: storedReplyText(parts.body, parts.link), inReplyTo: parts.rfcMessageId, references: parts.references,
      providerMessageId: sent.providerMessageId, rfcMessageId: sent.rfcMessageId,
    });
  } catch (error) {
    console.error("[gtm-agent] Ashley mail sent but not recorded", to.email, errorText(error));
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
 * Records the reply decision, queues the one reply (store.queueReply: one per inbound mail) and sends it now. A check
 * failure (or no sender) is held and handed to a person. A reply that cannot go now (outside the sending hours, or
 * Ashley already wrote to that address today) is not kept: nothing is recorded, and the mail is written afresh on the
 * next send day with whatever came in by then (Shaun 11/22).
 */
async function sendReply(io: AshleyIO, item: Sendable, now: Date): Promise<SendOutcome> {
  const { store } = io;
  const held = item.check.status === "fail" ? `${CODE_REASON.preSend} · ${item.check.reasons.join(" · ")}`
    : !io.settings.replyAgentEnabled || !io.send ? CODE_REASON.replyOff : null;
  if (!held && (item.check.status === "wait" || !io.settings.windowOpen(now) || await mailedToday(io, item.to.email, now))) return "deferred";
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
  if (await mailedToday(io, item.to.email, now)) return { notSent: "오늘 이 주소로 Ashley 메일이 이미 나가서 보내지 않았어요 (하루 한 통)" };
  const parts = partsOf(item);
  const sent = await sendOnce(io, outgoing(io, parts, key));
  await recordSent(io, parts, item.to, sent);
  await io.slack(sentReplySlackText({ who: item.who, text: item.body, link: item.link }), item.slackPersonId).catch(() => undefined);
  return { providerId: sent.providerMessageId ?? "" };
}

/** An Ashley reply decided and queued in an earlier tick, not sent yet (the mail it answers comes with it). */
export type QueuedReply = Pick<
  ConversationMessage, "id" | "counterpartEmail" | "counterpartKind" | "personId" | "rootMailId" | "subject" | "bodyText" | "inReplyTo" | "references"
> & { inbound: Pick<ConversationMessage, "id" | "counterpartEmail" | "fromEmail" | "bodyText" | "occurredAt" | "decisionReason" | "rfcMessageId" | "personId"> };

/**
 * The replies whose sending was cut off (a crash between storing and sending): sent again as they were written, with
 * the same idempotency key (one that did go out is not sent twice), after the same last looks (opt-out list, a person's
 * answer, Ashley's one mail to the address that day). A reply to a polite decline stops contact once it went (as when
 * it is sent right away).
 */
export async function flushQueuedReplies(io: AshleyIO, limit: number, now = new Date()): Promise<Partial<Record<SendOutcome, number>>> {
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
    } else if (await mailedToday(io, row.counterpartEmail, now)) {
      outcome = "queued";
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

/** Why an inbound mail got no reply of its own: the same address wrote again, and one reply answered both. */
export const SUPERSEDED_REASON = "같은 분이 그 뒤에 다시 메일을 보내 두 메일에 한 번에 답했어요";

/** member_held: a member's earlier mail could not go to Harper (a person has it); the newer ones go next tick. */
export type MessageOutcome =
  | "member" | "member_held" | "human_answered" | "no_reply" | "stop" | "hand_to_human" | "budget" | "skipped" | "waiting_company" | SendOutcome;

/** Outcomes that leave the mail undecided (tried again later): the other mails answered with it stay open too. */
const LEFT_OPEN: ReadonlySet<MessageOutcome | "error"> = new Set(["budget", "skipped", "waiting_company", "deferred", "member_held", "error"]);

const whoOf = (person: Pick<AshleyPerson, "name"> | null, email: string) =>
  person?.name?.trim() && person.name.trim().toLowerCase() !== email ? `${person.name.trim()} <${email}>` : `<${email}>`;

async function decideAndAct(io: AshleyIO, message: ConversationMessage, decision: AshleyDecisionKind, reason: string, extra: { root?: AshleyMail | null; who: string; personId: string | null; stop?: { mailId: string | null; personId: string | null } }): Promise<MessageOutcome> {
  // A held agreement stays on the mail (the company-mail worker reads it); a stopped person is left out there anyway.
  await io.store.recordDecision(message.id, decision, reason, message.signals ?? []);
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

/**
 * A member's mails, oldest first, each to their Harper chat once and each decided 회원 (its signals stay, as everywhere
 * a mail is closed: an agreement in it still counts for the company mail). Every one goes, not only the newest (11/23:
 * an earlier one was closed as answered with the newest and never reached Harper). One that cannot go is handed to a
 * person; the newer ones stay undecided for the next tick (member_held: not closed with it).
 */
async function routeMemberMails(io: AshleyIO, mails: readonly ConversationMessage[], base: { root: AshleyMail | null; who: string; personId: string | null }): Promise<MessageOutcome> {
  const newest = mails[mails.length - 1];
  if (!io.routeToMember) return decideAndAct(io, newest, "hand_to_human", CODE_REASON.memberNoRoute, base);
  for (const mail of mails) {
    try {
      await io.routeToMember(mail);
    } catch (error) {
      const outcome = await decideAndAct(io, mail, "hand_to_human", `${CODE_REASON.member} · 하퍼로 넘기지 못했어요 · ${errorText(error)}`, base);
      return mail === newest ? outcome : "member_held";
    }
    await io.store.recordDecision(mail.id, "no_reply", CODE_REASON.member, mail.signals ?? []);
  }
  return "member";
}

/** A candidate's mail (earlier: their other mails since they were last answered, oldest first). */
async function candidateMail(io: AshleyIO, message: ConversationMessage, now: Date, earlier: readonly ConversationMessage[]): Promise<MessageOutcome> {
  const root = message.rootMailId ? await io.readMail(message.rootMailId) : null;
  const person = message.personId ? await io.readPerson(message.personId) : null;
  const who = whoOf(person, message.counterpartEmail);
  const base = { root, who, personId: message.personId };
  if (await io.isMember(message.counterpartEmail)) return routeMemberMails(io, [...earlier, message], base);
  // A person already answered this mail from the mailbox: it is done. A later mail is Ashley's again (Shaun 11/21 16:13:
  // one mail, one handling; a person's answer covers the mail it answered).
  if (root && await io.store.personAnswered(root.id, message.occurredAt)) {
    await io.store.recordDecision(message.id, "no_reply", CODE_REASON.humanAnswered, message.signals ?? []);
    return "human_answered";
  }
  if (!person || !root) return decideAndAct(io, message, "hand_to_human", CODE_REASON.noPerson, base);
  // Ashley already wrote to them today: their mails wait, unread by the model, for the next send day (one Ashley mail
  // per address a day, Shaun 11/22), and are then read and answered together.
  if (await mailedToday(io, root.toEmail, now)) return "deferred";
  // Waiting for the company mail its agreement started: nothing to read again until that mail went, can no longer
  // go, or the wait is over (no model call meanwhile).
  const mails = [...earlier, message];
  const since = heldSinceAll(mails);
  if (since && !waitedOut(since, now) && io.companyAsk) {
    const states = await Promise.all(mails.flatMap((mail) => mail.signals ?? []).filter((signal) => signal.summaryConsent && signal.heldAt)
      .map((signal) => io.companyAsk!({ postingUrl: signal.postingUrl, personId: person.id }).catch((): CompanyAsk => ({ state: "no" }))));
    if (states.some((state) => state.state === "can")) return "waiting_company";
  }
  if (io.maySpend && !(await io.maySpend())) return "budget";
  const draft = await draftCandidateReply(io, { message, earlier, person, root, now });
  if (draft.kind === "decided") {
    return decideAndAct(io, message, draft.action, draft.reason, { ...base, stop: { mailId: root.id, personId: person.id } });
  }
  if (draft.kind === "wait") {
    if (!since) await io.notePerson(person.id, ASHLEY_NOTE.waiting);
    await io.store.holdSignals(message.id, draft.signals);
    return "waiting_company";
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
  if (draft.searched) await io.notePerson(person.id, `${ASHLEY_NOTE.searched}${draft.link?.nextStep ?? "답장"}`, draft.found);
  // A polite decline was answered with "I won't write again": the address goes on the opt-out list (design 4장).
  // Queued: flushQueuedReplies stops contact once the reply went (the opt-out list would hold it back otherwise).
  if (draft.type === "mild_decline" && outcome === "sent") {
    await io.stopContact({ personId: person.id, mailId: root.id, email: message.counterpartEmail, note: "Ashley · 보통 거절에 한 번 답하고 연락 멈춤" });
  }
  return outcome;
}

// ---------------------------------------------------------------------------------------------------------------
// A company's reply to a company mail (design 5장 "회사가 답장하면")

async function companyMail(io: AshleyIO, message: ConversationMessage, now: Date, earlier: readonly ConversationMessage[]): Promise<MessageOutcome> {
  const root = message.rootMailId ? await io.readMail(message.rootMailId) : null;
  const company = root?.postings[0]?.companyName?.trim() || message.counterpartEmail.split("@")[1] || "";
  const who = `${company} <${message.counterpartEmail}>`;
  const base = { root, who, personId: null };
  if (!root) return decideAndAct(io, message, "hand_to_human", "회사 그 밖 · 이 답장의 회사 메일을 찾지 못했어요", base);
  if (await io.store.personAnswered(root.id, message.occurredAt)) {
    await io.store.recordDecision(message.id, "no_reply", CODE_REASON.humanAnswered, message.signals ?? []);
    return "human_answered";
  }
  const posting = root.postings[0] ?? null;
  const people = (await Promise.all(root.interestedPersonIds.slice(0, 10).map((id) => io.readPerson(id)))).filter((person): person is AshleyPerson => Boolean(person));
  // Any mail this answer may lead to (to the company, or a company's words to one of its candidates) is that address's
  // one Ashley mail of the day: when Ashley already wrote to any of them today, the company's mails wait, unread by the
  // model, for the next send day (Shaun 11/22). Checked before reading, so a waiting mail is never decided twice.
  for (const email of [root.toEmail, ...people.map((person) => person.email ?? "")]) {
    if (await mailedToday(io, email, now)) return "deferred";
  }
  if (io.maySpend && !(await io.maySpend())) return "budget";
  const mails = [...earlier, message];
  const signals = posting?.url ? await io.store.interestSignals({ postingUrl: posting.url }).catch(() => []) : [];
  const candidates = people.map((person, index) => ({
    label: `C${index + 1}`, person,
    question: signals.find((signal) => signal.personId === person.id && signal.question)?.question ?? null,
  }));
  const history = historyForMails(await io.store.history(message.counterpartEmail, { threadKey: root.id }), mails);
  let called: unknown = null;
  const result = await io.llm({
    label: "gtm-agent:ashley-company",
    system: [
      { key: "career_main", text: ASHLEY_COMPANY_PROMPT },
      { key: "ashley_context", text: companyContext({
        now, companyName: company, posting, history,
        candidates: candidates.map((item) => ({ label: item.label, question: item.question, line: null })),
        inbound: mails.map(inboundOf),
      }) },
    ],
    message: "Read the company's mail(s) to answer above: call decide.",
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
  const companyLanguage = languageOf(...mails.map(mailText), root.subject);
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
    // This mail's own relay (a tick died after claiming it): it is finished below, not answered as a later mail.
    if (!pair || !target || pair.inboundMessageId === message.id) return null;
    // After the candidate joined, "I'll connect you once they join" is no longer true: the company's word is its joined
    // mail (tellJoinedCompanies), and nothing more.
    if (pair.companyNotedAt || pair.joinedNotedAt) return decideAndAct(io, message, "no_reply", CODE_REASON.relayDone, base);
    const body = [copy.companyGreeting(company || null), ...copy.companyAfterRelay];
    const outcome = await replyToCompany(body, null, `${reason} · 중계 뒤 한 번 답함`, companyCheck(body));
    if (outcome === "sent" || outcome === "queued") await io.relays.mark(message.counterpartEmail, target.person.id, "company_noted_at");
    return outcome;
  };
  const after = await companyAfterRelay();
  if (after) return after;

  // Why a candidate cannot hear from Ashley by mail (a member is not one of these: see joinedReply).
  const candidateBlocked = async (person: AshleyPerson) => {
    if (!person.email || !person.mailId) return "후보의 메일 주소나 첫 메일이 없어요";
    if (await io.isSuppressed(person.email)) return "후보가 연락 받지 않기 목록에 있어요";
    if (await io.store.personAnswered(person.mailId, message.occurredAt)) return "이 회사 메일이 온 뒤 사람이 후보에게 직접 답했어요";
    return null;
  };

  // The candidate is already on Harper (the reverse order: they joined before the company answered, Shaun 11/22 16:10).
  // Nothing goes to them by mail, and nothing to the company from here: the company's words (an answer) go once into
  // the member's Harper chat as they are, the pair is claimed and marked joined, and the company's mail is closed
  // without a reply of its own. Its one mail is the joined mail, sent by tellJoinedCompanies (the one sender: it waits
  // for a company mail of the day, and stops after a spam complaint), so neither the sign-up path nor a later company
  // mail sends it again. No hand-off. The words are written before the claim: a failure leaves the mail undecided and
  // the pair free, and the next tick reads it again (the message's key keeps it to one).
  // The pair's marks: joined_noted_at, then candidate_noted_at when the words went into their chat (a relay to a member
  // is the one whose candidate_noted_at is at or after its joined_noted_at: a candidate not on Harper is noted before).
  const member = Boolean(target?.person.email) && await io.isMember(target!.person.email!);
  const joinedReply = async (person: AshleyPerson, kind: RelayRow["kind"], words: string | null): Promise<MessageOutcome> => {
    if (words && !io.tellMember) {
      return decideAndAct(io, message, "hand_to_human", `${reason} · 후보가 이미 Harper 회원인데 회사의 답을 하퍼 대화로 넘길 길이 없어요`, base);
    }
    if (words) {
      const latest = await io.latestInbound(person.id);
      try {
        await io.tellMember!({
          personId: person.id, key: `${message.counterpartEmail}|${person.id}`,
          relay: { companyEmail: message.counterpartEmail, personId: person.id, inboundMessageId: message.id },
          content: memberAnswerContent({
            language: person.language ?? languageOf(latest ? mailText(latest) : ""), companyName: posting?.companyName?.trim() || company || null,
            postingTitle: posting?.title ?? null, words,
          }),
        });
      } catch (error) {
        // Not written: the mail stays undecided and the next tick reads it again, MEMBER_TELL_TRIES ticks at most (each
        // try a line on the candidate's timeline); then a person takes the company's mail, and the pair stays free.
        const tried = person.events.filter((event) => event.kind === "note" && Boolean(event.note?.startsWith(ASHLEY_NOTE.memberRelayFailed))
          && Boolean(event.note?.endsWith(` · ${message.id}`))).length;
        await io.notePerson(person.id, `${ASHLEY_NOTE.memberRelayFailed}${company || "회사"} · ${message.id}`);
        if (tried + 1 < MEMBER_TELL_TRIES) throw error;
        return decideAndAct(io, message, "hand_to_human",
          `${reason} · 후보가 이미 Harper 회원인데 회사의 답을 하퍼 대화에 ${MEMBER_TELL_TRIES}번 넣지 못했어요. 후보에게 전해 주세요 · ${errorText(error)}`, base);
      }
    }
    const claimed = await io.relays.claim({ companyEmail: message.counterpartEmail, personId: person.id, kind, companyMailId: root.id, inboundMessageId: message.id });
    // Claimed by this very mail before a tick died: its marks are finished now.
    if (!claimed && (await io.relays.get(message.counterpartEmail, person.id))?.inboundMessageId !== message.id) {
      return decideAndAct(io, message, "no_reply", CODE_REASON.relayDone, base);
    }
    await io.relays.mark(message.counterpartEmail, person.id, "joined_noted_at");
    if (words) {
      if (await io.relays.mark(message.counterpartEmail, person.id, "candidate_noted_at")) await io.notePerson(person.id, `${ASHLEY_NOTE.memberRelay}${company || "회사"}`);
    }
    return decideAndAct(io, message, "no_reply", `${reason} · ${CODE_REASON.memberJoined}`, base);
  };

  if (decision.type === "answer") {
    if (!target || !decision.relayText || !mails.some((mail) => verbatimIn(decision.relayText!, mailText(mail)))) {
      return decideAndAct(io, message, "hand_to_human", `${reason} · 어느 후보의 질문에 대한 답인지, 회사 글 그대로인지 확인하지 못했어요`, base);
    }
    if (member) return joinedReply(target.person, "answer", decision.relayText.trim());
    const blocked = await candidateBlocked(target.person);
    if (blocked) return decideAndAct(io, message, "hand_to_human", `${reason} · ${blocked}`, base);
    const relayText = decision.relayText.trim();
    const relayed = await relayToCandidate(io, {
      message, root, person: target.person, company, now, reason, kind: "answer",
      body: (language) => [ASHLEY_COPY[language].greeting(target.person.name), ...ASHLEY_COPY[language].relay(company), `"${relayText}"`, ...ASHLEY_COPY[language].relayAfter],
    });
    return relayed === "taken" ? decideAndAct(io, message, "no_reply", CODE_REASON.relayDone, base) : relayed;
  }

  // wants_more: the company gets its link; a candidate not on Harper is told the company wants to talk, a member's
  // company gets the joined mail.
  if (target && member) return joinedReply(target.person, "wants_more", null);
  const companyLink = { label: copy.companyLinkLabel, url: companyLandingLink(io.settings.origin, root.id) };
  const companyBody = [copy.companyGreeting(company || null), ...copy.companyLink];
  const blocked = target ? await candidateBlocked(target.person) : "어느 후보인지 알 수 없어요";
  const outcome = target && !blocked ? await relayToCandidate(io, {
    message, root, person: target.person, company, now, reason, kind: "wants_more",
    body: (language) => [ASHLEY_COPY[language].greeting(target.person.name), ...ASHLEY_COPY[language].wantsToTalk(company)],
  }) : "taken";
  if (outcome === "taken") {
    // No candidate to tell (none named, opted out, a person answered them): the company's link is the one reply.
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
  // It cannot go now (the hours closed, or Ashley wrote to the candidate today): the company's mail waits undecided,
  // with the pair not claimed, for the next send day.
  if (check.status === "wait" || await mailedToday(io, candidateRoot.toEmail, args.now)) return "deferred";
  // The pair's one relay (claimed before anything is recorded; a second worker or a later mail finds it taken).
  const claimed = await io.relays.claim({
    companyEmail: args.message.counterpartEmail, personId: person.id, kind: args.kind, companyMailId: args.root.id, inboundMessageId: args.message.id,
  });
  // Claimed by this very mail in a tick that died before its reply was queued: the relay is sent now (store.queueReply
  // keeps it to one reply for the mail: "already" when it was queued after all).
  if (!claimed && (await io.relays.get(args.message.counterpartEmail, person.id))?.inboundMessageId !== args.message.id) return "taken";
  return sendReply(io, {
    message: args.message, root: candidateRoot, language, body: body.join("\n\n"), link, quote: false, check,
    to: { email: candidateRoot.toEmail, kind: "candidate", personId: person.id, rootMailId: candidateRoot.id },
    thread: { subject: latest?.subject ?? candidateRoot.subject, rfcMessageId: latest?.rfcMessageId ?? candidateRoot.rfcMessageId, references: latest?.references ?? null },
    decision: { reason: args.reason, signals: [] }, who, slackPersonId: person.id,
  }, args.now);
}

/** Why Ashley did not tell a candidate about a company's connection request herself (a person takes it). */
function introBlocked(args: { person: AshleyPerson | null; companyMail: AshleyMail | null; candidateRoot: AshleyMail | null }) {
  if (!args.person?.email || !args.candidateRoot) return "후보의 메일 주소나 첫 메일이 없어요";
  if (!args.companyMail) return "회사 메일을 찾지 못했어요";
  return null;
}

/** The candidate cannot be reached by mail: opted out, or a mail to them bounced (the shared list, or their timeline). */
async function unreachableBy(io: AshleyIO, person: AshleyPerson): Promise<boolean> {
  return person.events.some((event) => event.kind === "unsubscribed" || event.kind === "bounced") || await io.isSuppressed(person.email ?? "");
}

/**
 * A company asked to be connected with one of Ashley's 외부 후보 candidates (Shaun 11/22 16:10, "표처럼 바꾸기"):
 * - not on Harper: Ashley tells the candidate in her thread with them, in fixed words ("{회사}에서 이야기를 나눠 보고
 *   싶어 해요. Harper에 가입하시면 제가 회사와 이어드릴게요." and the sign-up link that continues to the connection),
 *   once per company and candidate (gtm_agent_relays, as a company's wish to talk by mail). After it, the candidate's
 *   mails get the relay's one fixed answer, and when they join the request goes on as Harper's connection request for
 *   a member (tellJoinedCompanies). A person's answer in their thread since the request does not stop it (11/21: a
 *   person's answer covers only the mail it answered);
 * - already a member: Harper's own connection request for a member (requestMemberIntro): the candidate gets it inside
 *   Harper. It waits (at most MEMBER_INTRO_WAIT_MS) while the member is evaluated for the company's Role. A request
 *   that failed with an error is made again by finishIntroEnds (then a person); one that cannot be made goes to a person;
 * - opted out or bounced, or the send failed twice (once more the next send day): the request's credit goes back and the
 *   company is told in its hiring conversation that the candidate cannot be contacted now, with two real next steps and
 *   never why (closeCompanyIntroAsk unreachable: externalInvite.server.ts notifyOutcome);
 * - anything else that stops it (no person or thread found, a fixed-copy check, an earlier relay by mail) goes to a
 *   person. With the agent off on /ops it waits, as every Ashley mail does.
 */
type IntroOutcome = "sent" | "held" | "failed" | "later" | "cancelled" | "member" | "member_retry" | "unreachable";

async function tellCompanyIntroAsk(io: AshleyIO, ask: CompanyIntroAsk, now: Date): Promise<IntroOutcome> {
  const person = await io.readPerson(ask.personId);
  const companyMail = ask.companyMailId ? await io.readMail(ask.companyMailId) : null;
  const candidateRoot = person?.mailId ? await io.readMail(person.mailId) : null;
  const posting = companyMail?.postings[0] ?? null;
  const company = posting?.companyName?.trim() || "";
  const who = whoOf(person, person?.email ?? "");
  const why = "회사가 Harper에서 이 후보에게 연결을 요청했어요";
  const hold = async (reason: string, extra: { draft?: string; link?: { label: string; url: string } | null } = {}) => {
    await io.closeCompanyIntroAsk?.(ask.id, { told: false, reason });
    await handOff(io, { personId: person?.id ?? null, counterpartEmail: person?.email ?? "", rfcMessageId: null }, `${why} · ${reason}`, {
      ...extra, root: candidateRoot, who, personId: person?.id ?? null,
    });
    return "held" as const;
  };
  const later = async (end: { retryAt?: string; failed?: string } = {}) => {
    await io.closeCompanyIntroAsk?.(ask.id, { later: true, ...end });
    return "later" as const;
  };
  const blocked = introBlocked({ person, companyMail, candidateRoot });
  if (blocked || !person || !candidateRoot || !companyMail) return hold(blocked ?? "후보를 찾지 못했어요");
  const email = person.email ?? "";
  const unreachable = async (note: string) => {
    await io.closeCompanyIntroAsk?.(ask.id, { unreachable: true });
    await io.notePerson(person.id, `${ASHLEY_NOTE.unreachable}${company || "회사"}`);
    await io.slack(noteSlackText(who, `${why}. ${note}: 크레딧을 돌려주고 회사 대화에 "지금 연락할 수 없어요"라고 알렸어요`), person.id).catch(() => undefined);
    return "unreachable" as const;
  };

  if (await io.isMember(email)) {
    if (!io.requestMemberIntro) return hold("후보가 이미 Harper 회원이에요. 회원 연결로 이어 주세요");
    const handed = await io.requestMemberIntro({ introRequestId: ask.id, companyMailId: companyMail.id, personId: person.id });
    if (handed.state === "requested") {
      await io.notePerson(person.id, `${ASHLEY_NOTE.memberIntro}${company || "회사"}`);
      await io.slack(noteSlackText(who, `${why}. 이미 Harper 회원이라 Harper 회원 연결 요청으로 넘겼어요 (후보는 Harper 안에서 받아요)`), person.id).catch(() => undefined);
      return "member";
    }
    // Closed for the member request, Harper's request failed (an error): finishIntroEnds makes it again, then a person.
    if (handed.state === "retry") {
      await io.slack(noteSlackText(who, `${why}. 이미 Harper 회원이라 Harper 회원 연결 요청으로 넘기는데, 요청이 한 번 실패해 다시 해요 · ${handed.reason}`), person.id).catch(() => undefined);
      return "member_retry";
    }
    // Being evaluated for, or written into, the company's Role: the next ticks look again.
    if (handed.state === "waiting" && now.getTime() - Date.parse(ask.requestedAt) < MEMBER_INTRO_WAIT_MS) return later();
    return hold(`후보가 이미 Harper 회원인데 회원 연결 요청으로 넘기지 못했어요 · ${handed.state === "waiting" ? "회사 역할에 올라오지 않았어요" : handed.reason}`);
  }
  if (await unreachableBy(io, person)) return unreachable("후보가 연락 받지 않기 목록에 있거나 메일이 반송됐어요");

  const latest = await io.latestInbound(person.id);
  const language: AshleyLanguage = person.language ?? languageOf(latest ? mailText(latest) : "");
  const copy = ASHLEY_COPY[language];
  const body = [copy.greeting(person.name), ...copy.wantsToTalk(company || "Harper")].join("\n\n");
  const link = {
    label: copy.relayLabel(company || "Harper"),
    url: ashleySignupLink({ origin: io.settings.origin, rootMailId: candidateRoot.id, next: "connect_request", posting }),
  };
  // Off on /ops: it waits, like every Ashley mail (taken again once the agent is on). No sender (the replay): a person.
  if (!io.settings.replyAgentEnabled) return later();
  if (!io.send) return hold(CODE_REASON.replyOff, { draft: body, link });
  // A person's answer in the candidate's thread does not stop it: it covered only the mail it answered (11/21).
  const check = checkBeforeSend({
    draft: body, postingTexts: [], fixedCopy: true, suppressed: false, windowOpen: io.settings.windowOpen(now), personAnswered: false,
  });
  if (check.status === "fail") return hold(check.reasons.join(" · "), { draft: body, link });
  // Outside the sending hours, or Ashley already wrote to them today (one Ashley mail per address a day): a later open
  // tick takes it again.
  if (check.status === "wait" || await mailedToday(io, candidateRoot.toEmail, now)) return later();
  // The pair's one relay: a company that already reached this candidate by mail has been told about already. (The
  // request itself is taken by one tick only, so the pair is recorded once the mail went.)
  if (await io.relays.get(companyMail.toEmail, person.id)) {
    return hold("이 회사의 말은 이미 메일로 후보에게 한 번 전했어요. 이어서는 사람이 알려 주세요", { draft: body, link });
  }
  const parts: MailParts = {
    root: candidateRoot, language, body, link, subject: replySubject(latest?.subject ?? candidateRoot.subject, candidateRoot.subject),
    rfcMessageId: latest?.rfcMessageId ?? candidateRoot.rfcMessageId, references: latest?.references ?? null, quote: null,
  };
  // The company may have passed on the person since the request was taken: then nothing goes.
  if (io.companyIntroStillWanted && !(await io.companyIntroStillWanted(ask.id))) return "cancelled";
  let sent: Awaited<ReturnType<typeof sendOnce>>;
  try {
    sent = await sendOnce(io, outgoing(io, parts, `gtm-agent-company-intro:${ask.id}`));
  } catch (error) {
    // Once more the next send day (same key: a send that did go is not sent twice); a second failure is the last row.
    if ((ask.failedSends ?? 0) < 1) {
      await later({ retryAt: kstDayWindow(now).end, failed: `${CODE_REASON.sendFailed} · ${errorText(error)}` });
      return "failed";
    }
    return unreachable(`보내기가 두 번 실패했어요 (${errorText(error)})`);
  }
  await recordSent(io, parts, { email: candidateRoot.toEmail, kind: "candidate", personId: person.id, rootMailId: candidateRoot.id }, sent);
  await io.relays.claim({ companyEmail: companyMail.toEmail, personId: person.id, kind: "wants_more", companyMailId: companyMail.id, inboundMessageId: null });
  await io.closeCompanyIntroAsk?.(ask.id, { told: true, providerId: sent.providerMessageId });
  await io.notePerson(person.id, `${ASHLEY_NOTE.companyIntro}${company || "회사"}`);
  await io.slack(sentReplySlackText({ who, text: body, link }), person.id).catch(() => undefined);
  return "sent";
}

/** The connection requests companies made on Ashley's 외부 후보 cards since the last tick (one mail each). */
export async function tellCompanyIntroAsks(io: AshleyIO, now: Date, limit: number, deadline?: number): Promise<Partial<Record<IntroOutcome, number>>> {
  const counts: Partial<Record<IntroOutcome, number>> = {};
  // More are taken than the tick's places: an ask put back for the next day ("later", Ashley already wrote to that
  // candidate today) takes no place, so it does not hold newer asks back all day (review 11/22). The ones not reached
  // (the places are full, or the tick's time is up) are put back at once.
  const asks = (await io.companyIntroAsks?.(limit * WAITING_FETCH_FACTOR)) ?? [];
  let handled = 0;
  for (const [index, ask] of asks.entries()) {
    if (handled >= limit || (deadline && Date.now() > deadline)) {
      for (const rest of asks.slice(index)) await io.closeCompanyIntroAsk?.(rest.id, { later: true }).catch(() => undefined);
      break;
    }
    let outcome: IntroOutcome;
    try {
      outcome = await tellCompanyIntroAsk(io, ask, now);
    } catch (error) {
      // Closed as handed off: a person is told, as for every other hand-off (never a silent end).
      const reason = `회사가 Harper에서 이 후보에게 연결을 요청했어요 · 처리 중 오류 · ${errorText(error)}`;
      await io.closeCompanyIntroAsk?.(ask.id, { told: false, reason }).catch(() => undefined);
      await handOff(io, { personId: ask.personId, counterpartEmail: "", rfcMessageId: null }, reason, { personId: ask.personId }).catch(() => undefined);
      outcome = "failed";
    }
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    if (outcome !== "later") handled += 1;
  }
  return counts;
}

/**
 * The ends of companies' requests that a tick left unfinished, within the tick's time:
 * - a member request whose external request was closed for it but never confirmed made (an error, or a tick that died):
 *   made again, MEMBER_INTRO_TRIES at most, then a person takes it. One the company passed on meanwhile stops quietly;
 *   one that can never be made (the candidate opted out, no card) goes to a person at once;
 * - an unreachable notice that failed after its request was closed: sent again, UNREACHABLE_NOTICE_TRIES at most (the
 *   first at the close), then a person tells the company (once);
 * - a member's chat message whose Career run was not made: made now (finishMemberNotices).
 */
export async function finishIntroEnds(io: AshleyIO, limit: number, deadline?: number) {
  const counts = { done: 0, retry: 0, stopped: 0, handed_off: 0, notices: 0, notice_retry: 0, notice_handed_off: 0, member_notices: 0 };
  const late = () => Boolean(deadline && Date.now() > deadline);
  for (const item of (await io.unfinishedMemberIntros?.(limit)) ?? []) {
    if (late()) break;
    type Finished = Awaited<ReturnType<NonNullable<AshleyIO["finishMemberIntro"]>>>;
    const finished: Finished = item.tries < MEMBER_INTRO_TRIES && io.finishMemberIntro
      ? await io.finishMemberIntro(item.id).catch((error): Finished => ({ done: false, reason: errorText(error) }))
      : { done: false, reason: "회원 연결 요청을 확인하지 못했어요" };
    if (finished.done) {
      counts.done += 1;
      continue;
    }
    if (finished.stop === "quiet") {
      await io.giveUpMemberIntro?.(item.id, finished.reason);
      counts.stopped += 1;
      continue;
    }
    if (!finished.stop && item.tries + 1 < MEMBER_INTRO_TRIES && io.finishMemberIntro) {
      counts.retry += 1;
      continue;
    }
    await io.giveUpMemberIntro?.(item.id, finished.reason);
    await handOff(io, { personId: item.personId, counterpartEmail: "", rfcMessageId: null },
      `회사의 Harper 연결 요청을 회원 연결 요청으로 넘기다 멈췄어요. 회사의 연결 요청을 직접 이어 주세요 · ${finished.reason}`, { personId: item.personId });
    counts.handed_off += 1;
  }
  for (const notice of late() ? [] : (await io.unreachableNotices?.(limit)) ?? []) {
    if (late()) break;
    let reason = "회사에 알림을 보내지 못했어요";
    if (notice.tries < UNREACHABLE_NOTICE_TRIES && io.sendUnreachableNotice) {
      try {
        await io.sendUnreachableNotice(notice.id);
        counts.notices += 1;
        continue;
      } catch (error) {
        reason = errorText(error);
      }
      if (notice.tries + 1 < UNREACHABLE_NOTICE_TRIES) {
        counts.notice_retry += 1;
        continue;
      }
    }
    await io.giveUpUnreachableNotice?.(notice.id, reason);
    await handOff(io, { personId: notice.personId, counterpartEmail: "", rfcMessageId: null },
      `회사가 Harper에서 연결을 요청한 후보에게 연락할 수 없어 크레딧은 돌려줬지만, 회사 대화에 알리지 못했어요 (${UNREACHABLE_NOTICE_TRIES}번). 회사에 알려 주세요 · ${reason}`,
      { personId: notice.personId });
    counts.notice_handed_off += 1;
  }
  if (!late()) counts.member_notices = (await io.finishMemberNotices?.(limit)) ?? 0;
  return counts;
}

// ---------------------------------------------------------------------------------------------------------------
// The candidate joined Harper after a company's words or wish to talk reached them (Shaun 11/22 16:08)

/**
 * The joined mail: the company's greeting, the two fixed lines and its /org link (companyLandingLink). The company's name
 * is left out of the greeting when it would fail the fixed-copy check (a name that reads as a domain).
 */
function joinedMail(io: AshleyIO, args: { language: AshleyLanguage; companyName: string | null; companyMailId: string; now: Date; suppressed: boolean }) {
  const copy = ASHLEY_COPY[args.language];
  const link = { label: copy.companyLinkLabel, url: companyLandingLink(io.settings.origin, args.companyMailId) };
  const check = (body: string[]) => checkBeforeSend({
    draft: body.join("\n\n"), postingTexts: [], fixedCopy: true, suppressed: args.suppressed, windowOpen: io.settings.windowOpen(args.now), personAnswered: false,
  });
  const named = [copy.companyGreeting(args.companyName), ...copy.companyJoined];
  const namedCheck = check(named);
  if (namedCheck.status !== "fail" || !args.companyName || args.suppressed) return { body: named, link, check: namedCheck };
  const plain = [copy.companyGreeting(null), ...copy.companyJoined];
  return { body: plain, link, check: check(plain) };
}

export type JoinedOutcome = "sent" | "member" | "member_retry" | "later" | "not_sent" | "failed" | "handed_off";

/** The failed sends of a pair's joined mail since the join (ASHLEY_NOTE.joinedFailed lines naming its company mail). */
export function joinedFailures(events: readonly AgentEvent[], companyMailId: string, joinedAt: string | null | undefined): AgentEvent[] {
  const since = joinedAt ? Date.parse(joinedAt) : Number.NEGATIVE_INFINITY;
  return events.filter((event) => event.kind === "note" && Boolean(event.note?.startsWith(ASHLEY_NOTE.joinedFailed))
    && Boolean(event.note?.endsWith(` · ${companyMailId}`)) && Date.parse(event.at) >= since);
}

/**
 * The pairs whose candidate joined Harper: the sign-up hook records it (ashleyHandoff.server.ts noteJoinedRelays), and
 * the tick finds the rest (a member now, signed up on their own: RelayStore.noteMemberJoins). No person is needed
 * (Shaun 11/22 16:08). For each, one per company mail and candidate, inside the sending hours:
 * - a pair from a company's connection request on Harper: the company already asked to connect, so it goes on as
 *   Harper's connection request for a member (requestMemberIntro), which ends the pair's joined step (JOINED_MEMBER:
 *   no joined mail from any address; one that failed with an error is made again by finishIntroEnds). If it cannot
 *   (the member never comes into the company's Role), that request is closed and its credit given back, and the
 *   company gets the joined mail instead (it asks, and pays, on Harper itself);
 * - otherwise the company gets ONE mail in its thread (the company's mail the relay came from): "the candidate you
 *   asked about joined Harper; you can ask to be connected here" with its /org link, its own mail (16:15: not merged
 *   into another). This is its one sender: a company that answered after the join gets this mail too (companyMail).
 *   A company on Harper from that mail also gets the member in its Role's "연결을 요청할 후보" (placeMember).
 *   It waits for the next send day when Ashley already wrote to that address today or a company mail went to that
 *   company or address today, and while company mails are stopped (a spam complaint). A pair that can never get it (an
 *   opted-out address, no company mail of Ashley's) is ended (JOINED_NOT_SENT). A thread a person answered is theirs: they are told the candidate joined, once (a hand-off). The pair
 *   is claimed before the mail goes (RelayStore.claimJoined), the mail is recorded as sent (the address's mail of the
 *   day) with one idempotency key, so it goes at most once. A failed send is tried once more on a later send day, then
 *   a person is told (JOINED_TRIES); failures and waits take no place from newer pairs.
 */
export async function tellJoinedCompanies(io: AshleyIO, now: Date, limit: number, deadline?: number): Promise<Partial<Record<JoinedOutcome, number>>> {
  const counts: Partial<Record<JoinedOutcome, number>> = {};
  await io.relays.noteMemberJoins?.().catch((error) => console.error("[gtm-agent] member joins not noted", errorText(error)));
  const pairs = (await io.relays.joinedToTell?.(limit * WAITING_FETCH_FACTOR)) ?? [];
  let handled = 0;
  for (const pair of pairs) {
    if (handled >= limit || (deadline && Date.now() > deadline)) break;
    let outcome: JoinedOutcome;
    try {
      outcome = await tellJoinedCompany(io, pair, now);
    } catch (error) {
      console.error("[gtm-agent] joined mail failed", pair.companyEmail, pair.personId, errorText(error));
      outcome = "failed";
    }
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    if (outcome === "sent" || outcome === "member" || outcome === "member_retry" || outcome === "handed_off") handled += 1;
  }
  return counts;
}

async function tellJoinedCompany(io: AshleyIO, pair: JoinedPair, now: Date): Promise<JoinedOutcome> {
  // The pair's joined step ends without a mail (all its addresses), so it is not listed again in front of newer pairs.
  const end = async (how: typeof JOINED_MEMBER | typeof JOINED_NOT_SENT) => {
    if (await io.relays.claimJoined?.(pair)) await io.relays.endJoined?.(pair, how);
  };
  const root = await io.readMail(pair.companyMailId);
  if (!root || root.audience !== "company") {
    console.warn("[gtm-agent] joined pair without its company mail: ended", pair.companyMailId, pair.personId);
    await end(JOINED_NOT_SENT);
    return "not_sent";
  }
  const companyName = root.postings[0]?.companyName?.trim() || null;
  const joinedAt = Date.parse(pair.joinedNotedAt ?? pair.createdAt);
  if (pair.introRequestId && io.requestMemberIntro) {
    const handed = await io.requestMemberIntro({ introRequestId: pair.introRequestId, companyMailId: root.id, personId: pair.personId });
    // Harper's member request is the company's word (made, or made again by finishIntroEnds): no joined mail, from any
    // address the company wrote from.
    if (handed.state === "requested" || handed.state === "retry") {
      await end(JOINED_MEMBER);
      if (handed.state === "retry") return "member_retry";
      await io.notePerson(pair.personId, `${ASHLEY_NOTE.memberIntro}${companyName || "회사"}`);
      return "member";
    }
    if (handed.state === "waiting" && now.getTime() - joinedAt < MEMBER_INTRO_WAIT_MS) return "later";
    // No member request can be made (not placed in the Role in time, or not at all): the joined mail instead.
  }
  if (!io.send || !io.settings.replyAgentEnabled || !io.settings.windowOpen(now)) return "later";
  const address = root.toEmail.trim().toLowerCase();
  const who = `${companyName ?? ""} <${address}>`.trim();
  if (await io.isSuppressed(address)) {
    await end(JOINED_NOT_SENT);
    return "not_sent";
  }
  // Company mails stopped after a spam complaint: it waits (they may go again).
  if (await io.companyMailsStopped?.()) return "later";
  const person = await io.readPerson(pair.personId);
  const failures = joinedFailures(person?.events ?? [], root.id, pair.joinedNotedAt);
  // One more try on a later send day after a failed one.
  if (failures.length && kstDayWindow(new Date(failures[failures.length - 1].at)).start === kstDayWindow(now).start) return "later";
  const thread = { rfcMessageId: pair.thread?.rfcMessageId ?? root.rfcMessageId };
  const handOver = async (reason: string) => {
    if (!(await io.relays.claimJoined?.(pair))) return "not_sent" as const;
    await io.relays.endJoined?.(pair, JOINED_HANDED_OFF);
    await handOff(io, { personId: pair.personId, counterpartEmail: address, rfcMessageId: thread.rfcMessageId },
      `후보가 Harper에 가입했어요 · ${reason}`, { root, who, personId: pair.personId });
    return "handed_off" as const;
  };
  // A person answered the company's thread: it is theirs now; they are told the candidate joined (once).
  if (await io.store.personAnswered(root.id, pair.createdAt)) {
    return handOver("사람이 이 회사 스레드에 답해서 Ashley는 가입 소식 메일을 보내지 않았어요. 회사에 알려 주세요");
  }
  if (await mailedToday(io, address, now) || await io.companyMailedToday?.({ companyName: companyName ?? "", toEmail: address }, now)) return "later";
  const language: AshleyLanguage = root.language ?? languageOf(pair.thread?.subject, root.subject);
  const joined = joinedMail(io, { language, companyName, companyMailId: root.id, now, suppressed: false });
  if (joined.check.status === "wait") return "later";
  if (joined.check.status === "fail") return handOver(`가입 소식 메일이 점검을 통과하지 못했어요 · ${joined.check.reasons.join(" · ")}`);
  // The pair's one joined step, claimed before anything goes (a company that wrote from two addresses is one pair).
  if (!(await io.relays.claimJoined?.(pair) ?? true)) return "not_sent";
  const parts: MailParts = {
    root, language, body: joined.body.join("\n\n"), link: joined.link,
    subject: replySubject(pair.thread?.subject ?? root.subject, root.subject),
    rfcMessageId: thread.rfcMessageId, references: pair.thread?.references ?? null, quote: null,
  };
  try {
    // The joined mail instead of a member request: the company's request on Harper is closed first, its credit back.
    if (pair.introRequestId) await io.closeIntroForJoinedLink?.(pair.introRequestId);
  } catch (error) {
    await io.relays.releaseJoined?.(pair);
    throw error;
  }
  await io.placeMember?.({ companyMailId: root.id, personId: pair.personId }).catch(() => "none");
  let sent: Awaited<ReturnType<typeof sendOnce>>;
  try {
    sent = await sendOnce(io, outgoing(io, parts, `gtm-agent-company-joined:${root.id}:${pair.personId}`));
  } catch (error) {
    await io.notePerson(pair.personId, `${ASHLEY_NOTE.joinedFailed}${companyName || "회사"} · ${root.id}`);
    if (failures.length + 1 >= JOINED_TRIES) {
      await io.relays.endJoined?.(pair, JOINED_GAVE_UP);
      await handOff(io, { personId: pair.personId, counterpartEmail: address, rfcMessageId: thread.rfcMessageId },
        `후보가 Harper에 가입했는데 회사에 보낼 가입 소식 메일이 ${JOINED_TRIES}번 실패했어요. 회사에 알려 주세요 · ${errorText(error)}`,
        { root, who, personId: pair.personId, draft: parts.body, link: parts.link });
    } else {
      await io.relays.releaseJoined?.(pair);
    }
    return "failed";
  }
  await io.relays.endJoined?.(pair, sent.providerMessageId ?? JOINED_SENT);
  await recordSent(io, parts, { email: address, kind: "company", personId: null, rootMailId: root.id }, sent);
  await io.notePerson(pair.personId, `${ASHLEY_NOTE.companyJoined}${companyName || "회사"}`);
  await io.slack(sentReplySlackText({ who, text: parts.body, link: parts.link }), pair.personId).catch(() => undefined);
  return "sent";
}

/**
 * One inbound mail, whoever it is from (earlier: the same address's other undecided mails, oldest first, answered with
 * it; the caller closes them once this one is decided).
 */
export async function processAshleyMessage(
  io: AshleyIO, message: ConversationMessage, now: Date, earlier: readonly ConversationMessage[] = [],
): Promise<MessageOutcome> {
  if (message.direction !== "inbound" || message.author !== "counterpart" || message.decision) return "skipped";
  return message.counterpartKind === "company" ? companyMail(io, message, now, earlier) : candidateMail(io, message, now, earlier);
}

const addressOf = (message: Pick<ConversationMessage, "counterpartEmail">) => message.counterpartEmail.trim().toLowerCase();

/** Whether this mail has a decision in the store now (read again after a failure). */
async function decidedNow(io: AshleyIO, message: ConversationMessage): Promise<boolean> {
  const open = await io.store.listUndecidedInbound(UNDECIDED_PER_ADDRESS, { counterpartEmail: addressOf(message) });
  return !open.some((item) => item.id === message.id);
}

/**
 * Every undecided mail of this message's address, oldest first (never another address's: histories are never mixed).
 * The newest is the one answered; the reply reads them all.
 */
async function undecidedMailsOf(io: AshleyIO, message: ConversationMessage, batch: readonly ConversationMessage[]): Promise<ConversationMessage[]> {
  const address = addressOf(message);
  const found = await io.store.listUndecidedInbound(UNDECIDED_PER_ADDRESS, { counterpartEmail: address });
  const byId = new Map([...batch, ...found].map((item) => [item.id, item]));
  byId.set(message.id, message);
  return [...byId.values()]
    .filter((item) => addressOf(item) === address && item.direction === "inbound" && item.author === "counterpart" && !item.decision
      && item.counterpartKind === message.counterpartKind)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.createdAt.localeCompare(b.createdAt));
}

// ---------------------------------------------------------------------------------------------------------------
// A tick

export type AshleyTick = {
  ran: boolean;
  reason?: string;
  /** Replies queued in an earlier tick, sent (or held) now. */
  flushed?: Partial<Record<SendOutcome, number>>;
  /** Companies' connection requests on Ashley's 외부 후보 cards: told, handed to Harper's member request, given back, or to a person. */
  companyIntros?: Partial<Record<IntroOutcome, number>>;
  /** Candidates who joined Harper after a company's words reached them: the company told (or its request handed on). */
  joined?: Partial<Record<JoinedOutcome, number>>;
  /** Companies' requests a tick left unfinished (finishIntroEnds), when there were any. */
  introEnds?: Awaited<ReturnType<typeof finishIntroEnds>>;
  /** Members' mails routed to Harper before the sending-hours check (at any hour), by outcome. */
  members?: Partial<Record<MessageOutcome | "error", number>>;
  /** Ashley's mails that told members Harper answered in the chat, and the routed mails still waiting for it. */
  memberRedirects?: Partial<Record<MemberRedirectOutcome, number>>;
  outcomes: Partial<Record<MessageOutcome | "error", number>>;
  errors: string[];
};

// ---------------------------------------------------------------------------------------------------------------
// Members' mails: to Harper at once, then one Ashley mail in their thread once Harper's answer is there

/** A routed member mail as memberRedirects reads it (AshleyIO.memberRedirects). */
export type MemberRedirect = {
  inbound: ConversationMessage;
  /** The member's Harper account, the chat the mail went into and its row there. */
  userId: string;
  conversationId: string;
  chatMessageId: string;
  /** When it went into the chat. */
  routedAt: string;
  /** That turn ended and answered it in the chat (its words, or a card for the person to confirm a step). */
  harperAnswered: boolean;
};

/** How long a routed mail is still followed (Harper's answer awaited, Ashley's mail sent). */
export const MEMBER_REDIRECT_DAYS = 7;
export type MemberRedirectOutcome = "sent" | "waiting_harper" | "deferred" | "skipped" | "failed";

/**
 * The undecided mails of members, oldest first, at any hour (routing sends nothing; Shaun 11/23 "바로 처리"): each
 * address's mails go to Harper together (routeMemberMails). Not members: left for the sending hours as before.
 */
async function routeMembersNow(io: AshleyIO, limit: number, deadline?: number): Promise<Partial<Record<MessageOutcome | "error", number>>> {
  const counts: Partial<Record<MessageOutcome | "error", number>> = {};
  if (!io.routeToMember) return counts;
  // Members' only: the others wait for the sending hours and must not fill the fetch.
  const undecided = (await io.store.listUndecidedInbound(limit, { onlyMembers: true })).filter((message) => message.counterpartKind === "candidate");
  const byAddress = new Map<string, ConversationMessage[]>();
  for (const message of undecided) byAddress.set(addressOf(message), [...(byAddress.get(addressOf(message)) ?? []), message]);
  for (const mails of byAddress.values()) {
    if (deadline && Date.now() > deadline) break;
    let outcome: MessageOutcome | "error";
    try {
      if (!(await io.isMember(mails[0].counterpartEmail))) continue;
      const newest = mails[mails.length - 1];
      const root = newest.rootMailId ? await io.readMail(newest.rootMailId) : null;
      const person = newest.personId ? await io.readPerson(newest.personId) : null;
      outcome = await routeMemberMails(io, mails, { root, who: whoOf(person, newest.counterpartEmail), personId: newest.personId });
    } catch (error) {
      outcome = "error";
      console.error("[gtm-agent] member mails not routed", mails[0].id, errorText(error));
    }
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  return counts;
}

/**
 * Inside the sending hours: for each member address whose routed mails Harper answered in the chat, one Ashley mail
 * in that thread saying the answer is in Harper, with the link (Shaun 11/23 12:48: Ashley sends it). It answers the
 * address's newest routed mail and covers the earlier ones, so it waits while that newest still waits for Harper.
 * Only to the address the thread's first mail went to and the member signed in with; within the one Ashley mail per
 * address a day (the next send day otherwise); never when they were back in Harper or got a Harper mail since
 * (memberRedirects leaves those out). Its words go into their Harper chat too. A Harper turn still waiting to run is
 * the Career dispatcher's (it hands queued turns over every minute).
 */
export async function sendMemberRedirects(io: AshleyIO, now: Date, limit: number, deadline?: number): Promise<Partial<Record<MemberRedirectOutcome, number>>> {
  const counts: Partial<Record<MemberRedirectOutcome, number>> = {};
  if (!io.memberRedirects) return counts;
  const bump = (outcome: MemberRedirectOutcome) => { counts[outcome] = (counts[outcome] ?? 0) + 1; };
  const byAddress = new Map<string, MemberRedirect[]>();
  for (const redirect of await io.memberRedirects(limit * WAITING_FETCH_FACTOR)) {
    const address = addressOf(redirect.inbound);
    byAddress.set(address, [...(byAddress.get(address) ?? []), redirect]);
  }
  for (const redirects of byAddress.values()) {
    if (deadline && Date.now() > deadline) break;
    for (const redirect of redirects) if (!redirect.harperAnswered) bump("waiting_harper");
    if (!redirects[redirects.length - 1].harperAnswered) continue;
    try {
      bump(await sendMemberRedirect(io, redirects.filter((item) => item.harperAnswered), now));
    } catch (error) {
      console.error("[gtm-agent] member redirect not sent", redirects[redirects.length - 1].inbound.id, errorText(error));
      bump("failed");
    }
  }
  return counts;
}

/** answered: one address's routed mails Harper answered, oldest first; the mail answers the newest. */
async function sendMemberRedirect(io: AshleyIO, answered: readonly MemberRedirect[], now: Date): Promise<MemberRedirectOutcome> {
  const redirect = answered[answered.length - 1];
  const { inbound } = redirect;
  const root = inbound.rootMailId ? await io.readMail(inbound.rootMailId) : null;
  // Verified address only: the one the thread's first mail went to, which is the one they wrote from and signed in with.
  if (!root || root.toEmail.trim().toLowerCase() !== addressOf(inbound)) return "skipped";
  if (!io.send || !io.settings.replyAgentEnabled || await io.isSuppressed(addressOf(inbound))) return "skipped";
  if (await mailedToday(io, root.toEmail, now)) return "deferred";
  const person = inbound.personId ? await io.readPerson(inbound.personId) : null;
  const language = languageOf(mailText(inbound));
  const copy = ASHLEY_COPY[language];
  const body = [copy.greeting(person?.name?.trim() || null), ...copy.memberRedirect].join("\n\n");
  const link = { label: copy.memberRedirectLabel, url: harperChatLink(io.settings.origin) };
  const check = checkBeforeSend({
    draft: body, postingTexts: [], fixedCopy: true, suppressed: false, windowOpen: io.settings.windowOpen(now), personAnswered: false,
  });
  if (check.status === "wait") return "deferred";
  if (check.status === "fail") return "skipped";
  const parts: MailParts = {
    root, language, body, link, subject: replySubject(inbound.subject, root.subject),
    rfcMessageId: inbound.rfcMessageId, references: inbound.references,
    quote: { fromEmail: inbound.fromEmail || inbound.counterpartEmail, at: inbound.occurredAt, text: inbound.bodyText },
  };
  const sent = await sendOnce(io, outgoing(io, parts, `gtm-agent-member-redirect:${inbound.id}`));
  await recordSent(io, parts, { email: root.toEmail, kind: "candidate", personId: inbound.personId, rootMailId: root.id }, sent);
  const chat = { userId: redirect.userId, conversationId: redirect.conversationId, inboundMessageIds: answered.map((item) => item.inbound.id) };
  await io.noteMemberChat?.(chat, memberRedirectChatContent(storedReplyText(body, link))).catch((error) => {
    console.error("[gtm-agent] Ashley's member mail sent, not written into the Harper chat", inbound.id, errorText(error));
  });
  if (inbound.personId) await io.notePerson(inbound.personId, ASHLEY_NOTE.memberRedirect).catch(() => undefined);
  await io.slack(sentReplySlackText({ who: whoOf(person, inbound.counterpartEmail), text: body, link }), inbound.personId).catch(() => undefined);
  return "sent";
}

/**
 * Off on /ops: nothing. Inside the sending hours only (outside them nothing is decided: the mails wait for the next
 * open tick, design 4장): first the replies queued in an earlier tick, then the undecided inbound mails, oldest first,
 * one at a time. A model or provider failure on one mail leaves it
 * undecided (tried again next tick) and the tick goes on; the day's cost cap ends the tick.
 */
export async function processAshleyReplies(io: AshleyIO, opts: { limit: number; now: Date; deadline?: number }): Promise<AshleyTick> {
  const tick: AshleyTick = { ran: true, outcomes: {}, errors: [] };
  // Off on /ops: no mail is decided (they stay undecided; switched on, the backlog is decided and answered), and the
  // companies' connection requests and joined mails wait too (Shaun 11/22: they wait, no hand-off).
  if (!io.settings.replyAgentEnabled) return { ...tick, ran: false, reason: "reply_agent_off" };
  // Members' mails go to Harper at any hour (nothing is sent).
  try {
    const members = await routeMembersNow(io, opts.limit * WAITING_FETCH_FACTOR, opts.deadline);
    if (Object.keys(members).length) tick.members = members;
  } catch (error) {
    tick.errors.push(`members: ${errorText(error)}`);
  }
  if (!io.settings.windowOpen(opts.now)) return { ...tick, ran: false, reason: "window_closed" };
  try {
    const redirects = await sendMemberRedirects(io, opts.now, opts.limit, opts.deadline);
    if (Object.keys(redirects).length) tick.memberRedirects = redirects;
  } catch (error) {
    tick.errors.push(`member redirects: ${errorText(error)}`);
  }
  try {
    tick.flushed = await flushQueuedReplies(io, opts.limit, opts.now);
  } catch (error) {
    tick.errors.push(`queued: ${errorText(error)}`);
  }
  try {
    const ends = await finishIntroEnds(io, opts.limit, opts.deadline);
    if (Object.values(ends).some(Boolean)) tick.introEnds = ends;
  } catch (error) {
    tick.errors.push(`intro ends: ${errorText(error)}`);
  }
  try {
    const told = await tellCompanyIntroAsks(io, opts.now, opts.limit, opts.deadline);
    if (Object.keys(told).length) tick.companyIntros = told;
  } catch (error) {
    tick.errors.push(`company intros: ${errorText(error)}`);
  }
  try {
    const joined = await tellJoinedCompanies(io, opts.now, opts.limit, opts.deadline);
    if (Object.keys(joined).length) tick.joined = joined;
  } catch (error) {
    tick.errors.push(`joined: ${errorText(error)}`);
  }
  // Mails still waiting (for their company mail, or for the next send day) are looked at cheaply (no model call) and
  // do not take the tick's places: up to `limit` other addresses are handled after them (review 11/21: five waits
  // blocked the queue for 2 hours).
  // One row per address (its other mails are read with it), and not the addresses Ashley already wrote to today:
  // they wait for the next send day and must not fill the fetch (review 11/22: 50 mails of one address hid the rest).
  const messages = await io.store.listUndecidedInbound(opts.limit * WAITING_FETCH_FACTOR, { firstPerAddress: true, notMailedOn: opts.now });
  const seen = new Set<string>();
  let handled = 0;
  for (const message of messages) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    if (handled >= opts.limit) break;
    // One address once a tick: all its undecided mails are answered together, in one reply that reads them all (the
    // newest is the one it answers), so no question and no "stop" in an earlier one is passed over.
    const address = addressOf(message);
    if (seen.has(address)) continue;
    seen.add(address);
    let outcome: MessageOutcome | "error";
    let mails: ConversationMessage[] = [];
    try {
      mails = await undecidedMailsOf(io, message, messages);
      outcome = await processAshleyMessage(io, mails[mails.length - 1], opts.now, mails.slice(0, -1));
    } catch (error) {
      outcome = "error";
      tick.errors.push(`${message.id}: ${errorText(error)}`);
    }
    // The newest was decided: the others are closed with it (their signals stay: an agreement in one still counts
    // for the company mail). Also when a write after the decision failed (the reply may have gone): left open, they
    // would be answered again on their own, without the newest mail.
    try {
      if (mails.length > 1 && (!LEFT_OPEN.has(outcome) || (outcome === "error" && await decidedNow(io, mails[mails.length - 1])))) {
        for (const earlier of mails.slice(0, -1)) await io.store.recordDecision(earlier.id, "no_reply", SUPERSEDED_REASON, earlier.signals ?? []);
      }
    } catch (error) {
      tick.errors.push(`${message.id} (closing the earlier mails): ${errorText(error)}`);
    }
    tick.outcomes[outcome] = (tick.outcomes[outcome] ?? 0) + 1;
    if (outcome !== "waiting_company" && outcome !== "deferred") handled += 1;
    if (outcome === "budget") return { ...tick, reason: "cost_cap" };
  }
  return tick;
}

/** How many undecided mails a tick reads per place, so waiting ones do not crowd out the rest. */
const WAITING_FETCH_FACTOR = 10;
/** One address's undecided mails read at most (answered together). */
const UNDECIDED_PER_ADDRESS = 20;
