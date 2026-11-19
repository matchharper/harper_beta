-- Commit the default-false marker before any index scan. PostgreSQL stores the
-- constant default in metadata; NOT VALID avoids scanning all existing workspaces
-- under this ALTER's exclusive lock. The check applies to every new or edited row.
set local lock_timeout='2s';
do $$
begin
  if not exists(select from pg_attribute where attrelid='public.company_workspace'::regclass
                and attname='is_public_data_home' and not attisdropped) then
    alter table public.company_workspace add column is_public_data_home boolean not null default false;
  end if;
  if not exists(select from pg_constraint where conrelid='public.company_workspace'::regclass
                and conname='company_public_data_home_identity') then
    alter table public.company_workspace add constraint company_public_data_home_identity check
      (not is_public_data_home or (company_db_id is not null and is_internal is false and external_roles_enabled is false)) not valid;
  end if;
end $$;

-- Normalize only the authority and a trailing slash. Preserve paths identifying
-- distinct employers on one shared host. Source article URLs are never identities.
create or replace function public.career_company_url_key_v1(p_url text) returns text
language sql immutable strict security invoker set search_path=public,pg_temp as $$
  select lower(m[1])||rtrim(coalesce(m[2],''),'/') from regexp_match(btrim(p_url),
    '^https?://([^/?#@[:space:]]+)(/[^?#[:space:]]*)?(?:[?#].*)?$','i') m
$$;
revoke all on function public.career_company_url_key_v1(text) from public,anon,authenticated;
grant execute on function public.career_company_url_key_v1(text) to service_role;
