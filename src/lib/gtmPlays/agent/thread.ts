/**
 * #5 로그 · 사람, the person on the right (pure, no I/O): everything that happened with one candidate as one table in one
 * time order (Shaun 11/22 15:46): 날짜 · 누가 · 무엇 · 내용. Built from plain facts (threadViews.server.ts reads them):
 * found → first mail → click / sign-up → their reply → Ashley's decision (its own row, right under the mail it judged)
 * → Ashley's reply → … → the company mail about them → the company's answer → what was passed on to them → the company
 * signing up → its connection request, and the messages their Harper account exchanged with customer companies inside
 * Harper. Company rows are not a section of their own: they sit in the same time order with the company in 누가.
 * An answer's 무엇 carries its link ("답장 ↳ 11.20 답장에", "답 ↳ 11.24 회사 메일에").
 *
 * The list line (지금 · 마지막) is the latest row, in the numbers' own column words where it is one of them.
 */
import type { ConversationMessage, InterestSignal } from "./conversation";
import type { CompanyMailFacts } from "./companyMail";
import {
  awaitingHuman, DECISION_LABEL, MAIL_KIND_LABEL, mailStatusLabel, SEND_STATUS_LABEL, type AgentMailKind,
} from "./conversationView";
import type { FunnelColumn } from "./funnel";
import type { AgentEventKind, AgentPerson, AgentPostingKind } from "./types";

// ---------------------------------------------------------------------------------------------------------------
// Facts (what the server reads)

export type ThreadPostingName = { companyName: string; title: string; kind: AgentPostingKind | null };

export type ThreadPerson = Pick<
  AgentPerson,
  "id" | "createdAt" | "source" | "method" | "searchQuery" | "signalText" | "signalUrl" | "signalAt" | "signalScore"
  | "matchScore" | "profileUrl" | "email" | "mailId" | "followupMailId" | "events"
>;

/** A gtm_mails mail to the person (their first and follow-up mails, any other mail to their address), as it went out. */
export type ThreadMail = {
  id: string; kind: AgentMailKind; subject: string; textBody: string; html: string | null; toEmail: string; fromEmail: string;
  status: string; deliveryStatus: string | null; deliveryEventAt: string | null; sentAt: string; firstOpenedAt: string | null;
  openCount: number; unsubscribedAt: string | null;
  /** 가입: the account made from this mail's link, or the mail's claim (signups.server.ts). */
  signedUpAt: string | null;
  /** The postings the mail proposed (gtm_mails.postings snapshot). */
  postings: ThreadPostingName[];
  /** Its Message-ID: a reply names it in In-Reply-To. */
  rfcMessageId: string | null;
};

/** A gtm_agent_messages row (theirs, or of a company thread about them), with the inbound mail an Ashley reply answers. */
export type ThreadMessage = Pick<
  ConversationMessage,
  "id" | "personId" | "counterpartKind" | "counterpartEmail" | "fromEmail" | "author" | "direction" | "gmailThreadId"
  | "rfcMessageId" | "inReplyTo" | "subject" | "bodyText" | "newText" | "rootMailId" | "decision" | "decisionReason"
  | "signals" | "answeredByMessageId" | "sendStatus" | "providerMessageId" | "error" | "occurredAt"
> & {
  answersMessageId: string | null;
  /** When Ashley decided on it (null: undecided, or not kept). */
  decidedAt: string | null;
  /**
   * Closed without a reply of its own because the same address wrote again and one reply answered them together
   * (ashleyAgent.ts SUPERSEDED_REASON; the server reads it, so this file stays free of the reply agent's code).
   */
  answeredWithLater: boolean;
};

/** A company mail (gtm_mails audience company) whose company_mail.interestedPersonIds holds the person. */
export type ThreadCompanyMail = {
  id: string; toEmail: string; subject: string; sentAt: string; status: string; deliveryStatus: string | null;
  companyName: string; postingTitle: string | null; postingUrl: string | null; rfcMessageId: string | null;
  facts: Partial<Pick<CompanyMailFacts, "interestedPersonIds" | "newPersonIds" | "askedPersonIds" | "lines" | "threadRootId">> | null;
  /** The company signed up from this mail (gtm_mails.claimed_at), and the workspace it made. */
  claimedAt: string | null; workspaceName: string | null;
};

/** gtm_agent_relays: a company's words (or wish to talk) passed to the person, once per company address. */
export type ThreadRelay = {
  companyEmail: string; kind: string; companyMailId: string | null; inboundMessageId: string | null; createdAt: string;
  /** The person joined Harper after it and a person on the team was asked to connect them (ashleyHandoff.server.ts). */
  joinedNotedAt: string | null;
};

