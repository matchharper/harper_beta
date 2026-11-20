-- Every Career recommendation is one talent_opportunity_recommendation row.
-- A row targets either a company_roles row (an official posting or a public hiring
-- post stored there) or a whole company identified by company_workspace_id.
-- company_db is never the identity of a recommended or evaluated company.
-- Existing rows already had role_id NOT NULL, so they satisfy the new one-target
-- checks; the checks stay NOT VALID to avoid rescanning large tables under lock.
set local lock_timeout = '10s';

alter table public.talent_opportunity_recommendation
  alter column role_id drop not null,
  add column if not exists company_workspace_id uuid
    references public.company_workspace(company_workspace_id) on delete cascade;
alter table public.talent_opportunity_recommendation
  add constraint talent_opportunity_recommendation_one_target
  check (num_nonnulls(role_id, company_workspace_id) = 1) not valid;
create index if not exists talent_opportunity_recommendation_company_idx
  on public.talent_opportunity_recommendation(talent_id, company_workspace_id)
  where company_workspace_id is not null;

alter table public.talent_opportunity_memberships
  alter column role_id drop not null,
  add column if not exists company_workspace_id uuid
    references public.company_workspace(company_workspace_id) on delete cascade;
alter table public.talent_opportunity_memberships
  add constraint talent_opportunity_memberships_one_target
  check (num_nonnulls(role_id, company_workspace_id) = 1) not valid;

-- Company and Role opportunities share the same Decisions rubric and cache.
alter table public.talent_external_evaluations
  alter column role_id drop not null,
  add column if not exists company_workspace_id uuid
    references public.company_workspace(company_workspace_id) on delete cascade;
alter table public.talent_external_evaluations
  add constraint talent_external_evaluations_one_target
  check (num_nonnulls(role_id, company_workspace_id) = 1) not valid;
create unique index if not exists talent_external_evaluations_company_key
  on public.talent_external_evaluations(talent_id, company_workspace_id, input_fingerprint);

alter table public.external_recommendation_runs
  add column if not exists candidate_company_workspace_ids uuid[] not null default '{}';

