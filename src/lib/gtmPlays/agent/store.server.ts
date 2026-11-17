import "server-only";

import { gtmRead, gtmWrite, type GtmReadSql } from "../db.server";
import type {
  AgentChannel, AgentEmailLookup, AgentEvent, AgentEventKind, AgentExcludeReason, AgentMethod, AgentPerson,
  AgentPersonInput, AgentPosting, AgentSendMode, AgentSettings, AgentSource, AgentStatus,
} from "./types";
import { cleanSendWeekdays } from "./sendTiming";
import type { SignalLogEntry } from "./signals";
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
  send_weekdays?: number[] | null; send_mode: AgentSendMode;
  followup_days: number; quiet_days_after_end: number;
  /** Missing before the column is added (reads as on, the default). */
  email_lookup?: boolean | null;
  signals: unknown; version: number | null; updated_at: string | Date | null;
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
    sendMode: row.send_mode === "approve" ? "approve" : "auto",
    followupDays: row.followup_days,
    quietDaysAfterEnd: row.quiet_days_after_end,
    emailLookup: row.email_lookup ?? DEFAULT_AGENT_SETTINGS.emailLookup,
    signals: normalizeSignalSettings(row.signals ?? {}).settings,
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

/** Saves the whole settings object (validated by the caller) as the next version, returns what was stored. */
export async function saveAgentSettings(settings: Omit<AgentSettings, "updatedAt" | "version">, userId: string): Promise<AgentSettings> {
  const [row] = await gtmWrite((sql) => sql<SettingsRow[]>`
    update public.gtm_agent_settings set
      enabled = ${settings.enabled}, sender_name = ${settings.senderName}, sender_email = ${settings.senderEmail},
      daily_mail_cap = ${settings.dailyMailCap}, daily_cost_usd = ${settings.dailyCostUsd},
      send_start_hour = ${settings.sendStartHour}, send_end_hour = ${settings.sendEndHour},
      send_weekdays = ${cleanSendWeekdays(settings.sendWeekdays)}::int[],
      send_mode = ${settings.sendMode}, followup_days = ${settings.followupDays},
      quiet_days_after_end = ${settings.quietDaysAfterEnd},
      email_lookup = ${settings.emailLookup},
      signals = ${sql.json(normalizeSignalSettings(settings.signals).settings as never)}, version = version + 1,
      updated_by = ${userId}::uuid, updated_at = now()
    where id
    returning *
  `);
  return mapSettings(row);
}

type PersonRow = {
  id: string; run_id: string | null; source: AgentSource; method: AgentMethod; settings_version: number | null;
  tuning_version: string | null; contact_url: string | null;
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
    contactUrl: row.contact_url ?? null,
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
  contactUrl?: string | null;
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
    tuning_version: person.tuningVersion ?? null, contact_url: person.contactUrl ?? null,
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
  draftSubject: string | null; draftBody: string | null; mailId: string | null; followupMailId: string | null;
  sentBy: string | null; sentAt: string | null; skipReason: string | null;
  replyText: string | null; repliedAt: string | null; followupDueAt: string | null; endedAt: string | null;
  addCostUsd: number;
}>;

const COLUMNS: Record<Exclude<keyof AgentPersonPatch, "addCostUsd">, string> = {
  status: "status", excludeReason: "exclude_reason", postings: "postings", messageKind: "message_kind",
  reason: "reason", channel: "channel", email: "email", emailSource: "email_source", emailLookup: "email_lookup",
  language: "language",
  draftSubject: "draft_subject", draftBody: "draft_body", mailId: "mail_id", followupMailId: "followup_mail_id",
  sentBy: "sent_by", sentAt: "sent_at", skipReason: "skip_reason",
  replyText: "reply_text", repliedAt: "replied_at", followupDueAt: "followup_due_at", endedAt: "ended_at",
};

/**
 * Changes a person and adds one timeline line, in one statement. `expect`: only when the row is still in one of
 * these statuses (a second click or a second worker finds it moved on and changes nothing; returns null).
 */
