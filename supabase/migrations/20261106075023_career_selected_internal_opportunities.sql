begin;

-- Read existing company-side decisions, never the hidden Role inventory or fit cache.
-- No new selection or semantic quality gate is introduced here.
create function public.career_internal_selection_available_v1(p_talent uuid,p_selection uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.talent_opportunity_matching_review m
 join public.company_roles r on r.role_id=m.opportunity_id
 join public.company_internal_roles i on i.role_id=r.role_id
 join public.company_workspace w on w.company_workspace_id=r.company_workspace_id
 join public.company_first_search_runs run on run.id=m.run_id and run.company_workspace_id=r.company_workspace_id
 join public.talent_users u on u.user_id=m.talent_id and u.deleted_at is null
 join public.talent_setting t on t.user_id=m.talent_id
 where m.id=p_selection and m.talent_id=p_talent and m.decision in ('candidate_first','both')
   and m.closed_at is null and m.recommendation_id is null and coalesce(m.not_before,now())<=now()
   and r.source_type='internal' and r.status='active' and not coalesce(r.is_expired,false)
   and (r.expires_at is null or r.expires_at>now())
   and (lower(btrim(coalesce(r.information->>'testOnly','false'))) not in ('true','1','yes','on')
     or (nullif(r.information->>'testFixture','') is not null and coalesce(r.information->'testTalentIds','[]') ? p_talent::text))
   and t.get_internal_recommendation is distinct from false and t.profile_visibility is distinct from 'dont_share'
   and not exists(select 1 from unnest(coalesce(t.blocked_companies,'{}')) blocked
     where lower(btrim(blocked)) in (lower(btrim(w.company_name)),lower(btrim(w.published_name)),lower(w.company_workspace_id::text))))
$$;

create or replace function public.career_internal_role_is_readable_v1(p_talent uuid,p_role uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.company_roles r
 join public.company_internal_roles i on i.role_id=r.role_id
 join public.talent_users t on t.user_id=p_talent and t.deleted_at is null
 where r.role_id=p_role and r.source_type='internal'
   and r.status in ('active','paused','top_priority') and not coalesce(r.is_expired,false)
   and (r.expires_at is null or r.expires_at>now())
   and (case when lower(coalesce(r.information->>'testOnly','false')) in ('true','1','yes','on')
     then nullif(r.information->>'testFixture','') is not null and coalesce(r.information->'testTalentIds','[]') ? p_talent::text
     else (coalesce(i.is_promote,false) and exists(select 1 from public.official_jobs j where j.role_id=r.role_id and j.is_published))
       or exists(select 1 from public.talent_opportunity_matching_review m where m.talent_id=p_talent and m.opportunity_id=r.role_id and public.career_internal_selection_available_v1(p_talent,m.id))
       or exists(select 1 from public.talent_opportunity_recommendation o where o.talent_id=p_talent and o.role_id=r.role_id)
   end))
$$;

-- Minimal, candidate-safe index. Full shared Role facts stay in the existing exact reader.
create function public.read_career_internal_selections_v1(p_talent uuid,p_offset integer default 0,p_limit integer default 8,p_companies text[] default null,p_posting_url text default null)
returns table(selection_id uuid,role_id uuid,selected_at timestamptz,company_name text,role_name text,total_count bigint)
language sql stable security invoker set search_path='' as $$
 with available as (
   select distinct on (m.opportunity_id) m.id,m.opportunity_id,m.reviewed_at,
     public.read_career_internal_role_v1(p_talent,m.opportunity_id) facts
   from public.talent_opportunity_matching_review m
   where m.talent_id=p_talent and public.career_internal_selection_available_v1(p_talent,m.id)
     and not exists(select 1 from public.talent_opportunity_recommendation r where r.talent_id=p_talent and r.role_id=m.opportunity_id)
   order by m.opportunity_id,m.reviewed_at desc,m.id desc
 ), filtered as (
   select * from available a where
     (coalesce(cardinality(p_companies),0)=0 or exists(select 1 from unnest(p_companies) name where strpos(lower(a.facts->>'companyName'),lower(name))>0))
     and (p_posting_url is null or p_posting_url='https://matchharper.com/jobs/'||(a.facts->>'publicJobSlug'))
 )
 select id,opportunity_id,reviewed_at,facts->>'companyName',facts->>'name',count(*) over()
 from filtered order by reviewed_at desc,id desc offset greatest(p_offset,0) limit greatest(p_limit,1)
