import "server-only";

import { randomUUID } from "node:crypto";
import { sendResendEmail } from "@/lib/email/send";
import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import type { RoleStartBrief } from "@/lib/org/roleStart/brief";
import { JOB_MUST, buildBroadPool, ensureJobScores, jdQueryText } from "@/lib/org/roleStart/fastPath";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { isSameOrg } from "../cardPrivacy";
import { GTM_WORKSPACE_ID, HARPER_WORKSPACE_ID, gtmWritesEnabled } from "../constants";
import { gtmRead, gtmWrite } from "../db.server";
import { gtmStructuredCall } from "../llm.server";
import { gtmMailsTable, gtmUnsubscribeUrl, type GtmPostingSnapshot } from "../mailSend.server";
import { kstDayWindow } from "../sendLimit";
import { companyDomain, gtmFromHeader, gtmMailLinkOrigin } from "../shared";
import { agentAlert } from "./alerts.server";
import {
  COMPANY_LINE_SCHEMA, COMPANY_MAILS_STOPPED, COMPANY_MEMBERS_MAX, COMPANY_MEMBERS_RECOUNT_MS, askedPersonIds, canAskCompanyFrom, type CompanyAsk,
  companyAddressStep, companyLinePrompt, hiringEmailFromText, matchesCustomer, parseCompanyLines, postingKey, runCompanyMailsWith,
  type CompanyAddress, type CompanyContactLookup, type CompanyHistoryWriter, type CompanyMailFacts, type CompanyMailIo,
  type CompanyMailRecord, type CompanyMailTickResult, type CompanyPostingFacts, type CompanySendResult,
  type InterestedPerson, type LineRequest, type OutgoingCompanyMail, type StrongMember, sameCompany,
} from "./companyMail";
import { measured } from "./compose.server";
import type { ConversationStore, InterestSignal } from "./conversation";
import { EMAIL_LOOKUP_ESTIMATE_USD, EMAIL_LOOKUP_RUN_USD, lookupTimedOut } from "./emailLookup";
import { cancelEmailLookup, checkCompanyContactLookup, startCompanyContactLookup } from "./emailLookup.server";
import { agentSenderProblem } from "./mailRules";
import { detectLanguage } from "./match";
import { closePendingAgentMail, countAgentMailsToday } from "./send.server";
import { AgentSendError, IDEMPOTENCY_WINDOW_MS, classifySendError } from "./sendErrors";
import { sendWindowNow } from "./sendPace.server";
import { lookupSettleUsd, newWorkCapUsd } from "./spend";
import { mayAgentSpend, recordAgentSpend } from "./spend.server";
import { readAgentPerson, readAgentSettings, updateAgentPerson } from "./store.server";
import { maySendNow, sendCallTimeoutMs } from "./tickRules";
import type { AgentSettings } from "./types";

/**
 * #5 non-customer company mail against the real tables, the provider, Exa and the model (the rules and the tick are
 * agent/companyMail.ts runCompanyMailsWith; the words agent/companyMailCopy.ts):
 *   - signals: the reply store's interest signals (agent/conversation.server.ts, injected);
 *   - a posting: the candidate mail's posting snapshot (kind, Role) and its company_roles row (open, text);
 *     customers are workspaces with is_internal (not Harper's or the GTM workspace), by Role or by name;
 *   - members: the old #2 member search (fastPath buildBroadPool on the company_readable_talents_v1 can_show_new rule,
 *     the company's own employees out, job-title match ≥ JOB_MUST), kept a day in gtm_agent_company_postings;
 *   - the address: the posting's own hiring address, else one paid Exa lookup per posting (logged as lookup spend);
 *   - the mail: a gtm_mails row (campaign agent, audience company: the company mails' own daily cap), sent through Resend as the
 *     first mails are, with the thread's In-Reply-To / References on a follow-up.
 */

const AGENT = "agent";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** fastPath's pool needs a Role id for its non-replay branch; the replay branch (used here) never reads it. */
const NO_ROLE = "00000000-0000-0000-0000-000000000000";
/** Members read by the job-title match after the similarity ranking (the old #2 search read take × 3). */
const MEMBERS_CONSIDERED = 60;
/** Member searches (an embedding and two ranking queries each) one tick runs at most; the rest wait a tick. */
const MEMBER_SEARCHES_PER_TICK = 2;
/** Paid hiring-contact lookups one tick starts at most. */
const LOOKUP_STARTS_PER_TICK = 1;
/** A company mail stuck in "sending" is asked about again after this (a call in flight is younger). */
const PENDING_GRACE_MS = 2 * 60_000;
const PENDING_MAILS = 5;
/** The posting's text kept on the mail (the landing makes the company's Role from it). */
const POSTING_TEXT_CHARS = 16_000;
/** The web's String.trim() in SQL (company_readable_talents_v1 compares blocked names after it). */
const JS_TRIM = String.raw`^[\u0009-\u000d    -     　﻿]+|[\u0009-\u000d    -     　﻿]+$`;
/** Job boards and ATS hosts: a posting URL there says nothing about the company's own domain. */
const JOB_BOARD_HOST = /(^|\.)(linkedin\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|wanted\.co\.kr|saramin\.co\.kr|jobkorea\.co\.kr|rocketpunch\.com|jumpit\.co\.kr|remember\.co\.kr|notion\.site|notion\.so|indeed\.com|glassdoor\.com|myworkdayjobs\.com|workday\.com|smartrecruiters\.com|recruitee\.com|breezy\.hr|bamboohr\.com|teamtailor\.com|ninehire\.com|greetinghr\.com|matchharper\.com|google\.com|forms\.gle)$/i;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error ?? "unknown error"));
const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : null);

