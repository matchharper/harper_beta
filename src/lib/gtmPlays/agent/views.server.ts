import "server-only";

import { gtmRead, gtmWrite, type GtmReadSql } from "../db.server";
import { REACTED_STAGES } from "../outreachFunnel";
import {
  agentFunnelBySource, excludeBucket, inFunnelColumn, tallyAgentPeople, type AgentExcludeBucket, type AgentFunnelNumbers,
  type AgentFunnelRow,
} from "./funnel";
import { agentDailyRows, runCountsForConfig, runSearchCostUsd, type AgentDayRow } from "./daily";
import type { ConversationMessage } from "./conversation";
import type { AgentMailKind } from "./conversationView";
import { readConversationMessages, withConversationFacts } from "./conversationViews.server";
import { agentSenderProblem } from "./mailRules";
import { kstClock } from "./people";
import type { GmailSpam } from "./postmaster";
import { readGmailSpam } from "./postmaster.server";
import { resolveAgentPeriod, type AgentPeriod, type AgentPeriodInput } from "./period";
import type { ReplyReadingTrouble } from "./replies";
import { withVerdict, type PostingRef } from "./review";
import { gtmSignupsCte } from "./signups.server";
import type { AgentSpendStep } from "./spend";
import { optOutAgentAddress, readReplyReadingTroubles } from "./replies.server";
import {
  afterMatches, contactOutcome, inStage, type AgentReached, type AgentStage, type ContactOutcome, type LogAfterFilter,
} from "./stage";
import {
  agentCostToday, AgentSettingsStaleError, createAgentRun, mapAgentPerson, mapRun, readAgentPerson, readAgentSettings,
  resumeAgentRuns, saveAgentSettings, setAgentEnabled, updateAgentPerson, type AgentRun, type RunRow,
} from "./store.server";
import type {
  AgentChannel, AgentExcludeReason, AgentPerson, AgentPosting, AgentSettings, AgentSource, AgentStatus,
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
  person_id: string; run_id: string | null; updated_at: string | Date; event_kinds: string[] | null; source: AgentSource; status: AgentStatus; exclude_reason: AgentExcludeReason | null; channel: AgentChannel | null;
  found_day: string; lookup_tried: boolean | null; lookup_found: boolean | null; sent_at: string | Date | null; signal_at: string | Date | null; replied_at: string | Date | null; cost_usd: string | number;
  clicked_at: string | Date | null; signed_up_at: string | Date | null; interested: boolean; connected: boolean;
  delivery_status: string | null; unsubscribed: boolean | null;
  method: string | null; has_fit: boolean | null;
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
   * The period (KST days, both ends in; agent/period.ts) and what the agent spent in it (the spend log, by the day the
   * money was spent: searching, email lookups, matching, writing), as the daily cap counts it. Test runs' spend is in
   * it and also given apart (the money is real either way).
   */
  period: AgentPeriod & { costUsd: number; testCostUsd: number; includesTest: boolean };
  /** false: the #5 tables are not there yet (before 20261117140000_gtm_agent). */
  available: boolean;
  /** Gmail's spam rate for the sender's domain (Postmaster Tools), shown under 합계's spam count; null: no sender. */
  gmailSpam: GmailSpam | null;
};

/**
 * The people the numbers count: found on the period's KST days, both ends in (test people only when asked). The log
 * uses it too, so a number and its log are the same people.
 */
function funnelPeriod(sql: GtmReadSql, period: Pick<AgentPeriod, "from" | "to">, includeTest: boolean): ReturnType<GtmReadSql> {
  return sql`(p.created_at at time zone 'Asia/Seoul')::date between ${period.from}::date and ${period.to}::date
    and (${includeTest} or not p.is_test)` as unknown as ReturnType<GtmReadSql>;
}

/**
 * The funnel facts of the person rows `where` picks (agent/funnel.ts): the proposed postings' Roles count for 관심·지원
 * and 회사 연결 (a mail may carry 2-3 postings).
 */
export type AgentFunnelFact = AgentFunnelRow & {
  personId: string; runId: string | null; updatedAt: string; eventKinds: string[];
  /** The KST day the person was found (YYYY-MM-DD): 하루별 성능's row. */
  foundDay: string;
  /** A paid email lookup was tried for them, and it gave the address used. */
  lookupTried: boolean; lookupFound: boolean;
  /** How they were found (types.ts AgentMethod), and whether they had a fitting posting (matched, not no_fit). */
  method: string | null; hasFit: boolean;
};

