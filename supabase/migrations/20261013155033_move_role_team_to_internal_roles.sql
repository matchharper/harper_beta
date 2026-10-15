-- Role ownership belongs to the internal-role extension, not collected external jobs.
-- Keep existing assignments, membership/conversation scope and Hiring Briefs unchanged.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.company_roles, public.company_internal_roles in access exclusive mode;

do $$ begin
  if exists(select 1 from public.company_roles r left join public.company_internal_roles i using(role_id)
    where r.team_id is not null and (r.source_type <> 'internal' or i.role_id is null)) then
    raise exception 'org_team_assignment_missing_internal_role';
  end if;
end $$;

alter table public.company_internal_roles
  add column team_id uuid references public.company_workspace_teams(id) on delete restrict;
create index company_internal_roles_team_idx on public.company_internal_roles(team_id,role_id);
update public.company_internal_roles i set team_id=r.team_id
  from public.company_roles r where r.role_id=i.role_id and r.team_id is not null;

do $$ begin
  if exists(select 1 from public.company_roles r left join public.company_internal_roles i using(role_id)
    where r.team_id is distinct from i.team_id) then
    raise exception 'org_team_assignment_copy_mismatch';
  end if;
end $$;

-- The extension has no workspace column: validate against the locked parent.
create function public.org_internal_role_team_guard_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_workspace uuid; v_source text;
begin
  select company_workspace_id,source_type into v_workspace,v_source
    from public.company_roles where role_id=new.role_id for update;
  if new.team_id is not null and (not found or v_source <> 'internal' or not exists(
    select 1 from public.company_workspace_teams t
      where t.id=new.team_id and t.company_workspace_id=v_workspace and t.deleted_at is null
  )) then raise exception 'org_team_workspace_mismatch'; end if;
  if current_user in ('anon','authenticated') and
    ((tg_op='INSERT' and new.team_id is not null) or (tg_op='UPDATE' and new.team_id is distinct from old.team_id)) and not exists(
      select 1 from public.company_user_workspace m where m.company_workspace_id=v_workspace
        and m.company_user_id=(select auth.uid()) and m.authority='owner'
    ) then raise exception 'org_team_owner_required'; end if;
  return new;
end; $$;
revoke all on function public.org_internal_role_team_guard_v1() from public,anon,authenticated;
create trigger company_internal_roles_team_tenant_guard before insert or update of team_id,role_id
  on public.company_internal_roles for each row execute function public.org_internal_role_team_guard_v1();

-- Parent workspace/source changes must not strand an assigned internal Role.
create function public.org_role_team_parent_guard_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.company_internal_roles i join public.company_workspace_teams t on t.id=i.team_id
    where i.role_id=old.role_id and (new.source_type<>'internal'
      or t.company_workspace_id<>new.company_workspace_id or t.deleted_at is not null)) then
    raise exception 'org_team_workspace_mismatch';
  end if;
  return new;
end; $$;
revoke all on function public.org_role_team_parent_guard_v1() from public,anon,authenticated;
drop trigger company_roles_team_tenant_guard on public.company_roles;
create trigger company_roles_team_parent_guard before update of company_workspace_id,source_type
  on public.company_roles for each row execute function public.org_role_team_parent_guard_v1();
create or replace function private.org_team_role_visible(p_role uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.company_roles r left join public.company_internal_roles i on i.role_id=r.role_id
      join public.company_user_workspace m
      on m.company_workspace_id=r.company_workspace_id
    where r.role_id=p_role and m.company_user_id=(select auth.uid())
      and (m.authority='owner' or m.access_scope='organization' or exists(select 1 from public.company_workspace_team_members tm where tm.membership_id=m.id and tm.team_id=i.team_id))
  );
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
    if exists(select 1 from unnest(p_roles) u(id) where not exists(select 1 from public.company_roles r join public.company_internal_roles i on i.role_id=r.role_id
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
    update public.company_internal_roles i set team_id=null,updated_at=now()
      from public.company_roles r where r.role_id=i.role_id and r.company_workspace_id=p_workspace
        and i.team_id=v_team and not(i.role_id=any(p_roles));
    update public.company_internal_roles i set team_id=v_team,updated_at=now()
      from public.company_roles r where r.role_id=i.role_id and r.company_workspace_id=p_workspace
        and i.role_id=any(p_roles);
  elsif p_action='delete' then
    if exists(select 1 from public.company_internal_roles i join public.company_roles r on r.role_id=i.role_id
      where r.company_workspace_id=p_workspace and i.team_id=v_team) then
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

create or replace function public.create_company_team_role_v1(p_workspace uuid,p_actor uuid,p_role uuid,p_name text,
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
  insert into public.company_roles(role_id,company_workspace_id,name,source_type,status,is_expired,summary,type,information)
    values(p_role,p_workspace,p_name,'internal','draft',false,'{}','{}',p_information);
  -- Parent INSERT may already create the extension through the legacy Brief trigger.
  -- Update only the assignment; never overwrite request, criteria or other settings.
  insert into public.company_internal_roles(role_id,team_id) values(p_role,v_team)
    on conflict(role_id) do update set team_id=excluded.team_id;
  return p_role;
end; $$;

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
    select r.role_id from public.company_roles r left join public.company_internal_roles i on i.role_id=r.role_id
      join public.company_user_workspace m
      on m.company_workspace_id=r.company_workspace_id
    where m.company_user_id=p_actor and r.company_workspace_id=p_company_workspace_id
      and (m.authority='owner' or m.access_scope='organization' or exists(select 1 from public.company_workspace_team_members tm where tm.membership_id=m.id and tm.team_id=i.team_id))
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
-- Existing function ACLs are retained by CREATE OR REPLACE.
alter table public.company_roles drop column team_id;
notify pgrst, 'reload schema';
