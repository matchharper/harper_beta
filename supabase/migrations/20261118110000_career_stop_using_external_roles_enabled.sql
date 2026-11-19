-- company_workspace.external_roles_enabled is no longer read or written.
--
-- Every workspace with the value false was created by a user's private job-link
-- import, and every Role in those workspaces is user_submitted (production,
-- 2026-11-18: 1,709 workspaces, 2,033 Roles). Search already excludes
-- user_submitted Roles by the Role itself, so the workspace flag only blocked
-- public Roles that later joined such a workspace (for example a publicly
-- indexed posting at a company first added by an import), and refused their
-- recommendation with 'Company opportunities unavailable'.
--
-- The privacy boundary stays on the Role: a user_submitted Role can be
-- recommended only to the people who submitted it.
--
-- The column itself is dropped in a later migration, after the web app and the
-- Worker that still filter on it are deployed without that filter.
set local lock_timeout='2s';

CREATE OR REPLACE FUNCTION public.write_career_opportunities(p_talent uuid, p_operation text, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare old_op public.talent_matching_operations; item jsonb; rec public.talent_opportunity_recommendation;
  selection public.talent_opportunity_matching_review; source public.career_daily_sources;
  publishing_run uuid:=nullif(p_command->>'backgroundRunId','')::uuid;
  role public.company_roles; target uuid:=nullif(p_command->>'matchingId','')::uuid;
  item_role uuid; item_company uuid; employer uuid;
  action text:=p_command->>'action'; all_lists boolean:=coalesce((p_command->>'allLists')::boolean,false);
  kept uuid[]:='{}'; changed uuid[]:='{}'; member_id uuid; receipt jsonb; current_revision text;
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent,0));
  perform pg_advisory_xact_lock(hashtextextended('career-matching:'||p_talent::text,0));
  select * into old_op from public.talent_matching_operations where talent_id=p_talent and operation_id=p_operation;
  if found then
    if old_op.command is distinct from p_command then raise exception 'Operation identity reused with different command'; end if;
    return old_op.result;
  end if;
  if publishing_run is not null and not exists(select 1 from public.opportunity_discovery_run where id=publishing_run and talent_id=p_talent and status='handed_off' and trigger_payload->>'runContract'='career_agent_v1') then raise exception 'Publication invocation unavailable'; end if;
  if target is not null and not exists(select 1 from public.talent_matchings where id=target and talent_id=p_talent) then raise exception 'Matching unavailable'; end if;
  if not exists(select 1 from public.talent_users where user_id=p_talent and deleted_at is null) then raise exception 'Talent unavailable'; end if;
  if action not in ('add','update','archive','restore','replace','reset') then raise exception 'Unknown list operation'; end if;
  current_revision:=public.career_opportunity_list_revision(p_talent,target,all_lists);
  if (action in ('replace','reset') or nullif(p_command->>'expectedRevision','') is not null) and current_revision is distinct from p_command->>'expectedRevision' then raise exception 'List changed; read its current revision'; end if;
  if all_lists and action not in ('reset','archive') then raise exception 'Select one list for writes'; end if;
  for item in select value from jsonb_array_elements(coalesce(p_command->'items','[]'::jsonb)) loop
    item_role:=nullif(item->>'roleId','')::uuid;
    item_company:=nullif(item->>'companyWorkspaceId','')::uuid;
    if item_role is not null and item_company is not null then raise exception 'An item targets either roleId or companyWorkspaceId'; end if;
    select * into rec from public.talent_opportunity_recommendation r where r.talent_id=p_talent
      and (case when nullif(item->>'recommendationId','') is not null then r.id=public.current_talent_recommendation_id_v1((item->>'recommendationId')::uuid)
        when item_company is not null then r.company_workspace_id=item_company else r.role_id=item_role end)
      and r.id=public.current_talent_recommendation_id_v1(r.id)
      order by r.created_at desc,r.id desc limit 1 for update;
    if not found then
      if action not in ('add','replace') then raise exception 'Recommendation unavailable'; end if;
      if item_company is not null then
        if not exists(select 1 from public.company_workspace where company_workspace_id=item_company) then raise exception 'Company is unavailable: %', item_company; end if;
        if public.career_company_blocked_v1(p_talent,item_company) then raise exception 'Company is blocked'; end if;
        if nullif(item->>'evaluationId','') is not null and not exists(select 1 from public.talent_external_evaluations e where e.id=(item->>'evaluationId')::uuid and e.talent_id=p_talent and e.company_workspace_id=item_company) then raise exception 'Evaluation reference unavailable'; end if;
        insert into public.talent_opportunity_recommendation(talent_id,company_workspace_id,kind,opportunity_type,rank,fit_summary,fit_reasons,tradeoffs,evidence)
          values(p_talent,item_company,'career_agent','company',coalesce((item->>'rank')::integer,0),coalesce(item->>'explanation',''),'[]','[]',jsonb_strip_nulls(jsonb_build_object('evaluationId',nullif(item->>'evaluationId',''),'backgroundRunId',publishing_run))) returning * into rec;
      else
      select * into role from public.company_roles where role_id=item_role;
      if not found then raise exception 'Role is unavailable: %', item->>'roleId'; end if;
      if role.source_type='internal' then
        select * into selection from public.talent_opportunity_matching_review m
          where m.talent_id=p_talent and m.opportunity_id=role.role_id
            and public.career_internal_selection_available_v1(p_talent,m.id)
          order by m.reviewed_at desc,m.id desc limit 1 for update;
        -- An available selection is linked when present; it is not required.
        for source in select * from public.career_daily_sources d where d.talent_id=p_talent
          and d.source_kind='talent_selection' and d.source_id in (select m.id::text from public.talent_opportunity_matching_review m
            where m.talent_id=p_talent and m.opportunity_id=role.role_id and m.closed_at is null and m.recommendation_id is null)
          and d.cancelled_at is null and d.finished_at is null for update
        loop
          if source.run_id is not null and source.run_id is distinct from publishing_run
            and exists(select 1 from public.opportunity_discovery_run where id=source.run_id and status in ('queued','running','handed_off'))
            then raise exception 'This proposal is already being prepared in the current Career update'; end if;
        end loop;
        if not exists(select 1 from public.talent_setting t where t.user_id=p_talent
          and t.get_internal_recommendation is distinct from false
          and t.profile_visibility is distinct from 'dont_share') then
          raise exception 'Internal recommendations disabled';
        end if;
        if role.status not in ('active','paused','top_priority') or coalesce(role.is_expired,false)
          or (role.expires_at is not null and role.expires_at<=now()) then
          raise exception 'Role is unavailable';
        end if;
        if lower(btrim(coalesce(role.information->>'testOnly','false'))) in ('true','1','yes','on')
          and not (nullif(role.information->>'testFixture','') is not null
            and coalesce(role.information->'testTalentIds','[]'::jsonb) ? p_talent::text) then
          raise exception 'Test Role unavailable';
        end if;
        insert into public.talent_opportunity_recommendation(talent_id,role_id,kind,opportunity_type,rank,fit_summary,fit_reasons,tradeoffs,evidence)
          values(p_talent,role.role_id,'career_agent','internal_recommendation',coalesce((item->>'rank')::integer,0),coalesce(item->>'explanation',''),'[]','[]',jsonb_build_object('operationId',p_operation,'selectionId',selection.id,'backgroundRunId',publishing_run)) returning * into rec;
        update public.talent_opportunity_matching_review set recommendation_id=rec.id
          where talent_id=p_talent and opportunity_id=role.role_id and closed_at is null
            and recommendation_id is null and decision in ('candidate_first','both');
        update public.career_daily_sources set cancelled_at=now() where talent_id=p_talent
          and source_kind='talent_selection' and source_id in (select id::text from public.talent_opportunity_matching_review
            where talent_id=p_talent and opportunity_id=role.role_id and recommendation_id=rec.id)
          and cancelled_at is null and finished_at is null and run_id is distinct from publishing_run;
        if publishing_run is null then
          update public.career_daily_sources set cancelled_at=now() where talent_id=p_talent
            and source_kind='talent_selection' and source_id in (select id::text from public.talent_opportunity_matching_review
            where talent_id=p_talent and opportunity_id=role.role_id and recommendation_id=rec.id) and cancelled_at is null and finished_at is null;
        end if;
        if target is not null then
          delete from public.talent_opportunity_memberships where talent_id=p_talent and recommendation_id=rec.id and matching_id is null;
        end if;
      else
      if coalesce(role.is_expired,false) or role.status in ('closed','expired','inactive','archived','ended') or (role.expires_at is not null and role.expires_at<=now()) or lower(coalesce(role.information->>'testOnly','false'))='true' then raise exception 'Role is unavailable'; end if;
      -- A posting a user submitted privately stays with the people who submitted it.
      if role.source_provider='user_submitted' and not (coalesce(role.information->'submittedTalentIds','[]'::jsonb) ? p_talent::text)
        then raise exception 'Role is unavailable'; end if;
      if public.career_company_blocked_v1(p_talent,role.company_workspace_id) then raise exception 'Company is blocked'; end if;
      if nullif(item->>'evaluationId','') is not null and not exists(select 1 from public.talent_external_evaluations e where e.id=(item->>'evaluationId')::uuid and e.talent_id=p_talent and e.role_id=role.role_id) then raise exception 'Evaluation reference unavailable'; end if;
      insert into public.talent_opportunity_recommendation(talent_id,role_id,kind,opportunity_type,rank,fit_summary,fit_reasons,tradeoffs,evidence)
        values(p_talent,role.role_id,'career_agent','external_jd',coalesce((item->>'rank')::integer,0),coalesce(item->>'explanation',''),'[]','[]',jsonb_strip_nulls(jsonb_build_object('evaluationId',nullif(item->>'evaluationId','')))) returning * into rec;
      end if;
      end if;
    end if;
    if action in ('add','restore','replace') then
      if rec.role_id is not null then
        select * into strict role from public.company_roles where role_id=rec.role_id;
        if coalesce(role.is_expired,false) or role.status in ('closed','expired','inactive','archived','ended') or (role.expires_at is not null and role.expires_at<=now()) then raise exception 'Role is unavailable'; end if;
        if lower(coalesce(role.information->>'testOnly','false'))='true' and not coalesce(role.information->'testTalentIds','[]'::jsonb) ? p_talent::text then raise exception 'Test Role unavailable'; end if;
        employer:=role.company_workspace_id;
      else
        employer:=rec.company_workspace_id;
      end if;
      if public.career_company_blocked_v1(p_talent,employer) then raise exception 'Company is blocked'; end if;
    end if;
    if item_role is not null and rec.role_id is distinct from item_role then raise exception 'Recommendation role mismatch'; end if;
    if item_company is not null and rec.company_workspace_id is distinct from item_company then raise exception 'Recommendation company mismatch'; end if;
    if action='archive' and all_lists then
      update public.talent_opportunity_memberships set archived_at=now(),revision=revision+1,updated_at=now() where talent_id=p_talent and public.current_talent_recommendation_id_v1(recommendation_id)=rec.id;
    elsif action='update' then
      select m.id into member_id from public.talent_opportunity_memberships m
      where m.talent_id=p_talent and m.matching_id is not distinct from target
        and public.current_talent_recommendation_id_v1(m.recommendation_id)=rec.id
      order by (m.recommendation_id=rec.id) desc,m.updated_at desc,m.id desc limit 1;
      if member_id is null then raise exception 'Membership unavailable'; end if;
      update public.talent_opportunity_memberships set
        explanation=coalesce(item->>'explanation',explanation),rank=coalesce((item->>'rank')::integer,rank),
        revision=revision+1,updated_at=now() where id=member_id;
    else
      insert into public.talent_opportunity_memberships(talent_id,matching_id,recommendation_id,role_id,company_workspace_id,explanation,rank,archived_at)
        values(p_talent,target,rec.id,rec.role_id,rec.company_workspace_id,coalesce(item->>'explanation',rec.fit_summary,''),coalesce((item->>'rank')::integer,0),case when action='archive' then now() else null end)
        on conflict(talent_id,(coalesce(matching_id,'00000000-0000-0000-0000-000000000000'::uuid)),recommendation_id)
        do update set explanation=coalesce(item->>'explanation',talent_opportunity_memberships.explanation),rank=coalesce((item->>'rank')::integer,talent_opportunity_memberships.rank),
          archived_at=case when action='archive' then now() when action in ('restore','add','replace') then null else talent_opportunity_memberships.archived_at end,
          revision=talent_opportunity_memberships.revision+1,updated_at=now() returning id into member_id;
      kept:=array_append(kept,member_id);
    end if;
    changed:=array_append(changed,rec.id);
  end loop;
  if action in ('replace','reset') then
    update public.talent_opportunity_memberships set archived_at=now(),revision=revision+1,updated_at=now()
    where talent_id=p_talent and (all_lists or matching_id is not distinct from target) and archived_at is null and not(id=any(kept));
  end if;
  insert into public.talent_matching_operations values(p_talent,p_operation,p_command,'{"listRevision":null}',now());
  receipt:=jsonb_build_object('action',action,'matchingId',target,'allLists',all_lists,'recommendationIds',changed,'listRevision',public.career_opportunity_list_revision(p_talent,target,all_lists));
  update public.talent_matching_operations set result=receipt where talent_id=p_talent and operation_id=p_operation;
  return receipt;
