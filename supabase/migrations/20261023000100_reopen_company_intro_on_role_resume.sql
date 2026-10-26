-- Ending a Role closes its open proposals (close_company_intro_on_role_change_v1,
-- close_reason 'role_closed'). Turning an ended Role back on reopens the ones
-- the candidate never saw: not sent, not requested, no decision and no
-- recommendation. Closing behaviour is unchanged.
create or replace function public.reopen_company_intro_on_role_resume_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if lower(btrim(coalesce(old.status, ''))) <> 'ended'
    or old.company_workspace_id is distinct from new.company_workspace_id
    or lower(btrim(coalesce(new.source_type, ''))) <> 'internal'
    or lower(btrim(coalesce(new.status, ''))) not in ('active', 'paused', 'top_priority')
    or coalesce(new.is_expired, false)
    or (new.expires_at is not null and new.expires_at <= timezone('utc', now())) then
    return new;
  end if;

  update public.company_intro_candidates intro
  set status = 'ready', close_reason = null,
      revision = intro.revision + 1, updated_at = timezone('utc', now())
  from (
    select distinct on (closed.talent_id) closed.id
    from public.company_intro_candidates closed
    where closed.role_id = new.role_id
      and closed.status = 'closed'
      and closed.close_reason = 'role_closed'
      and closed.candidate_sent_at is null
      and closed.requested_at is null
      and closed.talent_decision_at is null
      and closed.recommendation_id is null
      and public.company_intro_role_allows_talent_v1(new.information, closed.talent_id)
      and not exists (
        select 1 from public.company_intro_candidates open
        where open.role_id = closed.role_id
          and open.talent_id = closed.talent_id
          and open.status in ('ready', 'awaiting_talent', 'connecting')
      )
    order by closed.talent_id, closed.updated_at desc, closed.id
  ) latest
  where intro.id = latest.id;
  return new;
end;
$$;

revoke all on function public.reopen_company_intro_on_role_resume_v1() from public, anon, authenticated;

drop trigger if exists company_role_reopen_company_intro_on_resume on public.company_roles;
create trigger company_role_reopen_company_intro_on_resume
after update of status on public.company_roles
for each row
when (old.status is distinct from new.status)
execute function public.reopen_company_intro_on_role_resume_v1();
