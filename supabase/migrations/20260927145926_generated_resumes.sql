-- Existing document and Storage policies are deliberately unchanged.
alter table public.talent_documents add column if not exists structured_content jsonb;
alter table public.talent_documents add column if not exists revision integer not null default 1;

-- Metadata edits/deletion also invalidate an in-flight content revision.
create function public.advance_generated_resume_revision_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.origin_type = 'harper_generated_resume' then new.revision := old.revision + 1; end if;
  return new;
end $$;
create trigger advance_generated_resume_revision before update on public.talent_documents
for each row execute function public.advance_generated_resume_revision_v1();
revoke all on function public.advance_generated_resume_revision_v1() from public,anon,authenticated;
grant execute on function public.advance_generated_resume_revision_v1() to service_role;

create table public.talent_resume_jobs (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  request_key text not null,
  input_hash text not null,
  action text not null check (action in ('create','update')),
  document_id uuid not null,
  expected_revision integer,
  status text not null check (status in ('running','completed','failed')),
  lease_token uuid not null,
  lease_until timestamptz not null,
  storage_path text not null,
  page_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(talent_id, request_key)
);
alter table public.talent_resume_jobs enable row level security;
revoke all on public.talent_resume_jobs from public, anon, authenticated;
grant all on public.talent_resume_jobs to service_role;

create table public.talent_resume_cleanup (
  storage_path text primary key,
  created_at timestamptz not null default now()
);
alter table public.talent_resume_cleanup enable row level security;
revoke all on public.talent_resume_cleanup from public, anon, authenticated;
grant all on public.talent_resume_cleanup to service_role;

