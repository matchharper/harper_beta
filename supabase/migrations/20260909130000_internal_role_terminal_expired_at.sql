begin;

-- Internal Role lifecycle status is the canonical terminal-state signal. Keep
-- expired_at as the timestamp of the first transition into a terminal state so
-- downstream candidate communication has one reliable closure clock.
create or replace function public.stamp_internal_role_terminal_expired_at_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := transaction_timestamp();
  v_old_status text := lower(btrim(coalesce(old.status, '')));
  v_new_status text := lower(btrim(coalesce(new.status, '')));
begin
  if lower(btrim(coalesce(new.source_type, ''))) <> 'internal' then
    return new;
  end if;

  if v_new_status in ('ended', 'deleted') then
    if v_old_status not in ('ended', 'deleted') then
      new.expired_at := v_now;
    elsif new.expired_at is null then
      new.expired_at := coalesce(old.expired_at, v_now);
    end if;
  end if;

  return new;
end;
$$;

comment on function public.stamp_internal_role_terminal_expired_at_v1()
is 'Records the first ended/deleted transition time for an internal Role in company_roles.expired_at.';

drop trigger if exists company_roles_stamp_internal_terminal_expired_at_v1
  on public.company_roles;
create trigger company_roles_stamp_internal_terminal_expired_at_v1
before update of status on public.company_roles
for each row
when (old.status is distinct from new.status)
execute function public.stamp_internal_role_terminal_expired_at_v1();

-- Preserve already-known timestamps. For terminal rows created before this
-- invariant, role_status_changed_at is the best lifecycle clock when present;
-- updated_at is the fallback for ordinary website/chat lifecycle writes.
update public.company_roles role
set expired_at = coalesce(
  internal_role.role_status_changed_at,
  role.updated_at,
  transaction_timestamp()
)
from public.company_internal_roles internal_role
where internal_role.role_id = role.role_id
  and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
  and lower(btrim(coalesce(role.status, ''))) in ('ended', 'deleted')
  and role.expired_at is null;

commit;
