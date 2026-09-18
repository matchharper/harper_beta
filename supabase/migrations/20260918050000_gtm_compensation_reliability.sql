-- Close the remaining settlement reliability gaps found after the first live run.
-- Fixed-price work must settle without platform metrics, and economics already
-- used in an outreach proposal must remain immutable before content exists.

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
      and status = 'active'
      and archived_at is null;
    if not found then
      raise exception 'Active compensation strategy not found';
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
      'calculation_method', case
        when strategy.pricing_model = 'fixed' then 'fixed'
        else 'proportional'
      end,
      'frozen_at', now()
    );
  end if;

  if new.published_at is not null then
    new.platform_metrics_due_at := case
      when new.compensation_snapshot ->> 'pricing_model' = 'fixed'
        then new.published_at
      else new.published_at
        + make_interval(days => (new.compensation_snapshot ->> 'measurement_window_days')::integer)
    end;
  else
    new.platform_metrics_due_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists gtm_freeze_content_compensation on public.gtm_contents;
create trigger gtm_freeze_content_compensation
before insert or update of collaboration_id, compensation_strategy_id,
  compensation_snapshot, published_at, platform_metrics_due_at
on public.gtm_contents
for each row execute function public.gtm_freeze_content_compensation();

create or replace function public.gtm_guard_compensation_strategy_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    exists (
      select 1 from public.gtm_contents content
      where content.compensation_strategy_id = old.id
    )
    or exists (
      select 1 from public.gtm_outreach_dispatches dispatch
      where dispatch.compensation_strategy_id = old.id
        and dispatch.archived_at is null
    )
    or exists (
      select 1 from public.gtm_collaborations collaboration
      where collaboration.compensation_strategy_id = old.id
        and collaboration.archived_at is null
    )
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
      'calculation_method', case when strategy.pricing_model = 'fixed'
        then 'fixed' else 'proportional' end
    ),
    'creators', coalesce(jsonb_agg(jsonb_build_object(
      'creator_id', estimate.id, 'creator_ref', estimate.ref,
      'creator_name', estimate.name,
      'estimated_views', estimate.estimated_views,
      'evidence_content_count', estimate.content_count,
      'estimated_cost', case
        when strategy.pricing_model = 'fixed' or estimate.content_count > 0
          then estimate.estimated_cost
        else null
      end,
      'evidence_status', case
        when strategy.pricing_model = 'fixed' then 'fixed_price_no_view_history_required'
        when estimate.content_count > 0 then 'estimated_from_recent_content'
        else 'missing_view_history'
      end
    ) order by estimate.estimated_cost desc nulls last), '[]'::jsonb),
    'known_estimated_total', sum(estimate.estimated_cost) filter (
      where strategy.pricing_model = 'fixed' or estimate.content_count > 0
    ),
    'missing_estimate_count', count(*) filter (
      where strategy.pricing_model <> 'fixed' and estimate.content_count = 0
    ),
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
  where id = p_strategy_id and status = 'active' and archived_at is null;
  if not found then raise exception 'Active compensation strategy not found'; end if;
  snapshot := jsonb_build_object(
    'strategy_id', strategy.id, 'strategy_ref', strategy.ref,
    'name', strategy.name, 'version', strategy.version,
    'pricing_model', strategy.pricing_model, 'currency', strategy.currency,
    'base_fee', strategy.base_fee,
    'measurement_window_days', strategy.measurement_window_days,
    'views_per_unit', strategy.views_per_unit,
    'amount_per_unit', strategy.amount_per_unit,
    'calculation_method', case when strategy.pricing_model = 'fixed'
      then 'fixed' else 'proportional' end,
    'frozen_at', now()
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
    v_estimated_cost := case
      when strategy.pricing_model = 'fixed'
        then public.gtm_compensation_amount(snapshot, null)
      when v_estimated_views is null then null
      else public.gtm_compensation_amount(snapshot, v_estimated_views)
    end;
    update public.gtm_outreach_dispatches target set
      compensation_strategy_id = strategy.id,
      compensation_snapshot = snapshot,
      estimated_views = v_estimated_views,
      estimated_cost = v_estimated_cost
    where target.id = dispatch.id;
    if dispatch.collaboration_id is not null then
      update public.gtm_collaborations collaboration
      set compensation_strategy_id = strategy.id
      where collaboration.id = dispatch.collaboration_id;

      -- Carry the newly agreed default into draft content. Published content
      -- keeps the snapshot under which it was actually commissioned.
      update public.gtm_contents content
      set compensation_strategy_id = strategy.id
      where content.collaboration_id = dispatch.collaboration_id
        and content.archived_at is null
        and content.published_at is null
        and content.compensation_cost_id is null;
    end if;
    result := result || jsonb_build_array(jsonb_build_object(
      'dispatch_id', dispatch.id, 'dispatch_ref', dispatch.ref,
      'creator_id', dispatch.creator_id,
      'estimated_views', v_estimated_views, 'estimated_cost', v_estimated_cost,
      'currency', strategy.currency,
      'evidence_status', case
        when strategy.pricing_model = 'fixed' then 'fixed_price_no_view_history_required'
        when v_estimated_views is null then 'missing_view_history'
        else 'estimated_from_recent_content'
      end
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
  likes public.gtm_metric_snapshots;
  comments_non_author public.gtm_metric_snapshots;
  amount numeric;
  source text;
  plan_currency text;
  notify_needed boolean;
  needs_views boolean;
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
    needs_views := content.compensation_snapshot ->> 'pricing_model' <> 'fixed';
    if needs_views then
      select * into views from public.gtm_metric_snapshots metric
      where metric.content_id = content.id and metric.metric = 'views'
        and metric.value is not null and metric.archived_at is null
        and metric.as_of >= content.platform_metrics_due_at
      order by metric.as_of, metric.created_at limit 1;
      if not found then
        raise exception 'A views observation at or after the due time is required';
      end if;
      select * into likes from public.gtm_metric_snapshots metric
      where metric.content_id = content.id and metric.metric = 'likes'
        and metric.archived_at is null and metric.source_ref = views.source_ref
      order by metric.created_at desc limit 1;
      select * into comments_non_author from public.gtm_metric_snapshots metric
      where metric.content_id = content.id and metric.metric = 'comments_non_author'
        and metric.archived_at is null and metric.source_ref = views.source_ref
      order by metric.created_at desc limit 1;
    else
      select * into views from public.gtm_metric_snapshots metric
      where metric.content_id = content.id and metric.metric = 'views'
        and metric.value is not null and metric.archived_at is null
      order by metric.as_of desc, metric.created_at desc limit 1;
      if found then
        select * into likes from public.gtm_metric_snapshots metric
        where metric.content_id = content.id and metric.metric = 'likes'
          and metric.archived_at is null and metric.source_ref = views.source_ref
        order by metric.created_at desc limit 1;
        select * into comments_non_author from public.gtm_metric_snapshots metric
        where metric.content_id = content.id and metric.metric = 'comments_non_author'
          and metric.archived_at is null and metric.source_ref = views.source_ref
        order by metric.created_at desc limit 1;
      end if;
    end if;
    amount := public.gtm_compensation_amount(content.compensation_snapshot, views.value);
    if amount is null then raise exception 'Frozen compensation terms are incomplete'; end if;
    if content.plan_id is null then
      raise exception 'Paid content must belong to a plan before compensation can finalize';
    end if;
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
      jsonb_strip_nulls(jsonb_build_object(
        'strategy', content.compensation_snapshot,
        'views', views.value,
        'likes', likes.value,
        'comments_non_author', comments_non_author.value,
        'metric_as_of', views.as_of,
        'metric_source_ref', views.source_ref
      ))::text,
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
      jsonb_strip_nulls(jsonb_build_object(
        'content_id', content.id, 'cost_id', cost.id,
        'amount', amount, 'currency', cost.currency, 'views', views.value,
        'likes', likes.value, 'comments_non_author', comments_non_author.value,
        'metric_as_of', views.as_of, 'strategy', content.compensation_snapshot
      )),
      source, 'contents_engine', 'compensation', cost.id::text
    ) on conflict (provider, connection_ref, external_id) do nothing;
  end if;

  notify_needed := not exists (
    select 1 from public.gtm_activities activity
    where activity.kind = 'notification_sent' and activity.provider = 'slack'
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

create or replace function public.gtm_pending_compensation_notifications(
  p_limit integer default 50
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100';
  end if;
  select coalesce(jsonb_agg(to_jsonb(candidate)), '[]'::jsonb)
  into result
  from (
    select
      content.id as content_id,
      content.ref as content_ref,
      content.title,
      content.compensation_snapshot as strategy,
      content.platform_metrics_finalized_at as metric_as_of_fallback,
      cost.id as cost_id,
      cost.ref as cost_ref,
      cost.incurred_amount as amount,
      cost.currency,
      nullif(cost.measurement_basis, '')::jsonb ->> 'metric_as_of'
        as metric_as_of,
      nullif(cost.measurement_basis, '')::jsonb ->> 'views'
        as measured_views
    from public.gtm_contents content
    join public.gtm_costs cost on cost.id = content.compensation_cost_id
    where content.archived_at is null
      and not exists (
        select 1
        from public.gtm_activities activity
        where activity.kind = 'notification_sent'
          and activity.provider = 'slack'
          and activity.external_id = cost.id::text
      )
    order by content.platform_metrics_finalized_at, content.ref
    limit p_limit
  ) candidate;
  return result;
end;
$$;

revoke all on function public.gtm_pending_compensation_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.gtm_pending_compensation_notifications(integer)
  to service_role;

comment on function public.gtm_compensation_estimate(text, uuid, uuid[]) is
  'Estimates variable pricing from recent measured views and returns fixed pricing without requiring view history.';
comment on function public.gtm_finalize_content_compensation(uuid) is
  'Finalizes fixed pricing when content is published without platform metrics; variable pricing waits for a due-time views observation.';
comment on function public.gtm_pending_compensation_notifications(integer) is
  'Returns finalized creator compensation costs that still need the idempotent Slack notification.';

notify pgrst, 'reload schema';
