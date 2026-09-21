-- Delivery failures are internal provider facts. Preserve the reserved-kind
-- boundary while allowing both supported delivery processors to write them.

create or replace function public.gtm_guard_outreach_internal_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor text := current_setting('gtm.actor', true);
begin
  if new.kind = 'reply_triaged'
    and actor is distinct from 'outreach-reply-triage' then
    raise exception 'reply_triaged is reserved for the outreach reply processor';
  end if;
  if new.kind = 'delivery_failed'
    and actor not in (
      'gmail-outreach-delivery-sync',
      'resend-outreach-delivery-sync'
    ) then
    raise exception 'delivery_failed is reserved for an outreach delivery processor';
  end if;
  return new;
end;
$$;

drop trigger if exists gtm_guard_outreach_internal_activity
  on public.gtm_activities;
create trigger gtm_guard_outreach_internal_activity
before insert or update of kind on public.gtm_activities
for each row execute function public.gtm_guard_outreach_internal_activity();

notify pgrst, 'reload schema';
