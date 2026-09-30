-- Apply after every company-side LLM reader filters open_to_company.
-- The activity rows then move without an old reader seeing candidate-only facts.
do $verify_source$
begin
  if exists (
    select 1 from public.talent_role_activity
    where kind not in ('memo', 'saved_stage_changed')
       or (kind = 'memo' and nullif(btrim(content), '') is null)
  ) then
    raise exception 'unexpected_talent_role_activity_data';
  end if;
end;
$verify_source$;

alter table public.talent_progress disable trigger talent_progress_behavior_context_change;
insert into public.talent_progress (
  id, talent_id, role_id, recommendation_id, kind, text, metadata, created_at
)
select activity.id, recommendation.talent_id, recommendation.role_id,
       activity.recommendation_id, activity.kind,
       case when activity.kind = 'memo' then activity.content
            else '단계 변경' end,
       activity.metadata, activity.created_at
from public.talent_role_activity activity
join public.talent_opportunity_recommendation recommendation
  on recommendation.id = activity.recommendation_id
on conflict (id) do nothing;

-- Some older installations may have only the compatibility snapshot.
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
    select 1
    from public.talent_role_activity activity
    left join public.talent_progress progress on progress.id = activity.id
    where progress.id is null
       or progress.recommendation_id is distinct from activity.recommendation_id
       or progress.kind is distinct from activity.kind
       or not progress.open_to_talent
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
          and btrim(progress.text) = btrim(recommendation.talent_memo)
      )
  ) then
    raise exception 'talent_memo_copy_incomplete';
  end if;
end;
$verify_copy$;

-- Keep old production revisions and RPCs working while the new code switches to
-- talent_progress. The adapter contains no independently stored activity rows.
drop table public.talent_role_activity;
create view public.talent_role_activity with (security_invoker = true) as
select id, recommendation_id, kind,
       case when kind = 'memo' then talent_text else null end as content,
       metadata, created_at
from public.talent_progress
where kind in ('memo', 'saved_stage_changed')
  and recommendation_id is not null;

create or replace function public.insert_legacy_talent_role_activity_v1()
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
  if new.kind not in ('memo', 'saved_stage_changed') then
    raise exception 'talent_role_activity_kind_invalid' using errcode = '22023';
  end if;
  new.id := coalesce(new.id, gen_random_uuid());
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  new.created_at := coalesce(new.created_at, now());
  insert into public.talent_progress (
    id, talent_id, role_id, recommendation_id, kind, text, metadata, created_at
  ) values (
    new.id, v_talent_id, v_role_id, new.recommendation_id, new.kind,
    case when new.kind = 'memo' then nullif(btrim(new.content), '')
         else '단계 변경' end,
    new.metadata, new.created_at
  );
  return new;
end;
$function$;

revoke all on function public.insert_legacy_talent_role_activity_v1()
  from public, anon, authenticated;
create trigger insert_legacy_talent_role_activity
instead of insert on public.talent_role_activity
for each row execute function public.insert_legacy_talent_role_activity_v1();
revoke all on public.talent_role_activity from public, anon, authenticated;
grant select, insert on public.talent_role_activity to service_role;

-- Keep the legacy memo RPC and snapshot until the Career reader is live.
notify pgrst, 'reload schema';
