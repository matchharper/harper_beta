import "server-only";

import { gtmRead, gtmWrite, type GtmReadSql, type GtmWriteSql } from "../db.server";
import type {
  AgentChannel, AgentEmailLookup, AgentEvent, AgentEventKind, AgentExcludeReason, AgentMethod, AgentPerson,
  AgentPersonInput, AgentPosting, AgentSettings, AgentSource, AgentStatus,
} from "./types";
import { cleanSendWeekdays } from "./sendTiming";
import { cleanCompanyMailMinCandidates, cleanHandoffSlackUserId, replySettingsFromRow } from "./settingsFields";
import type { BudgetPlan } from "./budget";
import type { DemandSummary } from "./demand";
import { personMemoryKeys, urlFingerprint, type SearchOutcomeRow, type SignalLogEntry } from "./signals";
import { normalizeSignalSettings } from "./tuning";
import { DEFAULT_AGENT_SETTINGS } from "./types";

/**
 * #5 storage (20261117140000_gtm_agent.sql): the settings row, runs and person rows. Every change to a person goes
 * through updateAgentPerson, which appends its timeline line in the same statement (events || line).
 */

type SettingsRow = {
  enabled: boolean; sender_name: string | null; sender_email: string | null; daily_mail_cap: number;
  daily_cost_usd: string | number; send_start_hour: number; send_end_hour: number;
  /** Missing before the column is there (the defaults then). */
  send_weekdays?: number[] | null;
  followup_days: number; quiet_days_after_end: number;
  signals: unknown; version: number | null; updated_at: string | Date | null;
  /** Missing before their migration (agent/settingsFields.ts gives the defaults then). */
  reply_agent_enabled?: boolean | null; handoff_slack_user_id?: string | null; company_mail_min_candidates?: number | null;
};

const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : null);

function mapSettings(row: SettingsRow | undefined): AgentSettings {
  if (!row) return DEFAULT_AGENT_SETTINGS;
  return {
    enabled: row.enabled,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    dailyMailCap: row.daily_mail_cap,
    dailyCostUsd: Number(row.daily_cost_usd),
    sendStartHour: row.send_start_hour,
    sendEndHour: row.send_end_hour,
    sendWeekdays: row.send_weekdays ? cleanSendWeekdays(row.send_weekdays) : DEFAULT_AGENT_SETTINGS.sendWeekdays,
    followupDays: row.followup_days,
    quietDaysAfterEnd: row.quiet_days_after_end,
    signals: normalizeSignalSettings(row.signals ?? {}).settings,
    ...replySettingsFromRow(row),
    version: Number(row.version ?? 1),
    updatedAt: iso(row.updated_at),
  };
}

const MISSING_TABLE = "42P01";

/** The settings; the defaults (agent off) before the migration is applied. */
export async function readAgentSettings(): Promise<AgentSettings> {
  try {
    const [row] = await gtmRead((sql) => sql<SettingsRow[]>`select * from public.gtm_agent_settings where id`);
    return mapSettings(row);
  } catch (error) {
    if ((error as { code?: string }).code === MISSING_TABLE) return DEFAULT_AGENT_SETTINGS;
    throw error;
  }
}

/** A save made from settings that were changed elsewhere after they were loaded (saveAgentSettings expectedVersion). */
export class AgentSettingsStaleError extends Error {
  constructor() {
    super("agent settings changed since they were loaded");
  }
}

/**
 * Saves the settings (validated by the caller) as the next version, returns what was stored. Without `enabled` the
 * on/off stays as it is (the settings form never changes it; setAgentEnabled does). With `expectedVersion`, only
 * when the stored settings are still that version (AgentSettingsStaleError otherwise).
 */
export async function saveAgentSettings(
  settings: Omit<AgentSettings, "updatedAt" | "version" | "enabled"> & { enabled?: boolean },
  userId: string,
  options: { expectedVersion?: number } = {},
): Promise<AgentSettings> {
  const expected = options.expectedVersion;
  const [row] = await gtmWrite((sql) => sql<SettingsRow[]>`
    update public.gtm_agent_settings set
      enabled = coalesce(${settings.enabled ?? null}::boolean, enabled),
      sender_name = ${settings.senderName}, sender_email = ${settings.senderEmail},
      daily_mail_cap = ${settings.dailyMailCap}, daily_cost_usd = ${settings.dailyCostUsd},
      send_start_hour = ${settings.sendStartHour}, send_end_hour = ${settings.sendEndHour},
      send_weekdays = ${cleanSendWeekdays(settings.sendWeekdays)}::int[],
      followup_days = ${settings.followupDays},
      quiet_days_after_end = ${settings.quietDaysAfterEnd},
      signals = ${sql.json(normalizeSignalSettings(settings.signals).settings as never)}, version = version + 1,
      reply_agent_enabled = ${settings.replyAgentEnabled}, handoff_slack_user_id = ${cleanHandoffSlackUserId(settings.handoffSlackUserId)},
      company_mail_min_candidates = ${cleanCompanyMailMinCandidates(settings.companyMailMinCandidates)},
      updated_by = ${userId}::uuid, updated_at = now()
    where id ${expected === undefined ? sql`` : sql`and version = ${expected}::int`}
    returning *
  `);
  if (!row && expected !== undefined) throw new AgentSettingsStaleError();
  return mapSettings(row);
}

