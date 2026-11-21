/**
 * #5 replies on /ops, pure (the server, the screen and the tests read them the same way):
 *   - what a person's conversation rows (gtm_agent_messages) add to 수치: Ashley 답함, 답 안 함 and its reason
 *   - 대화: a person's gtm_mails mails and conversation rows in one time order
 *   - the red line's rule: a reply handed to a person (hand_to_human) that no one answered yet in its thread
 *   - the words a mail line shows (받음 / 보냄, Ashley's decision or the send status)
 */
import type { AshleyDecisionKind, ConversationMessage, MessageAuthor } from "./conversation";

/** Decisions that leave a reply unanswered on purpose: 답 안 함 counts them. */
export const NO_REPLY_DECISIONS: readonly AshleyDecisionKind[] = ["no_reply", "stop"];

const REASON_LABEL_MAX = 30;

/**
 * The short label of a decision reason. Ashley's decide tool and the code write "<label> · <why>" (or the label alone),
 * and labels never contain " · ", so the part before it is the reason's type ("돈 요구·악의", "다른 목적", "회원").
 */
export function decisionReasonLabel(reason: string | null | undefined): string {
  const label = (reason ?? "").split(" · ")[0].trim().slice(0, REASON_LABEL_MAX);
  return label || "이유 없음";
}

const time = (value: string | null | undefined) => {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
};

/** What a person's conversation rows add to their funnel facts (funnel.ts AgentFunnelRow). */
export type PersonConversationFacts = {
  /** The first Ashley reply that went out. */
  ashleyRepliedAt: string | null;
  /** The reason label of their latest reply Ashley decided not to answer (no_reply / stop); null when none. */
  noReplyReason: string | null;
};

type FactRow = Pick<ConversationMessage, "personId" | "author" | "direction" | "decision" | "decisionReason" | "sendStatus" | "occurredAt">;

export function conversationFactsByPerson(rows: readonly FactRow[]): Map<string, PersonConversationFacts> {
  const facts = new Map<string, PersonConversationFacts & { noReplyAt: number }>();
  for (const row of rows) {
    if (!row.personId) continue;
    const at = time(row.occurredAt);
    const fact = facts.get(row.personId) ?? { ashleyRepliedAt: null, noReplyReason: null, noReplyAt: -Infinity };
    if (row.author === "ashley" && row.direction === "outbound" && row.sendStatus === "sent" && at !== null
      && (fact.ashleyRepliedAt === null || at < (time(fact.ashleyRepliedAt) ?? Infinity))) {
      fact.ashleyRepliedAt = new Date(at).toISOString();
    }
    if (row.author === "counterpart" && row.direction === "inbound" && row.decision && NO_REPLY_DECISIONS.includes(row.decision)
      && (at ?? -Infinity) >= fact.noReplyAt) {
      fact.noReplyReason = decisionReasonLabel(row.decisionReason);
      fact.noReplyAt = at ?? -Infinity;
    }
    facts.set(row.personId, fact);
  }
  return new Map([...facts].map(([id, { ashleyRepliedAt, noReplyReason }]) => [id, { ashleyRepliedAt, noReplyReason }]));
}

type ThreadRow = Pick<ConversationMessage, "id" | "author" | "direction" | "decision" | "gmailThreadId" | "rootMailId" | "counterpartEmail" | "occurredAt">;

/**
 * Two rows are in one thread when they hang on the same root mail (ConversationStore.personAnswered's thread) or share
 * Gmail's thread; rows with neither to compare fall back to the same address.
 */
function sameThread(a: ThreadRow, b: ThreadRow): boolean {
  const byRoot = Boolean(a.rootMailId && b.rootMailId);
  const byGmail = Boolean(a.gmailThreadId && b.gmailThreadId);
  if (byRoot && a.rootMailId === b.rootMailId) return true;
  if (byGmail && a.gmailThreadId === b.gmailThreadId) return true;
  if (byRoot || byGmail) return false;
  return a.counterpartEmail.toLowerCase() === b.counterpartEmail.toLowerCase();
}

/**
 * 사람이 볼 답장 (the red line): replies Ashley handed to a person (hand_to_human) with no human row (a reply written
 * from Ashley's Gmail) after them in their thread. Oldest first.
 */
export function awaitingHuman<T extends ThreadRow>(rows: readonly T[]): T[] {
  const human = rows.filter((row) => row.author === "human");
  return rows
    .filter((row) => row.author === "counterpart" && row.direction === "inbound" && row.decision === "hand_to_human")
    .filter((row) => {
      const at = time(row.occurredAt) ?? -Infinity;
      return !human.some((reply) => (time(reply.occurredAt) ?? -Infinity) > at && sameThread(row, reply));
    })
    .sort((a, b) => (time(a.occurredAt) ?? 0) - (time(b.occurredAt) ?? 0));
}

