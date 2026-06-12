alter table public.talent_calls
  drop constraint if exists talent_calls_status_check;

alter table public.talent_calls
  add constraint talent_calls_status_check check (
    status in ('pending', 'active', 'completed', 'abandoned')
  );

create index if not exists talent_calls_kind_status_recent_idx
  on public.talent_calls (user_id, kind, status, last_active_at desc, created_at desc);

create unique index if not exists talent_calls_one_pending_internal_opportunity_request_uidx
  on public.talent_calls (user_id, kind, ((state ->> 'opportunityId')))
  where kind = 'internal_opportunity_request'
    and status in ('pending', 'active')
    and (state ->> 'opportunityId') is not null;

drop index if exists public.talent_calls_one_open_internal_opportunity_request_per_user_uidx;