/**
 * The on/off switch alone (the other settings and their version stay; the version is what the agent runs with).
 * Returns what is stored.
 */
export async function setAgentEnabled(enabled: boolean, userId: string): Promise<AgentSettings> {
  // Turning it on starts the automatic brake's count again (agent/tickRules.ts brakeReason): Ops looked into it.
  const [row] = await gtmWrite((sql) => sql<SettingsRow[]>`
    update public.gtm_agent_settings set enabled = ${enabled}, updated_by = ${userId}::uuid, updated_at = now(),
      brake_since = case when ${enabled}::boolean and not enabled then now() else brake_since end
    where id
    returning *
  `);
  return mapSettings(row);
}

/**
 * The automatic brake (agent/tickRules.ts brakeReason): turns the agent off with why, unless it was turned off or on
 * since (only an agent that is on is turned off). Returns whether it did.
 */
export async function brakeAgent(reason: string): Promise<boolean> {
  const rows = await gtmWrite((sql) => sql<Array<{ id: boolean }>>`
    update public.gtm_agent_settings set enabled = false, updated_at = now(), brake_reason = ${reason.slice(0, 500)},
      braked_at = now()
    where id and enabled
    returning id
  `);
  return rows.length > 0;
}

/**
 * The agent's mails of the last `days` days counted from when it was last turned on: sent (or sending), hard
 * bounces, spam complaints. Test rows never count.
 */
export async function agentDeliveryStats(days: number): Promise<{ sent: number; bounced: number; complained: number }> {
  const [row] = await gtmRead((sql) => sql<Array<{ sent: number; bounced: number; complained: number }>>`
    with since as (
      select greatest(now() - make_interval(days => ${days}::int), coalesce(brake_since, '-infinity'::timestamptz)) as at
      from public.gtm_agent_settings where id
    )
    select count(*) filter (where m.status in ('sending', 'sent'))::int as sent,
      count(*) filter (where m.delivery_status = 'bounced')::int as bounced,
      count(*) filter (where m.delivery_status = 'complained')::int as complained
    from public.gtm_mails m
    left join public.gtm_agent_people p on p.id = m.agent_person_id
    where m.campaign = 'agent' and m.created_at >= (select at from since) and not coalesce(p.is_test, false)
  `);
  return { sent: Number(row?.sent ?? 0), bounced: Number(row?.bounced ?? 0), complained: Number(row?.complained ?? 0) };
}

/**
 * One sender at a time (agent/tickRules.ts SEND_LEASE_MS): the lease's token, or null while another tick holds it.
 * A tick that never released it (killed) frees it when it runs out.
 */
export async function takeAgentSendLease(ms: number): Promise<string | null> {
  const [row] = await gtmWrite((sql) => sql<Array<{ token: string }>>`
    update public.gtm_agent_settings set send_lease_token = gen_random_uuid(),
      send_lease_until = now() + make_interval(secs => ${Math.round(ms / 1000)}::int)
    where id and (send_lease_until is null or send_lease_until < now())
    returning send_lease_token::text as token
  `);
  return row?.token ?? null;
}

