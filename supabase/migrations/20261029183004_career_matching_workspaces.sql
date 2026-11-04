-- Durable search criteria, evaluation receipts and list membership are separate
-- from candidate decisions. Server-only executors always receive the owner.
create table public.talent_matchings (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  title text not null,
  description text not null default '',
  criteria jsonb not null,
  previous_matching_id uuid references public.talent_matchings(id) on delete set null,
  revision bigint not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index talent_matchings_owner on public.talent_matchings(talent_id,updated_at desc,id);

create table public.talent_external_evaluations (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  run_id uuid references public.external_recommendation_runs(id) on delete set null,
  input_fingerprint text not null,
  assessment jsonb not null,
  input_snapshot jsonb not null,
  evaluated_at timestamptz not null default now(),
  unique(talent_id,role_id,input_fingerprint)
);
create index talent_external_evaluations_owner on public.talent_external_evaluations(talent_id, evaluated_at desc);

create table public.talent_opportunity_memberships (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  matching_id uuid references public.talent_matchings(id) on delete cascade,
  recommendation_id uuid not null references public.talent_opportunity_recommendation(id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  explanation text not null default '',
  rank integer not null default 0,
  archived_at timestamptz,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index talent_opportunity_membership_identity on public.talent_opportunity_memberships
  (talent_id,coalesce(matching_id,'00000000-0000-0000-0000-000000000000'::uuid),recommendation_id);
create index talent_opportunity_memberships_owner on public.talent_opportunity_memberships(talent_id,matching_id,archived_at);

create table public.talent_matching_operations (
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  operation_id text not null,
  command jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(talent_id,operation_id)
);

alter table public.external_recommendation_runs
  add column if not exists matching_id uuid references public.talent_matchings(id) on delete set null,
  add column if not exists operation_id text,
  add column if not exists conversation_id uuid references public.talent_conversations(id) on delete set null,
  add column if not exists request jsonb not null default '{}'::jsonb,
  add column if not exists input_snapshot jsonb,
  add column if not exists evaluation_ids uuid[] not null default '{}',
  add column if not exists candidate_role_ids uuid[] not null default '{}',
  add column if not exists cancelled_at timestamptz,
  add column if not exists completion_notified_at timestamptz,
  add column if not exists context_ready_at timestamptz;
-- Existing legacy checks describe an experiment, not execution integrity.
alter table public.external_recommendation_runs drop constraint if exists external_recommendation_runs_variant_check;
alter table public.external_recommendation_runs drop constraint if exists external_recommendation_runs_surface_check;
alter table public.external_recommendation_runs drop constraint if exists external_recommendation_runs_status_check;
create unique index external_recommendation_operation_identity on public.external_recommendation_runs(talent_id,operation_id) where operation_id is not null;
create index external_recommendation_matching on public.external_recommendation_runs(talent_id,matching_id,created_at desc);

alter table public.talent_matchings enable row level security;
alter table public.talent_external_evaluations enable row level security;
alter table public.talent_opportunity_memberships enable row level security;
alter table public.talent_matching_operations enable row level security;
revoke all on public.talent_matchings,public.talent_external_evaluations,public.talent_opportunity_memberships,public.talent_matching_operations from public,anon,authenticated;
grant all on public.talent_matchings,public.talent_external_evaluations,public.talent_opportunity_memberships,public.talent_matching_operations to service_role;

-- Membership changes plus reset/replace receipts invalidate stale list writes even
-- when the list was empty. Reuse the durable operation log, not a second list state.
create function public.career_opportunity_list_revision(p_talent uuid,p_matching uuid default null,p_all boolean default false)
returns text language sql stable security invoker set search_path='' as $$
 select md5(coalesce(string_agg(change,',' order by change),'')) from (
   select m.id::text||':'||m.revision::text as change
   from public.talent_opportunity_memberships m where m.talent_id=p_talent
   and (p_all or m.matching_id is not distinct from p_matching)
   union all
   select 'operation:'||o.operation_id from public.talent_matching_operations o
   where o.talent_id=p_talent and o.result ? 'listRevision'
   and o.command->>'action' in ('reset','replace')
   and (p_all or coalesce((o.command->>'allLists')::boolean,false)
     or nullif(o.command->>'matchingId','')::uuid is not distinct from p_matching)
 ) changes
$$;

create function public.write_career_matching(p_talent uuid,p_operation text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_op public.talent_matching_operations; m public.talent_matchings; result jsonb;
  target uuid := nullif(p_command->>'matchingId','')::uuid;
  action text := p_command->>'action';
begin
  perform pg_advisory_xact_lock(hashtextextended('career-matching:'||p_talent::text,0));
  select * into old_op from public.talent_matching_operations where talent_id=p_talent and operation_id=p_operation;
  if found then
    if old_op.command is distinct from p_command then raise exception 'Operation identity reused with different command'; end if;
    return old_op.result;
  end if;
  if not exists(select 1 from public.talent_users where user_id=p_talent and deleted_at is null) then raise exception 'Talent unavailable'; end if;
  if action='create' then
    if p_command->'criteria' is null then raise exception 'Complete matching criteria required'; end if;
    if nullif(p_command->>'previousMatchingId','') is not null and not exists(select 1 from public.talent_matchings where id=(p_command->>'previousMatchingId')::uuid and talent_id=p_talent) then raise exception 'Previous matching unavailable'; end if;
    insert into public.talent_matchings(talent_id,title,description,criteria,previous_matching_id)
      values(p_talent,p_command->>'title',coalesce(p_command->>'description',''),p_command->'criteria',nullif(p_command->>'previousMatchingId','')::uuid) returning * into m;
  else
    select * into strict m from public.talent_matchings where id=target and talent_id=p_talent for update;
    if m.revision is distinct from (p_command->>'expectedRevision')::bigint then raise exception 'Matching changed; read its current revision'; end if;
    if action not in ('update','archive','restore') then raise exception 'Unknown matching operation'; end if;
    update public.talent_matchings set title=coalesce(p_command->>'title',title),description=coalesce(p_command->>'description',description),
      archived_at=case when action='archive' then now() when action='restore' then null else archived_at end,
      revision=revision+1,updated_at=now() where id=m.id returning * into m;
  end if;
  result:=to_jsonb(m);
  insert into public.talent_matching_operations values(p_talent,p_operation,p_command,result,now());
  return result;
end $$;

create function public.write_career_opportunities(p_talent uuid,p_operation text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_op public.talent_matching_operations; item jsonb; rec public.talent_opportunity_recommendation;
  role public.company_roles; target uuid:=nullif(p_command->>'matchingId','')::uuid;
  action text:=p_command->>'action'; all_lists boolean:=coalesce((p_command->>'allLists')::boolean,false);
  kept uuid[]:='{}'; changed uuid[]:='{}'; member_id uuid; result jsonb; receipt jsonb; current_revision text;
begin
  perform pg_advisory_xact_lock(hashtextextended('career-matching:'||p_talent::text,0));
  select * into old_op from public.talent_matching_operations where talent_id=p_talent and operation_id=p_operation;
  if found then
    if old_op.command is distinct from p_command then raise exception 'Operation identity reused with different command'; end if;
    return old_op.result;
  end if;
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
        result:=public.publish_evaluated_internal_role_v1(p_talent,role.role_id,
          array(select jsonb_array_elements_text(coalesce(item->'evaluationIds','[]'::jsonb))::uuid),
          nullif(item->>'sourceRunId','')::uuid,p_operation||':'||role.role_id::text);
        select * into strict rec from public.talent_opportunity_recommendation where id=(result->>'recommendationId')::uuid;
        if target is not null and coalesce((result->>'created')::boolean,false) then
          delete from public.talent_opportunity_memberships where talent_id=p_talent and recommendation_id=rec.id and matching_id is null;
        end if;
      else
      if coalesce(role.is_expired,false) or role.status in ('closed','expired','inactive','archived','ended') or (role.expires_at is not null and role.expires_at<=now()) or lower(coalesce(role.information->>'testOnly','false'))='true' then raise exception 'Role is unavailable'; end if;
      if not exists(select 1 from public.company_workspace where company_workspace_id=role.company_workspace_id and external_roles_enabled=true) then raise exception 'Company opportunities unavailable'; end if;
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

-- Preserve existing IDs/decisions. A new legacy writer also receives a default
-- membership, so an in-flight old release remains visible after cutover.
create function public.ensure_career_opportunity_membership() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.kind='career_agent' then return new; end if;
  insert into public.talent_opportunity_memberships(talent_id,recommendation_id,role_id,explanation,rank,archived_at)
  values(new.talent_id,new.id,new.role_id,coalesce(new.fit_summary,''),coalesce(new.rank,0),case when new.feedback='dislike' or new.saved_stage='hidden' then now() else null end)
  on conflict do nothing;
  return new;
end $$;
create trigger career_opportunity_membership_after_insert after insert on public.talent_opportunity_recommendation for each row execute function public.ensure_career_opportunity_membership();
insert into public.talent_opportunity_memberships(talent_id,recommendation_id,role_id,explanation,rank,archived_at)
select talent_id,id,role_id,coalesce(fit_summary,''),coalesce(rank,0),case when feedback='dislike' or saved_stage='hidden' then now() else null end from public.talent_opportunity_recommendation on conflict do nothing;

revoke all on function public.career_opportunity_list_revision(uuid,uuid,boolean),public.write_career_matching(uuid,text,jsonb),public.write_career_opportunities(uuid,text,jsonb),public.ensure_career_opportunity_membership() from public,anon,authenticated;
grant execute on function public.career_opportunity_list_revision(uuid,uuid,boolean),public.write_career_matching(uuid,text,jsonb),public.write_career_opportunities(uuid,text,jsonb),public.ensure_career_opportunity_membership() to service_role;

-- Evidence visibility is checked by company readers, separately from private evaluation.
alter table public.company_role_candidate_evaluations
 add column if not exists source_profile_id uuid,
 add column if not exists source_profile_revision bigint,
 add column if not exists source_material_id uuid,
 add column if not exists evidence_scope text not null default 'default';

create function public.claim_career_external_search(p_id uuid,p_token uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.external_recommendation_runs;
begin
 update public.external_recommendation_runs set status='running',lease_token=p_token,
 lease_expires_at=now()+interval '15 minutes',attempts=attempts+1
 where id=p_id and variant='career_agent' and cancelled_at is null and context_ready_at is not null
 and status in ('queued','running') and (lease_expires_at is null or lease_expires_at<now()) returning * into r;
 return case when r.id is null then null else to_jsonb(r) end;
end $$;
revoke all on function public.claim_career_external_search(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_career_external_search(uuid,uuid) to service_role;

create function public.enqueue_career_internal_evaluation(p_talent uuid,p_conversation uuid,p_operation text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.opportunity_discovery_run;
begin
 perform pg_advisory_xact_lock(hashtextextended('career-internal:'||p_talent::text||':'||p_operation,0));
 if not exists(select 1 from public.talent_users where user_id=p_talent and deleted_at is null) then raise exception 'Talent unavailable'; end if;
 if p_conversation is not null and not exists(select 1 from public.talent_conversations where id=p_conversation and user_id=p_talent) then raise exception 'Conversation unavailable'; end if;
 select * into r from public.opportunity_discovery_run where talent_id=p_talent and dedupe_key='career-internal:'||p_talent::text||':'||p_operation;
 if found then return to_jsonb(r); end if;
 if not exists(select 1 from public.talent_profiles p join public.talent_profile_revisions v on v.profile_id=p.id where p.talent_id=p_talent and p.id=(p_payload->>'profileId')::uuid and v.revision=(p_payload->>'profileRevision')::bigint) then raise exception 'Profile revision unavailable'; end if;
 insert into public.opportunity_discovery_run(talent_id,conversation_id,trigger,run_mode,status,dedupe_key,trigger_payload)
 values(p_talent,p_conversation,'career_internal_evaluation','refresh','queued','career-internal:'||p_talent::text||':'||p_operation,p_payload||jsonb_build_object('operationId',p_operation)) returning * into r;
 return to_jsonb(r);
end $$;
create function public.control_career_internal_evaluation(p_talent uuid,p_run uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.opportunity_discovery_run;
begin
 select * into strict r from public.opportunity_discovery_run where id=p_run and talent_id=p_talent and trigger='career_internal_evaluation' for update;
 if p_action='cancel' then
 update public.opportunity_discovery_run set trigger_payload=trigger_payload||'{"cancelRequested":true}'::jsonb,
 status=case when status='queued' then 'cancelled' else status end where id=p_run returning * into r;
 elsif p_action='resume' then
 if r.status<>'running' then update public.opportunity_discovery_run set status='queued',lease_token=null,lease_heartbeat_at=null,trigger_payload=trigger_payload- 'cancelRequested',error_message=null,completed_at=null where id=p_run returning * into r; end if;
 else raise exception 'Unknown evaluation action'; end if;
 return to_jsonb(r);
end $$;
revoke all on function public.enqueue_career_internal_evaluation(uuid,uuid,text,jsonb),public.control_career_internal_evaluation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.enqueue_career_internal_evaluation(uuid,uuid,text,jsonb),public.control_career_internal_evaluation(uuid,uuid,text) to service_role;

create view public.company_readable_role_evaluations_v1 with (security_invoker=true) as
select e.* from public.company_role_candidate_evaluations e
where coalesce(e.evidence_scope,'default')='default' or exists(
 select 1 from public.talent_opportunity_recommendation r join public.talent_role_materials m on m.id=r.shared_material_id
 where r.talent_id=e.talent_id and r.role_id=e.role_id and m.profile_id=e.source_profile_id
 and m.profile_revision=e.source_profile_revision and (e.source_material_id is null or m.id=e.source_material_id));
revoke all on public.company_readable_role_evaluations_v1 from public,anon,authenticated;
grant select on public.company_readable_role_evaluations_v1 to service_role;

-- Resolve superseded cards for readers without rewriting their historical rows.
-- A direct membership for the current card supersedes its former card in the
-- same matching; another matching retains its own independent list position.
create view public.talent_opportunity_membership_index with (security_invoker=true) as
select distinct on (m.talent_id,m.matching_id,r.id)
 m.id,m.talent_id,m.matching_id,r.id as recommendation_id,m.recommendation_id as original_recommendation_id,
 m.role_id,m.explanation,m.rank,m.archived_at,m.revision,m.created_at,m.updated_at,
 jsonb_build_object('id',r.id,'feedback',r.feedback,'saved_stage',r.saved_stage,'fit_summary',r.fit_summary,'opportunity_type',r.opportunity_type,'role_id',r.role_id) as recommendation,
 jsonb_build_object('name',role.name,'company_workspace_id',role.company_workspace_id) as role
from public.talent_opportunity_memberships m
join public.talent_opportunity_recommendation r on r.id=public.current_talent_recommendation_id_v1(m.recommendation_id) and r.talent_id=m.talent_id
join public.company_roles role on role.role_id=m.role_id
order by m.talent_id,m.matching_id,r.id,(m.recommendation_id=r.id) desc,m.updated_at desc,m.id desc;
revoke all on public.talent_opportunity_membership_index from public,anon,authenticated;
grant select on public.talent_opportunity_membership_index to service_role;

-- List membership is an orthogonal projection; feedback remains a decision.
create or replace view public.talent_effective_opportunity_recommendations_v1 with (security_invoker=true) as
select r.*,case when exists(select 1 from public.talent_opportunity_membership_index m where m.talent_id=r.talent_id and m.recommendation_id=r.id and m.archived_at is null) then 'current' else 'previous' end as list_position,
(select m.explanation from public.talent_opportunity_membership_index m where m.talent_id=r.talent_id and m.recommendation_id=r.id
 order by (m.archived_at is null) desc,m.updated_at desc,m.id limit 1) as list_explanation
from public.talent_opportunity_recommendation r where r.id=public.current_talent_recommendation_id_v1(r.id);
revoke all on public.talent_effective_opportunity_recommendations_v1 from public,anon,authenticated;
grant select on public.talent_effective_opportunity_recommendations_v1 to service_role;

-- An explicit new rejection retains the legacy UI action of removing that card.
-- Restoring an already rejected card later changes membership only.
create function public.archive_career_rejected_memberships() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (new.feedback='dislike' and old.feedback is distinct from new.feedback) or (new.saved_stage='hidden' and old.saved_stage is distinct from new.saved_stage) then
 update public.talent_opportunity_memberships set archived_at=now(),revision=revision+1,updated_at=now()
 where talent_id=new.talent_id and public.current_talent_recommendation_id_v1(recommendation_id)=new.id and archived_at is null;
 end if;
 return new;
end $$;
create trigger archive_career_rejected_memberships after update of feedback,saved_stage on public.talent_opportunity_recommendation for each row execute function public.archive_career_rejected_memberships();
revoke all on function public.archive_career_rejected_memberships() from public,anon,authenticated;
grant execute on function public.archive_career_rejected_memberships() to service_role;

create view public.talent_external_evaluation_index with (security_invoker=true) as
select e.*,(assessment#>>'{fit,mutualFit}')::double precision as mutual_fit_score
from public.talent_external_evaluations e;
revoke all on public.talent_external_evaluation_index from public,anon,authenticated;
grant select on public.talent_external_evaluation_index to service_role;
