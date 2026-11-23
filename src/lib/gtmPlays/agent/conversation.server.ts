import "server-only";

import { gtmRead, gtmWrite } from "../db.server";
import { kstDayWindow } from "../sendLimit";
import type {
  AshleyDecisionKind, ConversationMessage, ConversationStore, CounterpartKind, HistoryEntry, InterestSignal, MessageAuthor,
} from "./conversation";
import {
  flattenSignals, historyPostings, HUMAN_ANSWERED_REASON, mergeHistory, replyBlockReason, type HistoryMail,
} from "./conversationRules";
import { normalizeMessageId, type ThreadMessage } from "./replies";

/**
 * #5 reply conversations (20261121020000_gtm_agent_messages.sql; types in conversation.ts, pure rules in
 * conversationRules.ts). The reply sync (replies.server.ts) stores what it reads from Gmail; Ashley's reply agent
 * decides, queues and sends; company mails read the interest signals; follow-ups ask personAnswered.
 */

type MessageRow = {
  id: string;
  person_id: string | null;
  counterpart_kind: CounterpartKind;
  counterpart_email: string;
  /** 20261121080000; absent before that migration. */
  from_email?: string | null;
  author: MessageAuthor;
  direction: "inbound" | "outbound";
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  rfc_message_id: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  subject: string;
  body_text: string;
  new_text: string;
  root_mail_id: string | null;
  decision: AshleyDecisionKind | null;
  decision_reason: string | null;
  signals: unknown;
  answered_by_message_id: string | null;
  send_status: ConversationMessage["sendStatus"];
  provider_message_id: string | null;
  error: string | null;
  occurred_at: string | Date;
  created_at: string | Date;
};

const iso = (value: string | Date) => new Date(value).toISOString();
const MISSING_TABLE = "42P01";
/** Conversation rows history reads per address at most (it keeps the latest 10 by default). */
const HISTORY_ROWS = 200;

function mapMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    personId: row.person_id,
    counterpartKind: row.counterpart_kind,
    counterpartEmail: row.counterpart_email,
    fromEmail: row.from_email ?? null,
    author: row.author,
    direction: row.direction,
    gmailMessageId: row.gmail_message_id,
    gmailThreadId: row.gmail_thread_id,
    rfcMessageId: row.rfc_message_id,
    inReplyTo: row.in_reply_to,
    references: row.references_header,
    subject: row.subject,
    bodyText: row.body_text,
    newText: row.new_text,
    rootMailId: row.root_mail_id,
    decision: row.decision,
    decisionReason: row.decision_reason,
    signals: Array.isArray(row.signals) ? (row.signals as InterestSignal[]) : [],
    answeredByMessageId: row.answered_by_message_id,
    sendStatus: row.send_status,
    providerMessageId: row.provider_message_id,
    error: row.error,
    occurredAt: iso(row.occurred_at),
    createdAt: iso(row.created_at),
  };
}

/** A Message-ID as a header carries it: in angle brackets, its case kept (a reply's In-Reply-To must match it). */
function headerMessageId(value: string | null | undefined): string | null {
  const id = String(value ?? "").trim().replace(/^<+|>+$/g, "").trim();
  return normalizeMessageId(id) ? `<${id}>` : null;
}

export type SaveInboundInput = Parameters<ConversationStore["saveInbound"]>[0];

/**
 * saveInbound, also saying whether this call stored the row (false: the Gmail message, or the same mail read in
 * another mailbox, was already there). A reply from another address keeps that address in from_email (written only
 * then, so storing works before its migration too); Ashley decides it like any other.
 * A person's reply from the mailbox (author human) is stored as outbound and sent.
 */
