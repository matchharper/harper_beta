import "server-only";

import { gtmRead, gtmWrite, type GtmReadSql } from "../db.server";
import type { AshleyDecisionKind, ConversationMessage, CounterpartKind, InterestSignal, MessageAuthor } from "./conversation";
import { awaitingHuman, conversationFactsByPerson, unmatchedToRecord, type AgentMailKind } from "./conversationView";
import { kstClock } from "./people";
import { resolveAgentPeriod, type AgentPeriodInput } from "./period";
import { mapAgentPerson } from "./store.server";
import type { AgentPerson } from "./types";

/**
 * #5 /ops reads of the reply conversations (gtm_agent_messages, conversation.ts), straight from the table with the
 * views' own read-only SQL: /ops needs each row's decision, send status and error, which ConversationStore.history
 * (the writer's context) leaves out. Before the table's migration every read here returns nothing.
 */

const MISSING = new Set(["42P01", "42703"]);
const isMissing = (error: unknown) => MISSING.has(String((error as { code?: string })?.code ?? ""));
const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : null);

/** Whether gtm_agent_messages is there; checked first, since a failed statement would end the read's transaction. */
export async function conversationTableReady(sql: GtmReadSql): Promise<boolean> {
  const [row] = await sql<Array<{ ready: boolean }>>`select to_regclass('public.gtm_agent_messages') is not null as ready`;
  return Boolean(row?.ready);
}

type MessageRow = {
  id: string; person_id: string | null; counterpart_kind: CounterpartKind; counterpart_email: string; author: MessageAuthor;
  direction: "inbound" | "outbound"; gmail_message_id: string | null; gmail_thread_id: string | null;
  rfc_message_id: string | null; in_reply_to: string | null; references_header: string | null; subject: string | null;
  body_text: string | null; new_text: string | null; root_mail_id: string | null; decision: AshleyDecisionKind | null;
  decision_reason: string | null; signals: unknown; answered_by_message_id: string | null;
  send_status: ConversationMessage["sendStatus"]; provider_message_id: string | null; error: string | null;
  occurred_at: string | Date; created_at: string | Date;
};

function mapMessage(row: MessageRow): ConversationMessage {
  return {
    id: String(row.id), personId: row.person_id ? String(row.person_id) : null, counterpartKind: row.counterpart_kind,
    counterpartEmail: row.counterpart_email, author: row.author, direction: row.direction, gmailMessageId: row.gmail_message_id,
    gmailThreadId: row.gmail_thread_id, rfcMessageId: row.rfc_message_id, inReplyTo: row.in_reply_to, references: row.references_header,
    subject: row.subject ?? "", bodyText: row.body_text ?? "", newText: row.new_text ?? "",
    rootMailId: row.root_mail_id ? String(row.root_mail_id) : null, decision: row.decision, decisionReason: row.decision_reason,
    signals: Array.isArray(row.signals) ? (row.signals as InterestSignal[]) : [],
    answeredByMessageId: row.answered_by_message_id ? String(row.answered_by_message_id) : null, sendStatus: row.send_status,
    providerMessageId: row.provider_message_id, error: row.error, occurredAt: iso(row.occurred_at) ?? "", createdAt: iso(row.created_at) ?? "",
  };
}

/**
 * 수치: each mailed person's conversation facts (Ashley 답함, 답 안 함 and its reason) added to their funnel facts, so the
 * numbers and the log's filters read the same rows (funnel.ts inFunnelColumn). Ashley 답함 counts her replies only (a
 * row answering one of their mails), not a mail that told them about a company's connection request.
 */
export async function withConversationFacts<T extends { personId: string; sentAt: string | null }>(sql: GtmReadSql, rows: T[]): Promise<T[]> {
  const ids = rows.filter((row) => row.sentAt).map((row) => row.personId);
  if (!ids.length || !(await conversationTableReady(sql))) return rows;
  const found = await sql<Array<Pick<MessageRow, "person_id" | "author" | "direction" | "decision" | "decision_reason" | "send_status" | "occurred_at">>>`
    select c.person_id::text as person_id, c.author, c.direction, c.decision, c.decision_reason, c.send_status, c.occurred_at
    from public.gtm_agent_messages c
    where c.person_id = any(${ids}::uuid[])
      and ((c.author = 'ashley' and c.send_status = 'sent' and c.answers_message_id is not null)
        or (c.direction = 'inbound' and c.decision in ('no_reply', 'stop')))
  `;
  const facts = conversationFactsByPerson(found.map((row) => ({
    personId: row.person_id, author: row.author, direction: row.direction, decision: row.decision,
    decisionReason: row.decision_reason, sendStatus: row.send_status, occurredAt: iso(row.occurred_at) ?? "",
  })));
  return rows.map((row) => {
    const fact = facts.get(row.personId);
    return fact ? { ...row, ...fact } : row;
  });
}

