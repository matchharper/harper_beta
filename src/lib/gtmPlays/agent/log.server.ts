import "server-only";

import { gtmRead } from "../db.server";
import { EXPLORE_SOURCE, readSignalLogEntry, type SignalLogEntry } from "./signals";
import { contactOutcome, stageOf, type AgentStage, type ContactOutcome } from "./stage";
import type { AgentEventKind, AgentExcludeReason, AgentPosting, AgentStatus } from "./types";
import { agentReachedByPerson } from "./views.server";

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
  profileUrl: string | null;
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
  /** How far the person got (회사 연결 … 보냄), the same words as the numbers; null when replied (the line says 답장 옴). */
  outcome: ContactOutcome | null;
  isTest: boolean;
};

/** The lines that are a mail going out. */
export const LOG_MAIL_KINDS: readonly AgentEventKind[] = ["sent", "followup_sent"];

const MISSING = new Set(["42P01", "42703"]);

type LogSqlRow = {
  person_id: string; at: string; kind: AgentEventKind; by: string | null; note: string | null; source: string;
  name: string | null; headline: string | null; profile_url: string | null; email: string | null; status: AgentStatus;
  exclude_reason: AgentExcludeReason | null; reason: string | null; postings: unknown; subject: string | null; body: string | null;
  after: AgentEventKind | null; event_kinds: string[] | null; is_test: boolean; total: number;
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
        nullif(e.value->>'note', '') as note, p.source, p.name, p.headline, p.profile_url, p.email, p.status, p.exclude_reason,
        p.reason, p.postings, p.is_test,
        case e.value->>'kind' when 'sent' then m1.subject when 'followup_sent' then m2.subject end as subject,
        left(case e.value->>'kind' when 'sent' then m1.text_body when 'followup_sent' then m2.text_body end, 3000) as body,
        (select r.value->>'kind' from jsonb_array_elements(p.events) r(value)
          where r.value->>'kind' in ('signed_up', 'clicked', 'replied', 'unsubscribed', 'bounced', 'ended')
          order by case r.value->>'kind' when 'signed_up' then 0 when 'replied' then 1 when 'clicked' then 2 else 3 end,
            (r.value->>'at')::timestamptz desc
          limit 1) as after,
        (select coalesce(array_agg(distinct r.value->>'kind'), '{}') from jsonb_array_elements(p.events) r(value)) as event_kinds,
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
    const reached = await gtmRead((sql) => agentReachedByPerson(sql, [...new Set(rows.map((row) => row.person_id))]));
    const all = rows.map((row): AgentLogRow => ({
        personId: row.person_id, at: new Date(row.at).toISOString(), kind: row.kind, by: row.by ?? "agent",
        note: row.note, source: row.source, name: row.name, headline: row.headline, profileUrl: row.profile_url, email: row.email,
        status: row.status, excludeReason: row.exclude_reason, reason: row.reason,
        postings: Array.isArray(row.postings) ? row.postings as AgentPosting[] : [], subject: row.subject, body: row.body, after: row.after,
        outcome: row.status === "replied" ? null
          : contactOutcome({ status: row.status, eventKinds: row.event_kinds ?? [], reached: reached.get(row.person_id) }),
        isTest: Boolean(row.is_test),
    }));
    return { total: Number(rows[0]?.total ?? 0), rows: all };
  } catch (error) {
    if (MISSING.has(String((error as { code?: string })?.code ?? ""))) return { rows: [], total: 0 };
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 검색 기록: one line per search (a site in a run) and per uploaded applicant file.

/** One search: where, how many searches, who it found, what it cost and the agent's plans and queries. */
export type AgentSearchLine = {
  kind: "search";
  runId: string; at: string; source: string; searches: number; newPeople: number; knownPeople: number; costUsd: number;
  /** Skipped: the day's money left was too little for this search. */
  skippedBudget: boolean;
  log: SignalLogEntry | null;
  /** The open web: new domains it kept people on (most first). */
  newDomains: Array<{ domain: string; kept: number }>;
  error: string | null;
};

/** One uploaded applicant file and what came of its people, in the numbers' words. */
export type AgentUploadLine = {
  kind: "upload";
  runId: string; at: string; fileName: string | null; rows: number | null; newPeople: number; alreadyKnown: number | null;
  withEmail: number | null;
  stages: Record<AgentStage, number>;
  error: string | null;
};

export type AgentSearchLogLine = AgentSearchLine | AgentUploadLine;

type SearchRunRow = {
  id: string; kind: "daily" | "import" | "manual"; counts: Record<string, unknown> | null; signal_log: Record<string, unknown> | null;
  error: string | null; created_at: string | Date; started_at: string | Date | null;
};

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);
const isoOf = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : null);

