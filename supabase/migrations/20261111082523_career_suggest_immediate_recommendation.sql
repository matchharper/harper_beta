-- Publish agent-selected imports immediately; enrich them asynchronously.
begin;

CREATE OR REPLACE FUNCTION public.import_talent_job_link(p_talent_id uuid, p_saved_stage text, p_existing_role_id uuid, p_workspace_id uuid, p_role jsonb, p_workspace jsonb, p_preserve_existing_progress boolean DEFAULT false)
 RETURNS TABLE(role_id uuid, recommendation_id uuid, role_source_provider text, created_role boolean, created_workspace boolean, created_recommendation boolean, saved_stage text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := timezone('utc', now());
  v_role public.company_roles%rowtype;
  v_workspace public.company_workspace%rowtype;
  v_recommendation public.talent_opportunity_recommendation%rowtype;
  v_created_role boolean := false;
  v_created_workspace boolean := false;
  v_created_recommendation boolean := false;
  v_company_db_id integer;
  v_evaluation_run_id uuid;
  v_url_variants text[];
begin
  if p_talent_id is null or not exists (
    select 1 from public.talent_users where user_id = p_talent_id
  ) then
    raise exception 'talent_not_found';
  end if;

  -- A null stage publishes the agent-selected posting to New opportunities.
  if p_saved_stage is not null
     and p_saved_stage not in ('saved', 'applied', 'connected', 'closed') then
    raise exception 'invalid_saved_stage';
  end if;

  if p_saved_stage is null then
    perform pg_advisory_xact_lock(hashtextextended('career-matching:'||p_talent_id::text,0));
  end if;

  if p_role ? 'hiringPost' and jsonb_typeof(p_role->'hiringPost') <> 'object' then
    raise exception 'invalid_import_payload';
  end if;

  if jsonb_typeof(coalesce(p_role, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_workspace, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_import_payload';
  end if;

  select coalesce(array_agg(distinct value), '{}'::text[])
    into v_url_variants
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(p_role->'roleUrlVariants') = 'array'
        then p_role->'roleUrlVariants'
      else '[]'::jsonb
    end
  ) as item(value)
  where nullif(btrim(value), '') is not null;

  perform pg_advisory_xact_lock(
    hashtextextended(
      coalesce(
        nullif(p_role->>'userSubmittedSourceJobId', ''),
        nullif(p_role->>'canonicalUrl', ''),
        p_existing_role_id::text,
        'career_job_link_import'
      ),
      0
    )
  );

  if p_existing_role_id is not null then
    select * into v_role
    from public.company_roles
    where company_roles.role_id = p_existing_role_id
      and lower(coalesce(source_type, '')) = 'external';

    if not found then
      raise exception 'external_role_not_found';
    end if;
  else
    select * into v_role
    from public.company_roles candidate
    where lower(coalesce(candidate.source_type, '')) = 'external'
      and (
        (
          nullif(p_role->>'providerJobId', '') is not null
          and candidate.source_provider = p_role->>'provider'
          and candidate.source_job_id = p_role->>'providerJobId'
        )
        or (
          nullif(p_role->>'userSubmittedSourceJobId', '') is not null
          and candidate.source_provider = 'user_submitted'
          and candidate.source_job_id = p_role->>'userSubmittedSourceJobId'
        )
        or (
          candidate.external_jd_url is not null
          and candidate.external_jd_url = any(v_url_variants)
        )
      )
    order by
      (candidate.source_provider = 'user_submitted') asc,
      candidate.updated_at desc
    limit 1;
  end if;

  if v_role.role_id is null then
    if nullif(btrim(p_role->>'title'), '') is null
       or nullif(btrim(p_role->>'companyName'), '') is null
       or nullif(btrim(p_role->>'canonicalUrl'), '') is null then
      raise exception 'job_details_required';
    end if;

    if p_workspace_id is not null then
      select * into v_workspace
      from public.company_workspace
      where company_workspace_id = p_workspace_id
        and coalesce(is_internal, false) = false;

      if not found then
        raise exception 'external_workspace_not_found';
      end if;
    else
      select * into v_workspace
      from public.company_workspace candidate
      where coalesce(candidate.is_internal, false) = false
        and (
          nullif(p_workspace->>'careerUrl', '') is not null
          and candidate.career_url = p_workspace->>'careerUrl'
        )
      order by candidate.external_roles_enabled desc, candidate.updated_at desc
      limit 1;

      if v_workspace.company_workspace_id is null then
        v_company_db_id := case
          when coalesce(p_workspace->>'companyDbId', '') ~ '^[0-9]+$'
            then (p_workspace->>'companyDbId')::integer
          else null
        end;

        insert into public.company_workspace (
          company_name,
          published_name,
          company_db_id,
          career_url,
          logo_url,
          company_description,
          external_roles_enabled,
          has_career_page,
          is_internal,
          is_scrape_original,
          created_at,
          updated_at
        ) values (
          left(
            btrim(coalesce(nullif(p_workspace->>'companyName', ''), p_role->>'companyName')),
            240
          ),
          left(
            btrim(coalesce(nullif(p_workspace->>'companyName', ''), p_role->>'companyName')),
            240
          ),
          v_company_db_id,
          nullif(left(btrim(p_workspace->>'careerUrl'), 2048), ''),
          nullif(left(btrim(p_workspace->>'companyLogoUrl'), 2048), ''),
          nullif(left(btrim(p_workspace->>'companyDescription'), 10000), ''),
          false,
          nullif(btrim(p_workspace->>'careerUrl'), '') is not null,
          false,
          false,
          v_now,
          v_now
        )
        returning * into v_workspace;
        v_created_workspace := true;
      end if;
    end if;

    insert into public.company_roles (
      company_workspace_id,
      name,
      description,
      external_jd_url,
      information,
      is_expired,
      expires_at,
      location_text,
      salary_range,
      source_job_id,
      source_provider,
      source_type,
      status,
      summary,
      type,
      work_mode,
      created_at,
      updated_at
    ) values (
      v_workspace.company_workspace_id,
      left(btrim(p_role->>'title'), 500),
      nullif(left(p_role->>'description', 40000), ''),
      left(btrim(p_role->>'canonicalUrl'), 2048),
      jsonb_build_object(
        'userSubmitted', true,
        'jobLinkImport', jsonb_build_object(
          'canonicalUrl', p_role->>'canonicalUrl',
          'provider', p_role->>'provider',
          'providerCompanyId', p_role->>'providerCompanyId',
          'providerCompanyUrl', p_role->>'providerCompanyUrl',
          'providerJobId', p_role->>'providerJobId',
          'extractedBy', p_role->>'extractedBy'
        )
      )
      || case when jsonb_typeof(p_role->'hiringPost') = 'object'
           then jsonb_build_object('hiringPost', p_role->'hiringPost') else '{}'::jsonb end
      || case when p_saved_stage is null
           then jsonb_build_object('submittedTalentIds', jsonb_build_array(p_talent_id::text)) else '{}'::jsonb end,
      false,
      -- The daily link check cannot open LinkedIn, so what Harper finds there
      -- (a hiring post, or a LinkedIn job page) ends 30 days after posting.
      -- A deadline the posting itself states ends it sooner (least skips nulls).
      least(
        case
          when jsonb_typeof(p_role->'hiringPost') = 'object'
            then coalesce(nullif(p_role->'hiringPost'->>'postedAt', '')::timestamptz, v_now) + interval '30 days'
          when p_saved_stage is null and p_role->>'provider' = 'linkedin'
            then v_now + interval '30 days'
        end,
        nullif(p_role->>'deadline', '')::timestamptz
      ),
      nullif(left(btrim(p_role->>'location'), 500), ''),
      nullif(left(btrim(p_role->>'salaryRange'), 240), ''),
      left(btrim(p_role->>'userSubmittedSourceJobId'), 500),
      'user_submitted',
      'external',
      'active',
      '{}'::jsonb,
      case
        when jsonb_typeof(p_role->'employmentTypes') = 'array'
          then array(
            select distinct left(btrim(value), 80)
            from jsonb_array_elements_text(p_role->'employmentTypes') as item(value)
            where nullif(btrim(value), '') is not null
            limit 8
          )
        else '{}'::text[]
      end,
      case
        when p_role->>'workMode' in ('remote', 'hybrid', 'onsite')
          then p_role->>'workMode'
        else null
      end,
      v_now,
      v_now
    )
    returning * into v_role;
    v_created_role := true;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_talent_id::text || ':' || v_role.role_id::text, 1)
  );

  if p_saved_stage is null then
    -- Only the importing talent may evaluate and publish a user-submitted copy;
    -- other talents' searches keep excluding it.
    if v_role.source_provider = 'user_submitted'
       and not coalesce(v_role.information->'submittedTalentIds', '[]'::jsonb) ? p_talent_id::text then
      update public.company_roles
      set information = jsonb_set(
            coalesce(information, '{}'::jsonb), '{submittedTalentIds}',
            coalesce(information->'submittedTalentIds', '[]'::jsonb) || to_jsonb(p_talent_id::text))
          || case when jsonb_typeof(p_role->'hiringPost') = 'object' and not coalesce(information, '{}'::jsonb) ? 'hiringPost'
               then jsonb_build_object('hiringPost', p_role->'hiringPost') else '{}'::jsonb end,
          updated_at = v_now
      where company_roles.role_id = v_role.role_id
      returning * into v_role;
    end if;
  end if;

  select * into v_recommendation
  from public.talent_opportunity_recommendation candidate
  where candidate.talent_id = p_talent_id
    and candidate.role_id = v_role.role_id
  order by candidate.updated_at desc, candidate.created_at desc
  limit 1
  for update;

  perform set_config('harper.feedback_source', 'job_link_import', true);

  if v_recommendation.id is null then
    if coalesce(v_role.information->>'testOnly','false') = 'true' then
      raise exception 'Test-only roles cannot be imported';
    end if;
    if p_saved_stage is null then
      if coalesce(v_role.is_expired,false)
         or v_role.status in ('closed','expired','inactive','archived','ended')
         or (v_role.expires_at is not null and v_role.expires_at <= v_now) then
        raise exception 'Role is unavailable';
      end if;
      if exists(select 1 from public.talent_setting s,unnest(coalesce(s.blocked_companies,'{}')) b
        where s.user_id=p_talent_id and (b=v_role.company_workspace_id::text or exists(
          select 1 from public.company_workspace c where c.company_workspace_id=v_role.company_workspace_id
          and c.company_name ilike '%'||b||'%'))) then
        raise exception 'Company is blocked';
      end if;
    end if;
    insert into public.talent_opportunity_recommendation (
      talent_id,
      role_id,
      kind,
      opportunity_type,
      saved_stage,
      feedback,
      feedback_at,
      evidence,
      fit_reasons,
      fit_summary,
      preference_fit,
      tradeoffs,
      recommended_at,
      created_at,
      updated_at
    ) values (
      p_talent_id,
      v_role.role_id,
      case when p_saved_stage is null then 'career_agent' else 'user_link_import' end,
      'external_jd',
      p_saved_stage,
      case when p_saved_stage is null then null else 'like' end,
      case when p_saved_stage is null then null else v_now end,
      case when p_saved_stage is null then '{}'::jsonb else '[]'::jsonb end,
      '[]'::jsonb,
      null,
      '{}'::jsonb,
      '[]'::jsonb,
      v_now,
      v_now,
      v_now
    )
    returning * into v_recommendation;
    v_created_recommendation := true;
  elsif p_saved_stage is not null and not (
    coalesce(p_preserve_existing_progress, false)
    and v_recommendation.saved_stage is not null
    and v_recommendation.saved_stage <> 'hidden'
  ) then
    update public.talent_opportunity_recommendation
    set
      saved_stage = p_saved_stage,
      feedback = 'like',
      feedback_at = v_now,
      feedback_reason = null,
      dismissed_at = null,
      recommended_at = v_now,
      updated_at = v_now
    where id = v_recommendation.id
    returning * into v_recommendation;
  end if;

  if p_saved_stage is null and v_created_recommendation then
    insert into public.talent_opportunity_memberships(talent_id,recommendation_id,role_id)
      values(p_talent_id,v_recommendation.id,v_role.role_id);
    -- Durable scoring work is committed with the card; context and model calls
    -- run in the existing queue consumer, never on the import response path.
    insert into public.external_recommendation_runs(
      talent_id,experiment,variant,surface,status,operation_id,locale,request
    ) values (
      p_talent_id,'career-agent-search','career_agent','import','queued',
      'job-posting:'||v_recommendation.id::text,coalesce(p_role->>'locale','ko'),
      jsonb_build_object('roleIds',jsonb_build_array(v_role.role_id),
        'evaluationLimit',1,'recommendationId',v_recommendation.id)
    ) returning id into v_evaluation_run_id;
    update public.talent_opportunity_recommendation
      set external_experiment_run_id=v_evaluation_run_id where id=v_recommendation.id;
  end if;

  return query
  select
    v_role.role_id,
    v_recommendation.id,
    v_role.source_provider,
    v_created_role,
    v_created_workspace,
    v_created_recommendation,
    v_recommendation.saved_stage;
