// Read-only SQL behind /ops/update-metrics (배포 전후 비교 지표).
// Shared parameters: $1 window start, $2 window end (timestamptz), $3 excluded email terms.
// The people and test-only Role rules match /ops/metrics (talentMetricsOverview.sql.ts).

const BASE_CTES = String.raw`
included_users as materialized (
  select users.user_id, users.created_at, users.resume_storage_path, users.resume_file_name, users.resume_links
  from public.talent_users users
  where users.deleted_at is null
    and split_part(lower(coalesce(users.email, '')), '@', 2) <> 'matchharper.com'
    and not exists (
      select 1
      from unnest(coalesce($3::text[], '{}'::text[])) term(value)
      where nullif(btrim(term.value), '') is not null
        and position(lower(btrim(term.value)) in lower(coalesce(users.email, ''))) > 0
    )
),
test_only_roles as materialized (
  select role.role_id
  from public.company_roles role
  where lower(coalesce(role.information ->> 'testOnly', 'false')) = 'true'
)`;

/**
 * One row per talent who signed up in [$1, $2), with what happened in their first 3 days.
 * 자료: a resume file or a LinkedIn URL on the profile now. 좋아요/싫어요: feedback given in the first 3 days
 * on a recommendation made in the first 3 days. 비용·시간: llm_logs for that talent in the first 3 days,
 * without the per-tool attribution rows (they repeat the parent call's cost).
 */
export const UPDATE_METRICS_SIGNUPS_SQL = String.raw`
with ${BASE_CTES},
signups as materialized (
  select
    users.user_id,
    users.created_at,
    users.resume_storage_path is not null
      or nullif(btrim(coalesce(users.resume_file_name, '')), '') is not null
      or exists (
        select 1 from unnest(coalesce(users.resume_links, '{}'::text[])) link(url)
        where link.url ~* '(^|[/.])linkedin\.com'
      ) as has_materials
  from included_users users
  where users.created_at >= $1::timestamptz
    and users.created_at < $2::timestamptz
),
recommendations as materialized (
  select
    recommendation.talent_id,
    count(*) as received,
    count(*) filter (
      where lower(coalesce(recommendation.feedback, '')) in ('like', 'positive')
        and recommendation.feedback_at < signups.created_at + interval '3 days'
    ) as liked,
    count(*) filter (
      where lower(coalesce(recommendation.feedback, '')) in ('dislike', 'negative')
        and recommendation.feedback_at < signups.created_at + interval '3 days'
    ) as disliked
  from public.talent_opportunity_recommendation recommendation
  join signups on signups.user_id = recommendation.talent_id
  where recommendation.recommended_at < signups.created_at + interval '3 days'
    and not exists (select 1 from test_only_roles role where role.role_id = recommendation.role_id)
  group by recommendation.talent_id
),
-- Narrow the rows before the join: sorting whole llm_logs rows (with meta) is what makes this slow.
llm_calls as materialized (
  select
    coalesce(log.user_id::text, log.meta ->> 'userId') as user_key,
    log.created_at,
    log.estimated_cost_usd as cost_usd,
    case when (log.meta ->> 'elapsedMs') ~ '^[0-9]+(\.[0-9]+)?$' then (log.meta ->> 'elapsedMs')::numeric end as elapsed_ms
  from public.llm_logs log
  where log.created_at >= $1::timestamptz
    and log.created_at < $2::timestamptz + interval '3 days'
    and coalesce(log.meta ->> 'costKind', '') <> 'attribution'
),
usage as materialized (
  select signups.user_id, sum(call.cost_usd) as cost_usd, sum(call.elapsed_ms) as elapsed_ms
  from llm_calls call
  join signups on signups.user_id::text = call.user_key
  where call.created_at >= signups.created_at
    and call.created_at < signups.created_at + interval '3 days'
  group by signups.user_id
)
select
  signups.user_id::text as "userId",
  signups.created_at as "signedUpAt",
  signups.has_materials as "hasMaterials",
  (
    select min(message.created_at)
    from public.talent_messages message
    where message.user_id = signups.user_id
      and message.role = 'user'
      and coalesce(message.message_type, 'chat') = 'chat'
  ) as "firstChatAt",
  (
    select min(log.created_at)
    from public.logs log
    where log.type = 'career_onboarding_submitted' and log.user_id = signups.user_id
  ) as "onboardingSubmittedAt",
  (
    select min(integration.created_at)
    from public.talent_integrations integration
    where integration.talent_id = signups.user_id and integration.provider = 'gmail'
  ) as "gmailAt",
  (
    select min(log.created_at)
    from public.logs log
    where log.type = 'career_click_apply_with_harper' and log.user_id = signups.user_id
  ) as "applyWithHarperAt",
  coalesce(recommendations.received, 0)::int as "recommendations3d",
  coalesce(recommendations.liked, 0)::int as "liked3d",
  coalesce(recommendations.disliked, 0)::int as "disliked3d",
  coalesce(usage.cost_usd, 0)::float8 as "costUsd3d",
  coalesce(usage.elapsed_ms, 0)::float8 as "llmMs3d"
from signups
left join recommendations on recommendations.talent_id = signups.user_id
left join usage on usage.user_id = signups.user_id
order by signups.created_at
`;

