-- Narrows reopen_company_intro_on_role_resume_v1 (20261022160000) to proposals
-- this ending closed: closed since the Role last left active, in the Role's
-- current workspace, with no newer proposal for the person, and for a person
-- who is not deleted and has not blocked the company (as the intro request
-- checks). A row that meets an open one at the same moment is skipped instead
-- of failing the Role's status change.
create or replace function public.reopen_company_intro_on_role_resume_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ended_at timestamptz;
  v_intro_id uuid;
begin
  if lower(btrim(coalesce(old.status, ''))) <> 'ended'
    or old.company_workspace_id is distinct from new.company_workspace_id
    or lower(btrim(coalesce(new.source_type, ''))) <> 'internal'
    or lower(btrim(coalesce(new.status, ''))) not in ('active', 'paused', 'top_priority')
    or coalesce(new.is_expired, false)
    or (new.expires_at is not null and new.expires_at <= timezone('utc', now())) then
    return new;
  end if;

  -- When the Role last left active. This trigger runs before
  -- company_roles_track_status_and_enqueue_context_v1 (trigger name order),
  -- so the value is not yet the time of this resume.
  select internal_role.role_status_changed_at into v_ended_at
  from public.company_internal_roles internal_role
  where internal_role.role_id = new.role_id;
  if v_ended_at is null then
    return new;
  end if;

  for v_intro_id in
    select closed.id
    from public.company_intro_candidates closed
    join public.company_workspace workspace
      on workspace.company_workspace_id = new.company_workspace_id
    join public.talent_users talent
      on talent.user_id = closed.talent_id and talent.deleted_at is null
    left join public.talent_setting setting on setting.user_id = closed.talent_id
    where closed.role_id = new.role_id
      and closed.company_workspace_id = new.company_workspace_id
      and closed.status = 'closed'
      and closed.close_reason = 'role_closed'
      and closed.updated_at >= v_ended_at
      and closed.candidate_sent_at is null
      and closed.requested_at is null
      and closed.talent_decision_at is null
      and closed.recommendation_id is null
      and public.company_intro_role_allows_talent_v1(new.information, closed.talent_id)
      and not exists (
        select 1 from public.company_intro_candidates newer
        where newer.role_id = closed.role_id
          and newer.talent_id = closed.talent_id
          and newer.id <> closed.id
          and (newer.created_at, newer.id) > (closed.created_at, closed.id)
      )
      and not exists (
        select 1
        from unnest(coalesce(setting.blocked_companies, '{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (
          lower(btrim(workspace.company_name)),
          lower(btrim(coalesce(workspace.published_name, '')))
        )
      )
  loop
    begin
      update public.company_intro_candidates
      set status = 'ready', close_reason = null,
          revision = revision + 1, updated_at = timezone('utc', now())
      where id = v_intro_id;
    exception when unique_violation then
      null;
    end;
  end loop;
  return new;
end;
$$;

revoke all on function public.reopen_company_intro_on_role_resume_v1() from public, anon, authenticated;