end;
$function$;


revoke all on function public.import_talent_job_link(uuid,text,uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.import_talent_job_link(uuid,text,uuid,uuid,jsonb,jsonb,boolean) to service_role;

-- Attach scoring evidence only to the recommendation this run was created for.
-- Publication, feedback, saved stages and list membership are not scoring decisions.
create or replace function public.attach_career_import_evaluation(p_run uuid,p_token uuid)
returns void language sql security invoker set search_path='' as $$
  update public.talent_opportunity_recommendation rec
  set evidence=coalesce(rec.evidence,'{}'::jsonb)||jsonb_build_object('evaluationId',e.id),
      score=(e.assessment#>>'{fit,mutualFit}')::numeric
  from public.external_recommendation_runs run, public.talent_external_evaluations e
  where run.id=p_run and run.lease_token=p_token and run.surface='import'
    and rec.id=(run.request->>'recommendationId')::uuid
    and rec.external_experiment_run_id=run.id and rec.talent_id=run.talent_id
    and e.id=any(run.evaluation_ids) and e.talent_id=rec.talent_id and e.role_id=rec.role_id
    and rec.evidence->>'evaluationId' is null;
$$;
revoke all on function public.attach_career_import_evaluation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.attach_career_import_evaluation(uuid,uuid) to service_role;

commit;
