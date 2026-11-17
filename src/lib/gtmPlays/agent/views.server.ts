import "server-only";

import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { gtmRead, gtmWrite, type GtmReadSql } from "../db.server";
import { gtmUnsubscribeToken, unsubscribeGtmMail } from "../mailSend.server";
import { REACTED_STAGES } from "../outreachFunnel";
import {
  agentFunnelBySource, tallyAgentPeople, type AgentFunnelNumbers, type AgentFunnelRow,
} from "./funnel";
import { cleanEmail, kstClock } from "./people";
import {
  agentCostToday, createAgentRun, mapAgentPerson, mapRun, readAgentPerson, readAgentSettings, saveAgentSettings,
  updateAgentPerson, type AgentRun, type RunRow,
} from "./store.server";
import type {
  AgentChannel, AgentExcludeReason, AgentPerson, AgentSettings, AgentSource, AgentStatus,
} from "./types";

/**
 * #5 /ops reads (numbers, people, timeline, the hand-send list) and the Ops actions on a person (보냈어요, 건너뛰기,
 * 답장 옴, 승인). Every change goes through updateAgentPerson with the statuses it expects, so a second click or a
 * run that moved the person on changes nothing.
 */

const MISSING = new Set(["42P01", "42703"]);
const isMissing = (error: unknown) => MISSING.has(String((error as { code?: string })?.code ?? ""));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------------------------------------------
// 숫자

type FunnelSqlRow = {
  run_id: string | null; source: AgentSource; status: AgentStatus; exclude_reason: AgentExcludeReason | null; channel: AgentChannel | null;
  sent_at: string | Date | null; signal_at: string | Date | null; replied_at: string | Date | null; cost_usd: string | number;
  clicked_at: string | Date | null; signed_up_at: string | Date | null; interested: boolean; connected: boolean;
};

const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : null);

export type AgentFunnel = {
  total: AgentFunnelNumbers;
  /** Per source (where the person was found): the turned-on sources first, then any other a person came from. */
  bySource: Record<AgentSource, AgentFunnelNumbers>;
  today: {
    day: string; costUsd: number; costCapUsd: number; mailCap: number; mailsSent: number;
    /** Today's mails and spend per source (search spend included). */
    bySource: Record<AgentSource, { mailsSent: number; costUsd: number }>;
  };
  /**
   * What the agent spent in the period (the runs of the last `days` Korea-time days: searching, matching, writing).
   * Test runs count when includeTest; their spend is also given apart (the money is real either way).
   */
  period: { days: number; costUsd: number; testCostUsd: number; includesTest: boolean };
  /** false: the #5 tables are not there yet (before 20261117140000_gtm_agent). */
  available: boolean;
};

/**
 * The funnel facts of the person rows `where` picks (agent/funnel.ts): the proposed postings' Roles count for 관심·지원
 * and 회사 연결 (a mail may carry 2-3 postings).
 */
export async function agentFunnelRows(sql: GtmReadSql, where: ReturnType<GtmReadSql>): Promise<Array<AgentFunnelRow & { runId: string | null }>> {
  const rows = await sql<FunnelSqlRow[]>`
    select p.run_id::text as run_id, p.source, p.status, p.exclude_reason, p.channel, p.sent_at, p.signal_at, p.replied_at, p.cost_usd,
      coalesce(m.first_opened_at, mf.first_opened_at) as clicked_at,
      coalesce(m.claimed_at, mf.claimed_at) as signed_up_at,
      exists (
        select 1 from public.talent_opportunity_recommendation rec
        where rec.talent_id = coalesce(m.claimed_talent_id, mf.claimed_talent_id)
          and rec.saved_stage = any(${[...REACTED_STAGES]}::text[])
          and (rec.id = m.claimed_recommendation_id or rec.id = mf.claimed_recommendation_id
            or rec.role_id in (select (e->>'roleId')::uuid from jsonb_array_elements(p.postings) e
              where e->>'roleId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
      ) as interested,
      exists (
        select 1 from public.company_intro_candidates c
        where c.talent_id = coalesce(m.claimed_talent_id, mf.claimed_talent_id)
          and (c.status = 'connected' or c.connected_at is not null)
          and (c.role_id = m.role_id
            or c.role_id in (select (e->>'roleId')::uuid from jsonb_array_elements(p.postings) e
              where e->>'roleId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
      ) as connected
    from public.gtm_agent_people p
    left join public.gtm_mails m on m.id = p.mail_id
    left join public.gtm_mails mf on mf.id = p.followup_mail_id
    where ${where}
    limit 20000
  `;
  return rows.map((row) => ({
    runId: row.run_id, source: row.source, status: row.status, excludeReason: row.exclude_reason, channel: row.channel,
    sentAt: iso(row.sent_at), signalAt: iso(row.signal_at), clickedAt: iso(row.clicked_at), signedUpAt: iso(row.signed_up_at),
    repliedAt: iso(row.replied_at), interested: Boolean(row.interested), connected: Boolean(row.connected),
    costUsd: Number(row.cost_usd),
  }));
}

