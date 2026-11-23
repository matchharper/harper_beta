/**
 * #5 reply conversations, the pure part of conversation.server.ts: how a counterpart's history is put together
 * (design 3장 "이어 말하기"), when an inbound mail may get an Ashley reply, and how stored interest signals are read.
 * One address at a time: nothing here ever mixes in rows of another address (candidate ↔ company leak).
 */
import type { ConversationMessage, HistoryEntry, InterestSignal } from "./conversation";
import { capText, cutQuotedText } from "./replies";

/** History entries the writer gets by default (design 3장: "기록은 최근 10통까지"). */
export const HISTORY_LIMIT = 10;
export const HISTORY_MAX_LIMIT = 50;
/** Each entry's text at most (quoted text already cut). */
export const HISTORY_TEXT_CHARS = 4_000;
/** Why an inbound mail gets no Ashley decision: a person already answered it from the mailbox. */
export const HUMAN_ANSWERED_REASON = "사람이 이미 답했어요";

/** One of our mails to the address (gtm_mails, sent and not bounced), as history reads it. */
export type HistoryMail = {
  id: string;
  toEmail: string;
  kind: "first" | "followup" | "company";
  subject: string;
  text: string;
  postings: HistoryEntry["postings"];
  sentAt: string;
};

/** What history reads of a conversation row. */
export type HistoryMessage = Pick<
  ConversationMessage,
  "id" | "counterpartEmail" | "author" | "direction" | "subject" | "bodyText" | "newText" | "rootMailId" | "gmailThreadId"
  | "sendStatus" | "occurredAt" | "fromEmail"
> & Partial<Pick<ConversationMessage, "decision" | "answeredByMessageId">>;

const address = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

/** The thread a conversation row belongs to: its root mail (gtm_mails.id, also a mail entry's key), else its Gmail thread. */
export function threadKeyOf(message: Pick<HistoryMessage, "id" | "rootMailId" | "gmailThreadId">): string {
  if (message.rootMailId) return message.rootMailId;
  return message.gmailThreadId ? `gmail:${message.gmailThreadId}` : `message:${message.id}`;
}

/** The postings of a gtm_mails.postings snapshot (AgentPosting[]), as history names them. */
export function historyPostings(value: unknown): HistoryEntry["postings"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const posting = item as { companyName?: unknown; title?: unknown; url?: unknown; roleId?: unknown } | null;
    if (!posting || typeof posting.title !== "string") return [];
    return [{
      companyName: typeof posting.companyName === "string" ? posting.companyName : "",
      title: posting.title,
      url: typeof posting.url === "string" && posting.url ? posting.url : null,
      ...(typeof posting.roleId === "string" && posting.roleId ? { roleId: posting.roleId } : {}),
    }];
  });
}

/**
 * Every mail with this address, time order: our mails (first / follow-up / company) and the conversation rows (their
 * replies, Ashley's replies that went out, a person's replies from the mailbox). Rows of any other address are
 * dropped here too, whatever the caller passed. Texts have quoted text cut and are capped at HISTORY_TEXT_CHARS. At
 * most `limit` entries, the latest; with `threadKey`, that thread's entries come first (and are kept first when the
 * limit cuts), then the other threads', each part in time order.
 */
export function mergeHistory(
  counterpartEmail: string,
  mails: readonly HistoryMail[],
  messages: readonly HistoryMessage[],
  opts: { limit?: number; threadKey?: string } = {},
): HistoryEntry[] {
  const email = address(counterpartEmail);
  if (!email) return [];
  // Their mail went to a person: decided hand_to_human, or Ashley's reply to it was held or failed (also handed off).
  const replyStatus = new Map(messages.map((message) => [message.id, message.sendStatus]));
  const handedOff = (message: HistoryMessage) => message.author === "counterpart" && (message.decision === "hand_to_human"
    || ["held", "failed"].includes(String(message.answeredByMessageId ? replyStatus.get(message.answeredByMessageId) : "")));
  const entries: HistoryEntry[] = [
    ...mails.filter((mail) => address(mail.toEmail) === email).map((mail): HistoryEntry => ({
      at: mail.sentAt, author: "agent_mail", kind: mail.kind, subject: mail.subject,
      text: capText(mail.text.trim(), HISTORY_TEXT_CHARS), postings: mail.postings, threadKey: mail.id,
    })),
    ...messages
      // Only what reached them: an Ashley reply counts once it went out.
      .filter((message) => address(message.counterpartEmail) === email && (message.author !== "ashley" || message.sendStatus === "sent"))
      .map((message): HistoryEntry => ({
        at: message.occurredAt, author: message.author, kind: "reply", subject: message.subject,
        text: capText((message.newText || cutQuotedText(message.bodyText)).trim(), HISTORY_TEXT_CHARS), postings: [],
        threadKey: threadKeyOf(message), ...(message.fromEmail ? { fromEmail: message.fromEmail } : {}),
        ...(handedOff(message) ? { handedOff: true } : {}),
      })),
  ]
    .filter((entry) => Number.isFinite(Date.parse(entry.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const limit = Math.min(HISTORY_MAX_LIMIT, Math.max(1, Math.floor(opts.limit ?? HISTORY_LIMIT)));
  if (!opts.threadKey) return entries.slice(-limit);
  const current = entries.filter((entry) => entry.threadKey === opts.threadKey).slice(-limit);
  const room = limit - current.length;
  const others = room > 0 ? entries.filter((entry) => entry.threadKey !== opts.threadKey).slice(-room) : [];
  return [...current, ...others];
}

/**
 * Why no Ashley reply may be queued for this message, or null when one may: it must be a counterpart's inbound mail
 * that no reply answers yet (one inbound mail → at most one Ashley reply; the database's unique index on
 * answers_message_id holds the same rule under concurrent writers).
 */
export function replyBlockReason(
  inbound: Pick<ConversationMessage, "direction" | "author" | "answeredByMessageId"> | null | undefined,
): "not_found" | "not_inbound" | "already_answered" | null {
  if (!inbound) return "not_found";
  if (inbound.direction !== "inbound" || inbound.author !== "counterpart") return "not_inbound";
  return inbound.answeredByMessageId ? "already_answered" : null;
}

/**
 * The interest signals stored on inbound rows, newest first: each one's messageId and at are its row's (the row is
 * the source of truth), filtered by posting URL and time when asked.
 */
export function flattenSignals(
  rows: ReadonlyArray<{ id: string; occurredAt: string; signals: unknown }>,
  opts: { postingUrl?: string; since?: string } = {},
): InterestSignal[] {
  const since = opts.since ? Date.parse(opts.since) : Number.NaN;
  return rows
    .filter((row) => !Number.isFinite(since) || Date.parse(row.occurredAt) >= since)
    .flatMap((row) => (Array.isArray(row.signals) ? row.signals : [])
      .filter((signal): signal is InterestSignal => Boolean(signal) && typeof (signal as InterestSignal).postingUrl === "string")
      .map((signal) => ({ ...signal, messageId: row.id, at: row.occurredAt })))
    .filter((signal) => !opts.postingUrl || signal.postingUrl === opts.postingUrl)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
