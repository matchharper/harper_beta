create or replace function public.sync_company_role_expired_at_for_ended_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(btrim(coalesce(new.status, ''))) = 'ended'
     and lower(btrim(coalesce(old.status, ''))) <> 'ended'
  then
    new.expired_at := timezone('utc', now());
  elsif lower(btrim(coalesce(new.status, ''))) <> 'ended'
        and lower(btrim(coalesce(old.status, ''))) = 'ended'
  then
    new.expired_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists company_roles_sync_expired_at_for_ended_status
on public.company_roles;

create trigger company_roles_sync_expired_at_for_ended_status
before update of status on public.company_roles
for each row
when (old.status is distinct from new.status)
execute function public.sync_company_role_expired_at_for_ended_status();

comment on function public.sync_company_role_expired_at_for_ended_status()
is 'Treats company_roles.expired_at as the role-ended timestamp: set it on transition to ended and clear it on reactivation.';

