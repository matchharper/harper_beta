// Read-only SQL behind the top of /ops/metrics (연결·가입·퍼널·대신 지원·연결 대기).
// Shared parameters: $1 from (KST date), $2 to (KST date), $3 interval (day|week|month), $4 excluded email terms,
// $5 / $6 the sentences that open a browser run's report when it did / did not submit (SUBMITTED_SENTENCE / NOT_SUBMITTED_SENTENCE in talentMetricsOverview.server.ts).
// The period, people and test-only Role rules match get_ops_talent_metrics_*_v1.

const PERIOD_CTES = String.raw`
params as (
  select
    $1::date::timestamp at time zone 'Asia/Seoul' as start_at,
    greatest(
      $1::date::timestamp at time zone 'Asia/Seoul',
      least(($2::date + 1)::timestamp at time zone 'Asia/Seoul', now())
    ) as end_at,
    ($1::date::timestamp at time zone 'Asia/Seoul')
      - (($2::date + 1)::timestamp at time zone 'Asia/Seoul' - $1::date::timestamp at time zone 'Asia/Seoul')
      as comparison_start_at,
    -- 퍼널: the last 7 finished KST days of the period (today is still running).
    least(
      date_trunc('day', now() at time zone 'Asia/Seoul'),
      ($2::date + 1)::timestamp
    ) at time zone 'Asia/Seoul' as funnel_end_at,
    $3::text as unit
),
included_users as materialized (
  select users.user_id, users.created_at
  from public.talent_users users
  where users.deleted_at is null
    and split_part(lower(coalesce(users.email, '')), '@', 2) <> 'matchharper.com'
    and not exists (
      select 1
      from unnest(coalesce($4::text[], '{}'::text[])) term(value)
      where nullif(btrim(term.value), '') is not null
        and position(lower(btrim(term.value)) in lower(coalesce(users.email, ''))) > 0
    )
),
test_only_roles as materialized (
  select role.role_id
  from public.company_roles role
  where lower(coalesce(role.information ->> 'testOnly', 'false')) = 'true'
)`;

// 대신 지원: each application the talent confirmed for Harper to carry out (a work_effect), with the send or browser
// run it was bound to. It is submitted when the Gmail send succeeded, or the browser run's report opens by
// confirming the submission. 외부 연결 = a submitted application.
const APPLICATION_CTES = String.raw`
confirmed_applications as materialized (
  select
    effect.id,
    effect.user_id,
    effect.created_at as confirmed_at,
    effect.status as effect_status,
    bound.kind as bound_kind,
    bound.status as bound_status,
    coalesce(bound.updated_at, bound.created_at, effect.created_at) as finished_at,
    case
      when bound.kind = 'browser_run' then lower(regexp_replace(regexp_replace(regexp_replace(
        btrim(coalesce(bound.request ->> 'url', '')), '^[a-z][a-z0-9+.-]*://', '', 'i'), '^www\.', '', 'i'), '[/:?#].*$', ''))
    end as host,
    nullif(btrim(substring(coalesce(bound.result ->> 'summary', '') from '^[^.!?。]*[.!?。]?')), '') as sentence
  from public.talent_external_operations effect
  join included_users users on users.user_id = effect.user_id
  -- Compare as uuid so the bound run is a primary-key lookup; the pattern is exactly what id::text prints.
  left join public.talent_external_operations bound on bound.id = case
    when effect.result ->> 'operation_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (effect.result ->> 'operation_id')::uuid
  end
  where effect.kind = 'work_effect'
),
applications as materialized (
  select
    application.*,
    (application.bound_kind = 'email_send' and application.bound_status = 'succeeded')
      or (
        application.bound_kind = 'browser_run'
        and application.bound_status = 'completed'
        and coalesce(application.sentence, '') ~* $5
        and coalesce(application.sentence, '') !~* $6
      ) as submitted
  from confirmed_applications application
),
external_connections as materialized (
  select id, user_id, finished_at as connected_at
  from applications
  where submitted
),
-- 내부 연결: an introduction contact_company delivered to the company's agent (the first message of the thread).
internal_connections as materialized (
  select contact.id, contact.talent_id as user_id, contact.created_at as connected_at
  from public.agent_contact_messages contact
  join included_users users on users.user_id = contact.talent_id
  where contact.direction = 'to_company'
    and contact.id = contact.root_id
    and coalesce(contact.source ->> 'legacyCorrespondence', '') <> 'true'
    and not exists (select 1 from test_only_roles role where role.role_id = contact.role_id)
),
-- 맡김 clicks: 'Harper와 지원하기' (external) and submitting an internal connection request.
delegation_clicks as materialized (
  select log.user_id, log.created_at, 'external'::text as kind
  from public.logs log
  join included_users users on users.user_id = log.user_id
  where log.type = 'career_click_apply_with_harper'

  union all

  select log.user_id, log.created_at, 'internal'::text
  from public.logs log
  join included_users users on users.user_id = log.user_id
  where log.type = 'career_click_history_submit_internal_connection_acceptance'
)`;

