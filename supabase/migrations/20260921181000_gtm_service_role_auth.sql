-- Supabase secret keys are opaque credentials. PostgREST exposes their
-- effective role through auth.role(), while the legacy per-claim setting may
-- be absent. Keep the legacy setting only as a compatibility fallback.

create or replace function gtm_view.current_actor()
returns gtm_view.actor_identity
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result gtm_view.actor_identity;
  actor_email text;
  actor_uid uuid := auth.uid();
  request_role text := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
begin
  if actor_uid is not null then
    select lower(btrim(email)) into actor_email
    from auth.users
    where id = actor_uid
      and email_confirmed_at is not null
      and deleted_at is null
      and lower(split_part(email, '@', 2)) = 'matchharper.com';

    if actor_email is null then
      raise exception 'Internal GTM access required' using errcode = '42501';
    end if;

    result.id := actor_uid;
    result.name := actor_email;
  elsif request_role = 'service_role' then
    result.id := '00000000-0000-4000-8000-000000000002'::uuid;
    result.name := 'supabase-service-role';
  elsif request_role is not null then
    raise exception 'Internal GTM access required' using errcode = '42501';
  elsif session_user in ('postgres', 'supabase_admin') then
    result.id := '00000000-0000-4000-8000-000000000001'::uuid;
    result.name := 'supabase-plugin';
  else
    raise exception 'Internal GTM access required' using errcode = '42501';
  end if;

  result.can_write := true;
  return result;
end;
$$;

