import { BOT_USER_AGENT_PATTERN } from "./officialJobsConversion";

/**
 * Read-only SQL behind the /ops/jobs conversion numbers. Plain strings with numbered parameters, so the
 * exact text the server runs can also be printed and run by hand against production to check it.
 *
 * Linking a browser to an account (same rule in both queries):
 * - same browser: the user_id the events API stamps on that browser's /jobs rows once it is signed in
 * - any browser: a landing_logs `login_email:<email>:*` row whose local_id is that browser's /jobs id.
 *   The login link carries the id as `lid`, so a signup finished in Safari or Chrome after leaving an
 *   in-app browser still points back to the browser that clicked. When the link carried another id
 *   (an active UTM visit keeps its own landing id), the login page's step rows record that `lid` next to
 *   the /jobs id, and it is used as an alias.
 * An account counts as new when talent_users.created_at is at or after the browser's first click (or,
 * per job, first view or click); an older account is an existing member. Crawler rows (Googlebot,
 * AhrefsBot, HeadlessChrome...) are left out everywhere.
 */

const notBot = (userAgent: string) =>
  `coalesce(${userAgent}, '') !~* '${BOT_USER_AGENT_PATTERN}'`;

/** $2: comma-separated excluded entries, each a full address or "@domain" (isEmailExcluded rules). */
const excluded = (email: string) =>
  `(lower(btrim(${email})) = any(string_to_array($2::text, ',')) or ` +
  `'@' || split_part(lower(btrim(${email})), '@', 2) = any(string_to_array($2::text, ',')))`;

export function excludedEmailParam(entries: Iterable<string>) {
  return Array.from(entries, (entry) => entry.trim().toLowerCase())
    .filter((entry) => entry && !entry.includes(","))
    .join(",");
}

/**
 * $1: period start (timestamptz), $2: excluded entries. One row per audience, in panel order. Every
 * count is of browsers, so a row adds up: clickers = signed up + existing members + no account found.
 * - visitors: distinct browsers (else user, else email) that opened /jobs or a job page
 * - clickers: distinct browsers that pressed Talk to Harper (job page or list), audience from their user agent
 * - new_signups: clickers linked to an account created at or after their first click in the period
 * - existing_members: clickers linked only to older accounts (signed in already, or signed in after clicking)
 * - steps (LinkedIn rows, since the login page began logging them): clickers with any step row, split by the
 *   way they went on from the in-app login page (pressed "브라우저에서 열기", pressed "로그인 링크 복사",
 *   reached Safari/Chrome without either button, submitted the email form inside the app, none of these);
 *   for each way, how many reached the login page in another browser with their id and how many signed up
 * Internal emails and every browser that ever signed in with one are left out.
 */