export async function releaseAgentSendLease(token: string): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_settings set send_lease_token = null, send_lease_until = null
    where id and send_lease_token = ${token}::uuid
  `);
}

type PersonRow = {
  id: string; run_id: string | null; source: AgentSource; method: AgentMethod; settings_version: number | null;
  tuning_version: string | null; contact_url: string | null;
  /** Missing before the columns are there. */
  config_id?: string | null; mail_config_id?: string | null;
  signal_score?: number | null; match_score?: number | null; search_group?: string | null; search_query?: string | null;
  person_key: string; name: string | null;
  headline: string | null; location: string | null; current_company: string | null; profile_url: string | null;
  profile_text: string | null; signal_url: string | null; signal_text: string | null; signal_at: string | Date | null;
  status: AgentStatus; exclude_reason: AgentExcludeReason | null; postings: AgentPosting[] | null;
  message_kind: "posting" | "posting_post" | null; reason: string | null; channel: AgentChannel | null;
  email: string | null; email_source: "import" | "post" | "lookup" | null; email_lookup?: AgentEmailLookup | null;
  language: "ko" | "en" | null;
  draft_subject: string | null; draft_body: string | null; mail_id: string | null; followup_mail_id: string | null;
  sent_by: string | null; sent_at: string | Date | null; skip_reason: string | null;
  reply_text: string | null; replied_at: string | Date | null; followup_due_at: string | Date | null;
  ended_at: string | Date | null; cost_usd: string | number; is_test: boolean; events: AgentEvent[] | null;
  /** Missing before the columns are there. */
  attempts?: number | null; retry_at?: string | Date | null;
  created_at: string | Date; updated_at: string | Date;
};

export function mapAgentPerson(row: PersonRow): AgentPerson {
  return {
    id: row.id,
    runId: row.run_id,
    source: row.source,
    method: row.method,
    settingsVersion: row.settings_version ?? null,
    tuningVersion: row.tuning_version ?? null,
    configId: row.config_id ?? null,
    mailConfigId: row.mail_config_id ?? null,
    contactUrl: row.contact_url ?? null,
    signalScore: row.signal_score ?? null,
    matchScore: row.match_score ?? null,
    searchGroup: row.search_group ?? null,
    searchQuery: row.search_query ?? null,
    personKey: row.person_key,
    name: row.name,
    headline: row.headline,
    location: row.location,
    currentCompany: row.current_company,
    profileUrl: row.profile_url,
    profileText: row.profile_text,
    signalUrl: row.signal_url,
    signalText: row.signal_text,
    signalAt: iso(row.signal_at),
    status: row.status,
    excludeReason: row.exclude_reason,
    postings: row.postings ?? [],
    messageKind: row.message_kind,
    reason: row.reason,
    channel: row.channel,
    email: row.email,
    emailSource: row.email_source,
    emailLookup: row.email_lookup ?? null,
    language: row.language,
    draftSubject: row.draft_subject,
    draftBody: row.draft_body,
    mailId: row.mail_id,
    followupMailId: row.followup_mail_id,
    sentBy: row.sent_by,
    sentAt: iso(row.sent_at),
    skipReason: row.skip_reason,
    replyText: row.reply_text,
    repliedAt: iso(row.replied_at),
    followupDueAt: iso(row.followup_due_at),
    endedAt: iso(row.ended_at),
    costUsd: Number(row.cost_usd),
    attempts: Number(row.attempts ?? 0),
    retryAt: iso(row.retry_at),
    isTest: row.is_test,
    events: row.events ?? [],
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? "",
  };
}

export type NewAgentPerson = AgentPersonInput & {
  runId: string | null;
  source: AgentSource;
  method: AgentMethod;
  /** The settings version the run used (settings.version), and the source's search tuning version. */
  settingsVersion: number | null;
  tuningVersion?: string | null;
  /** The 설정 묶음 the person is found or uploaded with (agent/config.server.ts ensureAgentConfig). */
  configId: string | null;
  contactUrl?: string | null;
  /** What the search's judge said and which query found them (searches only). */
  signalScore?: number | null;
  matchScore?: number | null;
  searchGroup?: string | null;
  searchQuery?: string | null;
  personKey: string;
  email: string | null;
  emailSource: "import" | "post" | "lookup" | null;
  isTest: boolean;
  /** The first timeline line's note (what found them). */
  foundNote?: string | null;
};

/** Adds people as found (one timeline line each). */
export async function insertAgentPeople(people: readonly NewAgentPerson[], by: string): Promise<AgentPerson[]> {
  if (!people.length) return [];
  const now = new Date().toISOString();
  const rows = people.map((person) => ({
    run_id: person.runId, source: person.source, method: person.method, settings_version: person.settingsVersion,
    tuning_version: person.tuningVersion ?? null, config_id: person.configId, contact_url: person.contactUrl ?? null,
    signal_score: person.signalScore ?? null, match_score: person.matchScore ?? null,
    search_group: person.searchGroup?.slice(0, 120) ?? null, search_query: person.searchQuery?.slice(0, 300) ?? null,
    person_key: person.personKey, name: person.name,
    headline: person.headline, location: person.location, current_company: person.currentCompany,
    profile_url: person.profileUrl, profile_text: person.profileText, signal_url: person.signalUrl,
    signal_text: person.signalText, signal_at: person.signalAt, email: person.email, email_source: person.emailSource,
    is_test: person.isTest,
    events: [{ at: now, kind: "found", by, ...(person.foundNote ? { note: person.foundNote } : {}) }],
  }));
  const inserted = await gtmWrite((sql) => sql<PersonRow[]>`
    insert into public.gtm_agent_people ${sql(rows.map((row) => ({ ...row, events: sql.json(row.events) })) as never)}
    returning *
  `);
  return inserted.map(mapAgentPerson);
}

/** The columns a step may change (camelCase → column). */
export type AgentPersonPatch = Partial<{
  status: AgentStatus; excludeReason: AgentExcludeReason | null; postings: AgentPosting[];
  messageKind: "posting" | "posting_post" | null; reason: string | null; channel: AgentChannel | null;
  email: string | null; emailSource: "import" | "post" | "lookup" | null; emailLookup: AgentEmailLookup | null;
  language: "ko" | "en" | null;
  /** What the agent read about them (profile.ts): a 프로필 읽기 adds to it once. */
  profileText: string | null;
  draftSubject: string | null; draftBody: string | null; mailId: string | null; followupMailId: string | null;
  /** The 설정 묶음 the first mail was written with. */
  mailConfigId: string | null;
  sentBy: string | null; sentAt: string | null; skipReason: string | null;
  replyText: string | null; repliedAt: string | null; followupDueAt: string | null; endedAt: string | null;
  /** Tries of a step that failed for a passing reason, and when the next may run (agent/tickRules.ts). */
  attempts: number; retryAt: string | null;
  addCostUsd: number;
}>;

const COLUMNS: Record<Exclude<keyof AgentPersonPatch, "addCostUsd">, string> = {
  status: "status", excludeReason: "exclude_reason", postings: "postings", messageKind: "message_kind",
  reason: "reason", channel: "channel", email: "email", emailSource: "email_source", emailLookup: "email_lookup",
  language: "language", profileText: "profile_text",
  draftSubject: "draft_subject", draftBody: "draft_body", mailId: "mail_id", followupMailId: "followup_mail_id",
  mailConfigId: "mail_config_id", sentBy: "sent_by", sentAt: "sent_at", skipReason: "skip_reason",
  replyText: "reply_text", repliedAt: "replied_at", followupDueAt: "followup_due_at", endedAt: "ended_at",
  attempts: "attempts", retryAt: "retry_at",
};

/**
 * Changes a person and adds one timeline line, in one statement. `expect`: only when the row is still in one of
 * these statuses (a second click or a second worker finds it moved on and changes nothing; returns null).
 * `lookupRunId`: only while that email lookup is still running on the row (two ticks settling it record it once).
 */
export async function updateAgentPerson(
  id: string,
  patch: AgentPersonPatch,
  event: { kind: AgentEventKind; by: string; note?: string | null } | null,
  expect?: readonly AgentStatus[],
  guard?: { lookupRunId?: string | null },
): Promise<AgentPerson | null> {
  const values: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(COLUMNS) as Array<[Exclude<keyof AgentPersonPatch, "addCostUsd">, string]>) {
    if (patch[key] !== undefined) values[column] = patch[key];
  }
  const line = event ? [{ at: new Date().toISOString(), kind: event.kind, by: event.by, ...(event.note ? { note: event.note } : {}) }] : [];
  const [row] = await gtmWrite(async (sql) => {
    const sets = Object.entries(values).map(([column, value]) =>
      (column === "postings" || column === "email_lookup") && value !== null
        ? sql`${sql(column)} = ${sql.json(value as never)}`
        : sql`${sql(column)} = ${value as never}`);
    const assignments = [
      ...sets,
      sql`events = events || ${sql.json(line)}`,
      sql`cost_usd = cost_usd + ${patch.addCostUsd ?? 0}`,
      sql`updated_at = now()`,
    ].reduce((all, part, index) => (index ? sql`${all}, ${part}` : part));
    return sql<PersonRow[]>`
      update public.gtm_agent_people set ${assignments}
      where id = ${id}::uuid ${expect?.length ? sql`and status = any(${expect as string[]}::text[])` : sql``}
        ${guard?.lookupRunId ? sql`and email_lookup->>'state' = 'running' and email_lookup->>'runId' = ${guard.lookupRunId}` : sql``}
      returning *
    `;
  });
  return row ? mapAgentPerson(row) : null;
}

export async function readAgentPerson(id: string): Promise<AgentPerson | null> {
  const [row] = await gtmRead((sql) => sql<PersonRow[]>`select * from public.gtm_agent_people where id = ${id}::uuid`);
  return row ? mapAgentPerson(row) : null;
}

/**
 * People of one status (the run's next batch): the newest signal first (people act within days of posting; an
 * applicant's signal is when they applied), those without a date last, then the oldest row first.
 */
export async function listAgentPeopleByStatus(status: AgentStatus, limit: number, runId?: string | null): Promise<AgentPerson[]> {
  const rows = await gtmRead((sql) => sql<PersonRow[]>`
    select * from public.gtm_agent_people
    where status = ${status} ${runId ? sql`and run_id = ${runId}::uuid` : sql``}
    -- Applicants first, then the clearest job-seeking signals (a paid lookup goes to them first: 10 a day), newest.
    order by (method = 'applicant') desc, signal_score desc nulls last, signal_at desc nulls last, created_at limit ${limit}::int
  `);
  return rows.map(mapAgentPerson);
}

/**
 * The approved people waiting to go out, newest signal first (no signal last), then the one waiting longest: only
 * what deciding this tick's mails needs (agent/sendTiming.ts planSends); the chosen ones are read in full.
 */
export async function listAgentSendQueue(limit: number): Promise<Array<{ id: string; signalAt: string | null; updatedAt: string }>> {
  const rows = await gtmRead((sql) => sql<Array<{ id: string; signal_at: string | Date | null; updated_at: string | Date }>>`
    select id, signal_at, updated_at from public.gtm_agent_people
    where status = 'approved'
    order by signal_at desc nulls last, updated_at limit ${limit}::int
  `);
  return rows.map((row) => ({ id: row.id, signalAt: iso(row.signal_at), updatedAt: iso(row.updated_at) ?? "" }));
}

/**
 * Email lookups started and not ended yet, of any run, the longest running first: each tick looks at them whatever
 * run it works on (a lookup's estimate is in the spend log from its start, so nothing is kept aside here).
 */
export async function listRunningEmailLookups(limit: number): Promise<AgentPerson[]> {
  const rows = await gtmRead((sql) => sql<PersonRow[]>`
    select * from public.gtm_agent_people
    where status in ('found', 'matched') and email_lookup->>'state' = 'running'
    order by email_lookup->>'startedAt' nulls first, created_at limit ${limit}::int
  `);
  return rows.map(mapAgentPerson);
}

/**
 * The run's people a tick may move on: found, or matched (the mail not written yet), neither waiting on an email lookup
 * (a matched person's paid lookup runs across ticks) nor waiting for a retry; newest signal first as
 * listAgentPeopleByStatus.
 */
export async function listAgentPeopleToHandle(runId: string, limit: number): Promise<AgentPerson[]> {
  const rows = await gtmRead((sql) => sql<PersonRow[]>`
    select * from public.gtm_agent_people
    where run_id = ${runId}::uuid and status in ('found', 'matched')
      and (retry_at is null or retry_at <= now())
      and coalesce(email_lookup->>'state', '') <> 'running'
    order by signal_at desc nulls last, created_at limit ${limit}::int
  `);
  return rows.map(mapAgentPerson);
}

/** Written mails waiting to go out (test people left out: their mails do not count on the cap). */
export async function countAgentSendQueue(): Promise<number> {
  const [row] = await gtmRead((sql) => sql<Array<{ n: number }>>`
    select count(*)::int as n from public.gtm_agent_people where status = 'approved' and not is_test
  `);
  return Number(row?.n ?? 0);
}

/** The Ops user background mails are logged under (gtm_mails.sent_by): whoever last saved the settings. */
export async function readAgentSenderUser(): Promise<string | null> {
  const [row] = await gtmRead((sql) => sql<Array<{ updated_by: string | null }>>`select updated_by from public.gtm_agent_settings where id`);
  return row?.updated_by ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Runs

export type AgentRunKind = "daily" | "import" | "manual";
export type AgentRun = {
  id: string; runDate: string; kind: AgentRunKind; status: "queued" | "running" | "done" | "failed" | "stopped";
  counts: Record<string, number>; costUsd: number; error: string | null; isTest: boolean; createdAt: string;
  startedAt: string | null; finishedAt: string | null;
  /** The 설정 묶음 the run started with, and the ones its ticks ran with, in order (setAgentRunConfig). */
  configId: string | null; configIds: string[];
};

export type RunRow = {
  id: string; run_date: string | Date; kind: AgentRunKind; status: AgentRun["status"]; counts: Record<string, number> | null;
  cost_usd: string | number; error: string | null; is_test: boolean; created_at: string | Date;
  started_at: string | Date | null; finished_at: string | Date | null;
  /** Missing before the columns are there. */
  config_id?: string | null; config_ids?: string[] | null;
};

export const mapRun = (row: RunRow): AgentRun => ({
  id: row.id,
  runDate: typeof row.run_date === "string" ? row.run_date.slice(0, 10) : row.run_date.toISOString().slice(0, 10),
  kind: row.kind, status: row.status, counts: row.counts ?? {}, costUsd: Number(row.cost_usd), error: row.error,
  isTest: row.is_test, createdAt: iso(row.created_at) ?? "", startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
  configId: row.config_id ?? null, configIds: row.config_ids ?? [],
});

/** A new run; `configId`: the 설정 묶음 it starts with when it brings people at once (an upload). */
export async function createAgentRun(args: {
  kind: AgentRunKind; runDate: string; isTest: boolean; createdBy: string | null; configId?: string | null;
}): Promise<AgentRun> {
  const configId = args.configId ?? null;
  const [row] = await gtmWrite((sql) => sql<RunRow[]>`
    insert into public.gtm_agent_runs (run_date, kind, is_test, created_by, config_id, config_ids)
    values (${args.runDate}::date, ${args.kind}, ${args.isTest}, ${args.createdBy}::uuid, ${configId},
      ${configId ? [configId] : []}::text[])
    returning *
  `);
  return mapRun(row);
}

/**
 * The 설정 묶음 a tick runs the run with: the run's first stays its config_id, and config_ids gets it added whenever it
 * differs from the last tick's (settings saved in the middle of the run, an instruction or rule changed by a deploy),
 * so its last one is the one in use and a change back shows as one more. code_version is the deployed code the last
 * tick ran (agent/config.ts agentCodeVersion), kept apart from the 설정 묶음.
 */
export async function setAgentRunConfig(runId: string, configId: string, codeVersion: string): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_runs set config_id = coalesce(config_id, ${configId}),
      config_ids = case when config_ids[cardinality(config_ids)] is distinct from ${configId}
        then config_ids || ${configId}::text else config_ids end,
      code_version = ${codeVersion}
    where id = ${runId}::uuid
      and (config_ids[cardinality(config_ids)] is distinct from ${configId} or code_version is distinct from ${codeVersion})
  `);
}

