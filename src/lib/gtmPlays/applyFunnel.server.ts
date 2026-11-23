import "server-only";

import { DEFAULT_ADMIN_EXCLUDED_EMAILS } from "@/lib/adminEmailExclusions";
import { HARPER_WORKSPACE_ID } from "./constants";
import { gtmRead, type GtmReadSql } from "./db.server";

/**
 * #1 후보자 링크 (/ops/gtm-plays tab 1): the applications Harper sent for candidates, per company, and what the
 * companies did with the candidate summary links in them. Nothing here writes.
 */

const PERSONAL_DOMAINS = [
  "gmail.com", "googlemail.com", "naver.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "daum.net",
  "icloud.com", "me.com", "kakao.com", "hanmail.net", "nate.com", "proton.me", "protonmail.com",
];

/** Hosts many companies' homepage_url point at: never a company's own mail domain. */
const SHARED_HOSTS = [
  "linkedin.com", "notion.site", "notion.so", "github.io", "github.com", "google.com", "medium.com", "wixsite.com",
  "wix.com", "webflow.io", "framer.website", "framer.ai", "instagram.com", "facebook.com", "twitter.com", "x.com",
  "youtube.com", "naver.com", "tistory.com", "brunch.co.kr", "wanted.co.kr", "rocketpunch.com", "greenhouse.io",
  "lever.co", "ashbyhq.com", "workable.com", "bit.ly", "linktr.ee", "vercel.app", "netlify.app", "oopy.io",
  "imweb.me", "cafe24.com", "sites.google.com", "blogspot.com", "substack.com",
];

/** Harper staff and test accounts, as /ops/jobs leaves them out (DEFAULT_ADMIN_EXCLUDED_EMAILS). */
const EXCLUDED_EMAILS = [...DEFAULT_ADMIN_EXCLUDED_EMAILS];

function staffCte(sql: GtmReadSql) {
  return sql`
    staff as (
      select user_id from public.talent_users
      where email is not null and (lower(btrim(email)) = any(${EXCLUDED_EMAILS}::text[])
        or '@' || split_part(lower(btrim(email)), '@', 2) = any(${EXCLUDED_EMAILS}::text[]))
    )`;
}

/**
 * A browser run Harper ran with the candidate's approval to submit. Many such runs stop before the last step (a
 * required field, a verification code), so a run alone is an attempt. Runs record their mode since 11/18; earlier
 * execute runs are the ones a work_effect points to. A run that stopped before submitting releases its effect for the
 * retry, so the recorded mode is what keeps it counted as an attempt.
 */
const EXECUTE_MODE = (sql: GtmReadSql) => sql`(o.request->>'mode' = 'execute' or exists (select 1 from public.talent_external_operations effect
  where effect.kind = 'work_effect' and effect.result->>'operation_id' = o.id::text))`;

// Whether a run really submitted: the run's receipt field (result.submitted yes/no/unclear) when it has one. Runs from
// before that field report only in prose, and their first sentence states the outcome ("Submitted once." / "Stopped
// before submission."). These read that sentence.
const SUBMITTED_SENTENCE = String.raw`(^\s*(application )?submitted\M|submitted [^.]{0,160}\monce\M|successfully submitted|submitted successfully|was submitted|has been submitted|application submitted|application (has been|was) (received|accepted)|confirmed (the )?(successful )?submission|submission confirmation|application-submitted|thank you for (applying|your application)|successfully applied|제출(했|완료|되었|됐)|지원(이|을)? ?완료)`;
const NOT_SUBMITTED_SENTENCE = String.raw`(not (yet )?submitted|unsubmitted|without submitting|before (submission|submitting)|no application|nothing was submitted|did not submit|didn't submit|was not submitted|already (been )?submitted|no new application|rejected|no longer accepting|not accepting|could not submit|unable to submit|failed to submit|submission failed|no (prior )?(submission )?confirmation|제출하지|제출 전|제출 안|제출되지)`;

