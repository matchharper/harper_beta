import type { OrgTodoItem } from "./todo";

/**
 * A candidate's message nobody on the company side has answered is a
 * decision (결정할 것), not only an update. The Role's candidate↔company record
 * (talent_progress, the rows the feed reads) says who wrote and when: the
 * candidate's message delivered to the company, and each message the company
 * side sent to the candidate. After the candidate's latest message, any
 * message the company side sent (a team member's reply on web, Slack or email,
 * or one Harper sent) answers it, and the card goes back to its 알림 line.
 */
export const CANDIDATE_SIDE_EVENTS = [
  "candidate_message_delivered",
  "candidate_response_received",
];
export const COMPANY_SIDE_EVENTS = ["candidate_contact_sent"];
export const CONVERSATION_EVENTS = [
  ...CANDIDATE_SIDE_EVENTS,
  ...COMPANY_SIDE_EVENTS,
];

const DAY_MS = 24 * 60 * 60 * 1000;

export type ConversationRow = {
  id: string;
  talent_id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type UnansweredConversation = {
  /**
   * The card's id, from the candidate's latest message: when the candidate
   * writes again it is a new card, even after the last one was set aside.
   */
  id: string;
  talentId: string;
  at: string;
  relayId: string | null;
  /** The candidate's messages since the company side last wrote (feed event ids). */
  messageIds: string[];
};

export type AnsweredBy = NonNullable<OrgTodoItem["answeredBy"]>;

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() || null : null;

/**
 * Each conversation of the Role: the one waiting for the company, and which
 * company message answered each of the candidate's messages. Only a message
 * from the last `days` days becomes a card; older ones stay 알림 lines.
 */
export function readCandidateConversations(
  rows: ConversationRow[],
  args: { now: Date; days: number }
) {
  const byTalent = new Map<string, ConversationRow[]>();
  for (const row of rows) {
    const eventType = text(row.metadata?.eventType);
    if (!eventType || !CONVERSATION_EVENTS.includes(eventType)) continue;
    const list = byTalent.get(row.talent_id) ?? [];
    list.push(row);
    byTalent.set(row.talent_id, list);
  }
  const fromCandidate = (row: ConversationRow) =>
    CANDIDATE_SIDE_EVENTS.includes(String(row.metadata?.eventType));
  const since = args.now.getTime() - args.days * DAY_MS;
  const unanswered: UnansweredConversation[] = [];
  /** Candidate message (feed event id) → the request id of the company message that answered it. */
  const answers = new Map<string, string | null>();
  for (const [talentId, list] of byTalent) {
    // Oldest first; at the same moment the company's message comes after.
    list.sort(
      (left, right) =>
        Date.parse(left.created_at) - Date.parse(right.created_at) ||
        Number(fromCandidate(right)) - Number(fromCandidate(left))
    );
    let waiting: ConversationRow[] = [];
    for (const row of list) {
      if (fromCandidate(row)) {
        waiting.push(row);
        continue;
      }
      for (const message of waiting)
        answers.set(message.id, text(row.metadata?.requestId));
      waiting = [];
    }
    const latest = waiting.at(-1);
    if (!latest || Date.parse(latest.created_at) < since) continue;
    unanswered.push({
      id: `unanswered:${latest.id}`,
      talentId,
      at: latest.created_at,
      relayId: text(latest.metadata?.relayId),
      messageIds: waiting.map((row) => row.id),
    });
  }
  return { unanswered, answers };
}

/** A message in the Role's agent mailbox (agent_contact_messages). */
export type MailboxRow = {
  id: string;
  root_id: string;
  talent_id: string;
  direction: string;
  body: string | null;
  source: Record<string, unknown> | null;
  created_at: string;
  /** Whether this message's conversation (its root) was withdrawn. */
  rootCancelled: boolean;
};

/** The mailbox id inside To-do keys, apart from feed and relay ids. */
export const mailboxKey = (id: string) => `agent:${id}`;
export const isMailboxKey = (key: string) => key.startsWith("agent:");

/**
 * The Role's agent mailbox read as the same candidate↔company conversation
 * the feed records: a message from the candidate's Harper is the candidate's
 * message, one to the candidate's Harper is the company side's. The first
 * message of an introduction is not one: the pending connection shows it.
 * A withdrawn conversation adds nothing. Also returns each company message
 * still waiting for the candidate side: in each conversation, a team member's
 * newest message with no candidate message after it, from the last `days`
 * days. Harper's own messages (an acknowledgement, a follow-up) answer the
 * candidate but never wait for them.
 */
export function readMailboxConversations(
  rows: MailboxRow[],
  window: { now: Date; days: number }
) {
  const live = rows.filter((row) => !row.rootCancelled);
  const conversationRows: ConversationRow[] = [];
  const excerpts = new Map<string, string>();
  /** Company message key → the team member behind it, when one is. */
  const senders = new Map<string, string | null>();
  for (const row of live) {
    const key = mailboxKey(row.id);
    if (row.direction === "to_company") {
      if (row.id === row.root_id && row.source?.legacyCorrespondence !== true)
        continue;
      conversationRows.push({
        id: key,
        talent_id: row.talent_id,
        created_at: row.created_at,
        metadata: { eventType: "candidate_message_delivered", relayId: key },
      });
      const excerpt = candidateMessageExcerpt(row.body);
      if (excerpt) excerpts.set(key, excerpt);
    } else if (row.direction === "to_talent") {
      conversationRows.push({
        id: key,
        talent_id: row.talent_id,
        created_at: row.created_at,
        metadata: { eventType: "candidate_contact_sent", requestId: key },
      });
      senders.set(
        key,
        row.source?.kind === "company" ? text(row.source.userId) : null
      );
    }
  }
  const later = (row: MailboxRow, than: MailboxRow | undefined) =>
    !than ||
    Date.parse(row.created_at) > Date.parse(than.created_at) ||
    (row.created_at === than.created_at && row.id > than.id);
  const lastFromCandidate = new Map<string, MailboxRow>();
  const lastFromMember = new Map<string, MailboxRow>();
  for (const row of live) {
    if (row.direction === "to_company") {
      if (later(row, lastFromCandidate.get(row.root_id)))
        lastFromCandidate.set(row.root_id, row);
    } else if (row.direction === "to_talent" && row.source?.kind === "company") {
      if (later(row, lastFromMember.get(row.root_id)))
        lastFromMember.set(row.root_id, row);
    }
  }
  const since = window.now.getTime() - window.days * DAY_MS;
  const waiting = [...lastFromMember.values()].filter(
    (row) =>
      later(row, lastFromCandidate.get(row.root_id)) &&
      Date.parse(row.created_at) >= since
  );
  return { conversationRows, excerpts, senders, waiting };
}

/**
 * Requests from before the agent mailbox that the candidate has since answered
 * there: a candidate message to the company for the same candidate (this Role)
 * after the request was made. Their answer reached the company's agent, so they
 * no longer wait.
 */
export function requestsAnsweredInMailbox(
  requests: Array<{ id: string; talent_id: string; created_at: string; workflow_status: string }>,
  candidateMessages: Array<{ talent_id: string; created_at: string }>
) {
  const latest = new Map<string, number>();
  for (const message of candidateMessages) {
    const at = Date.parse(message.created_at);
    if (!(at <= (latest.get(String(message.talent_id)) ?? -Infinity)))
      latest.set(String(message.talent_id), at);
  }
  return new Set(
    requests
      .filter(
        (row) =>
          row.workflow_status === "awaiting_talent" &&
          (latest.get(String(row.talent_id)) ?? -Infinity) > Date.parse(row.created_at)
      )
      .map((row) => String(row.id))
  );
}

/**
 * Who sent the company's message: Harper on its own (its run had no team
 * member's message behind it), or a team member.
 */
export function answeredByOf(
  source:
    | { message_type?: string | null; company_user_id?: string | null }
    | null
    | undefined,
  names: Map<string, string>
): AnsweredBy | null {
  if (!source) return null;
  if (source.message_type === "web_action") return { by: "harper" };
  const name = source.company_user_id
    ? text(names.get(source.company_user_id))
    : null;
  return { by: "team", name };
}

const CONTACT_DETAILS = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/g,
  /\bhttps?:\/\/\S+|\bwww\.\S+/gi,
  /(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}\b/g,
];