function postingDomain(url: string | null) {
  try {
    const host = new URL(String(url ?? "")).hostname.toLowerCase().replace(/^www\./, "");
    return host && !JOB_BOARD_HOST.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** The spellings of one posting URL as stored (with and without a trailing slash). */
function urlVariants(url: string): string[] {
  const trimmed = url.trim();
  const bare = trimmed.replace(/\/+$/, "");
  return [...new Set([trimmed, bare, `${bare}/`].filter(Boolean))];
}

// ---------------------------------------------------------------------------------------------------------------
// The posting

type SnapshotRow = { kind: string | null; role_id: string | null; company_name: string | null; title: string | null; location: string | null };

/** The posting as the interested candidates' mails proposed it (the mail's snapshot first, then the person row's). */
async function postingSnapshot(url: string, personIds: readonly string[]): Promise<SnapshotRow | null> {
  const ids = personIds.filter((id) => UUID.test(id));
  if (!ids.length) return null;
  const key = postingKey(url);
  const [row] = await gtmRead((sql) => sql<SnapshotRow[]>`
    with snapshots as (
      select e.value as posting, 0 as rank, m.created_at as at
      from public.gtm_mails m
      cross join lateral jsonb_array_elements(case when jsonb_typeof(m.postings) = 'array' then m.postings else '[]'::jsonb end) e(value)
      where m.campaign = 'agent' and m.audience = 'candidate' and m.agent_person_id = any(${ids}::uuid[])
      union all
      select e.value, 1, p.updated_at
      from public.gtm_agent_people p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.postings) = 'array' then p.postings else '[]'::jsonb end) e(value)
      where p.id = any(${ids}::uuid[])
    )
    select posting ->> 'kind' as kind, posting ->> 'roleId' as role_id, posting ->> 'companyName' as company_name,
      posting ->> 'title' as title, posting ->> 'location' as location
    from snapshots
    where lower(regexp_replace(btrim(coalesce(posting ->> 'url', '')), '/+$', '')) = ${key}
    order by rank, at desc limit 1
  `);
  return row ?? null;
}

type RoleRow = {
  role_id: string; name: string | null; description: string | null; location_text: string | null; source_type: string | null;
  open: boolean; workspace_id: string | null; company_name: string | null; published_name: string | null;
  homepage_url: string | null; is_internal: boolean | null;
};

async function postingRole(roleId: string | null, url: string): Promise<RoleRow | null> {
  const [row] = await gtmRead((sql) => sql<RoleRow[]>`
    select r.role_id::text as role_id, r.name, r.description, r.location_text, r.source_type,
      (not coalesce(r.is_expired, false) and (r.expires_at is null or r.expires_at > now())
        and coalesce(lower(btrim(r.status)), 'active') in ('active', 'top_priority')) as open,
      w.company_workspace_id::text as workspace_id, w.company_name, w.published_name, w.homepage_url, w.is_internal
    from public.company_roles r
    left join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
    where ${roleId ? sql`r.role_id = ${roleId}::uuid` : sql`r.external_jd_url = any(${urlVariants(url)}::text[])`}
    order by r.updated_at desc nulls last limit 1
  `);
  return row ?? null;
}

/**
 * A Harper customer: a workspace of theirs on Harper (is_internal, not Harper's own or the GTM one), by id, by name
 * (agent/companyMail.ts matchesCustomer: (주)/legal suffixes set aside) or by web domain.
 */
async function isCustomer(names: readonly string[], workspaceId: string | null, domain: string | null): Promise<boolean> {
  const rows = await gtmRead((sql) => sql<Array<{
    id: string; company_name: string | null; published_name: string | null; homepage_url: string | null; signup_domain: string | null;
    review_domain: string | null;
  }>>`
    select c.company_workspace_id::text as id, c.company_name, c.published_name, c.homepage_url, c.signup_domain, c.review_domain
    from public.company_workspace c
    where c.is_internal is true and c.company_workspace_id <> all(array[${HARPER_WORKSPACE_ID}, ${GTM_WORKSPACE_ID}]::uuid[])
  `);
  return matchesCustomer(rows.map((row) => ({
    id: row.id, names: [row.company_name, row.published_name], domains: [row.homepage_url, row.signup_domain, row.review_domain],
  })), { names: names.filter((name) => name.trim()), domain, workspaceId });
}

/** The posting a group of signals is about (null: no Role row for it, so nothing to show or count). */
export async function readCompanyPosting(signals: readonly InterestSignal[]): Promise<CompanyPostingFacts | null> {
  const first = signals[0];
  if (!first?.postingUrl?.trim()) return null;
  const url = first.postingUrl.trim();
  const snapshot = await postingSnapshot(url, signals.map((signal) => signal.personId));
  const roleId = snapshot?.role_id && UUID.test(snapshot.role_id) ? snapshot.role_id : null;
  const role = await postingRole(roleId, url);
  if (!role) return null;
  const companyName = (snapshot?.company_name || role.published_name || role.company_name || first.companyName || "").trim();
  const title = (snapshot?.title || role.name || first.postingTitle || "").trim();
  if (!companyName || !title) return null;
  const kind = snapshot?.kind ?? (role.source_type === "external" ? "external" : null);
  const names = [companyName, role.company_name ?? "", role.published_name ?? ""];
  const domain = companyDomain(role.homepage_url) ?? postingDomain(url);
  const text = String(role.description ?? "").replace(/\r\n/g, "\n").trim().slice(0, POSTING_TEXT_CHARS);
  return {
    postingUrl: url,
    roleId: role.role_id,
    companyName,
    title,
    location: snapshot?.location ?? role.location_text,
    open: Boolean(role.open),
    outside: kind === "external",
    customer: Boolean(role.is_internal) || await isCustomer(names, role.workspace_id, domain),
    text,
    companyDomain: domain,
    language: detectLanguage([title, text], "ko"),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Earlier company mails

type CompanyMailRow = {
  id: string; to_email: string; subject: string; created_at: string | Date; rfc_message_id: string | null;
  company_mail: CompanyMailFacts | null;
};

/** The posting's company mails that went out (or may have: sending), oldest first. */
async function readPreviousMails(url: string): Promise<CompanyMailRecord[]> {
  const rows = await gtmRead((sql) => sql<CompanyMailRow[]>`
    select id::text as id, to_email, subject, created_at, rfc_message_id, company_mail
    from public.gtm_mails
    where campaign = 'agent' and audience = 'company' and status in ('sending', 'sent')
      and posting_url = any(${urlVariants(url)}::text[])
    order by created_at limit 50
  `);
  return rows.map((row) => ({
    id: row.id, toEmail: row.to_email, subject: row.subject, createdAt: iso(row.created_at) ?? "",
    rfcMessageId: row.rfc_message_id, facts: row.company_mail,
  }));
}

/** Company mails of today (Korea time): one mail per company a day. */
async function readMailedToday(now: Date): Promise<Array<{ companyName: string; toEmail: string }>> {
  const day = kstDayWindow(now);
  const rows = await gtmRead((sql) => sql<Array<{ company_name: string | null; to_email: string }>>`
    select company_name, to_email from public.gtm_mails
    where campaign = 'agent' and audience = 'company' and status in ('sending', 'sent')
      and created_at >= ${day.start}::timestamptz and created_at < ${day.end}::timestamptz
  `);
  return rows.map((row) => ({ companyName: row.company_name ?? "", toEmail: row.to_email }));
}

/**
 * A company mail went to this company (the same company by name, companyMail.ts sameCompany) or to this address on
 * now's Korea-time day: Ashley's joined mail to a company waits for the next send day then (Shaun 11/22 16:08).
 */
export async function companyMailedToday(company: { companyName: string; toEmail: string }, now: Date): Promise<boolean> {
  const address = company.toEmail.trim().toLowerCase();
  return (await readMailedToday(now)).some((mail) => mail.toEmail.trim().toLowerCase() === address
    || (Boolean(company.companyName.trim()) && sameCompany(mail.companyName, company.companyName)));
}

/**
 * Company mails stop after a spam complaint on any of them, until the agent is turned off and on again (brake_since,
 * as the automatic brake counts). `newStop`: this complaint was not alerted yet (the Slack alert goes once; with
 * `mark`, it is marked alerted on the mail's company_mail facts).
 */
export async function companyMailsStopped(opts: { mark: boolean } = { mark: true }): Promise<{ stopped: boolean; newStop: boolean }> {
  const [row] = await gtmRead((sql) => sql<Array<{ id: string; alerted: boolean }>>`
    select m.id::text as id, (m.company_mail ->> 'stopAlertedAt') is not null as alerted
    from public.gtm_mails m
    where m.campaign = 'agent' and m.audience = 'company' and m.delivery_status = 'complained'
      and coalesce(m.delivery_event_at, m.created_at) >= coalesce((select s.brake_since from public.gtm_agent_settings s where s.id), '-infinity'::timestamptz)
    order by m.created_at desc limit 1
  `);
  if (!row) return { stopped: false, newStop: false };
  if (row.alerted || !opts.mark) return { stopped: true, newStop: false };
  const marked = await gtmWrite((sql) => sql<Array<{ id: string }>>`
    update public.gtm_mails set company_mail = coalesce(company_mail, '{}'::jsonb) || jsonb_build_object('stopAlertedAt', now())
    where id = ${row.id}::uuid and (company_mail ->> 'stopAlertedAt') is null
    returning id::text as id
  `);
  return { stopped: true, newStop: marked.length > 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// The posting's row (members counted, the address)

type PostingRow = {
  posting_url: string; members_counted_at: string | Date | null; member_ids: string[] | null;
  contact_email: string | null; contact_source: string | null; contact_lookup: CompanyContactLookup | null;
};

async function readPostingRow(key: string): Promise<PostingRow | null> {
  const [row] = await gtmRead((sql) => sql<PostingRow[]>`
    select posting_url, members_counted_at, member_ids::text[] as member_ids, contact_email, contact_source, contact_lookup
    from public.gtm_agent_company_postings where posting_url = ${key}
  `);
  return row ?? null;
}

async function saveMembers(key: string, companyName: string, ids: readonly string[]) {
  await gtmWrite((sql) => sql`
    insert into public.gtm_agent_company_postings (posting_url, company_name, members_counted_at, member_ids)
    values (${key}, ${companyName}, now(), ${[...ids]}::uuid[])
    on conflict (posting_url) do update set company_name = excluded.company_name,
      members_counted_at = excluded.members_counted_at, member_ids = excluded.member_ids, updated_at = now()
  `);
}

async function savePostingAddress(key: string, companyName: string, email: string) {
  await gtmWrite((sql) => sql`
    insert into public.gtm_agent_company_postings (posting_url, company_name, contact_email, contact_source)
    values (${key}, ${companyName}, ${email}, 'posting')
    on conflict (posting_url) do update set contact_email = excluded.contact_email, contact_source = 'posting', updated_at = now()
    where gtm_agent_company_postings.contact_email is distinct from excluded.contact_email
  `);
}

// ---------------------------------------------------------------------------------------------------------------
// Strong Harper members

/** Every name the posting's company goes by (the members' blocked-company check, as the old #2 search). */
async function postingCompanyNames(posting: CompanyPostingFacts): Promise<string[]> {
  const name = posting.companyName.trim();
  const domain = posting.companyDomain;
  const rows = await gtmRead((sql) => sql<Array<{ company_name: string | null; published_name: string | null }>>`
    select w.company_name, w.published_name
    from public.company_workspace w
    where (${name} <> '' and (lower(btrim(w.company_name)) = lower(${name})
        or lower(btrim(coalesce(w.published_name, ''))) = lower(${name})))
      or (${domain}::text is not null and w.homepage_url is not null
        and lower(regexp_replace(regexp_replace(w.homepage_url, '^https?://(www\\.)?', '', 'i'), '[/:?#].*$', '')) = ${domain})
      ${posting.roleId ? sql`or w.company_workspace_id = (select r.company_workspace_id from public.company_roles r where r.role_id = ${posting.roleId}::uuid)` : sql``}
    limit 20
  `);
  return [...new Set([name, ...rows.flatMap((row) => [row.company_name, row.published_name])]
    .map((value) => String(value ?? "").trim()).filter(Boolean))];
}

/**
 * Members the company may see (company_readable_talents_v1 can_show_new: onboarding done, open to matches, internal
 * recommendations not off, not deleted) who did not block the company under any of its names (blocked names after
 * the web's trim, lower-cased, empty ones ignored). `ids`: only among these.
 */
async function visibleMembers(companyNames: readonly string[], ids?: readonly string[]): Promise<string[]> {
  const names = [...new Set(companyNames.map((name) => name.trim()).filter(Boolean))];
  const rows = await gtmRead((sql) => sql<Array<{ talent_id: string }>>`
    select t.user_id::text as talent_id
    from public.talent_users t
    join public.talent_setting s on s.user_id = t.user_id
    where t.deleted_at is null and s.is_onboarding_done is true and s.profile_visibility = 'open_to_matches'
      and s.get_internal_recommendation is not false
      ${ids ? sql`and t.user_id = any(${[...ids]}::uuid[])` : sql``}
      and not exists (
        select 1 from unnest(coalesce(s.blocked_companies, '{}'::text[])) blocked(name)
        where nullif(lower(regexp_replace(blocked.name, ${JS_TRIM}, '', 'g')), '') in (select lower(n) from unnest(${names}::text[]) n)
      )
  `);
  return rows.map((row) => row.talent_id);
}

/** The Role Start job-title match reads only the Brief's titles: the posting's title is the one title. */
function titleBrief(title: string): RoleStartBrief {
  return { summary: "", hardConditions: [], criteria: [], keywords: [], titles: { matching: [title], nearMiss: [] } };
}

/**
 * Strong members for one posting: the old #2 member search (the Role Start pool by JD similarity on the visible
 * members, the company's current employees left out), then only those whose recent jobs match the posting's title
 * at Role Start's must bar (JOB_MUST), in similarity order, at most COMPANY_MEMBERS_MAX.
 */
async function searchStrongMembers(posting: CompanyPostingFacts): Promise<string[]> {
  const companyNames = await postingCompanyNames(posting);
  const talentIds = await visibleMembers(companyNames);
  if (!talentIds.length) return [];
  const pool = await buildBroadPool({
    roleId: NO_ROLE,
    queryText: jdQueryText({ roleName: `${posting.companyName} ${posting.title}`.trim(), description: posting.text }),
    excludeIds: [],
    replay: { talentIds, companyNames },
  });
  const considered = pool.members.slice(0, MEMBERS_CONSIDERED);
  if (!considered.length) return [];
  const current = await gtmRead((sql) => sql<Array<{ talent_id: string; company_name: string | null }>>`
    select talent_id::text as talent_id, company_name from public.talent_experiences
    where talent_id = any(${considered.map((member) => member.talentId)}::uuid[]) and end_date is null
  `);
  const employees = new Set(current
    .filter((row) => companyNames.some((name) => isSameOrg(name, row.company_name)))
    .map((row) => row.talent_id));
  const scored = { ...pool, members: considered.filter((member) => !employees.has(member.talentId)) };
  await ensureJobScores({ pool: scored, brief: titleBrief(posting.title) });
  const scores = scored.job?.scores ?? {};
  return scored.members
    .filter((member) => {
      const score = scores[member.talentId];
      return typeof score === "number" && score >= JOB_MUST;
    })
    .slice(0, COMPANY_MEMBERS_MAX)
    .map((member) => member.talentId);
}

/** What the lines and the leak check read about the members (names stay in code; the check needs them). */
async function memberFacts(ids: readonly string[]): Promise<StrongMember[]> {
  if (!ids.length) return [];
  const facts = await gtmRead(async (sql) => {
    const [people, experiences, educations] = await Promise.all([
      sql<Array<{ user_id: string; name: string | null; headline: string | null; location: string | null; years: number | null }>>`
        select t.user_id::text as user_id, t.name, t.headline, coalesce(t.current_location, t.location) as location,
          (select extract(epoch from (now() - min(x.start_date)::timestamptz)) / 31557600.0
            from public.talent_experiences x where x.talent_id = t.user_id and x.start_date is not null)::float8 as years
        from public.talent_users t where t.user_id = any(${[...ids]}::uuid[])
      `,
      sql<Array<{ talent_id: string; role: string | null; company_name: string | null; description: string | null; current: boolean }>>`
        select talent_id::text as talent_id, role, company_name, left(description, 500) as description, end_date is null as current
        from public.talent_experiences where talent_id = any(${[...ids]}::uuid[])
        order by talent_id, end_date desc nulls first, start_date desc nulls last
      `,
      sql<Array<{ talent_id: string; school: string | null }>>`
        select talent_id::text as talent_id, school from public.talent_educations
        where talent_id = any(${[...ids]}::uuid[]) order by talent_id, end_date desc nulls first
      `,
    ]);
    return { people, experiences, educations };
  });
  const people = new Map(facts.people.map((row) => [row.user_id, row]));
  return ids.flatMap((id) => {
    const person = people.get(id);
    if (!person) return [];
    return [{
      talentId: id,
      name: person.name,
      headline: person.headline,
      location: person.location,
      years: person.years === null ? null : Number(person.years),
      experiences: facts.experiences.filter((row) => row.talent_id === id).slice(0, 8)
        .map((row) => ({ role: row.role, company: row.company_name, description: row.description, current: Boolean(row.current) })),
      educations: facts.educations.filter((row) => row.talent_id === id).slice(0, 4).map((row) => ({ school: row.school })),
    }];
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The address

/** A running lookup looked at once: settled when it ended or ran out of time (spend logged), else as it was. */
async function settleContactLookup(
  key: string, posting: CompanyPostingFacts, lookup: CompanyContactLookup, ctx: TickContext, personId: string,
): Promise<{ email: string | null; lookup: CompanyContactLookup }> {
  if (!lookup.runId) return { email: null, lookup: { ...lookup, state: "done", reason: "start_failed" } };
  let done: { email: string | null; sourceUrl: string | null; costUsd: number; reason: string | null };
  try {
    const check = await checkCompanyContactLookup(lookup.runId, { companyName: posting.companyName, companyDomain: posting.companyDomain });
    if (check.state === "running") {
      if (!lookupTimedOut(lookup, ctx.now)) return { email: null, lookup };
      await cancelEmailLookup(lookup.runId);
      done = { email: null, sourceUrl: null, costUsd: EMAIL_LOOKUP_RUN_USD, reason: "timeout" };
    } else {
      done = check;
    }
  } catch (error) {
    if (!lookupTimedOut(lookup, ctx.now)) return { email: null, lookup };
    console.error("[gtm-agent] company contact lookup unreachable", key, errorText(error));
    done = { email: null, sourceUrl: null, costUsd: EMAIL_LOOKUP_RUN_USD, reason: "failed" };
  }
  const settled: CompanyContactLookup & { sourceUrl?: string | null } = {
    ...lookup, state: "done", finishedAt: ctx.now.toISOString(), costUsd: done.costUsd, reason: done.reason, sourceUrl: done.sourceUrl,
  };
  const updated = await gtmWrite((sql) => sql<Array<{ posting_url: string }>>`
    update public.gtm_agent_company_postings set contact_lookup = ${sql.json(settled as never)},
      contact_email = coalesce(${done.email}::text, contact_email),
      contact_source = case when ${done.email}::text is not null then 'lookup' else contact_source end,
      updated_at = now()
    where posting_url = ${key} and contact_lookup ->> 'state' = 'running' and contact_lookup ->> 'runId' = ${lookup.runId}
    returning posting_url
  `);
  // Settled by another tick already: its spend is logged there.
  if (updated.length) {
    await recordAgentSpend({
      step: "lookup", usd: lookupSettleUsd(done.costUsd, lookup.reservedUsd), runId: ctx.runId, personId, configId: ctx.configId,
    });
  }
  return { email: done.email, lookup: settled };
}

/** Starts the posting's one paid lookup (its estimate logged now, the rest when it ends). False: Exa did not start it. */
async function beginContactLookup(key: string, posting: CompanyPostingFacts, ctx: TickContext, personId: string): Promise<boolean> {
  let runId: string;
  try {
    ({ runId } = await startCompanyContactLookup({
      companyName: posting.companyName, title: posting.title, postingUrl: posting.postingUrl,
      companyDomain: posting.companyDomain, location: posting.location,
    }));
  } catch (error) {
    // Nothing ran, nothing is charged: a later tick tries again.
    console.error("[gtm-agent] company contact lookup did not start", key, errorText(error));
    return false;
  }
  await recordAgentSpend({ step: "lookup", usd: EMAIL_LOOKUP_ESTIMATE_USD, runId: ctx.runId, personId, configId: ctx.configId });
  const lookup: CompanyContactLookup = { runId, startedAt: ctx.now.toISOString(), state: "running", reservedUsd: EMAIL_LOOKUP_ESTIMATE_USD };
  await gtmWrite((sql) => sql`
    insert into public.gtm_agent_company_postings (posting_url, company_name, contact_lookup)
    values (${key}, ${posting.companyName}, ${sql.json(lookup as never)})
    on conflict (posting_url) do update set contact_lookup = excluded.contact_lookup, updated_at = now()
  `);
  return true;
}

async function postingAddress(posting: CompanyPostingFacts, ctx: TickContext, personId: string): Promise<CompanyAddress> {
  const key = postingKey(posting.postingUrl);
  const row = await readPostingRow(key);
  let contact = row ? { email: row.contact_source === "lookup" ? row.contact_email : null, lookup: row.contact_lookup } : null;
  if (contact?.lookup?.state === "running") {
    const settled = await settleContactLookup(key, posting, contact.lookup, ctx, personId);
    contact = { email: settled.email ?? contact.email, lookup: settled.lookup };
  }
  const fromPosting = hiringEmailFromText(posting.text, posting.companyDomain);
  const needsLookup = !fromPosting && !contact?.email && !contact?.lookup;
  const mayLookup = needsLookup && ctx.lookupsStarted < LOOKUP_STARTS_PER_TICK
    && await mayAgentSpend(newWorkCapUsd(ctx.settings.dailyCostUsd), EMAIL_LOOKUP_ESTIMATE_USD);
  const step = companyAddressStep({ postingText: posting.text, companyDomain: posting.companyDomain, contact, mayLookup });
  if (step.kind === "address") {
    if (step.source === "posting") await savePostingAddress(key, posting.companyName, step.email);
    return { email: step.email, source: step.source };
  }
  if (step.kind === "start_lookup") {
    ctx.lookupsStarted += 1;
    await beginContactLookup(key, posting, ctx, personId);
    return { waiting: "채용 담당자 주소를 찾기 시작했어요" };
  }
  return step.kind === "waiting" ? { waiting: step.reason } : { none: step.reason };
}

async function isSuppressed(email: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("external_contact_suppressions")
    .select("reason").eq("email_hash", externalEmailHash(email.trim().toLowerCase())).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// ---------------------------------------------------------------------------------------------------------------
// Lines, notes

async function writeCompanyLines(request: LineRequest, ctx: TickContext): Promise<Record<string, string>> {
  if (!request.candidates.length) return {};
  const prompt = companyLinePrompt(request);
  const { value, costUsd } = await measured("company_lines", () => gtmStructuredCall<unknown>({
    label: "gtm-agent:company-lines",
    schemaName: "gtm_agent_company_lines",
    schema: COMPANY_LINE_SCHEMA as unknown as Record<string, unknown>,
    system: prompt.system,
    user: prompt.user,
    maxTokens: 2_000,
  }));
  await recordAgentSpend({ step: "compose", usd: costUsd, runId: ctx.runId, personId: request.personId, configId: ctx.configId });
  return parseCompanyLines(value);
}

/** A timeline line on the interested candidate, once per text (a waiting posting is looked at every tick). */
async function noteOnce(personId: string, text: string): Promise<void> {
  if (!UUID.test(personId)) return;
  const person = await readAgentPerson(personId);
  if (!person || person.events.some((event) => event.kind === "note" && event.note === text)) return;
  await updateAgentPerson(personId, {}, { kind: "note", by: AGENT, note: text });
}

async function interestedPerson(personId: string): Promise<InterestedPerson | null> {
  if (!UUID.test(personId)) return null;
  const person = await readAgentPerson(personId);
  if (!person) return null;
  const optedOut = person.events.some((event) => event.kind === "unsubscribed" || event.kind === "bounced");
  return {
    personId: person.id, name: person.name, headline: person.headline, location: person.location,
    currentCompany: person.currentCompany, profileText: person.profileText, isTest: person.isTest,
    stopped: optedOut || (person.email ? await isSuppressed(person.email) : false),
  };
}

/**
 * Where one of Ashley's candidates stands now, for the company that joined from a company mail (companyInvite.server.ts):
 * stopped (opted out, bounced, on the opt-out list) or a Harper member (an account with their address, or the one that
 * claimed their candidate mail): then they come to the Role as a member, not as a nameless 외부 후보 card.
 */
export async function ashleyCandidateNow(personId: string): Promise<{ stopped: boolean; talentId: string | null } | null> {
  if (!UUID.test(personId)) return null;
  const person = await readAgentPerson(personId);
  if (!person) return null;
  const email = person.email?.trim().toLowerCase() ?? "";
  const stopped = person.events.some((event) => event.kind === "unsubscribed" || event.kind === "bounced")
    || (email ? await isSuppressed(email) : false);
  const [row] = await gtmRead((sql) => sql<Array<{ talent_id: string | null }>>`
    select coalesce(
      (select t.user_id::text from public.talent_users t where ${email} <> '' and lower(t.email) = ${email} and t.deleted_at is null limit 1),
      (select m.claimed_talent_id::text from public.gtm_mails m
        where m.agent_person_id = ${personId}::uuid and m.audience = 'candidate' and m.claimed_talent_id is not null
        order by m.claimed_at desc nulls last limit 1)
    ) as talent_id
  `);
  return { stopped, talentId: row?.talent_id ?? null };
}

// ---------------------------------------------------------------------------------------------------------------
// Sending

/** What a logged company mail sends: built from the row alone, so a retry sends exactly the same request. */
type CompanyMailPayload = {
  id: string; to: string; subject: string; html: string; text: string; fromName: string; fromEmail: string;
  /** In-Reply-To / References in a thread. */
  threadHeaders: Record<string, string>;
};

/** One provider call under the mail's idempotency key (the first mails' sender, From, Reply-To and opt-out headers). */
async function callProvider(mail: CompanyMailPayload, timeoutMs: number): Promise<string | null> {
  const unsubscribeUrl = gtmUnsubscribeUrl(mail.id, gtmMailLinkOrigin());
  try {
    const sent = await sendResendEmail({
      from: gtmFromHeader({ fromName: mail.fromName, fromEmail: mail.fromEmail }),
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: mail.fromEmail,
      headers: {
        ...threadHeadersOf(mail.threadHeaders),
        "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${mail.fromEmail}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      idempotencyKey: `gtm-agent-mail:${mail.id}`,
      signal: AbortSignal.timeout(Math.max(1_000, timeoutMs)),
    });
    return sent.id ?? null;
  } catch (error) {
    throw new AgentSendError(classifySendError(error), mail.id);
  }
}

/** Only the two thread headers are ever taken from the stored facts. */
function threadHeadersOf(headers: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ["In-Reply-To", "References"] as const) {
    const value = String(headers?.[name] ?? "").replace(/[\r\n]+/g, " ").trim();
    if (value) out[name] = value.slice(0, 2_000);
  }
  return out;
}

/** The row after a provider call: sent with its id, or failed (refused / not this address), or left "sending" (unknown). */
async function recordProviderCall(mailId: string, outcome: { providerId: string | null } | { error: AgentSendError }) {
  const table = gtmMailsTable(getSupabaseAdmin());
  if ("providerId" in outcome) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await table.update({ status: "sent", provider_message_id: outcome.providerId, error: null }).eq("id", mailId);
      if (!error) return;
      console.error("[gtm-agent] company mail sent but the log update failed", mailId, error);
    }
    return;
  }
  const { kind, message } = outcome.error;
  const patch = kind === "unknown" ? { error: message.slice(0, 1_000) } : { status: "failed", error: message.slice(0, 1_000) };
  const { error } = await table.update(patch).eq("id", mailId).eq("status", "sending");
  if (error) console.error("[gtm-agent] company mail failed and the log update failed", mailId, error);
}

async function sendCompanyMail(mail: OutgoingCompanyMail, ctx: TickContext, sentBy: string): Promise<CompanySendResult> {
  // Turned off since the tick started, or the cap filled up meanwhile: nothing more goes out this tick.
  if (!(await readAgentSettings()).enabled) return { status: "later", reason: "agent_off" };
  if (await countAgentMailsToday(ctx.now, "company") >= ctx.settings.dailyMailCap) return { status: "later", reason: "daily_cap" };
  const fromName = ctx.settings.senderName?.trim() ?? "";
  const fromEmail = ctx.settings.senderEmail?.trim().toLowerCase() ?? "";
  const to = mail.to.trim().toLowerCase();
  const snapshot: GtmPostingSnapshot = {
    title: mail.posting.title, companyName: mail.posting.companyName, location: mail.posting.location,
    description: mail.posting.text, url: mail.posting.postingUrl,
  };
  // Logged as "sending" before the provider call: a tick killed during the call leaves it for settleStuckMails.
  const { error: insertError } = await gtmMailsTable(getSupabaseAdmin()).insert({
    id: mail.id, campaign: "agent", audience: "company",
    from_name: fromName, from_email: fromEmail, to_email: to,
    company_name: mail.posting.companyName, company_workspace_id: null, role_id: null, posting_url: mail.posting.postingUrl,
    talent_ids: mail.facts.memberIds, language: mail.language,
    subject: mail.subject, html: mail.html, text_body: mail.text, sent_by: sentBy, status: "sending",
    posting: snapshot, postings: null, agent_person_id: mail.personId, company_mail: mail.facts,
  });
  if (insertError) throw insertError;
  const payload: CompanyMailPayload = {
    id: mail.id, to, subject: mail.subject, html: mail.html, text: mail.text, fromName, fromEmail, threadHeaders: mail.headers,
  };
  try {
    const providerId = await callProvider(payload, sendCallTimeoutMs(ctx.startedAt, Date.now()));
    await recordProviderCall(mail.id, { providerId });
    return { status: "sent" };
  } catch (error) {
    if (!(error instanceof AgentSendError)) throw error;
    await recordProviderCall(mail.id, { error });
    return error.kind === "recipient" ? { status: "blocked", reason: error.message.slice(0, 160) } : { status: "paused", reason: error.message };
  }
}

/**
 * Company mails stuck in "sending" (the candidate settle leaves them to this): asked again with the same request,
 * headers and key inside the idempotency window (a mail the provider took is not sent twice); past it the outcome
 * cannot be known and the row fails. Returns why sending pauses, if it does.
 */
async function settleStuckMails(ctx: TickContext): Promise<string | null> {
  const { data, error } = await gtmMailsTable(getSupabaseAdmin())
    .select("id,to_email,subject,html,text_body,from_name,from_email,created_at,company_mail")
    .eq("campaign", "agent").eq("audience", "company").eq("status", "sending")
    .lt("created_at", new Date(Date.now() - PENDING_GRACE_MS).toISOString())
    .order("created_at", { ascending: true }).limit(PENDING_MAILS);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string; to_email: string; subject: string; html: string; text_body: string; from_name: string | null;
    from_email: string | null; created_at: string; company_mail: CompanyMailFacts | null;
  }>;
  for (const row of rows) {
    if (Date.now() - Date.parse(row.created_at) > IDEMPOTENCY_WINDOW_MS) {
      await closePendingAgentMail(row.id, "failed", "보냈는지 확인할 수 없어 다시 보내지 않아요 (24시간 지남)");
      continue;
    }
    if (!maySendNow(ctx.startedAt, Date.now())) return null;
    try {
      const providerId = await callProvider({
        id: row.id, to: row.to_email, subject: row.subject, html: row.html, text: row.text_body,
        fromName: row.from_name ?? "", fromEmail: row.from_email ?? "", threadHeaders: row.company_mail?.headers ?? {},
      }, sendCallTimeoutMs(ctx.startedAt, Date.now()));
      await recordProviderCall(row.id, { providerId });
    } catch (sendError) {
      if (!(sendError instanceof AgentSendError)) throw sendError;
      await recordProviderCall(row.id, { error: sendError });
      if (sendError.kind !== "recipient") return sendError.message;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// The tick and the question Ashley asks before promising a candidate to ask the company

type TickContext = {
  now: Date;
  startedAt: number;
  settings: AgentSettings;
  runId: string | null;
  configId: string | null;
  lookupsStarted: number;
  memberSearches: number;
};

export type RunCompanyMailsInput = {
  store: Pick<ConversationStore, "interestSignals" | "history" | "personAnswered" | "ashleyMailedToday">;
  /** The tick's `now`. */
  now: Date;
  settings: AgentSettings;
  /** The Ops user the mails are logged under (gtm_mails.sent_by), as for the first mails. */
  sentBy: string;
  /** When the tick started (Date.now()): sending stops before the tick's end. */
  startedAt: number;
  runId?: string | null;
  configId?: string | null;
  /** Ashley's writer for a thread the company answered; without one such a thread goes to a human. */
  writeWithHistory?: CompanyHistoryWriter;
};

/**
 * One dispatcher tick's company mails (run inside sendMails, under their own daily cap: `dailyMailCap` company mails
 * a day, apart from the candidate mails', Shaun 11/22). Returns what went out, the run's problems (the stop's red
 * line), a provider pause, and why postings wait.
 */
export async function runCompanyMails(input: RunCompanyMailsInput): Promise<CompanyMailTickResult> {
  const empty: CompanyMailTickResult = { sent: 0, problems: [], paused: null, waiting: {} };
  if (!gtmWritesEnabled()) return empty;
  const stop = await companyMailsStopped();
  if (stop.stopped) {
    if (stop.newStop) await agentAlert("complaint", COMPANY_MAILS_STOPPED);
    return { ...empty, problems: [COMPANY_MAILS_STOPPED] };
  }
  const { settings, now } = input;
  const ctx: TickContext = {
    now, startedAt: input.startedAt, settings, runId: input.runId ?? null, configId: input.configId ?? null,
    lookupsStarted: 0, memberSearches: 0,
  };
  const windowOpen = sendWindowNow(settings, now) && !agentSenderProblem(settings);
  if (windowOpen) {
    const paused = await settleStuckMails(ctx);
    if (paused) return { ...empty, paused };
  }
  // Company mails have their own day cap, the same number as the candidate mails' (Shaun 11/22).
  let quota = Math.max(0, settings.dailyMailCap - await countAgentMailsToday(now, "company"));
  const origin = gtmMailLinkOrigin();

  const io: CompanyMailIo = {
    now,
    senderName: settings.senderName?.trim() ?? "",
    windowOpen,
    timeLeft: () => maySendNow(input.startedAt, Date.now()),
    quotaLeft: async () => quota,
    stopped: async () => false,
    signals: (since) => input.store.interestSignals({ since }),
    posting: readCompanyPosting,
    previousMails: readPreviousMails,
    mailedToday: () => readMailedToday(now),
    ashleyMailedToday: async (email) => Boolean(await input.store.ashleyMailedToday?.(email.trim().toLowerCase(), now)),
    isHumanOwned: (mailId) => input.store.personAnswered(mailId),
    companyReplied: async (toEmail, since) => {
      const after = Date.parse(since);
      return (await input.store.history(toEmail)).some((entry) => entry.author === "counterpart" && Date.parse(entry.at) >= after);
    },
    person: interestedPerson,
    members: async (posting, newestSignalAt) => {
      const key = postingKey(posting.postingUrl);
      const row = await readPostingRow(key);
      const countedAt = row?.members_counted_at ? new Date(row.members_counted_at).getTime() : Number.NaN;
      const current = Number.isFinite(countedAt) && now.getTime() - countedAt < COMPANY_MEMBERS_RECOUNT_MS
        && countedAt >= Date.parse(newestSignalAt);
      if (current) {
        const kept = row?.member_ids ?? [];
        // Still visible now (a member may have hidden their profile or blocked the company since the count).
        const visible = kept.length ? new Set(await visibleMembers(await postingCompanyNames(posting), kept)) : new Set<string>();
        return memberFacts(kept.filter((id) => visible.has(id)));
      }
      if (ctx.memberSearches >= MEMBER_SEARCHES_PER_TICK) return null;
      ctx.memberSearches += 1;
      let ids: string[];
      try {
        ids = await searchStrongMembers(posting);
      } catch (error) {
        console.error("[gtm-agent] company mail member search", posting.postingUrl, errorText(error));
        return null;
      }
      await saveMembers(key, posting.companyName, ids);
      return memberFacts(ids);
    },
    address: (posting, personId) => postingAddress(posting, ctx, personId),
    suppressed: isSuppressed,
    writeLines: (request) => writeCompanyLines(request, ctx),
    newMailId: () => randomUUID(),
    links: (mailId) => ({
      landingUrl: new URL(`/org?gtm=${encodeURIComponent(mailId)}`, origin).toString(),
      unsubscribeUrl: gtmUnsubscribeUrl(mailId, origin),
    }),
    send: async (mail) => {
      const result = await sendCompanyMail(mail, ctx, input.sentBy);
      if (result.status === "sent") quota = Math.max(0, quota - 1);
      return result;
    },
    note: noteOnce,
    writeWithHistory: input.writeWithHistory,
  };
  return runCompanyMailsWith(io);
}

/**
 * Where asking this posting's company stands for one candidate (agent/companyMail.ts CompanyAsk): "asked" once a
 * company mail of the posting carried them (their agreement, line and question; when it went), else "can" when a
 * company mail could go at all (agent/companyMail.ts canAskCompanyFrom: an open outside posting of a non-customer,
 * company mails not stopped, an address known or a lookup still possible and not opted out, not a thread a human took
 * over, not a test candidate), else "no". Read only. `asIfWritesOn`: the replay asks what production would answer (it
 * never writes).
 */
export async function companyAsk(
  input: { postingUrl: string; personId: string },
  deps: { store?: Pick<ConversationStore, "personAnswered">; asIfWritesOn?: boolean } = {},
): Promise<CompanyAsk> {
  if ((!gtmWritesEnabled() && !deps.asIfWritesOn) || !UUID.test(input.personId) || !input.postingUrl?.trim()) return { state: "no" };
  const signal: InterestSignal = {
    personId: input.personId, postingUrl: input.postingUrl.trim(), companyName: "", postingTitle: "", question: null,
    summaryConsent: false, at: new Date().toISOString(), messageId: "",
  };
  const [posting, stop, person] = await Promise.all([readCompanyPosting([signal]), companyMailsStopped({ mark: false }), readAgentPerson(input.personId)]);
  if (!posting || !person) return { state: "no" };
  const [previous, row] = await Promise.all([readPreviousMails(posting.postingUrl), readPostingRow(postingKey(posting.postingUrl))]);
  const carried = previous.find((mail) => askedPersonIds([mail]).has(input.personId));
  if (carried) return { state: "asked", at: carried.createdAt };
  const knownEmail = previous.length
    ? previous[previous.length - 1].toEmail
    : hiringEmailFromText(posting.text, posting.companyDomain) ?? (row?.contact_source === "lookup" ? row.contact_email : null);
  const address = knownEmail ? "known" : row?.contact_lookup?.state === "done" ? "none" : "lookup_possible";
  let humanOwned = false;
  if (deps.store) for (const mail of previous) humanOwned ||= await deps.store.personAnswered(mail.id);
  const possible = canAskCompanyFrom({
    posting,
    stopped: stop.stopped,
    address,
    suppressed: knownEmail ? await isSuppressed(knownEmail) : false,
    humanOwned,
    testToRealCompany: person.isTest,
  });
  return possible ? { state: "can" } : { state: "no" };
}