/** The Korea-time day's run, made once (two dispatchers around midnight: the unique index keeps one). */
export async function ensureDailyAgentRun(day: string): Promise<void> {
  await gtmWrite((sql) => sql`
    insert into public.gtm_agent_runs (run_date, kind, is_test) values (${day}::date, 'daily', false)
    on conflict (run_date) where kind = 'daily' and not is_test do nothing
  `);
}

/**
 * Runs stopped by the old 긴급 중지 (off used to stop every run; now it only turns the agent off) go back to the queue,
 * so their people are handled and today's run carries on (a past day's run only finishes its people). Called when the
 * agent is turned on and by every tick. Returns how many came back.
 */
export async function resumeAgentRuns(): Promise<number> {
  const resumed = await gtmWrite((sql) => sql`
    update public.gtm_agent_runs set status = 'queued', finished_at = null, lease_token = null, lease_expires_at = null
    where status = 'stopped'
    returning id
  `);
  return resumed.length;
}

/** What the next tick on a run that was still leased (its tick never ended) writes on it (agent/tickRules.ts). */
export type LeasedAgentRun = { run: AgentRun; leaseToken: string; expiredLease: boolean };

/**
 * Takes the oldest queued or lease-expired running run for `leaseMs` (one dispatcher at a time works on a run).
 * Returns the run and its lease token, or null when there is nothing to do. A run taken over from an expired lease
 * (its last tick was killed or crashed) gets `killedNote` as its error and killed_ticks + 1, and says so.
 */