/**
 * Recommendations made outside the Worker's scheduled runs, per week ($4: the sorted week boundaries; $1 and $2 are its
 * first and last): all of them and those that are not an official posting — a company itself (company_workspace_id)
 * or a hiring post (company_roles.information.hiringPost).
 */
export const UPDATE_METRICS_RECOMMENDATIONS_SQL = String.raw`
with ${BASE_CTES},
recommendations as materialized (
  select
    recommendation.talent_id,
    recommendation.recommended_at,
    recommendation.company_workspace_id is not null or recommendation.opportunity_type = 'company' as is_company,
    jsonb_typeof(role.information -> 'hiringPost') = 'object' as is_hiring_post
  from public.talent_opportunity_recommendation recommendation
  join included_users users on users.user_id = recommendation.talent_id
  left join public.company_roles role on role.role_id = recommendation.role_id
  where recommendation.recommended_at >= $1::timestamptz
    and recommendation.recommended_at < $2::timestamptz
    and coalesce(recommendation.kind, '') <> 'worker'
    and not exists (select 1 from test_only_roles test_role where test_role.role_id = recommendation.role_id)
)
select
  width_bucket(recommended_at, $4::timestamptz[]) - 1 as "bucketIndex",
  count(*)::int as "total",
  count(*) filter (where coalesce(is_company, false))::int as "company",
  count(*) filter (where coalesce(is_hiring_post, false) and not coalesce(is_company, false))::int as "hiringPost",
  count(distinct talent_id) filter (where coalesce(is_company, false) or coalesce(is_hiring_post, false))::int as "nonPostingTalents"
from recommendations
group by 1
order by 1
`;

/**
 * Browsers that saw the candidate landing (/ logs landing_stats_exposure; other pages do not) in [$1, $2), at their
 * first exposure in the window, and when that browser signed up (career_signup_completed carries the landing id).
 */
export const UPDATE_METRICS_LANDING_SQL = String.raw`
with visits as (
  select local_id, min(created_at) as first_seen_at
  from public.landing_logs
  where type = 'landing_stats_exposure'
    and local_id is not null
    and created_at >= $1::timestamptz
    and created_at < $2::timestamptz
  group by local_id
),
signups as (
  select log.meta_data ->> 'landingLocalId' as local_id, log.created_at
  from public.logs log
  where log.type = 'career_signup_completed'
    and log.created_at >= $1::timestamptz
    and nullif(log.meta_data ->> 'landingLocalId', '') is not null
)
select
  visits.first_seen_at as "at",
  min(signups.created_at) as "signedUpAt"
from visits
left join signups on signups.local_id = visits.local_id and signups.created_at >= visits.first_seen_at
group by visits.local_id, visits.first_seen_at
order by visits.first_seen_at
`;

/** /jobs postings with no internal Role behind them (official_jobs.role_id is empty). */
export const UPDATE_METRICS_JOBS_WITHOUT_ROLE_SQL = String.raw`
select slug
from public.official_jobs
where role_id is null
`;
