begin;

-- Identity, immutable text, and exact delivery inputs are durable product facts.
create table public.talent_profiles (
 id uuid primary key default gen_random_uuid(),
 talent_id uuid not null references public.talent_users(user_id) on delete cascade,
 title text not null, purpose text, current_revision bigint not null default 1,
 is_default boolean not null default false, is_archived boolean not null default false,
 creation_operation_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(talent_id,creation_operation_id)
);
create unique index talent_profiles_one_default on public.talent_profiles(talent_id) where is_default;
create index talent_profiles_owner on public.talent_profiles(talent_id,id);
create table public.talent_profile_revisions (
 profile_id uuid not null references public.talent_profiles(id) on delete cascade,
 revision bigint not null, snapshot jsonb not null, source jsonb not null default '{}', operation_id text,
 created_at timestamptz not null default now(), primary key(profile_id,revision), unique(profile_id,operation_id)
);
create table public.talent_role_materials (
 id uuid primary key default gen_random_uuid(),
 talent_id uuid not null references public.talent_users(user_id) on delete cascade,
 role_id uuid not null references public.company_roles(role_id) on delete cascade,
 revision bigint not null, action text not null,
 profile_id uuid, profile_revision bigint, profile_snapshot jsonb,
 documents jsonb not null default '[]', source jsonb not null default '{}', operation_id text not null,
 created_at timestamptz not null default now(), unique(talent_id,role_id,revision),unique(talent_id,operation_id),
 foreign key(profile_id,profile_revision) references public.talent_profile_revisions(profile_id,revision)
);
create index talent_role_materials_pair on public.talent_role_materials(talent_id,role_id,revision desc);
create view public.talent_current_role_materials_v1 as
 select distinct on (talent_id,role_id) * from public.talent_role_materials
 order by talent_id,role_id,revision desc;
revoke all on public.talent_current_role_materials_v1 from public,anon,authenticated;
grant select on public.talent_current_role_materials_v1 to service_role;

create table public.talent_role_material_files (
 material_id uuid not null references public.talent_role_materials(id) on delete cascade,
 document_id uuid not null, content_hash text not null, renderer_version text not null,
 storage_path text not null, file_hash text not null, created_at timestamptz not null default now(),
 primary key(material_id,document_id)
);
alter table public.talent_opportunity_recommendation add column shared_material_id uuid references public.talent_role_materials(id);
alter table public.company_intro_candidates add column shared_material_id uuid references public.talent_role_materials(id);

create function public.capture_talent_profile_snapshot_v1(p_talent_id uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'talentUser',jsonb_build_object('user_id',t.user_id,'name',t.name,'headline',t.headline,'bio',t.bio,
   'location',t.location,'current_location',t.current_location,'email',t.email,'phone_number',t.phone_number,
   'profile_picture',t.profile_picture,'resume_links',t.resume_links,'resume_file_name',t.resume_file_name,
   'resume_storage_path',t.resume_storage_path,'resume_text',t.resume_text),
  'talentExperiences',coalesce((select jsonb_agg(to_jsonb(e) order by e.start_date desc nulls last,e.id) from public.talent_experiences e where e.talent_id=p_talent_id),'[]'),
  'talentEducations',coalesce((select jsonb_agg(to_jsonb(e) order by e.start_date desc nulls last,e.id) from public.talent_educations e where e.talent_id=p_talent_id),'[]'),
  'talentExtras',coalesce((select case when jsonb_typeof(e.content)='array' then e.content else coalesce(e.content->'talent_extras',e.content->'talentExtras',e.content->'extras',e.content->'items',e.content->'publications','[]') end from public.talent_extras e where e.talent_id=p_talent_id),'[]')
 ) from public.talent_users t where t.user_id=p_talent_id and t.deleted_at is null
$$;