// ---------------------------------------------------------------------------------------------------------
// #1 대신 지원: applications Harper sent for candidates, one row per application.
// - 회사 사이트로: one candidate and one posting is one application, counted when it was really submitted: a run
//   Harper ran to submit (execute mode) whose report says the site confirmed the submission, or the candidate's
//   opportunity reached 연결·오퍼 (the company answered). 지원함 alone does not count: the candidate's own
//   '직접 지원했어요' and Harper's record from a conversation also set it (the actor is on the stage activity).
//   Runs that stopped before the last step are attempts only; the row keeps how many there were.
// - 회사 메일로: an application mail, a Gmail send through Harper to a company address with at least one document
//   attached or with the candidate's 후보자 링크 in its body (the link box goes only into application mails, attachment
//   or not; inquiries and follow-ups have neither). It counts for the company whose homepage is on that mail domain (or a subdomain of it; hosts many
//   companies share, like linkedin.com or notion.site, never match), a Harper customer first, then the exact
//   domain. A domain no company on Harper has is still a company: it gets its own row, keyed by the domain
//   ('mail:<domain>'), unless the mail's 후보자 링크 points at a company: the workspace that signed up from the
//   link, else the one workspace on Harper with the link's company name (a company added from its postings often
//   has no homepage, so its mail domain cannot find it). Then it is that company's row, with its site applications. Personal mail domains never count. One mail counts for one company only.
// Harper staff and test accounts are left out, as on /ops/jobs.
// ---------------------------------------------------------------------------------------------------------

function applicationsCte(sql: GtmReadSql, days: number) {
  return sql`
    ${staffCte(sql)},
    -- Applications and 후보자 링크 count over one window: the period, but never before the first link (applications
    -- sent before the feature have no link, so counting them would set the two column groups on different bases).
    counted_since as (
      select greatest(now() - make_interval(days => ${days}::int),
        coalesce((select min(created_at) from public.talent_share_links), now() - make_interval(days => ${days}::int))) as at
    ),
    site_runs as (
      select distinct on (o.id) o.id as op_id, o.user_id as talent_id, cr.company_workspace_id as cw, cr.role_id,
        o.created_at as at, cr.name as role_name, left(o.result->>'summary', 400) as summary,
        case when lower(o.result->>'submitted') in ('yes', 'no', 'unclear') then lower(o.result->>'submitted') = 'yes'
          else (lead.sentence ~* ${SUBMITTED_SENTENCE} and lead.sentence !~* ${NOT_SUBMITTED_SENTENCE}) end as reports_submitted
      from public.talent_external_operations o
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(o.request->'role_refs') = 'array'
        then o.request->'role_refs' else '[]'::jsonb end) ref(role_id)
      join public.company_roles cr on ref.role_id ~* '^[0-9a-f-]{36}$' and cr.role_id = ref.role_id::uuid
      cross join lateral (select substring(coalesce(o.result->>'summary', '') from '^[^.!?。]*[.!?。]?') as sentence) lead
      where o.kind = 'browser_run' and o.status = 'completed' and ${EXECUTE_MODE(sql)}
        and o.created_at >= (select at from counted_since)
        and o.user_id not in (select user_id from staff)
      order by o.id, cr.company_workspace_id
    ),
    site_apps as (
      select distinct on (r.talent_id, r.role_id) r.op_id, r.talent_id, r.cw, null::text as mail_domain, 'site'::text as via, r.at, r.role_name,
        r.summary, (count(*) over (partition by r.talent_id, r.role_id))::int as attempts
      from site_runs r
      where exists (select 1 from site_runs s where s.talent_id = r.talent_id and s.role_id = r.role_id and s.reports_submitted)
        or exists (select 1 from public.talent_opportunity_recommendation t
          where t.talent_id = r.talent_id and t.role_id = r.role_id and t.saved_stage in ('connected', 'offer'))
      -- The run that submitted stands for the application (its time and report), else the latest attempt.
      order by r.talent_id, r.role_id, r.reports_submitted desc, r.at desc
    ),
    ws_domains as (
      select cw, is_internal, host from (
        select w.company_workspace_id as cw, coalesce(w.is_internal, false) as is_internal,
          regexp_replace(regexp_replace(regexp_replace(lower(btrim(w.homepage_url)),
            '^[a-z][a-z0-9+.-]*://', ''), '^www\\.', ''), '[/:?#].*$', '') as host
        from public.company_workspace w
        where w.homepage_url is not null and btrim(w.homepage_url) <> ''
      ) hosts
      where host like '%.%' and host <> all(${SHARED_HOSTS}::text[])
        and not exists (select 1 from unnest(${SHARED_HOSTS}::text[]) shared(domain)
          where right(hosts.host, length(shared.domain) + 1) = '.' || shared.domain)
    ),
    mail_rcpts as (
      select o.id as op_id, o.user_id as talent_id, o.created_at as at, left(o.request->'snapshot'->>'subject', 400) as subject,
        split_part(lower(substring(rcpt.addr from '[^<>[:space:]@]+@[^<>[:space:]@]+')), '@', 2) as domain,
        ml.company_name as link_company, ml.claimed_workspace_id as link_cw
      from public.talent_external_operations o
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(o.request->'snapshot'->'to') = 'array'
        then o.request->'snapshot'->'to' else '[]'::jsonb end) rcpt(addr)
      -- The 후보자 링크 in the sent body, if any.
      left join lateral (
        select l.company_name, l.claimed_workspace_id from public.talent_share_links l
        where l.talent_id = o.user_id and strpos(coalesce(o.request->'snapshot'->>'body', ''), '/c/' || l.token) > 0
        order by l.created_at limit 1
      ) ml on true
      where o.kind = 'email_send' and o.status = 'succeeded'
        and ((jsonb_typeof(o.request->'snapshot'->'documents') = 'array'
            and jsonb_array_length(o.request->'snapshot'->'documents') > 0)
          or ml.company_name is not null)
        and o.created_at >= (select at from counted_since)
        and o.user_id not in (select user_id from staff)
    ),
    ws_names as (
      -- The workspace named as the link's company, when exactly one workspace has that name.
      select lower(btrim(w.company_name)) as name_key, (array_agg(w.company_workspace_id))[1] as cw
      from public.company_workspace w
      where lower(btrim(w.company_name)) in (
        select lower(btrim(link_company)) from mail_rcpts where nullif(btrim(link_company), '') is not null)
      group by 1 having count(*) = 1
    ),
    mail_apps as (
      select distinct on (m.op_id) m.op_id, m.talent_id, coalesce(d.cw, m.link_cw, n.cw) as cw, m.domain as mail_domain, 'mail'::text as via, m.at,
        null::text as role_name, m.subject as summary, 1 as attempts
      from mail_rcpts m
      left join ws_domains d on d.host = m.domain or right(d.host, length(m.domain) + 1) = '.' || m.domain
      left join ws_names n on d.cw is null and m.link_cw is null and n.name_key = lower(btrim(m.link_company))
      where m.domain <> '' and m.domain <> all(${PERSONAL_DOMAINS}::text[])
      -- A recipient on a known company's domain wins over one on an unknown domain; then the link's company.
      order by m.op_id, (d.cw is null), (coalesce(m.link_cw, n.cw) is null), d.is_internal desc, (d.host = m.domain) desc, d.cw
    ),
    apps as (
      -- ck: the row's company: a company_workspace id, or 'mail:<domain>' for a mail domain no company on Harper has.
      select op_id, talent_id, cw, cw::text as ck, via, at, role_name, summary, attempts from site_apps
      union all
      select op_id, talent_id, cw, coalesce(cw::text, 'mail:' || mail_domain) as ck, via, at, role_name, summary, attempts
      from mail_apps
    )
  `;
}

