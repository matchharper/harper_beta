-- Versioned creator compensation experiments and evidence-backed content settlement.
-- A strategy remains editable until it is assigned. Assignment freezes an exact
-- snapshot on the content so later experiments cannot rewrite agreed economics.

create table if not exists public.gtm_compensation_strategies (
  id uuid primary key default gen_random_uuid(),
  ref bigint generated always as identity unique,
  name text not null check (length(btrim(name)) > 0),
  version integer not null default 1 check (version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'retired')),
  pricing_model text not null default 'base_plus_views'
    check (pricing_model in ('fixed', 'base_plus_views')),
  currency text not null default 'KRW' check (currency ~ '^[A-Z]{3}$'),
  base_fee numeric not null default 0 check (base_fee >= 0),
  measurement_window_days integer not null default 14
    check (measurement_window_days between 0 and 365),
  views_per_unit numeric check (views_per_unit > 0),
  amount_per_unit numeric check (amount_per_unit >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  row_version bigint not null default 1,
  archived_at timestamptz,
  unique (name, version),
  check (
    pricing_model = 'fixed'
    or (
      measurement_window_days > 0
      and views_per_unit is not null
      and amount_per_unit is not null
    )
  )
);

create trigger gtm_stamp_row
before insert or update on public.gtm_compensation_strategies
for each row execute function public.gtm_stamp();

alter table public.gtm_compensation_strategies enable row level security;
revoke all on public.gtm_compensation_strategies from public, anon, authenticated;
grant select, insert, update, delete on public.gtm_compensation_strategies to service_role;

alter table public.gtm_contents
  add column if not exists compensation_strategy_id uuid
    references public.gtm_compensation_strategies(id),
  add column if not exists compensation_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists platform_metrics_due_at timestamptz,
  add column if not exists platform_metrics_last_collected_at timestamptz,
  add column if not exists platform_metrics_last_error text,
  add column if not exists platform_metrics_finalized_at timestamptz,
  add column if not exists compensation_cost_id uuid references public.gtm_costs(id);

alter table public.gtm_collaborations
  add column if not exists compensation_strategy_id uuid
    references public.gtm_compensation_strategies(id);

alter table public.gtm_outreach_dispatches
  add column if not exists compensation_strategy_id uuid
    references public.gtm_compensation_strategies(id),
  add column if not exists compensation_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists estimated_views numeric,
  add column if not exists estimated_cost numeric;

create index if not exists gtm_contents_metrics_collection_idx
  on public.gtm_contents (
    platform_metrics_finalized_at,
    platform_metrics_due_at,
    platform_metrics_last_collected_at
  )
  where published_at is not null and archived_at is null;

create unique index if not exists gtm_costs_source_ref_uidx
  on public.gtm_costs (source_ref)
  where source_ref like 'compensation:%';

create or replace function public.gtm_compensation_amount(
  p_snapshot jsonb,
  p_views numeric
) returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_snapshot ->> 'pricing_model' = 'fixed'
      then round(coalesce((p_snapshot ->> 'base_fee')::numeric, 0))
    when p_snapshot ->> 'pricing_model' = 'base_plus_views'
      then round(
        coalesce((p_snapshot ->> 'base_fee')::numeric, 0)
        + greatest(coalesce(p_views, 0), 0)
          / nullif((p_snapshot ->> 'views_per_unit')::numeric, 0)
          * coalesce((p_snapshot ->> 'amount_per_unit')::numeric, 0)
      )
    else null
  end;
$$;