export async function storeInbound(input: SaveInboundInput): Promise<{ message: ConversationMessage; created: boolean }> {
  const human = input.author === "human";
  const counterpart = input.counterpartEmail.trim().toLowerCase();
  const from = input.fromEmail?.trim().toLowerCase() || null;
  const values = {
    person_id: input.personId,
    counterpart_kind: input.counterpartKind,
    counterpart_email: counterpart,
    ...(!human && from && from !== counterpart ? { from_email: from } : {}),
    author: input.author,
    direction: human ? "outbound" : "inbound",
    gmail_message_id: input.gmailMessageId,
    gmail_thread_id: input.gmailThreadId,
    rfc_message_id: headerMessageId(input.rfcMessageId),
    in_reply_to: input.inReplyTo,
    references_header: input.references,
    subject: input.subject,
    body_text: input.bodyText,
    new_text: input.newText,
    root_mail_id: input.rootMailId,
    send_status: human ? "sent" : null,
    occurred_at: new Date(input.occurredAt),
  };
  const rfcId = normalizeMessageId(values.rfc_message_id) ?? "";
  return gtmWrite(async (sql) => {
    // Either unique index (the Gmail id, the Message-ID) means the mail is already stored.
    const [inserted] = await sql<MessageRow[]>`
      insert into public.gtm_agent_messages ${sql(values as never)}
      on conflict do nothing
      returning *
    `;
    if (inserted) return { message: mapMessage(inserted), created: true };
    const [existing] = await sql<MessageRow[]>`
      select * from public.gtm_agent_messages
      where gmail_message_id = ${input.gmailMessageId}
        or (rfc_message_id is not null and lower(btrim(rfc_message_id, '<> ')) = ${rfcId})
      order by (gmail_message_id = ${input.gmailMessageId}) desc nulls last limit 1
    `;
    if (!existing) throw new Error("conversation message was neither stored nor found");
    return { message: mapMessage(existing), created: false };
  });
}

/**
 * The inbound mails of a thread a person already answered from the mailbox (received before their reply) get no
 * Ashley decision: recorded as no_reply, so the backlog is not answered twice. Returns how many.
 */
export async function settleAnsweredByHuman(rootMailId: string, answeredAt: string): Promise<number> {
  const rows = await gtmWrite((sql) => sql<Array<{ id: string }>>`
    update public.gtm_agent_messages
    set decision = 'no_reply', decision_reason = ${HUMAN_ANSWERED_REASON}, decided_at = now()
    where root_mail_id = ${rootMailId}::uuid and direction = 'inbound' and decision is null
      and occurred_at <= ${new Date(answeredAt)}
    returning id
  `);
  return rows.length;
}

/** Stored messages a batch of Gmail mails may belong to: by a Message-ID they name or a Gmail thread they are in. */
export async function threadMessagesFor(messageIds: readonly string[], threadIds: readonly string[]): Promise<ThreadMessage[]> {
  const ids = [...new Set(messageIds.map((id) => normalizeMessageId(id)).filter((id): id is string => Boolean(id)))];
  const threads = [...new Set(threadIds.filter(Boolean))];
  if (!ids.length && !threads.length) return [];
  const rows = await gtmRead((sql) => sql<Array<{ root_mail_id: string | null; rfc_message_id: string | null; gmail_thread_id: string | null }>>`
    select root_mail_id, rfc_message_id, gmail_thread_id from public.gtm_agent_messages
    where root_mail_id is not null
      and ((rfc_message_id is not null and lower(btrim(rfc_message_id, '<> ')) = any(${ids}::text[]))
        or gmail_thread_id = any(${threads}::text[]))
    order by occurred_at desc limit 500
  `);
  return rows.map((row) => ({ rootMailId: row.root_mail_id, rfcMessageId: row.rfc_message_id, gmailThreadId: row.gmail_thread_id }));
}

export async function saveInbound(input: SaveInboundInput): Promise<ConversationMessage> {
  return (await storeInbound(input)).message;
}

export async function listUndecidedInbound(
  limit: number, opts: { counterpartEmail?: string; firstPerAddress?: boolean; notMailedOn?: Date } = {},
): Promise<ConversationMessage[]> {
  const email = opts.counterpartEmail?.trim().toLowerCase();
  const day = opts.notMailedOn ? kstDayWindow(opts.notMailedOn) : null;
  const rows = await gtmRead((sql) => sql<MessageRow[]>`
    select * from (
      select ${opts.firstPerAddress ? sql`distinct on (lower(m.counterpart_email))` : sql``} m.*
      from public.gtm_agent_messages m
      where m.decision is null and m.direction = 'inbound' and m.author = 'counterpart'
        ${email ? sql`and lower(m.counterpart_email) = ${email}` : sql``}
        ${day ? sql`and not exists (
          select 1 from public.gtm_agent_messages o
          where o.author = 'ashley' and o.direction = 'outbound' and o.send_status = 'sent'
            and lower(o.counterpart_email) = lower(m.counterpart_email)
            and o.occurred_at >= ${new Date(day.start)} and o.occurred_at < ${new Date(day.end)}
        )` : sql``}
      order by ${opts.firstPerAddress ? sql`lower(m.counterpart_email),` : sql``} m.occurred_at, m.created_at
    ) undecided
    order by occurred_at, created_at limit ${Math.max(1, Math.floor(limit))}::int
  `);
  return rows.map(mapMessage);
}