export type ApplyFunnelRow = {
  /** The row's key: the company's workspace id, or 'mail:<domain>' when no company on Harper has that mail domain. */
  key: string;
  /** null for a mail domain no company on Harper has. */
  workspaceId: string | null;
  /** The company's name; for an unknown mail domain, the name the 후보자 링크 recorded, else the domain. */
  companyName: string;
  /** Set for an unknown mail domain (the row has no company on Harper). */
  mailDomain: string | null;
  isCustomer: boolean;
  /** Distinct people Harper applied for at this company, either way. */
  people: number;
  /** Applications Harper submitted on the company's site (one per candidate and posting, really submitted). */
  siteApplications: number;
  /** Application mails Harper sent from the candidate's Gmail to the company's mail domain (a document attached or the
   * 후보자 링크 in the body). */
  mailApplications: number;
  lastAt: string | null;
  /** 후보자 링크: of those applications, the ones with the candidate's summary link, and what the company did. */
  links: ApplyFunnelLinks;
};

/**
 * Counted per link, not per application: one link is one candidate, company and posting, and an application sent again
 * for the same posting reuses it, so opened / pressed / claimed (one time per link) never outnumber sent.
 */
export type ApplyFunnelLinks = {
  /** Links that went out in a counted application (the candidate checked 'Harper 후보 요약 링크 넣기'). */
  sent: number;
  /** Of those, links the company opened (on screen for a second; Harper staff and the candidate themselves not counted). */
  opened: number;
  /** Links where the company pressed a question, 일정 잡기 or 후보 더 검토하기 (asked to sign up). */
  pressed: number;
  /** Links the company signed up or in from and got the candidate on a Role. */
  claimed: number;
};

