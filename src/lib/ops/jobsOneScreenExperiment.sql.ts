import { BOT_USER_AGENT_PATTERN } from "./officialJobsConversion";

/**
 * Read-only SQL behind the /ops A/B card of the job page's one screen (official_jobs_onescreen_v1): one row per
 * browser that viewed a posting in the A/B, with what that browser and the accounts linked to it did from that first
 * view until now. Plain text with numbered parameters, so the exact query can be printed and run by hand.
 *
 * $1: comma-separated company workspace ids whose role postings run the A/B (OFFICIAL_JOBS_ONESCREEN_ROLLOUT).
 * $2: period start: a browser counts only when its first view of those postings is at or after it.
 *
 * - A browser's arm is the oneScreenArm the events API stamped from its cookie on that first view. A browser seen in
 *   both arms (cookie cleared, local id kept) is left out.
 * - One person, one row: a browser the one screen opened from another (the Safari hop out of an in-app browser, or a
 *   copied link) logs its steps with fromVisitor = the first browser's id. Its events count for that first browser,
 *   and it is never a row of its own.
 * - Linking a browser to accounts follows /ops/jobs (officialJobsConversion.sql.ts): the user_id on its own /jobs rows,
 *   and landing_logs `login_email:` rows whose local_id is its id or a `lid` its login page or one-screen steps
 *   recorded (the landing id differs from the /jobs id when the visit came with a UTM). An account is new when it was
 *   created at or after the browser's first view; an older one is an existing member.
 * - pending_user_ids: signed-in ids on its rows with no talent_users row yet (the one screen creates that row only on
 *   submit, while the login page creates it at sign-in). The server reads their sign-up time from auth.users.
 * - The similar-postings request is the [gtm agent] row (gtm_agent_people method 'request') that carried one of the
 *   browser's ids as `lid`. It is read through to_jsonb so the query also runs before the request column exists.
 *   A test request is not counted, but its address still goes to emails, so a staff browser is excluded.
 * - emails: every address tied to the browser (its rows, linked accounts, login rows, requests), for the caller's
 *   exclusion rules (staff, test accounts), applied in TypeScript like the other A/B cards.
 * - Every per-browser fact is a grouped CTE joined once, so the cost grows with the rows, not with browsers squared.
 */
