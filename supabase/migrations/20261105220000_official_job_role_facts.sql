-- Posting facts follow the Role; posting text keeps versions (E3b, D18 B, D19).
--
-- A posting (official_jobs) linked to a Role showed its own copy of the
-- Role's facts, written by hand in Ops or by the GTM work, and the two drifted
-- (location, employment type, seniority, compensation). Candidates read the
-- posting, the company search reads the Role.
--
-- Facts: location, compensation, employment_type and seniority stay as
-- posting columns because many readers use them (/jobs, the candidate-side
-- read_career_internal_role_v1, LinkedIn work, reports). For a posting linked
-- to a Role, each is the Role's value whenever the Role has one, kept so by
-- triggers in the same transaction; the posting's own value stays only where
-- the Role is empty. A write to a posting cannot override a Role fact.
--   location        = flag from country_code + location_text
--   compensation    = salary_range
--   employment_type = label of the Role's type list (full_time -> Full-time)
--   seniority       = seniority_level
-- Keeping a fact in step does not move the posting's updated_at (it orders
-- "the latest posting of a Role" for the candidate side and Ops).
--
-- Company name is not a fact here: postings use a deliberate public name per
-- posting (anonymous Roles a descriptive one), so it stays posting text.
--
-- Text versions: title, company name, short description, role and company
-- description, and the facts as shown, with the Role's Brief version the text
-- was written against. A posting whose Role Brief changed since its text was
-- last edited or reviewed needs review (Ops: "공고 확인 필요").

-- 1. The Role's facts as a posting shows them.
create or replace function public.official_job_role_facts_v1(p_role_id uuid)
returns table(location text, compensation text, employment_type text, seniority text)
language sql
stable
set search_path = ''
as $$
  select
    case
      when nullif(btrim(r.location_text), '') is null then null
      when upper(coalesce(r.country_code, '')) ~ '^[A-Z]{2}$'
        and not (left(btrim(r.location_text), 1) between chr(127462) and chr(127487)) then
        chr(127397 + ascii(upper(substr(r.country_code, 1, 1))))
          || chr(127397 + ascii(upper(substr(r.country_code, 2, 1)))) || ' ' || btrim(r.location_text)
      else btrim(r.location_text)
    end,
    nullif(btrim(r.salary_range), ''),
    nullif(array_to_string(array(
      select case btrim(kind)
          when 'full_time' then 'Full-time'
          when 'part_time' then 'Part-time'
          when 'contract' then 'Contract'
          when 'internship' then 'Internship'
          else btrim(kind)
        end
      from unnest(coalesce(r.type, '{}'::text[])) with ordinality as item(kind, position)
      where nullif(btrim(kind), '') is not null
      order by position
    ), ', '), ''),
    nullif(btrim(r.seniority_level), '')
  from public.company_roles r
  where r.role_id = p_role_id
$$;

revoke all on function public.official_job_role_facts_v1(uuid) from public, anon, authenticated;
grant execute on function public.official_job_role_facts_v1(uuid) to service_role;

-- 2. Every posting write takes the Role's facts.
create or replace function public.apply_official_job_role_facts_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_facts record;
begin
  if new.role_id is null then
    return new;
  end if;
  select * into v_facts from public.official_job_role_facts_v1(new.role_id);
  if found then
    new.location := coalesce(v_facts.location, new.location);
    new.compensation := coalesce(v_facts.compensation, new.compensation);
    new.employment_type := coalesce(v_facts.employment_type, new.employment_type);
    new.seniority := coalesce(v_facts.seniority, new.seniority);
  end if;
  return new;
end;
$$;

revoke all on function public.apply_official_job_role_facts_v1() from public, anon, authenticated, service_role;

drop trigger if exists official_jobs_apply_role_facts on public.official_jobs;
create trigger official_jobs_apply_role_facts
  before insert or update of role_id, location, compensation, employment_type, seniority
  on public.official_jobs
  for each row execute function public.apply_official_job_role_facts_v1();

