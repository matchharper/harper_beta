-- A revision of source facts, not a persisted prompt or model plan. All writers
-- (web, voice, email, Worker, direct SQL) invalidate the same process cache.
alter table public.talent_users add column career_context_revision uuid not null default gen_random_uuid();

create function public.revise_career_profile_cache() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (to_jsonb(new) - array['career_context_revision','updated_at','last_logined_at'])
     is distinct from (to_jsonb(old) - array['career_context_revision','updated_at','last_logined_at']) then
    new.career_context_revision := gen_random_uuid();
  end if;
  return new;
end $$;
create trigger career_profile_cache_revision before update on public.talent_users
for each row execute function public.revise_career_profile_cache();

create function public.revise_career_context_cache() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP <> 'INSERT' then
    update public.talent_users set career_context_revision=gen_random_uuid() where user_id=old.talent_id;
  end if;
  if TG_OP <> 'DELETE' and (TG_OP='INSERT' or new.talent_id is distinct from old.talent_id) then
    update public.talent_users set career_context_revision=gen_random_uuid() where user_id=new.talent_id;
  end if;
  return null;
end $$;
create trigger career_context_cache_revision after insert or update or delete on public.talent_contexts
for each row execute function public.revise_career_context_cache();
create trigger career_experience_cache_revision after insert or update or delete on public.talent_experiences
for each row execute function public.revise_career_context_cache();
create trigger career_education_cache_revision after insert or update or delete on public.talent_educations
for each row execute function public.revise_career_context_cache();
create trigger career_extras_cache_revision after insert or update or delete on public.talent_extras
for each row execute function public.revise_career_context_cache();
revoke all on function public.revise_career_profile_cache(), public.revise_career_context_cache() from public;
