create or replace function public.prevent_company_user_for_existing_talent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.talent_users
    where user_id = new.user_id
  ) and not exists (
    select 1
    from public.company_users
    where user_id = new.user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'auth persona conflict: talent user already exists',
      detail = new.user_id::text;
  end if;

  return new;
end;
$$;

revoke all
on function public.prevent_company_user_for_existing_talent()
from public;

drop trigger if exists company_users_prevent_talent_bootstrap
on public.company_users;

create trigger company_users_prevent_talent_bootstrap
before insert
on public.company_users
for each row
execute function public.prevent_company_user_for_existing_talent();
