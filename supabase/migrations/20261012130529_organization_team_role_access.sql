-- Teams are access groups only. Billing, Slots and Intro accounting stay workspace-scoped.
create table public.company_workspace_teams (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_workspace_id, id)
);
alter table public.company_workspace_teams enable row level security;
revoke all on public.company_workspace_teams from public, anon, authenticated;
grant select on public.company_workspace_teams to authenticated;
grant all on public.company_workspace_teams to service_role;
create unique index company_workspace_teams_workspace_name_uidx
  on public.company_workspace_teams(company_workspace_id,lower(btrim(name))) where deleted_at is null;

alter table public.company_user_workspace
  add column access_scope text not null default 'organization' check (access_scope in ('organization','team')),
  add column team_id uuid references public.company_workspace_teams(id) on delete set null;
-- Membership writes already run through authenticated server commands. Direct
-- Data API writes must not bypass Owner checks or an invitation's saved scope.
revoke insert,update,delete on public.company_user_workspace from anon,authenticated;
alter table public.company_workspace_invitations
  add column access_scope text not null default 'organization' check (access_scope in ('organization','team')),
  add column team_id uuid references public.company_workspace_teams(id) on delete set null;
alter table public.company_roles add column team_id uuid references public.company_workspace_teams(id) on delete restrict;
create index company_roles_workspace_team_idx on public.company_roles(company_workspace_id,team_id);
create index company_user_workspace_team_idx on public.company_user_workspace(company_workspace_id,team_id);

-- General conversations are isolated by access group; Role conversations retain their existing identity.
alter table public.company_conversations add column team_id uuid references public.company_workspace_teams(id) on delete restrict;
drop index if exists public.company_conversations_workspace_scope_uidx;
create unique index company_conversations_workspace_scope_uidx on public.company_conversations(company_workspace_id)
  where role_id is null and team_id is null;
create unique index company_conversations_team_scope_uidx on public.company_conversations(company_workspace_id,team_id)
  where role_id is null and team_id is not null;

create schema if not exists private;
grant usage on schema private to authenticated,service_role;

-- Avoid the pre-existing recursive membership SELECT policy when Role RLS
-- consults current membership. Writes remain server-only above.
create function private.org_team_workspace_member(p_workspace uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.company_user_workspace
    where company_workspace_id=p_workspace and company_user_id=(select auth.uid()));
$$;
revoke all on function private.org_team_workspace_member(uuid) from public,anon;
grant execute on function private.org_team_workspace_member(uuid) to authenticated,service_role;
drop policy if exists company_user_workspace_select_member on public.company_user_workspace;
create policy company_user_workspace_select_member on public.company_user_workspace for select to authenticated
  using(private.org_team_workspace_member(company_workspace_id));
-- Candidate/Role writes require the server's authority check, including Viewer restrictions.
revoke insert,update,delete on public.company_roles from anon,authenticated;

-- The service role does not receive broad reads of auth.users. This helper
-- exposes only the existing verified internal-account authorization fact.
create function private.org_team_actor_is_internal(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users where id=p_actor and lower(split_part(email,'@',2))='matchharper.com');
$$;
revoke all on function private.org_team_actor_is_internal(uuid) from public,anon,authenticated;
grant execute on function private.org_team_actor_is_internal(uuid) to service_role;

create function private.org_team_role_visible(p_role uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.company_roles r join public.company_user_workspace m
      on m.company_workspace_id=r.company_workspace_id
    where r.role_id=p_role and m.company_user_id=(select auth.uid())
      and (m.authority='owner' or m.access_scope='organization' or (m.team_id is not null and m.team_id=r.team_id))
  );
$$;
revoke all on function private.org_team_role_visible(uuid) from public,anon;
grant execute on function private.org_team_role_visible(uuid) to authenticated,service_role;
create policy company_roles_team_boundary on public.company_roles as restrictive for all to authenticated
  using(private.org_team_role_visible(role_id)) with check(private.org_team_role_visible(role_id));
