/**
 * #5 replies: whether a mail that came into a team mailbox is a candidate's reply to an agent mail (or a bounce of
 * one). Pure, so tests pin the rules; reading the mailboxes and recording the reply are replies.server.ts.
 *
 * A reply is matched to the agent mail it answers:
 * 1. its In-Reply-To / References names the mail's RFC Message-ID (gtm_mails.rfc_message_id), or else
 * 2. it comes from the address the mail went to, within REPLY_WINDOW_DAYS after the mail, and its subject reads as
 *    a reply (a reply prefix, or the mail's own subject).
 * Automatic answers (out of office, vacation responders, mailing lists, no-reply senders) never count as replies.
 */
import { isLikelyAutomatedEmail, normalizeEmailAddress, stripQuotedEmailText } from "@/lib/email/parse";

export const REPLY_WINDOW_DAYS = 60;
export const REPLY_EXCERPT_CHARS = 500;
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

// "Re:", "RE[2]:", "Aw:", "Sv:", "답장:", "회신:", "回复:" ... at the start of a subject.
const REPLY_PREFIX = /^\s*(?:(?:re|aw|sv|vs|antw|odp|ynt|res)\s*(?:\[\d+\])?\s*[:：]|(?:답장|회신|답신|답변)\s*[:：]|(?:回复|回覆|答复)\s*[:：]?)/i;
const ANY_PREFIX = /^\s*(?:(?:re|aw|sv|vs|antw|odp|ynt|res|fwd?|tr)\s*(?:\[\d+\])?\s*[:：]|(?:답장|회신|답신|답변|전달)\s*[:：]|(?:回复|回覆|答复|转发)\s*[:：]?)\s*/i;

/** A subject without its reply / forward prefixes, spaces collapsed, lower-cased. */
function subjectCore(subject: string | null | undefined): string {
  let value = String(subject ?? "").replace(/\s+/g, " ").trim();
  for (let guard = 0; guard < 10 && ANY_PREFIX.test(value); guard += 1) value = value.replace(ANY_PREFIX, "");
  return value.trim().toLowerCase();
}

/** Whether a subject reads as a reply to a mail with `sentSubject`: a reply prefix, or the mail's own subject in it. */
export function isReplySubject(subject: string | null | undefined, sentSubject: string | null | undefined): boolean {
  if (REPLY_PREFIX.test(String(subject ?? ""))) return true;
  const sent = subjectCore(sentSubject);
  return sent.length >= 4 && subjectCore(subject).includes(sent);
}

