set local lock_timeout = '5s';

-- A company's request to meet an outside person takes one connection right away (web), so everyone
-- invited can still be introduced. When the request can no longer end in an introduction the
-- connection goes back. This sweep is the one place that decides that; it runs with the invitation cron.
alter table public.company_workspace_credit_events
  add column if not exists returned_at timestamptz;

create index if not exists company_workspace_credit_events_external_hold_idx
  on public.company_workspace_credit_events(created_at)
  where action_code = 'intro_request' and delta = -1 and business_key like 'external:%';

create or replace function public.return_closed_external_intro_holds_v1(p_link_valid interval, p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v record;
  v_now timestamptz := clock_timestamp();
  v_period public.company_workspace_credit_periods%rowtype;
  v_target uuid;
  v_returned integer := 0;
begin
  for v in
    select e.id, e.company_workspace_id, e.period_id, r.id as request_id, r.status as request_status
    from public.company_workspace_credit_events e
    left join public.external_intro_requests r
      on r.company_workspace_id = e.company_workspace_id and r.external_candidate_id::text = substr(e.business_key, 10)
    left join public.external_candidates c on c.id = r.external_candidate_id
    where e.action_code = 'intro_request' and e.delta = -1 and e.business_key like 'external:%'
      and (
        -- The request was never saved after its connection was taken.
        (r.id is null and e.created_at < v_now - interval '1 hour')
        or r.status in ('not_sendable', 'failed', 'bounced', 'unsubscribed', 'declined', 'cancelled')
        or (c.company_decision = 'passed' and r.status not in ('accepted', 'connecting', 'connected'))
        -- Its connect link has closed: the person can no longer confirm.
        or (r.status in ('invited', 'replied') and r.invited_at < v_now - p_link_valid)
        or (r.status = 'requested' and r.created_at < v_now - p_link_valid)
      )
    order by e.company_workspace_id, e.created_at
    limit p_limit
  loop
    perform pg_advisory_xact_lock(hashtextextended('workspace-billing:' || v.company_workspace_id::text, 0));
    update public.company_workspace_credit_events set delta = 0, returned_at = v_now
      where id = v.id and delta = -1;
    if not found then continue; end if;

    -- Back into the same pool: this month's if it is still open, otherwise the pool's current month.
    -- A Slot that has ended has no pool left to return to.
    select * into v_period from public.company_workspace_credit_periods where id = v.period_id;
    v_target := null;
    if v_period.ends_at > v_now then
      v_target := v_period.id;
    elsif v_period.slot_id is not null then
      select p.id into v_target from public.company_workspace_credit_periods p
        where p.slot_id = v_period.slot_id and p.starts_at <= v_now and p.ends_at > v_now and p.confirmed_at <= v_now
        order by p.ends_at, p.starts_at, p.id limit 1;
    elsif exists (select 1 from public.company_workspace w where w.company_workspace_id = v.company_workspace_id
      and w.billing_started_at is not null and w.billing_model = 'standard') then
      v_target := public.workspace_billing_free_period_v1(v.company_workspace_id, v_now);
    end if;
    if v_target is not null then
      update public.company_workspace_credit_periods set remaining = least(allowance, remaining + 1) where id = v_target;
    end if;

    -- An invitation that never went out must not go out later without its connection.
    if v.request_status = 'requested' then
      update public.external_intro_requests set status = 'not_sendable', error_code = 'request_expired', updated_at = v_now
        where id = v.request_id and status = 'requested';
    end if;
    v_returned := v_returned + 1;
  end loop;
  return v_returned;
end;
$function$;

revoke all on function public.return_closed_external_intro_holds_v1(interval, integer) from public, anon, authenticated;
grant execute on function public.return_closed_external_intro_holds_v1(interval, integer) to service_role;