$$;

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
  if (action in ('add','restore','replace','reset') or p_command ? 'expectedRevision') and current_revision is distinct from p_command->>'expectedRevision' then raise exception 'List changed; read its current revision'; end if;
  if all_lists and action not in ('reset','archive') then raise exception 'Select one list for writes'; end if;
  for item in select value from jsonb_array_elements(coalesce(p_command->'items','[]'::jsonb)) loop
    select * into rec from public.talent_opportunity_recommendation r where r.talent_id=p_talent
      and (case when nullif(item->>'recommendationId','') is not null then r.id=public.current_talent_recommendation_id_v1((item->>'recommendationId')::uuid) else r.role_id=(item->>'roleId')::uuid end)
      and r.id=public.current_talent_recommendation_id_v1(r.id)
      order by r.created_at desc,r.id desc limit 1 for update;
    if not found then
      if action not in ('add','replace') then raise exception 'Recommendation unavailable'; end if;
      select * into strict role from public.company_roles where role_id=(item->>'roleId')::uuid;
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
      if not exists(select 1 from public.talent_external_evaluations e where e.id=(item->>'evaluationId')::uuid and e.talent_id=p_talent and e.role_id=role.role_id) then raise exception 'Evaluation reference unavailable'; end if;
      insert into public.talent_opportunity_recommendation(talent_id,role_id,kind,opportunity_type,rank,fit_summary,fit_reasons,tradeoffs,evidence)
        values(p_talent,role.role_id,'career_agent','external_jd',coalesce((item->>'rank')::integer,0),coalesce(item->>'explanation',''),'[]','[]',jsonb_build_object('evaluationId',item->>'evaluationId')) returning * into rec;
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

revoke all on function public.career_internal_selection_available_v1(uuid,uuid),public.read_career_internal_selections_v1(uuid,integer,integer,text[],text) from public,anon,authenticated;
grant execute on function public.career_internal_selection_available_v1(uuid,uuid),public.read_career_internal_selections_v1(uuid,integer,integer,text[],text) to service_role;

