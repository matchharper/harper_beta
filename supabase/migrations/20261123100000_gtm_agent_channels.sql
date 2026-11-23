-- gtm agent new channels (Shaun 11/23): a channel is where the person was found × why they wrote (the intent), and the
-- intent picks the first mail's offer (agent/channels.ts). Additive only: the code before it never reads these.

-- Why they wrote, as the search's judge read it (null: uploaded, or found before it was kept = job seeking).
alter table public.gtm_agent_people add column if not exists intent text;
alter table public.gtm_agent_people drop constraint if exists gtm_agent_people_intent_check;
alter table public.gtm_agent_people add constraint gtm_agent_people_intent_check
  check (intent in ('job', 'coaching', 'event'));

-- Author or commenter of the page that found them (null: the author).
alter table public.gtm_agent_people add column if not exists found_as text;
alter table public.gtm_agent_people drop constraint if exists gtm_agent_people_found_as_check;
alter table public.gtm_agent_people add constraint gtm_agent_people_found_as_check
  check (found_as in ('author', 'commenter'));

-- The row they came from in Harper's own data ('candid:<uuid>' for the purchased DB), at most once.
alter table public.gtm_agent_people add column if not exists source_ref text;
create unique index if not exists gtm_agent_people_source_ref_key
  on public.gtm_agent_people (source_ref) where source_ref is not null;

-- db: Harper's purchased candidate DB (agent/dbSource.server.ts).
alter table public.gtm_agent_people drop constraint if exists gtm_agent_people_method_check;
alter table public.gtm_agent_people add constraint gtm_agent_people_method_check
  check (method in ('applicant', 'open_to_work_profile', 'signal_post', 'layoff_company', 'db'));

-- no_mx: the address's domain takes no mail. giver: someone who helps or hires (a hiring founder or lead, a recruiter,
-- a coach or mentor, an event host), kept for the company side rather than mailed a candidate's offer (Shaun 11/23).
alter table public.gtm_agent_people drop constraint if exists gtm_agent_people_exclude_reason_check;
alter table public.gtm_agent_people add constraint gtm_agent_people_exclude_reason_check
  check (exclude_reason in (
    'member', 'recent_contact', 'quiet_after_end', 'suppressed', 'internal', 'duplicate', 'stale_signal',
    'not_job_seeking', 'no_lookup_source', 'lookup_not_found', 'lookup_other_person', 'lookup_skipped', 'no_email',
    'no_mx', 'giver'
  ));

-- Which kind of giver (exclude_reason = 'giver').
alter table public.gtm_agent_people add column if not exists giver_kind text;
alter table public.gtm_agent_people drop constraint if exists gtm_agent_people_giver_kind_check;
alter table public.gtm_agent_people add constraint gtm_agent_people_giver_kind_check
  check (giver_kind in ('hiring_leader', 'recruiter', 'coach', 'event_host'));

-- The first mail's offer: posting (as before), coaching, general ('posting_post' is an old value).
alter table public.gtm_agent_people drop constraint if exists gtm_agent_people_message_kind_check;
alter table public.gtm_agent_people add constraint gtm_agent_people_message_kind_check
  check (message_kind in ('posting', 'posting_post', 'coaching', 'general'));

-- The events a general mail proposes (agent/events.server.ts): on the person when picked, on the mail when sent
-- (its link page shows them): [{title, url, startsAt, endsAt, place, online, organizer, why}].
alter table public.gtm_agent_people add column if not exists offer_events jsonb not null default '[]'::jsonb;
alter table public.gtm_mails add column if not exists events jsonb;

-- Every channel's on/off and the new channels' daily max: {<channel>: {enabled, dailyMax}} (agent/channels.ts).
alter table public.gtm_agent_settings add column if not exists channels jsonb not null default '{}'::jsonb;
-- Why the brake turned a channel off, and when: {<channel>: {reason, at}}.
alter table public.gtm_agent_settings add column if not exists channel_brakes jsonb not null default '{}'::jsonb;