create or replace function public.gtm_freeze_content_compensation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  strategy public.gtm_compensation_strategies;
begin
  if tg_op = 'UPDATE'
    and old.compensation_cost_id is not null
    and (
      new.compensation_strategy_id is distinct from old.compensation_strategy_id
      or new.compensation_snapshot is distinct from old.compensation_snapshot
      or new.platform_metrics_due_at is distinct from old.platform_metrics_due_at
    ) then
    raise exception 'Finalized content compensation is immutable';
  end if;

  if new.compensation_strategy_id is null and new.collaboration_id is not null then
    select collaboration.compensation_strategy_id into new.compensation_strategy_id
    from public.gtm_collaborations collaboration
    where collaboration.id = new.collaboration_id;
  end if;

  if new.compensation_strategy_id is null then
    if tg_op = 'INSERT' or old.compensation_strategy_id is not null then
      new.compensation_snapshot := '{}'::jsonb;
      new.platform_metrics_due_at := null;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT'
    or new.compensation_strategy_id is distinct from old.compensation_strategy_id
    or new.compensation_snapshot = '{}'::jsonb then
    select * into strategy
    from public.gtm_compensation_strategies
    where id = new.compensation_strategy_id
      and archived_at is null;
    if not found then
      raise exception 'Compensation strategy not found';
    end if;
    new.compensation_snapshot := jsonb_build_object(
      'strategy_id', strategy.id,
      'strategy_ref', strategy.ref,
      'name', strategy.name,
      'version', strategy.version,
      'pricing_model', strategy.pricing_model,
      'currency', strategy.currency,
      'base_fee', strategy.base_fee,
      'measurement_window_days', strategy.measurement_window_days,
      'views_per_unit', strategy.views_per_unit,
      'amount_per_unit', strategy.amount_per_unit,
      'calculation_method', 'proportional',
      'frozen_at', now()
    );
  end if;

  if new.published_at is not null then
    new.platform_metrics_due_at := new.published_at
      + make_interval(days => (new.compensation_snapshot ->> 'measurement_window_days')::integer);
  else
    new.platform_metrics_due_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists gtm_freeze_content_compensation on public.gtm_contents;
create trigger gtm_freeze_content_compensation
before insert or update of compensation_strategy_id, compensation_snapshot, published_at,
  platform_metrics_due_at on public.gtm_contents
for each row execute function public.gtm_freeze_content_compensation();

create or replace function public.gtm_guard_compensation_strategy_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.gtm_contents content
    where content.compensation_strategy_id = old.id
  ) and (
    new.pricing_model is distinct from old.pricing_model
    or new.currency is distinct from old.currency
    or new.base_fee is distinct from old.base_fee
    or new.measurement_window_days is distinct from old.measurement_window_days
    or new.views_per_unit is distinct from old.views_per_unit
    or new.amount_per_unit is distinct from old.amount_per_unit
  ) then
    raise exception 'Used compensation terms are immutable; create a new version';
  end if;
  return new;
end;
$$;

drop trigger if exists gtm_guard_compensation_strategy_version
  on public.gtm_compensation_strategies;
create trigger gtm_guard_compensation_strategy_version
before update on public.gtm_compensation_strategies
for each row execute function public.gtm_guard_compensation_strategy_version();

insert into public.gtm_compensation_strategies (
  name, version, status, pricing_model, currency, base_fee,
  measurement_window_days, views_per_unit, amount_per_unit, notes, created_by
) values (
  '가격 전략 1', 1, 'draft', 'base_plus_views', 'KRW', 150000,
  14, 10000, 50000,
  '초기 실험안. 1만 조회당 5만원을 비례 계산한다. 실제 제안 전 N과 M을 Sheet에서 검토한다.',
  'migration'
) on conflict (name, version) do nothing;

create or replace view public.gtm_compensation_strategy_sheet_v1
with (security_invoker = true) as
select
  strategy.id,
  strategy.name,
  strategy.status,
  strategy.pricing_model,
  strategy.base_fee,
  strategy.measurement_window_days,
  strategy.views_per_unit,
  strategy.amount_per_unit,
  strategy.currency,
  case
    when strategy.pricing_model = 'fixed' then
      strategy.base_fee::text || ' ' || strategy.currency || ' / 업로드'
    else
      strategy.base_fee::text || ' ' || strategy.currency || ' + 조회수 '
        || strategy.views_per_unit::text || '당 '
        || strategy.amount_per_unit::text || ' ' || strategy.currency
        || ' · ' || strategy.measurement_window_days::text || '일 측정'
  end as calculation_summary,
  count(content.id)::integer as assigned_content_count,
  count(content.id) filter (where content.compensation_cost_id is not null)::integer
    as settled_content_count,
  strategy.notes,
  strategy.version,
  strategy.ref,
  strategy.created_by,
  strategy.created_at,
  strategy.updated_at,
  strategy.row_version,
  strategy.archived_at
