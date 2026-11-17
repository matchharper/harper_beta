import "server-only";

import { gtmRead } from "../db.server";
import type { AgentEventKind, AgentExcludeReason, AgentPosting, AgentStatus } from "./types";

/**
 * #5 로그: every step the agent (or Ops) took, newest first, one line per timeline event (gtm_agent_people.events)
 * with who it was about, where they were found, what was sent and why. Read only. The full mail body is on the
 * person's timeline (agent.timeline).
 */

export type AgentLogRow = {
  personId: string;
  at: string;
  kind: AgentEventKind;
  /** "agent", or the Ops user id. */
  by: string;
  note: string | null;
  source: string;
  name: string | null;
  headline: string | null;
  email: string | null;
  status: AgentStatus;
  excludeReason: AgentExcludeReason | null;
  /** Why the agent proposed these postings (written with the message). */
  reason: string | null;
  postings: AgentPosting[];
  /** The mail's subject and text, for a sent (or follow-up sent) line (to check the agent's writing on the log). */
  subject: string | null;
  body: string | null;
  /** What came of it so far: the person's latest reaction (signed_up, clicked, replied, unsubscribed, bounced, ended). */
  after: AgentEventKind | null;
  isTest: boolean;
};

/** The lines that are a mail going out. */
export const LOG_MAIL_KINDS: readonly AgentEventKind[] = ["sent", "followup_sent"];

const MISSING = new Set(["42P01", "42703"]);

type LogSqlRow = {
  person_id: string; at: string; kind: AgentEventKind; by: string | null; note: string | null; source: string;
  name: string | null; headline: string | null; email: string | null; status: AgentStatus;
  exclude_reason: AgentExcludeReason | null; reason: string | null; postings: unknown; subject: string | null; body: string | null;
  after: AgentEventKind | null; is_test: boolean; total: number;
};

export async function listAgentLog(args: {
  days: number;
  source?: string | null;
  /** Only the lines where a mail went out. */
  mailsOnly: boolean;
  includeTest: boolean;
  limit: number;
  offset: number;
}): Promise<{ rows: AgentLogRow[]; total: number }> {
  const days = Math.min(Math.max(Math.trunc(args.days) || 30, 1), 365);
  const limit = Math.min(Math.max(Math.trunc(args.limit) || 50, 1), 200);
  const offset = Math.max(Math.trunc(args.offset) || 0, 0);
  try {
    const rows = await gtmRead((sql) => sql<LogSqlRow[]>`
      select p.id::text as person_id, e.value->>'at' as at, e.value->>'kind' as kind, e.value->>'by' as by,
        nullif(e.value->>'note', '') as note, p.source, p.name, p.headline, p.email, p.status, p.exclude_reason,
        p.reason, p.postings, p.is_test,
        case e.value->>'kind' when 'sent' then m1.subject when 'followup_sent' then m2.subject end as subject,
        left(case e.value->>'kind' when 'sent' then m1.text_body when 'followup_sent' then m2.text_body end, 3000) as body,
        (select r.value->>'kind' from jsonb_array_elements(p.events) r(value)
          where r.value->>'kind' in ('signed_up', 'clicked', 'replied', 'unsubscribed', 'bounced', 'ended')
          order by case r.value->>'kind' when 'signed_up' then 0 when 'replied' then 1 when 'clicked' then 2 else 3 end,
            (r.value->>'at')::timestamptz desc
          limit 1) as after,
        count(*) over ()::int as total
      from public.gtm_agent_people p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.events) = 'array' then p.events else '[]'::jsonb end) e(value)
      left join public.gtm_mails m1 on m1.id = p.mail_id
      left join public.gtm_mails m2 on m2.id = p.followup_mail_id
      where (${args.includeTest} or not p.is_test)
        and (e.value->>'at')::timestamptz >= now() - make_interval(days => ${days}::int)
        ${args.source ? sql`and p.source = ${args.source}` : sql``}
        ${args.mailsOnly ? sql`and e.value->>'kind' = any(${[...LOG_MAIL_KINDS]}::text[])` : sql``}
      order by (e.value->>'at')::timestamptz desc, p.id
      limit ${limit}::int offset ${offset}::int
    `);
    return {
      total: Number(rows[0]?.total ?? 0),
      rows: rows.map((row): AgentLogRow => ({
        personId: row.person_id, at: new Date(row.at).toISOString(), kind: row.kind, by: row.by ?? "agent",
        note: row.note, source: row.source, name: row.name, headline: row.headline, email: row.email,
        status: row.status, excludeReason: row.exclude_reason, reason: row.reason,
        postings: Array.isArray(row.postings) ? row.postings as AgentPosting[] : [], subject: row.subject, body: row.body, after: row.after,
        isTest: Boolean(row.is_test),
      })),
    };
  } catch (error) {
    if (MISSING.has(String((error as { code?: string })?.code ?? ""))) return { rows: [], total: 0 };
    throw error;
  }
}