/** external_intro_requests: a company asked on Harper to be connected with the person (Ashley's 외부 후보 card). */
export type ThreadIntroRequest = {
  id: string; companyMailId: string | null; status: string; createdAt: string; invitedAt: string | null;
  acceptedAt: string | null; connectedAt: string | null; errorCode: string | null;
  /** Why Ashley did not tell the person herself (result.reason), and the mail she sent (result.providerMessageId). */
  reason: string | null; providerMessageId: string | null;
  appeal: string | null; companyName: string | null; roleName: string | null;
};

/** agent_contact_messages of their Harper account: their Harper agent and a customer company, inside Harper. */
export type ThreadHarperMessage = {
  id: string; rootId: string; direction: "to_company" | "to_talent"; body: string; createdAt: string; cancelledAt: string | null;
  companyName: string | null; roleName: string | null;
};

/** A recorded change of a proposed posting's recommendation stage (saved / applied / connected …) on Harper. */
export type ThreadStage = { key: string; stage: string; at: string; companyName: string | null; roleName: string | null };

/** 회사 연결: a proposed posting's company connected with them (company_intro_candidates). */
export type ThreadConnection = { key: string; at: string; companyName: string | null; roleName: string | null };

export type ThreadFacts = {
  person: ThreadPerson;
  /** The postings proposed to them (their first mail shows them when its own snapshot is missing). */
  postings: readonly ThreadPostingName[];
  mails: readonly ThreadMail[];
  messages: readonly ThreadMessage[];
  companyMails: readonly ThreadCompanyMail[];
  relays: readonly ThreadRelay[];
  introRequests: readonly ThreadIntroRequest[];
  harperMessages: readonly ThreadHarperMessage[];
  stages: readonly ThreadStage[];
  connections: readonly ThreadConnection[];
};

// ---------------------------------------------------------------------------------------------------------------
// The table

/** 누가: 에이전트 (our automated mails and recorded facts), Ashley, the candidate, a company, Ashley → a company, 운영팀, 하퍼 안. */
export type ThreadWho =
  | { kind: "agent" } | { kind: "ashley" } | { kind: "candidate" } | { kind: "company"; name: string }
  | { kind: "ashleyToCompany"; name: string } | { kind: "team" } | { kind: "harper" };

export type ThreadRowKind =
  | "found" | "step" | "mail" | "delivery" | "clicked" | "signed_up" | "unsubscribed" | "inbound" | "decision" | "ashley"
  | "human" | "company_mail" | "company_inbound" | "company_signup" | "relay" | "intro_request" | "intro_step"
  | "harper_message" | "stage" | "connected";

/** Another row, by its key (the screen links to it) and time. */
export type ThreadRef = { key: string; at: string };

/** What a row answers or points at: "↳ 11.20 답장에" (the dates, then the words). */
export type ThreadLink = { refs: ThreadRef[]; words: string };

export type ThreadRow = {
  key: string;
  at: string;
  who: ThreadWho;
  kind: ThreadRowKind;
  /** 무엇 in plain words; null for a step of the person's own timeline, which the screen names (labels.ts EVENT_LABEL). */
  what: string | null;
  step: { kind: AgentEventKind; note: string | null } | null;
  /** After 무엇: what it answers ("답장 ↳ 11.20 답장에"), or where a mail was answered with a later one. */
  link: ThreadLink | null;
  /** 내용's first, quiet line (subject, addresses, company · posting). */
  detail: string | null;
  /** The real text: their mail, Ashley's reply or reason, a message. */
  text: string | null;
  /** What is wrong, or a short fact under the text (red with trouble). */
  note: string | null;
  /** Red: something is wrong (Shaun 11/17: red text only then). */
  trouble: boolean;
  /** A decision row: the interest Ashley read in the mail. */
  signals: string[];
  /** A gtm_mails mail of the person (the screen shows it as sent; the first mail with its postings and 맞음 / 안 맞음). */
  mailId: string | null;
  postings: ThreadPostingName[];
  /** 찾음: where and how they were found. */
  found: {
    source: string; method: string; query: string | null; signalText: string | null; signalUrl: string | null;
    signalAt: string | null; profileUrl: string | null; signalScore: number | null; matchScore: number | null;
  } | null;
};

/** 지금 on the list: the numbers' column the latest row is, else its words, else its timeline step. */
export type ThreadColumn = FunnelColumn;

/** The list line: the latest row (지금) and its time (마지막). */
export type ThreadSummary = { at: string; column: ThreadColumn | null; words: string | null; step: AgentEventKind | null; trouble: boolean };