from public.gtm_compensation_strategies strategy
left join public.gtm_contents content
  on content.compensation_strategy_id = strategy.id
 and content.archived_at is null
group by strategy.id;

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
  content.compensation_snapshot ->> 'currency' as compensation_currency,
  public.gtm_compensation_amount(content.compensation_snapshot, views.value)
    as estimated_payable,
  cost.incurred_amount as finalized_payable,
  case
    when content.compensation_strategy_id is null then 'no_strategy'
    when content.published_at is null then 'waiting_for_publication'
    when content.compensation_cost_id is not null then 'finalized'
    when content.platform_metrics_due_at > now() then 'observing'
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
  content.archived_at
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
) comments_non_author on true;

create or replace view public.gtm_outreach_review_sheet_v1
with (security_invoker = true) as
select
  dispatch.id,
  dispatch.ref,
  creator.id as creator_id,
  creator.ref as creator_ref,
  creator.name as creator_name,
  directory.sheet_primary_platform as primary_platform,
  directory.sheet_primary_handle as primary_handle,
  dispatch.recipient_email,
  template.id as outreach_template_id,
  template.ref as outreach_template_ref,
  template.name as outreach_template_name,
  dispatch.template_version,
  collaboration.id as collaboration_id,
  collaboration.ref as collaboration_ref,
  collaboration.title as collaboration_title,
  plan.ref as plan_ref,
  plan.name as plan_name,
  dispatch.sender_email,
  dispatch.selection_reason,
  dispatch.personalization_evidence,
  dispatch.subject,
  dispatch.body,
  null::text as review_action,
  dispatch.review_note,
  dispatch.status,
  dispatch.approved_by,
  dispatch.approved_at,
  dispatch.scheduled_at,
  dispatch.attempt_count,
  dispatch.last_error,
  dispatch.sent_at,
  dispatch.replied_at,
  dispatch.provider_message_id,
  dispatch.provider_thread_id,
  dispatch.created_by,
  dispatch.created_at,
  dispatch.updated_at,
  dispatch.row_version,
  dispatch.archived_at,
  directory.sheet_primary_profile_url as primary_profile_url,
  strategy.name as compensation_strategy_name,
  strategy.ref as compensation_strategy_ref,
  dispatch.estimated_views,
  dispatch.estimated_cost,
  dispatch.compensation_snapshot ->> 'currency' as compensation_currency
from public.gtm_outreach_dispatches dispatch
join public.gtm_creators creator on creator.id = dispatch.creator_id
join public.gtm_outreach_templates template
  on template.id = dispatch.outreach_template_id
left join public.gtm_creator_directory_sheet_v1 directory
  on directory.id = creator.id
left join public.gtm_collaborations collaboration
  on collaboration.id = dispatch.collaboration_id
left join public.gtm_plans plan on plan.id = collaboration.plan_id
left join public.gtm_compensation_strategies strategy
  on strategy.id = dispatch.compensation_strategy_id;

revoke all on public.gtm_compensation_strategy_sheet_v1,
  public.gtm_content_sheet_v1 from public, anon, authenticated;