/** A short line of the candidate's words, with no email, link or phone number. */
export function candidateMessageExcerpt(value: unknown, max = 80) {
  let line = String(value ?? "").replace(/\s+/g, " ").trim();
  for (const pattern of CONTACT_DETAILS) line = line.replace(pattern, "…");
  if (line.length > max) line = `${line.slice(0, max - 1).trimEnd()}…`;
  return line || null;
}

/**
 * The Role's lines with its conversations applied: a 결정할 것 card for each
 * one waiting for the company that this person has not set aside, in place of
 * its 알림 lines; on each answered message's 알림 line, who answered it.
 */
export function applyCandidateConversations(args: {
  items: OrgTodoItem[];
  unanswered: UnansweredConversation[];
  answers: Map<string, string | null>;
  /** Request id → who sent it. */
  answeredBy: Map<string, AnsweredBy>;
  /** Cards this person set aside ("답 안 해도 돼요"). */
  dismissed: Set<string>;
  talents: Map<string, NonNullable<OrgTodoItem["talent"]>>;
  /** Relay id → a short line of the candidate's message. */
  excerpts: Map<string, string>;
}): OrgTodoItem[] {
  const cards: OrgTodoItem[] = [];
  const onCard = new Set<string>();
  for (const conversation of args.unanswered) {
    // Names come from the board, so a hidden candidate stays hidden.
    const talent = args.talents.get(conversation.talentId);
    if (!talent || args.dismissed.has(conversation.id)) continue;
    for (const id of conversation.messageIds) onCard.add(`activity:${id}`);
    cards.push({
      id: conversation.id,
      column: "my_turn",
      kind: "unanswered_message",
      at: conversation.at,
      detail: conversation.relayId
        ? (args.excerpts.get(conversation.relayId) ?? null)
        : null,
      talent,
    });
  }
  const lines = args.items
    .filter((item) => !onCard.has(item.id))
    .map((item) => {
      if (!item.id.startsWith("activity:")) return item;
      const requestId = args.answers.get(item.id.slice("activity:".length));
      const who = requestId ? args.answeredBy.get(requestId) : undefined;
      return who ? { ...item, answeredBy: who } : item;
    });
  return [...cards, ...lines];
}