export type PersonThread = { rows: ThreadRow[]; summary: ThreadSummary | null };

/**
 * A queued Ashley reply is written to go at once (Shaun 11/22: check, write, send); the next tick sends one whose send
 * was cut off. Still queued after a day, it did not go: red.
 */
export const QUEUED_LATE_MS = 86_400_000;

/** saved_stage words (talent_opportunity_recommendation): what the person did with the posting on Harper. */
export const STAGE_WORDS: Record<string, string> = {
  saved: "저장", applied: "지원", connected: "연결 수락", offer: "제안 받음", accepted: "수락",
};

/** 누가 in words; the candidate by the name the screen shows for them (labels.ts personName). */
export function whoLabel(who: ThreadWho, candidateName: string): string {
  switch (who.kind) {
    case "agent": return "에이전트";
    case "ashley": return "Ashley";
    case "candidate": return candidateName;
    case "company": return who.name;
    case "ashleyToCompany": return `Ashley → ${who.name}`;
    case "team": return "운영팀";
    case "harper": return "하퍼 안";
  }
}

/** "11.20": a time's Korea-time month and day, as the links and the list's 마지막 show it. */
export function kstMonthDay(value: string | null | undefined): string {
  const ms = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(ms)) return "";
  const kst = new Date(ms + 9 * 3_600_000);
  return `${kst.getUTCMonth() + 1}.${kst.getUTCDate()}`;
}

const time = (value: string | null | undefined) => {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : 0;
};
const lower = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
const rfcKey = (value: string | null | undefined) => lower(value).replace(/^[<\s]+|[>\s]+$/g, "");
const ref = (row: Pick<ThreadRow, "key" | "at">): ThreadRef => ({ key: row.key, at: row.at });
const textOf = (message: Pick<ThreadMessage, "newText" | "bodyText">) => (message.newText?.trim() || message.bodyText?.trim() || null);
const joined = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(" · ") || null;

/** Same moment: found, a step, our mail, what they did with it, their reply, the answer to it, what came after. */
const RANK: Record<ThreadRowKind, number> = {
  found: 0, step: 1, mail: 2, company_mail: 2, delivery: 3, clicked: 3, signed_up: 4, company_signup: 4, unsubscribed: 5,
  inbound: 6, company_inbound: 6, harper_message: 6, intro_request: 6, decision: 7, ashley: 8, human: 8, relay: 8,
  intro_step: 9, stage: 9, connected: 10,
};

const byTime = (a: ThreadRow, b: ThreadRow) => (time(a.at) - time(b.at)) || (RANK[a.kind] - RANK[b.kind]) || a.key.localeCompare(b.key);

function row(base: Pick<ThreadRow, "key" | "at" | "who" | "kind"> & Partial<ThreadRow>): ThreadRow {
  return {
    what: null, step: null, link: null, detail: null, text: null, note: null, trouble: false, signals: [], mailId: null,
    postings: [], found: null, ...base,
  };
}

/** "관심: 고객사 A · 백엔드 · 질문: … · 회사에 요약 보내도 된다고 함": one interest Ashley read in their mail. */
function signalWords(signal: InterestSignal): string {
  return [
    `관심: ${[signal.companyName, signal.postingTitle].filter(Boolean).join(" · ")}`,
    signal.question ? `질문: ${signal.question}` : null,
    signal.summaryConsent ? "회사에 요약 보내도 된다고 함" : null,
  ].filter(Boolean).join(" · ");
}

/** The person's own work steps never stand for the line's 지금 (a profile read, a lookup, a note). */
const QUIET_STEPS: ReadonlySet<AgentEventKind> = new Set(["note", "profile", "email_lookup", "found", "matched", "drafted", "approved"]);

