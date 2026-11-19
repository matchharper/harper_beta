/**
 * #5 replies: whether a mail that came into a team mailbox is a candidate's reply to an agent mail (or a bounce of
 * one). Pure, so tests pin the rules; reading the mailboxes and recording the reply are replies.server.ts.
 *
 * A reply is matched to the agent mail it answers:
 * 1. its In-Reply-To / References names the mail's RFC Message-ID (gtm_mails.rfc_message_id), or else
 * 2. it comes from the address the mail went to, within REPLY_WINDOW_DAYS after the mail, and its subject reads as
 *    a reply (a reply prefix, or the mail's own subject).
 * Automatic answers (out of office, vacation responders, mailing lists, no-reply senders) never count as replies.
 *
 * Opt-outs: a reply that asks not to be contacted again (stopRequestIn), and a mail titled "unsubscribe" (what the
 * mailto in our List-Unsubscribe header makes a mail app send) from an address an agent mail went to
 * (matchAgentUnsubscribe), put the address on the shared opt-out list.
 *
 * Health: replyReadingTroubles says which mailboxes are not being read (an error on the last read, or no read for
 * REPLY_READ_STALE_MS), so /ops shows it and follow-ups wait (a follow-up could otherwise go to someone who already
 * answered or asked to stop).
 */
import { isLikelyAutomatedEmail, normalizeEmailAddress, stripQuotedEmailText } from "@/lib/email/parse";
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

// ---------------------------------------------------------------------------------------------------------------
// Opt-outs

// Asking not to be contacted again, in Korean and English, anywhere in the reply's own text.
const STOP_PHRASE = new RegExp([
  String.raw`연락\s*(?:하지\s*마|하지\s*말아|주지\s*마|그만|원치\s*않|원하지\s*않|사절|받고\s*싶지\s*않|안\s*받)`,
  String.raw`수신\s*거부|수신(?:을|은)?\s*(?:원하지\s*않|원치\s*않|하고\s*싶지\s*않)`,
  String.raw`그만\s*(?:보내|연락)`,
  String.raw`(?:메일|이메일|메시지|메세지)(?:을|를|은|는)?\s*(?:그만|보내지\s*마|받고\s*싶지\s*않|원하지\s*않|원치\s*않|사절)`,
  // "보내지 마" alone is also "그 링크만 보내지 마시고 …": only after "앞으로 / 더 이상 / 다시는 / 이제".
  String.raw`(?:앞으로는?|더\s*이상|더는|다시는|이제)\s+(?:[^\s.!?]{1,8}\s+){0,2}보내지\s*마`,
  String.raw`unsubscribe`,
  String.raw`opt[\s-]?(?:me\s+)?out\b`,
  String.raw`stop\s+(?:contacting|emailing|e-mailing|messaging|sending|spamming)`,
  String.raw`remove\s+me\b|take\s+me\s+off`,
  String.raw`(?:do\s+not|don'?t|never)\s+(?:contact|email|e-mail|message|mail)\s+me\b`,
  String.raw`no\s+more\s+(?:e-?mails|messages|mails)`,
].join("|"), "i");
// A reply that is only "그만" / "stop" and the like (on its own, "그만" is also "그만두다" and cannot be searched for).
const STOP_WHOLE = /^\s*(?:그만|그만요|그만해요?|그만하세요|그만해\s*주세요|그만\s*주세요|보내지\s*마(?:세요|요)?|stop|stop\s+it|stop\s+please|please\s+stop|remove)\s*[.!~。]*\s*$/i;

/** The words in `text` that ask not to be contacted again, or null. */
export function stopRequestPhrase(text: string | null | undefined): string | null {
  const value = String(text ?? "");
  if (STOP_WHOLE.test(value)) return value.trim();
  return value.match(STOP_PHRASE)?.[0].trim() ?? null;
}

/** Whether a reply asks not to be contacted again. */
export function looksLikeStopRequest(text: string | null | undefined): boolean {
  return stopRequestPhrase(text) !== null;
}

// Our mails' own opt-out line (gtmPlays/shared.ts gtmOptOutMarkdown): quoted back in a reply, it is not the person's
// (the English one says "unsubscribe here", maybe on the next line when the quote wraps).
const OWN_OPT_OUT_LINES = [
  /이런\s*메일을\s*더\s*받지\s*않으시려면[^\n]*/g,
  /if\s+you['’]?d\s+rather\s+not\s+hear\s+from\s+harper\s+again,?(?:\s*\[?\s*unsubscribe\s+here\b)?[^\n]*/gi,
];

/**
 * The words of a reply that ask not to be contacted again, or null: in the reply's own text (replyExcerpt, our
 * opt-out line taken out) or in a subject the person wrote (the agent mail's own subject taken out).
 */
export function stopRequestIn(args: {
  text: string | null | undefined; subject?: string | null; sentSubject?: string | null;
}): string | null {
  let text = String(args.text ?? "");
  for (const line of OWN_OPT_OUT_LINES) text = text.replace(line, " ");
  const inText = stopRequestPhrase(text);
  if (inText) return inText;
  const sent = subjectCore(args.sentSubject);
  let subject = subjectCore(args.subject);
  if (sent) subject = subject.split(sent).join(" ").trim();
  return subject ? stopRequestPhrase(subject) : null;
}

/**
 * Whether a subject is an opt-out by mail: "unsubscribe" (the mailto in the List-Unsubscribe header of every agent
 * mail), or "수신 거부", alone (a reply prefix allowed).
 */
export function isUnsubscribeSubject(subject: string | null | undefined): boolean {
  return /^(?:unsubscribe(?:\s+me)?|수신\s*거부(?:합니다|할게요|해\s*주세요)?)[.!]*$/i.test(subjectCore(subject));
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

/**
 * The #gtm-talent message for a candidate's reply, posted as it is read (Shaun 11/18: "메일답장은 on the fly"): who,
 * the address and where they were found, the start of the reply quoted, and the /ops #5 link. `stopWords` (from
 * stopRequestIn) marks a reply that asks not to be contacted again.
 */
export function replyAlertText(args: {
  name: string | null; email: string; source: string | null; isTest: boolean; reply: string; stopWords: string | null;
  origin: string;
}): string {
  const marks = [args.stopWords ? "연락 그만 요청" : "", args.isTest ? "테스트" : ""].filter(Boolean);
  const who = slackText(args.name?.trim() || args.email);
  let where = args.source ?? "";
  try {
    where = args.source === EXPLORE_SOURCE ? "열린 웹" : args.source ? signalSourceInfo(args.source).label : "";
  } catch {
    // An older source id: shown as it is.
  }
  const reply = args.reply.trim()
    ? args.reply.trim().split("\n").map((line) => `> ${slackText(line)}`).join("\n")
    : "> (새로 쓴 글 없이 답장만 왔어요)";
  return [
    `[#5 답장] ${who}${marks.length ? ` (${marks.join(", ")})` : ""}`,
    [slackText(args.email), slackText(where)].filter(Boolean).join(" · "),
    reply,
    `<${new URL("/ops/gtm-plays?tab=5", args.origin).toString()}|/ops #5에서 보기>`,
  ].join("\n");
}