export async function agentFunnelRows(sql: GtmReadSql, where: ReturnType<GtmReadSql>): Promise<AgentFunnelFact[]> {
  const rows = await sql<FunnelSqlRow[]>`
    with gtm_signups as materialized ${gtmSignupsCte(sql)}
    select p.id::text as person_id, p.run_id::text as run_id, p.updated_at,
      to_char((p.created_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as found_day,
      (p.email_lookup is not null) as lookup_tried, (p.email_source = 'lookup') as lookup_found,
      p.method, (jsonb_typeof(p.postings) = 'array' and jsonb_array_length(p.postings) >= 1 and p.status <> 'no_fit') as has_fit,
      (select coalesce(array_agg(distinct r.value->>'kind'), '{}') from jsonb_array_elements(
        case when jsonb_typeof(p.events) = 'array' then p.events else '[]'::jsonb end) r(value)) as event_kinds, p.source, p.status, p.exclude_reason, p.channel, p.sent_at, p.signal_at, p.replied_at,
      -- What this person cost (email lookup, posting pick, writing, follow-up) from the spend log, the one ledger the
      -- daily cap, 수치 and 하루별 성능 all read; the searches that found them are counted per source and per day apart.
      (select coalesce(sum(s.usd), 0) from public.gtm_agent_spend s where s.person_id = p.id and s.step <> 'search') as cost_usd,
      coalesce(m.first_opened_at, mf.first_opened_at) as clicked_at,
      -- 반송/스팸신고/수신거부: a permanent delivery failure of either mail, and an opt-out by link or by reply.
      coalesce(m.delivery_status, mf.delivery_status) as delivery_status,
      (m.unsubscribed_at is not null or mf.unsubscribed_at is not null
        or (jsonb_typeof(p.events) = 'array' and p.events @> '[{"kind": "unsubscribed"}]'::jsonb)) as unsubscribed,
      -- 가입 = the account made from the mail's link (gtm_signups), or the mail's claim for someone who already had one.
      least(m.claimed_at, mf.claimed_at,
        (select min(s.at) from gtm_signups s where s.mail_id in (m.id::text, mf.id::text))) as signed_up_at,
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
  return withConversationFacts(sql, rows.map((row) => ({
    personId: row.person_id, runId: row.run_id, updatedAt: iso(row.updated_at) ?? "", foundDay: row.found_day,
    lookupTried: Boolean(row.lookup_tried), lookupFound: Boolean(row.lookup_found), eventKinds: row.event_kinds ?? [], source: row.source, status: row.status, excludeReason: row.exclude_reason, channel: row.channel,
    sentAt: iso(row.sent_at), signalAt: iso(row.signal_at), clickedAt: iso(row.clicked_at), signedUpAt: iso(row.signed_up_at),
    repliedAt: iso(row.replied_at), interested: Boolean(row.interested), connected: Boolean(row.connected),
    deliveryStatus: row.delivery_status ?? null, unsubscribed: Boolean(row.unsubscribed),
    costUsd: Number(row.cost_usd), method: row.method ?? null, hasFit: Boolean(row.has_fit),
  })));
}

/**
 * Per source and in total, the people found in the last `days` and what came of them (agent/funnel.ts). The
 * proposed postings' Roles count for 관심·지원 and 회사 연결 (a mail may carry 2-3 postings). Test rows are left out
 * unless asked for.
 */
export async function agentFunnel(args: AgentPeriodInput & { includeTest: boolean }): Promise<AgentFunnel> {
  const settings = await readAgentSettings();
  const day = kstClock(new Date()).day;
  const period = resolveAgentPeriod(args, day);
  const turnedOn = Object.entries(settings.signals.sources).filter(([, setting]) => setting.enabled).map(([source]) => source);
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  // Read beside the numbers (never throws, at most a few seconds, kept an hour).
  const gmailSpam = readGmailSpam(settings.senderEmail);
  try {
    const facts = await gtmRead(async (sql) => {
      const rows = await agentFunnelRows(sql, funnelPeriod(sql, period, args.includeTest));
      const costUsd = await agentCostToday(sql, day);
      const [spend] = await sql<Array<{ total: string | number; test: string | number }>>`
        -- Money spent is all of it (test runs too), from the same spend log, by the day it was spent, as today's cost
        -- against the cap counts it (agent/spend.ts).
        select coalesce(sum(usd), 0) as total,
          coalesce(sum(usd) filter (where is_test), 0) as test
        from public.gtm_agent_spend
        where spent_day between ${period.from}::date and ${period.to}::date
      `;
      // Each source's search spend (counts.signal_cost_<source>), which no one person carries: in the period and today.
      const search = await sql<Array<{ source: string; period: string | number; today: string | number }>>`
        select substring(c.key from 'signal_cost_(.*)') as source,
          coalesce(sum(c.value::numeric), 0) as period,
          coalesce(sum(c.value::numeric) filter (where r.run_date = ${day}::date), 0) as today
        from public.gtm_agent_runs r cross join lateral jsonb_each_text(r.counts) c(key, value)
        where r.run_date between ${period.from}::date and ${period.to}::date and c.key like 'signal_cost_%'
          and c.value ~ '^[0-9.]+$' and (${args.includeTest} or not r.is_test)
        group by 1
      `;
      const todayBySource = await sql<Array<{ source: string; mails: number; cost: string | number }>>`
        select p.source,
          count(m.id) filter (where m.status in ('sending', 'sent') and (m.created_at at time zone 'Asia/Seoul')::date = ${day}::date)::int as mails,
          coalesce(sum(p.cost_usd) filter (where (p.created_at at time zone 'Asia/Seoul')::date = ${day}::date), 0) as cost
        from public.gtm_agent_people p
        left join public.gtm_mails m on m.agent_person_id = p.id and m.campaign = 'agent' and m.audience = 'candidate'
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
      period: { ...period, costUsd: round(Number(facts.spend?.total ?? 0)), testCostUsd: round(Number(facts.spend?.test ?? 0)), includesTest: args.includeTest },
      available: true,
      gmailSpam: await gmailSpam,
    };
  } catch (error) {
    if (!isMissing(error)) throw error;
    return {
      total: tallyAgentPeople([]), bySource: agentFunnelBySource([], turnedOn),
      today: { day, costUsd: 0, costCapUsd: settings.dailyCostUsd, mailCap: settings.dailyMailCap, mailsSent: 0, bySource: {} },
      period: { ...period, costUsd: 0, testCostUsd: 0, includesTest: args.includeTest },
      available: false,
      gmailSpam: await gmailSpam,
    };
  }
}

