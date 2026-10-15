-- Additional organizations are available to existing Org users, independently
-- of the paused first-company signup. Only the authenticated server may call.
create or replace function public.workspace_create_additional_v1(
  p_user uuid, p_source_workspace uuid, p_domain text, p_homepage text,
  p_request uuid, p_internal_access boolean default false
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.company_workspace%rowtype; v_workspace uuid; v_role text;
begin
  if p_user is null or p_request is null or p_source_workspace is null
    or not exists(select 1 from public.company_workspace where company_workspace_id=p_source_workspace)
    or not (coalesce(p_internal_access,false) or exists(select 1 from public.company_user_workspace
      where company_workspace_id=p_source_workspace and company_user_id=p_user)) then
    raise exception 'signup_forbidden';
  end if;
  if p_domain is null or p_domain !~ '^[a-z0-9][a-z0-9.-]+[a-z0-9]$'
    or p_homepage is null or p_homepage !~ '^https?://[a-z0-9.-]+$'
    or not (split_part(p_homepage,'://',2)=p_domain or split_part(p_homepage,'://',2) like '%.'||p_domain) then
    raise exception 'signup_invalid_homepage';
  end if;
  -- Shared with the original signup transaction. All operations lock user first.
  perform pg_advisory_xact_lock(hashtextextended('workspace-signup-user:'||p_user::text,0));
  select * into w from public.company_workspace
    where signup_state->>'createdBy'=p_user::text and signup_state->>'creationRequestId'=p_request::text;
  if found then
    if w.signup_domain is distinct from p_domain then raise exception 'signup_creation_conflict'; end if;
    if not exists(select 1 from public.company_user_workspace where company_workspace_id=w.company_workspace_id
      and company_user_id=p_user and authority='owner') then raise exception 'signup_forbidden'; end if;
    return jsonb_build_object('status',case when w.signup_state->>'onboardingCompletedAt' is null then 'resume' else 'member' end,'workspaceId',w.company_workspace_id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-signup-domain:'||p_domain,0));
  select * into w from public.company_workspace other
    where other.signup_domain=p_domain
      or lower(split_part(regexp_replace(coalesce(other.homepage_url,''),'^https?://','','i'),'/',1)) in (p_domain,'www.'||p_domain)
      or lower(split_part(regexp_replace(coalesce(other.homepage_url,''),'^https?://','','i'),'/',1)) like '%.'||p_domain
    order by other.updated_at desc limit 1;
  if found then
    if p_internal_access or exists(select 1 from public.company_user_workspace
      where company_workspace_id=w.company_workspace_id and company_user_id=p_user) then
      return jsonb_build_object('status',case when w.signup_state->>'source'='organization_add'
        and w.signup_state->>'createdBy'=p_user::text and w.signup_state->>'onboardingCompletedAt' is null
        then 'resume' else 'member' end,'workspaceId',w.company_workspace_id);
    end if;
    return jsonb_build_object('status','invite_required');
  end if;
  insert into public.company_workspace(company_name,homepage_url,signup_domain,signup_state,
    billing_model,billing_started_at,billing_free_anchor_at)
    values(p_domain,p_homepage,p_domain,jsonb_build_object('createdBy',p_user,'source','organization_add',
      'creationRequestId',p_request,'researchStatus','idle','plan','free','planSelectedAt',clock_timestamp()),
      'standard',clock_timestamp(),clock_timestamp()) returning company_workspace_id into v_workspace;
  -- Titles are workspace-scoped. Reuse the selected source title, with the
  -- legacy personal profile as a fallback, without changing the source profile.
  select coalesce(nullif(trim(m.role),''),nullif(trim(u.role),'')) into v_role
    from public.company_users u left join public.company_user_workspace m
      on m.company_user_id=u.user_id and m.company_workspace_id=p_source_workspace
    where u.user_id=p_user;
  insert into public.company_user_workspace(company_workspace_id,company_user_id,authority,role)
    values(v_workspace,p_user,'owner',v_role);
  insert into public.company_data(company_workspace_id,source_payload,searched_at)
    values(v_workspace,'{}','1970-01-01T00:00:00Z');
  return jsonb_build_object('status','created','workspaceId',v_workspace);
end; $$;
revoke all on function public.workspace_create_additional_v1(uuid,uuid,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.workspace_create_additional_v1(uuid,uuid,text,text,uuid,boolean) to service_role;

-- Preserve the installed company-confirmation, optional-description, research
-- and billing contracts while adding a durable, organization-scoped completion.
do $migration$
declare definition text; anchor text := $anchor$else raise exception 'signup_invalid_action'; end if;$anchor$;
begin
  select pg_get_functiondef('public.workspace_signup_update_v1(uuid,uuid,text,jsonb)'::regprocedure) into definition;
  if strpos(definition,anchor)=0 then raise exception 'workspace signup completion anchor missing'; end if;
  definition:=replace(definition,anchor,$branch$
  elsif p_action='complete' then
    if s->>'source' is distinct from 'organization_add' then raise exception 'signup_forbidden'; end if;
    if s->>'companyConfirmedAt' is null or s->>'plan' is distinct from 'free' or s->>'planSelectedAt' is null then
      raise exception 'signup_setup_required';
    end if;
    s:=s||jsonb_build_object('onboardingCompletedAt',coalesce(s->>'onboardingCompletedAt',clock_timestamp()::text));
    update public.company_workspace set signup_state=s where company_workspace_id=p_workspace;
    return jsonb_build_object('ok',true,'completedAt',s->>'onboardingCompletedAt');
  else raise exception 'signup_invalid_action'; end if;
  $branch$);
  execute definition;
end; $migration$;
