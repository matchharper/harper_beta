/**
 * #5 replies: whether a mail that came into a team mailbox is a reply to an agent mail (or a bounce of one), and
 * whether a mail sent from the mailbox (Gmail SENT) is a person on the team answering in one of our threads. Pure,
 * so tests pin the rules; reading the mailboxes and storing the messages are replies.server.ts.
 *
 * A reply is matched to the agent mail its thread hangs on (matchInboundReply):
 * 1. its In-Reply-To / References names the mail's RFC Message-ID (gtm_mails.rfc_message_id), or else
 * 2. it names a stored message of that thread (gtm_agent_messages: an earlier reply, Ashley's or a person's answer)
 *    or is in the same Gmail thread as one, or else
 * 3. it comes from the address the mail went to, within REPLY_WINDOW_DAYS after the mail (any subject, design 4장).
 * A Message-ID / thread match from another address (a forwarded colleague) is marked otherSender: it is kept and
 * handed to a person, never answered by Ashley.
 *
 * Only mail-system signals are judged here (design 4장 "규칙 판단의 누락"): delivery reports, automatic-mail headers
 * (Auto-Submitted, Precedence, X-Autoreply, no-reply senders, mailing lists) and the subject "unsubscribe" that the
 * mailto in our List-Unsubscribe header makes a mail app send (matchAgentUnsubscribe). What a reply means (stop,
 * not interested, out of office in words) is Ashley's decide, not a word list.
 *
 * Health: replyReadingTroubles says which mailboxes are not being read (an error on the last read, or no read for
 * REPLY_READ_STALE_MS), so /ops shows it and follow-ups wait (a follow-up could otherwise go to someone who already
 * answered or asked to stop).
 */
import { applicantListCompany } from "./applicantList";
import { isLikelyAutomatedEmail, normalizeEmailAddress } from "@/lib/email/parse";
import { EXPLORE_SOURCE, signalSourceInfo } from "./signals";

export const REPLY_WINDOW_DAYS = 60;
export const REPLY_EXCERPT_CHARS = 500;
/** How much of a reply its Slack message shows. */
export const REPLY_ALERT_CHARS = 300;
const DAY_MS = 86_400_000;
/** Clock differences between Resend and Gmail: a reply a few minutes "before" the mail still follows it. */
const CLOCK_SKEW_MS = 10 * 60_000;

/**
 * The team mailboxes read for replies: the configured list (GTM_AGENT_REPLY_MAILBOXES, separated by commas, spaces
 * or semicolons) plus the agent's sender, which every agent mail names as Reply-To. Lower-cased, valid addresses
 * only, no repeats.
 */
export function replyMailboxes(configured: string | null | undefined, sender: string | null | undefined): string[] {
  const mailboxes = new Set<string>();
  for (const value of [...String(configured ?? "").split(/[\s,;]+/), String(sender ?? "")]) {
    const email = value.trim().toLowerCase();
    if (/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(email)) mailboxes.add(email);
  }
  return [...mailboxes];
}

/** An RFC Message-ID as stored and compared: without the angle brackets, lower-cased; null when there is none. */
export function normalizeMessageId(value: string | null | undefined): string | null {
  const id = String(value ?? "").trim().replace(/^<+|>+$/g, "").trim().toLowerCase();
  return id && /^[^\s<>]+@[^\s<>]+$/.test(id) ? id : null;
}

