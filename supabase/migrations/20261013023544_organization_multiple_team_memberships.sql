-- A membership may belong to several Teams. team_id remains the default for new Roles.
create table public.company_workspace_team_members (
  membership_id uuid not null references public.company_user_workspace(id) on delete cascade,
  team_id uuid not null references public.company_workspace_teams(id) on delete cascade,
  primary key (membership_id,team_id)
);
create index company_workspace_team_members_team_idx on public.company_workspace_team_members(team_id,membership_id);
alter table public.company_workspace_team_members enable row level security;
revoke all on public.company_workspace_team_members from public,anon,authenticated;
grant select on public.company_workspace_team_members to authenticated;
grant all on public.company_workspace_team_members to service_role;
create policy company_team_members_select on public.company_workspace_team_members for select to authenticated
  using(exists(select 1 from public.company_user_workspace m where m.id=membership_id
    and private.org_team_workspace_member(m.company_workspace_id)));
insert into public.company_workspace_team_members(membership_id,team_id)
  select id,team_id from public.company_user_workspace where access_scope='team' and authority<>'owner' and team_id is not null;

create function public.org_team_member_tenant_guard_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.company_user_workspace m join public.company_workspace_teams t
    on t.company_workspace_id=m.company_workspace_id where m.id=new.membership_id and t.id=new.team_id
    and t.deleted_at is null and m.authority<>'owner' and m.access_scope='team') then
    raise exception 'org_team_invalid_member';
  end if;
  return new;
end; $$;
revoke all on function public.org_team_member_tenant_guard_v1() from public,anon,authenticated;
create trigger company_team_member_tenant_guard before insert or update on public.company_workspace_team_members
  for each row execute function public.org_team_member_tenant_guard_v1();

-- Preserve invitation acceptance and legacy single-Team writes. Organization/Owner clears every assignment.
create function public.org_team_member_sync_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.access_scope='organization' or new.authority='owner' then
    delete from public.company_workspace_team_members where membership_id=new.id;
  elsif new.team_id is not null then
    insert into public.company_workspace_team_members(membership_id,team_id) values(new.id,new.team_id) on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function public.org_team_member_sync_v1() from public,anon,authenticated;
create trigger company_team_member_sync after insert or update of team_id,access_scope,authority on public.company_user_workspace
  for each row execute function public.org_team_member_sync_v1();

create or replace function private.org_team_role_visible(p_role uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.company_roles r join public.company_user_workspace m
      on m.company_workspace_id=r.company_workspace_id
    where r.role_id=p_role and m.company_user_id=(select auth.uid())
      and (m.authority='owner' or m.access_scope='organization' or exists(select 1 from public.company_workspace_team_members tm where tm.membership_id=m.id and tm.team_id=r.team_id))
  );
$$;
drop policy company_teams_member_select on public.company_workspace_teams;
create policy company_teams_member_select on public.company_workspace_teams for select to authenticated
  using(exists(select 1 from public.company_user_workspace m where m.company_user_id=(select auth.uid())
    and m.company_workspace_id=company_workspace_teams.company_workspace_id
    and (m.authority='owner' or m.access_scope='organization' or exists(select 1 from public.company_workspace_team_members tm
      where tm.membership_id=m.id and tm.team_id=company_workspace_teams.id))));

create function public.set_company_member_teams_v2(p_workspace uuid,p_actor uuid,p_user uuid,p_scope text,p_teams uuid[] default '{}')
returns void language plpgsql security invoker set search_path='' as $$
declare m public.company_user_workspace%rowtype;
begin
  perform 1 from public.company_workspace where company_workspace_id=p_workspace for update;
  perform 1 from public.company_user_workspace where company_workspace_id=p_workspace and company_user_id=p_actor and authority='owner' for share;
  if not found and not private.org_team_actor_is_internal(p_actor) then raise exception 'org_team_owner_required'; end if;
  if p_scope not in ('organization','team') or p_teams is null or (p_scope='organization' and cardinality(p_teams)>0)
    or exists(select 1 from unnest(p_teams) x where x is null) then raise exception 'org_team_invalid_scope'; end if;
  if exists(select 1 from unnest(p_teams) x where not exists(select 1 from public.company_workspace_teams t
    where t.id=x and t.company_workspace_id=p_workspace and t.deleted_at is null)) then raise exception 'org_team_not_found'; end if;
  select * into m from public.company_user_workspace where company_workspace_id=p_workspace and company_user_id=p_user for update;
  if not found then raise exception 'org_team_invalid_member'; end if;
  if m.authority='owner' and p_scope<>'organization' then raise exception 'org_team_owner_all_access'; end if;
  delete from public.company_workspace_team_members where membership_id=m.id and not(team_id=any(p_teams));
  update public.company_user_workspace set access_scope=p_scope,
    team_id=case when team_id=any(p_teams) then team_id else p_teams[1] end,updated_at=now() where id=m.id;
  insert into public.company_workspace_team_members(membership_id,team_id) select m.id,x from unnest(p_teams) x on conflict do nothing;