/** 대화: every conversation row of a person (theirs, or with their address), oldest first. */
export async function readConversationMessages(sql: GtmReadSql, who: { personId: string; email: string | null }): Promise<ConversationMessage[]> {
  if (!(await conversationTableReady(sql))) return [];
  const rows = await sql<MessageRow[]>`
    select c.* from public.gtm_agent_messages c
    where c.person_id = ${who.personId}::uuid ${who.email ? sql`or c.counterpart_email = ${who.email}` : sql``}
    order by c.occurred_at, c.created_at
    limit 500
  `;
  return rows.map(mapMessage);
}

/** The rows the red line's rule reads: every handed-over reply and every human reply (test people's left out). */
async function threadRows(sql: GtmReadSql, includeTest: boolean): Promise<ConversationMessage[]> {
  const rows = await sql<MessageRow[]>`
    select c.* from public.gtm_agent_messages c
    left join public.gtm_agent_people p on p.id = c.person_id
    where (c.decision = 'hand_to_human' or c.author = 'human') and (${includeTest} or p.id is null or not p.is_test)
    limit 5000
  `;
  return rows.map(mapMessage);
}

export type AgentConversationHealth = {
  /** 사람이 볼 답장: replies handed to a person that no one answered yet (conversationView.ts awaitingHuman). */
  awaitingHuman: number;
};

export async function agentConversationHealth(): Promise<AgentConversationHealth> {
  try {
    return await gtmRead(async (sql) => {
      if (!(await conversationTableReady(sql))) return { awaitingHuman: 0 };
      return { awaitingHuman: awaitingHuman(await threadRows(sql, false)).length };
    });
  } catch (error) {
    if (isMissing(error)) return { awaitingHuman: 0 };
    throw error;
  }
}

/** One line of the 메일 log: a gtm_mails mail of the agent or a conversation row. */
export type AgentMailLogLine = {
  key: string; at: string; person: AgentPerson | null; counterpartEmail: string;
  direction: "inbound" | "outbound"; author: MessageAuthor | "agent_mail"; mailKind: AgentMailKind | null;
  subject: string; text: string;
  mailStatus: string | null; deliveryStatus: string | null;
  decision: AshleyDecisionKind | null; decisionReason: string | null; sendStatus: ConversationMessage["sendStatus"]; error: string | null;
};

type MailLogRow = {
  key: string; at: string | Date; person_id: string | null; counterpart_email: string; direction: "inbound" | "outbound";
  author: MessageAuthor | "agent_mail"; mail_kind: AgentMailKind | null; subject: string | null; text: string | null;
  mail_status: string | null; delivery_status: string | null; decision: AshleyDecisionKind | null; decision_reason: string | null;
  send_status: ConversationMessage["sendStatus"]; error: string | null; total: number;
};

/**
 * 로그 · 메일: one line per agent mail (gtm_mails, campaign agent) and per conversation row sent or received on the
 * period's KST days, newest first. With awaitingHuman, only the 사람이 볼 답장 (the red line's), whenever they came.
 * Also the period's mails the reply read left unopened (not threaded to an agent mail; a count only).
 */