create policy company_teams_member_select on public.company_workspace_teams for select to authenticated
  using(exists(select 1 from public.company_user_workspace m where m.company_user_id=(select auth.uid())
    and m.company_workspace_id=company_workspace_teams.company_workspace_id
    and (m.authority='owner' or m.access_scope='organization' or m.team_id=company_workspace_teams.id)));

-- Structural tenant boundary for all writers, including trusted background services.
create function public.org_team_tenant_guard_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.team_id is not null and not exists(select 1 from public.company_workspace_teams t
    where t.id=new.team_id and t.company_workspace_id=new.company_workspace_id and t.deleted_at is null) then
    raise exception 'org_team_workspace_mismatch';
  end if;
  if current_user in ('anon','authenticated') and
    (tg_op='INSERT' and new.team_id is not null or tg_op='UPDATE' and new.team_id is distinct from old.team_id) and
    not exists(select 1 from public.company_user_workspace m where m.company_workspace_id=new.company_workspace_id
      and m.company_user_id=(select auth.uid()) and m.authority='owner') then
    raise exception 'org_team_owner_required';
  end if;
  return new;
end; $$;
create trigger company_roles_team_tenant_guard before insert or update on public.company_roles
  for each row execute function public.org_team_tenant_guard_v1();
create trigger company_user_workspace_team_tenant_guard before insert or update on public.company_user_workspace
  for each row execute function public.org_team_tenant_guard_v1();
create trigger company_invitations_team_tenant_guard before insert or update on public.company_workspace_invitations
  for each row execute function public.org_team_tenant_guard_v1();
create trigger company_conversations_team_tenant_guard before insert or update on public.company_conversations
  for each row execute function public.org_team_tenant_guard_v1();
revoke all on function public.org_team_tenant_guard_v1() from public,anon,authenticated;

create function public.manage_company_team_v1(p_workspace uuid,p_actor uuid,p_action text,p_team uuid default null,
  p_name text default null,p_members uuid[] default '{}',p_roles uuid[] default '{}') returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_team uuid:=p_team;
begin
  perform 1 from public.company_workspace where company_workspace_id=p_workspace for update;
  perform 1 from public.company_user_workspace where company_workspace_id=p_workspace
    and company_user_id=p_actor and authority='owner' for share;
  if not found and not private.org_team_actor_is_internal(p_actor) then
    raise exception 'org_team_owner_required';
  end if;
  if p_action='create' then
    insert into public.company_workspace_teams(company_workspace_id,name) values(p_workspace,btrim(p_name)) returning id into v_team;
  elsif not exists(select 1 from public.company_workspace_teams where id=v_team and company_workspace_id=p_workspace and deleted_at is null) then
    raise exception 'org_team_not_found';
  end if;
  if p_action in ('create','update') then
    if exists(select 1 from unnest(p_members) u(id) where not exists(select 1 from public.company_user_workspace m
      where m.company_workspace_id=p_workspace and m.company_user_id=u.id and m.authority<>'owner')) then
      raise exception 'org_team_invalid_member';
    end if;
    if exists(select 1 from unnest(p_roles) u(id) where not exists(select 1 from public.company_roles r
      where r.company_workspace_id=p_workspace and r.role_id=u.id and r.source_type='internal')) then
      raise exception 'org_team_invalid_role';
    end if;
    update public.company_workspace_teams set name=btrim(p_name),updated_at=now() where id=v_team;
    -- Removing the last team never escalates access to the entire organization.
    update public.company_user_workspace set team_id=null,updated_at=now()
      where company_workspace_id=p_workspace and team_id=v_team and not(company_user_id=any(p_members));
    update public.company_user_workspace set team_id=v_team,access_scope='team',updated_at=now()
      where company_workspace_id=p_workspace and company_user_id=any(p_members);
    update public.company_roles set team_id=null,updated_at=now()
      where company_workspace_id=p_workspace and team_id=v_team and not(role_id=any(p_roles));
    update public.company_roles set team_id=v_team,updated_at=now()
      where company_workspace_id=p_workspace and role_id=any(p_roles);
  elsif p_action='delete' then
    if exists(select 1 from public.company_roles where company_workspace_id=p_workspace and team_id=v_team) then
      raise exception 'org_team_has_roles';
    end if;
    -- Keep historical conversation identity; deletion must neither erase nor disclose it.
    update public.company_user_workspace set team_id=null,updated_at=now() where company_workspace_id=p_workspace and team_id=v_team;
    update public.company_workspace_invitations set team_id=null,updated_at=now() where company_workspace_id=p_workspace and team_id=v_team;
    update public.company_workspace_teams set deleted_at=now(),updated_at=now() where id=v_team;
  else raise exception 'org_team_invalid_action';
  end if;
  return v_team;