export async function updateAgentPerson(
  id: string,
  patch: AgentPersonPatch,
  event: { kind: AgentEventKind; by: string; note?: string | null } | null,
  expect?: readonly AgentStatus[],
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
    order by signal_at desc nulls last, created_at limit ${limit}::int
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
 * Email lookups started and not ended yet (any run): their expected cost is kept aside from today's cap before more
 * are started.
 */
export async function countRunningEmailLookups(): Promise<number> {
  const [row] = await gtmRead((sql) => sql<Array<{ n: number }>>`
    select count(*)::int as n from public.gtm_agent_people where status = 'found' and email_lookup->>'state' = 'running'
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
};

export type RunRow = {
  id: string; run_date: string | Date; kind: AgentRunKind; status: AgentRun["status"]; counts: Record<string, number> | null;
  cost_usd: string | number; error: string | null; is_test: boolean; created_at: string | Date;
  started_at: string | Date | null; finished_at: string | Date | null;
};

export const mapRun = (row: RunRow): AgentRun => ({
  id: row.id,
  runDate: typeof row.run_date === "string" ? row.run_date.slice(0, 10) : row.run_date.toISOString().slice(0, 10),
  kind: row.kind, status: row.status, counts: row.counts ?? {}, costUsd: Number(row.cost_usd), error: row.error,
  isTest: row.is_test, createdAt: iso(row.created_at) ?? "", startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
});

export async function createAgentRun(args: {
  kind: AgentRunKind; runDate: string; isTest: boolean; createdBy: string | null;
}): Promise<AgentRun> {
  const [row] = await gtmWrite((sql) => sql<RunRow[]>`
    insert into public.gtm_agent_runs (run_date, kind, is_test, created_by)
    values (${args.runDate}::date, ${args.kind}, ${args.isTest}, ${args.createdBy}::uuid)
    returning *
  `);
  return mapRun(row);
}

/**
 * Takes the oldest queued or lease-expired running run for `leaseMs` (one dispatcher at a time works on a run).
 * Returns the run and its lease token, or null when there is nothing to do.
 */
export async function leaseAgentRun(leaseMs: number): Promise<{ run: AgentRun; leaseToken: string } | null> {
  const [row] = await gtmWrite((sql) => sql<Array<RunRow & { lease_token: string }>>`
    update public.gtm_agent_runs set status = 'running', lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => ${Math.round(leaseMs / 1000)}::int),
      started_at = coalesce(started_at, now())
    where id = (
      select id from public.gtm_agent_runs
      where status = 'queued' or (status = 'running' and lease_expires_at < now())
      -- Imports and manual runs first (they end), then the day's run (it stays open through its day).
      order by (kind = 'daily'), created_at limit 1 for update skip locked
    )
    returning *
  `);
  return row ? { run: mapRun(row), leaseToken: row.lease_token } : null;
}

/** Ends the lease: done / failed / stopped, or back to queued when more work is left for the next tick. */
export async function releaseAgentRun(args: {
  id: string; leaseToken: string; status: "queued" | "done" | "failed" | "stopped"; counts?: Record<string, number>;
  addCostUsd?: number; error?: string | null;
}): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_runs set status = ${args.status}, lease_token = null, lease_expires_at = null,
      counts = counts || ${sql.json(args.counts ?? {})}, cost_usd = cost_usd + ${args.addCostUsd ?? 0},
      error = ${args.error ?? null},
      finished_at = case when ${args.status} in ('done', 'failed', 'stopped') then now() else finished_at end
    where id = ${args.id}::uuid and lease_token = ${args.leaseToken}::uuid
  `);
}

/**
 * One source's entries in earlier runs' signal logs (gtm_agent_runs.signal_log[source]), newest search first, the
 * given run left out. Raw jsonb: signals.ts readSignalLogEntry checks each one.
 */
export async function readSignalLogs(source: string, exceptRunId: string, limit: number): Promise<unknown[]> {
  const rows = await gtmRead((sql) => sql<Array<{ entry: unknown }>>`
    select signal_log -> ${source}::text as entry from public.gtm_agent_runs
    where signal_log -> ${source}::text is not null and id <> ${exceptRunId}::uuid
    order by signal_log -> ${source}::text ->> 'at' desc nulls last, created_at desc
    limit ${limit}::int
  `);
  return rows.map((row) => row.entry);
}

/** Keeps one source's search log on the run (signal_log[source] = entry; a second search of the source replaces it). */
export async function writeSignalLog(runId: string, source: string, entry: SignalLogEntry): Promise<void> {
  await gtmWrite((sql) => sql`
    update public.gtm_agent_runs set signal_log = signal_log || jsonb_build_object(${source}::text, ${sql.json(entry as never)}::jsonb)
    where id = ${runId}::uuid
  `);
}

/**
 * Today's (Korea time) spend: every paid step runs inside a run and adds its cost to the run when the run's lease
 * ends, so the day's runs hold the day's spend. Test runs count too (the money is real).
 */
export async function agentCostToday(sql: GtmReadSql, kstDay: string): Promise<number> {
  const [row] = await sql<Array<{ usd: string | number | null }>>`
    select coalesce(sum(cost_usd), 0) as usd from public.gtm_agent_runs where run_date = ${kstDay}::date
  `;
  return Number(row?.usd ?? 0);
}