const NO_LINKS: ApplyFunnelLinks = { sent: 0, opened: 0, pressed: 0, claimed: 0 };

/**
 * Per company, the counted applications that carried a 후보자 링크 (the link's token is in the sent mail body, or in
 * the report of the browser run that submitted the site application) and
 * what the company did with each link, and the start of the window every column counts from (the period's start, or the
 * first link when that is later). Empty before 20261116090000_talent_share_links is applied.
 */
async function readApplyFunnelLinks(days: number): Promise<{
  byCompany: Map<string, ApplyFunnelLinks>;
  /** For 'mail:<domain>' rows: the company name the link recorded. */
  names: Map<string, string>;
  /** Where the counted window starts (null: no link yet). */
  since: string | null;
}> {
  try {
    const [rows, first] = await gtmRead((sql) => Promise.all([sql<Array<{
      ck: string; sent: number; opened: number; pressed: number; claimed: number; company_name: string | null;
    }>>`
      with ${applicationsCte(sql, days)},
      linked as (
        select distinct on (l.id) a.ck, l.company_name, l.first_opened_at, l.cta_at, l.claimed_at
        from apps a
        join public.talent_external_operations o on o.id = a.op_id
        -- Mail: the link is in the sent body. Site: the run that stands for the application answered profileLink
        -- 'added' (its structured result; a form with no place for the link answers 'left_out'), for the link it
        -- was given (made for that run, or quoted in its report when a retry reused an earlier one).
        join public.talent_share_links l on l.talent_id = a.talent_id
          and case when a.via = 'mail'
            then strpos(coalesce(o.request->'snapshot'->>'body', ''), '/c/' || l.token) > 0
            else lower(coalesce(o.result->>'profileLink', '')) = 'added'
              and (l.operation_id = o.id or strpos(coalesce(o.result::text, ''), '/c/' || l.token) > 0)
            end
        order by l.id, a.at
      )
      select ck, count(*)::int as sent,
        count(*) filter (where first_opened_at is not null)::int as opened,
        count(*) filter (where cta_at is not null)::int as pressed,
        count(*) filter (where claimed_at is not null)::int as claimed,
        max(nullif(btrim(company_name), '')) as company_name
      from linked group by ck
    `, sql<Array<{ at: string | Date | null }>>`
      select case when min(created_at) is null then null
        else greatest(now() - make_interval(days => ${days}::int), min(created_at)) end as at
      from public.talent_share_links
    `]));
    return {
      byCompany: new Map(rows.map((row) => [row.ck, {
        sent: Number(row.sent), opened: Number(row.opened), pressed: Number(row.pressed), claimed: Number(row.claimed),
      }])),
      names: new Map(rows.flatMap((row) => row.ck.startsWith("mail:") && row.company_name ? [[row.ck, row.company_name] as const] : [])),
      since: first[0]?.at ? new Date(first[0].at).toISOString() : null,
    };
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return { byCompany: new Map(), names: new Map(), since: null };
    throw error;
  }
}

/**
 * #1: how many applications Harper sent per company, and for the application mails that carried the candidate's
 * summary link (mail or site), whether the company opened it, pressed a button and signed up.
 */