-- Keeping facts in step is not an edit of the posting (runs after
-- official_jobs_set_updated_at: same-event BEFORE triggers run by name).
create or replace function public.keep_official_job_updated_at_on_fact_sync_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('harper.official_job_fact_sync', true), '') = 'on' then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_official_job_updated_at_on_fact_sync_v1() from public, anon, authenticated, service_role;

drop trigger if exists official_jobs_zz_keep_updated_at_on_fact_sync on public.official_jobs;
create trigger official_jobs_zz_keep_updated_at_on_fact_sync
  before update on public.official_jobs
  for each row execute function public.keep_official_job_updated_at_on_fact_sync_v1();

-- 3. A Role fact change reaches its postings.
create or replace function public.sync_official_job_role_facts_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('harper.official_job_fact_sync', 'on', true);
  update public.official_jobs job
  set location = job.location
  where job.role_id = new.role_id;
  perform set_config('harper.official_job_fact_sync', '', true);
  return new;
end;
$$;

revoke all on function public.sync_official_job_role_facts_v1() from public, anon, authenticated, service_role;

drop trigger if exists company_roles_sync_official_job_facts on public.company_roles;
create trigger company_roles_sync_official_job_facts
  after update of location_text, country_code, type, salary_range, seniority_level
  on public.company_roles
  for each row
  when ((old.location_text, old.country_code, old.type, old.salary_range, old.seniority_level)
    is distinct from (new.location_text, new.country_code, new.type, new.salary_range, new.seniority_level))
  execute function public.sync_official_job_role_facts_v1();

-- Existing postings take their Role's facts now (updated_at unchanged).
do $$
begin
  perform set_config('harper.official_job_fact_sync', 'on', true);
  update public.official_jobs job
  set location = job.location
  where job.role_id is not null;
  perform set_config('harper.official_job_fact_sync', '', true);
end;
$$;

-- 4. Posting text versions.
create table if not exists public.official_job_revisions (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.official_jobs(id) on delete cascade,
  revision integer not null,
  kind text not null check (kind in ('backfill', 'edit', 'role_facts', 'reviewed')),
  role_id uuid,
  role_title text not null,
  company_name text not null,
  short_description text not null,
  role_description_markdown text not null,
  company_description_markdown text not null,
  location text,
  compensation text,
  employment_type text,
  seniority text,
  -- The Role's Brief version when this version was saved.
  brief_version text,
  -- The Brief version the text was last edited or reviewed against
  -- (role_facts versions carry the previous one forward).
  reviewed_brief_version text,
  changed_at timestamptz not null default now(),
  unique (job_id, revision)
);

alter table public.official_job_revisions enable row level security;
revoke all on table public.official_job_revisions from public, anon, authenticated;
grant select, insert on table public.official_job_revisions to service_role;
grant usage, select on sequence public.official_job_revisions_id_seq to service_role;

create index if not exists official_job_revisions_job_changed_at_idx
  on public.official_job_revisions (job_id, changed_at desc);