end $function$;

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
      order by candidate.created_at, candidate.company_workspace_id
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

CREATE OR REPLACE FUNCTION public.career_index_public_job_v1(p_existing_role uuid, p_workspace_id uuid, p_role jsonb, p_workspace jsonb, p_observation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r company_roles; w company_workspace; o career_public_observations; facts jsonb; fresh boolean:=false;
begin
 select * into o from career_public_observations where id=p_observation and deleted_at is null for share;
 if not found or o.provenance->>'scope'<>'public' then raise exception 'Public source unavailable'; end if;
 if nullif(p_role->>'title','') is null or nullif(p_role->>'companyName','') is null or nullif(p_role->>'description','') is null then raise exception 'Public posting details required'; end if;
 if p_role->>'extractedBy'='manual' then raise exception 'Personal overrides cannot enter public discovery'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_role->>'userSubmittedSourceJobId',p_role->>'canonicalUrl'),0));
 if exists(select 1 from company_roles where external_jd_url=p_role->>'canonicalUrl' and
   (source_type<>'external' or coalesce(information->>'testOnly','false')='true')) then raise exception 'Posting cannot enter public directory'; end if;
 if p_existing_role is not null then
  select * into r from company_roles where role_id=p_existing_role for update;
  if not found or r.source_type<>'external' or coalesce(r.information->>'testOnly','false')='true' then raise exception 'External role unavailable'; end if;
  if r.external_jd_url is distinct from p_role->>'canonicalUrl' and r.source_job_id is distinct from p_role->>'userSubmittedSourceJobId' then raise exception 'Posting identity changed'; end if;
 else
  select * into r from company_roles where source_type='external' and
    (external_jd_url=p_role->>'canonicalUrl' or (source_provider='career_public_discovery' and source_job_id=p_role->>'userSubmittedSourceJobId'))
    order by updated_at desc limit 1 for update;
 end if;
 if r.role_id is not null then
  select * into w from company_workspace where company_workspace_id=r.company_workspace_id for update;
 elsif p_workspace_id is not null then
  select * into w from company_workspace where company_workspace_id=p_workspace_id and not coalesce(is_internal,false) for update;
  if not found then raise exception 'External workspace unavailable'; end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('public-company:'||coalesce(nullif(p_workspace->>'careerUrl',''),p_role->>'companyName'),0));
  select * into w from company_workspace where not coalesce(is_internal,false) and
    nullif(p_workspace->>'careerUrl','') is not null and career_url=p_workspace->>'careerUrl' limit 1 for update;
  if not found then
   insert into company_workspace(company_name,published_name,company_db_id,career_url,logo_url,has_career_page,is_internal,is_scrape_original)
   values(p_role->>'companyName',p_role->>'companyName',nullif(p_workspace->>'companyDbId','')::bigint,
     nullif(p_workspace->>'careerUrl',''),nullif(p_workspace->>'companyLogoUrl',''),
     nullif(p_workspace->>'careerUrl','') is not null,false,false) returning * into w;
  end if;
 end if;
 facts:=jsonb_build_object('publicDiscovery',jsonb_build_object('observationId',p_observation,'sourceUrl',o.source_url,
  'provider',p_role->>'provider','providerJobId',p_role->>'providerJobId','providerCompanyId',p_role->>'providerCompanyId',
  'providerCompanyUrl',p_role->>'providerCompanyUrl','extractedBy',p_role->>'extractedBy','observedAt',o.observed_at));
 if r.role_id is null then
  insert into company_roles(company_workspace_id,name,description,external_jd_url,information,is_expired,expires_at,posted_at,
   location_text,salary_range,source_job_id,source_provider,source_type,status,summary,type,work_mode)
  values(w.company_workspace_id,p_role->>'title',p_role->>'description',p_role->>'canonicalUrl',facts,coalesce(nullif(p_role->>'deadline','')::timestamptz<now(),false),
   nullif(p_role->>'deadline','')::timestamptz,nullif(p_role->>'postedAt','')::timestamptz,p_role->>'location',p_role->>'salaryRange',p_role->>'userSubmittedSourceJobId',
   'career_public_discovery','external','active','{}',array(select jsonb_array_elements_text(coalesce(p_role->'employmentTypes','[]'))),p_role->>'workMode')
  returning * into r; fresh:=true;
 elsif r.source_provider in ('user_submitted','career_public_discovery') then
  update company_roles set name=p_role->>'title',description=p_role->>'description',external_jd_url=p_role->>'canonicalUrl',
   information=facts,location_text=p_role->>'location',salary_range=p_role->>'salaryRange',
   source_provider='career_public_discovery',source_job_id=p_role->>'userSubmittedSourceJobId',
   is_expired=coalesce(nullif(p_role->>'deadline','')::timestamptz<now(),false),expires_at=nullif(p_role->>'deadline','')::timestamptz,
   posted_at=nullif(p_role->>'postedAt','')::timestamptz,expired_at=null,status='active',summary='{}',
   description_summary=null,title_embedding=null,title_embedding_text=null,seniority_level=null,country_code=null,
   salary_min=null,salary_max=null,salary_currency=null,salary_period=null,salary_is_predicted=false,
   type=array(select jsonb_array_elements_text(coalesce(p_role->'employmentTypes','[]'))),work_mode=p_role->>'workMode',updated_at=now()
  where company_roles.role_id=r.role_id returning * into r;
 end if;
 update career_public_observations set about_refs=about_refs||jsonb_build_array(jsonb_build_object('kind','role','id',r.role_id::text))
  where id=p_observation and not about_refs @> jsonb_build_array(jsonb_build_object('kind','role','id',r.role_id::text));
 return jsonb_build_object('roleId',r.role_id,'createdRole',fresh);