create function public.ensure_talent_profile_v1(p_talent_id uuid) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid; v_snapshot jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('talent-profile:'||p_talent_id,0));
 if not exists(select 1 from public.talent_users where user_id=p_talent_id and deleted_at is null) then raise exception 'profile_owner_not_found'; end if;
 select id into v_id from public.talent_profiles where talent_id=p_talent_id and is_default;
 if v_id is not null then return v_id; end if;
 v_snapshot:=public.capture_talent_profile_snapshot_v1(p_talent_id);
 if v_snapshot is null then raise exception 'profile_owner_not_found'; end if;
 insert into public.talent_profiles(talent_id,title,is_default,creation_operation_id) values(p_talent_id,'기본 프로필',true,'initial_snapshot') returning id into v_id;
 insert into public.talent_profile_revisions(profile_id,revision,snapshot,source,operation_id) values(v_id,1,v_snapshot,'{"kind":"existing_profile"}','initial_snapshot');
 return v_id;
end $$;

create function public.read_talent_profile_v1(p_talent_id uuid,p_profile_id uuid default null,p_revision bigint default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_profile public.talent_profiles; v_snapshot jsonb;
begin
 if not exists(select 1 from public.talent_users where user_id=p_talent_id and deleted_at is null) then raise exception 'profile_owner_not_found'; end if;
 select * into v_profile from public.talent_profiles where id=coalesce(p_profile_id,public.ensure_talent_profile_v1(p_talent_id)) and talent_id=p_talent_id;
 if not found then raise exception 'profile_not_found'; end if;
 select snapshot into v_snapshot from public.talent_profile_revisions where profile_id=v_profile.id and revision=coalesce(p_revision,v_profile.current_revision);
 if not found then raise exception 'profile_revision_not_found'; end if;
 return jsonb_build_object('profileId',v_profile.id,'revision',coalesce(p_revision,v_profile.current_revision),'title',v_profile.title,'purpose',v_profile.purpose,'isDefault',v_profile.is_default,'isArchived',v_profile.is_archived,'snapshot',v_snapshot);
end $$;

-- All modern writes commit the revision and compatibility tables atomically.
create function public.project_talent_profile_v1(p_talent_id uuid,p_snapshot jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_user jsonb:=p_snapshot->'talentUser'; v_row jsonb;
begin
 perform set_config('harper.profile_projection','1',true);
 update public.talent_users set name=v_user->>'name',headline=v_user->>'headline',bio=v_user->>'bio',
 location=v_user->>'location',current_location=v_user->>'current_location',profile_picture=v_user->>'profile_picture',
 phone_number=v_user->>'phone_number',resume_links=coalesce(array(select jsonb_array_elements_text(coalesce(v_user->'resume_links','[]'))),'{}'),
 resume_file_name=v_user->>'resume_file_name',resume_storage_path=v_user->>'resume_storage_path',resume_text=v_user->>'resume_text',updated_at=now()
 where user_id=p_talent_id and deleted_at is null;
 if not found then raise exception 'profile_owner_not_found'; end if;
 delete from public.talent_experiences where talent_id=p_talent_id;
 for v_row in select value from jsonb_array_elements(coalesce(p_snapshot->'talentExperiences','[]')) loop
  insert into public.talent_experiences(id,talent_id,company_id,company_link,company_location,company_logo,company_name,description,employment_type,start_date,end_date,memo,months,role)
  values(coalesce((v_row->>'id')::bigint,nextval(pg_get_serial_sequence('public.talent_experiences','id'))),p_talent_id,v_row->>'company_id',v_row->>'company_link',v_row->>'company_location',v_row->>'company_logo',v_row->>'company_name',v_row->>'description',v_row->>'employment_type',(v_row->>'start_date')::date,(v_row->>'end_date')::date,v_row->>'memo',(v_row->>'months')::integer,v_row->>'role');
 end loop;
 delete from public.talent_educations where talent_id=p_talent_id;
 for v_row in select value from jsonb_array_elements(coalesce(p_snapshot->'talentEducations','[]')) loop
  insert into public.talent_educations(id,talent_id,degree,description,end_date,field,memo,school,start_date,url)
  values(coalesce((v_row->>'id')::bigint,nextval(pg_get_serial_sequence('public.talent_educations','id'))),p_talent_id,v_row->>'degree',v_row->>'description',(v_row->>'end_date')::date,v_row->>'field',v_row->>'memo',v_row->>'school',(v_row->>'start_date')::date,v_row->>'url');
 end loop;
 insert into public.talent_extras(talent_id,content) values(p_talent_id,jsonb_build_object('talent_extras',coalesce(p_snapshot->'talentExtras','[]')))
 on conflict(talent_id) do update set content=excluded.content;
 perform set_config('harper.profile_projection','0',true);
end $$;

create function public.write_talent_profile_v1(p_talent_id uuid,p_action text,p_profile_id uuid,p_expected_revision bigint,p_snapshot jsonb,p_title text,p_purpose text,p_operation_id text,p_source jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_profile public.talent_profiles; v_id uuid; v_revision bigint; v_snapshot jsonb; v_result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('talent-profile:'||p_talent_id,0));
 perform public.ensure_talent_profile_v1(p_talent_id);
 if nullif(p_operation_id,'') is null then raise exception 'profile_operation_required'; end if;
 if p_action in ('create','copy') then
  select id into v_id from public.talent_profiles where talent_id=p_talent_id and creation_operation_id=p_operation_id;
  if v_id is not null then return public.read_talent_profile_v1(p_talent_id,v_id,1); end if;
  if p_action='copy' then
   v_snapshot:=public.read_talent_profile_v1(p_talent_id,p_profile_id,p_expected_revision)->'snapshot';
   -- The tool can apply confirmed edits while copying an exact source revision.
   -- Authorize that source even when it supplies the resulting complete snapshot.
   if p_snapshot is not null then v_snapshot:=p_snapshot; end if;
  else v_snapshot:=p_snapshot; end if;
  if v_snapshot is null then raise exception 'profile_snapshot_required'; end if;
  v_snapshot:=jsonb_set(v_snapshot,'{talentUser,user_id}',to_jsonb(p_talent_id));
  insert into public.talent_profiles(talent_id,title,purpose,creation_operation_id) values(p_talent_id,coalesce(nullif(p_title,''),'프로필'),p_purpose,p_operation_id) returning * into v_profile;
  insert into public.talent_profile_revisions(profile_id,revision,snapshot,source,operation_id) values(v_profile.id,1,v_snapshot,p_source,p_operation_id);
 else
  select * into v_profile from public.talent_profiles where id=coalesce(p_profile_id,public.ensure_talent_profile_v1(p_talent_id)) and talent_id=p_talent_id for update;
  if not found then raise exception 'profile_not_found'; end if;
  select revision into v_revision from public.talent_profile_revisions where profile_id=v_profile.id and operation_id=p_operation_id;
  if v_revision is not null then return public.read_talent_profile_v1(p_talent_id,v_profile.id,v_revision); end if;
  if p_expected_revision is null or p_expected_revision<>v_profile.current_revision then raise exception 'profile_revision_conflict'; end if;
  select snapshot into v_snapshot from public.talent_profile_revisions where profile_id=v_profile.id and revision=v_profile.current_revision;
  if p_action='update' then
   if p_snapshot is null then raise exception 'profile_snapshot_required'; end if;
   v_snapshot:=jsonb_set(p_snapshot,'{talentUser,user_id}',to_jsonb(p_talent_id));
  elsif p_action='set_default' then
   update public.talent_profiles set is_default=false where talent_id=p_talent_id and is_default;
   v_profile.is_default:=true; v_profile.is_archived:=false;
  elsif p_action='archive' then
   if v_profile.is_default then raise exception 'choose_default_profile_before_archiving'; end if;
   v_profile.is_archived:=true;
  elsif p_action='restore' then v_profile.is_archived:=false;
  else raise exception 'unknown_profile_action'; end if;
  v_profile.current_revision:=v_profile.current_revision+1;
  update public.talent_profiles set current_revision=v_profile.current_revision,title=coalesce(p_title,title),purpose=coalesce(p_purpose,purpose),is_default=v_profile.is_default,is_archived=v_profile.is_archived,updated_at=now() where id=v_profile.id;
  if v_profile.is_default then
   perform public.project_talent_profile_v1(p_talent_id,v_snapshot);
   v_snapshot:=public.capture_talent_profile_snapshot_v1(p_talent_id);
  end if;
  insert into public.talent_profile_revisions(profile_id,revision,snapshot,source,operation_id) values(v_profile.id,v_profile.current_revision,v_snapshot,p_source,p_operation_id);
 end if;
 return public.read_talent_profile_v1(p_talent_id,v_profile.id,v_profile.current_revision);
end $$;

-- Compatibility ingress covers old onboarding/import/voice writers until migrated.
-- Capture every committed change, never silently overwrite a chosen role variant.
create function public.capture_legacy_talent_profile_v1() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_talent uuid; v_id uuid; v_snapshot jsonb; v_previous jsonb; v_revision bigint;
begin
 if current_setting('harper.profile_projection',true)='1' then return null; end if;
 v_talent:=coalesce(to_jsonb(new)->>'user_id',to_jsonb(old)->>'user_id',to_jsonb(new)->>'talent_id',to_jsonb(old)->>'talent_id')::uuid;
 if not exists(select 1 from public.talent_users where user_id=v_talent and deleted_at is null) then return null; end if;
 v_id:=public.ensure_talent_profile_v1(v_talent);
 v_snapshot:=public.capture_talent_profile_snapshot_v1(v_talent);
 select p.current_revision,r.snapshot into v_revision,v_previous from public.talent_profiles p join public.talent_profile_revisions r on r.profile_id=p.id and r.revision=p.current_revision where p.id=v_id;
 if v_snapshot is not distinct from v_previous then return null; end if;
 update public.talent_profiles set current_revision=current_revision+1,updated_at=now() where id=v_id returning current_revision into v_revision;
 insert into public.talent_profile_revisions(profile_id,revision,snapshot,source) values(v_id,v_revision,v_snapshot,jsonb_build_object('kind','compatibility_write','table',TG_TABLE_NAME));
 return null;
end $$;
create trigger talent_profile_version_user after insert or update on public.talent_users for each row execute function public.capture_legacy_talent_profile_v1();
create trigger talent_profile_version_experience after insert or update or delete on public.talent_experiences for each row execute function public.capture_legacy_talent_profile_v1();
create trigger talent_profile_version_education after insert or update or delete on public.talent_educations for each row execute function public.capture_legacy_talent_profile_v1();
create trigger talent_profile_version_extra after insert or update or delete on public.talent_extras for each row execute function public.capture_legacy_talent_profile_v1();

create function public.assign_talent_role_materials_v1(p_talent_id uuid,p_role_id uuid,p_action text,p_expected_revision bigint,p_profile_id uuid,p_profile_revision bigint,p_documents jsonb,p_operation_id text,p_source jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_current public.talent_role_materials; v_saved public.talent_role_materials; v_profile jsonb; v_doc jsonb; v_document public.talent_documents; v_documents jsonb:='[]';
begin
 perform pg_advisory_xact_lock(hashtextextended('talent-material:'||p_talent_id||':'||p_role_id,0));
 if not exists(select 1 from public.talent_users where user_id=p_talent_id and deleted_at is null) then raise exception 'profile_owner_not_found'; end if;
 select * into v_saved from public.talent_role_materials where talent_id=p_talent_id and operation_id=p_operation_id;
 if found then return to_jsonb(v_saved); end if;
 perform 1 from public.company_roles where role_id=p_role_id and source_type='internal';
 if not found then raise exception 'internal_role_not_found'; end if;
 select * into v_current from public.talent_role_materials where talent_id=p_talent_id and role_id=p_role_id order by revision desc limit 1;
 if coalesce(p_expected_revision,0)<>coalesce(v_current.revision,0) then raise exception 'role_assignment_revision_conflict'; end if;
 if p_action='set' then
  v_profile:=public.read_talent_profile_v1(p_talent_id,p_profile_id,p_profile_revision);
  for v_doc in select value from jsonb_array_elements(coalesce(p_documents,'[]')) loop
   select * into v_document from public.talent_documents where id=(v_doc->>'documentId')::uuid and talent_id=p_talent_id and not is_deleted for share;
   if not found then raise exception 'assignment_document_not_found'; end if;
   if coalesce(v_document.revision,1)<>coalesce((v_doc->>'revision')::bigint,0) then raise exception 'assignment_document_revision_conflict'; end if;
   v_documents:=v_documents||jsonb_build_array(to_jsonb(v_document));
  end loop;
  -- Legacy resumes without a document row remain part of the same default-sharing
  -- contract. An explicit profile-only assignment never adds a file implicitly.
  if p_source->'defaultAcceptance'='true'::jsonb
   and nullif(v_profile#>>'{snapshot,talentUser,resume_storage_path}','') is not null
   and not exists(select 1 from public.talent_documents where talent_id=p_talent_id and kind='resume' and is_primary and not is_deleted) then
   v_documents:=v_documents||jsonb_build_array(jsonb_build_object(
    'id',md5(p_talent_id::text||':'||p_role_id::text||':'||(v_profile#>>'{snapshot,talentUser,resume_storage_path}'))::uuid,
    'talent_id',p_talent_id,'revision',1,'file_name',coalesce(v_profile#>>'{snapshot,talentUser,resume_file_name}','Resume'),
    'kind','resume','origin_type','legacy_upload','is_primary',true,'is_public',true,'is_deleted',false,
    'storage_path',v_profile#>>'{snapshot,talentUser,resume_storage_path}',
    'extracted_text',v_profile#>>'{snapshot,talentUser,resume_text}','created_at',now(),
    'content_type','application/octet-stream'));
  end if;

 elsif p_action<>'clear' then raise exception 'unknown_assignment_action'; end if;
 insert into public.talent_role_materials(talent_id,role_id,revision,action,profile_id,profile_revision,profile_snapshot,documents,source,operation_id)
 values(p_talent_id,p_role_id,coalesce(v_current.revision,0)+1,p_action,(v_profile->>'profileId')::uuid,(v_profile->>'revision')::bigint,v_profile->'snapshot',v_documents,p_source,p_operation_id) returning * into v_saved;
 return to_jsonb(v_saved);
end $$;

create function public.pin_talent_role_material_v1(p_talent_id uuid,p_recommendation_id uuid,p_material_id uuid default null,p_expected_revision bigint default null,p_source jsonb default '{}') returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_rec public.talent_opportunity_recommendation; v_current public.talent_role_materials; v_saved jsonb; v_id uuid;
begin
 select * into v_rec from public.talent_opportunity_recommendation where id=p_recommendation_id and talent_id=p_talent_id for update;
 if not found then raise exception 'internal_opportunity_not_found'; end if;
 if v_rec.shared_material_id is not null then return v_rec.shared_material_id; end if;
 perform pg_advisory_xact_lock(hashtextextended('talent-material:'||p_talent_id||':'||v_rec.role_id,0));
 select * into v_current from public.talent_role_materials where talent_id=p_talent_id and role_id=v_rec.role_id order by revision desc limit 1;
 if p_material_id is not null and (v_current.id is distinct from p_material_id or v_current.revision is distinct from p_expected_revision or v_current.action<>'set') then raise exception 'role_assignment_revision_conflict'; end if;
 if p_material_id is null and p_expected_revision is not null and coalesce(v_current.revision,0)<>p_expected_revision then raise exception 'role_assignment_revision_conflict'; end if;
 if v_current.id is null or v_current.action='clear' then
  v_saved:=public.assign_talent_role_materials_v1(p_talent_id,v_rec.role_id,'set',coalesce(v_current.revision,0),null,null,
    coalesce((select jsonb_agg(jsonb_build_object('documentId',id,'revision',coalesce(revision,1))) from public.talent_documents where talent_id=p_talent_id and is_public and not is_deleted),'[]'),
    'acceptance:'||p_recommendation_id,p_source||jsonb_build_object('defaultAcceptance',true));
  v_id:=(v_saved->>'id')::uuid;
 else v_id:=v_current.id; end if;
 update public.talent_opportunity_recommendation set shared_material_id=v_id where id=p_recommendation_id;
 update public.company_intro_candidates set shared_material_id=v_id where recommendation_id=p_recommendation_id and talent_id=p_talent_id and role_id=v_rec.role_id;
 return v_id;
end $$;

create or replace function public.accept_talent_internal_role_recommendation_v2(p_talent_id uuid,p_recommendation_id uuid,p_source_role_id uuid default null,p_feedback_reason text default null,p_email_acceptance_confirmation jsonb default null,p_context jsonb default '{}',p_expected_updated_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_material uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id,0));
 perform 1 from public.talent_opportunity_recommendation where id=p_recommendation_id and talent_id=p_talent_id for update;
 if not found then raise exception 'internal_opportunity_not_found'; end if;
 perform set_config('harper.feedback_source','candidate_acceptance',true);
 v_result:=public.accept_talent_internal_role_recommendation_v1(p_talent_id,p_recommendation_id,p_source_role_id,p_feedback_reason,p_email_acceptance_confirmation,p_context);
 if v_result->>'status'='accepted' or (v_result->>'status'='no_change' and v_result->>'targetAccepted'='true') then
  v_material:=public.pin_talent_role_material_v1(p_talent_id,p_recommendation_id,(p_context->>'materialId')::uuid,(p_context->>'assignmentRevision')::bigint,p_context);
  v_result:=v_result||jsonb_build_object('materialId',v_material);
 end if;
 return v_result;
end $$;

create function public.decide_company_intro_request_with_material_v1(p_talent_id uuid,p_recommendation_id uuid,p_decision text,p_feedback_reason text default null,p_email_acceptance_confirmation jsonb default null,p_material_id uuid default null,p_assignment_revision bigint default null,p_source jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_material uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id,0));
 perform 1 from public.talent_opportunity_recommendation where id=p_recommendation_id and talent_id=p_talent_id for update;
 if not found then raise exception 'internal_opportunity_not_found'; end if;
 perform set_config('harper.feedback_source','candidate_intro_decision',true);
 v_result:=public.decide_company_intro_request_v1(p_talent_id,p_recommendation_id,p_decision,p_feedback_reason,p_email_acceptance_confirmation);
 if p_decision='accept' and (v_result->>'status'='accepted' or (v_result->>'status'='no_change' and v_result->>'reason'='already_connected')) then
  v_material:=public.pin_talent_role_material_v1(p_talent_id,p_recommendation_id,p_material_id,p_assignment_revision,p_source);
  v_result:=v_result||jsonb_build_object('materialId',v_material);
 end if;
 return v_result;
end $$;


create or replace function public.decide_company_intro_request_v2(p_talent_id uuid,p_recommendation_id uuid,p_decision text,p_feedback_reason text default null,p_email_acceptance_confirmation jsonb default null,p_expected_updated_at timestamptz default null) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
 select public.decide_company_intro_request_with_material_v1(p_talent_id,p_recommendation_id,p_decision,p_feedback_reason,p_email_acceptance_confirmation)
$$;

create function public.publish_evaluated_internal_role_v1(p_talent_id uuid,p_role_id uuid,p_evaluation_ids uuid[],p_source_run_id uuid,p_operation_id text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_role public.company_roles; v_setting public.talent_setting; v_rec public.talent_opportunity_recommendation; v_created boolean:=false; v_company public.company_workspace; v_coverage jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id,0));
 select * into v_role from public.company_roles where role_id=p_role_id and source_type='internal' for share;
 if not found or v_role.status not in ('active','paused','top_priority') or coalesce(v_role.is_expired,false) or v_role.expires_at<=now()
   or lower(coalesce(v_role.information->>'testOnly','false')) in ('true','1','yes','on') then raise exception 'internal_role_unavailable'; end if;
 perform 1 from public.talent_users where user_id=p_talent_id and deleted_at is null;
 if not found then raise exception 'profile_owner_not_found'; end if;
 select * into v_setting from public.talent_setting where user_id=p_talent_id;
 if not coalesce(v_setting.is_onboarding_done,false) then raise exception 'onboarding_required'; end if;
 if v_setting.profile_visibility='dont_share' then raise exception 'profile_sharing_disabled'; end if;
 select * into v_company from public.company_workspace where company_workspace_id=v_role.company_workspace_id;
 if exists(select 1 from unnest(coalesce(v_setting.blocked_companies,'{}')) b where lower(btrim(b)) in (lower(btrim(v_company.company_name)),lower(btrim(coalesce(v_company.published_name,''))))) then raise exception 'company_blocked'; end if;
 if coalesce(cardinality(p_evaluation_ids),0)=0 or exists(select 1 from unnest(p_evaluation_ids) id where not exists(
  select 1 from public.company_role_candidate_evaluations e where e.id=id and e.talent_id=p_talent_id and e.role_id=p_role_id
 )) or not exists(select 1 from public.company_role_candidate_evaluations e where e.id=any(p_evaluation_ids) and e.stage=2) then raise exception 'internal_evaluation_reference_invalid'; end if;
 select coverage into v_coverage from public.opportunity_discovery_run where id=p_source_run_id and talent_id=p_talent_id;
 if not found then raise exception 'internal_evaluation_run_not_owned'; end if;
 -- Reused evaluator rows may have another discovery_run_id; the requesting
 -- run's durable coverage is the authoritative set it actually evaluated/read.
 if exists(select 1 from unnest(p_evaluation_ids) id where not (coalesce(v_coverage->'evaluationIds','[]'::jsonb) ? id::text)) then raise exception 'internal_evaluation_run_mismatch'; end if;
 select * into v_rec from public.talent_opportunity_recommendation where talent_id=p_talent_id and role_id=p_role_id order by created_at desc,id desc limit 1 for update;
 if not found then
  insert into public.talent_opportunity_recommendation(talent_id,role_id,opportunity_type,kind,evidence,fit_reasons,preference_fit,tradeoffs,discovery_run_id)
   values(p_talent_id,p_role_id,'internal_recommendation','match',jsonb_build_array(jsonb_build_object('evaluationIds',p_evaluation_ids,'sourceRunId',p_source_run_id,'operationId',p_operation_id)),'[]','{}','[]',p_source_run_id) returning * into v_rec;
  v_created:=true;
  insert into public.talent_opportunity_tag(talent_id,opportunity_id,tag) values(p_talent_id,p_role_id,'내부:추천');
  insert into public.talent_progress(talent_id,role_id,recommendation_id,user_id,kind,text,metadata,open_to_company)
   values(p_talent_id,p_role_id,v_rec.id,p_talent_id,'candidate_role_recommendation_presented','',jsonb_build_object('evaluationIds',p_evaluation_ids,'sourceRunId',p_source_run_id,'operationId',p_operation_id),false);
 end if;
 return jsonb_build_object('recommendationId',v_rec.id,'roleId',p_role_id,'created',v_created,'evaluationIds',p_evaluation_ids,'feedback',v_rec.feedback,'savedStage',v_rec.saved_stage);
end $$;

-- Internal schema uses server-only readers; ownership is explicit in every RPC.
do $$ declare v_name text; v_function regprocedure; begin
 foreach v_name in array array['talent_profiles','talent_profile_revisions','talent_role_materials','talent_role_material_files'] loop
  execute format('alter table public.%I enable row level security',v_name);
  execute format('revoke all on public.%I from anon,authenticated',v_name);
  execute format('grant all on public.%I to service_role',v_name);
 end loop;
 for v_function in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('capture_talent_profile_snapshot_v1','ensure_talent_profile_v1','read_talent_profile_v1','project_talent_profile_v1','write_talent_profile_v1','capture_legacy_talent_profile_v1','assign_talent_role_materials_v1','pin_talent_role_material_v1','decide_company_intro_request_with_material_v1','publish_evaluated_internal_role_v1') loop
  execute format('revoke all on function %s from public,anon,authenticated',v_function);
  execute format('grant execute on function %s to service_role',v_function);
 end loop;
end $$;
commit;