/**
 * One row per talent who signed up in the period, the comparison period or the funnel's 7 days, with when they
 * first reached each step. 맡김 also counts a later step (a confirmed application or a delivered introduction):
 * a request made in chat has no click.
 */
export const OVERVIEW_SIGNUPS_SQL = String.raw`
with ${PERIOD_CTES},
${APPLICATION_CTES},
signups as (
  select users.user_id, users.created_at
  from included_users users
  where users.created_at >= least(
      (select comparison_start_at from params),
      (select funnel_end_at - interval '7 days' from params)
    )
    and users.created_at < (select end_at from params)
)
select
  signups.user_id::text as "userId",
  signups.created_at as "signedUpAt",
  date_trunc((select unit from params), signups.created_at at time zone 'Asia/Seoul')::date::text as "bucketStart",
  signups.created_at >= (select start_at from params) as "isCurrent",
  signups.created_at >= (select comparison_start_at from params)
    and signups.created_at < (select start_at from params) as "isComparison",
  signups.created_at >= (select funnel_end_at - interval '7 days' from params)
    and signups.created_at < (select funnel_end_at from params) as "inFunnel",
  steps.first_chat_at as "firstChatAt",
  steps.gmail_at as "gmailAt",
  least(steps.clicked_at, steps.confirmed_at, steps.introduced_at) as "delegatedAt",
  least(steps.submitted_at, steps.introduced_at) as "connectedAt"
from signups
cross join lateral (
  select
    (
      select min(message.created_at)
      from public.talent_messages message
      where message.user_id = signups.user_id
        and message.role = 'user'
        and coalesce(message.message_type, 'chat') = 'chat'
    ) as first_chat_at,
    (
      select min(integration.created_at)
      from public.talent_integrations integration
      where integration.talent_id = signups.user_id
        and integration.provider = 'gmail'
    ) as gmail_at,
    (select min(click.created_at) from delegation_clicks click where click.user_id = signups.user_id) as clicked_at,
    (select min(application.confirmed_at) from applications application where application.user_id = signups.user_id) as confirmed_at,
    (select min(connection.connected_at) from external_connections connection where connection.user_id = signups.user_id) as submitted_at,
    (select min(connection.connected_at) from internal_connections connection where connection.user_id = signups.user_id) as introduced_at
) steps
order by signups.created_at
`;