/** The table, oldest first (each decision right under the mail it judged), and the list line's summary. */
export function buildPersonThread(facts: ThreadFacts, now: Date = new Date()): PersonThread {
  const { person } = facts;
  const rows: ThreadRow[] = [];
  const decisions = new Map<string, ThreadRow>();
  const companyMailById = new Map(facts.companyMails.map((mail) => [mail.id, mail]));
  const companyOf = (mailId: string | null | undefined, email?: string | null) =>
    (mailId ? companyMailById.get(mailId)?.companyName?.trim() : "") || lower(email).split("@")[1] || "회사";

  // --- 찾음 (an uploaded file's people were found by the person who uploaded it).
  const foundBy = person.events.find((event) => event.kind === "found")?.by;
  rows.push(row({
    key: "found", at: person.createdAt, who: foundBy && foundBy !== "agent" ? { kind: "team" } : { kind: "agent" }, kind: "found", what: "찾음",
    found: {
      source: person.source, method: person.method, query: person.searchQuery, signalText: person.signalText,
      signalUrl: person.signalUrl, signalAt: person.signalAt, profileUrl: person.profileUrl,
      signalScore: person.signalScore, matchScore: person.matchScore,
    },
  }));

  // --- Our mails to them, and what they did with each (클릭, 가입, 수신 거부; 반송 · 스팸 신고 · 발송 실패).
  const mails = [...new Map(facts.mails.filter((mail) => !companyMailById.has(mail.id)).map((mail) => [mail.id, mail])).values()];
  for (const mail of mails) {
    const key = `mail:${mail.id}`;
    const word = MAIL_KIND_LABEL[mail.kind];
    rows.push(row({
      key, at: mail.sentAt, who: { kind: "agent" }, kind: "mail", what: mail.status === "sent" ? word : `${word} · ${mailStatusLabel(mail.status, null)}`,
      detail: joined(mail.subject, `${mail.fromEmail} → ${mail.toEmail}`), text: mail.textBody?.trim() || null,
      trouble: mail.status === "failed" || mail.status === "blocked", mailId: mail.id,
      postings: mail.postings.length || mail.kind !== "first" ? mail.postings : [...facts.postings],
    }));
    if (mail.deliveryStatus) {
      rows.push(row({
        key: `${key}:delivery`, at: mail.deliveryEventAt ?? mail.sentAt, who: { kind: "agent" }, kind: "delivery",
        what: mailStatusLabel(mail.status, mail.deliveryStatus), detail: `${word} · ${mail.toEmail}`, trouble: true,
      }));
    }
    if (mail.firstOpenedAt) {
      rows.push(row({ key: `${key}:clicked`, at: mail.firstOpenedAt, who: { kind: "candidate" }, kind: "clicked", what: "클릭", detail: `${word}의 링크로 하퍼 페이지를 열었어요` }));
    }
    if (mail.signedUpAt) {
      rows.push(row({ key: `${key}:signed_up`, at: mail.signedUpAt, who: { kind: "candidate" }, kind: "signed_up", what: "가입", detail: `${word}의 링크로 하퍼에 가입했어요` }));
    }
    if (mail.unsubscribedAt) {
      rows.push(row({ key: `${key}:unsubscribed`, at: mail.unsubscribedAt, who: { kind: "candidate" }, kind: "unsubscribed", what: "수신 거부", detail: `${word}의 연락 받지 않기를 눌렀어요` }));
    }
  }

  // --- Conversation rows.
  const messages = [...new Map(facts.messages.map((message) => [message.id, message])).values()];
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const inbound = messages.filter((message) => message.author === "counterpart" && message.direction === "inbound");
  const replyOf = (message: ThreadMessage): ThreadMessage | null =>
    messages.find((item) => item.author === "ashley" && item.answersMessageId === message.id)
    ?? (message.answeredByMessageId ? messageById.get(message.answeredByMessageId) ?? null : null);
  const answeredBy = (reply: ThreadMessage): ThreadMessage | null =>
    (reply.answersMessageId ? messageById.get(reply.answersMessageId) ?? null : null)
    ?? inbound.find((item) => item.answeredByMessageId === reply.id) ?? null;
  /** Ashley's mail to them that passes on a company's mail (it answers the company's, not one of theirs). */
  const passesOn = (message: ThreadMessage) => {
    const answered = message.author === "ashley" ? answeredBy(message) : null;
    return answered?.counterpartKind === "company" && message.counterpartKind !== "company" ? answered : null;
  };
  const waiting = new Set(awaitingHuman(messages).map((item) => item.id));

  // Mails answered together (the mails one address sent since it was last answered get one reply, which answers the
  // newest; the others are closed with it): each closed mail belongs to the next mail of the same address not closed so.
  const sameSender = (a: ThreadMessage, b: ThreadMessage) => a.counterpartKind === b.counterpartKind && lower(a.counterpartEmail) === lower(b.counterpartEmail);
  const sortedInbound = [...inbound].sort((a, b) => (time(a.occurredAt) - time(b.occurredAt)) || a.id.localeCompare(b.id));
  const closedWith = new Map<string, ThreadMessage>();
  for (const [index, message] of sortedInbound.entries()) {
    if (!message.answeredWithLater) continue;
    const newest = sortedInbound.slice(index + 1).find((item) => sameSender(item, message) && !item.answeredWithLater);
    if (newest) closedWith.set(message.id, newest);
  }

  const introByProvider = new Map(facts.introRequests.filter((ask) => ask.providerMessageId).map((ask) => [ask.providerMessageId!, ask]));
  const passedOnIds = new Set<string>();
  const toldIntroIds = new Set<string>();
  const messageRows = new Map<string, ThreadRow>();

  for (const message of inbound) {
    const company = message.counterpartKind === "company";
    const other = message.fromEmail && lower(message.fromEmail) !== lower(message.counterpartEmail) ? `다른 주소에서 옴: ${message.fromEmail}` : null;
    const mail = row({
      key: `msg:${message.id}`, at: message.occurredAt, kind: company ? "company_inbound" : "inbound",
      who: company ? { kind: "company", name: companyOf(message.rootMailId, message.counterpartEmail) } : { kind: "candidate" },
      what: company ? "답" : "답장", detail: joined(message.subject || null, company ? message.counterpartEmail : null, other), text: textOf(message),
    });
    messageRows.set(message.id, mail);
    rows.push(mail);
    // Ashley's decision: its own row, right under the mail (placed there after the sort).
    const signals = (message.signals ?? []).filter((signal) => !signal.personId || signal.personId === person.id).map(signalWords);
    const held = (message.signals ?? []).some((signal) => signal.heldAt);
    decisions.set(message.id, row({
      key: `decision:${message.id}`, at: message.decidedAt ?? message.occurredAt, who: { kind: "ashley" }, kind: "decision", signals,
      what: message.answeredWithLater ? "판단: 함께 답함"
        : message.decision ? `판단: ${DECISION_LABEL[message.decision]}` : held ? "판단: 회사 메일 기다림" : "판단 전",
      text: message.answeredWithLater ? null : message.decisionReason?.trim() || null,
      trouble: waiting.has(message.id), note: waiting.has(message.id) ? "사람이 볼 답장 · 아직 아무도 답하지 않았어요" : null,
    }));
  }

  for (const message of messages) {
    if (message.direction !== "outbound") continue;
    const toCompany = message.counterpartKind === "company";
    const company = toCompany ? companyOf(message.rootMailId, message.counterpartEmail) : null;
    if (message.author === "human") {
      const reply = row({
        key: `msg:${message.id}`, at: message.occurredAt, who: { kind: "team" }, kind: "human", what: "답장",
        detail: joined(message.subject || null, toCompany ? `${company} · ${message.counterpartEmail}` : null, "Ashley 메일함에서"), text: textOf(message),
      });
      messageRows.set(message.id, reply);
      rows.push(reply);
      continue;
    }
    if (message.author !== "ashley") continue;
    const answered = answeredBy(message);
    const passed = passesOn(message);
    const relay = passed ? facts.relays.find((item) => item.inboundMessageId === passed.id) ?? null : null;
    const ask = message.providerMessageId ? introByProvider.get(message.providerMessageId) : undefined;
    if (passed) passedOnIds.add(passed.id);
    if (ask) toldIntroIds.add(ask.id);
    const word = passed ? (relay?.kind === "wants_more" ? "회사 관심 전함" : "회사 답 전함")
      : ask ? "연결 요청 알림" : answered ? "답장" : "메일";
    const status = message.sendStatus ?? "queued";
    const late = status === "queued" && now.getTime() - time(message.occurredAt) > QUEUED_LATE_MS;
    const reply = row({
      key: `msg:${message.id}`, at: message.occurredAt, kind: "ashley",
      who: toCompany ? { kind: "ashleyToCompany", name: company! } : { kind: "ashley" },
      what: status === "sent" ? word : `${word} · ${SEND_STATUS_LABEL[status]}`,
      detail: joined(message.subject || null, toCompany || lower(message.counterpartEmail) !== lower(person.email) ? message.counterpartEmail : null),
      text: textOf(message), trouble: status === "held" || status === "failed" || late,
      note: status === "held" || status === "failed" ? message.error?.trim() || null : late ? "하루 넘게 나가지 않았어요" : null,
    });
    messageRows.set(message.id, reply);
    rows.push(reply);
  }

  // --- Links: an Ashley reply to the mail it names and the ones answered with it; any other reply to the mail its
  // In-Reply-To names, else the mail its thread hangs on ("답장 ↳ 11.20 답장에", "답 ↳ 11.24 회사 메일에").
  const nounOf = new Map<string, string>();
  for (const mail of mails) nounOf.set(`mail:${mail.id}`, MAIL_KIND_LABEL[mail.kind]);
  for (const mail of facts.companyMails) nounOf.set(`company-mail:${mail.id}`, MAIL_KIND_LABEL.company);
  for (const message of messages) {
    const event = messageRows.get(message.id);
    if (!event) continue;
    // What a later reply names it by: their 답장, a company's 답, a reply's 답장, any other mail of Ashley's 메일.
    nounOf.set(event.key, message.author === "counterpart" ? (message.counterpartKind === "company" ? "답" : "답장")
      : message.author === "human" || (answeredBy(message) && !passesOn(message)) ? "답장" : "메일");
  }
  const byRfc = new Map<string, string>();
  for (const mail of mails) if (mail.rfcMessageId) byRfc.set(rfcKey(mail.rfcMessageId), `mail:${mail.id}`);
  for (const mail of facts.companyMails) if (mail.rfcMessageId) byRfc.set(rfcKey(mail.rfcMessageId), `company-mail:${mail.id}`);
  for (const message of messages) if (message.rfcMessageId) byRfc.set(rfcKey(message.rfcMessageId), `msg:${message.id}`);
  const atOf = new Map<string, string>([
    ...mails.map((mail) => [`mail:${mail.id}`, mail.sentAt] as const),
    ...facts.companyMails.map((mail) => [`company-mail:${mail.id}`, mail.sentAt] as const),
  ]);
  for (const message of messages) {
    const event = messageRows.get(message.id);
    if (!event) continue;
    if (message.author === "ashley") {
      const answered = answeredBy(message);
      const target = answered ? messageRows.get(answered.id) : undefined;
      if (!answered || !target) continue;
      const together = sortedInbound.filter((item) => closedWith.get(item.id)?.id === answered.id);
      const refs = [...together.flatMap((item) => (messageRows.has(item.id) ? [ref(messageRows.get(item.id)!)] : [])), ref(target)];
      event.link = { refs, words: `${nounOf.get(target.key) ?? "답장"}에` };
      for (const item of together) {
        const closed = decisions.get(item.id);
        if (closed) closed.link = { refs: [ref(event)], words: "답장에서" };
      }
      continue;
    }
    const named = message.inReplyTo ? byRfc.get(rfcKey(message.inReplyTo)) : undefined;
    const key = named && named !== event.key ? named
      : message.rootMailId && atOf.has(`mail:${message.rootMailId}`) ? `mail:${message.rootMailId}`
        : message.rootMailId && atOf.has(`company-mail:${message.rootMailId}`) ? `company-mail:${message.rootMailId}` : null;
    const at = key ? atOf.get(key) ?? (key.startsWith("msg:") ? messageRows.get(key.slice("msg:".length))?.at : undefined) : undefined;
    if (key && at !== undefined) event.link = { refs: [{ key, at }], words: `${nounOf.get(key) ?? "메일"}에` };
  }
  // A closed mail whose newest mail got no reply (handed to a person, not answered, stopped): judged with that mail.
  for (const [id, newest] of closedWith) {
    const closed = decisions.get(id);
    const target = messageRows.get(newest.id);
    if (closed && !closed.link && target && !replyOf(newest)) closed.link = { refs: [ref(target)], words: "답장과 함께" };
  }

  // --- Company mails about them: who, where, what it carried for them; the company signing up from it.
  for (const mail of facts.companyMails) {
    const line = mail.facts?.lines?.find((item) => item.kind === "interested" && item.id === person.id) ?? null;
    const question = mail.postingUrl
      ? inbound.flatMap((item) => item.signals ?? []).find((signal) => signal.personId === person.id && signal.postingUrl === mail.postingUrl && signal.question)?.question ?? null
      : null;
    const asked = Boolean(mail.facts?.askedPersonIds?.includes(person.id));
    const fresh = Boolean(mail.facts?.newPersonIds?.includes(person.id));
    const problem = Boolean(mail.deliveryStatus) || mail.status === "failed" || mail.status === "blocked";
    rows.push(row({
      key: `company-mail:${mail.id}`, at: mail.sentAt, who: { kind: "ashleyToCompany", name: mail.companyName || companyOf(null, mail.toEmail) },
      kind: "company_mail", what: mail.status === "sent" && !mail.deliveryStatus ? "회사 메일" : `회사 메일 · ${mailStatusLabel(mail.status, mail.deliveryStatus)}`,
      detail: joined(mail.postingTitle, mail.toEmail, mail.subject),
      text: [line?.line1, line?.line2, question ? `질문: ${question}` : null].filter(Boolean).join("\n") || null,
      note: asked ? "이 후보의 요약과 질문을 담았어요" : fresh ? "이 메일에서 이 후보를 처음 담았어요" : "앞 메일에 이어 이 후보를 담았어요",
      trouble: problem,
    }));
    if (mail.claimedAt) {
      rows.push(row({
        key: `company-mail:${mail.id}:claimed`, at: mail.claimedAt, who: { kind: "company", name: mail.companyName || companyOf(null, mail.toEmail) },
        kind: "company_signup", what: "가입", detail: joined("회사 메일 링크로 하퍼에 가입했어요", mail.workspaceName),
      }));
    }
  }

  // --- What was passed on to them with no mail found for it (gtm_agent_relays), and their joining after it.
  for (const relay of facts.relays) {
    const told = relay.inboundMessageId ? passedOnIds.has(relay.inboundMessageId)
      : facts.introRequests.some((ask) => toldIntroIds.has(ask.id) && ask.companyMailId === relay.companyMailId);
    if (!told) {
      rows.push(row({
        key: `relay:${relay.companyEmail}`, at: relay.createdAt, who: { kind: "ashley" }, kind: "relay",
        what: relay.kind === "answer" ? "회사 답 전함" : "회사 관심 전함", detail: joined(companyOf(relay.companyMailId, relay.companyEmail), relay.companyEmail),
      }));
    }
    if (relay.joinedNotedAt) {
      rows.push(row({
        key: `relay:${relay.companyEmail}:joined`, at: relay.joinedNotedAt, who: { kind: "agent" }, kind: "relay", what: "운영팀에 연결 부탁",
        detail: `후보가 하퍼에 가입해서 ${companyOf(relay.companyMailId, relay.companyEmail)}와 이어 달라고 운영팀에 알렸어요`,
      }));
    }
  }

  // --- The company's connection request on Harper, and where it went.
  for (const ask of facts.introRequests) {
    const name = ask.companyName?.trim() || companyOf(ask.companyMailId);
    const pending = ask.status === "ashley_pending" || ask.status === "ashley_sending";
    const handed = ask.status === "not_sendable" || ask.status === "failed";
    rows.push(row({
      key: `intro:${ask.id}`, at: ask.createdAt, who: { kind: "company", name }, kind: "intro_request", what: "연결 요청",
      detail: ask.roleName, text: ask.appeal?.trim() || null, trouble: handed,
      note: pending ? "Ashley가 후보에게 알릴 차례예요"
        : handed ? `Ashley가 알리지 않고 사람에게 넘겼어요${ask.reason ? ` · ${ask.reason}` : ask.errorCode ? ` · ${ask.errorCode}` : ""}`
          : ask.status === "cancelled" ? "회사가 후보를 넘겨 취소됐어요" : null,
    }));
    if (ask.invitedAt && !toldIntroIds.has(ask.id)) {
      rows.push(row({ key: `intro:${ask.id}:invited`, at: ask.invitedAt, who: { kind: "ashley" }, kind: "intro_step", what: "연결 요청 알림", detail: name }));
    }
    if (ask.acceptedAt) rows.push(row({ key: `intro:${ask.id}:accepted`, at: ask.acceptedAt, who: { kind: "candidate" }, kind: "intro_step", what: "연결 수락", detail: name }));
    if (ask.connectedAt) rows.push(row({ key: `intro:${ask.id}:connected`, at: ask.connectedAt, who: { kind: "agent" }, kind: "connected", what: "회사 연결", detail: name }));
  }

  // --- Inside Harper: their Harper agent and customer companies, the proposed postings' stage, 회사 연결.
  for (const message of facts.harperMessages) {
    const name = message.companyName?.trim() || "고객사";
    rows.push(row({
      key: `harper:${message.id}`, at: message.createdAt, who: { kind: "harper" }, kind: "harper_message",
      what: message.direction === "to_company" ? `후보 → ${name}` : `${name} → 후보`, detail: message.roleName, text: message.body?.trim() || null,
      note: message.cancelledAt ? "보내기 전에 취소됐어요" : null,
    }));
  }
  for (const stage of facts.stages) {
    rows.push(row({
      key: `stage:${stage.key}`, at: stage.at, who: { kind: "candidate" }, kind: "stage", what: `관심·지원 · ${STAGE_WORDS[stage.stage] ?? stage.stage}`,
      detail: joined("하퍼 안", stage.companyName, stage.roleName),
    }));
  }
  for (const connection of facts.connections) {
    rows.push(row({
      key: `connected:${connection.key}`, at: connection.at, who: { kind: "harper" }, kind: "connected", what: "회사 연결",
      detail: joined(connection.companyName, connection.roleName),
    }));
  }

  // --- The person's own timeline: every step the rows above do not already show.
  const has = {
    first: mails.some((mail) => mail.kind === "first"), followup: mails.some((mail) => mail.kind === "followup"),
    clicked: mails.some((mail) => mail.firstOpenedAt), signedUp: mails.some((mail) => mail.signedUpAt),
    delivery: mails.some((mail) => mail.deliveryStatus), unsubscribed: mails.some((mail) => mail.unsubscribedAt),
    reply: inbound.some((message) => message.counterpartKind === "candidate"),
  };
  for (const [index, item] of person.events.entries()) {
    const agent = item.by === "agent";
    const shown = item.kind === "found"
      || (item.kind === "sent" && has.first) || (item.kind === "followup_sent" && has.followup)
      || (agent && item.kind === "clicked" && has.clicked) || (agent && item.kind === "signed_up" && has.signedUp)
      || (agent && item.kind === "bounced" && has.delivery) || (agent && item.kind === "replied" && has.reply)
      || (agent && item.kind === "unsubscribed" && has.unsubscribed);
    if (shown) continue;
    // Ashley's own lines (ashleyAgent.ts ASHLEY_NOTE, and her stops "Ashley · …") are hers.
    const who: ThreadWho = !agent ? { kind: "team" } : item.note?.startsWith("Ashley") ? { kind: "ashley" } : { kind: "agent" };
    rows.push(row({
      key: `step:${index}`, at: item.at, who, kind: "step", step: { kind: item.kind, note: item.note ?? null },
      trouble: item.kind === "failed" || item.kind === "bounced",
    }));
  }

  // --- One time order; each decision right under the mail it judged.
  rows.sort(byTime);
  const ordered = rows.flatMap((item) => {
    const id = item.kind === "inbound" || item.kind === "company_inbound" ? item.key.slice("msg:".length) : null;
    const decision = id ? decisions.get(id) : undefined;
    return decision ? [item, decision] : [item];
  });
  return { rows: ordered, summary: threadSummary(ordered, facts) };
}