create or replace function public.gtm_compensation_strategy_save(
  p_token text,
  p_id uuid default null,
  p_expected_version bigint default null,
  p_data jsonb default '{}'::jsonb,
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  credential public.gtm_access_tokens;
  prior jsonb;
  record_row public.gtm_compensation_strategies;
  result jsonb;
  request_hash text;
  key text;
begin
  select * into credential from public.gtm_access_tokens
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and revoked_at is null and expires_at > now();
  if not found or not credential.can_write then
    raise exception 'Invalid, expired, or read-only GTM access token' using errcode = '28000';
  end if;
  if p_request_id is null then raise exception 'Mutation request_id is required'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'p_data must be an object';
  end if;
  for key in select jsonb_object_keys(p_data) loop
    if not key = any(array[
      'name', 'status', 'pricing_model', 'currency', 'base_fee',
      'measurement_window_days', 'views_per_unit', 'amount_per_unit', 'notes',
      'version', 'archived_at'
    ]) then raise exception 'Unknown or read-only field: %', key; end if;
  end loop;

  request_hash := encode(sha256(convert_to(jsonb_build_object(
    'id', p_id, 'version', p_expected_version, 'data', p_data
  )::text, 'UTF8')), 'hex');
  select payload into prior from public.gtm_activities where request_id = p_request_id;
  if found then
    if prior ->> 'input_hash' <> request_hash
      or prior ->> 'credential_id' <> credential.id::text then
      raise exception 'Idempotency key reused with different input';
    end if;
    return prior -> 'result';
  end if;

  perform set_config('gtm.actor', credential.name, true);
  if p_id is null then
    insert into public.gtm_compensation_strategies (
      name, status, pricing_model, currency, base_fee,
      measurement_window_days, views_per_unit, amount_per_unit, notes, version
    ) values (
      p_data ->> 'name', coalesce(p_data ->> 'status', 'draft'),
      coalesce(p_data ->> 'pricing_model', 'fixed'),
      coalesce(p_data ->> 'currency', 'KRW'),
      coalesce((p_data ->> 'base_fee')::numeric, 0),
      coalesce((p_data ->> 'measurement_window_days')::integer, 0),
      nullif(p_data ->> 'views_per_unit', '')::numeric,
      nullif(p_data ->> 'amount_per_unit', '')::numeric,
      p_data ->> 'notes', coalesce((p_data ->> 'version')::integer, 1)
    ) returning * into record_row;
  else
    select * into record_row from public.gtm_compensation_strategies
    where id = p_id for update;
    if not found then raise exception 'Compensation strategy not found'; end if;
    if p_expected_version is null or record_row.row_version <> p_expected_version then
      raise exception 'Row version conflict. Reload before applying your change.'
        using errcode = '40001';
    end if;
    update public.gtm_compensation_strategies strategy set
      name = case when p_data ? 'name' then p_data ->> 'name' else strategy.name end,
      status = case when p_data ? 'status' then p_data ->> 'status' else strategy.status end,
      pricing_model = case when p_data ? 'pricing_model' then p_data ->> 'pricing_model' else strategy.pricing_model end,
      currency = case when p_data ? 'currency' then p_data ->> 'currency' else strategy.currency end,
      base_fee = case when p_data ? 'base_fee' then (p_data ->> 'base_fee')::numeric else strategy.base_fee end,
      measurement_window_days = case when p_data ? 'measurement_window_days' then (p_data ->> 'measurement_window_days')::integer else strategy.measurement_window_days end,
      views_per_unit = case when p_data ? 'views_per_unit' then nullif(p_data ->> 'views_per_unit', '')::numeric else strategy.views_per_unit end,
      amount_per_unit = case when p_data ? 'amount_per_unit' then nullif(p_data ->> 'amount_per_unit', '')::numeric else strategy.amount_per_unit end,
      notes = case when p_data ? 'notes' then p_data ->> 'notes' else strategy.notes end,
      version = case when p_data ? 'version' then (p_data ->> 'version')::integer else strategy.version end,
      archived_at = case when p_data ? 'archived_at' then nullif(p_data ->> 'archived_at', '')::timestamptz else strategy.archived_at end
    where strategy.id = p_id returning * into record_row;
  end if;

  result := jsonb_build_object('record', to_jsonb(record_row), 'request_id', p_request_id);
  insert into public.gtm_activities (
    entity, entity_id, kind, body, payload, request_id
  ) values (
    'gtm_compensation_strategies', record_row.id, 'system.mutation',
    'Recorded compensation strategy change',
    jsonb_build_object('input_hash', request_hash, 'credential_id', credential.id, 'result', result),
    p_request_id
  );
  return result;
end;
$$;

create or replace function public.gtm_compensation_estimate(
  p_token text,
  p_strategy_id uuid,
  p_creator_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  credential public.gtm_access_tokens;
  strategy public.gtm_compensation_strategies;
  result jsonb;
begin
  select * into credential from public.gtm_access_tokens
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and revoked_at is null and expires_at > now();
  if not found then raise exception 'Invalid or expired GTM access token' using errcode = '28000'; end if;
  if cardinality(p_creator_ids) not between 1 and 100 then
    raise exception 'Supply 1 to 100 creators';
  end if;
  select * into strategy from public.gtm_compensation_strategies
  where id = p_strategy_id and archived_at is null;
  if not found then raise exception 'Compensation strategy not found'; end if;

  with creator_estimates as (
    select
      creator.id,
      creator.ref,
      creator.name,
      evidence.content_count,
      evidence.estimated_views,
      public.gtm_compensation_amount(
        jsonb_build_object(
          'pricing_model', strategy.pricing_model,
          'base_fee', strategy.base_fee,
          'views_per_unit', strategy.views_per_unit,
          'amount_per_unit', strategy.amount_per_unit
        ),
        evidence.estimated_views
      ) as estimated_cost
    from public.gtm_creators creator
    left join lateral (
      select count(*)::integer as content_count,
        round(percentile_cont(0.5) within group (order by recent.value))::numeric
          as estimated_views
      from (
        select latest.value
        from public.gtm_contents content
        join lateral (
          select metric.value
          from public.gtm_metric_snapshots metric
          where metric.content_id = content.id and metric.metric = 'views'
            and metric.value is not null and metric.archived_at is null
          order by metric.as_of desc, metric.created_at desc limit 1
        ) latest on true
        where content.creator_id = creator.id
          and content.published_at is not null and content.archived_at is null
        order by content.published_at desc limit 10
      ) recent
    ) evidence on true
    where creator.id = any(p_creator_ids) and creator.archived_at is null
  )
  select jsonb_build_object(
    'strategy', jsonb_build_object(
      'id', strategy.id, 'ref', strategy.ref, 'name', strategy.name,
      'version', strategy.version, 'pricing_model', strategy.pricing_model,
      'base_fee', strategy.base_fee,
      'measurement_window_days', strategy.measurement_window_days,
      'views_per_unit', strategy.views_per_unit,
      'amount_per_unit', strategy.amount_per_unit, 'currency', strategy.currency,
      'calculation_method', 'proportional'
    ),
    'creators', coalesce(jsonb_agg(jsonb_build_object(
      'creator_id', estimate.id, 'creator_ref', estimate.ref,
      'creator_name', estimate.name,
      'estimated_views', estimate.estimated_views,
      'evidence_content_count', estimate.content_count,
      'estimated_cost', case when estimate.content_count > 0
        then estimate.estimated_cost else null end,
      'evidence_status', case when estimate.content_count > 0
        then 'estimated_from_recent_content' else 'missing_view_history' end
    ) order by estimate.estimated_cost desc nulls last), '[]'::jsonb),
    'known_estimated_total', sum(estimate.estimated_cost)
      filter (where estimate.content_count > 0),
    'missing_estimate_count', count(*) filter (where estimate.content_count = 0),
    'currency', strategy.currency,
    'as_of', now()
  ) into result from creator_estimates estimate;
  return result;
end;
$$;

create or replace function public.gtm_outreach_apply_compensation_strategy(
  p_token text,
  p_strategy_id uuid,
  p_dispatch_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  credential public.gtm_access_tokens;
  strategy public.gtm_compensation_strategies;
  dispatch public.gtm_outreach_dispatches;
  v_estimated_views numeric;
  v_estimated_cost numeric;
  snapshot jsonb;
  result jsonb := '[]'::jsonb;
begin
  select * into credential from public.gtm_access_tokens
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and revoked_at is null and expires_at > now();
  if not found or not credential.can_write then
    raise exception 'Invalid, expired, or read-only GTM access token' using errcode = '28000';
  end if;
  if cardinality(p_dispatch_ids) not between 1 and 100 then
    raise exception 'Supply 1 to 100 dispatches';
  end if;
  select * into strategy from public.gtm_compensation_strategies
  where id = p_strategy_id and archived_at is null;
  if not found then raise exception 'Compensation strategy not found'; end if;
  snapshot := jsonb_build_object(
    'strategy_id', strategy.id, 'strategy_ref', strategy.ref,
    'name', strategy.name, 'version', strategy.version,
    'pricing_model', strategy.pricing_model, 'currency', strategy.currency,
    'base_fee', strategy.base_fee,
    'measurement_window_days', strategy.measurement_window_days,
    'views_per_unit', strategy.views_per_unit,
    'amount_per_unit', strategy.amount_per_unit,
    'calculation_method', 'proportional', 'frozen_at', now()
  );
  perform set_config('gtm.actor', credential.name, true);
  for dispatch in
    select * from public.gtm_outreach_dispatches candidate
    where candidate.id = any(p_dispatch_ids) and candidate.archived_at is null
    order by candidate.ref for update
  loop
    if dispatch.status not in ('ready_for_review', 'needs_revision') then
      raise exception 'Only unapproved outreach can change pricing strategy';
    end if;
    select round(percentile_cont(0.5) within group (order by recent.value))::numeric
      into v_estimated_views
    from (
      select latest.value
      from public.gtm_contents content
      join lateral (
        select metric.value from public.gtm_metric_snapshots metric
        where metric.content_id = content.id and metric.metric = 'views'
          and metric.value is not null and metric.archived_at is null
        order by metric.as_of desc, metric.created_at desc limit 1
      ) latest on true
      where content.creator_id = dispatch.creator_id
        and content.published_at is not null and content.archived_at is null
      order by content.published_at desc limit 10
    ) recent;
    v_estimated_cost := case when v_estimated_views is null then null
      else public.gtm_compensation_amount(snapshot, v_estimated_views) end;
    update public.gtm_outreach_dispatches target set
      compensation_strategy_id = strategy.id,
      compensation_snapshot = snapshot,
      estimated_views = v_estimated_views,
      estimated_cost = v_estimated_cost
    where target.id = dispatch.id;
    if dispatch.collaboration_id is not null then
      update public.gtm_collaborations collaboration
      set compensation_strategy_id = strategy.id
      where collaboration.id = dispatch.collaboration_id
        and not exists (
          select 1 from public.gtm_contents content
          where content.collaboration_id = collaboration.id
            and content.compensation_cost_id is not null
        );
    end if;
    result := result || jsonb_build_array(jsonb_build_object(
      'dispatch_id', dispatch.id, 'dispatch_ref', dispatch.ref,
      'creator_id', dispatch.creator_id,
      'estimated_views', v_estimated_views, 'estimated_cost', v_estimated_cost,
      'currency', strategy.currency,
      'evidence_status', case when v_estimated_views is null
        then 'missing_view_history' else 'estimated_from_recent_content' end
    ));
  end loop;
  if jsonb_array_length(result) <> cardinality(p_dispatch_ids) then
    raise exception 'One or more outreach dispatches were not found';
  end if;
  return jsonb_build_object('rows', result, 'strategy', snapshot, 'as_of', now());
end;
$$;

create or replace function public.gtm_finalize_content_compensation(
  p_content_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  content public.gtm_contents;
  cost public.gtm_costs;
  views public.gtm_metric_snapshots;
  amount numeric;
  source text;
  plan_currency text;
  notify_needed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('gtm-content-compensation:' || p_content_id::text, 0));
  select * into content from public.gtm_contents
  where id = p_content_id and archived_at is null for update;
  if not found then raise exception 'Content not found'; end if;
  if content.compensation_cost_id is not null then
    select * into cost from public.gtm_costs where id = content.compensation_cost_id;
  else
    if content.compensation_strategy_id is null or content.platform_metrics_due_at is null then
      raise exception 'Content has no frozen compensation strategy';
    end if;
    if content.platform_metrics_due_at > now() then
      raise exception 'Content measurement window is not complete';
    end if;
    select * into views from public.gtm_metric_snapshots metric
    where metric.content_id = content.id and metric.metric = 'views'
      and metric.value is not null and metric.archived_at is null
      and metric.as_of >= content.platform_metrics_due_at
    order by metric.as_of, metric.created_at limit 1;
    if not found then raise exception 'A views observation at or after the due time is required'; end if;
    amount := public.gtm_compensation_amount(content.compensation_snapshot, views.value);
    if amount is null then raise exception 'Frozen compensation terms are incomplete'; end if;
    select currency into plan_currency from public.gtm_plans where id = content.plan_id;
    if plan_currency is distinct from content.compensation_snapshot ->> 'currency' then
      raise exception 'Compensation currency must match the plan currency';
    end if;
    source := 'compensation:' || content.id::text || ':v'
      || (content.compensation_snapshot ->> 'version');
    insert into public.gtm_costs (
      plan_id, collaboration_id, kind, description, currency, base_currency,
      expected_amount, agreed_amount, incurred_amount, measurement_basis,
      due_at, incurred_at, source_ref, allocations, created_by
    ) values (
      content.plan_id, content.collaboration_id, 'creator_fee',
      'Creator compensation for content #' || content.ref::text,
      content.compensation_snapshot ->> 'currency',
      content.compensation_snapshot ->> 'currency', amount, amount, amount,
      jsonb_build_object(
        'strategy', content.compensation_snapshot,
        'views', views.value,
        'metric_as_of', views.as_of,
        'metric_source_ref', views.source_ref
      )::text,
      now(), content.platform_metrics_due_at, source,
      jsonb_build_array(jsonb_build_object(
        'id', 'allocation_' || replace(gen_random_uuid()::text, '-', ''),
        'content_id', content.id, 'share', 1
      )), 'content-metrics-settlement'
    ) on conflict (source_ref) where source_ref like 'compensation:%' do update
      set source_ref = excluded.source_ref
    returning * into cost;
    update public.gtm_contents set
      compensation_cost_id = cost.id,
      platform_metrics_finalized_at = now(),
      platform_metrics_last_error = null
    where id = content.id returning * into content;
    perform set_config('gtm.actor', 'content-metrics-settlement', true);
    insert into public.gtm_activities (
      entity, entity_id, kind, body, payload, source_ref, provider,
      connection_ref, external_id
    ) values (
      'gtm_contents', content.id, 'compensation_finalized',
      'Creator content compensation finalized',
      jsonb_build_object('content_id', content.id, 'cost_id', cost.id,
        'amount', amount, 'currency', cost.currency, 'views', views.value,
        'metric_as_of', views.as_of, 'strategy', content.compensation_snapshot),
      source, 'contents_engine', 'compensation', cost.id::text
    ) on conflict (provider, connection_ref, external_id) do nothing;
  end if;

  notify_needed := not exists (
    select 1 from public.gtm_activities activity
    where activity.kind = 'notification_sent' and activity.provider = 'slack'
      and activity.connection_ref = 'creator-compensation'
      and activity.external_id = cost.id::text
  );
  return jsonb_build_object(
    'content_id', content.id, 'content_ref', content.ref, 'title', content.title,
    'cost_id', cost.id, 'cost_ref', cost.ref, 'amount', cost.incurred_amount,
    'currency', cost.currency, 'notify_needed', notify_needed,
    'strategy', content.compensation_snapshot
  );
end;
$$;

create or replace function public.gtm_record_compensation_slack_notification(
  p_cost_id uuid,
  p_channel_id text,
  p_slack_ts text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cost public.gtm_costs;
  content public.gtm_contents;
begin
  select * into cost from public.gtm_costs where id = p_cost_id;
  if not found then raise exception 'Compensation cost not found'; end if;
  select target.* into content from public.gtm_contents target
  where target.compensation_cost_id = cost.id;
  if not found then raise exception 'Compensation content not found'; end if;
  perform set_config('gtm.actor', 'content-metrics-settlement', true);
  insert into public.gtm_activities (
    entity, entity_id, kind, body, payload, source_ref, provider,
    connection_ref, external_id
  ) values (
    'gtm_contents', content.id, 'notification_sent',
    'Slack notified about creator compensation',
    jsonb_build_object('cost_id', cost.id, 'slack_ts', p_slack_ts),
    'slack:' || coalesce(p_slack_ts, cost.id::text), 'slack',
    p_channel_id, cost.id::text
  ) on conflict (provider, connection_ref, external_id) do nothing;
end;
$$;

create or replace function public.gtm_sheet_view(
  p_token text,
  p_view text,
  p_id uuid default null,
  p_limit integer default 500,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare credential public.gtm_access_tokens; read_table text; result jsonb; next_offset integer;
begin
  select * into credential from public.gtm_access_tokens
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and revoked_at is null and expires_at > now();
  if not found then raise exception 'Invalid or expired GTM access token' using errcode = '28000'; end if;
  read_table := case p_view
    when 'creator_directory' then 'gtm_creator_directory_sheet_v1'
    when 'connected_creators' then 'gtm_connected_creator_sheet_v1'
    when 'outreach_log' then 'gtm_outreach_sheet_v1'
    when 'outreach_review' then 'gtm_outreach_review_sheet_v1'
    when 'compensation_strategies' then 'gtm_compensation_strategy_sheet_v1'
    when 'contents' then 'gtm_content_sheet_v1'
    else null end;
  if read_table is null then raise exception 'Unknown GTM Sheet view'; end if;
  if p_limit < 1 or p_limit > 500 then raise exception 'p_limit must be between 1 and 500'; end if;
  if p_offset < 0 then raise exception 'p_offset cannot be negative'; end if;
  update public.gtm_access_tokens set last_used_at = now() where id in (
    select id from public.gtm_access_tokens where id = credential.id
      and (last_used_at is null or last_used_at < now() - interval '5 minutes')
    for update skip locked
  );
  if p_id is not null then
    execute format('select to_jsonb(row) from public.%I row where id = $1', read_table)
      into result using p_id;
    return jsonb_build_object('record', result, 'as_of', now());
  end if;
  if p_view = 'outreach_log' then
    execute format('select coalesce(jsonb_agg(to_jsonb(row)), ''[]''::jsonb) from (select * from public.%I where archived_at is null order by occurred_at desc, ref desc limit $1 offset $2) row', read_table)
      into result using p_limit, p_offset;
  elsif p_view = 'outreach_review' then
    execute format('select coalesce(jsonb_agg(to_jsonb(row)), ''[]''::jsonb) from (select * from public.%I where archived_at is null order by case status when ''approved'' then 1 when ''ready_for_review'' then 2 when ''needs_revision'' then 3 when ''failed'' then 4 else 5 end, ref desc limit $1 offset $2) row', read_table)
      into result using p_limit, p_offset;
  elsif p_view = 'contents' then
    execute format('select coalesce(jsonb_agg(to_jsonb(row)), ''[]''::jsonb) from (select * from public.%I where archived_at is null order by published_at desc nulls last, ref desc limit $1 offset $2) row', read_table)
      into result using p_limit, p_offset;
  else
    execute format('select coalesce(jsonb_agg(to_jsonb(row)), ''[]''::jsonb) from (select * from public.%I where archived_at is null order by ref limit $1 offset $2) row', read_table)
      into result using p_limit, p_offset;
  end if;
  next_offset := case when jsonb_array_length(result) = p_limit then p_offset + p_limit end;
  return jsonb_build_object('rows', result, 'offset', p_offset,
    'next_offset', next_offset, 'as_of', now());
end;
$$;

revoke all on function public.gtm_compensation_strategy_save(
  text, uuid, bigint, jsonb, uuid
) from public;
grant execute on function public.gtm_compensation_strategy_save(
  text, uuid, bigint, jsonb, uuid
) to anon, authenticated, service_role;
revoke all on function public.gtm_compensation_estimate(text, uuid, uuid[]) from public;
grant execute on function public.gtm_compensation_estimate(text, uuid, uuid[])
  to anon, authenticated, service_role;
revoke all on function public.gtm_outreach_apply_compensation_strategy(
  text, uuid, uuid[]
) from public;
grant execute on function public.gtm_outreach_apply_compensation_strategy(
  text, uuid, uuid[]
) to anon, authenticated, service_role;
revoke all on function public.gtm_finalize_content_compensation(uuid),
  public.gtm_record_compensation_slack_notification(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.gtm_finalize_content_compensation(uuid),
  public.gtm_record_compensation_slack_notification(uuid, text, text)
to service_role;
revoke all on public.gtm_compensation_strategy_sheet_v1,
  public.gtm_content_sheet_v1 from public, anon, authenticated;

comment on table public.gtm_compensation_strategies is
  'Versioned creator compensation experiments. Content assignment freezes exact terms.';
comment on column public.gtm_contents.compensation_snapshot is
  'Immutable assigned economics, including proportional view calculation inputs.';
comment on function public.gtm_compensation_estimate(text, uuid, uuid[]) is
  'Estimates creator costs from each creator median views across up to ten recent measured contents.';

notify pgrst, 'reload schema';