/** Per bucket and per period: connections, 대신 지원 clicks, and people with any activity (the DAU activity sources). */
export const OVERVIEW_TREND_SQL = String.raw`
with ${PERIOD_CTES},
${APPLICATION_CTES},
buckets as (
  select
    series.local_start::date as bucket_start,
    greatest((select start_at from params), series.local_start at time zone 'Asia/Seoul') as start_at,
    least(
      (select end_at from params),
      (series.local_start + case (select unit from params)
        when 'day' then interval '1 day'
        when 'week' then interval '7 days'
        else interval '1 month'
      end) at time zone 'Asia/Seoul'
    ) as end_at
  from generate_series(
    date_trunc((select unit from params), (select start_at from params) at time zone 'Asia/Seoul'),
    date_trunc((select unit from params), ((select end_at from params) - interval '1 microsecond') at time zone 'Asia/Seoul'),
    case (select unit from params)
      when 'day' then interval '1 day'
      when 'week' then interval '7 days'
      else interval '1 month'
    end
  ) series(local_start)
  where (select end_at from params) > (select start_at from params)
),
activity as (
  select message.user_id, message.created_at as occurred_at
  from public.talent_messages message
  join included_users users on users.user_id = message.user_id
  where message.role = 'user'
    and message.created_at >= (select comparison_start_at from params)
    and message.created_at < (select end_at from params)

  union all

  select log.user_id, log.created_at
  from public.logs log
  join included_users users on users.user_id = log.user_id
  where (log.type = 'login_completed' or left(coalesce(log.type, ''), 7) = 'career_')
    -- Not the talent's own action: Harper running a tool for them (career_tool_call*), and the cost receipt of an
    -- outside-service call in Harper's own run (career_provider_usage; Shaun 11/22: 하퍼가 남긴 비용 기록은 활동이 아님).
    and left(coalesce(log.type, ''), 16) <> 'career_tool_call'
    and log.type <> 'career_provider_usage'
    and log.created_at >= (select comparison_start_at from params)
    and log.created_at < (select end_at from params)

  union all

  select recommendation.talent_id, event.occurred_at
  from public.talent_opportunity_recommendation recommendation
  join included_users users on users.user_id = recommendation.talent_id
  cross join lateral (
    values (recommendation.viewed_at), (recommendation.clicked_at), (recommendation.feedback_at)
  ) event(occurred_at)
  -- A recommendation with an event in the window has its latest event in it too or later: this reads only those.
  where greatest(recommendation.viewed_at, recommendation.clicked_at, recommendation.feedback_at)
      >= (select comparison_start_at from params)
    and event.occurred_at >= (select comparison_start_at from params)
    and event.occurred_at < (select end_at from params)
    and not exists (select 1 from test_only_roles role where role.role_id = recommendation.role_id)
),
activity_days as materialized (
  select distinct user_id, (occurred_at at time zone 'Asia/Seoul')::date as activity_date, occurred_at >= (select start_at from params) as is_current
  from activity
),
connections as (
  select 'external'::text as kind, user_id, connected_at from external_connections
  union all
  select 'internal'::text, user_id, connected_at from internal_connections
),
bucket_rows as (
  select
    bucket.bucket_start,
    (select count(*) from connections c where c.kind = 'external' and c.connected_at >= bucket.start_at and c.connected_at < bucket.end_at) as external_connections,
    (select count(*) from connections c where c.kind = 'internal' and c.connected_at >= bucket.start_at and c.connected_at < bucket.end_at) as internal_connections,
    (select count(*) from delegation_clicks click where click.kind = 'external' and click.created_at >= bucket.start_at and click.created_at < bucket.end_at) as apply_delegated,
    (
      select count(distinct day.user_id)
      from activity_days day
      where day.activity_date >= (bucket.start_at at time zone 'Asia/Seoul')::date
        and day.activity_date <= ((bucket.end_at - interval '1 microsecond') at time zone 'Asia/Seoul')::date
    ) as active_talents
  from buckets bucket
),
periods as (
  select
    period.key,
    (select count(*) from connections c where c.kind = 'external' and c.connected_at >= period.start_at and c.connected_at < period.end_at) as external_connections,
    (select count(*) from connections c where c.kind = 'internal' and c.connected_at >= period.start_at and c.connected_at < period.end_at) as internal_connections,
    (select count(distinct c.user_id) from connections c where c.connected_at >= period.start_at and c.connected_at < period.end_at) as connected_talents,
    (select count(*) from delegation_clicks click where click.kind = 'external' and click.created_at >= period.start_at and click.created_at < period.end_at) as apply_delegated,
    (select count(distinct day.user_id) from activity_days day where day.is_current = (period.key = 'current')) as active_talents
  from (
    select 'current'::text as key, (select start_at from params) as start_at, (select end_at from params) as end_at
    union all
    select 'comparison', (select comparison_start_at from params), (select start_at from params)
  ) period
)
select
  'bucket'::text as "rowType",
  bucket_start::text as "key",
  external_connections::int as "externalConnections",
  internal_connections::int as "internalConnections",
  null::int as "connectedTalents",
  apply_delegated::int as "applyDelegated",
  active_talents::int as "activeTalents"
from bucket_rows
union all
select
  'period', key, external_connections::int, internal_connections::int, connected_talents::int, apply_delegated::int, active_talents::int
from periods
`;