export async function leaseAgentRun(leaseMs: number, killedNote: string): Promise<LeasedAgentRun | null> {
  const [row] = await gtmWrite((sql) => sql<Array<RunRow & { lease_token: string; expired_lease: boolean }>>`
    with picked as (
      select id, status as was from public.gtm_agent_runs
      where status = 'queued' or (status = 'running' and lease_expires_at < now())
      -- Turns: the run taken longest ago (never taken first; among those, imports and manual runs, then the day's
      -- run). An upload whose people wait on email lookups so never holds back the day's search, and back.
      order by last_leased_at nulls first, (kind = 'daily'), created_at limit 1 for update skip locked
    )
    update public.gtm_agent_runs r set status = 'running', lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => ${Math.round(leaseMs / 1000)}::int),
      started_at = coalesce(r.started_at, now()), last_leased_at = now(),
      counts = case when picked.was = 'running'
        then r.counts || jsonb_build_object('killed_ticks', coalesce((r.counts ->> 'killed_ticks')::numeric, 0) + 1)
        else r.counts end,
      error = case when picked.was = 'running' then ${killedNote} else r.error end
    from picked
    where r.id = picked.id
    returning r.*, (picked.was = 'running') as expired_lease
  `);
  return row ? { run: mapRun(row), leaseToken: row.lease_token, expiredLease: Boolean(row.expired_lease) } : null;
}

