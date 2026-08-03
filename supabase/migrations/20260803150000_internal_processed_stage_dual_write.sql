-- Keep the existing internal pipeline tags and the recommendation-level
-- processed_stage projection in sync without making either legacy data path
-- unavailable. Existing rows are intentionally not backfilled by this
-- migration; use the preview/backfill functions below after reviewing the
-- production diff.

alter table public.talent_opportunity_recommendation
add column if not exists processed_stage_version uuid;

create table if not exists public.internal_processed_stage_backfill_audit (
  migration_run_id uuid not null,
  recommendation_id uuid not null,
  previous_processed_stage text,
  previous_processed_stage_version uuid,
  previous_updated_at timestamptz,
  derived_processed_stage text,
  applied_processed_stage_version uuid,
  applied_updated_at timestamptz,
  backed_up_at timestamptz not null default now(),
  primary key (migration_run_id, recommendation_id)
);

alter table public.internal_processed_stage_backfill_audit
add column if not exists previous_processed_stage_version uuid,
add column if not exists previous_updated_at timestamptz,
add column if not exists applied_processed_stage_version uuid,
add column if not exists applied_updated_at timestamptz;

alter table public.internal_processed_stage_backfill_audit
enable row level security;

revoke all on table public.internal_processed_stage_backfill_audit
from public, anon, authenticated;

create or replace function public.version_talent_opportunity_processed_stage_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.processed_stage is not null then
      new.processed_stage_version := gen_random_uuid();
    else
      new.processed_stage_version := null;
    end if;
  elsif old.processed_stage is distinct from new.processed_stage then
    new.processed_stage_version := gen_random_uuid();
  else
    -- The version is an internal change token, not a caller-controlled field.
    new.processed_stage_version := old.processed_stage_version;
  end if;
  return new;
end;
$$;

drop trigger if exists version_talent_opportunity_processed_stage
on public.talent_opportunity_recommendation;

create trigger version_talent_opportunity_processed_stage
before insert or update of processed_stage, processed_stage_version
on public.talent_opportunity_recommendation
for each row execute function public.version_talent_opportunity_processed_stage_trigger();

