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
 * 수치: each mailed person's conversation facts (Ashley 답함, 답 안 함 and its reason, 사람에게 넘김, 연락 그만) added to
 * their funnel facts, so the numbers and the log's filters read the same rows (funnel.ts inFunnelColumn). Only Ashley's
 * replies count (a row answering one of their mails): not a mail that told them about a company's connection request,
 * neither when it went out (Ashley 답함) nor when it was held or failed (사람에게 넘김 is about a mail of theirs).
 */
export async function withConversationFacts<T extends { personId: string; sentAt: string | null }>(sql: GtmReadSql, rows: T[]): Promise<T[]> {
  const ids = rows.filter((row) => row.sentAt).map((row) => row.personId);
  if (!ids.length || !(await conversationTableReady(sql))) return rows;
  const found = await sql<Array<Pick<MessageRow, "person_id" | "author" | "direction" | "decision" | "decision_reason" | "send_status" | "occurred_at">>>`
    select c.person_id::text as person_id, c.author, c.direction, c.decision, c.decision_reason, c.send_status, c.occurred_at
    from public.gtm_agent_messages c
    where c.person_id = any(${ids}::uuid[])
      and ((c.author = 'ashley' and c.send_status in ('sent', 'held', 'failed') and c.answers_message_id is not null)
        or (c.direction = 'inbound' and c.decision in ('no_reply', 'stop', 'hand_to_human')))
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

/**
 * 사람이 볼 답장 as people (the log's filter, Shaun 11/22: the old 메일 tab's list becomes a 스레드 filter): the ids of
 * the people whose handed-over replies no one answered yet (awaitingHuman, the red line's own rule). Empty before the
 * table is there.
 */
export async function awaitingHumanPersonIds(sql: GtmReadSql, includeTest: boolean): Promise<string[]> {
  if (!(await conversationTableReady(sql))) return [];
  return [...new Set(awaitingHuman(await threadRows(sql, includeTest)).flatMap((row) => (row.personId ? [row.personId] : [])))];
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