/**
 * Adds numbers to a run's counts in the database (each key + its value), so writes in the middle of a tick and the
 * lease's end never overwrite each other.
 */
export async function addAgentRunCounts(runId: string, added: Record<string, number>): Promise<void> {
  if (!Object.keys(added).length) return;
  await gtmWrite((sql) => sql`
    update public.gtm_agent_runs set counts = counts || ${addedCounts(sql, added)} where id = ${runId}::uuid
  `);
}

/** counts || {key: counts[key] + value} for every key of `added` (to the millionth), as one jsonb expression. */
function addedCounts(sql: GtmWriteSql, added: Record<string, number>) {
  const clean = Object.fromEntries(Object.entries(added).filter(([, value]) => Number.isFinite(Number(value))).map(([key, value]) => [key, Number(value)]));
  return sql`coalesce((
    select jsonb_object_agg(a.key, trim_scale(round(coalesce((counts ->> a.key)::numeric, 0) + a.value::numeric, 6)))
    from jsonb_each_text(${sql.json(clean)}::jsonb) a
  ), '{}'::jsonb)`;
}

/**
 * Ends the lease: done / failed / stopped, or back to queued when more work is left for the next tick. `addCounts`
 * add to the run's counts. The run's error stays until a tick clears it (`clearError`: a tick without problems);
 * `error` replaces it.
 */