create or replace function public.internal_opportunity_is_stage_tag(
  p_tag text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select btrim(coalesce(p_tag, '')) in (
    '내부:수락',
    '내부:아카이브',
    '내부:연결됨',
    '내부:최종오퍼',
    '내부:보류',
    '내부:연결대기',
    '내부:프로세스중단',
    '내부:거절'
  ) or btrim(coalesce(p_tag, '')) like '내부단계:%';
$$;

create or replace function public.internal_opportunity_canonical_stage_from_tag(
  p_role_id uuid,
  p_tag text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_custom_stage_id uuid;
  v_custom_token text;
  v_tag text;
begin
  v_tag := btrim(coalesce(p_tag, ''));

  case v_tag
    when '내부:수락' then return 'accepted';
    when '내부:아카이브' then return 'archived';
    when '내부:연결됨' then return 'connected';
    when '내부:최종오퍼' then return 'final_offer';
    when '내부:보류' then return 'hold';
    when '내부:연결대기' then return 'pending_connection';
    when '내부:프로세스중단' then return 'process_stopped';
    when '내부:거절' then return 'rejected';
    else null;
  end case;

  if v_tag not like '내부단계:%' then
    return null;
  end if;

  v_custom_token := lower(
    replace(
      substring(v_tag from char_length('내부단계:') + 1),
      '-',
      ''
    )
  );
  if v_custom_token !~ '^[0-9a-f]{32}$' then
    return null;
  end if;

  select stage.id
  into v_custom_stage_id
  from public.ops_matching_role_stages stage
  where stage.role_id = p_role_id
    and lower(replace(stage.id::text, '-', '')) = v_custom_token
  limit 1;

  if v_custom_stage_id is null then
    return null;
  end if;
  return 'custom:' || v_custom_stage_id::text;
end;
$$;

create or replace function public.internal_opportunity_is_canonical_stage(
  p_role_id uuid,
  p_stage text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_custom_stage_id uuid;
  v_stage text;
  v_token text;
begin
  v_stage := btrim(coalesce(p_stage, ''));
  if v_stage in (
    'accepted',
    'archived',
    'connected',
    'final_offer',
    'hold',
    'pending_connection',
    'process_stopped',
    'rejected'
  ) then
    return true;
  end if;

  if v_stage not like 'custom:%' then
    return false;
  end if;
  v_token := lower(
    replace(substring(v_stage from char_length('custom:') + 1), '-', '')
  );
  if v_token !~ '^[0-9a-f]{32}$' then
    return false;
  end if;

  select stage.id
  into v_custom_stage_id
  from public.ops_matching_role_stages stage
  where stage.role_id = p_role_id
    and lower(replace(stage.id::text, '-', '')) = v_token
  limit 1;
  return v_custom_stage_id is not null;
end;
$$;

create or replace function public.resolve_internal_opportunity_processed_stage(
  p_talent_id uuid,
  p_role_id uuid,
  p_feedback text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_stage text;
  v_tag record;
begin
  for v_tag in
    select tag.tag
    from public.talent_opportunity_tag tag
    where tag.talent_id = p_talent_id
      and tag.opportunity_id = p_role_id
      and public.internal_opportunity_is_stage_tag(tag.tag)
    order by tag.updated_at desc, tag.created_at desc, tag.id desc
  loop
    v_stage := public.internal_opportunity_canonical_stage_from_tag(
      p_role_id,
      v_tag.tag
    );
    if v_stage is not null then
      return v_stage;
    end if;
  end loop;

  if lower(btrim(coalesce(p_feedback, ''))) in ('like', 'positive') then
    return 'accepted';
  end if;
  if lower(btrim(coalesce(p_feedback, ''))) in ('dislike', 'negative') then
    return 'rejected';
  end if;
  return null;
end;
$$;

create or replace function public.sync_internal_opportunity_processed_stage(
  p_talent_id uuid,
  p_role_id uuid,
  p_overwrite_legacy boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.talent_opportunity_recommendation recommendation
  set processed_stage = public.resolve_internal_opportunity_processed_stage(
    recommendation.talent_id,
    recommendation.role_id,
    recommendation.feedback
  )
  from public.company_roles role
  where recommendation.talent_id = p_talent_id
    and recommendation.role_id = p_role_id
    and role.role_id = recommendation.role_id
    and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
    and (
      p_overwrite_legacy
      or recommendation.processed_stage is null
    )
    and recommendation.processed_stage is distinct from
      public.resolve_internal_opportunity_processed_stage(
        recommendation.talent_id,
        recommendation.role_id,
        recommendation.feedback
      );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.sync_internal_processed_stage_from_tag_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('DELETE', 'UPDATE')
    and public.internal_opportunity_is_stage_tag(old.tag)
  then
    perform public.sync_internal_opportunity_processed_stage(
      old.talent_id,
      old.opportunity_id,
      true
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and public.internal_opportunity_is_stage_tag(new.tag)
  then
    if tg_op <> 'UPDATE'
      or old.talent_id is distinct from new.talent_id
      or old.opportunity_id is distinct from new.opportunity_id
      or old.tag is distinct from new.tag
    then
      perform public.sync_internal_opportunity_processed_stage(
        new.talent_id,
        new.opportunity_id,
        true
      );
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_internal_processed_stage_from_tag
on public.talent_opportunity_tag;

create trigger sync_internal_processed_stage_from_tag
after insert or update or delete on public.talent_opportunity_tag
for each row execute function public.sync_internal_processed_stage_from_tag_trigger();

create or replace function public.sync_internal_processed_stage_from_recommendation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and (
      old.talent_id is distinct from new.talent_id
      or old.role_id is distinct from new.role_id
    )
  then
    perform public.sync_internal_opportunity_processed_stage(
      old.talent_id,
      old.role_id,
      true
    );
  end if;

  perform public.sync_internal_opportunity_processed_stage(
    new.talent_id,
    new.role_id,
    tg_op = 'UPDATE'
  );
  return new;
end;
$$;

create or replace function public.sync_internal_processed_stage_from_custom_stage_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage record;
  v_tag text;
  v_talent record;
begin
  for v_stage in
    select old.id as id, old.role_id as role_id
    where tg_op in ('DELETE', 'UPDATE')
    union all
    select new.id as id, new.role_id as role_id
    where tg_op in ('INSERT', 'UPDATE')
      and (
        tg_op = 'INSERT'
        or old.id is distinct from new.id
        or old.role_id is distinct from new.role_id
      )
  loop
    v_tag := '내부단계:' || lower(replace(v_stage.id::text, '-', ''));
    for v_talent in
      select distinct tag.talent_id
      from public.talent_opportunity_tag tag
      where tag.opportunity_id = v_stage.role_id
        and lower(btrim(tag.tag)) = v_tag
    loop
      perform public.sync_internal_opportunity_processed_stage(
        v_talent.talent_id,
        v_stage.role_id,
        true
      );
    end loop;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_internal_processed_stage_from_custom_stage
on public.ops_matching_role_stages;

create trigger sync_internal_processed_stage_from_custom_stage
after insert or delete or update of id, role_id
on public.ops_matching_role_stages
for each row execute function public.sync_internal_processed_stage_from_custom_stage_trigger();

drop trigger if exists sync_internal_processed_stage_after_recommendation_insert
on public.talent_opportunity_recommendation;
drop trigger if exists sync_internal_processed_stage_after_feedback_change
on public.talent_opportunity_recommendation;

create trigger sync_internal_processed_stage_after_recommendation_insert
after insert on public.talent_opportunity_recommendation
for each row execute function public.sync_internal_processed_stage_from_recommendation_trigger();

create trigger sync_internal_processed_stage_after_feedback_change
after update of feedback, talent_id, role_id
on public.talent_opportunity_recommendation
for each row
when (
  old.feedback is distinct from new.feedback
  or old.talent_id is distinct from new.talent_id
  or old.role_id is distinct from new.role_id
)
execute function public.sync_internal_processed_stage_from_recommendation_trigger();

create or replace function public.preview_internal_opportunity_processed_stage_backfill(
  p_limit integer default 1000
)
returns table (
  recommendation_id uuid,
  talent_id uuid,
  role_id uuid,
  feedback text,
  current_processed_stage text,
  derived_processed_stage text,
  migration_action text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    recommendation.id as recommendation_id,
    recommendation.talent_id,
    recommendation.role_id,
    recommendation.feedback,
    recommendation.processed_stage as current_processed_stage,
    derived.processed_stage as derived_processed_stage,
    case
      when recommendation.processed_stage is null
        and derived.processed_stage is not null
        then 'fill_null'
      when recommendation.processed_stage is not null
        and derived.processed_stage is null
        then 'clear'
      when not public.internal_opportunity_is_canonical_stage(
        recommendation.role_id,
        recommendation.processed_stage
      ) then 'replace_legacy'
      else 'change_canonical'
    end as migration_action
  from public.talent_opportunity_recommendation recommendation
  join public.company_roles role
    on role.role_id = recommendation.role_id
   and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
  cross join lateral (
    select public.resolve_internal_opportunity_processed_stage(
      recommendation.talent_id,
      recommendation.role_id,
      recommendation.feedback
    ) as processed_stage
  ) derived
  where recommendation.processed_stage is distinct from derived.processed_stage
  order by recommendation.updated_at desc, recommendation.id desc
  limit greatest(1, least(coalesce(p_limit, 1000), 5000));
$$;

create or replace function public.backfill_internal_opportunity_processed_stage(
  p_apply boolean default false
)
returns table (
  apply_requested boolean,
  migration_run_id uuid,
  total_internal_rows bigint,
  already_aligned_rows bigint,
  would_update_rows bigint,
  would_fill_null_rows bigint,
  would_replace_legacy_rows bigint,
  would_clear_rows bigint,
  would_change_canonical_rows bigint,
  updated_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aligned bigint := 0;
  v_clear bigint := 0;
  v_canonical bigint := 0;
  v_fill bigint := 0;
  v_legacy bigint := 0;
  v_run_id uuid := null;
  v_total bigint := 0;
  v_update bigint := 0;
  v_updated bigint := 0;
begin
  with snapshot as (
    select
      recommendation.id,
      recommendation.processed_stage as current_stage,
      public.resolve_internal_opportunity_processed_stage(
        recommendation.talent_id,
        recommendation.role_id,
        recommendation.feedback
      ) as derived_stage,
      public.internal_opportunity_is_canonical_stage(
        recommendation.role_id,
        recommendation.processed_stage
      ) as current_is_canonical
    from public.talent_opportunity_recommendation recommendation
    join public.company_roles role
      on role.role_id = recommendation.role_id
     and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
  )
  select
    count(*),
    count(*) filter (where current_stage is not distinct from derived_stage),
    count(*) filter (where current_stage is distinct from derived_stage),
    count(*) filter (where current_stage is null and derived_stage is not null),
    count(*) filter (
      where current_stage is not null
        and derived_stage is null
    ),
    count(*) filter (
      where current_stage is distinct from derived_stage
        and current_stage is not null
        and derived_stage is not null
        and not current_is_canonical
    ),
    count(*) filter (
      where current_stage is distinct from derived_stage
        and current_stage is not null
        and derived_stage is not null
        and current_is_canonical
    )
  into
    v_total,
    v_aligned,
    v_update,
    v_fill,
    v_clear,
    v_legacy,
    v_canonical
  from snapshot;

  if p_apply then
    v_run_id := gen_random_uuid();

    insert into public.internal_processed_stage_backfill_audit (
      migration_run_id,
      recommendation_id,
      previous_processed_stage,
      previous_processed_stage_version,
      previous_updated_at,
      derived_processed_stage
    )
    select
      v_run_id,
      recommendation.id,
      recommendation.processed_stage,
      recommendation.processed_stage_version,
      recommendation.updated_at,
      public.resolve_internal_opportunity_processed_stage(
        recommendation.talent_id,
        recommendation.role_id,
        recommendation.feedback
      )
    from public.talent_opportunity_recommendation recommendation
    join public.company_roles role
      on role.role_id = recommendation.role_id
     and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
    where recommendation.processed_stage is distinct from
      public.resolve_internal_opportunity_processed_stage(
        recommendation.talent_id,
        recommendation.role_id,
        recommendation.feedback
      )
    for update of recommendation;

    update public.talent_opportunity_recommendation recommendation
    set processed_stage = audit.derived_processed_stage
    from public.internal_processed_stage_backfill_audit audit
    where audit.migration_run_id = v_run_id
      and audit.recommendation_id = recommendation.id
      and recommendation.processed_stage is not distinct from
        audit.previous_processed_stage;
    get diagnostics v_updated = row_count;

    update public.internal_processed_stage_backfill_audit audit
    set
      applied_processed_stage_version = recommendation.processed_stage_version,
      applied_updated_at = recommendation.updated_at
    from public.talent_opportunity_recommendation recommendation
    where audit.migration_run_id = v_run_id
      and recommendation.id = audit.recommendation_id;
  end if;

  return query select
    p_apply,
    v_run_id,
    v_total,
    v_aligned,
    v_update,
    v_fill,
    v_legacy,
    v_clear,
    v_canonical,
    v_updated;
end;
$$;

create or replace function public.restore_internal_opportunity_processed_stage_backfill(
  p_migration_run_id uuid,
  p_apply boolean default false
)
returns table (
  apply_requested boolean,
  migration_run_id uuid,
  backed_up_rows bigint,
  restorable_rows bigint,
  already_restored_rows bigint,
  conflict_rows bigint,
  missing_rows bigint,
  restored_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_backed_up bigint := 0;
  v_already_restored bigint := 0;
  v_conflict bigint := 0;
  v_missing bigint := 0;
  v_restorable bigint := 0;
  v_restored bigint := 0;
begin
  if p_migration_run_id is null then
    raise exception using
      errcode = '22023',
      message = 'migration_run_id_is_required';
  end if;

  select
    count(*),
    count(*) filter (
      where recommendation.id is not null
        and recommendation.processed_stage is not distinct from
          audit.derived_processed_stage
        and recommendation.processed_stage_version is not distinct from
          audit.applied_processed_stage_version
        and recommendation.processed_stage is distinct from
          audit.previous_processed_stage
    ),
    count(*) filter (
      where recommendation.id is not null
        and recommendation.processed_stage is not distinct from
          audit.previous_processed_stage
    ),
    count(*) filter (
      where recommendation.id is not null
        and (
          recommendation.processed_stage is distinct from
            audit.derived_processed_stage
          or recommendation.processed_stage_version is distinct from
            audit.applied_processed_stage_version
        )
        and recommendation.processed_stage is distinct from
          audit.previous_processed_stage
    ),
    count(*) filter (where recommendation.id is null)
  into
    v_backed_up,
    v_restorable,
    v_already_restored,
    v_conflict,
    v_missing
  from public.internal_processed_stage_backfill_audit audit
  left join public.talent_opportunity_recommendation recommendation
    on recommendation.id = audit.recommendation_id
  where audit.migration_run_id = p_migration_run_id;

  if p_apply then
    update public.talent_opportunity_recommendation recommendation
    set processed_stage = audit.previous_processed_stage
    from public.internal_processed_stage_backfill_audit audit
    where audit.migration_run_id = p_migration_run_id
      and recommendation.id = audit.recommendation_id
      and recommendation.processed_stage is not distinct from
        audit.derived_processed_stage
      and recommendation.processed_stage_version is not distinct from
        audit.applied_processed_stage_version
      and recommendation.processed_stage is distinct from
        audit.previous_processed_stage;
    get diagnostics v_restored = row_count;
  end if;

  return query select
    p_apply,
    p_migration_run_id,
    v_backed_up,
    v_restorable,
    v_already_restored,
    v_conflict,
    v_missing,
    v_restored;
end;
$$;

revoke all on function public.internal_opportunity_is_stage_tag(text)
from public, anon, authenticated;
revoke all on function public.version_talent_opportunity_processed_stage_trigger()
from public, anon, authenticated;
revoke all on function public.internal_opportunity_canonical_stage_from_tag(uuid, text)
from public, anon, authenticated;
revoke all on function public.internal_opportunity_is_canonical_stage(uuid, text)
from public, anon, authenticated;
revoke all on function public.resolve_internal_opportunity_processed_stage(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.sync_internal_opportunity_processed_stage(uuid, uuid, boolean)
from public, anon, authenticated;
revoke all on function public.sync_internal_processed_stage_from_tag_trigger()
from public, anon, authenticated;
revoke all on function public.sync_internal_processed_stage_from_recommendation_trigger()
from public, anon, authenticated;
revoke all on function public.sync_internal_processed_stage_from_custom_stage_trigger()
from public, anon, authenticated;
revoke all on function public.preview_internal_opportunity_processed_stage_backfill(integer)
from public, anon, authenticated;
revoke all on function public.backfill_internal_opportunity_processed_stage(boolean)
from public, anon, authenticated;
revoke all on function public.restore_internal_opportunity_processed_stage_backfill(uuid, boolean)
from public, anon, authenticated;

grant execute on function public.preview_internal_opportunity_processed_stage_backfill(integer)
to service_role;
grant execute on function public.backfill_internal_opportunity_processed_stage(boolean)
to service_role;
grant execute on function public.restore_internal_opportunity_processed_stage_backfill(uuid, boolean)
to service_role;

comment on function public.preview_internal_opportunity_processed_stage_backfill(integer)
is 'Dry-run rows for migrating internal processed_stage from pipeline tags/feedback. Does not mutate data.';
comment on function public.backfill_internal_opportunity_processed_stage(boolean)
is 'Summarizes or explicitly applies the internal processed_stage backfill with a per-run backup. The migration never calls apply automatically.';
comment on function public.restore_internal_opportunity_processed_stage_backfill(uuid, boolean)
is 'Previews or restores one processed_stage backfill run. Rows changed after the backfill are reported as conflicts and never overwritten.';