/**
 * 하루별 성능 (agent/daily.ts): the period's people by the KST day they were found, with 수치's columns, the day's cost
 * by step, what the day's runs did and 추천 품질. With `source`, only the people found there and that site's searches.
 * With `configId` (a 설정 묶음, agent/config.ts), only the people found or uploaded with it (and what they cost), and
 * only the searches that ran with it, so two 설정 묶음 can be compared; the days a 설정 묶음 was first used are marked.
 */
export async function agentDaily(args: AgentPeriodInput & { includeTest: boolean; source?: string | null; configId?: string | null }): Promise<{
  period: AgentPeriod; source: string | null; configId: string | null; total: AgentDayRow; days: AgentDayRow[]; available: boolean;
}> {
  const period = resolveAgentPeriod(args, kstClock(new Date()).day);
  const source = args.source ?? null;
  const configId = args.configId ?? null;
  try {
    const facts = await gtmRead(async (sql) => {
      const where = sql`${funnelPeriod(sql, period, args.includeTest)} ${source ? sql`and p.source = ${source}` : sql``}
        ${configId ? sql`and p.config_id = ${configId}` : sql``}` as unknown as ReturnType<GtmReadSql>;
      const people = await agentFunnelRows(sql, where);
      const spend = await sql<Array<{ day: string; step: AgentSpendStep; usd: string | number }>>`
        select to_char((p.created_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as day, s.step, sum(s.usd) as usd
        from public.gtm_agent_spend s join public.gtm_agent_people p on p.id = s.person_id
        where ${where} and s.step <> 'search'
        group by 1, 2
      `;
      // The searches by the run's day (counts.signal_cost_<source>), as 수치 counts them; files by the upload's day.
      const runs = await sql<Array<{
        day: string; kind: string; counts: Record<string, unknown> | null; search_cost: string | number;
        config_ids: string[] | null; search_configs: Record<string, string | null> | null;
      }>>`
        select to_char(r.run_date, 'YYYY-MM-DD') as day, r.kind, r.counts, r.config_ids,
          (select coalesce(sum(c.value::numeric), 0) from jsonb_each_text(r.counts) c(key, value)
            where c.key like 'signal_cost_%' and c.value ~ '^[0-9.]+$'
              and (${source}::text is null or c.key = 'signal_cost_' || ${source}::text)) as search_cost,
          -- Each search's own 설정 묶음 (signal_log.<source>.configId).
          (select jsonb_object_agg(e.key, e.value ->> 'configId') from jsonb_each(
            case when jsonb_typeof(r.signal_log) = 'object' then r.signal_log else '{}'::jsonb end) e
            where jsonb_typeof(e.value) = 'object' and e.key not in ('demand', 'upload', 'budget')) as search_configs
        from public.gtm_agent_runs r
        where r.run_date between ${period.from}::date and ${period.to}::date and (${args.includeTest} or not r.is_test)
      `;
      // 검색 수율 by the run's day, like the run's own counts: the people its searches found and those with an address.
      const searchPeople = await sql<Array<{ day: string; found: number; contactable: number }>>`
        select to_char(r.run_date, 'YYYY-MM-DD') as day,
          count(*)::int as found, count(*) filter (where p.email is not null)::int as contactable
        from public.gtm_agent_people p join public.gtm_agent_runs r on r.id = p.run_id
        where r.run_date between ${period.from}::date and ${period.to}::date and p.method <> 'applicant'
          and (${args.includeTest} or not p.is_test) ${source ? sql`and p.source = ${source}` : sql``}
          ${configId ? sql`and p.config_id = ${configId}` : sql``}
        group by 1
      `;
      // 추천 품질: the mailed people's postings (as the mail proposed them), with the matcher's score, the grader's
      // read and Ops's call on each.
      const mailed = await sql<Array<{ person_id: string; postings: AgentPosting[] | null }>>`
        select p.id::text as person_id, p.postings from public.gtm_agent_people p where ${where} and p.sent_at is not null
      `;
      const postingsOf = new Map(mailed.map((row) => [row.person_id, Array.isArray(row.postings) ? row.postings : []]));
      const configStarts = await sql<Array<{ day: string; id: string }>>`
        select to_char((first_used_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as day, id from public.gtm_agent_configs
        where (first_used_at at time zone 'Asia/Seoul')::date between ${period.from}::date and ${period.to}::date
      `;
      return { people: people.map((row) => ({ ...row, postings: postingsOf.get(row.personId) ?? [] })), spend, runs, searchPeople, configStarts };
    });
    const rows = agentDailyRows({
      from: period.from, to: period.to, people: facts.people,
      spend: facts.spend.map((row) => ({ day: row.day, step: row.step, usd: Number(row.usd) })),
      runs: facts.runs.flatMap((row) => {
        // With a source, only that site's search counts as "검색 N곳"; a file is the LinkedIn applicants'.
        const bySource = source ? Object.fromEntries(Object.entries(row.counts ?? {}).filter(([key]) => key.endsWith(`_${source}`))) : row.counts ?? {};
        if (!configId) return [{ day: row.day, kind: row.kind, searchCostUsd: Number(row.search_cost), counts: bySource }];
        // With a 설정 묶음: only the searches that ran with it (and a file uploaded with it).
        const configs = { searchConfigs: row.search_configs ?? {}, configIds: row.config_ids ?? [] };
        if (row.kind === "import") return configs.configIds[0] === configId ? [{ day: row.day, kind: row.kind, searchCostUsd: 0, counts: {} }] : [];
        const counts = runCountsForConfig(bySource, configs, configId);
        return [{ day: row.day, kind: row.kind, searchCostUsd: runSearchCostUsd(counts), counts }];
      }).filter((row) => !source || row.kind !== "import" || source === "linkedin"),
      searchPeople: facts.searchPeople.map((row) => ({ day: row.day, found: Number(row.found), contactable: Number(row.contactable) })),
      configStarts: facts.configStarts,
    });
    return { period, source, configId, ...rows, available: true };
  } catch (error) {
    if (!isMissing(error)) throw error;
    return { period, source, configId, ...agentDailyRows({ from: period.from, to: period.to, people: [], spend: [], runs: [] }), available: false };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 사람 · 타임라인

/** What the mailed people among `ids` did with the mail (클릭 · 가입 · 관심·지원 · 회사 연결), as the numbers count it. */
export async function agentReachedByPerson(sql: GtmReadSql, ids: readonly string[]): Promise<Map<string, AgentReached>> {
  if (!ids.length) return new Map();
  const rows = await agentFunnelRows(sql, sql`p.id = any(${[...ids]}::uuid[]) and p.sent_at is not null`);
  return new Map(rows.map((row) => [row.personId, {
    clicked: Boolean(row.clickedAt || row.signedUpAt), signedUp: Boolean(row.signedUpAt), interested: row.interested, connected: row.connected,
  }]));
}

/** One line of the 사람 log: the person, how far they got, when (the shown stage's time) and their first mail. */
export type AgentPeopleLogLine = {
  person: AgentPerson;
  reached: AgentReached | null;
  outcome: ContactOutcome | null;
  at: string;
  mail: { subject: string | null; body: string | null } | null;
};

/**
 * 로그 · 사람: the people of the numbers' period, one line each, filtered with the numbers' own predicates (stage.ts,
 * funnel.ts), so a number and its log are the same people. Also by source, the 제외 reason (the 제외 number's hover
 * words), the search or upload that found them (runId, with source for a search) and free text. Newest shown stage first.
 */
export async function listAgentPeopleLog(args: AgentPeriodInput & {
  includeTest: boolean; source?: string | null; stage?: AgentStage | null; after?: LogAfterFilter | null;
  /** Only the 제외 people of this reason (funnel.ts excludeBucket, as the 제외 number counts them by reason). */
  reason?: AgentExcludeBucket | null;
  runId?: string | null; q?: string | null; limit: number; offset: number;
  /** Only the people found or uploaded with this 설정 묶음 (a 하루별 성능 number under its filter). */
  configId?: string | null;
  /**
   * With runId, one search of that run: the people carry the search's tuning version (it includes the site, so it tells
   * the open-web search's people, whose source is the page's own site, from the site searches').
   */
  tuningVersion?: string | null;
}): Promise<{ lines: AgentPeopleLogLine[]; total: number }> {
  const period = resolveAgentPeriod(args, kstClock(new Date()).day);
  const limit = Math.min(Math.max(args.limit, 1), 200);
  const offset = Math.max(args.offset, 0);
  const q = args.q?.trim().slice(0, 200) || null;
  try {
    return await gtmRead(async (sql) => {
      const facts = await agentFunnelRows(sql, sql`${funnelPeriod(sql, period, args.includeTest)}
        ${args.source ? sql`and p.source = ${args.source}` : sql``}
        ${args.runId ? sql`and p.run_id = ${args.runId}::uuid` : sql``}
        ${args.runId && args.tuningVersion ? sql`and p.tuning_version = ${args.tuningVersion}` : sql``}
        ${args.configId ? sql`and p.config_id = ${args.configId}` : sql``}
        ${q ? sql`and concat_ws(' ', p.name, p.headline, p.email, p.profile_url, p.current_company, p.signal_text) ilike ${`%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`}` : sql``}`);
      const shownAt = (row: AgentFunnelFact) => (row.sentAt ? (row.repliedAt ?? row.sentAt) : row.updatedAt);
      const kept = facts
        .filter((row) => (!args.stage || inStage(args.stage, row)) && (!args.after || afterMatches(args.after, row))
          && (!args.reason || excludeBucket(row) === args.reason))
        .sort((a, b) => shownAt(b).localeCompare(shownAt(a)));
      const page = kept.slice(offset, offset + limit);
      if (!page.length) return { lines: [], total: kept.length };
      const ids = page.map((row) => row.personId);
      const people = await sql`select p.* from public.gtm_agent_people p where p.id = any(${ids}::uuid[])`;
      const mails = await sql<Array<{ person_id: string; subject: string | null; body: string | null }>>`
        select p.id::text as person_id, m.subject, left(m.text_body, 3000) as body
        from public.gtm_agent_people p join public.gtm_mails m on m.id = p.mail_id where p.id = any(${ids}::uuid[])
      `;
      const personById = new Map(people.map((row) => { const person = mapAgentPerson(row as never); return [person.id, person]; }));
      const mailById = new Map(mails.map((row) => [row.person_id, { subject: row.subject, body: row.body }]));
      const lines = page.flatMap((row): AgentPeopleLogLine[] => {
        const person = personById.get(row.personId);
        if (!person) return [];
        const reached = row.sentAt ? {
          clicked: inFunnelColumn("clicked", row), signedUp: inFunnelColumn("signedUp", row),
          interested: inFunnelColumn("interested", row), connected: inFunnelColumn("connected", row),
        } : null;
        return [{
          person, reached, at: shownAt(row), mail: mailById.get(row.personId) ?? null,
          outcome: row.sentAt ? contactOutcome({ status: row.status, eventKinds: row.eventKinds, reached }) : null,
        }];
      });
      return { lines, total: kept.length };
    });
  } catch (error) {
    if (isMissing(error)) return { lines: [], total: 0 };
    throw error;
  }
}

/** A mail to the person's address, as the 대화 shows it (their first and follow-up mails, any other mail to them). */
export type AgentMailFacts = {
  id: string; kind: AgentMailKind; subject: string; textBody: string; html: string | null; toEmail: string; fromEmail: string;
  status: string; deliveryStatus: string | null; sentAt: string; firstOpenedAt: string | null; openCount: number;
  unsubscribedAt: string | null;
  /** 가입: the account made from this mail's link, or the mail's claim (signups.server.ts). */
  signedUpAt: string | null;
};

type MailSqlRow = {
  id: string; subject: string; text_body: string; html: string | null; to_email: string; from_email: string; status: string;
  delivery_status: string | null; created_at: string | Date; first_opened_at: string | Date | null;
  open_count: number | null; unsubscribed_at: string | Date | null; signed_up_at: string | Date | null; audience: string | null;
};

/**
 * One person on the right: the person, and their 대화 (agent/conversationView.ts conversationEntries): every gtm_mails
 * mail to their address (and their own first and follow-up mails) and every conversation row of theirs.
 */
export async function readAgentTimeline(id: string): Promise<{
  person: AgentPerson & { reached: AgentReached | null }; mails: AgentMailFacts[]; messages: ConversationMessage[];
} | null> {
  if (!UUID.test(id)) return null;
  const person = await readAgentPerson(id);
  if (!person) return null;
  const ids = [person.mailId, person.followupMailId].filter((value): value is string => Boolean(value));
  const email = person.email?.trim().toLowerCase() || null;
  const { rows, messages } = await gtmRead(async (sql) => ({
    rows: ids.length || email ? await sql<MailSqlRow[]>`
      with gtm_signups as materialized ${gtmSignupsCte(sql)}
      select m.id::text as id, m.subject, m.text_body, m.html, m.to_email, m.from_email, m.status, m.delivery_status,
        m.created_at, m.first_opened_at, m.open_count, m.unsubscribed_at, m.audience,
        least(m.claimed_at, (select s.at from gtm_signups s where s.mail_id = m.id::text)) as signed_up_at
      from public.gtm_mails m where m.id = any(${ids}::uuid[]) ${email ? sql`or m.to_email = ${email}` : sql``}
      order by m.created_at limit 200
    ` : [],
    messages: await readConversationMessages(sql, { personId: person.id, email }),
  }));
  const mails = rows.map((row): AgentMailFacts => ({
    id: row.id, subject: row.subject,
    kind: row.id === person.followupMailId ? "followup" : row.id === person.mailId ? "first" : row.audience === "company" ? "company" : "mail",
    textBody: row.text_body, html: row.html, toEmail: row.to_email, fromEmail: row.from_email, status: row.status,
    deliveryStatus: row.delivery_status, sentAt: iso(row.created_at) ?? "", firstOpenedAt: iso(row.first_opened_at),
    openCount: Number(row.open_count ?? 0), unsubscribedAt: iso(row.unsubscribed_at), signedUpAt: iso(row.signed_up_at),
  }));
  const reached = person.sentAt ? (await gtmRead((sql) => agentReachedByPerson(sql, [person.id]))).get(person.id) ?? null : null;
  return { person: { ...person, reached }, mails, messages };
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
 * 답장 옴: the person replied (pasted here; LinkedIn replies never reach Harper). No follow-up after a reply. The reply
 * itself is in the 대화 (gtm_agent_messages); a note typed here stays on the timeline line.
 * `stop`: the reply asks not to be contacted again: the address goes on the shared opt-out list (as the mail's own
 * opt-out link does) and the person's #5 cycle ends.
 */
export async function markReplied(args: { id: string; userId: string; text: string; stop: boolean }) {
  const current = await readAgentPerson(args.id);
  if (!current) throw new AgentActionError("사람을 찾지 못했어요.");
  const now = new Date().toISOString();
  // A reply already recorded (by hand or found in a team mailbox) can still be a stop request: keep its text, add the
  // opt-out and end the person.
  if (current.status === "replied") {
    if (!args.stop) return current;
    await optOutAgentAddress(current.mailId, current.email);
    const ended = await updateAgentPerson(args.id, { endedAt: now }, { kind: "unsubscribed", by: args.userId, note: "답장으로 연락 그만 요청" }, ["replied"]);
    if (!ended) throw moved();
    return ended;
  }
  const person = await updateAgentPerson(args.id, {
    status: "replied", repliedAt: now, followupDueAt: null,
    ...(args.stop ? { endedAt: now } : {}),
  }, { kind: "replied", by: args.userId, note: args.text.trim().slice(0, 8_000) || null }, ["sent"]);
  if (!person) throw moved();
  if (!args.stop) return person;
  await optOutAgentAddress(person.mailId, person.email);
  return (await updateAgentPerson(person.id, {}, { kind: "unsubscribed", by: args.userId, note: "답장으로 연락 그만 요청" })) ?? person;
}

/**
 * 맞음 / 안 맞음 on one proposed posting (null clears it), by an Ops user (agent/review.ts). Only that posting changes:
 * a write that finds the list changed under it reads it again once. updated_at stays, so the person keeps their place
 * in the log.
 */
export async function setPostingVerdict(args: { id: string; ref: PostingRef; value: "right" | "wrong" | null; userId: string }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const person = await readAgentPerson(args.id);
    if (!person) throw new AgentActionError("사람을 찾지 못했어요.");
    const verdict = args.value ? { value: args.value, by: args.userId, at: new Date().toISOString() } : null;
    const postings = withVerdict(person.postings, args.ref, verdict);
    if (!postings) throw new AgentActionError("제안한 공고가 바뀌었어요. 새로고침해 주세요.");
    const [row] = await gtmWrite((sql) => sql`
      update public.gtm_agent_people set postings = ${sql.json(postings as never)}
      where id = ${args.id}::uuid and postings = ${sql.json(person.postings as never)}
      returning *
    `);
    if (row) return mapAgentPerson(row as never);
  }
  throw new AgentActionError("다른 곳에서 바뀌었어요. 새로고침해 주세요.");
}

// ---------------------------------------------------------------------------------------------------------------
// Settings and runs

export const SETTINGS_STALE_MESSAGE = "다른 곳에서 설정이 바뀌었어요. 새로고침 후 다시 저장해 주세요.";

/**
 * 설정 저장 from the settings form: everything but the on/off (only the switch changes it), and only when the stored
 * settings are still the version the form was loaded from. A save from an older screen is turned away
 * (SETTINGS_STALE_MESSAGE) rather than merged: the form sends every field, so a merge could not tell a field the
 * person changed from one they left as it was loaded, and would quietly undo the other change.
 */
export async function saveAgentSettingsFromForm(args: {
  settings: Omit<AgentSettings, "updatedAt" | "version" | "enabled">; loadedVersion: number | null; userId: string;
}): Promise<AgentSettings> {
  const current = await readAgentSettings();
  if (args.loadedVersion === null || args.loadedVersion !== current.version) throw new AgentActionError(SETTINGS_STALE_MESSAGE);
  if (current.enabled && agentSenderProblem(args.settings)) {
    throw new AgentActionError("켜져 있는 동안에는 보내는 사람 이름과 메일 주소를 비울 수 없어요. 먼저 끄고 저장해 주세요.");
  }
  try {
    return await saveAgentSettings(args.settings, args.userId, { expectedVersion: current.version });
  } catch (error) {
    if (error instanceof AgentSettingsStaleError) throw new AgentActionError(SETTINGS_STALE_MESSAGE);
    throw error;
  }
}

/** The switch on: the agent runs on its schedule (the dispatcher picks it up within minutes). Needs a sender. */
export async function enableAgent(args: { userId: string }): Promise<AgentSettings> {
  const current = await readAgentSettings();
  const problem = agentSenderProblem(current);
  if (problem) throw new AgentActionError(`켜려면 보내는 사람 이름과 메일 주소가 필요해요(${problem}).`);
  // Runs stopped by older code (or by hand) pick up where they left off.
  await resumeAgentRuns();
  return current.enabled ? current : setAgentEnabled(true, args.userId);
}

/**
 * Off: only the switch. Runs keep their place (no work is lost); a tick checks the switch before each mail and each
 * new person, so a running tick stops within one step, and turning on picks everything up again.
 */
export async function stopAgent(args: { userId: string }): Promise<{ settings: AgentSettings; stoppedRuns: number }> {
  // The on/off alone: saving every setting read a moment ago could undo a form save made in between.
  const settings = await setAgentEnabled(false, args.userId);
  return { settings, stoppedRuns: 0 };
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

// ---------------------------------------------------------------------------------------------------------------
// What Ops checks every day: the last applicant file and the last run's trouble.

export type AgentLastUpload = {
  at: string; fileName: string | null; rows: number | null; newPeople: number; alreadyKnown: number | null;
};

export type AgentHealth = {
  /** The latest uploaded applicant file (not a test), or null when none was ever uploaded. */
  lastUpload: AgentLastUpload | null;
  /** The latest run's error (its message, or how many errors its ticks had), or null. */
  lastRunError: string | null;
  /**
   * The team mailboxes whose replies are not being read (agent/replies.ts replyReadingTroubles), one each; empty when
   * all are read. While any is listed, follow-ups wait.
   */
  replyReading: ReplyReadingTrouble[];
};

/** Mailbox health for the screen; a failure to check is shown as a problem too (follow-ups wait then as well). */
async function replyReadingForScreen(): Promise<ReplyReadingTrouble[]> {
  try {
    return await readReplyReadingTroubles();
  } catch (error) {
    if (isMissing(error)) return [];
    const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
    return [{ mailbox: null, problem: `상태를 읽지 못했어요(${message.slice(0, 160)})`, lastReadAt: null }];
  }
}

export async function agentHealth(): Promise<AgentHealth> {
  const replyReading = await replyReadingForScreen();
  try {
    return await gtmRead(async (sql) => {
      const [upload] = await sql<Array<{ id: string; created_at: string | Date; upload: Record<string, unknown> | null; people: number }>>`
        select r.id::text as id, r.created_at, r.signal_log -> 'upload' as upload,
          (select count(*)::int from public.gtm_agent_people p where p.run_id = r.id) as people
        from public.gtm_agent_runs r where r.kind = 'import' and not r.is_test
        order by r.created_at desc limit 1
      `;
      const [last] = await sql<Array<{ error: string | null; errors: string | null }>>`
        select error, counts ->> 'errors' as errors from public.gtm_agent_runs where not is_test
        order by coalesce(last_leased_at, started_at, created_at) desc limit 1
      `;
      const number = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
      const info = upload?.upload ?? null;
      return {
        lastUpload: upload ? {
          at: typeof info?.at === "string" ? info.at : iso(upload.created_at) ?? "",
          fileName: typeof info?.fileName === "string" ? info.fileName : null,
          rows: info ? number(info.rows) : null,
          newPeople: info ? number(info.newPeople) : Number(upload.people),
          alreadyKnown: info ? number(info.alreadyKnown) : null,
        } : null,
        lastRunError: last?.error || (number(last?.errors) ? `오류 ${number(last?.errors)}번` : null),
        replyReading,
      };
    });
  } catch (error) {
    if (isMissing(error)) return { lastUpload: null, lastRunError: null, replyReading };
    throw error;
  }
}
