-- Cache invalidation only: no prompt, model decision or resource contents.
-- Keep this separate from talent_users so resource writes do not invoke legacy
-- profile projection triggers or invalidate profile/Memory caches.
create table public.talent_career_resource_revisions (
  user_id uuid primary key references public.talent_users(user_id) on delete cascade,
  revision uuid not null default gen_random_uuid()
);
alter table public.talent_career_resource_revisions enable row level security;
revoke all on public.talent_career_resource_revisions from public, anon, authenticated, service_role;
grant select on public.talent_career_resource_revisions to service_role;
create policy career_resource_revision_service_read on public.talent_career_resource_revisions
for select to service_role using (true);

create function public.revise_career_resource_cache() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_owner uuid; new_owner uuid;
begin
  -- Ordinary chat/activity writes must not invalidate the resource index.
  if TG_TABLE_NAME='talent_messages' then
    if TG_OP='INSERT' then
      if new.message_type not in ('career_form','career_form_response','career_form_resolution') then return null; end if;
    elsif TG_OP='DELETE' then
      if old.message_type not in ('career_form','career_form_response','career_form_resolution') then return null; end if;
    elsif old.message_type not in ('career_form','career_form_response','career_form_resolution')
      and new.message_type not in ('career_form','career_form_response','career_form_resolution') then return null;
    end if;
  elsif TG_TABLE_NAME='talent_external_operations' then
    -- Open forms depend on whether their related delegated work is finished.
    if TG_OP='INSERT' then
      if new.kind<>'delegated_work' then return null; end if;
    elsif TG_OP='DELETE' then
      if old.kind<>'delegated_work' then return null; end if;
    elsif old.kind<>'delegated_work' and new.kind<>'delegated_work' then return null;
    end if;
  elsif TG_TABLE_NAME='external_recommendation_runs' then
    if TG_OP='INSERT' then
      if new.variant is distinct from 'career_agent' then return null; end if;
    elsif TG_OP='DELETE' then
      if old.variant is distinct from 'career_agent' then return null; end if;
    elsif old.variant is distinct from 'career_agent' and new.variant is distinct from 'career_agent' then return null;
    end if;
  end if;
  if TG_OP<>'INSERT' then old_owner := (to_jsonb(old)->>TG_ARGV[0])::uuid; end if;
  if TG_OP<>'DELETE' then new_owner := (to_jsonb(new)->>TG_ARGV[0])::uuid; end if;
  -- The parent may already be absent during an account cascade delete.
  insert into public.talent_career_resource_revisions(user_id,revision)
    select user_id, gen_random_uuid() from public.talent_users
    where user_id=old_owner or user_id=new_owner
    order by user_id
    on conflict(user_id) do update set revision=excluded.revision;
  return null;
end $$;
revoke all on function public.revise_career_resource_cache() from public, anon, authenticated, service_role;

create trigger career_document_resource_revision after insert or update or delete on public.talent_documents
for each row execute function public.revise_career_resource_cache('talent_id');
create trigger career_profile_resource_revision after insert or update or delete on public.talent_profiles
for each row execute function public.revise_career_resource_cache('talent_id');
create trigger career_matching_resource_revision after insert or update or delete on public.talent_matchings
for each row execute function public.revise_career_resource_cache('talent_id');
create trigger career_search_resource_revision after insert or update or delete on public.external_recommendation_runs
for each row execute function public.revise_career_resource_cache('talent_id');
create trigger career_form_resource_revision after insert or update or delete on public.talent_messages
for each row execute function public.revise_career_resource_cache('user_id');
create trigger career_form_work_resource_revision after insert or update or delete on public.talent_external_operations
for each row execute function public.revise_career_resource_cache('user_id');