export const JOBS_CONVERSION_SQL = `
with ev as (
  select e.anonymous_id, e.event_type, e.created_at, e.user_agent, e.user_id, e.user_email, e.metadata
  from public.official_job_events e
  where e.created_at >= $1::timestamptz
    and e.event_type in ('jobs_list_view', 'job_detail_view', 'job_apply_click', 'jobs_cta_click', 'jobs_login_step')
    and ${notBot("e.user_agent")}
),
logins as (
  select ll.local_id, lower(btrim(split_part(ll.type, ':', 2))) as email
  from public.landing_logs ll
  where ll.type like 'login_email:%' and ll.local_id is not null
),
excluded_browsers as (
  select ev.anonymous_id
  from ev
  where ev.anonymous_id is not null and ${excluded("ev.user_email")}
  union
  select l.local_id
  from logins l
  where ${excluded("l.email")}
    and exists (select 1 from ev where ev.anonymous_id = l.local_id)
),
visitors as (
  select count(distinct coalesce(
    'anonymous:' || ev.anonymous_id,
    'user:' || ev.user_id,
    'email:' || lower(btrim(ev.user_email))
  )) as n
  from ev
  where ev.event_type in ('jobs_list_view', 'job_detail_view')
    and not coalesce(${excluded("ev.user_email")}, false)
    and not exists (select 1 from excluded_browsers x where x.anonymous_id = ev.anonymous_id)
),
clickers as (
  select ev.anonymous_id,
    min(ev.created_at) as first_click,
    case
      when bool_or(coalesce(ev.user_agent, '') ~* 'linkedinapp') then
        case when bool_or(coalesce(ev.user_agent, '') ~* 'android') then 'linkedin_android' else 'linkedin_ios' end
      when bool_or(coalesce(ev.user_agent, '') ~* 'android|iphone|ipad|ipod|mobile') then 'mobile_other'
      else 'desktop'
    end as audience
  from ev
  where ev.event_type in ('job_apply_click', 'jobs_cta_click')
    and ev.anonymous_id is not null
    and not exists (select 1 from excluded_browsers x where x.anonymous_id = ev.anonymous_id)
  group by ev.anonymous_id
),
keys as (
  select c.anonymous_id, c.anonymous_id as key
  from clickers c
  union
  select s.anonymous_id, s.metadata->>'lid'
  from ev s
  join clickers c on c.anonymous_id = s.anonymous_id
  where s.event_type = 'jobs_login_step'
    and coalesce(s.metadata->>'lid', '') not in ('', s.anonymous_id)
),
links as (
  select c.anonymous_id, tu.user_id, tu.email, tu.created_at as account_at
  from clickers c
  join (
    select distinct ev.anonymous_id, ev.user_id
    from ev
    where ev.anonymous_id is not null and ev.user_id is not null
  ) u on u.anonymous_id = c.anonymous_id
  join public.talent_users tu on tu.user_id::text = u.user_id
  union
  select k.anonymous_id, tu.user_id, tu.email, tu.created_at
  from keys k
  join logins l on l.local_id = k.key
  join public.talent_users tu on lower(btrim(tu.email)) = l.email
),
outcomes as (
  select l.anonymous_id,
    bool_or(l.account_at >= c.first_click) as signed_up,
    bool_or(l.account_at < c.first_click) as had_account
  from links l
  join clickers c on c.anonymous_id = l.anonymous_id
  where not coalesce(${excluded("l.email")}, false)
  group by l.anonymous_id
),
step_rows as (
  -- Two equality joins instead of one OR so both can hash: rows from the clicking browser itself, and
  -- rows that carry its id as lid (the browser it moved to, or the same one after an id change).
  select c.anonymous_id, s.anonymous_id as row_anonymous_id, s.user_agent,
    s.metadata->>'step' as step, false as via_lid
  from clickers c
  join ev s on s.event_type = 'jobs_login_step'
    and s.anonymous_id = c.anonymous_id
    and s.created_at >= c.first_click
  where c.audience in ('linkedin_ios', 'linkedin_android')
  union all
  select c.anonymous_id, s.anonymous_id, s.user_agent, s.metadata->>'step', true
  from clickers c
  join keys k on k.anonymous_id = c.anonymous_id
  join ev s on s.event_type = 'jobs_login_step'
    and s.metadata->>'lid' = k.key
    and s.created_at >= c.first_click
  where c.audience in ('linkedin_ios', 'linkedin_android')
),
steps as (
  select r.anonymous_id,
    coalesce(bool_or(
      coalesce(r.user_agent, '') ~* 'linkedinapp' and r.step = 'open_browser_click'
    ), false) as opened_browser,
    coalesce(bool_or(
      coalesce(r.user_agent, '') ~* 'linkedinapp' and r.step = 'copy_link'
    ), false) as copied_link,
    coalesce(bool_or(
      coalesce(r.user_agent, '') ~* 'linkedinapp' and r.step = 'email_submit'
    ), false) as typed_email,
    coalesce(bool_or(
      r.via_lid
      and r.step = 'view'
      and r.row_anonymous_id is distinct from r.anonymous_id
      and coalesce(r.user_agent, '') !~* 'linkedinapp'
    ), false) as arrived_outside
  from step_rows r
  group by r.anonymous_id
),
-- One line per way on from the in-app login page, each with how many of those people reached the login
-- page in Safari/Chrome and how many got a new account. A person who used two ways counts on both lines.
step_stats as (
  select c.audience,
    count(*) as step_eligible,
    count(*) filter (where s.arrived_outside) as arrived_outside,
    count(*) filter (where s.opened_browser) as opened_browser,
    count(*) filter (where s.opened_browser and s.arrived_outside) as opened_browser_arrived,
    count(*) filter (where s.opened_browser and coalesce(o.signed_up, false)) as opened_browser_signed_up,
    count(*) filter (where s.copied_link) as copied_link,
    count(*) filter (where s.copied_link and s.arrived_outside) as copied_link_arrived,
    count(*) filter (where s.copied_link and coalesce(o.signed_up, false)) as copied_link_signed_up,
    count(*) filter (where s.arrived_outside and not s.opened_browser and not s.copied_link) as arrived_otherwise,
    count(*) filter (where s.arrived_outside and not s.opened_browser and not s.copied_link
      and coalesce(o.signed_up, false)) as arrived_otherwise_signed_up,
    count(*) filter (where s.typed_email) as typed_email,
    count(*) filter (where s.typed_email and coalesce(o.signed_up, false)) as typed_email_signed_up,
    count(*) filter (where not (s.opened_browser or s.copied_link or s.typed_email or s.arrived_outside)) as no_action,
    count(*) filter (where not (s.opened_browser or s.copied_link or s.typed_email or s.arrived_outside)
      and coalesce(o.signed_up, false)) as no_action_signed_up
  from steps s
  join clickers c on c.anonymous_id = s.anonymous_id
  left join outcomes o on o.anonymous_id = s.anonymous_id
  group by c.audience
)
select a.audience,
  (select n from visitors)::int as visitors,
  (select count(*) from clickers c where c.audience = a.audience)::int as clickers,
  (select count(*) from outcomes o join clickers c on c.anonymous_id = o.anonymous_id
    where c.audience = a.audience and o.signed_up)::int as new_signups,
  (select count(*) from outcomes o join clickers c on c.anonymous_id = o.anonymous_id
    where c.audience = a.audience and o.had_account and not o.signed_up)::int as existing_members,
  coalesce(ss.step_eligible, 0)::int as step_eligible,
  coalesce(ss.arrived_outside, 0)::int as arrived_outside,
  coalesce(ss.opened_browser, 0)::int as opened_browser,
  coalesce(ss.opened_browser_arrived, 0)::int as opened_browser_arrived,
  coalesce(ss.opened_browser_signed_up, 0)::int as opened_browser_signed_up,
  coalesce(ss.copied_link, 0)::int as copied_link,
  coalesce(ss.copied_link_arrived, 0)::int as copied_link_arrived,
  coalesce(ss.copied_link_signed_up, 0)::int as copied_link_signed_up,
  coalesce(ss.arrived_otherwise, 0)::int as arrived_otherwise,
  coalesce(ss.arrived_otherwise_signed_up, 0)::int as arrived_otherwise_signed_up,
  coalesce(ss.typed_email, 0)::int as typed_email,
  coalesce(ss.typed_email_signed_up, 0)::int as typed_email_signed_up,
  coalesce(ss.no_action, 0)::int as no_action,
  coalesce(ss.no_action_signed_up, 0)::int as no_action_signed_up
from (values (1, 'linkedin_ios'), (2, 'linkedin_android'), (3, 'mobile_other'), (4, 'desktop')) as a(ord, audience)
left join step_stats ss on ss.audience = a.audience
order by a.ord
`;