export async function releaseAgentRun(args: {
  id: string; leaseToken: string; status: "queued" | "done" | "failed" | "stopped"; addCounts?: Record<string, number>;
  addCostUsd?: number; error?: string | null; clearError?: boolean;
}): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_runs set status = ${args.status}, lease_token = null, lease_expires_at = null,
      counts = counts || ${addedCounts(sql, args.addCounts ?? {})}, cost_usd = cost_usd + ${args.addCostUsd ?? 0},
      error = case when ${args.clearError ?? false}::boolean then null else coalesce(${args.error ?? null}::text, error) end,
      finished_at = case when ${args.status} in ('done', 'failed', 'stopped') then now() else finished_at end
    where id = ${args.id}::uuid and lease_token = ${args.leaseToken}::uuid
  `);
}

/**
 * One source's entries in earlier runs' signal logs (gtm_agent_runs.signal_log[source]), newest search first, the
 * given run left out, with their run and every source the run searched. Raw jsonb: signals.ts readSignalLogEntry checks each one.
 */
export async function readSignalLogs(source: string, exceptRunId: string, limit: number): Promise<Array<{ runId: string; entry: unknown; sources: string[] }>> {
  const rows = await gtmRead((sql) => sql<Array<{ run_id: string; entry: unknown; sources: string[] | null }>>`
    select id::text as run_id, signal_log -> ${source}::text as entry,
      (select array_agg(key) from jsonb_object_keys(signal_log) key) as sources
    from public.gtm_agent_runs
    where signal_log -> ${source}::text is not null and id <> ${exceptRunId}::uuid
    order by signal_log -> ${source}::text ->> 'at' desc nulls last, created_at desc
    limit ${limit}::int
  `);
  return rows.map((row) => ({ runId: row.run_id, entry: row.entry, sources: row.sources ?? [] }));
}

/**
 * What became of the people the given runs' searches found (uploaded applicants left out), by run, the place they
 * were found and the query that found them (null before it was kept): how many, how many had a fitting
 * postings, how many fewer (no_fit), how many were mailed. signals.ts historyOutcomes reads them per search.
 */
export async function readSearchOutcomes(runIds: readonly string[]): Promise<SearchOutcomeRow[]> {
  if (!runIds.length) return [];
  const rows = await gtmRead((sql) => sql<Array<{
    run_id: string; source: string; search_query: string | null; people: number; fits: number; no_fit: number; sent: number;
  }>>`
    select run_id::text as run_id, source, search_query, count(*)::int as people,
      count(*) filter (where jsonb_typeof(postings) = 'array' and jsonb_array_length(postings) >= 1 and status <> 'no_fit')::int as fits,
      count(*) filter (where status = 'no_fit')::int as no_fit,
      count(*) filter (where sent_at is not null)::int as sent
    from public.gtm_agent_people
    where run_id = any(${[...runIds]}::uuid[]) and method <> 'applicant'
    group by 1, 2, 3
  `);
  return rows.map((row) => ({
    runId: row.run_id, source: row.source, query: row.search_query, people: row.people, fits: row.fits, noFit: row.no_fit, sent: row.sent,
  }));
}

/** The demand a run read (gtm_agent_runs.signal_log.demand, demand.ts DemandSummary), raw; null when none yet. */
export async function readRunDemand(runId: string): Promise<unknown> {
  const [row] = await gtmRead((sql) => sql<Array<{ demand: unknown }>>`
    select signal_log -> 'demand' as demand from public.gtm_agent_runs where id = ${runId}::uuid
  `);
  return row?.demand ?? null;
}

/** Keeps the demand a run read on it, for its later searches and /ops (one key of signal_log, the rest unchanged). */
export async function writeRunDemand(runId: string, demand: DemandSummary): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_runs set signal_log = signal_log || jsonb_build_object('demand', ${sql.json(demand as never)}::jsonb)
    where id = ${runId}::uuid
  `);
}

