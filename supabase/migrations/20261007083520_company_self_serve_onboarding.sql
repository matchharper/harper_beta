-- Verified signup origin and durable setup progress; no new tables.
alter table public.company_workspace
  add column signup_domain text,
  add column signup_state jsonb;
create unique index company_workspace_signup_domain_key
  on public.company_workspace(signup_domain) where signup_domain is not null;

create function public.workspace_signup_columns_guard_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and
    ((tg_op='INSERT' and (new.signup_domain is not null or new.signup_state is not null))
     or (tg_op='UPDATE' and (new.signup_domain,new.signup_state) is distinct from (old.signup_domain,old.signup_state))) then
    raise exception 'signup_write_forbidden';
  end if;
  return new;
end; $$;
create trigger workspace_signup_columns_guard before insert or update on public.company_workspace
for each row execute function public.workspace_signup_columns_guard_v1();

-- Service-only caller has verified a work email and normalized its registrable domain.
-- The transaction independently checks the authenticated account and exact domain boundary.
-- Definer is required only here to read auth.users; execution is restricted to service_role.
create function public.workspace_signup_begin_v1(p_user uuid,p_domain text,p_create boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text; v_workspace uuid;
begin
  select lower(email) into v_email from auth.users where id=p_user and email_confirmed_at is not null and not coalesce(is_anonymous,false);
  if v_email is null or p_domain is null or p_domain !~ '^[a-z0-9][a-z0-9.-]+[a-z0-9]$'
    or not (split_part(v_email,'@',2)=p_domain or split_part(v_email,'@',2) like '%.'||p_domain) then
    raise exception 'signup_work_email_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-signup-user:'||p_user::text,0));
  perform pg_advisory_xact_lock(hashtextextended('workspace-signup-domain:'||p_domain,0));
  select company_workspace_id into v_workspace from public.company_user_workspace
    where company_user_id=p_user order by created_at limit 1;
  if v_workspace is not null then return jsonb_build_object('status','member','workspaceId',v_workspace); end if;
  select company_workspace_id into v_workspace from public.company_workspace_invitations
    where lower(email)=v_email and accepted_at is null order by created_at desc limit 1;
  if v_workspace is not null then return jsonb_build_object('status','invited','workspaceId',v_workspace); end if;
  if exists(select 1 from public.company_workspace w where w.signup_domain=p_domain)
    or exists(select 1 from public.company_workspace w
      where exists(select 1 from public.company_user_workspace m join auth.users u on u.id=m.company_user_id
        where m.company_workspace_id=w.company_workspace_id and m.authority in ('owner','admin') and u.email_confirmed_at is not null
          and (split_part(lower(u.email),'@',2)=p_domain or split_part(lower(u.email),'@',2) like '%.'||p_domain)))
    or exists(select 1 from public.company_workspace w
      where lower(split_part(regexp_replace(coalesce(w.homepage_url,''),'^https?://(www\.)?','','i'),'/',1))=p_domain
        and exists(select 1 from public.company_user_workspace m where m.company_workspace_id=w.company_workspace_id)) then
    return jsonb_build_object('status','invite_required');
  end if;
  if not p_create then return jsonb_build_object('status','new','domain',p_domain); end if;
  insert into public.company_users(user_id,email,is_authenticated) values(p_user,v_email,true)
    on conflict(user_id) do update set email=excluded.email,is_authenticated=true,onboarding_completed_at=null;
  insert into public.company_workspace(company_name,homepage_url,signup_domain,signup_state,billing_model,billing_started_at,billing_free_anchor_at)
    values(p_domain,'https://'||p_domain,p_domain,jsonb_build_object('createdBy',p_user,'researchStatus','idle'), 'standard',clock_timestamp(),clock_timestamp())
    returning company_workspace_id into v_workspace;
  insert into public.company_user_workspace(company_workspace_id,company_user_id,authority) values(v_workspace,p_user,'owner');
  insert into public.company_data(company_workspace_id,source_payload,searched_at) values(v_workspace,'{}','1970-01-01T00:00:00Z');
  return jsonb_build_object('status','created','workspaceId',v_workspace);
end; $$;