/**
 * Per source and in total, the people found in the last `days` and what came of them (agent/funnel.ts). The
 * proposed postings' Roles count for 관심·지원 and 회사 연결 (a mail may carry 2-3 postings). Test rows are left out
 * unless asked for.
 */
export async function agentFunnel(args: { days: number; includeTest: boolean }): Promise<AgentFunnel> {
  const days = Math.min(Math.max(Math.trunc(args.days) || 30, 1), 365);
  const settings = await readAgentSettings();
  const day = kstClock(new Date()).day;
  const turnedOn = Object.entries(settings.signals.sources).filter(([, setting]) => setting.enabled).map(([source]) => source);
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  try {
    const facts = await gtmRead(async (sql) => {
      const rows = await agentFunnelRows(sql, sql`p.created_at >= now() - make_interval(days => ${days}::int)
        and (${args.includeTest} or not p.is_test)`);
      const costUsd = await agentCostToday(sql, day);
      const [spend] = await sql<Array<{ total: string | number; test: string | number }>>`
        -- Money spent is all of it (test runs too), as today's cost against the cap counts it.
        select coalesce(sum(cost_usd), 0) as total,
          coalesce(sum(cost_usd) filter (where is_test), 0) as test
        from public.gtm_agent_runs
        where run_date > ${day}::date - ${days}::int
      `;
      // Each source's search spend (counts.signal_cost_<source>), which no one person carries: in the period and today.
      const search = await sql<Array<{ source: string; period: string | number; today: string | number }>>`
        select substring(c.key from 'signal_cost_(.*)') as source,
          coalesce(sum(c.value::numeric), 0) as period,
          coalesce(sum(c.value::numeric) filter (where r.run_date = ${day}::date), 0) as today
        from public.gtm_agent_runs r cross join lateral jsonb_each_text(r.counts) c(key, value)
        where r.run_date > ${day}::date - ${days}::int and c.key like 'signal_cost_%'
          and c.value ~ '^[0-9.]+$' and (${args.includeTest} or not r.is_test)
        group by 1
      `;
      const todayBySource = await sql<Array<{ source: string; mails: number; cost: string | number }>>`
        select p.source,
          count(m.id) filter (where m.status in ('sending', 'sent') and (m.created_at at time zone 'Asia/Seoul')::date = ${day}::date)::int as mails,
          coalesce(sum(p.cost_usd) filter (where (p.created_at at time zone 'Asia/Seoul')::date = ${day}::date), 0) as cost
        from public.gtm_agent_people p
        left join public.gtm_mails m on m.agent_person_id = p.id and m.campaign = 'agent'
        where (p.created_at at time zone 'Asia/Seoul')::date >= ${day}::date - 60 and (${args.includeTest} or not p.is_test)
        group by 1
      `;
      const [sent] = await sql<Array<{ n: number }>>`
        select count(*)::int as n from public.gtm_mails
        where campaign = 'agent' and status in ('sending', 'sent')
          and (created_at at time zone 'Asia/Seoul')::date = ${day}::date
      `;
      return { rows, costUsd, mailsSent: Number(sent?.n ?? 0), spend, search, todayBySource };
    });
    // The people's own spend (matching, writing) plus each source's search spend.
    const bySource = agentFunnelBySource(facts.rows, turnedOn);
    const total = tallyAgentPeople(facts.rows);
    const todayBySourceOut: AgentFunnel["today"]["bySource"] = {};
    for (const source of Object.keys(bySource)) todayBySourceOut[source] = { mailsSent: 0, costUsd: 0 };
    for (const row of facts.todayBySource) {
      todayBySourceOut[row.source] = { mailsSent: Number(row.mails), costUsd: round(Number(row.cost)) };
    }
    for (const row of facts.search) {
      if (!row.source) continue;
      const numbers = bySource[row.source] ?? (bySource[row.source] = tallyAgentPeople([]));
      numbers.costUsd = round(numbers.costUsd + Number(row.period));
      total.costUsd = round(total.costUsd + Number(row.period));
      const today = todayBySourceOut[row.source] ?? (todayBySourceOut[row.source] = { mailsSent: 0, costUsd: 0 });
      today.costUsd = round(today.costUsd + Number(row.today));
    }
    return {
      total,
      bySource,
      today: { day, costUsd: facts.costUsd, costCapUsd: settings.dailyCostUsd, mailCap: settings.dailyMailCap, mailsSent: facts.mailsSent, bySource: todayBySourceOut },
      period: { days, costUsd: round(Number(facts.spend?.total ?? 0)), testCostUsd: round(Number(facts.spend?.test ?? 0)), includesTest: args.includeTest },
      available: true,
    };
  } catch (error) {
    if (!isMissing(error)) throw error;
    return {
      total: tallyAgentPeople([]), bySource: agentFunnelBySource([], turnedOn),
      today: { day, costUsd: 0, costCapUsd: settings.dailyCostUsd, mailCap: settings.dailyMailCap, mailsSent: 0, bySource: {} },
      period: { days, costUsd: 0, testCostUsd: 0, includesTest: args.includeTest },
      available: false,
    };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 사람 · 타임라인

export async function listAgentPeople(args: {
  status?: AgentStatus | null; source?: AgentSource | null; q?: string | null; limit: number; offset: number;
  includeTest: boolean;
  /** Role로 찾기: the people found for one Role. */
  roleId?: string | null;
}): Promise<{ people: AgentPerson[]; total: number }> {
  const limit = Math.min(Math.max(args.limit, 1), 200);
  const offset = Math.max(args.offset, 0);
  const q = args.q?.trim().slice(0, 200) || null;
  try {
    return await gtmRead(async (sql) => {
      const where = sql`
        where (${args.includeTest} or not p.is_test)
          ${args.status ? sql`and p.status = ${args.status}` : sql``}
          ${args.source ? sql`and p.source = ${args.source}` : sql``}
          ${args.roleId ? sql`and p.role_id = ${args.roleId}::uuid` : sql``}
          ${q ? sql`and concat_ws(' ', p.name, p.headline, p.email, p.profile_url, p.current_company, p.signal_text) ilike ${`%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`}` : sql``}
      `;
      const rows = await sql`select p.* from public.gtm_agent_people p ${where} order by p.updated_at desc limit ${limit}::int offset ${offset}::int`;
      const [count] = await sql<Array<{ n: number }>>`select count(*)::int as n from public.gtm_agent_people p ${where}`;
      return { people: rows.map((row) => mapAgentPerson(row as never)), total: Number(count?.n ?? 0) };
    });
  } catch (error) {
    if (isMissing(error)) return { people: [], total: 0 };
    throw error;
  }
}

/** A mail the person got, as the timeline shows it. */
export type AgentMailFacts = {
  id: string; kind: "first" | "followup"; subject: string; textBody: string; toEmail: string; fromEmail: string;
  status: string; deliveryStatus: string | null; sentAt: string; firstOpenedAt: string | null; openCount: number;
  unsubscribedAt: string | null; claimedAt: string | null;
};

type MailSqlRow = {
  id: string; subject: string; text_body: string; to_email: string; from_email: string; status: string;
  delivery_status: string | null; created_at: string | Date; first_opened_at: string | Date | null;
  open_count: number | null; unsubscribed_at: string | Date | null; claimed_at: string | Date | null;
};

export async function readAgentTimeline(id: string): Promise<{ person: AgentPerson; mails: AgentMailFacts[] } | null> {
  if (!UUID.test(id)) return null;
  const person = await readAgentPerson(id);
  if (!person) return null;
  const ids = [person.mailId, person.followupMailId].filter((value): value is string => Boolean(value));
  const rows = ids.length ? await gtmRead((sql) => sql<MailSqlRow[]>`
    select id::text as id, subject, text_body, to_email, from_email, status, delivery_status, created_at,
      first_opened_at, open_count, unsubscribed_at, claimed_at
    from public.gtm_mails where id = any(${ids}::uuid[])
  `) : [];
  const mails = rows.map((row): AgentMailFacts => ({
    id: row.id, kind: row.id === person.followupMailId ? "followup" : "first", subject: row.subject,
    textBody: row.text_body, toEmail: row.to_email, fromEmail: row.from_email, status: row.status,
    deliveryStatus: row.delivery_status, sentAt: iso(row.created_at) ?? "", firstOpenedAt: iso(row.first_opened_at),
    openCount: Number(row.open_count ?? 0), unsubscribedAt: iso(row.unsubscribed_at), claimedAt: iso(row.claimed_at),
  })).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "first" ? -1 : 1));
  return { person, mails };
}