/** Once per inbound mail: a decided one keeps its first decision. */
export async function recordDecision(messageId: string, decision: AshleyDecisionKind, reason: string, signals: InterestSignal[]): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_messages
    set decision = ${decision}, decision_reason = ${reason.slice(0, 2_000)}, decided_at = now(), signals = ${sql.json(signals as never)}::jsonb
    where id = ${messageId}::uuid and direction = 'inbound' and decision is null
  `);
}

/** An undecided mail's signals, while its reply waits for the company mail they start (the decision comes later). */
export async function holdSignals(messageId: string, signals: InterestSignal[]): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_messages set signals = ${sql.json(signals as never)}::jsonb
    where id = ${messageId}::uuid and direction = 'inbound' and decision is null
  `);
}

/**
 * The Ashley reply for an inbound mail, queued; null when that mail is not a counterpart's inbound mail or a reply to
 * it exists. The inbound row is locked first and the unique index on answers_message_id refuses a second reply, so
 * two workers can never queue two.
 */
export async function queueReply(
  inboundId: string, reply: Parameters<ConversationStore["queueReply"]>[1],
): Promise<ConversationMessage | null> {
  return gtmWrite(async (sql) => {
    const [inbound] = await sql<Array<Pick<MessageRow, "direction" | "author" | "answered_by_message_id">>>`
      select direction, author, answered_by_message_id from public.gtm_agent_messages where id = ${inboundId}::uuid for update
    `;
    if (replyBlockReason(inbound && {
      direction: inbound.direction, author: inbound.author, answeredByMessageId: inbound.answered_by_message_id,
    })) return null;
    const [queued] = await sql<MessageRow[]>`
      insert into public.gtm_agent_messages ${sql({
        person_id: reply.personId, counterpart_kind: reply.counterpartKind,
        counterpart_email: reply.counterpartEmail.trim().toLowerCase(), author: "ashley", direction: "outbound",
        in_reply_to: reply.inReplyTo, references_header: reply.references, subject: reply.subject,
        body_text: reply.bodyText, new_text: reply.bodyText, root_mail_id: reply.rootMailId,
        answers_message_id: inboundId, send_status: "queued",
      } as never)}
      on conflict (answers_message_id) where answers_message_id is not null do nothing
      returning *
    `;
    if (!queued) return null;
    await sql`update public.gtm_agent_messages set answered_by_message_id = ${queued.id}::uuid where id = ${inboundId}::uuid`;
    return mapMessage(queued);
  });
}

/** An Ashley reply that went out: its provider id and Message-ID, and the time it went (history orders by it). */
export async function markSent(messageId: string, result: { providerMessageId: string | null; rfcMessageId: string | null }): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_messages
    set send_status = 'sent', provider_message_id = ${result.providerMessageId}, rfc_message_id = ${headerMessageId(result.rfcMessageId)},
      error = null, occurred_at = now()
    where id = ${messageId}::uuid and author = 'ashley' and send_status in ('queued', 'failed')
  `);
}

/** An Ashley reply that did not go out: failed (the provider refused) or held (stopped by the pre-send check). */
export async function markFailed(messageId: string, error: string, held = false): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_messages set send_status = ${held ? "held" : "failed"}, error = ${error.slice(0, 1_000)}
    where id = ${messageId}::uuid and author = 'ashley' and send_status in ('queued', 'failed')
  `);
}