-- Read-time workload facts for the existing company-side selector, not new caps.
create or replace function public.company_scheduled_accepted_inventory_v1(p_workspace uuid,p_role uuid,p_activation_run uuid default null)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'selectedUnpublished',(select count(distinct m.talent_id) from public.talent_opportunity_matching_review m
      where m.opportunity_id=p_role and public.career_internal_selection_available_v1(m.talent_id,m.id)
        and not exists(select 1 from public.talent_opportunity_recommendation rec where rec.talent_id=m.talent_id and rec.role_id=p_role)),
    'publishedAwaitingCandidate',(select count(distinct rec.talent_id) from public.talent_opportunity_recommendation rec
      where rec.role_id=p_role and rec.id=public.current_talent_recommendation_id_v1(rec.id)
        and rec.opportunity_type='internal_recommendation' and coalesce(rec.feedback,'') not in ('positive','negative','like','dislike')
        and coalesce(rec.saved_stage,'') not in ('closed','hidden')
        and coalesce(rec.processed_stage,'') not in ('rejected','archived','process_stopped','connected','final_offer')),
    'proposalCountMeaning','Selected unpublished and published awaiting candidate are outstanding proposals, not confirmed interest or channel-delivery receipts. Accepted unintroduced and pending for Role are separate later steps. No private candidate identities are exposed by these counts.',
    'acceptedUnintroduced',(select count(*) from public.talent_opportunity_recommendation rec
      where rec.role_id=p_role and public.accepted_role_pair_is_available_v1(rec.id)),
    'readyCompanyWide',(select count(distinct talent_id) from public.company_intro_candidates
      where company_workspace_id=p_workspace and status='ready'),
    'pendingForRole',(select count(*) from (select distinct on(talent_id) tag
      from public.talent_opportunity_tag where opportunity_id=p_role
      order by talent_id,updated_at desc,created_at desc,id desc) latest where tag='내부:연결대기'),
    'newRegistrations',case when exists(select 1 from public.company_first_search_runs where role_id=p_role
      and status='succeeded' and source_cutoff is not null) then (select count(*) from public.talent_users where deleted_at is null
      and created_at>(select max(source_cutoff) from public.company_first_search_runs
        where role_id=p_role and status='succeeded')) else null end,
    'newRegistrationsDenominator','All non-deleted accounts after the last completed Role cutoff; not role-retrieved or compatible unassessed people',
    'currentRoutes',to_jsonb(array_remove(array[
      case when public.role_matching_slot_type_v1(p_role,now()) in ('free','paid')
        and (to_char(now() at time zone 'Asia/Seoul','Dy') in ('Mon','Wed','Fri')
          or public.company_matching_activation_is_valid_v1(p_activation_run,p_workspace,p_role)) then 'candidate_first' end,
      case when public.role_matching_slot_type_v1(p_role,now()) in ('free','paid')
        and ((i.is_company_first_search and to_char(now() at time zone 'Asia/Seoul','Dy')=any(coalesce(i.intro_search_date,array['Mon','Wed','Fri'])))
          or public.company_matching_activation_is_valid_v1(p_activation_run,p_workspace,p_role))
        and ((exists(select 1 from public.company_slack_channels c where c.company_workspace_id=p_workspace and c.is_enabled
          and not exists(select 1 from public.company_role_notification_channels o where o.channel_id=c.id and o.role_id=p_role)))
          or (public.company_role_candidate_email_enabled_v1(p_role) and exists(select 1 from public.company_role_email_recipients_v1(p_role))))
        then 'company_first' end],null)))
  from public.company_roles r join public.company_internal_roles i using(role_id)
  where r.role_id=p_role and r.company_workspace_id=p_workspace
$$;


-- Queue only with a NEW onboarding invocation. Existing users/repeated completion
-- calls reuse their original run and cannot request another warmup.
create or replace function public.enqueue_career_onboarding_invocation(p_user_id uuid,p_conversation_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.opportunity_discovery_run;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('career-onboarding:'||p_user_id,0));
 insert into public.talent_setting(user_id,is_onboarding_done) values(p_user_id,true)
 on conflict(user_id) do update set is_onboarding_done=true,updated_at=now();
 select * into r from public.opportunity_discovery_run where talent_id=p_user_id and trigger='conversation_completed' order by created_at limit 1;
 if found then return to_jsonb(r); end if;
 insert into public.opportunity_discovery_run(talent_id,conversation_id,trigger,run_mode,status,dedupe_key,target_recommendation_count,trigger_payload)
 values(p_user_id,p_conversation_id,'conversation_completed','initial','queued','career-onboarding:'||p_user_id,0,
  p_payload||jsonb_build_object('runContract','career_agent_v1','instruction','This is a newly joined candidate who has just completed their first onboarding. Continue the candidate''s Career purpose using their current Brief and profile. For this first recommendation, offer a somewhat fuller selection of useful opportunities to help them explore their options and give feedback. Use roughly 10-15 opportunities as a reference range when enough suitable options are available, not as a quota, minimum or maximum. Decide the actual number from their goals, preferences, available opportunities and actual usefulness; recommend fewer or more when the context warrants it, and do not pad the selection just to reach the range. Decide useful initial work and save future checks if warranted. No fixed recommendation count or start email is required.')) returning * into r;
 insert into public.opportunity_discovery_run(talent_id,conversation_id,trigger,run_mode,status,dedupe_key,target_recommendation_count,trigger_payload)
 values(p_user_id,p_conversation_id,'onboarding_internal_evaluation','initial','queued','career-onboarding-internal:'||p_user_id,0,
   jsonb_build_object('runContract','career_onboarding_internal_evaluation_v1','onboardingRunId',r.id))
 on conflict do nothing;
 return to_jsonb(r);
end $$;

revoke all on function public.enqueue_career_onboarding_invocation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_career_onboarding_invocation(uuid,uuid,jsonb) to service_role;

commit;
