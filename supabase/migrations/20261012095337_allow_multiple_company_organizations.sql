-- A company is not an access boundary: its website/domain/LinkedIn identity may
-- be reused by independent Organizations. Existing memberships and invitations
-- remain the only ways to enter an existing Organization.
drop index if exists public.company_workspace_signup_domain_key;
create index company_workspace_signup_domain_idx on public.company_workspace(signup_domain)
  where signup_domain is not null;

create or replace function public.workspace_signup_begin_v1(p_user uuid,p_domain text,p_create boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text; v_workspace uuid;
begin
  select lower(email) into v_email from auth.users where id=p_user
    and email_confirmed_at is not null and not coalesce(is_anonymous,false);
  if v_email is null or p_domain is null or p_domain !~ '^[a-z0-9][a-z0-9.-]+[a-z0-9]$'
    or not (split_part(v_email,'@',2)=p_domain or split_part(v_email,'@',2) like '%.'||p_domain) then
    raise exception 'signup_work_email_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-signup-user:'||p_user::text,0));
  select company_workspace_id into v_workspace from public.company_user_workspace
    where company_user_id=p_user order by created_at limit 1;
  if v_workspace is not null then return jsonb_build_object('status','member','workspaceId',v_workspace); end if;
  select company_workspace_id into v_workspace from public.company_workspace_invitations
    where lower(email)=v_email and accepted_at is null order by created_at desc limit 1;
  if v_workspace is not null then return jsonb_build_object('status','invited','workspaceId',v_workspace); end if;
  if not p_create then return jsonb_build_object('status','new','domain',p_domain); end if;
  insert into public.company_users(user_id,email,is_authenticated) values(p_user,v_email,true)
    on conflict(user_id) do update set email=excluded.email,is_authenticated=true,onboarding_completed_at=null;
  insert into public.company_workspace(company_name,homepage_url,signup_domain,signup_state,
    billing_model,billing_started_at,billing_free_anchor_at)
    values(p_domain,'https://'||p_domain,p_domain,jsonb_build_object('createdBy',p_user,'researchStatus','idle'),
      'standard',clock_timestamp(),clock_timestamp()) returning company_workspace_id into v_workspace;
  insert into public.company_user_workspace(company_workspace_id,company_user_id,authority)
    values(v_workspace,p_user,'owner');
  insert into public.company_data(company_workspace_id,source_payload,searched_at)
    values(v_workspace,'{}','1970-01-01T00:00:00Z');
  return jsonb_build_object('status','created','workspaceId',v_workspace);
end; $$;
revoke all on function public.workspace_signup_begin_v1(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.workspace_signup_begin_v1(uuid,text,boolean) to service_role;

-- Preserve all installed confirmation, research, billing and organization-scoped
-- completion behavior. Remove only the cross-Organization LinkedIn uniqueness
-- check; retain its advisory lock for shared company_db identity resolution.
do $migration$
declare definition text; start_at integer; next_at integer;
begin
  select pg_get_functiondef('public.workspace_signup_update_v1(uuid,uuid,text,jsonb)'::regprocedure) into definition;
  start_at:=strpos(definition,'if v_url is not null and exists(select 1 from public.company_workspace other');
  if start_at=0 then raise exception 'workspace signup company uniqueness anchor missing'; end if;
  next_at:=strpos(substr(definition,start_at),'select source_payload');
  if next_at=0 then raise exception 'workspace signup company continuation anchor missing'; end if;
  definition:=substr(definition,1,start_at-1)||substr(definition,start_at+next_at-1);
  execute definition;

  -- Idempotency is per creation request, not per company domain. A new Add action
  -- can create an independent Organization for the same company.
  select pg_get_functiondef('public.workspace_create_additional_v1(uuid,uuid,text,text,uuid,boolean)'::regprocedure) into definition;
  start_at:=strpos(definition,$anchor$perform pg_advisory_xact_lock(hashtextextended('workspace-signup-domain:'||p_domain,0));$anchor$);
  if start_at=0 then raise exception 'additional organization company uniqueness anchor missing'; end if;
  next_at:=strpos(substr(definition,start_at),'insert into public.company_workspace(');
  if next_at=0 then raise exception 'additional organization creation continuation anchor missing'; end if;
  definition:=substr(definition,1,start_at-1)||substr(definition,start_at+next_at-1);
  execute definition;
end; $migration$;
