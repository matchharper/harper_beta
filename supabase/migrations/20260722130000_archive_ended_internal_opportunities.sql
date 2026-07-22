create or replace function public.archive_ended_internal_opportunities_for_talent(
  p_talent_id uuid,
  p_locale text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_count integer := 0;
  archived_row record;
  normalized_locale text;
  now_ts timestamptz := timezone('utc', now());
begin
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
      talent_id,
      source,
      event_type,
      summary,
      impact_level,
      changed_domains,
      created_at
    )
    values (
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
    );

    archived_count := archived_count + 1;
  end loop;

  return archived_count;
end;
$$;

revoke all on function public.archive_ended_internal_opportunities_for_talent(uuid, text)
  from public;
grant execute on function public.archive_ended_internal_opportunities_for_talent(uuid, text)
  to service_role;
