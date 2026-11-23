/**
 * Sign-up from a #5 mail (design §2 "가입할 때 하는 일", §3 "가입 링크와 가입 후 첫 화면"): pure rules and the move
 * itself with its I/O injected (signupMove.server.ts wires the database).
 *   - The link Ashley sends carries a next step: /jobs/invite/<gtm_mails.id>?next=<step>&posting=<url>&question=<text>.
 *   - The mail conversation moves into the person's Harper chat only when the account's verified email is the address
 *     the mail went to. Harper has no talent-side code to prove another address (11/20), so a different address gets
 *     the postings (claimGtmCandidateMail, as before) and an entry record, never the conversation.
 *   - "들어온 이유" is the existing entry record (talent_activity_events 'official_jobs_signup_intent'), which Harper's
 *     prompt reads (career/postOnboardingContext.ts fetchCareerEntrySource).
 */
import type { AgentOffer } from "./channels";
import type { ConversationStore, HistoryEntry } from "./conversation";
import { upcomingEvents } from "./events";
import type { AgentOfferEvent } from "./types";

/**
 * Where sign-up from a mail goes first, by what the first mail offered (Shaun 11/23): a coaching mail offered career
 * help, so Harper's chat (상담 먼저); a posting or general mail its postings in 내 기회 (기회 먼저, as before). Not a
 * link step: Ashley's links keep SIGNUP_STEPS.
 */
export type SignupLanding = "chat" | "opportunities";

export function signupLanding(offer: AgentOffer | null | undefined): SignupLanding {
  return offer === "coaching" ? "chat" : "opportunities";
}

/** The next steps Ashley's sign-up link can carry (?next=). */
export const SIGNUP_STEPS = ["connect_request", "apply_on_behalf", "opportunities_first", "onboarding"] as const;
export type SignupStep = (typeof SIGNUP_STEPS)[number];

export type SignupNext = {
  /** null: no step or one this code does not know (the person still signs up; Harper starts as usual). */
  step: SignupStep | null;
  /** The posting the step is about: its URL as the mail's postings snapshot stores it. */
  posting: string | null;
  /** The candidate's question for the company, one nameless sentence Ashley wrote. */
  question: string | null;
};

export const SIGNUP_QUESTION_MAX = 300;
const POSTING_URL_MAX = 2_000;
const GTM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function oneLine(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  // Control characters and line breaks would break the record's one-line fields and the Slack line.
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function postingUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > POSTING_URL_MAX) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The link's next step, posting and question, cleaned; unknown or missing values become null. */
export function parseSignupNext(input: { next?: unknown; posting?: unknown; question?: unknown } | null | undefined): SignupNext {
  const raw = typeof input?.next === "string" ? input.next.trim().toLowerCase() : "";
  const step = (SIGNUP_STEPS as readonly string[]).includes(raw) ? (raw as SignupStep) : null;
  return { step, posting: postingUrl(input?.posting), question: oneLine(input?.question, SIGNUP_QUESTION_MAX) };
}

