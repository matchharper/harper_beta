-- A periodic opportunity run must never start until three days after the
-- talent's latest canonical profile submission. Onboarding completion uses the
-- separate conversation_completed run and does not bypass or depend on this
-- periodic scheduler state.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

create index if not exists talent_messages_latest_profile_submit_idx
  on public.talent_messages (user_id, created_at desc)
  where role = 'user' and message_type = 'profile_submit';

create or replace function public.ensure_opportunity_scheduler_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_latest_profile_submitted_at timestamptz;
begin
  select max(message.created_at)
    into v_latest_profile_submitted_at
  from public.talent_messages message
  where message.user_id = new.user_id
    and message.role = 'user'
    and message.message_type = 'profile_submit';

  insert into public.opportunity_scheduler_state (talent_id, next_check_at)
  values (
    new.user_id,
    coalesce(
      v_latest_profile_submitted_at + interval '3 days',
      timezone('utc', now()) + interval '3 days'
    )
  )
  on conflict (talent_id) do update
  set next_check_at = greatest(
        public.opportunity_scheduler_state.next_check_at,
        excluded.next_check_at
      );
  return new;
end;
$$;

create or replace function public.defer_opportunity_scheduler_after_profile_submit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.opportunity_scheduler_state (talent_id, next_check_at)
  values (new.user_id, new.created_at + interval '3 days')
  on conflict (talent_id) do update
  set next_check_at = greatest(
        public.opportunity_scheduler_state.next_check_at,
        excluded.next_check_at
      );
  return new;
end;
$$;

drop trigger if exists talent_messages_defer_opportunity_scheduler
  on public.talent_messages;
create trigger talent_messages_defer_opportunity_scheduler
after insert on public.talent_messages
for each row
when (new.role = 'user' and new.message_type = 'profile_submit')
execute function public.defer_opportunity_scheduler_after_profile_submit();

-- Repair existing state rows and seed any missing rows. Old submissions remain
-- immediately eligible when their three-day minimum has already elapsed.
insert into public.opportunity_scheduler_state (talent_id, next_check_at)
select
  setting.user_id,
  coalesce(
    profile_submission.latest_submitted_at + interval '3 days',
    timezone('utc', now()) + interval '3 days'
  )
from public.talent_setting setting
left join lateral (
  select max(message.created_at) as latest_submitted_at
  from public.talent_messages message
  where message.user_id = setting.user_id
    and message.role = 'user'
    and message.message_type = 'profile_submit'
) profile_submission on true
on conflict (talent_id) do update
set next_check_at = greatest(
      public.opportunity_scheduler_state.next_check_at,
      excluded.next_check_at
    );

commit;