/** An Ashley mail that answers no mail of theirs, recorded as sent (ConversationStore.recordSent). */
export async function recordSent(mail: Parameters<NonNullable<ConversationStore["recordSent"]>>[0]): Promise<void> {
  await gtmWrite((sql) => sql`
    insert into public.gtm_agent_messages ${sql({
      person_id: mail.personId, counterpart_kind: mail.counterpartKind, counterpart_email: mail.counterpartEmail.trim().toLowerCase(),
      author: "ashley", direction: "outbound", in_reply_to: mail.inReplyTo, references_header: mail.references, subject: mail.subject,
      body_text: mail.bodyText, new_text: mail.bodyText, root_mail_id: mail.rootMailId, send_status: "sent",
      provider_message_id: mail.providerMessageId, rfc_message_id: headerMessageId(mail.rfcMessageId),
    } as never)}
  `);
}

/** An Ashley mail to this address went out on now's Korea-time day (sent rows only: occurred_at is when it went). */
export async function ashleyMailedToday(counterpartEmail: string, now: Date): Promise<boolean> {
  const email = counterpartEmail.trim().toLowerCase();
  if (!email) return false;
  const day = kstDayWindow(now);
  const [row] = await gtmRead((sql) => sql<Array<{ mailed: boolean }>>`
    select exists (
      select 1 from public.gtm_agent_messages
      where author = 'ashley' and send_status = 'sent' and lower(counterpart_email) = ${email}
        and occurred_at >= ${new Date(day.start)} and occurred_at < ${new Date(day.end)}
    ) as mailed
  `);
  return Boolean(row?.mailed);
}

/** Every mail with this address (conversationRules.ts mergeHistory): our mails that went out + the conversation rows. */
export async function history(counterpartEmail: string, opts: { limit?: number; threadKey?: string } = {}): Promise<HistoryEntry[]> {
  const email = counterpartEmail.trim().toLowerCase();
  if (!email) return [];
  const { mails, messages } = await gtmRead(async (sql) => {
    const mailRows = await sql<Array<{
      id: string; to_email: string; audience: string; subject: string; text_body: string; postings: unknown;
      created_at: string | Date; followup: boolean;
    }>>`
      select m.id::text as id, m.to_email, m.audience, m.subject, m.text_body, m.postings, m.created_at,
        exists (select 1 from public.gtm_agent_people p where p.followup_mail_id = m.id) as followup
      from public.gtm_mails m
      where m.campaign = 'agent' and m.to_email = ${email}
        and (m.status = 'sent' or (m.status = 'sending' and m.provider_message_id is not null))
        and coalesce(m.delivery_status, '') not in ('bounced', 'failed')
      order by m.created_at desc limit 50
    `;
    const messageRows = await sql<MessageRow[]>`
      select * from public.gtm_agent_messages where lower(counterpart_email) = ${email}
      order by occurred_at desc limit ${HISTORY_ROWS}::int
    `;
    return { mails: mailRows, messages: messageRows };
  });
  const historyMails: HistoryMail[] = mails.map((row) => ({
    id: row.id, toEmail: row.to_email,
    kind: row.audience === "company" ? "company" : row.followup ? "followup" : "first",
    subject: row.subject, text: row.text_body ?? "", postings: historyPostings(row.postings), sentAt: iso(row.created_at),
  }));
  return mergeHistory(email, historyMails, messages.map(mapMessage), opts);
}

export async function personAnswered(rootMailId: string, since?: string): Promise<boolean> {
  // A person's answer in any of our threads with the same address (the follow-up's thread, a company thread about
  // another candidate) counts: they answered this conversation.
  const [row] = await gtmRead((sql) => sql<Array<{ answered: boolean }>>`
    select exists (
      select 1 from public.gtm_agent_messages c
      where c.author = 'human' and (c.root_mail_id = ${rootMailId}::uuid
        or lower(c.counterpart_email) = (select lower(btrim(m.to_email)) from public.gtm_mails m where m.id = ${rootMailId}::uuid))
        ${since ? sql`and c.occurred_at > ${new Date(since)}` : sql``}
    ) as answered
  `);
  return Boolean(row?.answered);
}

export async function interestSignals(opts: { postingUrl?: string; since?: string } = {}): Promise<InterestSignal[]> {
  const rows = await gtmRead((sql) => sql<Array<{ id: string; occurred_at: string | Date; signals: unknown }>>`
    select id, occurred_at, signals from public.gtm_agent_messages
    where direction = 'inbound' and jsonb_array_length(signals) > 0
      ${opts.since ? sql`and occurred_at >= ${new Date(opts.since)}` : sql``}
      ${opts.postingUrl ? sql`and signals @> ${sql.json([{ postingUrl: opts.postingUrl }] as never)}::jsonb` : sql``}
    order by occurred_at desc limit 1000
  `);
  return flattenSignals(rows.map((row) => ({ id: row.id, occurredAt: iso(row.occurred_at), signals: row.signals })), opts);
}

