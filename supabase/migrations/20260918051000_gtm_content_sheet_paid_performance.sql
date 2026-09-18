-- Make the team-facing content sheet show actual net payments and the latest
-- human/agent-authored performance review without inventing a score from raw
-- metric thresholds.

create or replace view public.gtm_content_sheet_v1
with (security_invoker = true) as
select
  content.id,
  content.title,
  creator.name as creator_name,
  account.platform,
  account.handle,
  content.post_url,
  content.published_at,
  views.value as views,
  likes.value as likes,
  comments.value as comments,
  comments_non_author.value as comments_non_author,
  least(views.as_of, likes.as_of, comments_non_author.as_of) as platform_metrics_as_of,
  content.platform_metrics_due_at,
  content.platform_metrics_last_collected_at,
  content.platform_metrics_last_error,
  strategy.name as compensation_strategy_name,
  content.compensation_snapshot ->> 'pricing_model' as compensation_pricing_model,
  nullif(content.compensation_snapshot ->> 'base_fee', '')::numeric
    as compensation_base_fee,
  nullif(content.compensation_snapshot ->> 'measurement_window_days', '')::integer
    as compensation_measurement_window_days,
  nullif(content.compensation_snapshot ->> 'views_per_unit', '')::numeric
    as compensation_views_per_unit,
  nullif(content.compensation_snapshot ->> 'amount_per_unit', '')::numeric
    as compensation_amount_per_unit,
  case
    when allocated_payment.currency_count > 1 then 'mixed'
    else coalesce(
      allocated_payment.currency,
      cost.currency,
      content.compensation_snapshot ->> 'currency'
    )
  end as compensation_currency,
  public.gtm_compensation_amount(content.compensation_snapshot, views.value)
    as estimated_payable,
  cost.incurred_amount as finalized_payable,
  case
    when content.compensation_strategy_id is null then 'no_strategy'
    when content.published_at is null then 'waiting_for_publication'
    when content.compensation_cost_id is not null then 'finalized'
    when content.platform_metrics_due_at > now() then 'observing'
    when content.compensation_snapshot ->> 'pricing_model' = 'fixed'
      then 'ready_to_finalize'
    when views.value is null or views.as_of < content.platform_metrics_due_at then 'metrics_due'
    else 'ready_to_finalize'
  end as settlement_status,
  content.platform_metrics_finalized_at,
  collaboration.title as collaboration_title,
  campaign.name as campaign_name,
  format.name as format_name,
  plan.name as plan_name,
  content.production_status,
  content.publish_status,
  content.ref,
  creator.ref as creator_ref,
  collaboration.ref as collaboration_ref,
  campaign.ref as campaign_ref,
  format.ref as format_ref,
  plan.ref as plan_ref,
  account.ref as account_ref,
  strategy.ref as compensation_strategy_ref,
  cost.ref as compensation_cost_ref,
  content.collaboration_id,
  content.campaign_id,
  content.format_id,
  content.plan_id,
  content.creator_id,
  content.account_id,
  content.compensation_strategy_id,
  content.compensation_cost_id,
  content.row_version,
  content.archived_at,
  case
    when allocated_payment.currency_count = 1 then allocated_payment.paid_amount
    else null
  end as paid_amount,
  case
    when performance_review.id is null then
      '⚪ 리뷰 전 · 저장된 성과 결론이 없습니다.'
    when performance_review.rating is not null then concat(
      case performance_review.rating
        when 'good' then '🟢 좋음'
        when 'mixed' then '🟡 보통'
        when 'low' then '🔴 낮음'
        else '⚪ 판단 보류'
      end,
      ' · ',
      btrim(performance_review.body)
    )
    else concat(
      case lower(coalesce(performance_review.direction, ''))
        when 'scale' then '🟢'
        when 'retry' then '🟡'
        when 'hold' then '🟠'
        when 'stop' then '🔴'
        else '⚪'
      end,
      ' ',
      case lower(coalesce(performance_review.direction, ''))
        when 'scale' then 'Scale'
        when 'retry' then 'Retry'
        when 'hold' then 'Hold'
        when 'stop' then 'Stop'
        else '성과 리뷰'
      end,
      case
        when performance_review.kind = 'review_adopted' then ' 채택'
        else ' 제안'
      end,
      case
        when nullif(btrim(performance_review.body), '') is not null
          then ' · ' || btrim(performance_review.body)
        else ''
      end
    )
  end as performance_conclusion
from public.gtm_contents content
left join public.gtm_creators creator on creator.id = content.creator_id
left join public.gtm_accounts account on account.id = content.account_id
left join public.gtm_collaborations collaboration on collaboration.id = content.collaboration_id
left join public.gtm_campaigns campaign on campaign.id = content.campaign_id
left join public.gtm_formats format on format.id = content.format_id
left join public.gtm_plans plan on plan.id = content.plan_id
left join public.gtm_compensation_strategies strategy
  on strategy.id = content.compensation_strategy_id
left join public.gtm_costs cost on cost.id = content.compensation_cost_id
left join lateral (
  select
    sum(
      public.gtm_net_paid(allocated_cost.payments)
      * (allocation.item ->> 'share')::numeric
    ) as paid_amount,
    min(allocated_cost.currency) as currency,
    count(distinct allocated_cost.currency) as currency_count
  from public.gtm_costs allocated_cost
  cross join lateral jsonb_array_elements(
    coalesce(allocated_cost.allocations, '[]'::jsonb)
  )
    as allocation(item)
  where allocation.item ->> 'content_id' = content.id::text
    and allocated_cost.archived_at is null
    and jsonb_array_length(coalesce(allocated_cost.payments, '[]'::jsonb)) > 0
) allocated_payment on true
left join lateral (
  select metric.value, metric.as_of
  from public.gtm_metric_snapshots metric
  where metric.content_id = content.id and metric.metric = 'views'
    and metric.archived_at is null
  order by metric.as_of desc, metric.created_at desc limit 1
) views on true
left join lateral (
  select metric.value, metric.as_of
  from public.gtm_metric_snapshots metric
  where metric.content_id = content.id and metric.metric = 'likes'
    and metric.archived_at is null
  order by metric.as_of desc, metric.created_at desc limit 1
) likes on true
left join lateral (
  select metric.value, metric.as_of
  from public.gtm_metric_snapshots metric
  where metric.content_id = content.id and metric.metric = 'comments'
    and metric.archived_at is null
  order by metric.as_of desc, metric.created_at desc limit 1
) comments on true
left join lateral (
  select metric.value, metric.as_of
  from public.gtm_metric_snapshots metric
  where metric.content_id = content.id and metric.metric = 'comments_non_author'
    and metric.archived_at is null
  order by metric.as_of desc, metric.created_at desc limit 1
) comments_non_author on true
left join lateral (
  select
    activity.id,
    activity.kind,
    activity.body,
    activity.payload ->> 'direction' as direction,
    activity.payload ->> 'rating' as rating
  from public.gtm_activities activity
  where activity.entity = 'gtm_contents'
    and activity.entity_id = content.id
    and activity.kind in ('performance_review', 'review_adopted')
    and activity.archived_at is null
  order by activity.occurred_at desc, activity.ref desc
  limit 1
) performance_review on true;

comment on column public.gtm_content_sheet_v1.paid_amount is
  'Actual net payments minus refunds allocated to this content; null means no payment evidence.';
comment on column public.gtm_content_sheet_v1.performance_conclusion is
  'Latest saved content performance review with an emoji presentation of its direction; no metric-threshold auto-grading.';

notify pgrst, 'reload schema';
