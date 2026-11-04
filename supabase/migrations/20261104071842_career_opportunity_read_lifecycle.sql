begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Hidden display state is derived from the Role's current status by the new reader.
-- Record the existing lifecycle notice on the actual transition, without taking
-- Talent locks while holding the Role lock (acceptance locks in the reverse order).
create function public.record_unanswered_internal_role_end()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.talent_activity_events (
    id,talent_id,source,event_type,summary,impact_level,changed_domains,created_at
  )
  select md5('career:internal_opportunity_filled:' || r.id::text)::uuid,
    r.talent_id,'career_opportunity_lifecycle','internal_opportunity_filled',
    case when lower(coalesce(nullif(trim(s.preferred_locale),''),'ko')) like 'ko%'
      then format('%s의 %s 포지션은 채용이 완료되어 보관함으로 이동했습니다.',
        coalesce(nullif(trim(w.company_name),''),nullif(trim(w.published_name),''),'Company'),
        coalesce(nullif(trim(new.name),''),'Role'))
      else format('The %s position at %s has been filled and moved to the archive.',
        coalesce(nullif(trim(new.name),''),'Role'),
        coalesce(nullif(trim(w.company_name),''),nullif(trim(w.published_name),''),'Company'))
    end,'low',array['opportunity_status','recommendation_history']::text[],now()
  from public.talent_opportunity_recommendation r
  join public.company_workspace w on w.company_workspace_id=new.company_workspace_id
  left join public.talent_setting s on s.user_id=r.talent_id
  where r.role_id=new.role_id and r.feedback is null and r.saved_stage is distinct from 'hidden'
    and r.id=public.current_talent_recommendation_id_v1(r.id)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.record_unanswered_internal_role_end() from public,anon,authenticated;
grant execute on function public.record_unanswered_internal_role_end() to service_role;
create trigger record_unanswered_internal_role_end
  after update of status on public.company_roles for each row
  when (new.source_type='internal' and new.status='ended' and old.status is distinct from new.status)
  execute function public.record_unanswered_internal_role_end();

-- The deployed reader can still call this RPC during rollout. Preserve its
-- archive behavior, but share the event identity with the transition trigger.
-- A recommendation records its first closure once, including after reopening.
CREATE OR REPLACE FUNCTION public.archive_ended_internal_opportunities_for_talent(p_talent_id uuid, p_locale text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  archived_count integer := 0;
  archived_row record;
  normalized_locale text;
  now_ts timestamptz := timezone('utc', now());
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || p_talent_id::text,0));
  if p_talent_id is null then
    return 0;
  end if;

  select lower(
    coalesce(
      nullif(trim(p_locale), ''),
      nullif(trim(setting.preferred_locale), ''),
      'ko'
    )
  )
    into normalized_locale
    from (select 1) seed
    left join public.talent_setting setting
      on setting.user_id = p_talent_id;

  for archived_row in
    update public.talent_opportunity_recommendation recommendation
       set saved_stage = 'hidden',
           updated_at = now_ts
      from public.company_roles role
      join public.company_workspace workspace
        on workspace.company_workspace_id = role.company_workspace_id
     where recommendation.talent_id = p_talent_id
       and recommendation.id = public.current_talent_recommendation_id_v1(recommendation.id)
       and recommendation.role_id = role.role_id
       and recommendation.feedback is null
       and coalesce(recommendation.saved_stage, '') <> 'hidden'
       and lower(trim(coalesce(role.source_type, ''))) = 'internal'
       and lower(trim(coalesce(role.status, ''))) = 'ended'
    returning
      recommendation.id,
      coalesce(
        nullif(trim(workspace.company_name), ''),
        nullif(trim(workspace.published_name), ''),
        'Company'
      ) as company_name,
      coalesce(nullif(trim(role.name), ''), 'Role') as role_name
  loop
    insert into public.talent_activity_events (
      id,
      talent_id,
      source,
      event_type,
      summary,
      impact_level,
      changed_domains,
      created_at
    )
    values (
      md5('career:internal_opportunity_filled:' || archived_row.id::text)::uuid,
      p_talent_id,
      'career_opportunity_lifecycle',
      'internal_opportunity_filled',
      case
        when normalized_locale like 'ko%'
          then format(
            '%s의 %s 포지션은 채용이 완료되어 보관함으로 이동했습니다.',
            archived_row.company_name,
            archived_row.role_name
          )
        else format(
          'The %s position at %s has been filled and moved to the archive.',
          archived_row.role_name,
          archived_row.company_name
        )
      end,
      'low',
      array['opportunity_status', 'recommendation_history']::text[],
      now_ts
    ) on conflict (id) do nothing;

    archived_count := archived_count + 1;
  end loop;

  return archived_count;
end;
$function$;

revoke all on function public.archive_ended_internal_opportunities_for_talent(uuid,text) from public,anon,authenticated;
grant execute on function public.archive_ended_internal_opportunities_for_talent(uuid,text) to service_role;

commit;
