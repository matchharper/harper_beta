begin;

create table if not exists public.meeting_availability (
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  company_user_id uuid not null
    references public.company_users(user_id) on delete cascade,
  timezone text not null,
  weekly_rules jsonb not null default '{}'::jsonb,
  date_overrides jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (company_workspace_id, company_user_id),
  constraint meeting_availability_timezone_length_check
    check (char_length(timezone) between 1 and 128),
  constraint meeting_availability_weekly_rules_object_check
    check (jsonb_typeof(weekly_rules) = 'object'),
  constraint meeting_availability_date_overrides_object_check
    check (jsonb_typeof(date_overrides) = 'object'),
  constraint meeting_availability_version_check check (version > 0)
);

alter table public.meeting_availability enable row level security;

grant all on table public.meeting_availability to service_role;

comment on table public.meeting_availability is
  'One reusable interview availability profile per company workspace member. Detailed validation is owned by the application service.';
comment on column public.meeting_availability.weekly_rules is
  'ISO weekday keys 1 through 7 mapped to normalized local-time intervals.';
comment on column public.meeting_availability.date_overrides is
  'Local YYYY-MM-DD keys mapped to final intervals for that date; an empty array closes the whole date.';

commit;
