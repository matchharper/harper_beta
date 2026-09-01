begin;

create table if not exists public.talent_role_activity (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null
    references public.talent_opportunity_recommendation(id) on delete cascade,
  kind text not null,
  content text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint talent_role_activity_kind_length_check
    check (char_length(kind) between 1 and 100),
  constraint talent_role_activity_content_length_check
    check (content is null or char_length(content) <= 10000),
  constraint talent_role_activity_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists talent_role_activity_recommendation_created_idx
  on public.talent_role_activity (recommendation_id, created_at desc, id desc);

alter table public.talent_role_activity enable row level security;
revoke all on table public.talent_role_activity
  from public, anon, authenticated;
grant all on table public.talent_role_activity to service_role;

comment on table public.talent_role_activity is
  'Append-only talent-authored role activity. Company requests and meeting facts stay in their source tables.';
comment on column public.talent_role_activity.kind is
  'Extensible activity kind. Current writers use memo and saved_stage_changed.';

insert into public.talent_role_activity (
  recommendation_id,
  kind,
  content,
  metadata,
  created_at
)
select
  recommendation.id,
  'memo',
  btrim(recommendation.talent_memo),
  jsonb_build_object(
    'source', 'talent_memo_backfill',
    'timestampSource', 'recommendation_updated_at'
  ),
  coalesce(
    recommendation.updated_at,
    recommendation.created_at,
    timezone('utc', now())
  )
from public.talent_opportunity_recommendation recommendation
where nullif(btrim(recommendation.talent_memo), '') is not null
  and not exists (
    select 1
    from public.talent_role_activity activity
    where activity.recommendation_id = recommendation.id
      and activity.kind = 'memo'
      and activity.metadata ->> 'source' = 'talent_memo_backfill'
  );

create or replace function public.append_talent_role_memo_activity_v1(
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_content text := btrim(coalesce(p_content, ''));
begin
  if char_length(v_content) not between 1 and 10000 then
    raise exception 'talent_role_activity_memo_invalid'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.talent_opportunity_recommendation recommendation
    where recommendation.id = p_recommendation_id
      and recommendation.talent_id = p_talent_id
  ) then
    raise exception 'talent_role_activity_recommendation_not_found'
      using errcode = 'P0002';
  end if;

  insert into public.talent_role_activity (
    recommendation_id,
    kind,
    content,
    metadata
  ) values (
    p_recommendation_id,
    'memo',
    v_content,
    jsonb_build_object('source', 'career')
  )
  returning id into v_activity_id;

  -- Compatibility snapshot for older readers. The append-only activity row is
  -- the source of truth for the Career detail timeline.
  update public.talent_opportunity_recommendation
  set talent_memo = v_content,
      updated_at = timezone('utc', now())
  where id = p_recommendation_id
    and talent_id = p_talent_id;

  return v_activity_id;
end;
$$;

revoke all on function public.append_talent_role_memo_activity_v1(
  uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.append_talent_role_memo_activity_v1(
  uuid, uuid, text
) to service_role;

create or replace function public.move_talent_role_saved_stage_v1(
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_saved_stage text,
  p_record_activity boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_previous_stage text;
begin
  if p_saved_stage not in ('saved', 'applied', 'connected', 'closed', 'hidden') then
    raise exception 'talent_role_activity_saved_stage_invalid'
      using errcode = '22023';
  end if;

  select recommendation.saved_stage
  into v_previous_stage
  from public.talent_opportunity_recommendation recommendation
  where recommendation.id = p_recommendation_id
    and recommendation.talent_id = p_talent_id
  for update;

  if not found then
    raise exception 'talent_role_activity_recommendation_not_found'
      using errcode = 'P0002';
  end if;

  if v_previous_stage is not distinct from p_saved_stage then
    return jsonb_build_object(
      'activityId', null,
      'previousStage', v_previous_stage,
      'savedStage', p_saved_stage
    );
  end if;

  update public.talent_opportunity_recommendation
  set saved_stage = p_saved_stage,
      updated_at = timezone('utc', now())
  where id = p_recommendation_id
    and talent_id = p_talent_id;

  if coalesce(p_record_activity, true) then
    insert into public.talent_role_activity (
      recommendation_id,
      kind,
      metadata
    ) values (
      p_recommendation_id,
      'saved_stage_changed',
      jsonb_strip_nulls(
        jsonb_build_object(
          'source', 'career',
          'previousStage', v_previous_stage,
          'savedStage', p_saved_stage
        )
      )
    )
    returning id into v_activity_id;
  end if;

  return jsonb_build_object(
    'activityId', v_activity_id,
    'previousStage', v_previous_stage,
    'savedStage', p_saved_stage
  );
end;
$$;

revoke all on function public.move_talent_role_saved_stage_v1(
  uuid, uuid, text, boolean
) from public, anon, authenticated;
grant execute on function public.move_talent_role_saved_stage_v1(
  uuid, uuid, text, boolean
) to service_role;

create or replace function public.update_talent_role_feedback_v1(
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_feedback text,
  p_feedback_reason text,
  p_saved_stage text,
  p_feedback_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_next_stage text;
  v_previous_stage text;
begin
  if p_feedback is not null and p_feedback not in ('like', 'dislike') then
    raise exception 'talent_role_activity_feedback_invalid'
      using errcode = '22023';
  end if;
  if p_saved_stage is not null
     and p_saved_stage not in ('saved', 'applied', 'connected', 'closed', 'hidden') then
    raise exception 'talent_role_activity_saved_stage_invalid'
      using errcode = '22023';
  end if;

  select recommendation.saved_stage
  into v_previous_stage
  from public.talent_opportunity_recommendation recommendation
  where recommendation.id = p_recommendation_id
    and recommendation.talent_id = p_talent_id
  for update;

  if not found then
    raise exception 'talent_role_activity_recommendation_not_found'
      using errcode = 'P0002';
  end if;

  v_next_stage := case when p_feedback = 'like' then p_saved_stage else null end;

  update public.talent_opportunity_recommendation
  set feedback = p_feedback,
      feedback_at = case when p_feedback is null then null else p_feedback_at end,
      feedback_reason = case
        when p_feedback is null then null
        else nullif(btrim(coalesce(p_feedback_reason, '')), '')
      end,
      saved_stage = v_next_stage,
      updated_at = timezone('utc', now())
  where id = p_recommendation_id
    and talent_id = p_talent_id;

  if v_next_stage is not null
     and v_previous_stage is distinct from v_next_stage then
    insert into public.talent_role_activity (
      recommendation_id,
      kind,
      metadata
    ) values (
      p_recommendation_id,
      'saved_stage_changed',
      jsonb_strip_nulls(
        jsonb_build_object(
          'source', 'career',
          'previousStage', v_previous_stage,
          'savedStage', v_next_stage
        )
      )
    )
    returning id into v_activity_id;
  end if;

  return jsonb_build_object(
    'activityId', v_activity_id,
    'previousStage', v_previous_stage,
    'savedStage', v_next_stage
  );
end;
$$;

revoke all on function public.update_talent_role_feedback_v1(
  uuid, uuid, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.update_talent_role_feedback_v1(
  uuid, uuid, text, text, text, timestamptz
) to service_role;

commit;
