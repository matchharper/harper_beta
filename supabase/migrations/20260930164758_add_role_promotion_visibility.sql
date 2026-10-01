alter table public.company_internal_roles
  add column if not exists is_promote boolean not null default true,
  add column if not exists is_anonymous boolean not null default false;

comment on column public.company_internal_roles.is_promote is
  'Whether this internal role may be shown in Harper public jobs and considered for external promotion.';

comment on column public.company_internal_roles.is_anonymous is
  'Whether public promotion must avoid identifying the hiring company; public copy must be reviewed before publication.';

-- These four roles were first published with reviewed anonymous Harper copy
-- during the 2026-09-30 manual GTM run. Backfill before the trigger is created
-- so the already-reviewed public jobs remain available.
update public.company_internal_roles
   set is_anonymous = true
 where role_id in (
   'ccf09c9b-62d9-4a06-9e35-363e2d7ad4b6', -- Indonesia FDE
   '054a2060-ca34-4700-b4cb-89ae8fdf4643', -- Thailand FDE
   '825b3c83-14eb-4bdd-a034-d0ad676b9735', -- Deployment Strategist
   '2f771397-e320-4205-867f-78c381c5f2bb'  -- Head of Partnerships
 );

-- A previously published row may still contain the company identity. Remove it
-- from public reads until its copy has been reviewed for the new setting.
create or replace function public.unpublish_official_jobs_on_role_promotion_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.is_promote and not new.is_promote)
     or (not old.is_anonymous and new.is_anonymous) then
    update public.official_jobs
       set is_published = false
     where role_id = new.role_id
       and is_published = true;
  end if;
  return new;
end;
$$;

revoke all on function public.unpublish_official_jobs_on_role_promotion_change()
  from public, anon, authenticated;

create trigger unpublish_official_jobs_on_role_promotion_change
after update of is_promote, is_anonymous on public.company_internal_roles
for each row
execute function public.unpublish_official_jobs_on_role_promotion_change();

-- The public web layer also filters linked jobs at read time. Keep the row's
-- publication state aligned when a Role becomes unavailable.
create or replace function public.unpublish_official_jobs_on_role_unavailability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_type <> 'internal'
     or new.status not in ('active', 'paused')
     or new.is_expired
     or (new.expires_at is not null and new.expires_at <= now())
     or coalesce(new.information ->> 'testOnly', 'false') = 'true' then
    update public.official_jobs
       set is_published = false
     where role_id = new.role_id
       and is_published = true;
  end if;
  return new;
end;
$$;

revoke all on function public.unpublish_official_jobs_on_role_unavailability()
  from public, anon, authenticated;

create trigger unpublish_official_jobs_on_role_unavailability
after update of source_type, status, is_expired, expires_at, information
on public.company_roles
for each row
execute function public.unpublish_official_jobs_on_role_unavailability();

update public.official_jobs as job
   set is_published = false
  from public.company_roles as role
 where job.role_id = role.role_id
   and job.is_published = true
   and (
     role.source_type <> 'internal'
     or role.status not in ('active', 'paused')
     or role.is_expired
     or (role.expires_at is not null and role.expires_at <= now())
     or coalesce(role.information ->> 'testOnly', 'false') = 'true'
   );