create function public.workspace_signup_update_v1(p_user uuid,p_workspace uuid,p_action text,p_values jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.company_workspace%rowtype; s jsonb; r jsonb; v_db bigint; v_token text; v_url text;
begin
  select * into strict w from public.company_workspace where company_workspace_id=p_workspace for update;
  if w.signup_state->>'createdBy' is distinct from p_user::text or not exists(
    select 1 from public.company_user_workspace where company_workspace_id=p_workspace and company_user_id=p_user and authority='owner') then
    raise exception 'signup_forbidden';
  end if;
  s:=w.signup_state;
  if p_action='research_start' then
    if s->>'companyConfirmedAt' is not null or s->>'researchStatus'='ready' or
      (s->>'researchStatus'='pending' and (s->>'researchStartedAt')::timestamptz>clock_timestamp()-interval '2 minutes') then
      return jsonb_build_object('claimed',false);
    end if;
    -- Failed provider calls may be retried, but cannot become an unbounded paid-search endpoint.
    if coalesce((s->>'researchAttempts')::int,0)>=3 then return jsonb_build_object('claimed',false); end if;
    v_token:=gen_random_uuid()::text;
    s:=s||jsonb_build_object('researchStatus','pending','researchToken',v_token,'researchStartedAt',clock_timestamp(),'researchAttempts',coalesce((s->>'researchAttempts')::int,0)+1);
    update public.company_workspace set signup_state=s where company_workspace_id=p_workspace;
    return jsonb_build_object('claimed',true,'token',v_token,'domain',w.signup_domain);
  elsif p_action='research_finish' then
    if s->>'companyConfirmedAt' is not null or s->>'researchToken' is distinct from p_values->>'token' then return jsonb_build_object('applied',false); end if;
    s:=s||jsonb_build_object('researchStatus',case when p_values->'company' is null then 'failed' else 'ready' end);
    update public.company_data set source_payload=coalesce(source_payload,'{}')||jsonb_build_object('signupResearch',p_values->'company'),
      searched_at=case when p_values->'company' is not null then clock_timestamp() else searched_at end
      where company_workspace_id=p_workspace;
  elsif p_action='company' then
    if length(trim(coalesce(p_values->>'name','')))=0 or length(p_values->>'name')>160
      or length(trim(coalesce(p_values->>'description','')))=0 or length(p_values->>'description')>8000 then raise exception 'signup_invalid_company'; end if;
    v_url:=nullif(p_values->>'linkedinUrl','');
    if v_url is not null then
      perform pg_advisory_xact_lock(hashtextextended('signup-company-linkedin:'||rtrim(lower(v_url),'/'),0));
    end if;
    if v_url is not null and exists(select 1 from public.company_workspace other
      where other.company_workspace_id<>p_workspace and rtrim(lower(other.linkedin_url),'/')=rtrim(lower(v_url),'/')
      and exists(select 1 from public.company_user_workspace m where m.company_workspace_id=other.company_workspace_id)) then
      raise exception 'signup_company_exists';
    end if;
    select source_payload->'signupResearch' into r from public.company_data where company_workspace_id=p_workspace;
    update public.company_data set
      total_funding_raised=coalesce(total_funding_raised,nullif(r->>'totalFundingRaised','')),
      main_investors=coalesce(main_investors,nullif(r->>'mainInvestors','')),
      last_funding_stage=coalesce(last_funding_stage,nullif(r->>'lastFundingStage','')),
      last_funding_round_description=coalesce(last_funding_round_description,nullif(r->>'lastFundingRoundDescription','')),
      updated_at=clock_timestamp()
      where company_workspace_id=p_workspace;
    v_db:=w.company_db_id;
    if v_db is null and v_url is not null then
      select id into v_db from public.company_db where rtrim(lower(linkedin_url),'/')=rtrim(lower(v_url),'/') order by id limit 1;
    end if;
    if v_db is null then
      select id into v_db from public.company_db
        where lower(split_part(regexp_replace(coalesce(website_url,''),'^https?://(www\.)?','','i'),'/',1))=w.signup_domain
        order by id limit 1;
    end if;
    if v_db is null then
      insert into public.company_db(name,description,short_description,website_url,linkedin_url,location)
        values(p_values->>'name',p_values->>'description',p_values->>'description','https://'||w.signup_domain,v_url,r->>'location') returning id into v_db;
    end if;
    -- Never overwrite a shared company_db record from a new signup's edits.
    update public.company_workspace set company_name=p_values->>'name',company_description=p_values->>'description',
      linkedin_url=v_url,company_db_id=v_db,updated_at=clock_timestamp() where company_workspace_id=p_workspace;
    s:=s||jsonb_build_object('companyConfirmedAt',clock_timestamp());
  elsif p_action='plan' then
    if s->>'companyConfirmedAt' is null then raise exception 'signup_company_required'; end if;
    if p_values->>'plan' not in ('free','agent') or p_values->>'plan' is null then raise exception 'signup_invalid_plan'; end if;
    if p_values->>'plan'='agent' and not exists(select 1 from public.company_workspace_agents a
      where a.company_workspace_id=p_workspace and public.workspace_billing_agent_active_v1(a,clock_timestamp())) then
      raise exception 'signup_payment_pending';
    end if;
    if p_values->>'plan'='free' and exists(select 1 from public.company_workspace_agents a
      where a.company_workspace_id=p_workspace and public.workspace_billing_agent_active_v1(a,clock_timestamp())) then
      raise exception 'signup_paid_plan_active';
    end if;
    s:=s||jsonb_build_object('plan',p_values->>'plan','planSelectedAt',clock_timestamp());
  else raise exception 'signup_invalid_action'; end if;
  update public.company_workspace set signup_state=s where company_workspace_id=p_workspace;
  return jsonb_build_object('ok',true);
end; $$;

revoke all on function public.workspace_signup_columns_guard_v1() from public,anon,authenticated;
revoke all on function public.workspace_signup_begin_v1(uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.workspace_signup_update_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.workspace_signup_begin_v1(uuid,text,boolean) to service_role;
grant execute on function public.workspace_signup_update_v1(uuid,uuid,text,jsonb) to service_role;
