create extension if not exists pgcrypto;

create table if not exists public.career_email_onboarding_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null,
  display_name text null,
  local_id text null,
  source text null,
  abtest_type text not null default 'career_landing_email_onboarding_v1',
  variant text not null default 'email_onboarding',
  is_mobile boolean null,
  country_lang text null,
  page_path text null,
  talent_id uuid null references public.talent_users(user_id) on delete set null,
  conversation_id uuid null references public.talent_conversations(id) on delete set null,
  reply_alias text null,
  status text not null default 'created',
  step text not null default 'created',
  profile_links text[] not null default '{}'::text[],
  resume_text text null,
  first_email_resend_id text null,
  review_email_resend_id text null,
  calendar_url text null,
  first_email_sent_at timestamptz null,
  first_inbound_at timestamptz null,
  profile_received_at timestamptz null,
  profile_ingested_at timestamptz null,
  review_attempts integer not null default 0,
  review_locked_at timestamptz null,
  review_locked_by text null,
  calendar_cta_sent_at timestamptz null,
  paused_at timestamptz null,
  converted_user_id uuid null,
  converted_at timestamptz null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint career_email_onboarding_leads_email_check
    check (length(trim(normalized_email)) > 3),
  constraint career_email_onboarding_leads_status_check
    check (status in ('created', 'active', 'paused', 'converted', 'failed')),
  constraint career_email_onboarding_leads_review_attempts_check
    check (review_attempts >= 0),
  constraint career_email_onboarding_leads_step_check
    check (step in (
      'created',
      'awaiting_start',
      'awaiting_profile',
      'profile_received',
      'profile_review_pending',
      'calendar_cta_sent',
      'paused',
      'converted',
      'failed'
    ))
);

create unique index if not exists career_email_onboarding_leads_email_uidx
  on public.career_email_onboarding_leads (normalized_email);

create index if not exists career_email_onboarding_leads_conversation_idx
  on public.career_email_onboarding_leads (conversation_id)
  where conversation_id is not null;

create index if not exists career_email_onboarding_leads_talent_idx
  on public.career_email_onboarding_leads (talent_id)
  where talent_id is not null;

create index if not exists career_email_onboarding_leads_review_claim_idx
  on public.career_email_onboarding_leads (step, profile_received_at)
  where status = 'active'
    and step = 'profile_review_pending'
    and calendar_cta_sent_at is null;

create table if not exists public.career_email_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null references public.career_email_onboarding_leads(id) on delete set null,
  local_id text null,
  normalized_email_hash text null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists career_email_onboarding_events_type_recent_idx
  on public.career_email_onboarding_events (event_type, created_at desc);

create index if not exists career_email_onboarding_events_lead_recent_idx
  on public.career_email_onboarding_events (lead_id, created_at desc)
  where lead_id is not null;

create index if not exists career_email_onboarding_events_email_recent_idx
  on public.career_email_onboarding_events (normalized_email_hash, created_at desc)
  where normalized_email_hash is not null;

create or replace function public.set_career_email_onboarding_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists career_email_onboarding_leads_set_updated_at
  on public.career_email_onboarding_leads;
create trigger career_email_onboarding_leads_set_updated_at
before update on public.career_email_onboarding_leads
for each row execute function public.set_career_email_onboarding_updated_at();

create or replace function public.claim_career_email_onboarding_reviews(
  worker_id text,
  batch_size integer default 5,
  max_attempts integer default 3,
  stale_after_seconds integer default 600
)
returns setof public.career_email_onboarding_leads
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from public.career_email_onboarding_leads
    where status = 'active'
      and step = 'profile_review_pending'
      and calendar_cta_sent_at is null
      and conversation_id is not null
      and talent_id is not null
      and profile_received_at is not null
      and review_attempts < greatest(1, max_attempts)
      and (
        review_locked_at is null
        or review_locked_at < timezone('utc', now()) - make_interval(secs => greatest(60, stale_after_seconds))
      )
    order by profile_received_at asc, created_at asc
    for update skip locked
    limit greatest(1, least(batch_size, 20))
  )
  update public.career_email_onboarding_leads l
     set review_attempts = review_attempts + 1,
         review_locked_at = timezone('utc', now()),
         review_locked_by = nullif(trim(worker_id), ''),
         last_error = null,
         updated_at = timezone('utc', now())
    from picked
   where l.id = picked.id
  returning l.*;
$$;

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
      network_waitlist_id,
      network_source_talent_id,
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
      source_row.network_waitlist_id,
      source_row.network_source_talent_id,
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

    update public.talent_opportunity_profile_snapshot
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

alter table public.career_email_onboarding_leads enable row level security;
alter table public.career_email_onboarding_events enable row level security;

revoke execute on function public.claim_career_email_onboarding_reviews(text, integer, integer, integer) from public;
revoke execute on function public.claim_career_email_onboarding_lead(uuid, uuid, text, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant select, insert, update, delete on public.career_email_onboarding_leads, public.career_email_onboarding_events to service_role';
    execute 'grant execute on function public.claim_career_email_onboarding_reviews(text, integer, integer, integer) to service_role';
    execute 'grant execute on function public.claim_career_email_onboarding_lead(uuid, uuid, text, text, text) to service_role';
  end if;

  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    execute 'grant usage on schema public to harper_worker';
    execute 'grant select, insert, update on public.career_email_onboarding_leads, public.career_email_onboarding_events to harper_worker';
    execute 'grant execute on function public.claim_career_email_onboarding_reviews(text, integer, integer, integer) to harper_worker';

    execute 'drop policy if exists career_email_onboarding_leads_harper_worker_all on public.career_email_onboarding_leads';
    execute 'create policy career_email_onboarding_leads_harper_worker_all on public.career_email_onboarding_leads for all to harper_worker using (true) with check (true)';

    execute 'drop policy if exists career_email_onboarding_events_harper_worker_all on public.career_email_onboarding_events';
    execute 'create policy career_email_onboarding_events_harper_worker_all on public.career_email_onboarding_events for all to harper_worker using (true) with check (true)';
  end if;
end;
$$;