end; $$;
revoke all on function public.manage_company_team_v1(uuid,uuid,text,uuid,text,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.manage_company_team_v1(uuid,uuid,text,uuid,text,uuid[],uuid[]) to service_role;

create function public.create_company_team_role_v1(p_workspace uuid,p_actor uuid,p_role uuid,p_name text,
  p_information jsonb default '{}') returns uuid language plpgsql security invoker set search_path='' as $$
declare m public.company_user_workspace%rowtype; v_team uuid;
begin
  perform 1 from public.company_workspace where company_workspace_id=p_workspace for update;
  select * into m from public.company_user_workspace where company_workspace_id=p_workspace and company_user_id=p_actor for share;
  if not found then
    if not private.org_team_actor_is_internal(p_actor) then
      raise exception 'org_team_role_forbidden';
    end if;
  elsif m.authority not in ('owner','admin') then raise exception 'org_team_role_forbidden';
  elsif m.authority<>'owner' and m.access_scope='team' then
    if m.team_id is null then raise exception 'org_team_role_forbidden'; end if;
    v_team:=m.team_id;
  end if;
  insert into public.company_roles(role_id,company_workspace_id,team_id,name,source_type,status,is_expired,summary,type,information)
    values(p_role,p_workspace,v_team,p_name,'internal','draft',false,'{}','{}',p_information);
  return p_role;
end; $$;
revoke all on function public.create_company_team_role_v1(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_company_team_role_v1(uuid,uuid,uuid,text,jsonb) to service_role;

create function public.set_company_member_team_v1(p_workspace uuid,p_actor uuid,p_user uuid,p_scope text,p_team uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.company_workspace where company_workspace_id=p_workspace for update;
  perform 1 from public.company_user_workspace where company_workspace_id=p_workspace and company_user_id=p_actor and authority='owner' for share;
  if not found and not private.org_team_actor_is_internal(p_actor) then
    raise exception 'org_team_owner_required';
  end if;
  if p_scope not in ('organization','team') or (p_scope='organization' and p_team is not null) then raise exception 'org_team_invalid_scope'; end if;
  if p_team is not null and not exists(select 1 from public.company_workspace_teams where id=p_team and company_workspace_id=p_workspace and deleted_at is null) then
    raise exception 'org_team_not_found';
  end if;
  if exists(select 1 from public.company_user_workspace where company_workspace_id=p_workspace and company_user_id=p_user and authority='owner')
    and p_scope<>'organization' then raise exception 'org_team_owner_all_access'; end if;
  update public.company_user_workspace set access_scope=p_scope,team_id=p_team,updated_at=now()
    where company_workspace_id=p_workspace and company_user_id=p_user;
  if not found then raise exception 'org_team_invalid_member'; end if;
end; $$;
revoke all on function public.set_company_member_team_v1(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.set_company_member_team_v1(uuid,uuid,uuid,text,uuid) to service_role;

create function public.org_membership_team_authorization_guard_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and
    ((tg_op='UPDATE' and (new.access_scope,new.authority) is distinct from (old.access_scope,old.authority))
      or (tg_op='INSERT' and new.access_scope<>'organization')) and not exists(
      select 1 from public.company_user_workspace m where m.company_workspace_id=new.company_workspace_id
        and m.company_user_id=(select auth.uid()) and m.authority='owner') then
    raise exception 'org_team_owner_required';
  end if;
  return new;
end; $$;
create trigger company_user_workspace_team_authorization_guard before insert or update on public.company_user_workspace
  for each row execute function public.org_membership_team_authorization_guard_v1();
revoke all on function public.org_membership_team_authorization_guard_v1() from public,anon,authenticated;

-- Reuse the canonical contact index, filtering by accessible Role before merging and paging.
create function public.list_company_team_contact_index_v1(p_company_workspace_id uuid,p_actor uuid,
  p_kind text default null,p_talent_id uuid default null,p_role_id uuid default null,p_query text default null,
  p_date_basis text default 'updated',p_after timestamptz default null,p_before timestamptz default null,
  p_offset integer default 0,p_limit integer default 20)
returns table(source_id uuid,kind text,talent_id uuid,talent_name text,talent_email text,role_id uuid,role_name text,
  company_user_id uuid,company_user_name text,company_user_email text,created_at timestamptz,sent_at timestamptz,
  updated_at timestamptz,activity_at timestamptz,workflow_status text,delivery_status text,relay_status text,
  expects_document boolean,expires_at timestamptz,relay_sent_at timestamptz,has_response boolean,
  response_received_at timestamptz,confirmed_start_at timestamptz)
language sql stable security invoker set search_path='' as $$
  with accessible_roles as (
    select r.role_id from public.company_roles r join public.company_user_workspace m
      on m.company_workspace_id=r.company_workspace_id
    where m.company_user_id=p_actor and r.company_workspace_id=p_company_workspace_id
      and (m.authority='owner' or m.access_scope='organization' or (m.team_id is not null and m.team_id=r.team_id))
      and (p_role_id is null or r.role_id=p_role_id)
  ), pages as (
    select generate_series(0,(greatest(p_offset,0)+least(greatest(p_limit,1),101)-1)/101)*101 as page_offset
  ), contacts as (
    select c.* from accessible_roles r cross join pages p cross join lateral public.list_company_contact_index_v2(
      p_company_workspace_id,p_kind,p_talent_id,r.role_id,p_query,p_date_basis,p_after,p_before,p.page_offset,101) c
  )
  select c.* from contacts c order by c.activity_at desc,c.kind,c.source_id desc
    offset greatest(p_offset,0) limit least(greatest(p_limit,1),101);
$$;
revoke all on function public.list_company_team_contact_index_v1(uuid,uuid,text,uuid,uuid,text,text,timestamptz,timestamptz,integer,integer) from public,anon,authenticated;
grant execute on function public.list_company_team_contact_index_v1(uuid,uuid,text,uuid,uuid,text,text,timestamptz,timestamptz,integer,integer) to service_role;

create function public.summarize_company_team_contacts_v1(p_company_workspace_id uuid,p_actor uuid,p_window_start timestamptz,p_as_of timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r record; n integer; page_offset integer:=0; drafts bigint:=0; sent_recent bigint:=0;
  replies_recent bigint:=0; sent_all bigint:=0; replies_all bigint:=0;
begin
  if p_window_start is null or p_as_of is null or p_window_start>p_as_of then raise exception 'invalid_company_contact_summary_window'; end if;
  loop
    n:=0;
    for r in select * from public.list_company_team_contact_index_v1(p_company_workspace_id,p_actor,p_offset=>page_offset,p_limit=>101) loop
      n:=n+1;
      if r.sent_at<=p_as_of then sent_all:=sent_all+1; if r.sent_at>=p_window_start then sent_recent:=sent_recent+1; end if; end if;
      if r.has_response and r.response_received_at<=p_as_of then replies_all:=replies_all+1;
        if r.response_received_at>=p_window_start then replies_recent:=replies_recent+1; end if;
      end if;
      if r.kind='contact' and r.workflow_status='draft' and r.created_at between p_window_start and p_as_of and r.expires_at>p_as_of then drafts:=drafts+1; end if;
    end loop;
    exit when n<101;
    page_offset:=page_offset+101;
  end loop;
  return jsonb_build_object('window_start',p_window_start,'as_of',p_as_of,'recent_active_draft_count',drafts,
    'recent_sent_count',sent_recent,'recent_response_contact_count',replies_recent,'all_sent_count',sent_all,'all_response_contact_count',replies_all);
end; $$;
revoke all on function public.summarize_company_team_contacts_v1(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.summarize_company_team_contacts_v1(uuid,uuid,timestamptz,timestamptz) to service_role;