export async function listAgentMailLog(args: AgentPeriodInput & {
  includeTest: boolean; awaitingHuman?: boolean; limit: number; offset: number;
}): Promise<{ lines: AgentMailLogLine[]; total: number; unmatchedSkipped: number | null }> {
  const period = resolveAgentPeriod(args, kstClock(new Date()).day);
  const limit = Math.min(Math.max(args.limit, 1), 200);
  const offset = Math.max(args.offset, 0);
  const unmatchedSkipped = args.awaitingHuman ? null : await readUnmatchedSkipped(period);
  try {
    return await gtmRead(async (sql) => {
      const ready = await conversationTableReady(sql);
      if (args.awaitingHuman && !ready) return { lines: [], total: 0, unmatchedSkipped };
      const waiting = args.awaitingHuman ? awaitingHuman(await threadRows(sql, args.includeTest)).map((row) => row.id) : null;
      // Built per statement: the list, then (past its end) the count.
      const items = () => {
        const messages = sql`
          select 'msg:' || c.id::text as key, c.occurred_at as at, c.person_id::text as person_id, c.counterpart_email,
            c.direction, c.author, null::text as mail_kind, c.subject, left(coalesce(nullif(c.new_text, ''), c.body_text), 600) as text,
            null::text as mail_status, null::text as delivery_status, c.decision, c.decision_reason, c.send_status, c.error
          from public.gtm_agent_messages c left join public.gtm_agent_people p on p.id = c.person_id
          where ${waiting ? sql`c.id = any(${waiting}::uuid[])` : sql`(c.occurred_at at time zone 'Asia/Seoul')::date between ${period.from}::date and ${period.to}::date
            and (${args.includeTest} or p.id is null or not p.is_test)`}
        `;
        if (waiting) return messages;
        const mails = sql`
          select 'mail:' || m.id::text as key, m.created_at as at, m.agent_person_id::text as person_id, m.to_email as counterpart_email,
            'outbound'::text as direction, 'agent_mail'::text as author,
            case when p.mail_id = m.id then 'first' when p.followup_mail_id = m.id then 'followup'
              when m.audience = 'company' then 'company' else 'mail' end as mail_kind,
            m.subject, left(m.text_body, 600) as text, m.status as mail_status, m.delivery_status,
            null::text as decision, null::text as decision_reason, null::text as send_status, m.error
          from public.gtm_mails m left join public.gtm_agent_people p on p.id = m.agent_person_id
          where m.campaign = 'agent' and (m.created_at at time zone 'Asia/Seoul')::date between ${period.from}::date and ${period.to}::date
            and (${args.includeTest} or p.id is null or not p.is_test)
        `;
        return ready ? sql`${mails} union all ${messages}` : mails;
      };
      const rows = await sql<MailLogRow[]>`
        select i.*, count(*) over ()::int as total from (${items()}) i
        order by i.at desc, i.key limit ${limit}::int offset ${offset}::int
      `;
      const ids = [...new Set(rows.map((row) => row.person_id).filter((id): id is string => Boolean(id)))];
      const people = ids.length ? await sql`select p.* from public.gtm_agent_people p where p.id = any(${ids}::uuid[])` : [];
      const personById = new Map(people.map((row) => { const person = mapAgentPerson(row as never); return [person.id, person]; }));
      const lines = rows.map((row): AgentMailLogLine => ({
        key: row.key, at: iso(row.at) ?? "", person: row.person_id ? personById.get(row.person_id) ?? null : null,
        counterpartEmail: row.counterpart_email, direction: row.direction, author: row.author, mailKind: row.mail_kind,
        subject: row.subject ?? "", text: row.text ?? "", mailStatus: row.mail_status, deliveryStatus: row.delivery_status,
        decision: row.decision, decisionReason: row.decision_reason, sendStatus: row.send_status, error: row.error,
      }));
      // The window count is on every row; an offset past the end gives no rows, so count again then.
      const total = rows[0]?.total ?? (offset ? Number((await sql<Array<{ n: number }>>`select count(*)::int as n from (${items()}) i`)[0]?.n ?? 0) : 0);
      return { lines, total, unmatchedSkipped };
    });
  } catch (error) {
    if (isMissing(error)) return { lines: [], total: 0, unmatchedSkipped };
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Mails the reply read left unopened (not threaded to an agent mail), counted per mailbox per KST day
// (gtm_agent_mailboxes.unmatched_by_day, 20261121060000_gtm_agent_mailbox_unmatched.sql).

/** After a reply read (dispatch route): adds each finished mailbox read's unmatched count to today's. Never throws. */
export async function recordUnmatchedSkipped(mailboxes: ReadonlyArray<{ mailbox: string; error?: string; unmatched?: number }>): Promise<void> {
  const counts = unmatchedToRecord(mailboxes);
  if (!counts.length) return;
  const day = kstClock(new Date()).day;
  try {
    await gtmWrite(async (sql) => {
      for (const { mailbox, count } of counts) {
        await sql`
          update public.gtm_agent_mailboxes set unmatched_by_day = jsonb_set(
            case when jsonb_typeof(unmatched_by_day) = 'object' then unmatched_by_day else '{}'::jsonb end, array[${day}::text],
            to_jsonb(coalesce(case when unmatched_by_day ->> ${day}::text ~ '^[0-9]+$' then (unmatched_by_day ->> ${day}::text)::int end, 0) + ${count}::int))
          where email = ${mailbox}
        `;
      }
    });
  } catch (error) {
    console.warn("[gtm-agent] unmatched mail count", String((error as { message?: unknown })?.message ?? error).slice(0, 300));
  }
}

/** The period's unmatched mails over every mailbox; null before the column is there. */
async function readUnmatchedSkipped(period: { from: string; to: string }): Promise<number | null> {
  try {
    const [row] = await gtmRead((sql) => sql<Array<{ n: number }>>`
      select coalesce(sum(case when v.value ~ '^[0-9]+$' then v.value::int else 0 end), 0)::int as n
      from public.gtm_agent_mailboxes b cross join lateral jsonb_each_text(
        case when jsonb_typeof(b.unmatched_by_day) = 'object' then b.unmatched_by_day else '{}'::jsonb end) v(key, value)
      where v.key between ${period.from} and ${period.to}
    `);
    return Number(row?.n ?? 0);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