/** Every Message-ID an inbound mail's In-Reply-To and References name (normalized, no repeats). */
export function referencedMessageIds(inReplyTo: string | null | undefined, references: string | null | undefined): string[] {
  const ids = new Set<string>();
  for (const value of [inReplyTo, references]) {
    const raw = String(value ?? "");
    const bracketed = raw.match(/<[^<>\s]+>/g);
    for (const token of bracketed ?? raw.split(/\s+/)) {
      const id = normalizeMessageId(token);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

// Reply / forward prefixes at the start of a subject: "Re:", "RE[2]:", "Fwd:", "답장:", "回复:" ...
const ANY_PREFIX = /^\s*(?:(?:re|aw|sv|vs|antw|odp|ynt|res|fwd?|tr)\s*(?:\[\d+\])?\s*[:：]|(?:답장|회신|답신|답변|전달)\s*[:：]|(?:回复|回覆|答复|转发)\s*[:：]?)\s*/i;

/** A subject without its reply / forward prefixes, spaces collapsed, lower-cased. */
function subjectCore(subject: string | null | undefined): string {
  let value = String(subject ?? "").replace(/\s+/g, " ").trim();
  for (let guard = 0; guard < 10 && ANY_PREFIX.test(value); guard += 1) value = value.replace(ANY_PREFIX, "");
  return value.trim().toLowerCase();
}

/**
 * Why an inbound mail is an automatic one and not a person's reply, or null, by mail-system markers only: a no-reply /
 * mailer-daemon sender, Auto-Submitted, Precedence bulk / list / auto_reply, X-Autoreply / X-Autorespond, a mailing
 * list. An out-of-office written in words ("부재중" in the subject) is a person's mail for Ashley to judge.
 */
export function autoReplyReason(args: { fromEmail: string | null | undefined; headers: Record<string, string> }): string | null {
  const automated = isLikelyAutomatedEmail({ fromEmail: args.fromEmail, headers: args.headers });
  if (automated) return automated;
  const header = (name: string) =>
    Object.entries(args.headers).find(([key]) => key.toLowerCase() === name)?.[1]?.trim().toLowerCase() ?? "";
  if (header("precedence") === "auto_reply") return "auto_submitted";
  if (header("x-autoreply") || header("x-autorespond") || header("x-autoresponder")) return "auto_submitted";
  return null;
}

/** Whether an inbound mail may be a delivery report (worth reading in full to check): by its type or its sender. */
export function maybeDeliveryReport(args: { fromEmail: string | null | undefined; headers: Record<string, string> }): boolean {
  const contentType = Object.entries(args.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
  if (/multipart\/report|delivery-status/i.test(contentType)) return true;
  return /^(?:mailer-daemon|postmaster)@/i.test(String(args.fromEmail ?? ""));
}

// ---------------------------------------------------------------------------------------------------------------
// Quoted text

// Where the quoted earlier mail starts in a reply: Gmail / Apple Mail "On … wrote:" (may wrap over lines), Gmail in
// Korean "2026년 11월 17일 (화) … 님이 작성:" and Chinese "2026年11月19日周四 … 写道：", Outlook's separator and header
// block, forwarded / original markers, a signature, and mobile footers.
const QUOTE_STARTS: RegExp[] = [
  /^[ \t]*On\b[^\n]*(?:\n[^\n]*){0,2}?wrote:[ \t]*$/im,
  /^[ \t]*\d{4}\s*년[^\n]*(?:\n[^\n]*){0,2}?작성\s*:[ \t]*$/m,
  /^[ \t]*\d{4}\s*年[^\n]*(?:\n[^\n]*){0,2}?(?:写道|寫道)\s*[:：][ \t]*$/m,
  /^[ \t]*-{2,}\s*(?:original message|forwarded message|원본 메시지|전달된 메시지|原始邮件|原始郵件|转发的邮件)/im,
  /^[ \t]*_{8,}[ \t]*$/m,
  /^[ \t]*(?:sent from my\b[^\n]*|[^\n]{0,40}에서 보냄|发自我的[^\n]*)[ \t]*$/im,
  /^-- ?$/m,
];
// Outlook's "From: … / 보낸 사람: … / 发件人: …" block, only after the reply's own text.
const HEADER_BLOCK = /^[ \t]*(?:from|보낸\s*사람|发件人|寄件者|від|от|von)\s*[:：]\s?.+$/im;
// The last line of a quote header whose first line has no fixed word: Gmail in Chinese "Name <addr> 于2026年…写道：",
// Ukrainian "чт, 19 лист. 2026 р. о 12:52 Name <addr> пише:", Russian, Japanese, German ("… <addr>:"), French,
// Spanish, Portuguese, Italian, Polish, Turkish, and the English / Korean ones in other word orders.
const QUOTE_HEADER_END = /(?:\bwrote|작성|写道|寫道|пише|пишет|a\s+écrit|escribió|escreveu|ha\s+scritto|scrisse|napisał(?:a|\(a\))?|yazdı|<[^<>\s]+@[^<>\s]+>)\s*[:：][ \t]*$/i;
// What a quote header names: an address, a year or a time of day.
const HEADER_FACT = /<[^<>\s]+@[^<>\s]+>|[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}|\b(?:19|20)\d{2}\b|\b\d{1,2}:\d{2}\b/i;
/** A quote header is at most this many lines (Gmail wraps a long one). */
const QUOTE_HEADER_LINES = 3;

/**
 * Where a quote header of the QUOTE_HEADER_END kind starts (character index), or -1. The header is the end of the
 * run of non-blank lines that ends with such a line (Gmail puts a blank line above it; a long header wraps), at most
 * QUOTE_HEADER_LINES, from the first line that names an address, a year or a time (a line of the person's own text
 * right above it stays theirs). An English "wrote:" counts only next to an address in angle brackets ("On … wrote:"
 * is QUOTE_STARTS), so "here is what I wrote:" in the person's own text is not a header.
 */
function quoteHeaderIndex(text: string): number {
  const lines = text.split("\n");
  let offset = 0;
  const starts = lines.map((line) => {
    const start = offset;
    offset += line.length + 1;
    return start;
  });
  for (let end = 0; end < lines.length; end += 1) {
    const ending = lines[end].match(QUOTE_HEADER_END);
    if (!ending) continue;
    let first = end;
    while (first > 0 && end - first < QUOTE_HEADER_LINES - 1 && lines[first - 1].trim()) first -= 1;
    while (first < end && !HEADER_FACT.test(lines[first])) first += 1;
    const block = lines.slice(first, end + 1).join("\n");
    if (!HEADER_FACT.test(block)) continue;
    if (/^wrote/i.test(ending[0]) && !/<[^<>\s]+@[^<>\s]+>/.test(block)) continue;
    return starts[first];
  }
  return -1;
}

/**
 * A reply's own new text: the quoted earlier mail (from its header on), ">" quoted lines, a signature and mobile
 * footers cut off. Stored as gtm_agent_messages.new_text for previews and the agent's reading (the full text is
 * kept too).
 */
export function cutQuotedText(body: string | null | undefined): string {
  const text = String(body ?? "").replace(/\r\n?/g, "\n");
  let cut = text.length;
  for (const pattern of QUOTE_STARTS) {
    const index = text.search(pattern);
    if (index >= 0 && index < cut) cut = index;
  }
  const quoteHeader = quoteHeaderIndex(text.slice(0, cut));
  if (quoteHeader >= 0) cut = quoteHeader;
  const header = text.search(HEADER_BLOCK);
  if (header > 0 && header < cut && text.slice(0, header).trim()) cut = header;
  return text.slice(0, cut)
    .split("\n").filter((line) => !/^\s*>/.test(line)).map((line) => line.replace(/[ \t]+$/g, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** `text` at most `max` characters, an ellipsis when cut. */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** The reply's own new text (cutQuotedText), at most `max` characters, for Slack. */
export function replyExcerpt(body: string | null | undefined, max = REPLY_EXCERPT_CHARS): string {
  return capText(cutQuotedText(body), max);
}

// ---------------------------------------------------------------------------------------------------------------
// Matching

/** One agent mail a reply may answer (gtm_mails, campaign 'agent', sent). */
export type AgentSentMail = {
  mailId: string;
  /** gtm_agent_people.id; null for a mail without a person row (a company mail may have none). */
  personId: string | null;
  /** candidate: a first or follow-up mail; company: a company mail. */
  audience: "candidate" | "company";
  toEmail: string;
  /** Normalized (normalizeMessageId); null or "" when unknown. */
  rfcMessageId: string | null;
  subject: string;
  sentAt: string;
};

/** What matching needs of an inbound mail (from parseGmailMessage). */
export type InboundMail = {
  fromEmail: string | null;
  subject: string;
  inReplyTo: string | null;
  references: string | null;
  receivedAt: string;
};

export type AgentReplyMatch = { mail: AgentSentMail; by: "message_id" | "from" };

const latestFirst = (a: AgentSentMail, b: AgentSentMail) => Date.parse(b.sentAt) - Date.parse(a.sentAt);

/** Agent mails sent before `receivedAt` (with clock skew), and within `windowDays` of it when given. */
function sentBefore(mails: readonly AgentSentMail[], receivedAt: string, windowDays?: number) {
  const received = Date.parse(receivedAt);
  if (!Number.isFinite(received)) return [];
  return mails.filter((mail) => {
    const sent = Date.parse(mail.sentAt);
    if (!Number.isFinite(sent) || sent > received + CLOCK_SKEW_MS) return false;
    return windowDays === undefined || received - sent <= windowDays * DAY_MS;
  });
}

const sameAddress = (a: string | null | undefined, b: string | null | undefined) => {
  const left = normalizeEmailAddress(a);
  return Boolean(left) && left === normalizeEmailAddress(b);
};

/**
 * The agent mail an inbound mail replies to, or null: by Message-ID first (In-Reply-To / References), else by the
 * sender's address within REPLY_WINDOW_DAYS (whatever the subject: a person who answers with a new subject is still
 * answering). The latest such mail wins (a follow-up over the first mail). Automatic mails are checked before
 * (autoReplyReason).
 */
export function matchAgentReply(inbound: InboundMail, mails: readonly AgentSentMail[]): AgentReplyMatch | null {
  const referenced = new Set(referencedMessageIds(inbound.inReplyTo, inbound.references));
  const byId = sentBefore(mails, inbound.receivedAt)
    .filter((mail) => mail.rfcMessageId && referenced.has(mail.rfcMessageId))
    .sort(latestFirst)[0];
  if (byId) return { mail: byId, by: "message_id" };
  if (!normalizeEmailAddress(inbound.fromEmail)) return null;
  const byFrom = sentBefore(mails, inbound.receivedAt, REPLY_WINDOW_DAYS)
    .filter((mail) => sameAddress(mail.toEmail, inbound.fromEmail))
    .sort(latestFirst)[0];
  return byFrom ? { mail: byFrom, by: "from" } : null;
}

/** A stored reply-thread message (gtm_agent_messages) a later mail may name or share a Gmail thread with. */
export type ThreadMessage = { rootMailId: string | null; rfcMessageId: string | null; gmailThreadId: string | null };

/** The thread's own Gmail fields (parseGmailMessage). */
export type ThreadedMail = Pick<InboundMail, "inReplyTo" | "references" | "receivedAt"> & { threadId: string | null };

/**
 * The agent mail a thread hangs on, through a stored message of that thread: one the mail names (In-Reply-To /
 * References), else one in the same Gmail thread. Null when none, or its root mail is not in `mails`.
 */
function rootThroughThread(
  mail: ThreadedMail, mails: readonly AgentSentMail[], thread: readonly ThreadMessage[],
): AgentSentMail | null {
  const referenced = new Set(referencedMessageIds(mail.inReplyTo, mail.references));
  const named = thread.find((row) => {
    const id = normalizeMessageId(row.rfcMessageId);
    return row.rootMailId && id && referenced.has(id);
  });
  const sameThread = mail.threadId ? thread.find((row) => row.rootMailId && row.gmailThreadId === mail.threadId) : undefined;
  const rootId = (named ?? sameThread)?.rootMailId;
  return rootId ? mails.find((item) => item.mailId === rootId) ?? null : null;
}

/** Why a reply that names our thread is not Ashley's to answer (stored as the decision's reason). */
export const OTHER_SENDER_REASON = "다른 보낸 사람";

export type InboundMatch = {
  mail: AgentSentMail;
  by: "message_id" | "thread" | "from";
  /** The sender is not the address the root mail went to (a forwarded colleague): a person answers, never Ashley. */
  otherSender: boolean;
};

/**
 * The agent mail a reply's thread hangs on (see the file comment): the mail's own Message-ID, else a stored message
 * of the thread (its Message-ID or Gmail thread), else the sender's address. `otherSender` compares the sender with
 * the root mail's recipient.
 */
export function matchInboundReply(
  inbound: InboundMail & { threadId: string | null }, mails: readonly AgentSentMail[], thread: readonly ThreadMessage[],
): InboundMatch | null {
  const result = (mail: AgentSentMail, by: InboundMatch["by"]): InboundMatch => ({
    mail, by, otherSender: !sameAddress(inbound.fromEmail, mail.toEmail),
  });
  const direct = matchAgentReply(inbound, mails);
  if (direct?.by === "message_id") return result(direct.mail, "message_id");
  const root = rootThroughThread(inbound, mails, thread);
  if (root) return result(root, "thread");
  return direct ? result(direct.mail, "from") : null;
}

/**
 * The agent mail a mail sent from the team mailbox (Gmail SENT) answers in, or null: only through the thread (it
 * names one of our mails or a stored message of the thread, or shares a Gmail thread with a stored one), never by
 * address. A null one is other work done from the mailbox and is never stored.
 */
export function matchHumanReply(
  sent: ThreadedMail, mails: readonly AgentSentMail[], thread: readonly ThreadMessage[],
): AgentSentMail | null {
  const referenced = new Set(referencedMessageIds(sent.inReplyTo, sent.references));
  const byId = sentBefore(mails, sent.receivedAt)
    .filter((mail) => mail.rfcMessageId && referenced.has(mail.rfcMessageId))
    .sort(latestFirst)[0];
  return byId ?? rootThroughThread(sent, mails, thread);
}

/** A delivery failure as parseGmailMessage reads it. */
export type DeliveryFailure = { diagnosticCode: string | null; finalRecipient: string | null; status: string | null };

/** A permanent failure (5.x.x): a delay or a temporary 4.x.x failure is not a bounce. */
export function isPermanentFailure(failure: DeliveryFailure | null | undefined): boolean {
  return Boolean(failure?.status?.startsWith("5."));
}

/**
 * The agent mail a permanent delivery failure is about, or null: the mail its report names by Message-ID, else the
 * latest mail to the failed address within REPLY_WINDOW_DAYS before the report.
 */
export function matchAgentBounce(
  failure: DeliveryFailure, inbound: Pick<InboundMail, "inReplyTo" | "references" | "receivedAt">,
  mails: readonly AgentSentMail[],
): AgentSentMail | null {
  if (!isPermanentFailure(failure)) return null;
  const referenced = new Set(referencedMessageIds(inbound.inReplyTo, inbound.references));
  const candidates = sentBefore(mails, inbound.receivedAt, REPLY_WINDOW_DAYS).sort(latestFirst);
  const byId = candidates.find((mail) => mail.rfcMessageId && referenced.has(mail.rfcMessageId));
  if (byId) return byId;
  const recipient = normalizeEmailAddress(failure.finalRecipient);
  return recipient ? candidates.find((mail) => mail.toEmail.trim().toLowerCase() === recipient) ?? null : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Opt-outs

/**
 * Whether a subject is the opt-out mail a mail app sends from our List-Unsubscribe mailto ("unsubscribe", a reply
 * prefix allowed). Anything a person writes ("수신 거부해 주세요", "unsubscribe me") is a reply for Ashley to judge.
 */
export function isUnsubscribeSubject(subject: string | null | undefined): boolean {
  return subjectCore(subject) === "unsubscribe";
}

/**
 * The agent mail an opt-out mail (isUnsubscribeSubject) is about, or null: the mail it names by Message-ID, else the
 * latest mail sent to its sender before it. No time window here: the caller's query bounds how far back.
 */
export function matchAgentUnsubscribe(
  inbound: Pick<InboundMail, "fromEmail" | "inReplyTo" | "references" | "receivedAt">, mails: readonly AgentSentMail[],
): AgentSentMail | null {
  const candidates = sentBefore(mails, inbound.receivedAt).sort(latestFirst);
  const referenced = new Set(referencedMessageIds(inbound.inReplyTo, inbound.references));
  const byId = candidates.find((mail) => mail.rfcMessageId && referenced.has(mail.rfcMessageId));
  if (byId) return byId;
  const from = normalizeEmailAddress(inbound.fromEmail);
  return from ? candidates.find((mail) => mail.toEmail.trim().toLowerCase() === from) ?? null : null;
}

// ---------------------------------------------------------------------------------------------------------------
// The one-time conversation backfill

/** Addresses per Gmail search (a search is one GET; its query stays well under URL limits). */
export const BACKFILL_ADDRESSES_PER_QUERY = 20;
const PLAIN_ADDRESS = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * Gmail searches for any mail from or to these addresses within `days` (a reply, archived or not, and a person's
 * answer from the mailbox), a few addresses per search: "newer_than:14d {from:a to:a from:b to:b}" (braces are
 * Gmail's OR). Addresses Gmail's syntax could misread are left out.
 */
export function addressSearches(addresses: readonly string[], days: number): string[] {
  const clean = [...new Set(addresses.map((address) => address.trim().toLowerCase()))].filter((address) => PLAIN_ADDRESS.test(address));
  const searches: string[] = [];
  for (let index = 0; index < clean.length; index += BACKFILL_ADDRESSES_PER_QUERY) {
    const group = clean.slice(index, index + BACKFILL_ADDRESSES_PER_QUERY).map((address) => `from:${address} to:${address}`);
    searches.push(`newer_than:${Math.max(1, Math.round(days))}d {${group.join(" ")}}`);
  }
  return searches;
}

// ---------------------------------------------------------------------------------------------------------------
// Whether replies are being read

/** A mailbox not read for this long (the dispatcher reads every 5 minutes) is not being read. */
export const REPLY_READ_STALE_MS = 30 * 60_000;

/** A team mailbox's read state (gtm_agent_mailboxes). */
export type MailboxReadState = { email: string; lastSyncedAt: string | null; lastError: string | null };

/** A mailbox whose replies are not being read: which (null: none can be), why in plain words, and the last full read. */
export type ReplyReadingTrouble = { mailbox: string | null; problem: string; lastReadAt: string | null };

/** A mailbox read error (Gmail, Google sign-in, time) in plain words: what is wrong and, when known, what to do. */
export function mailboxErrorText(error: string): string {
  const text = String(error ?? "");
  if (/unauthorized_client|access_denied|insufficient\s*permission|insufficient authentication scopes|delegation denied|Gmail API 403/i.test(text)) {
    return "권한 없음(관리 콘솔에서 읽기 권한 추가 필요)";
  }
  if (/invalid_grant|invalid email or user id|mail service not enabled|failedPrecondition/i.test(text)) {
    return "메일함을 찾지 못함(주소가 맞는지, Gmail을 쓰는 계정인지 확인 필요)";
  }
  if (/Gmail API 401|invalid_client|private key|DECODER|PEM|is required/i.test(text)) {
    return "로그인 실패(서버의 Gmail 읽기 키 확인 필요)";
  }
  if (/ran out of time|timed?\s*out|aborted|AbortError|ETIMEDOUT/i.test(text)) {
    return "시간 안에 다 읽지 못함(다음 확인 때 이어서 읽어요)";
  }
  if (/Gmail API 429|rate\s*limit|quota/i.test(text)) return "Gmail 요청 한도 초과(잠시 뒤 다시 읽어요)";
  if (/Gmail API 5\d\d|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|socket/i.test(text)) return "Gmail 연결 오류(잠시 뒤 다시 읽어요)";
  const plain = text.replace(/\s+/g, " ").trim();
  return `오류: ${plain.length > 160 ? `${plain.slice(0, 159)}…` : plain || "알 수 없음"}`;
}

/**
 * Which mailboxes' replies are not being read right now, one line each (empty: all are read). Only while an agent mail
 * went out within REPLY_WINDOW_DAYS (`recentMail`): there is nothing to read otherwise. A mailbox is not being read
 * when its last read failed (lastError), it was never read, or its last full read is older than REPLY_READ_STALE_MS.
 */
export function replyReadingTroubles(args: {
  recentMail: boolean; configured: boolean; mailboxes: readonly string[]; states: readonly MailboxReadState[]; now: Date;
}): ReplyReadingTrouble[] {
  if (!args.recentMail) return [];
  if (!args.configured) return [{ mailbox: null, problem: "이 서버에 메일함을 읽는 설정이 없어요", lastReadAt: null }];
  if (!args.mailboxes.length) return [{ mailbox: null, problem: "읽을 메일함이 없어요(보내는 메일 주소 필요)", lastReadAt: null }];
  const troubles: ReplyReadingTrouble[] = [];
  for (const mailbox of args.mailboxes) {
    const state = args.states.find((item) => item.email.trim().toLowerCase() === mailbox);
    const lastReadAt = state?.lastSyncedAt ?? null;
    const readAt = lastReadAt ? Date.parse(lastReadAt) : Number.NaN;
    if (state?.lastError) troubles.push({ mailbox, problem: mailboxErrorText(state.lastError), lastReadAt });
    else if (!Number.isFinite(readAt)) troubles.push({ mailbox, problem: "아직 한 번도 읽지 못했어요", lastReadAt: null });
    else if (args.now.getTime() - readAt > REPLY_READ_STALE_MS) {
      troubles.push({ mailbox, problem: `${Math.round(REPLY_READ_STALE_MS / 60_000)}분 넘게 읽지 못했어요`, lastReadAt });
    }
  }
  return troubles;
}

/** Slack's own escapes, so a name or a reply never becomes a link or a mention. */
const slackText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The reply alert's first line (Shaun 11/19). */
export const REPLY_ALERT_TITLE = "[후보자 소싱 에이전트 · 답장]";

/** The /ops #5 link that opens this person in 로그 · 사람 (AgentTab.tsx ?open=person). */
export function agentPersonLink(origin: string, person: { id: string; email: string | null }): string {
  const url = new URL("/ops/gtm-plays", origin);
  url.searchParams.set("tab", "5");
  url.searchParams.set("open", "person");
  url.searchParams.set("person", person.id);
  if (person.email) url.searchParams.set("q", person.email);
  return url.toString();
}

/**
 * The #gtm-talent message for a candidate's reply, posted as it is read (Shaun 11/18: "메일답장은 on the fly") under
 * the latest daily numbers post: the title, who (name when known, the address, where they were found), the start of the
 * reply quoted, and a link that opens the person on /ops #5. `otherSender`: the reply came from another address
 * (Ashley does not answer it; a person does).
 */
export function replyAlertText(args: {
  personId: string; name: string | null; email: string; source: string | null; isTest: boolean; reply: string;
  otherSender?: string | null; origin: string;
}): string {
  const marks = [
    args.otherSender ? `다른 보낸 사람 ${slackText(args.otherSender)} · Ashley는 답하지 않아요, 사람이 확인해 주세요` : "",
    args.isTest ? "테스트" : "",
  ].filter(Boolean);
  const name = args.name?.trim() && args.name.trim().toLowerCase() !== args.email.trim().toLowerCase() ? args.name.trim() : "";
  let where = args.source ?? "";
  try {
    const list = applicantListCompany(args.source);
    where = args.source === EXPLORE_SOURCE ? "열린 웹" : list ? `${list} 지원자` : args.source ? signalSourceInfo(args.source).label : "";
  } catch {
    // An older source id: shown as it is.
  }
  const reply = args.reply.trim()
    ? args.reply.trim().split("\n").map((line) => `> ${slackText(line)}`).join("\n")
    : "> (새로 쓴 글 없이 답장만 왔어요)";
  return [
    `*${REPLY_ALERT_TITLE}*${marks.length ? ` (${marks.join(", ")})` : ""}`,
    [slackText(name), slackText(args.email), slackText(where)].filter(Boolean).join(" · "),
    reply,
    `<${agentPersonLink(args.origin, { id: args.personId, email: args.email })}|/ops #5에서 이 사람 보기>`,
  ].join("\n");
}