/** One entry of a person's 대화: a gtm_mails mail (first, follow-up, company …) or a conversation row. */
export type ConversationEntry<M> =
  | { type: "mail"; key: string; at: string; mail: M }
  | { type: "message"; key: string; at: string; message: ConversationMessage };

/**
 * 대화: every mail and conversation row, oldest first, each once. At the same moment our mail comes before a reply,
 * and a reply before the answer to it.
 */
export function conversationEntries<M extends { id: string; sentAt: string }>(
  mails: readonly M[], messages: readonly ConversationMessage[],
): Array<ConversationEntry<M>> {
  const seen = new Set<string>();
  const entries: Array<ConversationEntry<M>> = [];
  for (const mail of mails) {
    const key = `mail:${mail.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ type: "mail", key, at: mail.sentAt, mail });
  }
  for (const message of messages) {
    const key = `msg:${message.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ type: "message", key, at: message.occurredAt, message });
  }
  const rank = (entry: ConversationEntry<M>) => (entry.type === "mail" ? 0 : entry.message.direction === "inbound" ? 1 : 2);
  return entries.sort((a, b) => ((time(a.at) ?? 0) - (time(b.at) ?? 0)) || rank(a) - rank(b) || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------------------------------------------
// Words

export const DECISION_LABEL: Record<AshleyDecisionKind, string> = {
  reply: "답함", no_reply: "답 안 함", stop: "연락 멈춤", hand_to_human: "사람에게",
};

export const SEND_STATUS_LABEL: Record<NonNullable<ConversationMessage["sendStatus"]>, string> = {
  queued: "보낼 차례", sent: "보냄", failed: "실패", held: "안 보냄",
};

export type AgentMailKind = "first" | "followup" | "company" | "mail";

export const MAIL_KIND_LABEL: Record<AgentMailKind, string> = {
  first: "첫 메일", followup: "후속 메일", company: "회사 메일", mail: "메일",
};

const MAIL_STATUS_LABEL: Record<string, string> = { sending: "보내는 중", sent: "보냄", failed: "실패", blocked: "막힘" };

/** A gtm_mails mail's delivery in words (반송, 스팸 신고, 발송 실패), else its status. */
export function mailStatusLabel(status: string, deliveryStatus: string | null): string {
  if (deliveryStatus) return deliveryStatus === "bounced" ? "반송" : deliveryStatus === "complained" ? "스팸 신고" : "발송 실패";
  return MAIL_STATUS_LABEL[status] ?? status;
}

/** What a mail line says: which way it went, and Ashley's decision (with its reason label) or how the send went. */
export type MailLineFacts = {
  direction: "inbound" | "outbound";
  author: MessageAuthor | "agent_mail";
  mailKind?: AgentMailKind | null;
  mailStatus?: string | null;
  deliveryStatus?: string | null;
  decision?: AshleyDecisionKind | null;
  decisionReason?: string | null;
  sendStatus?: ConversationMessage["sendStatus"];
  error?: string | null;
};

/** With reasonLabel false the reason's label is left out (the 대화 shows the whole reason under the line). */
export function mailLineWords(line: MailLineFacts, { reasonLabel = true } = {}): { way: "받음" | "보냄"; what: string; trouble: boolean } {
  const way = line.direction === "inbound" ? "받음" : "보냄";
  if (line.author === "agent_mail") {
    const status = mailStatusLabel(line.mailStatus ?? "", line.deliveryStatus ?? null);
    return { way, what: `${MAIL_KIND_LABEL[line.mailKind ?? "mail"]} · ${status}`, trouble: Boolean(line.deliveryStatus) || line.mailStatus === "failed" };
  }
  if (line.author === "human") return { way, what: "사람 (Ashley 계정)", trouble: false };
  if (line.author === "ashley") {
    const status = line.sendStatus ? SEND_STATUS_LABEL[line.sendStatus] : "보낼 차례";
    const held = line.sendStatus === "held" || line.sendStatus === "failed";
    const why = held && line.error && reasonLabel ? ` · ${decisionReasonLabel(line.error)}` : "";
    return { way, what: `Ashley · ${status}${why}`, trouble: held };
  }
  if (!line.decision) return { way, what: "판단 전", trouble: false };
  const why = reasonLabel ? ` · ${decisionReasonLabel(line.decisionReason)}` : "";
  return { way, what: `${DECISION_LABEL[line.decision]}${why}`, trouble: false };
}

/** The unmatched mails a reply read left unopened, per mailbox, from a read that finished (a failed one reads them again). */
export function unmatchedToRecord(mailboxes: ReadonlyArray<{ mailbox: string; error?: string; unmatched?: number }>): Array<{ mailbox: string; count: number }> {
  return mailboxes.flatMap((item) => {
    const count = Math.floor(Number(item.unmatched ?? 0));
    return !item.error && Number.isFinite(count) && count > 0 ? [{ mailbox: item.mailbox, count }] : [];
  });
}