export const JOBS_ONESCREEN_AB_SQL = `
with ab_roles as (
  select r.role_id, r.company_workspace_id
  from public.company_roles r
  where r.company_workspace_id = any(string_to_array($1::text, ',')::uuid[])
),
ab_jobs as (
  select j.slug
  from public.official_jobs j
  join ab_roles r on r.role_id = j.role_id
),
views as (
  select e.anonymous_id, e.created_at, e.metadata->>'oneScreenArm' as arm
  from public.official_job_events e
  join ab_jobs j on j.slug = e.job_slug
  where e.event_type = 'job_detail_view'
    and e.anonymous_id is not null
    and e.metadata->>'oneScreenArm' in ('A', 'B')
    and coalesce(e.user_agent, '') !~* '${BOT_USER_AGENT_PATTERN}'
),
hops as (
  select distinct e.anonymous_id as alias, e.metadata->>'fromVisitor' as origin
  from public.official_job_events e
  join ab_jobs j on j.slug = e.job_slug
  where e.event_type = 'job_onescreen_step'
    and e.anonymous_id is not null
    and coalesce(e.metadata->>'fromVisitor', '') not in ('', e.anonymous_id)
),
browsers as (
  select v.anonymous_id, min(v.created_at) as first_at, min(v.arm) as arm
  from views v
  where not exists (select 1 from hops h where h.alias = v.anonymous_id)
  group by v.anonymous_id
  having count(distinct v.arm) = 1 and min(v.created_at) >= $2::timestamptz
),
members as (
  select b.anonymous_id, b.anonymous_id as member
  from browsers b
  union
  select h.origin, h.alias
  from hops h
  join browsers b on b.anonymous_id = h.origin
),
own as (
  select m.anonymous_id, e.event_type, e.user_id, lower(btrim(e.user_email)) as user_email,
    e.metadata->>'step' as step, e.metadata->>'lid' as lid, e.created_at >= b.first_at as after_view
  from members m
  join browsers b on b.anonymous_id = m.anonymous_id
  join public.official_job_events e on e.anonymous_id = m.member
),
keys as (
  select m.anonymous_id, m.member as key
  from members m
  union
  select o.anonymous_id, o.lid
  from own o
  where o.event_type in ('jobs_login_step', 'job_onescreen_step')
    and coalesce(o.lid, '') <> ''
),
logins as (
  select distinct k.anonymous_id, lower(btrim(split_part(ll.type, ':', 2))) as email
  from keys k
  join public.landing_logs ll on ll.local_id = k.key and ll.type like 'login_email:%'
),
signed_in as materialized (
  select distinct o.anonymous_id, o.user_id::uuid as user_id
  from own o
  where o.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
talent_emails as materialized (
  select tu.user_id, lower(btrim(tu.email)) as email, tu.created_at
  from public.talent_users tu
  where coalesce(btrim(tu.email), '') <> ''
),
links as (
  select s.anonymous_id, tu.user_id, lower(btrim(tu.email)) as email, tu.created_at as account_at
  from signed_in s
  join public.talent_users tu on tu.user_id = s.user_id
  union
  select l.anonymous_id, t.user_id, t.email, t.created_at
  from logins l
  join talent_emails t on t.email = l.email
),
accounts as (
  select l.anonymous_id, l.user_id, l.email, l.account_at >= b.first_at as is_new, b.first_at
  from links l
  join browsers b on b.anonymous_id = l.anonymous_id
),
account_facts as (
  select a.anonymous_id, bool_or(a.is_new) as signed_up, bool_or(not a.is_new) as had_account
  from accounts a
  group by a.anonymous_id
),
pending as (
  select s.anonymous_id, array_agg(distinct s.user_id::text) as user_ids
  from signed_in s
  where not exists (select 1 from public.talent_users tu where tu.user_id = s.user_id)
  group by s.anonymous_id
),
submitted as (
  select distinct a.anonymous_id
  from accounts a
  join public.talent_messages m
    on m.user_id = a.user_id and m.role = 'user' and m.message_type = 'profile_submit' and m.created_at >= a.first_at
  where a.is_new
),
intros as (
  select a.anonymous_id, bool_or(a.is_new) as intro_new
  from accounts a
  join public.agent_contact_messages c on c.talent_id = a.user_id
  join ab_roles r on r.role_id = c.role_id and r.company_workspace_id = c.company_workspace_id
  where c.direction = 'to_company' and c.id = c.root_id and c.cancelled_at is null and c.created_at >= a.first_at
  group by a.anonymous_id
),
requests as materialized (
  select p.created_at, lower(btrim(p.email)) as email, coalesce(p.is_test, false) as is_test,
    to_jsonb(p)->'request'->>'lid' as lid
  from public.gtm_agent_people p
  where p.method = 'request'
),
asked as (
  select distinct k.anonymous_id, r.email, r.is_test
  from keys k
  join requests r on r.lid = k.key
  join browsers b on b.anonymous_id = k.anonymous_id
  where r.created_at >= b.first_at
),
asked_facts as (
  select q.anonymous_id, bool_or(not q.is_test) as similar_requested
  from asked q
  group by q.anonymous_id
),
steps as (
  select o.anonymous_id,
    bool_or(o.event_type in ('job_apply_click', 'jobs_cta_click')) as talk_click,
    bool_or(o.event_type = 'job_onescreen_step'
      and o.step in ('google_click', 'safari_click', 'email_code_sent')) as card_account,
    bool_or(o.event_type = 'job_onescreen_step' and o.step = 'name_done') as card_name,
    bool_or(o.event_type = 'job_onescreen_step' and o.step = 'material_done') as card_material,
    bool_or(o.event_type = 'job_onescreen_step' and o.step = 'consent_checked') as card_consent,
    bool_or(o.event_type = 'job_onescreen_step' and o.step = 'submit_click') as card_submit_click,
    bool_or(o.event_type = 'job_onescreen_step' and o.step = 'similar_open') as similar_open
  from own o
  where o.after_view
  group by o.anonymous_id
),
emails as (
  select x.anonymous_id, array_agg(distinct x.email) as emails
  from (
    select o.anonymous_id, o.user_email as email from own o
    union all select a.anonymous_id, a.email from accounts a
    union all select l.anonymous_id, l.email from logins l
    union all select q.anonymous_id, q.email from asked q
  ) x
  where coalesce(x.email, '') <> ''
  group by x.anonymous_id
)
select b.anonymous_id, b.arm, b.first_at,
  coalesce(s.talk_click, false) as talk_click,
  coalesce(s.card_account, false) as card_account,
  coalesce(s.card_name, false) as card_name,
  coalesce(s.card_material, false) as card_material,
  coalesce(s.card_consent, false) as card_consent,
  coalesce(s.card_submit_click, false) as card_submit_click,
  coalesce(s.similar_open, false) as similar_open,
  coalesce(af.signed_up, false) as signed_up,
  coalesce(af.had_account, false) as had_account,
  sub.anonymous_id is not null as submitted,
  coalesce(i.intro_new, false) as intro_new,
  i.anonymous_id is not null as intro_any,
  coalesce(q.similar_requested, false) as similar_requested,
  coalesce(p.user_ids, '{}'::text[]) as pending_user_ids,
  coalesce(em.emails, '{}'::text[]) as emails
from browsers b
left join steps s on s.anonymous_id = b.anonymous_id
left join account_facts af on af.anonymous_id = b.anonymous_id
left join submitted sub on sub.anonymous_id = b.anonymous_id
left join intros i on i.anonymous_id = b.anonymous_id
left join asked_facts q on q.anonymous_id = b.anonymous_id
left join pending p on p.anonymous_id = b.anonymous_id
left join emails em on em.anonymous_id = b.anonymous_id
order by b.first_at
`;

/**
 * $1: signed-in ids with no talent_users row yet (pending_user_ids above). When each was created, so a sign-up on
 * the one screen that never got to submit still counts as one. Read apart from the main query: if this connection
 * cannot read auth.users, the card still loads and only these few sign-ups are missing.
 */
export const JOBS_ONESCREEN_PENDING_ACCOUNTS_SQL = `
select u.id::text as user_id, u.created_at, lower(btrim(u.email)) as email
from auth.users u
where u.id = any($1::uuid[])
`;

/**
 * $1: the same workspace ids. The company name the card's title shows, read here so the public code never names a
 * customer: the published, LinkedIn-listed posting's name (the most common one if several).
 */
export const JOBS_ONESCREEN_COMPANY_SQL = `
select j.company_name
from public.official_jobs j
join public.company_roles r on r.role_id = j.role_id
where r.company_workspace_id = any(string_to_array($1::text, ',')::uuid[])
  and j.is_published is true
  and coalesce(btrim(j.company_name), '') <> ''
group by j.company_name
order by bool_or(coalesce(j.is_on_linkedin, false)) desc, count(*) desc, j.company_name
limit 1
`;