-- Invoker functions: service_role only; ownership is always an explicit predicate.
create function public.claim_resume_job_v1(p_talent_id uuid, p_request_key text, p_input_hash text, p_action text, p_document_id uuid default null, p_expected_revision integer default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.talent_resume_jobs; token uuid := gen_random_uuid(); doc uuid := coalesce(p_document_id, gen_random_uuid());
begin
  if p_action not in ('create','update') or (p_action='create' and (p_document_id is not null or p_expected_revision is not null)) or (p_action='update' and (p_document_id is null or p_expected_revision is null)) then raise exception 'Invalid resume operation'; end if;
  insert into public.talent_resume_jobs(talent_id,request_key,input_hash,action,document_id,expected_revision,status,lease_token,lease_until,storage_path)
  values(p_talent_id,p_request_key,p_input_hash,p_action,doc,p_expected_revision,'running',token,clock_timestamp()+interval '3 minutes',p_talent_id::text||'/generated-resumes/'||doc::text||'/'||token::text||'.pdf')
  on conflict(talent_id,request_key) do nothing;
  select * into j from public.talent_resume_jobs where talent_id=p_talent_id and request_key=p_request_key for update;
  if j.status='completed' then return to_jsonb(j); end if;
  if j.lease_token <> token and j.status='running' and j.lease_until > clock_timestamp() then return jsonb_build_object('status','in_progress'); end if;
  if p_action='update' and not exists(select 1 from public.talent_documents where id=p_document_id and talent_id=p_talent_id and origin_type='harper_generated_resume' and not is_deleted and revision=p_expected_revision) then raise exception 'Resume changed or is unavailable. Read the current document before updating.'; end if;
  if j.lease_token <> token then
    insert into public.talent_resume_cleanup(storage_path) values(j.storage_path) on conflict do nothing;
    update public.talent_resume_jobs set input_hash=p_input_hash, status='running', lease_token=token, lease_until=clock_timestamp()+interval '3 minutes', expected_revision=p_expected_revision,
      storage_path=p_talent_id::text||'/generated-resumes/'||j.document_id::text||'/'||token::text||'.pdf', updated_at=clock_timestamp()
    where id=j.id returning * into j;
  end if;
  return to_jsonb(j);
end $$;

create function public.commit_resume_job_v1(p_talent_id uuid, p_job_id uuid, p_lease_token uuid, p_file_name text, p_structured_content jsonb, p_extracted_text text, p_size_bytes bigint, p_sha256 text, p_page_count integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.talent_resume_jobs; d public.talent_documents; old_path text;
begin
  select * into j from public.talent_resume_jobs where id=p_job_id and talent_id=p_talent_id for update;
  if not found then raise exception 'Resume job unavailable'; end if;
  if j.status='completed' then return jsonb_build_object('document_id',j.document_id,'page_count',j.page_count); end if;
  if j.status <> 'running' or j.lease_token <> p_lease_token or j.lease_until <= clock_timestamp() then raise exception 'Resume job expired'; end if;
  if p_page_count < 1 or p_size_bytes < 1 or p_structured_content->>'schema_version' <> '1' then raise exception 'Invalid PDF artifact'; end if;
  if j.action='create' then
    insert into public.talent_documents(id,talent_id,kind,origin_type,origin_id,file_name,storage_path,content_type,size_bytes,content_sha256,structured_content,extracted_text,is_public,is_primary,revision)
    values(j.document_id,p_talent_id,'resume','harper_generated_resume',j.id::text,p_file_name,j.storage_path,'application/pdf',p_size_bytes,p_sha256,p_structured_content,p_extracted_text,false,false,1) returning * into d;
  else
    select * into d from public.talent_documents where id=j.document_id and talent_id=p_talent_id and origin_type='harper_generated_resume' and not is_deleted for update;
    if not found or d.revision <> j.expected_revision then raise exception 'Resume changed or is unavailable. Read the current document before updating.'; end if;
    if j.lease_until <= clock_timestamp() then raise exception 'Resume job expired'; end if;
    old_path := d.storage_path;
    update public.talent_documents set file_name=p_file_name,storage_path=j.storage_path,content_type='application/pdf',size_bytes=p_size_bytes,content_sha256=p_sha256,structured_content=p_structured_content,extracted_text=p_extracted_text,is_public=false,is_primary=false,revision=revision+1
    where id=d.id and talent_id=p_talent_id returning * into d;
    if old_path is not null then insert into public.talent_resume_cleanup(storage_path) values(old_path) on conflict do nothing; end if;
  end if;
  update public.talent_resume_jobs set status='completed',page_count=p_page_count,updated_at=clock_timestamp() where id=j.id;
  return jsonb_build_object('document_id',d.id,'revision',d.revision,'page_count',p_page_count);
end $$;

create function public.fail_resume_job_v1(p_talent_id uuid, p_job_id uuid, p_lease_token uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare j public.talent_resume_jobs;
begin
  select * into j from public.talent_resume_jobs where id=p_job_id and talent_id=p_talent_id for update;
  if found and j.status='running' and j.lease_token=p_lease_token then
    update public.talent_resume_jobs set status='failed',updated_at=clock_timestamp() where id=j.id;
    insert into public.talent_resume_cleanup(storage_path) values(j.storage_path) on conflict do nothing;
  end if;
end $$;

create function public.sweep_resume_jobs_v1()
returns void language plpgsql security invoker set search_path = '' as $$
declare j public.talent_resume_jobs;
begin
  for j in select * from public.talent_resume_jobs where status='running' and lease_until < clock_timestamp()-interval '10 minutes' for update skip locked loop
    update public.talent_resume_jobs set status='failed',updated_at=clock_timestamp() where id=j.id;
    insert into public.talent_resume_cleanup(storage_path) values(j.storage_path) on conflict do nothing;
  end loop;
end $$;

revoke all on function public.claim_resume_job_v1(uuid,text,text,text,uuid,integer) from public,anon,authenticated;
revoke all on function public.commit_resume_job_v1(uuid,uuid,uuid,text,jsonb,text,bigint,text,integer) from public,anon,authenticated;
revoke all on function public.fail_resume_job_v1(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.sweep_resume_jobs_v1() from public,anon,authenticated;
grant execute on function public.claim_resume_job_v1(uuid,text,text,text,uuid,integer) to service_role;
grant execute on function public.commit_resume_job_v1(uuid,uuid,uuid,text,jsonb,text,bigint,text,integer) to service_role;
grant execute on function public.fail_resume_job_v1(uuid,uuid,uuid) to service_role;
grant execute on function public.sweep_resume_jobs_v1() to service_role;