/**
 * 대신 지원 confirmed in the period or the comparison period: one row per confirmation, placed at when it finished
 * (submitted or stopped), with the site of a browser run and the opening sentence of its report.
 */
export const OVERVIEW_APPLICATIONS_SQL = String.raw`
with ${PERIOD_CTES},
${APPLICATION_CTES}
select
  application.finished_at as "at",
  date_trunc((select unit from params), application.confirmed_at at time zone 'Asia/Seoul')::date::text as "bucketStart",
  application.confirmed_at >= (select start_at from params) as "isCurrent",
  case when application.bound_kind = 'email_send' then 'Gmail 메일' else nullif(application.host, '') end as "host",
  coalesce(application.bound_status, application.effect_status) as "status",
  case when application.bound_kind = 'email_send' then null else application.sentence end as "sentence",
  application.submitted as "submitted"
from applications application
where application.confirmed_at >= (select comparison_start_at from params)
  and application.confirmed_at < (select end_at from params)
order by application.confirmed_at
`;

/**
 * 연결 대기 now: talent·internal Role pairs whose latest internal-stage tag is 내부:연결대기 (what /org shows as
 * 연결을 기다리는 후보). since: when the wait began. $1: excluded email terms.
 */
export const OVERVIEW_PENDING_CONNECTIONS_SQL = String.raw`
with included_users as materialized (
  select users.user_id
  from public.talent_users users
  where users.deleted_at is null
    and split_part(lower(coalesce(users.email, '')), '@', 2) <> 'matchharper.com'
    and not exists (
      select 1
      from unnest(coalesce($1::text[], '{}'::text[])) term(value)
      where nullif(btrim(term.value), '') is not null
        and position(lower(btrim(term.value)) in lower(coalesce(users.email, ''))) > 0
    )
),
internal_roles as materialized (
  select role.role_id
  from public.company_roles role
  where lower(coalesce(role.source_type, '')) = 'internal'
    and lower(coalesce(role.information ->> 'testOnly', 'false')) <> 'true'
),
latest_stage as (
  select distinct on (tag.talent_id, tag.opportunity_id)
    tag.talent_id,
    regexp_replace(tag.tag, '\s+', '', 'g') as tag,
    coalesce(tag.updated_at, tag.created_at) as since
  from public.talent_opportunity_tag tag
  join included_users users on users.user_id = tag.talent_id
  join internal_roles role on role.role_id = tag.opportunity_id
  where regexp_replace(tag.tag, '\s+', '', 'g') in (
      '내부:수락', '내부:아카이브', '내부:최종오퍼', '내부:보류', '내부:연결대기',
      '내부:프로세스중단', '내부:거절', '내부:추천', '내부:연결됨'
    )
    or regexp_replace(tag.tag, '\s+', '', 'g') like '내부단계:%'
  order by tag.talent_id, tag.opportunity_id, tag.updated_at desc nulls last, tag.created_at desc, tag.id desc
)
select talent_id::text as "talentId", since as "since"
from latest_stage
where tag = '내부:연결대기'
`;

export const OVERVIEW_OFFICIAL_JOBS_SQL = String.raw`
select slug, company_name as "companyName", role_title as "roleTitle", coalesce(is_published, false) as "isPublished"
from public.official_jobs
where role_title <> 'internal_internal' and slug <> 'internal-internal'
`;

/** The login_email landing logs of these accounts ($1: normalized emails) in [$2, $3), for signup attribution. */
export const OVERVIEW_ACCOUNT_SIGN_INS_SQL = String.raw`
select
  to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
  local_id,
  type
from public.landing_logs
where type like 'login_email:%'
  and lower(btrim(split_part(type, ':', 2))) = any($1::text[])
  and created_at >= $2::timestamptz
  and created_at < $3::timestamptz
`;
