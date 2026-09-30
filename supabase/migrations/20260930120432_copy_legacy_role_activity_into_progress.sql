-- Run only after the deployed company-side readers enforce open_to_company.
-- Keep both legacy sources intact and mirror writes from old application revisions.
do $verify_source$
begin
  if exists (
    select 1 from public.talent_role_activity
    where kind not in ('memo', 'saved_stage_changed')
       or (kind = 'memo' and nullif(btrim(content), '') is null)
  ) then
    raise exception 'unexpected_talent_role_activity_data';
  end if;
  if exists (
    select 1 from public.talent_role_activity activity
    left join public.talent_opportunity_recommendation recommendation
      on recommendation.id = activity.recommendation_id
    where recommendation.id is null
  ) then
    raise exception 'talent_role_activity_recommendation_missing';
  end if;
end;
$verify_source$;

create or replace function public.copy_legacy_talent_role_activity_to_progress_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_talent_id uuid;
  v_role_id uuid;
begin
  select talent_id, role_id into v_talent_id, v_role_id
  from public.talent_opportunity_recommendation
  where id = new.recommendation_id;
  if v_talent_id is null then
    raise exception 'talent_role_activity_recommendation_not_found'
      using errcode = 'P0002';
  end if;
  insert into public.talent_progress (
    id, talent_id, role_id, recommendation_id, kind, text, metadata, created_at
  ) values (
    new.id, v_talent_id, v_role_id, new.recommendation_id, new.kind,
    case when new.kind = 'memo' then new.content else '단계 변경' end,
    coalesce(new.metadata, '{}'::jsonb), new.created_at
  ) on conflict (id) do nothing;
  return new;
end;
$function$;

revoke all on function public.copy_legacy_talent_role_activity_to_progress_v1()
  from public, anon, authenticated;
drop trigger if exists copy_legacy_talent_role_activity_to_progress
  on public.talent_role_activity;
create trigger copy_legacy_talent_role_activity_to_progress
after insert on public.talent_role_activity
for each row execute function public.copy_legacy_talent_role_activity_to_progress_v1();

-- The old Career RPC updates this snapshot after appending an activity. Its
-- matching activity is already mirrored, so this only covers snapshot-only writes.
create or replace function public.copy_legacy_talent_memo_to_progress_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if nullif(btrim(new.talent_memo), '') is not null
    and not exists (
      select 1 from public.talent_progress progress
      where progress.recommendation_id = new.id
        and progress.kind = 'memo'
        and btrim(progress.text) = btrim(new.talent_memo)
    ) then
    insert into public.talent_progress (
      talent_id, role_id, recommendation_id, kind, text, metadata, created_at
    ) values (
      new.talent_id, new.role_id, new.id, 'memo', btrim(new.talent_memo),
      jsonb_build_object('source', 'talent_memo_backfill'), new.updated_at
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.copy_legacy_talent_memo_to_progress_v1()
  from public, anon, authenticated;
drop trigger if exists copy_legacy_talent_memo_to_progress
  on public.talent_opportunity_recommendation;
create trigger copy_legacy_talent_memo_to_progress
after insert or update of talent_memo on public.talent_opportunity_recommendation
for each row execute function public.copy_legacy_talent_memo_to_progress_v1();

alter table public.talent_progress disable trigger talent_progress_behavior_context_change;
insert into public.talent_progress (
  id, talent_id, role_id, recommendation_id, kind, text, metadata, created_at
)
select activity.id, recommendation.talent_id, recommendation.role_id,
       activity.recommendation_id, activity.kind,
       case when activity.kind = 'memo' then activity.content
            else '단계 변경' end,
       coalesce(activity.metadata, '{}'::jsonb), activity.created_at
from public.talent_role_activity activity
join public.talent_opportunity_recommendation recommendation
  on recommendation.id = activity.recommendation_id
on conflict (id) do nothing;

insert into public.talent_progress (
  talent_id, role_id, recommendation_id, kind, text, metadata, created_at
)
select recommendation.talent_id, recommendation.role_id, recommendation.id,
       'memo', btrim(recommendation.talent_memo),
       jsonb_build_object('source', 'talent_memo_backfill'),
       recommendation.updated_at
from public.talent_opportunity_recommendation recommendation
where nullif(btrim(recommendation.talent_memo), '') is not null
  and not exists (
    select 1 from public.talent_progress progress
    where progress.recommendation_id = recommendation.id
      and progress.kind = 'memo'
      and btrim(progress.text) = btrim(recommendation.talent_memo)
  );
alter table public.talent_progress enable trigger talent_progress_behavior_context_change;

do $verify_copy$
begin
  if exists (
    select 1 from public.talent_role_activity activity
    join public.talent_opportunity_recommendation recommendation
      on recommendation.id = activity.recommendation_id
    left join public.talent_progress progress on progress.id = activity.id
    where progress.id is null
       or progress.talent_id is distinct from recommendation.talent_id
       or progress.role_id is distinct from recommendation.role_id
       or progress.recommendation_id is distinct from activity.recommendation_id
       or progress.kind is distinct from activity.kind
       or progress.created_at is distinct from activity.created_at
       or progress.metadata is distinct from coalesce(activity.metadata, '{}'::jsonb)
       or progress.text is distinct from
         case when activity.kind = 'memo' then activity.content else '단계 변경' end
       or not progress.open_to_talent
       or progress.open_to_company
  ) then
    raise exception 'talent_role_activity_copy_incomplete';
  end if;
  if exists (
    select 1 from public.talent_opportunity_recommendation recommendation
    where nullif(btrim(recommendation.talent_memo), '') is not null
      and not exists (
        select 1 from public.talent_progress progress
        where progress.recommendation_id = recommendation.id
          and progress.kind = 'memo'
          and progress.open_to_talent
          and not progress.open_to_company
          and btrim(progress.text) = btrim(recommendation.talent_memo)
      )
  ) then
    raise exception 'talent_memo_copy_incomplete';
  end if;
end;
$verify_copy$;