/**
 * 지금 · 마지막 on the list (Shaun 11/22 15:46): the latest row, in the numbers' column words where it is one of them
 * (연락, 클릭, 가입, 답장, Ashley 답함, 답 안 함, 사람에게 넘김, 연락 그만, 답장 후 가입, 관심·지원, 회사 연결, 반송, 수신 거부).
 * Null with no mail and no message yet (the line shows where the agent is with them instead).
 */
export function threadSummary(rows: readonly ThreadRow[], facts: Pick<ThreadFacts, "mails" | "messages" | "harperMessages">): ThreadSummary | null {
  if (!facts.mails.length && !facts.messages.length && !facts.harperMessages.length) return null;
  const latest = [...rows].sort(byTime).reverse().find((item) => item.kind !== "found" && !(item.step && QUIET_STEPS.has(item.step.kind)));
  if (!latest) return null;
  const at = latest.at;
  const base = { at, column: null, words: null, step: null, trouble: latest.trouble } satisfies ThreadSummary;
  const column = (value: ThreadColumn): ThreadSummary => ({ ...base, column: value });
  const words = (value: string | null): ThreadSummary => ({ ...base, words: value });
  const repliedBefore = rows.some((item) => item.kind === "inbound" && time(item.at) <= time(at));
  switch (latest.kind) {
    case "mail": {
      const mail = facts.mails.find((item) => item.id === latest.mailId);
      return mail && (mail.kind === "first" || mail.kind === "followup") && !latest.trouble ? column("contacted") : words(latest.what);
    }
    case "delivery": return latest.what === "반송" ? column("bounced") : words(latest.what);
    case "clicked": return column("clicked");
    case "signed_up": return column(repliedBefore ? "signedUpAfterReply" : "signedUp");
    case "unsubscribed": return column("unsubscribed");
    case "inbound": return column("replied");
    case "decision": {
      const message = facts.messages.find((item) => `decision:${item.id}` === latest.key);
      if (message?.counterpartKind === "company") return words(latest.what);
      return message?.decision === "no_reply" ? column("noReply") : message?.decision === "stop" ? column("unsubscribed")
        : message?.decision === "hand_to_human" ? column("handedOff") : column("replied");
    }
    case "ashley": {
      const message = facts.messages.find((item) => `msg:${item.id}` === latest.key);
      if (message?.sendStatus === "held" || message?.sendStatus === "failed") return column("handedOff");
      return message?.sendStatus === "sent" && latest.what === "답장" && message.counterpartKind === "candidate" ? column("ashleyReplied") : words(`Ashley ${latest.what}`);
    }
    case "stage": return column("interested");
    case "connected": return column("connected");
    case "step": return { ...base, step: latest.step?.kind ?? null };
    default: return words(latest.what);
  }
}