/**
 * $1: official job id, $2: excluded entries. Distinct accounts created at or after a linked browser's
 * first view of, or Talk to Harper click on, this job (all time). The user_id branch is the per-job count
 * Ops showed before; the login-row branch adds people who finished signing up in another browser. Click
 * ids count too: in the LinkedIn iOS app the id can change between viewing a job and pressing the button.
 * An account that saw several jobs counts once on each of them. Internal emails and every browser that
 * ever signed in with one are left out, as in the panel.
 */
export const OFFICIAL_JOB_SIGNUPS_SQL = `
with seen_rows as (
  select e.anonymous_id, e.user_id, e.user_email, e.created_at
  from public.official_job_events e
  where e.official_job_id = $1::uuid
    and e.event_type in ('job_detail_view', 'job_apply_click')
    and ${notBot("e.user_agent")}
),
excluded_browsers as (
  select e.anonymous_id
  from public.official_job_events e
  where e.anonymous_id in (select r.anonymous_id from seen_rows r)
    and ${excluded("e.user_email")}
  union
  select ll.local_id
  from public.landing_logs ll
  where ll.type like 'login_email:%'
    and ll.local_id in (select r.anonymous_id from seen_rows r)
    and ${excluded("split_part(ll.type, ':', 2)")}
),
seen as (
  select r.anonymous_id, r.user_id, r.created_at
  from seen_rows r
  where not coalesce(${excluded("r.user_email")}, false)
    and not exists (select 1 from excluded_browsers x where x.anonymous_id = r.anonymous_id)
),
browser_first as (
  select v.anonymous_id, min(v.created_at) as first_seen
  from seen v
  where v.anonymous_id is not null
  group by v.anonymous_id
),
user_first as (
  select v.user_id, min(v.created_at) as first_seen
  from seen v
  where v.user_id is not null
  group by v.user_id
),
keys as (
  select b.anonymous_id, b.anonymous_id as key
  from browser_first b
  union
  select s.anonymous_id, s.metadata->>'lid'
  from public.official_job_events s
  join browser_first b on b.anonymous_id = s.anonymous_id
  where s.event_type = 'jobs_login_step'
    and coalesce(s.metadata->>'lid', '') not in ('', s.anonymous_id)
),
linked as (
  select tu.user_id, tu.email, tu.created_at as account_at, u.first_seen
  from user_first u
  join public.talent_users tu on tu.user_id::text = u.user_id
  union all
  select tu.user_id, tu.email, tu.created_at, b.first_seen
  from keys k
  join browser_first b on b.anonymous_id = k.anonymous_id
  join public.landing_logs ll on ll.local_id = k.key and ll.type like 'login_email:%'
  join public.talent_users tu on lower(btrim(tu.email)) = lower(btrim(split_part(ll.type, ':', 2)))
)
select count(distinct l.user_id)::int as signups
from linked l
where l.account_at >= l.first_seen
  and not coalesce(${excluded("l.email")}, false)
`;
