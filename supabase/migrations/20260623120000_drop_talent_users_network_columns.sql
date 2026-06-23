create or replace function public.claim_career_email_onboarding_lead(
  onboarding_lead_id uuid,
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
  lead_row public.career_email_onboarding_leads%rowtype;
  source_row public.talent_users%rowtype;
  target_row public.talent_users%rowtype;
  source_user_id uuid;
  normalized_target_email text := nullif(trim(coalesce(target_email, '')), '');
  normalized_target_name text := nullif(trim(coalesce(target_name, '')), '');
  normalized_target_profile_picture text := nullif(trim(coalesce(target_profile_picture, '')), '');
  now_ts timestamptz := timezone('utc', now());
begin
  if onboarding_lead_id is null or target_user_id is null then
    return false;
  end if;

  select *
    into lead_row
    from public.career_email_onboarding_leads
   where id = onboarding_lead_id
   limit 1
   for update;

  if not found or lead_row.talent_id is null then
    return false;
  end if;

  source_user_id := lead_row.talent_id;

  select *
    into source_row
    from public.talent_users
   where user_id = source_user_id
   limit 1
   for update;

  if not found then
    return false;
  end if;

  select *
    into target_row
    from public.talent_users
   where user_id = target_user_id
   limit 1
   for update;

  if source_user_id = target_user_id then
    update public.talent_users
       set email = coalesce(normalized_target_email, email),
           name = coalesce(normalized_target_name, name),
           profile_picture = coalesce(normalized_target_profile_picture, profile_picture),
           updated_at = now_ts
     where user_id = target_user_id;
  elsif found then
    update public.talent_users
       set email = coalesce(nullif(trim(coalesce(email, '')), ''), normalized_target_email, source_row.email),
           name = coalesce(nullif(trim(coalesce(name, '')), ''), normalized_target_name, source_row.name),
           profile_picture = coalesce(nullif(trim(coalesce(profile_picture, '')), ''), normalized_target_profile_picture, source_row.profile_picture),
           headline = coalesce(nullif(trim(coalesce(headline, '')), ''), source_row.headline),
           bio = coalesce(nullif(trim(coalesce(bio, '')), ''), source_row.bio),
           location = coalesce(nullif(trim(coalesce(location, '')), ''), source_row.location),
           resume_file_name = coalesce(nullif(trim(coalesce(resume_file_name, '')), ''), source_row.resume_file_name),
           resume_storage_path = coalesce(nullif(trim(coalesce(resume_storage_path, '')), ''), source_row.resume_storage_path),
           resume_text = coalesce(nullif(trim(coalesce(resume_text, '')), ''), source_row.resume_text),
           resume_links = (
             select coalesce(array_agg(distinct link), '{}'::text[])
               from unnest(coalesce(target_row.resume_links, '{}'::text[]) || coalesce(source_row.resume_links, '{}'::text[])) as link
              where nullif(trim(link), '') is not null
           ),
           updated_at = now_ts
     where user_id = target_user_id;
  else
    insert into public.talent_users (
      user_id,
      email,
      name,
      profile_picture,
      headline,
      bio,
      location,
      resume_file_name,
      resume_storage_path,
      resume_text,
      resume_links,
      last_logined_at,
      created_at,
      updated_at
    )
    values (
      target_user_id,
      coalesce(normalized_target_email, source_row.email),
      coalesce(normalized_target_name, source_row.name),
      coalesce(normalized_target_profile_picture, source_row.profile_picture),
      source_row.headline,
      source_row.bio,
      source_row.location,
      source_row.resume_file_name,
      source_row.resume_storage_path,
      source_row.resume_text,
      source_row.resume_links,
      source_row.last_logined_at,
      source_row.created_at,
      now_ts
    );
  end if;

  if source_user_id <> target_user_id then
    update public.talent_conversations
       set user_id = target_user_id
     where user_id = source_user_id;

    update public.talent_messages
       set user_id = target_user_id
     where user_id = source_user_id;

    update public.talent_experiences
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_educations
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_extras
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_insights
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_internal
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_opportunity_recommendation
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_publications
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_activity_events
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_conversation_summaries
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.opportunity_discovery_run
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_opportunity_delivery
       set talent_id = target_user_id
     where talent_id = source_user_id;

    delete from public.talent_company_recommendation source_recommendation
     using public.talent_company_recommendation target_recommendation
     where source_recommendation.talent_id = source_user_id
       and target_recommendation.talent_id = target_user_id
       and target_recommendation.company_db_id = source_recommendation.company_db_id;

    update public.talent_company_recommendation
       set talent_id = target_user_id
     where talent_id = source_user_id;

    delete from public.talent_company_follow source_follow
     using public.talent_company_follow target_follow
     where source_follow.talent_id = source_user_id
       and target_follow.talent_id = target_user_id
       and target_follow.company_db_id = source_follow.company_db_id;

    update public.talent_company_follow
       set talent_id = target_user_id
     where talent_id = source_user_id;

    if exists (select 1 from public.talent_setting where user_id = target_user_id) then
      update public.talent_setting target_setting
         set profile_visibility = case
               when lead_row.metadata ? 'profileVisibility'
                 then coalesce(source_setting.profile_visibility, target_setting.profile_visibility)
               else target_setting.profile_visibility
             end,
             engagement_types = case
               when lead_row.metadata ? 'engagementTypes'
                 and cardinality(coalesce(source_setting.engagement_types, '{}'::text[])) > 0
                 then source_setting.engagement_types
               else target_setting.engagement_types
             end,
             updated_at = now_ts
        from public.talent_setting source_setting
       where target_setting.user_id = target_user_id
         and source_setting.user_id = source_user_id;

      delete from public.talent_setting
       where user_id = source_user_id;
    else
      update public.talent_setting
         set user_id = target_user_id
       where user_id = source_user_id;
    end if;

    update public.email_reply_aliases
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.email_reply_jobs
       set talent_id = target_user_id
     where talent_id = source_user_id;

    delete from public.talent_users
     where user_id = source_user_id;
  end if;

  update public.career_email_onboarding_leads
     set talent_id = target_user_id,
         converted_user_id = target_user_id,
         converted_at = coalesce(converted_at, now_ts),
         status = 'converted',
         step = 'converted',
         updated_at = now_ts
   where id = onboarding_lead_id;

  insert into public.career_email_onboarding_events
    (lead_id, local_id, event_type, metadata)
  values
    (onboarding_lead_id, lead_row.local_id, 'converted_signup', jsonb_build_object('targetUserId', target_user_id::text))
  on conflict do nothing;

  return true;
end;
$$;

alter table public.talent_users
  drop column if exists network_waitlist_id,
  drop column if exists network_source_talent_id;
