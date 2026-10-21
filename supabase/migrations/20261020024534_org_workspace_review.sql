-- Access eligibility is decided once, from the creator's verified auth email.
-- Existing workspaces are deliberately not reclassified.
alter table public.company_workspace
  add column if not exists is_reviewing boolean not null default false,
  add column review_domain text,
  add column signup_notification jsonb;

-- Service code can read this one verified fact without broad auth.users grants.
create function private.org_review_creator_email(p_user uuid)
returns text language sql stable security definer set search_path='' as $$
  select lower(email) from auth.users where id=p_user
    and email_confirmed_at is not null and not coalesce(is_anonymous,false);
$$;
revoke all on function private.org_review_creator_email(uuid) from public,anon,authenticated;
grant execute on function private.org_review_creator_email(uuid) to service_role;

create function public.company_workspace_review_guard_v1()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_email text; v_host text; v_domain text;
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' or
      (new.is_reviewing,new.review_domain,new.signup_notification)
        is distinct from (old.is_reviewing,old.review_domain,old.signup_notification) then
      raise exception 'org_review_server_only';
    end if;
    return new;
  end if;
  if tg_op='INSERT' and new.signup_state->>'createdBy' is not null then
    v_email:=private.org_review_creator_email((new.signup_state->>'createdBy')::uuid);
    if v_email is null then raise exception 'signup_work_email_required'; end if;
    v_host:=split_part(v_email,'@',2);
    -- The authenticated server owns the domain policy in workspaceReviewDomains.json.
    -- Bind its decision to the same verified email used at insert time.
    if new.signup_notification->>'email' is distinct from v_email then
      raise exception 'signup_review_email_changed';
    end if;
    v_domain:=new.review_domain;
    if v_domain is not null and not (v_host=v_domain or right(v_host,length(v_domain)+1)='.'||v_domain) then
      raise exception 'signup_invalid_review_domain';
    end if;
    new.is_reviewing:=v_domain is not null;
    if new.is_reviewing then
      -- No payment while access is held. This preserves the existing completion contract.
      new.signup_state:=new.signup_state||jsonb_build_object(
        'plan','free','planSelectedAt',clock_timestamp());
    end if;
    new.signup_notification:=jsonb_build_object(
      'status','pending','email',v_email,'emailDomain',v_host,
      'reviewDomain',v_domain,'isReviewing',new.is_reviewing);
  end if;
  return new;
end; $$;
revoke all on function public.company_workspace_review_guard_v1() from public,anon,authenticated;
create trigger company_workspace_review_guard
  before insert or update on public.company_workspace
  for each row execute function public.company_workspace_review_guard_v1();

-- One atomic claim per workspace. Ambiguous external delivery is held for
-- reconciliation instead of automatically sending a possibly duplicate alert.
create function public.claim_workspace_signup_notification_v1(p_workspace uuid)
returns jsonb language sql security invoker set search_path='' as $$
  update public.company_workspace
    set signup_notification=signup_notification||jsonb_build_object(
      'status','sending','claimedAt',clock_timestamp())
    where company_workspace_id=p_workspace
      and signup_notification->>'status'='pending'
      and coalesce((signup_notification->>'retryAt')::timestamptz,'-infinity')<=clock_timestamp()
    returning signup_notification||jsonb_build_object(
      'workspaceId',company_workspace_id,'companyName',company_name);
$$;
revoke all on function public.claim_workspace_signup_notification_v1(uuid) from public,anon,authenticated;
grant execute on function public.claim_workspace_signup_notification_v1(uuid) to service_role;

-- Direct Data API calls must not bypass the web/service gate. This helper has
-- definer rights only to read the access flag without recursive workspace RLS.
create function private.org_workspace_is_available(p_workspace uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.company_workspace
    where company_workspace_id=p_workspace and not is_reviewing);
$$;
revoke all on function private.org_workspace_is_available(uuid) from public,anon;
grant execute on function private.org_workspace_is_available(uuid) to authenticated,service_role;