// Out-of-office and vacation answers by subject: "Automatic reply:", "자동 회신:", "부재중", "Out of Office" ...
const AUTO_REPLY_SUBJECT = /^\s*(?:re\s*[:：]\s*)?\[?\s*(?:automatic reply|auto(?:matic)?[- ]?(?:reply|response)|autoreply|out of (?:the )?office|ooo\b|abwesenheit|réponse automatique|respuesta automática|自动回复|自動回覆|自動応答|自動返信|자동\s*(?:회신|응답|답장|답신)|부재\s*중)/i;

/**
 * Why an inbound mail is an automatic one and not a person's reply, or null: a no-reply / mailer-daemon sender,
 * Auto-Submitted, Precedence bulk / list / auto_reply, X-Autoreply / X-Autorespond, a mailing list, or an
 * out-of-office subject.
 */
export function autoReplyReason(args: {
  fromEmail: string | null | undefined; subject: string | null | undefined; headers: Record<string, string>;
}): string | null {
  const automated = isLikelyAutomatedEmail({ fromEmail: args.fromEmail, headers: args.headers });
  if (automated) return automated;
  const header = (name: string) =>
    Object.entries(args.headers).find(([key]) => key.toLowerCase() === name)?.[1]?.trim().toLowerCase() ?? "";
  if (header("precedence") === "auto_reply") return "auto_submitted";
  if (header("x-autoreply") || header("x-autorespond") || header("x-autoresponder")) return "auto_submitted";
  if (AUTO_REPLY_SUBJECT.test(String(args.subject ?? ""))) return "out_of_office";
  return null;
}

/** Whether an inbound mail may be a delivery report (worth reading in full to check): by its type or its sender. */
export function maybeDeliveryReport(args: { fromEmail: string | null | undefined; headers: Record<string, string> }): boolean {
  const contentType = Object.entries(args.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
  if (/multipart\/report|delivery-status/i.test(contentType)) return true;
  return /^(?:mailer-daemon|postmaster)@/i.test(String(args.fromEmail ?? ""));
}

// Where the quoted earlier mail starts in a reply: Gmail / Apple Mail "On … wrote:" (may wrap over lines), Gmail in
// Korean "2026년 11월 17일 (화) … 님이 작성:", Outlook's separator and header block, forwarded / original markers,
// a signature, and mobile footers.
const QUOTE_STARTS: RegExp[] = [
  /^[ \t]*On\b[^\n]*(?:\n[^\n]*){0,2}?wrote:[ \t]*$/im,
  /^[ \t]*\d{4}\s*년[^\n]*(?:\n[^\n]*){0,2}?작성\s*:[ \t]*$/m,
  /^[ \t]*-{2,}\s*(?:original message|forwarded message|원본 메시지|전달된 메시지)/im,
  /^[ \t]*_{8,}[ \t]*$/m,
  /^[ \t]*(?:sent from my\b[^\n]*|[^\n]{0,40}에서 보냄)[ \t]*$/im,
  /^-- ?$/m,
];
// Outlook's "From: … / 보낸 사람: …" block, only after the reply's own text.
const HEADER_BLOCK = /^[ \t]*(?:from|보낸\s*사람)\s*:\s.+$/im;

/**
 * The reply's own new text, quoted history and signature cut off, at most `max` characters (an ellipsis when cut),
 * for the person row (reply_text) and the screen.
 */
export function replyExcerpt(body: string | null | undefined, max = REPLY_EXCERPT_CHARS): string {
  let text = String(body ?? "").replace(/\r\n?/g, "\n");
  let cut = text.length;
  for (const pattern of QUOTE_STARTS) {
    const index = text.search(pattern);
    if (index >= 0 && index < cut) cut = index;
  }
  const header = text.search(HEADER_BLOCK);
  if (header > 0 && header < cut && text.slice(0, header).trim()) cut = header;
  text = stripQuotedEmailText(text.slice(0, cut))
    .split("\n").map((line) => line.replace(/[ \t]+$/g, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** One agent mail a reply may answer (gtm_mails, campaign 'agent', sent). */
export type AgentSentMail = {
  mailId: string;
  personId: string;
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

/**
 * The agent mail an inbound mail replies to, or null: by Message-ID first (In-Reply-To / References), else by the
 * sender's address within REPLY_WINDOW_DAYS with a reply-like subject. The latest such mail wins (a follow-up over
 * the first mail). Automatic mails are checked before (autoReplyReason).
 */
export function matchAgentReply(inbound: InboundMail, mails: readonly AgentSentMail[]): AgentReplyMatch | null {
  const referenced = new Set(referencedMessageIds(inbound.inReplyTo, inbound.references));
  const byId = sentBefore(mails, inbound.receivedAt)
    .filter((mail) => mail.rfcMessageId && referenced.has(mail.rfcMessageId))
    .sort(latestFirst)[0];
  if (byId) return { mail: byId, by: "message_id" };
  const from = normalizeEmailAddress(inbound.fromEmail);
  if (!from) return null;
  const byFrom = sentBefore(mails, inbound.receivedAt, REPLY_WINDOW_DAYS)
    .filter((mail) => mail.toEmail.trim().toLowerCase() === from && isReplySubject(inbound.subject, mail.subject))
    .sort(latestFirst)[0];
  return byFrom ? { mail: byFrom, by: "from" } : null;
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