// ---------------------------------------------------------------------------------------------------------------
// Ops actions on a person

export class AgentActionError extends Error {}

const moved = () => new AgentActionError("이미 다른 상태로 바뀌었어요. 새로고침해 주세요.");

/** 건너뛰기: not contacted (any step before sending). */
export async function skipPerson(args: { id: string; userId: string; reason: string }) {
  const person = await updateAgentPerson(args.id, {
    status: "skipped", skipReason: args.reason.trim().slice(0, 500) || "건너뜀", followupDueAt: null,
  }, { kind: "skipped", by: args.userId, note: args.reason.trim().slice(0, 500) || null },
  ["found", "matched", "drafted", "approved"]);
  if (!person) throw moved();
  return person;
}

/**
 * 답장 옴: the person replied (pasted here; LinkedIn replies never reach Harper). No follow-up after a reply.
 * `stop`: the reply asks not to be contacted again: the address goes on the shared opt-out list (as the mail's own
 * opt-out link does) and the person's #5 cycle ends.
 */
export async function markReplied(args: { id: string; userId: string; text: string; stop: boolean }) {
  const current = await readAgentPerson(args.id);
  if (!current) throw new AgentActionError("사람을 찾지 못했어요.");
  const now = new Date().toISOString();
  const person = await updateAgentPerson(args.id, {
    status: "replied", replyText: args.text.trim().slice(0, 8_000) || null, repliedAt: now, followupDueAt: null,
    ...(args.stop ? { endedAt: now } : {}),
  }, { kind: "replied", by: args.userId, note: args.text.trim().slice(0, 300) || null }, ["sent"]);
  if (!person) throw moved();
  if (!args.stop) return person;
  await suppressPerson(person);
  return (await updateAgentPerson(person.id, {}, { kind: "unsubscribed", by: args.userId, note: "답장으로 연락 그만 요청" })) ?? person;
}