create function private.org_role_workspace_is_available(p_role uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.company_roles r
    join public.company_workspace w on w.company_workspace_id=r.company_workspace_id
    where r.role_id=p_role and w.is_reviewing);
$$;
revoke all on function private.org_role_workspace_is_available(uuid) from public,anon;
grant execute on function private.org_role_workspace_is_available(uuid) to authenticated,service_role;

-- Onboarding uses authenticated server endpoints. Existing permissive policies
-- continue to own membership; this restrictive policy only adds the review gate.
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid
      where n.nspname='public' and c.relkind='r' and c.relrowsecurity
        and c.relname like 'company_%'
        and a.attname='company_workspace_id' and not a.attisdropped
  loop
    execute format('create policy org_workspace_review_boundary on public.%I as restrictive
      for all to authenticated using (company_workspace_id is null or private.org_workspace_is_available(company_workspace_id))
      with check (company_workspace_id is null or private.org_workspace_is_available(company_workspace_id))',t.relname);
  end loop;
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid
      where n.nspname='public' and c.relkind='r' and c.relrowsecurity
        and c.relname like 'company_%' and a.attname='role_id' and not a.attisdropped
        and not exists(select 1 from pg_attribute other where other.attrelid=c.oid
          and other.attname='company_workspace_id' and not other.attisdropped)
  loop
    execute format('create policy org_workspace_review_boundary on public.%I as restrictive
      for all to authenticated using (private.org_role_workspace_is_available(role_id))
      with check (private.org_role_workspace_is_available(role_id))',t.relname);
  end loop;
end; $$;

-- A pending organization cannot start a hiring path through a trusted worker.
create function public.company_role_review_guard_v1()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.company_workspace
    where company_workspace_id=new.company_workspace_id and is_reviewing) then
    raise exception 'org_workspace_under_review';
  end if;
  return new;
end; $$;
revoke all on function public.company_role_review_guard_v1() from public,anon,authenticated;
create trigger company_role_review_guard before insert or update on public.company_roles
  for each row execute function public.company_role_review_guard_v1();

-- Extend the existing creation transactions: the server's decision is inserted
-- with the workspace, so there is no temporarily unrestricted workspace.
-- Required parameters also make older callers fail closed instead of skipping review.
do $migration$
declare spec record; definition text; old_insert text; old_values text;
begin
  for spec in select * from (values
    ('workspace_signup_begin_v1', 'uuid,text,boolean', 'text,text,uuid,text,boolean'),
    ('workspace_create_additional_v1', 'uuid,uuid,text,text,uuid,boolean', 'text,text,uuid,uuid,text,text,uuid,boolean')
  ) as functions(name,old_args,new_args)
  loop
    select pg_get_functiondef(to_regprocedure('public.'||spec.name||'('||spec.old_args||')')) into definition;
    old_insert:='insert into public.company_workspace(company_name,homepage_url,signup_domain,signup_state,';
    old_values:='values(p_domain,';
    if definition is null or strpos(definition,old_insert)=0 or strpos(definition,old_values)=0 then
      raise exception 'workspace review creation anchor missing: %',spec.name;
    end if;
    definition:=replace(definition,spec.name||'(',spec.name||'(p_review_email text, p_review_domain text, ');
    definition:=replace(definition,old_insert,
      'insert into public.company_workspace(review_domain,signup_notification,company_name,homepage_url,signup_domain,signup_state,');
    definition:=replace(definition,old_values,
      'values(p_review_domain,jsonb_build_object(''email'',p_review_email),p_domain,');
    execute 'drop function public.'||spec.name||'('||spec.old_args||')';
    execute definition;
    execute 'revoke all on function public.'||spec.name||'('||spec.new_args||') from public,anon,authenticated';
    execute 'grant execute on function public.'||spec.name||'('||spec.new_args||') to service_role';
  end loop;
end; $migration$;
