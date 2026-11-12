-- A list-wide snapshot is needed for destructive set replacement, not targeted additions.
-- Evaluation evidence is optional; supplied evidence must still belong to this talent and Role.
-- Keep ownership, availability, internal selection, test isolation and operation idempotency.
begin;

create or replace function public.write_career_opportunities(p_talent uuid,p_operation text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_op public.talent_matching_operations; item jsonb; rec public.talent_opportunity_recommendation;
  selection public.talent_opportunity_matching_review; source public.career_daily_sources;
  publishing_run uuid:=nullif(p_command->>'backgroundRunId','')::uuid;
  role public.company_roles; target uuid:=nullif(p_command->>'matchingId','')::uuid;
  action text:=p_command->>'action'; all_lists boolean:=coalesce((p_command->>'allLists')::boolean,false);
  kept uuid[]:='{}'; changed uuid[]:='{}'; member_id uuid; result jsonb; receipt jsonb; current_revision text;
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
    select * into rec from public.talent_opportunity_recommendation r where r.talent_id=p_talent
      and (case when nullif(item->>'recommendationId','') is not null then r.id=public.current_talent_recommendation_id_v1((item->>'recommendationId')::uuid) else r.role_id=(item->>'roleId')::uuid end)
      and r.id=public.current_talent_recommendation_id_v1(r.id)
      order by r.created_at desc,r.id desc limit 1 for update;
    if not found then
      if action not in ('add','replace') then raise exception 'Recommendation unavailable'; end if;
      select * into role from public.company_roles where role_id=(item->>'roleId')::uuid;
      if not found then raise exception 'Role is unavailable: %', item->>'roleId'; end if;
      if role.source_type='internal' then
        select * into selection from public.talent_opportunity_matching_review m
          where m.talent_id=p_talent and m.opportunity_id=role.role_id
            and public.career_internal_selection_available_v1(p_talent,m.id)
          order by m.reviewed_at desc,m.id desc limit 1 for update;
        if not found then raise exception 'Selected internal proposal unavailable; a public posting chosen by the user uses apply_to_internal_role'; end if;
        -- A claimed daily invocation owns delivery until it finishes. Foreground
        -- publication may consume an unclaimed source, never race an active sender.
        for source in select * from public.career_daily_sources d where d.talent_id=p_talent
          and d.source_kind='talent_selection' and d.source_id in (select m.id::text from public.talent_opportunity_matching_review m
            where m.talent_id=p_talent and m.opportunity_id=role.role_id and m.closed_at is null and m.recommendation_id is null)
          and d.cancelled_at is null and d.finished_at is null for update
        loop
          if source.run_id is not null and source.run_id is distinct from publishing_run
            and exists(select 1 from public.opportunity_discovery_run where id=source.run_id and status in ('queued','running','handed_off'))
            then raise exception 'This proposal is already being prepared in the current Career update'; end if;
        end loop;
        perform public.read_career_internal_role_v1(p_talent,role.role_id);
        insert into public.talent_opportunity_recommendation(talent_id,role_id,kind,opportunity_type,rank,fit_summary,fit_reasons,tradeoffs,evidence)
          values(p_talent,role.role_id,'career_agent','internal_recommendation',coalesce((item->>'rank')::integer,0),coalesce(item->>'explanation',''),'[]','[]',jsonb_build_object('operationId',p_operation,'selectionId',selection.id,'backgroundRunId',publishing_run)) returning * into rec;
        update public.talent_opportunity_matching_review set recommendation_id=rec.id
          where talent_id=p_talent and opportunity_id=role.role_id and closed_at is null
            and recommendation_id is null and decision in ('candidate_first','both');
        -- Publication is a visible saved recommendation, not an email/chat receipt.
        -- Only its owning daily invocation may still send the corresponding update.
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
      if not exists(select 1 from public.company_workspace where company_workspace_id=role.company_workspace_id and external_roles_enabled=true)
        -- A posting this talent imported stays private to them but is publishable to their own list.
        and not (role.source_provider='user_submitted' and coalesce(role.information->'submittedTalentIds','[]'::jsonb) ? p_talent::text)
        then raise exception 'Company opportunities unavailable'; end if;
      if exists(select 1 from public.talent_setting s,unnest(coalesce(s.blocked_companies,'{}')) b where s.user_id=p_talent and (b=role.company_workspace_id::text or exists(select 1 from public.company_workspace c where c.company_workspace_id=role.company_workspace_id and c.company_name ilike '%'||b||'%'))) then raise exception 'Company is blocked'; end if;
      if nullif(item->>'evaluationId','') is not null and not exists(select 1 from public.talent_external_evaluations e where e.id=(item->>'evaluationId')::uuid and e.talent_id=p_talent and e.role_id=role.role_id) then raise exception 'Evaluation reference unavailable'; end if;
      insert into public.talent_opportunity_recommendation(talent_id,role_id,kind,opportunity_type,rank,fit_summary,fit_reasons,tradeoffs,evidence)
        values(p_talent,role.role_id,'career_agent','external_jd',coalesce((item->>'rank')::integer,0),coalesce(item->>'explanation',''),'[]','[]',jsonb_strip_nulls(jsonb_build_object('evaluationId',nullif(item->>'evaluationId','')))) returning * into rec;
      end if;
    end if;
    if action in ('add','restore','replace') then
      select * into strict role from public.company_roles where role_id=rec.role_id;
      if coalesce(role.is_expired,false) or role.status in ('closed','expired','inactive','archived','ended') or (role.expires_at is not null and role.expires_at<=now()) then raise exception 'Role is unavailable'; end if;
      if lower(coalesce(role.information->>'testOnly','false'))='true' and not coalesce(role.information->'testTalentIds','[]'::jsonb) ? p_talent::text then raise exception 'Test Role unavailable'; end if;
      if exists(select 1 from public.talent_setting s,unnest(coalesce(s.blocked_companies,'{}')) b where s.user_id=p_talent and (b=role.company_workspace_id::text or exists(select 1 from public.company_workspace c where c.company_workspace_id=role.company_workspace_id and c.company_name ilike '%'||b||'%'))) then raise exception 'Company is blocked'; end if;
    end if;
    if nullif(item->>'roleId','') is not null and rec.role_id<>(item->>'roleId')::uuid then raise exception 'Recommendation role mismatch'; end if;
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
      insert into public.talent_opportunity_memberships(talent_id,matching_id,recommendation_id,role_id,explanation,rank,archived_at)
        values(p_talent,target,rec.id,rec.role_id,coalesce(item->>'explanation',rec.fit_summary,''),coalesce((item->>'rank')::integer,0),case when action='archive' then now() else null end)
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
end $$;

commit;
