/**
 * #5 reply conversations (pure types, shared by the reply pipeline, Ashley's reply agent and company mails).
 * Storage: public.gtm_agent_messages (one row per mail in a reply thread). gtm_mails keeps the mails we start
 * (first, follow-up, company); every inbound reply, every Ashley reply and every human reply from Ashley's Gmail is a
 * row here. History for a counterpart = their gtm_mails rows + these rows, by address, time order.
 *
 * COPY THIS FILE VERBATIM to src/lib/gtmPlays/agent/conversation.ts (identical in every worker branch).
 * Implementations live in conversation.server.ts (owned by the reply-pipeline worker) with exactly the
 * function names and signatures of ConversationStore below.
 */

/** Who is on the other side of the thread. */
export type CounterpartKind = "candidate" | "company";

/** Who wrote the message. "human" = someone on the Harper team writing from Ashley's Gmail (SENT label). */
export type MessageAuthor = "counterpart" | "ashley" | "human";

/** Ashley's judgment of one inbound mail (the decide tool). */
export type AshleyDecisionKind =
  | "reply" // answer it
  | "no_reply" // nothing to say (thanks-only, "I'll look"), recorded on /ops only
  | "stop" // asks not to be contacted / not interested: suppression list, no reply
  | "hand_to_human"; // Shaun answers (identity questions, pricing, legal, unclear, other sender…)

/** What an inbound candidate mail says about a posting (the input for company mails). */
export type InterestSignal = {
  /** gtm_agent_people.id */
  personId: string;
  /** The posting's URL as stored in the mail's postings snapshot (the stable key the agent uses for postings). */
  postingUrl: string;
  companyName: string;
  postingTitle: string;
  /** The candidate's question for the company, rewritten by Ashley in one nameless sentence; null when none. */
  question: string | null;
  /** The candidate agreed that their question or interest goes to the company with a nameless summary (title · years · location · one line). */
  summaryConsent: boolean;
  /**
   * Set while Ashley's reply to this mail waits for the company mail the agreement starts (ashleyAgent.ts
   * COMPANY_ASK_WAIT_MS): when the wait began. The mail stays undecided meanwhile.
   */
  heldAt?: string;
  /** When the inbound mail that carried the signal was received. */
  at: string;
  /** gtm_agent_messages.id of that inbound mail. */
  messageId: string;
};

export type ConversationMessage = {
  id: string;
  personId: string | null;
  counterpartKind: CounterpartKind;
  /** Lower-cased address of the other side (candidate or company recipient): always the address our mail went to. */
  counterpartEmail: string;
  /**
   * An inbound reply from another address than counterpartEmail (a personal address, a colleague): where it came
   * from. Ashley judges whether it is the same person; her answer still goes to counterpartEmail. Null otherwise.
   */
  fromEmail?: string | null;
  author: MessageAuthor;
  direction: "inbound" | "outbound";
  /** Gmail message id for messages read from Gmail (inbound and human); null for Ashley's own sends. */
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  /** RFC Message-ID ("<…@…>") when known. */
  rfcMessageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  subject: string;
  /** Full plain text as received/sent. */
  bodyText: string;
  /** The new text without the quoted earlier mails (for previews and the agent's reading). */
  newText: string;
  /** gtm_mails.id this thread hangs on (first/follow-up/company mail). */
  rootMailId: string | null;
  /** Ashley's decision on an inbound message (null until decided, and for outbound). */
  decision: AshleyDecisionKind | null;
  decisionReason: string | null;
  /** Interest signals Ashley read from an inbound candidate mail. */
  signals: InterestSignal[];
  /** For an inbound message: the Ashley reply that answered it (one inbound → at most one reply). */
  answeredByMessageId: string | null;
  /** Outbound only: queued → sent | failed | held (blocked by the pre-send check, then handed to a human). */
  sendStatus: "queued" | "sent" | "failed" | "held" | null;
  providerMessageId: string | null;
  error: string | null;
  occurredAt: string;
  createdAt: string;
};

/** One entry of a counterpart's history, for the writer's context (gtm_mails rows and conversation rows merged). */
export type HistoryEntry = {
  at: string;
  author: MessageAuthor | "agent_mail"; // agent_mail = a gtm_mails row (first / follow-up / company mail)
  kind: "first" | "followup" | "company" | "reply";
  subject: string;
  /** Quoted text removed; capped. */
  text: string;
  /** Postings named in that mail (gtm_mails snapshot), for "지난번" slots and "do not re-pitch". */
  postings: Array<{ companyName: string; title: string; url: string | null }>;
  threadKey: string;
  /** Their mail was given to a person on the team to answer (a hand-off, or Ashley's reply held or failed). */
  handedOff?: boolean;
  /** A reply from another address than the one our mail went to (ConversationMessage.fromEmail). */
  fromEmail?: string | null;
};

export type ConversationStore = {
  /** Insert once per Gmail message (unique gmail_message_id); returns the stored row (existing one if already there). */
  saveInbound(input: Omit<ConversationMessage, "id" | "createdAt" | "decision" | "decisionReason" | "signals" | "answeredByMessageId" | "sendStatus" | "providerMessageId" | "error" | "author" | "direction"> & { author: "counterpart" | "human" }): Promise<ConversationMessage>;
  /** Inbound counterpart messages with no decision yet, oldest first. */
  listUndecidedInbound(limit: number): Promise<ConversationMessage[]>;
  recordDecision(messageId: string, decision: AshleyDecisionKind, reason: string, signals: InterestSignal[]): Promise<void>;
  /** Stores an undecided mail's signals (the company-mail worker reads them) while its reply waits for that mail. */
  holdSignals(messageId: string, signals: InterestSignal[]): Promise<void>;
  /** Queue an Ashley reply for an inbound message; null when that inbound already has a reply (one inbound → one reply). */
  queueReply(inboundId: string, reply: { subject: string; bodyText: string; inReplyTo: string | null; references: string | null; counterpartEmail: string; counterpartKind: CounterpartKind; personId: string | null; rootMailId: string | null }): Promise<ConversationMessage | null>;
  markSent(messageId: string, result: { providerMessageId: string | null; rfcMessageId: string | null }): Promise<void>;
  markFailed(messageId: string, error: string, held?: boolean): Promise<void>;
  /** Every mail with this address, time order (gtm_mails + conversation rows). Never other addresses. */
  history(counterpartEmail: string, opts?: { limit?: number; threadKey?: string }): Promise<HistoryEntry[]>;
  /**
   * True when a person on the team (SENT label in Ashley's Gmail) wrote in the thread of this root mail, or to the same
   * address, after `since` (at any time when left out). A person's answer covers the mail it answers: later mails are
   * Ashley's again (Shaun 11/21 16:13).
   */
  personAnswered(rootMailId: string, since?: string): Promise<boolean>;
  /** True when the same address wrote again after this inbound mail (decided or not): only the newest is answered. */
  hasNewerInbound?(message: Pick<ConversationMessage, "id" | "counterpartEmail" | "occurredAt">): Promise<boolean>;
  /** Interest signals for a posting (or all), newest first; the company-mail worker reads these. */
  interestSignals(opts?: { postingUrl?: string; since?: string }): Promise<InterestSignal[]>;
};