export async function listApplyFunnel(args: { days: number; limit?: number }): Promise<{
  companies: ApplyFunnelRow[];
  /** Where every column starts counting: the period's start, or the first 후보자 링크 when later (null: no link yet). */
  linksSince: string | null;
}> {
  const days = Math.min(Math.max(Math.trunc(args.days) || 30, 1), 365);
  const limit = Math.min(Math.max(args.limit ?? 200, 1), 1_000);
  const [rows, links] = await Promise.all([gtmRead((sql) => sql<Array<{
    ck: string; workspace_id: string | null; company_name: string | null; is_customer: boolean; people: number;
    site_apps: number; mail_apps: number; last_at: string | Date | null;
  }>>`
    with ${applicationsCte(sql, days)},
    per as (
      select ck, (array_agg(cw) filter (where cw is not null))[1] as cw,
        count(distinct talent_id)::int as people,
        count(*) filter (where via = 'site')::int as site_apps,
        count(*) filter (where via = 'mail')::int as mail_apps,
        max(at) as last_at
      from apps group by ck
    )
    select per.ck, per.cw::text as workspace_id, w.company_name, per.people, per.site_apps, per.mail_apps, per.last_at,
      (w.is_internal is true) as is_customer
    from per left join public.company_workspace w on w.company_workspace_id = per.cw
    where per.cw is null or per.cw <> ${HARPER_WORKSPACE_ID}::uuid
  `), readApplyFunnelLinks(days)]);
  const companies = rows.map((row): ApplyFunnelRow => {
    const mailDomain = row.workspace_id ? null : row.ck.slice("mail:".length);
    return {
      key: row.ck, workspaceId: row.workspace_id, mailDomain,
      companyName: row.company_name ?? links.names.get(row.ck) ?? mailDomain ?? row.ck,
      isCustomer: Boolean(row.is_customer),
      people: Number(row.people), siteApplications: Number(row.site_apps), mailApplications: Number(row.mail_apps),
      lastAt: row.last_at ? new Date(row.last_at).toISOString() : null,
      links: links.byCompany.get(row.ck) ?? NO_LINKS,
    };
  });
  // Most links sent first, then most applications, then the latest.
  companies.sort((a, b) => b.links.sent - a.links.sent
    || (b.siteApplications + b.mailApplications) - (a.siteApplications + a.mailApplications)
    || (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  return { companies: companies.slice(0, limit), linksSince: links.since };
}

export type ApplicationRow = {
  talentId: string;
  talentName: string | null;
  roleName: string | null;
  via: "web" | "email";
  at: string;
  /** The run's summary (site) or the mail subject. */
  summary: string | null;
  /** Site: how many runs Harper made for this candidate and posting (stopped ones included); mail: 1. */
  attempts: number;
};

export const APPLICATIONS_SHOWN = 100;

/** The applications behind one company's #1 row (its key), one per application (internal view: names are for staff). */
export async function listCompanyApplications(args: { key: string; days: number }) {
  const days = Math.min(Math.max(Math.trunc(args.days) || 30, 1), 365);
  const rows = await gtmRead((sql) => sql<Array<{
    talent_id: string; name: string | null; role_name: string | null; via: "site" | "mail"; at: string | Date;
    summary: string | null; attempts: number; total: number;
  }>>`
    with ${applicationsCte(sql, days)}
    select a.talent_id::text as talent_id, t.name, a.role_name, a.via, a.at, a.summary, a.attempts, count(*) over ()::int as total
    from apps a
    left join public.talent_users t on t.user_id = a.talent_id
    where a.ck = ${args.key}
    order by a.at desc
    limit ${APPLICATIONS_SHOWN}::int
  `);
  return {
    total: Number(rows[0]?.total ?? 0),
    applications: rows.map((row): ApplicationRow => ({
      talentId: row.talent_id, talentName: row.name, roleName: row.role_name, via: row.via === "site" ? "web" : "email",
      at: new Date(row.at).toISOString(), summary: row.summary, attempts: Number(row.attempts) || 1,
    })),
  };
}

export type CandidatePagePreview = {
  name: string | null;
  headline: string | null;
  location: string | null;
  experiences: Array<{ role: string | null; company: string | null; start: string | null; end: string | null }>;
  educations: Array<{ school: string | null; degree: string | null; field: string | null }>;
};

/** The candidate behind an application (internal view). */
export async function loadCandidatePagePreview(talentId: string): Promise<CandidatePagePreview> {
  return gtmRead(async (sql) => {
    const [person] = await sql<Array<{ name: string | null; headline: string | null; location: string | null }>>`
      select name, headline, coalesce(current_location, location) as location
      from public.talent_users where user_id = ${talentId}::uuid and deleted_at is null
    `;
    if (!person) throw new Error("후보를 찾지 못했어요.");
    const [experiences, educations] = await Promise.all([
      sql<Array<{ role: string | null; company_name: string | null; start_date: string | null; end_date: string | null }>>`
        select role, company_name, start_date::text, end_date::text from public.talent_experiences
        where talent_id = ${talentId}::uuid order by end_date desc nulls first, start_date desc nulls last limit 6
      `,
      sql<Array<{ school: string | null; degree: string | null; field: string | null }>>`
        select school, degree, field from public.talent_educations
        where talent_id = ${talentId}::uuid order by end_date desc nulls first limit 3
      `,
    ]);
    return {
      name: person.name, headline: person.headline, location: person.location,
      experiences: experiences.map((row) => ({ role: row.role, company: row.company_name, start: row.start_date, end: row.end_date })),
      educations: educations.map((row) => ({ school: row.school, degree: row.degree, field: row.field })),
    };
  });
}