function searchOf(path: string | null | undefined) {
  try {
    return new URL(path ?? "", "https://link.invalid").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

/** The mail id in a landing path (/career?gtm=<id>&…), as sign-up attribution records it. */
export function gtmMailIdFromPath(path: string | null | undefined): string | null {
  const id = searchOf(path).get("gtm")?.trim() ?? "";
  return GTM_ID.test(id) ? id.toLowerCase() : null;
}

export function signupNextFromPath(path: string | null | undefined): SignupNext {
  const params = searchOf(path);
  return parseSignupNext({ next: params.get("next"), posting: params.get("posting"), question: params.get("question") });
}

/** The query that carries a next step on to the next page ("" when there is nothing to carry). */
export function signupNextQuery(next: SignupNext): string {
  const params = new URLSearchParams();
  if (next.step) params.set("next", next.step);
  if (next.posting) params.set("posting", next.posting);
  if (next.question) params.set("question", next.question);
  return params.toString();
}

const normalizeAddress = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** The account is the mail's recipient: the same address, and the account's email is verified. */
export function sameMailAddress(account: { email: string | null; emailConfirmed: boolean } | null, recipient: string | null): boolean {
  const address = normalizeAddress(recipient);
  return Boolean(account?.emailConfirmed && address && normalizeAddress(account.email) === address);
}

export type MailPosting = { url: string | null; roleId: string | null; kind?: string | null; companyName?: string | null; title?: string | null };

function sameUrl(left: string | null | undefined, right: string | null | undefined) {
  const clean = (value: string | null | undefined) => (value ?? "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  return Boolean(clean(left)) && clean(left) === clean(right);
}

/** The mail's posting the link points at (by URL); null when the link names none or a posting the mail did not carry. */
export function stepPosting(postings: readonly MailPosting[] | null | undefined, url: string | null): MailPosting | null {
  if (!url) return null;
  return (postings ?? []).find((posting) => sameUrl(posting.url, url)) ?? null;
}

const STEP_LABEL: Record<"ko" | "en", Record<SignupStep, string>> = {
  ko: {
    connect_request: "이 공고 회사에 연결 요청",
    apply_on_behalf: "이 공고 하퍼가 대신 지원",
    opportunities_first: "내 기회에서 공고 먼저 보기",
    onboarding: "하퍼 시작하기",
  },
  en: {
    connect_request: "ask for an introduction to this company",
    apply_on_behalf: "have Harper apply to this posting",
    opportunities_first: "see the postings in My opportunities first",
    onboarding: "get started with Harper",
  },
};

/** talent_messages.payload key that marks the moved block (one per address and account). */
export const MAIL_CONVERSATION_PAYLOAD_KEY = "gtmMailConversation";
const ENTRY_TEXT_MAX = 3_000;
const BLOCK_MAX = 16_000;

function day(at: string, locale: "ko" | "en") {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(date);
}

function postingName(posting: MailPosting | null) {
  return posting ? [posting.companyName, posting.title].map((part) => part?.trim()).filter(Boolean).join(" · ") : "";
}

/**
 * The chat block the mail conversation becomes (one assistant 'system' message, the type Harper's own notes use, so
 * the chat shows it as a Harper bubble and the model reads it as earlier records). Oldest mail first.
 */
export function mailConversationBlock(args: {
  entries: readonly HistoryEntry[]; locale: "ko" | "en"; next: SignupNext; posting: MailPosting | null; withQuestion: boolean;
}): string {
  const ko = args.locale === "ko";
  const head = ko
    ? ["**Ashley와 나눈 메일 (가입 전)**", "하퍼 팀 Ashley Kim(Talent Partner)과 가입 전에 메일로 나눈 이야기예요. 가입하시면서 하퍼 대화로 옮겼어요. 지난 기록이고, 새 요청이나 동의는 아니에요."]
    : ["**Your emails with Ashley (before sign-up)**", "What you and Ashley Kim (Talent Partner, Harper) wrote by email before you signed up, moved into Harper when you signed up. Earlier records, not a new request or consent."];
  const entries = [...args.entries].sort((left, right) => left.at.localeCompare(right.at)).map((entry) => {
    const who = entry.author === "counterpart" ? (ko ? "보내신 답장" : "You replied") : (ko ? "Ashley가 보낸 메일" : "Ashley wrote");
    const text = entry.text.trim().length > ENTRY_TEXT_MAX ? `${entry.text.trim().slice(0, ENTRY_TEXT_MAX)}…` : entry.text.trim();
    const subject = entry.subject.trim() ? ` · ${entry.subject.trim()}` : "";
    return `**${day(entry.at, args.locale)} · ${who}**${subject}\n${text}`;
  });
  const name = postingName(args.posting);
  const tail = [
    args.next.step
      ? `${ko ? "가입 링크에 담긴 다음 단계" : "Next step in your sign-up link"}: ${STEP_LABEL[args.locale][args.next.step]}${name ? ` (${name})` : ""}`
      : "",
    args.withQuestion && args.next.question ? `${ko ? "회사에 물어볼 질문" : "Your question for the company"}: ${args.next.question}` : "",
  ].filter(Boolean);
  let body = [head.join("\n"), ...entries, ...(tail.length ? [tail.join("\n")] : [])].join("\n\n");
  if (body.length > BLOCK_MAX) body = `${body.slice(0, BLOCK_MAX - 1)}…`;
  return body;
}

/** The entry record's source: which mail, which step, which Role (customer Roles get the company intro question). */
export function intentSource(mailId: string, step: SignupStep | null, roleId: string | null) {
  return `gtm_agent_mail:${mailId}:${step ?? "none"}:${roleId ?? "-"}`;
}

export function parseIntentSource(source: string | null | undefined) {
  const match = /^gtm_agent_mail:([0-9a-f-]{36}):([a-z_]+):([0-9a-f-]{36}|-)$/i.exec(source ?? "");
  if (!match) return null;
  const step = (SIGNUP_STEPS as readonly string[]).includes(match[2]) ? (match[2] as SignupStep) : null;
  return { mailId: match[1].toLowerCase(), step, roleId: match[3] === "-" ? null : match[3].toLowerCase() };
}

const QUESTION_MARK = "Question for the company: ";
// insertTalentActivityEvent keeps 1,200 characters on one line; the question goes last, so a long URL is left out.
const SUMMARY_MAX = 1_200;
const SUMMARY_URL_MAX = 300;

const EVENT_NAME_MAX = 120;

/** A mail event as the entry record names it: "Title (2026-12-03, Online)". */
function eventLine(event: AgentOfferEvent) {
  const title = event.title.replace(/\s+/g, " ").trim().slice(0, EVENT_NAME_MAX);
  const where = event.online ? "online" : event.place?.replace(/\s+/g, " ").trim().slice(0, 60) ?? "";
  return `${title} (${[event.startsAt.slice(0, 10), where].filter(Boolean).join(", ")})`;
}

/**
 * What the first mail offered, for Harper's chat (Shaun 11/23): a coaching mail's career help (start there), a general
 * mail's postings and events (the events are in their 볼 만한 것 list too). Nothing for a posting mail, as before.
 */
function offerLine(offer: AgentOffer | null | undefined, events: readonly AgentOfferEvent[]) {
  if (offer === "coaching") {
    return "The email offered career help, no postings: résumé or portfolio feedback and advice on their next step in this chat. They came for that, so start with it, not with postings.";
  }
  if (offer !== "general") return "";
  return [
    "The email offered fitting postings and upcoming events, and that Harper keeps sending fitting postings and can apply on their behalf once they join.",
    events.length ? `Events in the email (also saved to their "볼 만한 것" list): ${events.slice(0, 3).map(eventLine).join("; ")}.` : "",
  ].filter(Boolean).join(" ");
}

/**
 * The entry record's text for Harper's prompt (English, as the other entry sources); one line, the question last.
 * `offer`/`events`: what the first mail offered (signupLanding); a posting mail reads as before.
 */
export function intentSummary(args: {
  next: SignupNext; posting: MailPosting | null; sameAddress: boolean; offer?: AgentOffer | null; events?: readonly AgentOfferEvent[];
}) {
  const name = postingName(args.posting);
  const url = args.posting?.url && args.posting.url.length <= SUMMARY_URL_MAX ? ` (${args.posting.url})` : "";
  const text = [
    args.sameAddress
      ? "Entry from Ashley's email conversation (Harper Talent Partner) before sign-up; that email history is in this chat."
      : "Entry from a link in a Harper outreach email that went to a different address; that email conversation is not shared with this account.",
    offerLine(args.offer, args.events ?? []),
    args.next.step ? `Next step in the link: ${STEP_LABEL.en[args.next.step]}.` : "",
    name ? `Posting: ${name}${url}.` : "",
    "This navigation records interest, not introduction or profile-sharing consent.",
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const question = args.sameAddress && args.next.question ? ` ${QUESTION_MARK}${args.next.question}` : "";
  return `${text.slice(0, SUMMARY_MAX - question.length)}${question}`;
}

export function questionFromIntentSummary(summary: string | null | undefined): string | null {
  const at = (summary ?? "").lastIndexOf(QUESTION_MARK);
  return at < 0 ? null : oneLine((summary ?? "").slice(at + QUESTION_MARK.length), SIGNUP_QUESTION_MAX);
}

/**
 * The questions to attach to the 09:00 company Slack intro, by `${roleId}:${talentId}` (the intro's own pair key).
 * Rows newest first; the newest question for a pair wins.
 */
export function introQuestions(rows: ReadonlyArray<{ talent_id: string; source: string | null; summary: string | null }>) {
  const questions = new Map<string, string>();
  for (const row of rows) {
    const source = parseIntentSource(row.source);
    const question = questionFromIntentSummary(row.summary);
    if (!source?.roleId || !question) continue;
    const key = `${source.roleId}:${row.talent_id}`;
    if (!questions.has(key)) questions.set(key, question);
  }
  return questions;
}

/** The intro's extra line under that candidate (Slack mrkdwn, escaped). */
export function introQuestionLine(question: string, locale: "ko" | "en") {
  const text = question.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `${locale === "en" ? "*The candidate asks:*" : "*후보가 회사에 묻는 것:*"} ${text}`;
}

export type SignupMail = {
  id: string; toEmail: string; postings: MailPosting[];
  /** What the first mail offered (gtm_agent_people.message_kind; missing: posting) and a general mail's events. */
  offer?: AgentOffer | null;
  events?: AgentOfferEvent[];
};

const ONLINE_LABEL = { ko: "온라인", en: "Online" } as const;
const CONTENT_REASON = { ko: "메일로 소개해 드린 행사예요.", en: "An event from the email Harper sent you." } as const;

/**
 * A general mail's events as items for the person's 볼 만한 것 list (manage_career_content_suggestion add, kind
 * event): the ones still to come at `now`, each with its page, why it fits and where. Dates as exact instants, as the
 * chat tool passes them.
 */
export function mailContentItems(events: readonly AgentOfferEvent[], args: { locale: "ko" | "en"; now: Date }): Array<Record<string, unknown>> {
  return upcomingEvents(events, args.now).flatMap((event) => {
    const title = event.title.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!title || !/^https?:\/\//i.test(event.url)) return [];
    const place = event.place?.replace(/\s+/g, " ").trim() || "";
    const location = event.online ? [place, ONLINE_LABEL[args.locale]].filter(Boolean).join(" · ") : place;
    const ends = event.endsAt ? Date.parse(event.endsAt) : NaN;
    return [{
      kind: "event", url: event.url, title,
      reason: event.why.replace(/\s+/g, " ").trim().slice(0, 400) || CONTENT_REASON[args.locale],
      ...(event.organizer?.trim() ? { source: event.organizer.trim().slice(0, 80) } : {}),
      startsAt: new Date(Date.parse(event.startsAt)).toISOString(),
      ...(Number.isFinite(ends) ? { endsAt: new Date(ends).toISOString() } : {}),
      ...(location ? { location: location.slice(0, 120) } : {}),
    }];
  });
}

export type SignupMoveDeps = {
  /** A #5 candidate mail that went out; null otherwise. */
  readMail(mailId: string): Promise<SignupMail | null>;
  /** The account's sign-in email and whether it is verified. */
  readAccount(userId: string): Promise<{ email: string | null; emailConfirmed: boolean } | null>;
  /** The reply pipeline's history for one address (never another address); null until it is wired. */
  history: ConversationStore["history"] | null;
  /** The person's Harper conversation (the given one when it is theirs). */
  conversationId(userId: string, preferred: string | null): Promise<string>;
  movedAlready(userId: string, address: string): Promise<boolean>;
  insertBlock(row: { userId: string; conversationId: string; content: string; payload: Record<string, unknown> }): Promise<void>;
  /** The entry records already written for this source (their summaries). */
  intentSummaries(userId: string, source: string): Promise<string[]>;
  recordIntent(row: { userId: string; conversationId: string; source: string; summary: string }): Promise<void>;
  /** Puts a posting the mail did not carry (one Ashley found again) into the person's opportunities. */
  addPosting?(userId: string, url: string): Promise<void>;
  /** The similar roles Ashley offered in this mail's thread (their URLs, from the person's timeline). */
  offeredPostings?(mailId: string): Promise<string[]>;
  /** Saves one of the mail's events in the person's 볼 만한 것 list (once per link; a dismissed one stays dismissed). */
  addContent?(row: { userId: string; conversationId: string; item: Record<string, unknown> }): Promise<void>;
  now?(): Date;
};

export type SignupMoveResult = {
  status: "not_found" | "other_address" | "moved" | "already_moved" | "not_wired" | "no_history";
  conversationId: string | null;
};

/**
 * One call per sign-up touch (account creation, onboarding submit, the mail link's claim); safe to repeat: an entry
 * record is written once per mail·step·Role and text, and the conversation is moved once per address.
 */
export async function moveMailConversation(deps: SignupMoveDeps, args: {
  userId: string; mailId: string; next: SignupNext; locale: "ko" | "en"; conversationId?: string | null;
}): Promise<SignupMoveResult> {
  const mail = await deps.readMail(args.mailId);
  if (!mail) return { status: "not_found", conversationId: null };
  const account = await deps.readAccount(args.userId);
  const same = sameMailAddress(account, mail.toEmail);
  const posting = stepPosting(mail.postings, args.next.posting);
  // The postings the mail did not carry go into 내 기회 too: the link's own, and every similar role Ashley offered
  // in the thread (Shaun 11/21 16:53: the roles shown in the mail are there when they join).
  if (deps.addPosting) {
    const offered = deps.offeredPostings ? await deps.offeredPostings(mail.id).catch(() => [] as string[]) : [];
    const extra = [...(args.next.posting && !posting ? [args.next.posting] : []), ...offered]
      .filter((url, index, all) => !stepPosting(mail.postings, url) && all.findIndex((other) => stepPosting([{ url: other, roleId: null }], url)) === index);
    for (const url of extra) {
      await deps.addPosting(args.userId, url).catch((error) => console.error("[gtm-agent] signup posting", error));
    }
  }
  const conversationId = await deps.conversationId(args.userId, args.conversationId ?? null);
  // A general mail's events go to their 볼 만한 것 list, whichever address signed up (as the postings go to 내 기회).
  if (deps.addContent) {
    for (const item of mailContentItems(mail.events ?? [], { locale: args.locale, now: deps.now?.() ?? new Date() })) {
      await deps.addContent({ userId: args.userId, conversationId, item }).catch((error) => console.error("[gtm-agent] signup event", error));
    }
  }
  const source = intentSource(mail.id, args.next.step, posting?.kind === "external" ? null : posting?.roleId ?? null);
  const summary = intentSummary({ next: args.next, posting, sameAddress: same, offer: mail.offer, events: mail.events });
  // Once per text: a repeat touch adds nothing, but a later touch that carries the question (an earlier one may have
  // lost it) is recorded, and the newest record is the one the intro reads.
  const written = await deps.intentSummaries(args.userId, source);
  if (!written.some((item) => item.replace(/\s+/g, " ").trim() === summary)) {
    await deps.recordIntent({ userId: args.userId, conversationId, source, summary });
  }
  if (!same) return { status: "other_address", conversationId };
  const address = normalizeAddress(mail.toEmail);
  if (await deps.movedAlready(args.userId, address)) return { status: "already_moved", conversationId };
  if (!deps.history) return { status: "not_wired", conversationId };
  // Only what this address wrote and got: a reply from another address (a colleague it was forwarded to) stays out.
  const entries = (await deps.history(address)).filter((entry) => !entry.fromEmail);
  if (!entries.length) return { status: "no_history", conversationId };
  await deps.insertBlock({
    userId: args.userId, conversationId,
    content: mailConversationBlock({ entries, locale: args.locale, next: args.next, posting, withQuestion: true }),
    payload: {
      [MAIL_CONVERSATION_PAYLOAD_KEY]: {
        address, mailId: mail.id, entries: entries.length, step: args.next.step, postingUrl: posting?.url ?? args.next.posting,
        movedAt: (deps.now?.() ?? new Date()).toISOString(),
      },
    },
  });
  return { status: "moved", conversationId };
}