end; $$;
revoke all on function public.set_company_member_teams_v2(uuid,uuid,uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.set_company_member_teams_v2(uuid,uuid,uuid,text,uuid[]) to service_role;
create or replace function public.set_company_member_team_v1(p_workspace uuid,p_actor uuid,p_user uuid,p_scope text,p_team uuid default null)
returns void language sql security invoker set search_path='' as $$
  select public.set_company_member_teams_v2(p_workspace,p_actor,p_user,p_scope,case when p_team is null then '{}'::uuid[] else array[p_team] end);
$$;
create or replace function public.manage_company_team_v1(p_workspace uuid,p_actor uuid,p_action text,p_team uuid default null,
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
    delete from public.company_workspace_team_members tm using public.company_user_workspace m
      where tm.membership_id=m.id and m.company_workspace_id=p_workspace and tm.team_id=v_team and not(m.company_user_id=any(p_members));
    -- Keep other Team memberships and the existing default; only the final removal becomes pending.
    update public.company_user_workspace m set team_id=(select tm.team_id from public.company_workspace_team_members tm
      where tm.membership_id=m.id order by tm.team_id limit 1),updated_at=now()
      where m.company_workspace_id=p_workspace and m.team_id=v_team and not(m.company_user_id=any(p_members));
    update public.company_user_workspace set team_id=coalesce(team_id,v_team),access_scope='team',updated_at=now()
      where company_workspace_id=p_workspace and company_user_id=any(p_members);
    insert into public.company_workspace_team_members(membership_id,team_id)
      select id,v_team from public.company_user_workspace where company_workspace_id=p_workspace and company_user_id=any(p_members) on conflict do nothing;
    update public.company_roles set team_id=null,updated_at=now()
      where company_workspace_id=p_workspace and team_id=v_team and not(role_id=any(p_roles));
    update public.company_roles set team_id=v_team,updated_at=now()
      where company_workspace_id=p_workspace and role_id=any(p_roles);
  elsif p_action='delete' then
    if exists(select 1 from public.company_roles where company_workspace_id=p_workspace and team_id=v_team) then
      raise exception 'org_team_has_roles';
    end if;
    -- Keep historical conversation identity; deletion must neither erase nor disclose it.
    delete from public.company_workspace_team_members where team_id=v_team;
    update public.company_user_workspace m set team_id=(select tm.team_id from public.company_workspace_team_members tm
      where tm.membership_id=m.id order by tm.team_id limit 1),updated_at=now()
      where m.company_workspace_id=p_workspace and m.team_id=v_team;
    update public.company_workspace_invitations set team_id=null,updated_at=now() where company_workspace_id=p_workspace and team_id=v_team;
    update public.company_workspace_teams set deleted_at=now(),updated_at=now() where id=v_team;
  else raise exception 'org_team_invalid_action';
  end if;
  return v_team;
end; $$;
revoke all on function public.manage_company_team_v1(uuid,uuid,text,uuid,text,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.manage_company_team_v1(uuid,uuid,text,uuid,text,uuid[],uuid[]) to service_role;

create or replace function public.list_company_team_contact_index_v1(p_company_workspace_id uuid,p_actor uuid,
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
      and (m.authority='owner' or m.access_scope='organization' or exists(select 1 from public.company_workspace_team_members tm where tm.membership_id=m.id and tm.team_id=r.team_id))
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


-- General chat can include every visible Team. Never reuse it for a narrower audience.
alter table public.company_conversations add column team_scope uuid[] not null default '{}';
update public.company_conversations set team_scope=array[team_id] where role_id is null and team_id is not null;
drop index public.company_conversations_workspace_scope_uidx;
drop index public.company_conversations_team_scope_uidx;
create unique index company_conversations_access_scope_uidx on public.company_conversations(company_workspace_id,team_scope) where role_id is null;
notify pgrst, 'reload schema';