end $function$;

CREATE OR REPLACE FUNCTION public.career_write_company_datum_v1(p_target jsonb, p_label text, p_content text, p_source_refs jsonb, p_data_ref jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  refs jsonb; resolved jsonb; w_id uuid; d company_datas; company_id bigint; observation_ids uuid[];
  data_id uuid:=coalesce(case when pg_input_is_valid(p_data_ref->>'id','uuid') then (p_data_ref->>'id')::uuid end,p_request_id,gen_random_uuid());
  v_name text:=nullif(btrim(p_target->>'name'),'');
begin
  if nullif(btrim(p_label),'') is null or nullif(btrim(p_content),'') is null then
    raise exception 'Company material requires a label and content';
  end if;
  if p_data_ref is not null and
    (p_data_ref->>'kind' is distinct from 'company_datum' or p_data_ref->>'id' is null or p_data_ref->>'revision' is null) then
    raise exception 'Editing company material requires its ID and revision';
  end if;
  refs:=career_exact_company_sources_v1(p_source_refs);
  select array_agg((r->>'id')::uuid) into observation_ids from jsonb_array_elements(refs) r;
  -- Serializes the first write for a name, so concurrent writers share one workspace.
  if p_target->>'kind' is null and v_name is not null then
    perform pg_advisory_xact_lock(hashtextextended('career-company-name:'||lower(v_name),0));
  end if;
  resolved:=career_resolve_public_company_v1(p_target);

  if resolved->>'status'='found' and resolved->'companyRef'->>'kind'='company_workspace' then
    w_id:=(resolved->'companyRef'->>'id')::uuid;
  elsif resolved->>'status'='found' and resolved->'companyRef'->>'kind'='company' and p_data_ref is null then
    company_id:=(resolved->'companyRef'->>'id')::bigint;
    perform pg_advisory_xact_lock(hashtextextended('career-company-directory:'||company_id,0));
    select career_company_home_v1(company_workspace_id) into w_id from company_workspace
      where company_db_id=company_id order by coalesce(is_internal,false), created_at, company_workspace_id limit 1;
    if w_id is null then
      insert into company_workspace(company_name,company_db_id,homepage_url,linkedin_url,is_internal,is_scrape_original,has_career_page)
        select coalesce(c.name,v_name),c.id,coalesce(c.website_url,nullif(btrim(p_target->>'officialWebsite'),'')),
          coalesce(c.linkedin_url,nullif(btrim(p_target->>'linkedinUrl'),'')),false,false,false from company_db c where c.id=company_id
        returning company_workspace_id into w_id;
    end if;
  elsif resolved->>'status'='missing' and p_target->>'kind' is null and v_name is not null and p_data_ref is null then
    insert into company_workspace(company_name,homepage_url,linkedin_url,is_internal,is_scrape_original,has_career_page)
      values(v_name,nullif(btrim(p_target->>'officialWebsite'),''),nullif(btrim(p_target->>'linkedinUrl'),''),false,false,false)
      returning company_workspace_id into w_id;
  else
    return resolved;
  end if;
  perform 1 from company_workspace where company_workspace_id=w_id for update;
  if p_target->>'kind'='company' then
    update company_workspace set company_db_id=(p_target->>'id')::bigint
      where company_workspace_id=w_id and company_db_id is null;
  end if;

  select * into d from company_datas where id=data_id for update;
  if found and d.company_workspace_id<>w_id then raise exception 'Material belongs to another company'; end if;
  if p_data_ref is not null and d.id is null then return '{"status":"missing"}'; end if;
  if p_data_ref is null and d.id is null and p_label='summary' then
    select * into d from company_datas where company_workspace_id=w_id and label='summary' for update;
  end if;
  if d.id is not null then
    if (p_data_ref is null or d.revision::text is distinct from p_data_ref->>'revision') and (d.label,d.content,d.source_refs) is not distinct from (p_label,p_content,refs) then
      return jsonb_build_object('status','unchanged')||career_company_home_json_v1(w_id)||career_company_datum_json_v1(d);
    end if;
    if p_data_ref is null or d.revision::text is distinct from p_data_ref->>'revision' then
      return jsonb_build_object('status','conflict','current',career_company_datum_json_v1(d),
        'dataRef',career_company_datum_json_v1(d)->'dataRef')||career_company_home_json_v1(w_id);
    end if;
    if p_label='summary' and d.label<>'summary' and exists(select from company_datas where company_workspace_id=w_id and label='summary') then
      raise exception 'Company summary already exists';
    end if;
    update company_datas set label=p_label,content=p_content,source_refs=refs,
      checked_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1 where id=d.id returning * into d;
  else
    insert into company_datas(id,company_workspace_id,label,content,source_refs)
      values(data_id,w_id,p_label,p_content,refs) returning * into d;
  end if;

  update career_public_observations set about_refs=about_refs||jsonb_build_array(jsonb_build_object('kind','company_workspace','id',w_id::text))
    where id=any(observation_ids) and not about_refs @> jsonb_build_array(jsonb_build_object('kind','company_workspace','id',w_id::text));
  -- A directory company's text/vector projection includes its research.
  update company_db set public_context=public_context
    where id=(select company_db_id from company_workspace where company_workspace_id=w_id);
  return jsonb_build_object('status','saved')||career_company_home_json_v1(w_id)||career_company_datum_json_v1(d);
end $function$;

CREATE OR REPLACE FUNCTION public.career_company_workspaces_for_directory_v1(p_companies bigint[])
 RETURNS TABLE(company_id bigint, company_workspace_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c_id bigint; w uuid;
begin
  for c_id in select distinct x from unnest(p_companies) x where x is not null order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('career-company-directory:'||c_id,0));
    select career_company_home_v1(cw.company_workspace_id) into w from company_workspace cw
      where cw.company_db_id=c_id order by coalesce(cw.is_internal,false), cw.created_at, cw.company_workspace_id limit 1;
    -- A workspace recorded before its directory entry is the same company when their links match.
    if w is null then
      select career_company_home_v1(cw.company_workspace_id) into w from company_workspace cw
        join company_db c on c.id=c_id
        where cw.company_db_id is null and career_company_workspace_public_v1(cw)
          and (career_company_site_key_v1(cw.homepage_url)=career_company_site_key_v1(c.website_url)
            or career_company_site_key_v1(cw.linkedin_url)=career_company_site_key_v1(c.linkedin_url))
        order by cw.created_at, cw.company_workspace_id limit 1;
    end if;
    if w is null then
      insert into company_workspace(company_name,company_db_id,homepage_url,linkedin_url,is_internal,is_scrape_original,has_career_page)
        select coalesce(nullif(btrim(c.name),''),'Unknown company'),c.id,c.website_url,c.linkedin_url,false,false,false
        from company_db c where c.id=c_id
        returning company_workspace.company_workspace_id into w;
    end if;
    if w is not null then
      company_id:=c_id; company_workspace_id:=w; return next;
    end if;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.complete_external_recommendation_run(p_run_id uuid, p_rows jsonb, p_lease_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.external_recommendation_runs; result jsonb; ids uuid[];
begin
  select * into strict r from public.external_recommendation_runs where id=p_run_id for update;
  -- Serialize concurrent daily/manual saves for this talent, not just this run.
  perform 1 from public.talent_setting where user_id=r.talent_id for update;
  if r.status='completed' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'role_id',role_id)),'[]'::jsonb) into result
      from public.talent_opportunity_recommendation where external_experiment_run_id=p_run_id;
    return result;
  end if;
  if r.surface='daily' and (r.lease_token is distinct from p_lease_token or r.lease_expires_at<=now()) then raise exception 'Daily search lease lost'; end if;
  if r.surface='daily' and r.day_key is distinct from (now() at time zone r.time_zone)::date then
    update public.external_recommendation_runs set status='skipped',finished_at=now() where id=r.id;
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>20 then raise exception 'Invalid recommendation list'; end if;
  with inserted as (
    insert into public.talent_opportunity_recommendation
      (talent_id,role_id,kind,opportunity_type,rank,score,fit_summary,fit_reasons,tradeoffs,evidence,external_experiment_run_id)
    select r.talent_id,cr.role_id,'recommend_job_postings','external_jd',(x->>'rank')::int,(x->>'score')::real,
      x->>'fit_summary',coalesce(x->'fit_reasons','[]'::jsonb),coalesce(x->'tradeoffs','[]'::jsonb),coalesce(x->'evidence','[]'::jsonb),r.id
    from jsonb_array_elements(p_rows) x
    join public.company_roles cr on cr.role_id=(x->>'role_id')::uuid
    join public.company_workspace cw on cw.company_workspace_id=cr.company_workspace_id
    left join public.company_db cd on cd.id=cw.company_db_id
    join public.talent_setting s on s.user_id=r.talent_id
    join public.talent_users u on u.user_id=r.talent_id and u.deleted_at is null
    where cr.source_type='external' and coalesce(cr.is_expired,false)=false
      and (cr.expires_at is null or cr.expires_at>now()) and cr.status not in ('closed','expired','inactive','archived','ended')
      and coalesce(cr.source_provider,'')<>'user_submitted'
      and lower(coalesce(cr.information->>'testOnly','false'))<>'true'
      and (case when r.surface='daily' then s.is_onboarding_done=true
        else s.get_external_recommendation is distinct from false end)
      and not exists (select 1 from unnest(s.blocked_companies) b where (nullif(btrim(b),'') is not null and (cw.company_name ilike '%'||btrim(b)||'%' or cd.name ilike '%'||btrim(b)||'%' or b=cw.company_workspace_id::text)))
      and not exists (select 1 from public.talent_opportunity_recommendation t where t.talent_id=r.talent_id and t.opportunity_type='external_jd' and (t.role_id=cr.role_id or exists (select 1 from public.company_roles prev where prev.role_id=t.role_id and prev.company_workspace_id=cr.company_workspace_id and lower(btrim(prev.name))=lower(btrim(cr.name)))))
    returning id,role_id
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'role_id',role_id)),'[]'::jsonb),coalesce(array_agg(role_id),'{}'::uuid[]) into result,ids from inserted;
  update public.external_recommendation_runs set status='completed',finished_at=now(),role_ids=ids where id=r.id;
  return result;
end $function$;

comment on column public.company_workspace.external_roles_enabled is 'Unused since 20261118110000. Drop after the web app and Worker no longer reference it.';
