// Read-only SQL behind /ops/update-metrics (배포 후 실험중인 지표). 화면 원칙은 updateMetrics.ts 맨 위 주석에 있다.
// Shared parameters: $1 window start, $2 window end (timestamptz), $3 excluded email terms.
// The people and test-only Role rules match /ops/metrics (talentMetricsOverview.sql.ts).
// Rows that count per day carry their KST date (`day`); the screen adds days into weeks itself.

import { OPERATIONAL_OPPORTUNITY_FEEDBACK_REASON } from "@/lib/career/opportunityFeedbackSignals";
import { CAREER_REPLY_UNSEEN_TRIGGER } from "@/lib/career/background/unseenReply";
import { TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST } from "@/lib/talentOnboarding/onboarding";
import { applicationCtes } from "@/lib/ops/talentMetricsOverview.sql";

/** How long after an email an action still counts as a response to it. */
export const EMAIL_ACTION_WINDOW_HOURS = 72;

/**
 * A turn the person sent Harper in chat: typed, or sent by a chat button (more open positions, an introduction
 * request, a form answer). Onboarding submission, card save/exclude notes, calls and mail are not chat turns.
 */
const CHAT_MESSAGE_TYPES = String.raw`(
  'chat',
  '${TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST}',
  'agent_introduction_action',
  'career_form_response'
)`;

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
 * on a recommendation made in the first 3 days. An exclusion because the person already applied counts as 좋아요:
 * it is a good opportunity they had already applied to, and until 2026-11-21 it was stored as a like.
 * 비용·시간 come from UPDATE_METRICS_LLM_USAGE_SQL.
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
      where feedback.value = 'like'
        and recommendation.feedback_at < signups.created_at + interval '3 days'
    ) as liked,
    count(*) filter (
      where feedback.value = 'dislike'
        and recommendation.feedback_at < signups.created_at + interval '3 days'
    ) as disliked
  from public.talent_opportunity_recommendation recommendation
  join signups on signups.user_id = recommendation.talent_id
  cross join lateral (
    select case
      when lower(coalesce(recommendation.feedback, '')) in ('like', 'positive') then 'like'
      when lower(coalesce(recommendation.feedback, '')) not in ('dislike', 'negative') then null
      when position('${OPERATIONAL_OPPORTUNITY_FEEDBACK_REASON.AlreadyApplied}' in coalesce(recommendation.feedback_reason, '')) > 0 then 'like'
      else 'dislike'
    end as value
  ) feedback
  where recommendation.recommended_at < signups.created_at + interval '3 days'
    and not exists (select 1 from test_only_roles role where role.role_id = recommendation.role_id)
  group by recommendation.talent_id
),
-- Harper's chat reply showed the Gmail connection card ([[integration:gmail]] or [[integration:gmail-read]]).
-- No index reaches a talent's assistant messages, so read the window once instead of once per signup.
gmail_proposals as materialized (
  select message.user_id, min(message.created_at) as proposed_at
  from public.talent_messages message
  join signups on signups.user_id = message.user_id
  where message.role = 'assistant'
    and message.created_at >= $1::timestamptz
    and message.created_at < $2::timestamptz + interval '3 days'
    and position('[[integration:gmail' in message.content) > 0
  group by message.user_id
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
      and coalesce(message.message_type, 'chat') in ${CHAT_MESSAGE_TYPES}
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
  gmail_proposals.proposed_at as "gmailProposedAt",
  (
    select min(log.created_at)
    from public.logs log
    where log.type = 'career_click_apply_with_harper' and log.user_id = signups.user_id
  ) as "applyWithHarperAt",
  coalesce(recommendations.received, 0)::int as "recommendations3d",
  coalesce(recommendations.liked, 0)::int as "liked3d",
  coalesce(recommendations.disliked, 0)::int as "disliked3d"
from signups
left join recommendations on recommendations.talent_id = signups.user_id
left join gmail_proposals on gmail_proposals.user_id = signups.user_id
order by signups.created_at
`;

/**
 * 비용·시간 of the talents who signed up in [$1, $2): llm_logs for that talent in the first 3 days, without the
 * per-tool attribution rows (they repeat the parent call's cost). Talents with no calls have no row.
 * Run with index scans off: these calls are spread over a third of the window's heap pages, and reading them in page
 * order (bitmap heap scan) measured twice as fast as following llm_logs_user_key_created_idx row by row.
 */
export const UPDATE_METRICS_LLM_USAGE_SQL = String.raw`
with ${BASE_CTES},
signups as materialized (
  select users.user_id, users.created_at
  from included_users users
  where users.created_at >= $1::timestamptz
    and users.created_at < $2::timestamptz
),
llm_calls as materialized (
  select
    coalesce(log.user_id::text, log.meta ->> 'userId') as user_key,
    log.created_at,
    log.estimated_cost_usd as cost_usd,
    case when (log.meta ->> 'elapsedMs') ~ '^[0-9]+(\.[0-9]+)?$' then (log.meta ->> 'elapsedMs')::numeric end as elapsed_ms
  from public.llm_logs log
  where coalesce(log.user_id::text, log.meta ->> 'userId') = any(array(select signups.user_id::text from signups))
    and log.created_at >= $1::timestamptz
    and log.created_at < $2::timestamptz + interval '3 days'
    and coalesce(log.meta ->> 'costKind', '') <> 'attribution'
)
select
  signups.user_id::text as "userId",
  coalesce(sum(call.cost_usd), 0)::float8 as "costUsd3d",
  coalesce(sum(call.elapsed_ms), 0)::float8 as "llmMs3d"
from llm_calls call
join signups on signups.user_id::text = call.user_key
where call.created_at >= signups.created_at
  and call.created_at < signups.created_at + interval '3 days'
group by signups.user_id
`;

/**
 * Recommendations made outside the Worker's scheduled runs, per KST day: all of them and those that are not an official
 * posting — a company itself (company_workspace_id) or a hiring post (company_roles.information.hiringPost).
 */
export const UPDATE_METRICS_RECOMMENDATIONS_SQL = String.raw`
with ${BASE_CTES},
-- Few Roles are hiring posts: list them once instead of opening every recommended Role.
hiring_post_roles as materialized (
  select role.role_id
  from public.company_roles role
  where jsonb_typeof(role.information -> 'hiringPost') = 'object'
),
recommendations as materialized (
  select
    recommendation.talent_id,
    recommendation.recommended_at,
    recommendation.company_workspace_id is not null or recommendation.opportunity_type = 'company' as is_company,
    hiring_post.role_id is not null as is_hiring_post
  from public.talent_opportunity_recommendation recommendation
  join included_users users on users.user_id = recommendation.talent_id
  left join hiring_post_roles hiring_post on hiring_post.role_id = recommendation.role_id
  where recommendation.recommended_at >= $1::timestamptz
    and recommendation.recommended_at < $2::timestamptz
    and coalesce(recommendation.kind, '') <> 'worker'
    and not exists (select 1 from test_only_roles test_role where test_role.role_id = recommendation.role_id)
)
select
  to_char(recommended_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') as "day",
  count(*)::int as "total",
  count(*) filter (where coalesce(is_company, false))::int as "company",
  count(*) filter (where coalesce(is_hiring_post, false) and not coalesce(is_company, false))::int as "hiringPost"
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

/**
 * For each talent who signed up in [$1, $2): when they were first connected (the /ops/metrics rule: a 대신 지원 that
 * was really submitted, or an introduction delivered to the company) and when they first applied (connected, a
 * 맡김 by the /ops/metrics rule, or their own '직접 지원했어요'). $4 / $5 are SUBMITTED_SENTENCE /
 * NOT_SUBMITTED_SENTENCE (talentMetricsOverview.server.ts). Talents who never applied have no row.
 */
export const UPDATE_METRICS_CONNECTIONS_SQL = String.raw`
with ${BASE_CTES},
${applicationCtes({ submitted: "$4", notSubmitted: "$5" })},
signups as materialized (
  select users.user_id
  from included_users users
  where users.created_at >= $1::timestamptz
    and users.created_at < $2::timestamptz
),
steps as (
  -- 연결 (the /ops/metrics rule): a submitted 대신 지원 or a delivered introduction.
  select user_id, connected_at as at, true as connected from external_connections
  union all
  select user_id, connected_at, true from internal_connections
  -- 맡김 (the /ops/metrics rule): a confirmed 대신 지원, whether or not it was submitted, and the 맡김 clicks.
  union all
  select user_id, confirmed_at, false from applications
  union all
  select user_id, created_at, false from delegation_clicks
  -- '직접 지원했어요' on an opportunity, PC and phone (the events the daily debug report reads).
  union all
  select log.user_id, log.created_at, false
  from public.logs log
  join signups on signups.user_id = log.user_id
  where log.type in ('career_click_history_external_apply_directly', 'career_click_mobile_history_external_apply_directly')
    and log.created_at >= $1::timestamptz
)
select
  signups.user_id::text as "userId",
  min(steps.at) filter (where steps.connected) as "connectedAt",
  min(steps.at) as "appliedAt"
from signups
join steps on steps.user_id = signups.user_id
group by signups.user_id
`;

/** /jobs postings with no internal Role behind them (official_jobs.role_id is empty). */
export const UPDATE_METRICS_JOBS_WITHOUT_ROLE_SQL = String.raw`
select slug
from public.official_jobs
where role_id is null
`;

/**
 * Whether the person acted within 72 hours after `${at}`: a reply email, a chat turn, or a reaction to an opportunity
 * (feedback or a saved-stage change). `${talent}` is their id. Used for every email Harper sent.
 */
const ACTED_AFTER = (talent: string, at: string) => String.raw`(
  exists (
    select 1
    from public.career_email_messages reply
    where reply.talent_id = ${talent}
      and reply.direction = 'inbound'
      and reply.occurred_at > ${at}
      and reply.occurred_at <= ${at} + interval '${EMAIL_ACTION_WINDOW_HOURS} hours'
  )
  or exists (
    select 1
    from public.talent_messages turn
    where turn.user_id = ${talent}
      and turn.role = 'user'
      and coalesce(turn.message_type, 'chat') in ${CHAT_MESSAGE_TYPES}
      and turn.created_at > ${at}
      and turn.created_at <= ${at} + interval '${EMAIL_ACTION_WINDOW_HOURS} hours'
  )
  or exists (
    select 1
    from public.talent_opportunity_recommendation recommendation
    where recommendation.talent_id = ${talent}
      and recommendation.feedback_at > ${at}
      and recommendation.feedback_at <= ${at} + interval '${EMAIL_ACTION_WINDOW_HOURS} hours'
  )
  or exists (
    select 1
    from public.talent_progress progress
    where progress.talent_id = ${talent}
      and progress.kind = 'saved_stage_changed'
      and progress.created_at > ${at}
      and progress.created_at <= ${at} + interval '${EMAIL_ACTION_WINDOW_HOURS} hours'
  )
)`;

/**
 * Every email Harper sent a talent (career_email_messages, outbound and sent) per KST send day, split by whether it
 * carried choice buttons, and how many of each the person acted on within 72 hours. An email had buttons when its
 * saved Markdown holds a choice block with at least two choices, the rule the renderer uses
 * (src/lib/career/choiceButtons.ts).
 */
export const UPDATE_METRICS_EMAILS_SQL = String.raw`
with ${BASE_CTES},
emails as materialized (
  select
    mail.talent_id,
    mail.occurred_at,
    exists (
      select 1
      from regexp_matches(
        coalesce(message.content, ''),
        '\[\[CAREER_CHOICE_BUTTONS\]\](.*?)\[\[/CAREER_CHOICE_BUTTONS\]\]',
        'g'
      ) block(parts)
      cross join lateral (select btrim(block.parts[1]) as payload) choice
      where case
        when not pg_input_is_valid(choice.payload, 'jsonb') then 0
        when jsonb_typeof(choice.payload::jsonb) = 'array' then jsonb_array_length(choice.payload::jsonb)
        when jsonb_typeof(choice.payload::jsonb -> 'choices') = 'array' then jsonb_array_length(choice.payload::jsonb -> 'choices')
        else 0
      end >= 2
    ) as has_choices
  from public.career_email_messages mail
  join included_users users on users.user_id = mail.talent_id
  left join public.talent_messages message on message.id = mail.talent_message_id
  where mail.direction = 'outbound'
    and mail.status = 'sent'
    and mail.occurred_at >= $1::timestamptz
    and mail.occurred_at < $2::timestamptz
),
acted as (
  select
    to_char(emails.occurred_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') as day,
    emails.has_choices,
    ${ACTED_AFTER("emails.talent_id", "emails.occurred_at")} as acted
  from emails
)
select
  day as "day",
  count(*) filter (where has_choices)::int as "choiceEmails",
  count(*) filter (where has_choices and acted)::int as "choiceActed",
  count(*) filter (where not has_choices)::int as "plainEmails",
  count(*) filter (where not has_choices and acted)::int as "plainActed"
from acted
group by day
order by day
`;

/**
 * Replies a person left unseen in Career (Career runs with trigger career_reply_unseen) per KST day of the run: how
 * many the agent reviewed, how many it emailed (a sent email delivery from that run), and how many of those emails the
 * person acted on within 72 hours.
 */
export const UPDATE_METRICS_UNSEEN_REPLIES_SQL = String.raw`
with ${BASE_CTES},
runs as materialized (
  select run.id, run.talent_id, run.created_at
  from public.opportunity_discovery_run run
  join included_users users on users.user_id = run.talent_id
  where run.trigger = '${CAREER_REPLY_UNSEEN_TRIGGER}'
    and run.created_at >= $1::timestamptz
    and run.created_at < $2::timestamptz
),
sent as materialized (
  select runs.id as run_id, min(delivery.sent_at) as sent_at
  from runs
  join public.talent_opportunity_delivery delivery on delivery.discovery_run_id = runs.id
  where delivery.channel = 'email' and delivery.status = 'sent' and delivery.sent_at is not null
  group by runs.id
)
select
  to_char(runs.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') as "day",
  count(*)::int as "reviewed",
  count(sent.run_id)::int as "emailed",
  count(sent.run_id) filter (where ${ACTED_AFTER("runs.talent_id", "sent.sent_at")})::int as "acted"
from runs
left join sent on sent.run_id = runs.id
group by 1
order by 1
`;