create or replace view public.talent_external_evaluation_index
with (security_invoker = true) as
  select id, talent_id, role_id, run_id, input_fingerprint, assessment, input_snapshot, evaluated_at,
    ((assessment #>> '{fit,mutualFit}'::text[]))::double precision as mutual_fit_score,
    company_workspace_id
  from public.talent_external_evaluations e;

create or replace view public.talent_opportunity_membership_index
with (security_invoker = true) as
  select distinct on (m.talent_id, m.matching_id, r.id) m.id,
    m.talent_id, m.matching_id, r.id as recommendation_id, m.recommendation_id as original_recommendation_id,
    m.role_id, m.explanation, m.rank, m.archived_at, m.revision, m.created_at, m.updated_at,
    jsonb_build_object('id', r.id, 'feedback', r.feedback, 'saved_stage', r.saved_stage, 'fit_summary', r.fit_summary,
      'opportunity_type', r.opportunity_type, 'role_id', r.role_id, 'company_workspace_id', r.company_workspace_id) as recommendation,
    jsonb_build_object('name', role.name, 'company_workspace_id', coalesce(role.company_workspace_id, m.company_workspace_id)) as role,
    m.company_workspace_id,
    jsonb_build_object('company_workspace_id', company.company_workspace_id, 'company_name', company.company_name) as company
  from public.talent_opportunity_memberships m
  join public.talent_opportunity_recommendation r
    on r.id = public.current_talent_recommendation_id_v1(m.recommendation_id) and r.talent_id = m.talent_id
  left join public.company_roles role on role.role_id = m.role_id
  left join public.company_workspace company
    on company.company_workspace_id = coalesce(role.company_workspace_id, m.company_workspace_id)
  where m.role_id is null or role.role_id is not null
  order by m.talent_id, m.matching_id, r.id, (m.recommendation_id = r.id) desc, m.updated_at desc, m.id desc;

-- talent_progress is Role-scoped. A company recommendation keeps its memo and
-- feedback on the recommendation row and in talent decision history.
create or replace function public.copy_legacy_talent_memo_to_progress_v1()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
begin
  if new.role_id is not null and nullif(btrim(new.talent_memo), '') is not null
    and not exists (
      select 1 from public.talent_progress progress
      where progress.recommendation_id = new.id and progress.kind = 'memo'
        and btrim(progress.text) = btrim(new.talent_memo)
    ) then
    insert into public.talent_progress (talent_id, role_id, recommendation_id, kind, text, metadata, created_at)
    values (new.talent_id, new.role_id, new.id, 'memo', btrim(new.talent_memo),
      jsonb_build_object('source', 'talent_memo_backfill'), new.updated_at);
  end if;
  return new;
end;
$function$;

create or replace function public.record_candidate_opportunity_feedback_v1()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if old.feedback is not distinct from new.feedback or new.role_id is null then return new; end if;
  insert into public.talent_progress (
    talent_id,role_id,recommendation_id,kind,text,metadata,open_to_talent,open_to_company
  ) values (new.talent_id,new.role_id,new.id,'candidate_opportunity_feedback_changed',
    coalesce(new.feedback,'cleared'),jsonb_build_object(
      'previousFeedback',old.feedback,'feedback',new.feedback,
      'source',coalesce(nullif(current_setting('harper.feedback_source',true),''),'unspecified'),
      'feedbackAt',new.feedback_at),true,false);
  return new;
end $function$;

create or replace function public.ensure_career_opportunity_membership()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if new.kind='career_agent' then return new; end if;
  insert into public.talent_opportunity_memberships(talent_id,recommendation_id,role_id,company_workspace_id,explanation,rank,archived_at)
  values(new.talent_id,new.id,new.role_id,new.company_workspace_id,coalesce(new.fit_summary,''),coalesce(new.rank,0),
    case when new.feedback='dislike' or new.saved_stage='hidden' then now() else null end)
  on conflict do nothing;
  return new;
end $function$;

create or replace function public.career_company_blocked_v1(p_talent uuid, p_workspace uuid)
returns boolean language sql stable set search_path to '' as $function$
  select exists(select 1 from public.talent_setting s, unnest(coalesce(s.blocked_companies,'{}')) b
    where s.user_id=p_talent and (b=p_workspace::text or exists(select 1 from public.company_workspace c
      where c.company_workspace_id=p_workspace and c.company_name ilike '%'||b||'%')));
$function$;

create or replace function public.write_career_opportunities(p_talent uuid, p_operation text, p_command jsonb)
returns jsonb language plpgsql set search_path to '' as $function$
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
        if not found then raise exception 'Selected internal proposal unavailable; a public posting chosen by the user uses apply_to_internal_role'; end if;
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
        and not (role.source_provider='user_submitted' and coalesce(role.information->'submittedTalentIds','[]'::jsonb) ? p_talent::text)
        then raise exception 'Company opportunities unavailable'; end if;
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

-- The Career context reader embeds the recommended company through this view.
create or replace view public.talent_effective_opportunity_recommendations_v1
with (security_invoker = true) as
  select id, talent_id, role_id, kind, score, rank, model_version, feedback, feedback_reason, feedback_at,
    viewed_at, clicked_at, dismissed_at, recommended_at, created_at, updated_at, opportunity_type, saved_stage,
    discovery_run_id, fit_summary, fit_reasons, tradeoffs, evidence, preference_fit, processed_stage, talent_memo,
    email_acceptance_confirmation, external_experiment_run_id, shared_material_id,
    case when exists (select 1 from public.talent_opportunity_membership_index m
        where m.talent_id = r.talent_id and m.recommendation_id = r.id and m.archived_at is null)
      then 'current'::text else 'previous'::text end as list_position,
    (select m.explanation from public.talent_opportunity_membership_index m
      where m.talent_id = r.talent_id and m.recommendation_id = r.id
      order by (m.archived_at is null) desc, m.updated_at desc, m.id limit 1) as list_explanation,
    company_workspace_id
  from public.talent_opportunity_recommendation r
  where id = public.current_talent_recommendation_id_v1(id);
