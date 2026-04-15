create or replace function public.claim_talent_user_email_alias(
  source_email text,
  target_user_id uuid,
  target_email text default null,
  target_name text default null,
  target_profile_picture text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row public.talent_users%rowtype;
  normalized_source_email text := nullif(lower(trim(coalesce(source_email, ''))), '');
  normalized_target_email text := nullif(trim(coalesce(target_email, '')), '');
  normalized_target_name text := nullif(trim(coalesce(target_name, '')), '');
  normalized_target_profile_picture text := nullif(trim(coalesce(target_profile_picture, '')), '');
  matched_count integer := 0;
  now_ts timestamptz := timezone('utc', now());
begin
  if normalized_source_email is null or target_user_id is null then
    return false;
  end if;

  select count(*)
    into matched_count
    from public.talent_users
   where lower(trim(coalesce(email, ''))) = normalized_source_email;

  if matched_count = 0 then
    return false;
  end if;

  if matched_count > 1 then
    raise exception 'Multiple talent_users rows matched source_email %', normalized_source_email;
  end if;

  select *
    into source_row
    from public.talent_users
   where lower(trim(coalesce(email, ''))) = normalized_source_email
   limit 1;

  if source_row.user_id = target_user_id then
    update public.talent_users
       set email = coalesce(normalized_target_email, source_row.email),
           name = coalesce(normalized_target_name, source_row.name),
           profile_picture = coalesce(source_row.profile_picture, normalized_target_profile_picture),
           updated_at = now_ts
     where user_id = target_user_id;

    return true;
  end if;

  if exists (
    select 1
      from public.talent_users
     where user_id = target_user_id
  ) then
    raise exception 'talent_users row already exists for target user %', target_user_id;
  end if;

  insert into public.talent_users (
    user_id,
    email,
    name,
    profile_picture,
    headline,
    bio,
    location,
    career_profile,
    career_profile_initialized_at,
    network_waitlist_id,
    network_claimed_at,
    network_source_talent_id,
    network_application,
    resume_file_name,
    resume_storage_path,
    resume_text,
    resume_links,
    created_at,
    updated_at
  )
  values (
    target_user_id,
    coalesce(normalized_target_email, source_row.email),
    coalesce(normalized_target_name, source_row.name),
    coalesce(source_row.profile_picture, normalized_target_profile_picture),
    source_row.headline,
    source_row.bio,
    source_row.location,
    source_row.career_profile,
    source_row.career_profile_initialized_at,
    null,
    source_row.network_claimed_at,
    source_row.network_source_talent_id,
    source_row.network_application,
    source_row.resume_file_name,
    source_row.resume_storage_path,
    source_row.resume_text,
    source_row.resume_links,
    source_row.created_at,
    now_ts
  );

  update public.talent_conversations
     set user_id = target_user_id
   where user_id = source_row.user_id;

  update public.talent_messages
     set user_id = target_user_id
   where user_id = source_row.user_id;

  update public.talent_experiences
     set talent_id = target_user_id
   where talent_id = source_row.user_id;

  update public.talent_educations
     set talent_id = target_user_id
   where talent_id = source_row.user_id;

  update public.talent_extras
     set talent_id = target_user_id
   where talent_id = source_row.user_id;

  update public.talent_insights
     set talent_id = target_user_id
   where talent_id = source_row.user_id;

  update public.talent_internal
     set talent_id = target_user_id
   where talent_id = source_row.user_id;

  update public.talent_notification
     set talent_id = target_user_id
   where talent_id = source_row.user_id;

  update public.talent_opportunity_recommendation
     set talent_id = target_user_id
   where talent_id = source_row.user_id;

  update public.talent_publications
     set talent_id = target_user_id
   where talent_id = source_row.user_id;

  update public.talent_setting
     set user_id = target_user_id
   where user_id = source_row.user_id;

  delete from public.talent_users
   where user_id = source_row.user_id;

  update public.talent_users
     set network_waitlist_id = source_row.network_waitlist_id,
         updated_at = now_ts
   where user_id = target_user_id;

  return true;
end;
$$;