create or replace function public.insert_official_job_revision_v1(
  p_job public.official_jobs,
  p_kind text,
  p_changed_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brief text := case when p_job.role_id is not null
    then public.company_role_search_brief_version_v1(p_job.role_id) end;
  v_previous record;
  v_id bigint;
begin
  select revision.revision, revision.reviewed_brief_version into v_previous
  from public.official_job_revisions revision
  where revision.job_id = p_job.id
  order by revision.revision desc
  limit 1;

  insert into public.official_job_revisions (
    job_id, revision, kind, role_id, role_title, company_name, short_description,
    role_description_markdown, company_description_markdown, location, compensation,
    employment_type, seniority, brief_version, reviewed_brief_version, changed_at
  ) values (
    p_job.id, coalesce(v_previous.revision, 0) + 1, p_kind, p_job.role_id, p_job.role_title,
    p_job.company_name, p_job.short_description, p_job.role_description_markdown,
    p_job.company_description_markdown, p_job.location, p_job.compensation,
    p_job.employment_type, p_job.seniority, v_brief,
    case when p_kind = 'role_facts' then v_previous.reviewed_brief_version else v_brief end,
    p_changed_at
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.insert_official_job_revision_v1(public.official_jobs, text, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.record_official_job_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.role_id, new.role_title, new.company_name, new.short_description,
    new.role_description_markdown, new.company_description_markdown,
    new.location, new.compensation, new.employment_type, new.seniority
  ) is not distinct from (
    old.role_id, old.role_title, old.company_name, old.short_description,
    old.role_description_markdown, old.company_description_markdown,
    old.location, old.compensation, old.employment_type, old.seniority
  ) then
    return new;
  end if;
  perform public.insert_official_job_revision_v1(
    new,
    case when coalesce(current_setting('harper.official_job_fact_sync', true), '') = 'on'
      then 'role_facts' else 'edit' end,
    now()
  );
  return new;
end;
$$;

revoke all on function public.record_official_job_revision_v1() from public, anon, authenticated, service_role;

drop trigger if exists official_jobs_record_revision on public.official_jobs;
create trigger official_jobs_record_revision
  after insert or update on public.official_jobs
  for each row execute function public.record_official_job_revision_v1();

-- Every posting starts with its current text as version 1, reviewed against
-- the current Brief (nothing is flagged at the switch).
insert into public.official_job_revisions (
  job_id, revision, kind, role_id, role_title, company_name, short_description,
  role_description_markdown, company_description_markdown, location, compensation,
  employment_type, seniority, brief_version, reviewed_brief_version, changed_at
)
select job.id, 1, 'backfill', job.role_id, job.role_title, job.company_name, job.short_description,
  job.role_description_markdown, job.company_description_markdown, job.location, job.compensation,
  job.employment_type, job.seniority, brief.version, brief.version, job.updated_at
from public.official_jobs job
cross join lateral (
  select case when job.role_id is not null
    then public.company_role_search_brief_version_v1(job.role_id) end as version
) brief
where not exists (select 1 from public.official_job_revisions revision where revision.job_id = job.id);

-- 5. Review state for Ops, and marking a posting reviewed.
create or replace function public.official_jobs_ops_state_v1(p_job_ids uuid[] default null)
returns table(
  job_id uuid,
  role_location boolean,
  role_compensation boolean,
  role_employment_type boolean,
  role_seniority boolean,
  needs_review boolean,
  brief_changed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    job.id,
    facts.location is not null,
    facts.compensation is not null,
    facts.employment_type is not null,
    facts.seniority is not null,
    job.role_id is not null and current_brief.version is not null
      and current_brief.version is distinct from last_review.reviewed_brief_version,
    last_review.changed_at
  from public.official_jobs job
  left join lateral public.official_job_role_facts_v1(job.role_id) facts on job.role_id is not null
  left join lateral (
    select case when job.role_id is not null
      then public.company_role_search_brief_version_v1(job.role_id) end as version
  ) current_brief on true
  left join lateral (
    select revision.reviewed_brief_version, revision.changed_at
    from public.official_job_revisions revision
    where revision.job_id = job.id
    order by revision.revision desc
    limit 1
  ) last_review on true
  where p_job_ids is null or job.id = any(p_job_ids)
$$;

revoke all on function public.official_jobs_ops_state_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.official_jobs_ops_state_v1(uuid[]) to service_role;

create or replace function public.mark_official_job_reviewed_v1(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.official_jobs;
begin
  select * into v_job from public.official_jobs where id = p_job_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'official_job_not_found';
  end if;
  perform public.insert_official_job_revision_v1(v_job, 'reviewed', now());
  return jsonb_build_object('status', 'reviewed', 'jobId', p_job_id);
end;
$$;

revoke all on function public.mark_official_job_reviewed_v1(uuid) from public, anon, authenticated;
grant execute on function public.mark_official_job_reviewed_v1(uuid) to service_role;

-- 6. A posting as it was at a moment (D19).
create or replace function public.official_job_as_of_v1(p_job_id uuid, p_at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(version_row) - 'id'
  from public.official_job_revisions version_row
  where version_row.job_id = p_job_id and version_row.changed_at <= p_at
  order by version_row.changed_at desc, version_row.revision desc
  limit 1
$$;

revoke all on function public.official_job_as_of_v1(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.official_job_as_of_v1(uuid, timestamptz) to service_role;