/** The day's search budget split a run keeps (gtm_agent_runs.signal_log.budget, budget.ts BudgetPlan), raw; null when none yet. */
export async function readRunBudget(runId: string): Promise<unknown> {
  const [row] = await gtmRead((sql) => sql<Array<{ budget: unknown }>>`
    select signal_log -> 'budget' as budget from public.gtm_agent_runs where id = ${runId}::uuid
  `);
  return row?.budget ?? null;
}

/** Keeps the day's search budget split on the run, for its later searches and the next days' plans. */
export async function writeRunBudget(runId: string, plan: BudgetPlan): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_runs set signal_log = signal_log || jsonb_build_object('budget', ${sql.json(plan as never)}::jsonb)
    where id = ${runId}::uuid
  `);
}

/** What an uploaded applicant file brought (the 검색 기록 line of its import run), kept on the run's log under "upload". */
export type AgentUploadSummary = { fileName: string; rows: number; newPeople: number; alreadyKnown: number; withEmail: number; at: string };

export async function writeRunUpload(runId: string, upload: AgentUploadSummary): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_runs set signal_log = signal_log || jsonb_build_object('upload', ${sql.json(upload as never)}::jsonb)
    where id = ${runId}::uuid
  `);
}

/**
 * Keeps one source's search log on the run (signal_log[source] = entry, with the 설정 묶음 the search ran with as
 * configId). A second search of the source in the same run (a retry after the time limit) replaces it, but the pages
 * judged by both stay listed (`judged`), so later runs skip them all.
 */
export async function writeSignalLog(runId: string, source: string, entry: SignalLogEntry, configId: string | null): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_runs set signal_log = signal_log || jsonb_build_object(${source}::text,
      ${sql.json(entry as never)}::jsonb || jsonb_build_object('configId', ${configId}::text) || jsonb_build_object('judged', (
        select coalesce(jsonb_agg(distinct print), '[]'::jsonb) from (
          select jsonb_array_elements_text(case when jsonb_typeof(signal_log -> ${source}::text -> 'judged') = 'array'
            then signal_log -> ${source}::text -> 'judged' else '[]'::jsonb end) as print
          union
          select jsonb_array_elements_text(${sql.json((entry.judged ?? []) as never)}::jsonb)
        ) prints
      )))
    where id = ${runId}::uuid
  `);
}

/**
 * What the search remembers from the last `days` days (signals.ts RECENT_MEMORY_DAYS): every key of the people found
 * (any run, any status), and the pages judged (fingerprints from the runs' signal logs, and the pages people were
 * found on). A search keeps neither again.
 */
export async function readSignalMemory(days: number): Promise<{ keys: Set<string>; urls: Set<string> }> {
  return gtmRead(async (sql) => {
    const people = await sql<Array<{ person_key: string; email: string | null; profile_url: string | null; contact_url: string | null; signal_url: string | null }>>`
      select person_key, email, profile_url, contact_url, signal_url from public.gtm_agent_people
      where created_at > now() - make_interval(days => ${days}::int)
    `;
    const judged = await sql<Array<{ print: string }>>`
      select distinct jsonb_array_elements_text(e.value -> 'judged') as print
      from public.gtm_agent_runs r
      cross join lateral jsonb_each(case when jsonb_typeof(r.signal_log) = 'object' then r.signal_log else '{}'::jsonb end) e
      where r.created_at > now() - make_interval(days => ${days}::int)
        and jsonb_typeof(e.value) = 'object' and jsonb_typeof(e.value -> 'judged') = 'array'
    `;
    const keys = new Set(people.flatMap((row) => personMemoryKeys({
      personKey: row.person_key, email: row.email, profileUrl: row.profile_url, contactUrl: row.contact_url,
    })));
    const urls = new Set([
      ...judged.map((row) => row.print),
      ...people.flatMap((row) => (row.signal_url ? [urlFingerprint(row.signal_url)] : [])),
    ]);
    return { keys, urls };
  });
}

/**
 * A Korea-time day's spend, from the spend log (agent/spend.ts): every paid step logs its cost the moment it is spent,
 * on that day, whatever run it belongs to. Test runs count too (the money is real). The daily cap and /ops #5 read it.
 */
export async function agentCostToday(sql: GtmReadSql, kstDay: string): Promise<number> {
  const [row] = await sql<Array<{ usd: string | number | null }>>`
    select coalesce(sum(usd), 0) as usd from public.gtm_agent_spend where spent_day = ${kstDay}::date
  `;
  return Number(row?.usd ?? 0);
}
