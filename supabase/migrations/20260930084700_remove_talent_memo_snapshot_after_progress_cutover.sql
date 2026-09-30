-- Apply only after the Career reader uses talent_progress.
do $verify_memo_copy$
begin
  if exists (
    select 1 from public.talent_opportunity_recommendation recommendation
    where nullif(btrim(recommendation.talent_memo), '') is not null
      and not exists (
        select 1 from public.talent_progress progress
        where progress.recommendation_id = recommendation.id
          and progress.kind = 'memo'
          and progress.open_to_talent
          and btrim(progress.text) = btrim(recommendation.talent_memo)
      )
  ) then
    raise exception 'talent_memo_copy_incomplete';
  end if;
end;
$verify_memo_copy$;

create or replace function public.append_talent_role_memo_activity_v1(
  p_talent_id uuid, p_recommendation_id uuid, p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_activity_id uuid;
  v_content text := btrim(coalesce(p_content, ''));
  v_role_id uuid;
begin
  if char_length(v_content) not between 1 and 10000 then
    raise exception 'talent_role_activity_memo_invalid' using errcode = '22023';
  end if;
  select role_id into v_role_id
  from public.talent_opportunity_recommendation
  where id = p_recommendation_id and talent_id = p_talent_id;
  if v_role_id is null then
    raise exception 'talent_role_activity_recommendation_not_found'
      using errcode = 'P0002';
  end if;

  insert into public.talent_progress (
    talent_id, role_id, recommendation_id, kind, text, metadata
  ) values (
    p_talent_id, v_role_id, p_recommendation_id, 'memo', v_content,
    jsonb_build_object('source', 'career')
  ) returning id into v_activity_id;
  return v_activity_id;
end;
$function$;
revoke all on function public.append_talent_role_memo_activity_v1(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.append_talent_role_memo_activity_v1(uuid,uuid,text)
  to service_role;

-- The snapshot is no longer read or written. Preserve its former content in
-- progress, then empty the compatibility column for old schema/view consumers.
alter table public.talent_opportunity_recommendation
  disable trigger talent_opportunity_recommendation_set_updated_at;
alter table public.talent_opportunity_recommendation
  disable trigger talent_recommendation_behavior_context_change;
update public.talent_opportunity_recommendation
set talent_memo = null
where talent_memo is not null;
alter table public.talent_opportunity_recommendation
  enable trigger talent_recommendation_behavior_context_change;
alter table public.talent_opportunity_recommendation
  enable trigger talent_opportunity_recommendation_set_updated_at;

notify pgrst, 'reload schema';