export async function listAgentSearchLog(args: { days: number; includeTest: boolean; limit: number }): Promise<{ lines: AgentSearchLogLine[] }> {
  const days = Math.min(Math.max(Math.trunc(args.days) || 30, 1), 365);
  const limit = Math.min(Math.max(Math.trunc(args.limit) || 100, 1), 300);
  try {
    return await gtmRead(async (sql) => {
      const runs = await sql<SearchRunRow[]>`
        select id::text as id, kind, counts, signal_log, error, created_at, started_at from public.gtm_agent_runs
        where (${args.includeTest} or not is_test) and created_at >= now() - make_interval(days => ${days}::int)
        order by created_at desc limit 200
      `;
      const uploadIds = runs.filter((run) => run.kind === "import").map((run) => run.id);
      const byRun = uploadIds.length ? await sql<Array<{
        run_id: string; status: AgentStatus; exclude_reason: AgentExcludeReason | null; sent: boolean; replied: boolean; n: number;
      }>>`
        select run_id::text as run_id, status, exclude_reason, sent_at is not null as sent, replied_at is not null as replied,
          count(*)::int as n
        from public.gtm_agent_people where run_id = any(${uploadIds}::uuid[]) group by 1, 2, 3, 4, 5
      ` : [];
      const lines: AgentSearchLogLine[] = [];
      for (const run of runs) {
        const counts = run.counts ?? {};
        const log = run.signal_log ?? {};
        const runAt = isoOf(run.started_at) ?? isoOf(run.created_at) ?? new Date().toISOString();
        const error = run.error || (num(counts.errors) ? `오류 ${num(counts.errors)}번` : null);
        if (run.kind === "import") {
          const upload = log.upload && typeof log.upload === "object" ? log.upload as Record<string, unknown> : null;
          const stages: Record<AgentStage, number> = { working: 0, excluded: 0, contacted: 0, replied: 0 };
          let people = 0;
          for (const row of byRun.filter((item) => item.run_id === run.id)) {
            people += row.n;
            // The numbers' sets: 처리 중 · 제외 · 연락 (답장 is counted inside 연락 too).
            const stage = stageOf({
              status: row.status, excludeReason: row.exclude_reason, sentAt: row.sent ? "sent" : null, repliedAt: row.replied ? "replied" : null,
            });
            stages[stage === "replied" ? "contacted" : stage] += row.n;
            if (stage === "replied") stages.replied += row.n;
          }
          lines.push({
            kind: "upload", runId: run.id, at: typeof upload?.at === "string" ? upload.at : isoOf(run.created_at) ?? runAt,
            fileName: typeof upload?.fileName === "string" ? upload.fileName : null, rows: upload ? num(upload.rows) : null,
            newPeople: upload ? num(upload.newPeople) : people, alreadyKnown: upload ? num(upload.alreadyKnown) : null,
            withEmail: upload ? num(upload.withEmail) : null, stages, error,
          });
          continue;
        }
        const searched = Object.keys(counts).filter((key) => key.startsWith("searched_")).map((key) => key.slice("searched_".length));
        const newDomains = Object.entries(counts).filter(([key]) => key.startsWith("new_domain:"))
          .map(([key, value]) => ({ domain: key.slice("new_domain:".length), kept: num(value) })).sort((a, b) => b.kept - a.kept);
        const runLines: AgentSearchLine[] = searched.map((source): AgentSearchLine => {
          const entry = readSignalLogEntry(log[source]);
          return {
            kind: "search", runId: run.id, at: entry?.at ?? runAt, source,
            searches: num(counts[`searches_${source}`]), newPeople: num(counts[`signal_found_${source}`]),
            knownPeople: num(counts[`signal_known_${source}`]), costUsd: num(counts[`signal_cost_${source}`]),
            skippedBudget: Boolean(num(counts[`skipped_budget_${source}`])), log: entry,
            newDomains: source === EXPLORE_SOURCE ? newDomains : [], error: null,
          };
        }).sort((a, b) => b.at.localeCompare(a.at));
        // A run's error shows on its latest search (or on a line of its own when it searched nothing).
        if (error && runLines.length) runLines[0].error = error;
        else if (error) {
          runLines.push({
            kind: "search", runId: run.id, at: runAt, source: "", searches: 0, newPeople: 0, knownPeople: 0, costUsd: 0,
            skippedBudget: false, log: null, newDomains: [], error,
          });
        }
        lines.push(...runLines);
      }
      lines.sort((a, b) => b.at.localeCompare(a.at));
      return { lines: lines.slice(0, limit) };
    });
  } catch (error) {
    if (MISSING.has(String((error as { code?: string })?.code ?? ""))) return { lines: [] };
    throw error;
  }
}
