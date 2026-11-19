-- talent_role_activity is the Career timeline source. talent_progress is a
-- Role-scoped legacy copy, so a company opportunity (no Role) keeps its stage
-- changes and memos in talent_role_activity only.
create or replace function public.copy_legacy_talent_role_activity_to_progress_v1()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
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
  if v_role_id is null then return new; end if;
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
