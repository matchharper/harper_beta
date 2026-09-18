-- Keep one team-visible recommended experiment while preserving versioned terms.
-- "Recommended" is an operating choice, not a claim that causal ROI is proven.

alter table public.gtm_compensation_strategies
  add column if not exists is_recommended boolean not null default false,
  add column if not exists recommendation_reason text,
  add column if not exists recommended_at timestamptz;

create unique index if not exists gtm_compensation_strategy_one_recommended_idx
  on public.gtm_compensation_strategies (is_recommended)
  where is_recommended and archived_at is null;

create or replace function public.gtm_guard_recommended_compensation_strategy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_recommended and (
    new.status <> 'active'
    or new.archived_at is not null
    or nullif(btrim(coalesce(new.recommendation_reason, '')), '') is null
    or new.recommended_at is null
  ) then
    raise exception 'Recommended pricing strategy must be active with a reason and recommendation time';
  end if;
  return new;
end;
$$;

drop trigger if exists gtm_guard_recommended_compensation_strategy
  on public.gtm_compensation_strategies;
create trigger gtm_guard_recommended_compensation_strategy
before insert or update on public.gtm_compensation_strategies
for each row execute function public.gtm_guard_recommended_compensation_strategy();

-- The first experiment is the only currently comparable option. Present it as
-- the current operating recommendation without claiming it has proven ROI.
update public.gtm_compensation_strategies
set status = 'active',
    is_recommended = true,
    recommendation_reason =
      '현재 비교 가능한 유일한 실험안입니다. 성과 데이터가 쌓이면 새 버전과 비교해 갱신합니다.',
    recommended_at = now()
where name = '가격 전략 1'
  and version = 1
  and archived_at is null
  and not exists (
    select 1
    from public.gtm_compensation_strategies current_strategy
    where current_strategy.is_recommended
      and current_strategy.archived_at is null
  );

create or replace function public.gtm_recommend_compensation_strategy(
  p_token text,
  p_strategy_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  credential public.gtm_access_tokens;
  selected public.gtm_compensation_strategies;
begin
  select * into credential
  from public.gtm_access_tokens
  where token_hash = encode(
      sha256(convert_to(coalesce(p_token, ''), 'UTF8')),
      'hex'
    )
    and revoked_at is null
    and expires_at > now()
    and can_write;
  if not found then
    raise exception 'Invalid, expired, or read-only GTM access token'
      using errcode = '28000';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null
    or length(p_reason) > 500 then
    raise exception 'Recommendation reason must contain 1 to 500 characters';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('gtm-recommended-compensation-strategy', 0)
  );
  select * into selected
  from public.gtm_compensation_strategies
  where id = p_strategy_id
    and status = 'active'
    and archived_at is null
  for update;
  if not found then
    raise exception 'Only an active pricing strategy can be recommended';
  end if;

  update public.gtm_compensation_strategies
  set is_recommended = false,
      recommendation_reason = null,
      recommended_at = null
  where is_recommended
    and id <> selected.id;

  update public.gtm_compensation_strategies
  set is_recommended = true,
      recommendation_reason = btrim(p_reason),
      recommended_at = now()
  where id = selected.id
  returning * into selected;

  return jsonb_build_object('record', to_jsonb(selected), 'as_of', now());
end;
$$;

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
  strategy.archived_at,
  strategy.is_recommended,
  case when strategy.is_recommended
    then '⭐ 현재 권장 실험안'
    else ''
  end as recommended_label,
  strategy.recommendation_reason,
  strategy.recommended_at
from public.gtm_compensation_strategies strategy
left join public.gtm_contents content
  on content.compensation_strategy_id = strategy.id
 and content.archived_at is null
group by strategy.id;

revoke all on function public.gtm_guard_recommended_compensation_strategy()
  from public, anon, authenticated;
revoke all on function public.gtm_recommend_compensation_strategy(
  text, uuid, text
) from public;
grant execute on function public.gtm_recommend_compensation_strategy(
  text, uuid, text
) to anon, authenticated, service_role;
revoke all on public.gtm_compensation_strategy_sheet_v1
  from public, anon, authenticated;

comment on column public.gtm_compensation_strategies.is_recommended is
  'The one active pricing experiment currently recommended for new outreach; this is an operating choice, not proof of causal ROI.';
comment on function public.gtm_recommend_compensation_strategy(text, uuid, text) is
  'Atomically replaces the current recommended active pricing strategy and records the human-readable reason.';

notify pgrst, 'reload schema';