/** The person's address on the shared opt-out list: through the mail's own opt-out (also marks the mail). */
async function suppressPerson(person: AgentPerson) {
  if (person.mailId) {
    const result = await unsubscribeGtmMail({ mailId: person.mailId, token: gtmUnsubscribeToken(person.mailId) });
    if (result.ok) return;
  }
  const email = cleanEmail(person.email);
  if (!email) return;
  const { error } = await getSupabaseAdmin().from("external_contact_suppressions")
    .upsert({ email_hash: externalEmailHash(email), reason: "unsubscribed", external_intro_request_id: null },
      { onConflict: "email_hash", ignoreDuplicates: true });
  if (error) throw error;
}

// ---------------------------------------------------------------------------------------------------------------
// Settings and runs

/** 긴급 중지: the agent off, and every queued or running run stopped (a running tick's lease no longer matches). */
export async function stopAgent(args: { userId: string }): Promise<{ settings: AgentSettings; stoppedRuns: number }> {
  const current = await readAgentSettings();
  const { updatedAt: _updatedAt, ...rest } = current;
  void _updatedAt;
  const settings = await saveAgentSettings({ ...rest, enabled: false }, args.userId);
  const stopped = await gtmWrite((sql) => sql`
    update public.gtm_agent_runs set status = 'stopped', lease_token = null, lease_expires_at = null,
      finished_at = now(), error = coalesce(error, 'Ops 긴급 중지')
    where status in ('queued', 'running')
    returning id
  `);
  return { settings, stoppedRuns: stopped.length };
}

/** 지금 실행: one manual run for today (the dispatcher picks it up on its next tick). */
export async function startManualRun(args: { userId: string; isTest: boolean }): Promise<AgentRun> {
  return createAgentRun({ kind: "manual", runDate: kstClock(new Date()).day, isTest: args.isTest, createdBy: args.userId });
}

/** The latest runs, newest first. */
export async function listAgentRuns(limit = 10): Promise<AgentRun[]> {
  try {
    const rows = await gtmRead((sql) => sql<RunRow[]>`
      select * from public.gtm_agent_runs order by created_at desc limit ${Math.min(Math.max(limit, 1), 50)}::int
    `);
    return rows.map(mapRun);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}