/**
 * Members' mails routed to their Harper chat (decided `memberReason`) in the last `days` days, oldest first: the
 * ones nobody wrote after in their conversation (an Ashley mail that went, or a person's answer) and that the person
 * has not seen in Harper since (no message of theirs in that chat after it, no Harper mail to them after it). Each
 * with its chat row (memberRoute.server.ts: payload gtmAgentMessageId) and whether Harper answered in the chat after it.
 */
export async function routedMemberMails(limit: number, memberReason: string, days: number): Promise<Array<{
  inbound: ConversationMessage; userId: string; conversationId: string; chatMessageId: string; routedAt: string; harperAnswered: boolean;
}>> {
  const rows = await gtmRead((sql) => sql<Array<MessageRow & {
    member_user_id: string; member_conversation_id: string; chat_message_id: string; routed_at: string | Date; harper_answered: boolean;
  }>>`
    select m.*, tm.user_id::text as member_user_id, tm.conversation_id::text as member_conversation_id, tm.id::text as chat_message_id,
      tm.created_at as routed_at,
      -- Harper's answer: its words, or a card it put up for the person to confirm a step (career_form).
      exists (
        select 1 from public.talent_messages a
        where a.conversation_id = tm.conversation_id and a.role = 'assistant' and a.message_type in ('chat', 'career_form') and a.id > tm.id
      ) as harper_answered
    from public.gtm_agent_messages m
    join public.talent_users u on lower(u.email) = lower(m.counterpart_email) and u.deleted_at is null
    join lateral (
      select t.id, t.user_id, t.conversation_id, t.created_at
      from public.talent_conversations c
      join public.talent_messages t on t.conversation_id = c.id and t.message_type = 'mail' and t.role = 'user'
        and t.payload ->> 'gtmAgentMessageId' = m.id::text
      where c.user_id = u.user_id
      order by t.id limit 1
    ) tm on true
    where m.direction = 'inbound' and m.author = 'counterpart' and m.counterpart_kind = 'candidate'
      and m.decision = 'no_reply' and m.decision_reason = ${memberReason}
      and m.occurred_at > now() - make_interval(days => ${Math.max(1, Math.floor(days))}::int)
      and not exists (
        select 1 from public.gtm_agent_messages o
        where lower(o.counterpart_email) = lower(m.counterpart_email) and o.occurred_at > m.occurred_at
          and (o.author = 'human' or (o.author = 'ashley' and o.direction = 'outbound' and o.send_status = 'sent'))
      )
      and not exists (
        select 1 from public.talent_messages b
        where b.conversation_id = tm.conversation_id and b.id > tm.id
          and ((b.role = 'user' and coalesce(b.message_type, 'chat') <> 'mail') or (b.role = 'assistant' and b.message_type = 'mail'))
      )
    order by m.occurred_at, m.created_at limit ${Math.max(1, Math.floor(limit))}::int
  `);
  return rows.map((row) => ({
    inbound: mapMessage(row), userId: row.member_user_id, conversationId: row.member_conversation_id, chatMessageId: row.chat_message_id,
    routedAt: iso(row.routed_at),
    harperAnswered: Boolean(row.harper_answered),
  }));
}

export const conversationStore: ConversationStore = {
  saveInbound, listUndecidedInbound, recordDecision, holdSignals, queueReply, markSent, markFailed, recordSent, ashleyMailedToday, history,
  personAnswered, interestSignals,
};

/**
 * The inbound mails Ashley's reply agent decides on this dispatcher tick (after the reply sync), oldest first; none
 * before the table exists (the tick goes on).
 */
export async function undecidedInboundForTick(
  limit: number, opts: Parameters<typeof listUndecidedInbound>[1] = {},
): Promise<ConversationMessage[]> {
  try {
    return await listUndecidedInbound(limit, opts);
  } catch (error) {
    if ((error as { code?: string }).code === MISSING_TABLE) return [];
    throw error;
  }
}
