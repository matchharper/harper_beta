begin;

-- Service-only entry point for authenticated internal controls. Uses the same
-- enqueue lock as the scheduler/company request RPC to prevent duplicate clicks.
create or replace function public.enqueue_talent_first_search_v1(
  p_company_workspace_id uuid, p_role_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_run public.company_first_search_runs; v_now timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'company_matching_enqueue:' || p_company_workspace_id::text, 0));
  if not exists (
    select 1 from public.company_roles r
    join public.company_internal_roles i on i.role_id=r.role_id
    where r.role_id=p_role_id and r.company_workspace_id=p_company_workspace_id
      and lower(btrim(coalesce(r.source_type,'')))='internal'
      and lower(btrim(coalesce(r.status,'')))='active'
      and not coalesce(r.is_expired,false)
      and (r.expires_at is null or r.expires_at>v_now)
      and coalesce(lower(btrim(r.information->>'testOnly')),'') not in ('true','1','yes','on')
      and nullif(btrim(i.request),'') is not null
      and public.role_matching_slot_type_v1(r.role_id,v_now)='paid'
  ) then
    return jsonb_build_object('status','not_queued','reason','role_unavailable');
  end if;
  select * into v_run from public.company_first_search_runs r
    where r.company_workspace_id=p_company_workspace_id
      and r.status in ('queued','running')
      and (r.role_id=p_role_id or p_role_id=any(r.scheduled_role_ids)
           or p_role_id=any(r.requested_role_ids))
    order by r.created_at desc, r.id desc limit 1;
  if found then
    return jsonb_build_object('status',v_run.status,'runId',v_run.id);
  end if;
  insert into public.company_first_search_runs (
    company_workspace_id,role_id,scheduled_slot,trigger_reason,contract_version,
    status,available_at,scheduled_role_ids
  ) values (p_company_workspace_id,p_role_id,v_now,'talent_first_requested',
    'unified_role_matching_v6','queued',v_now,array[p_role_id]) returning * into v_run;
  return jsonb_build_object('status',v_run.status,'runId',v_run.id);
end $$;
revoke all on function public.enqueue_talent_first_search_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_talent_first_search_v1(uuid,uuid) to service_role;

-- A company-first request must not convert a queued talent-only request into a
-- different direction. Preserve the deployed RPC's remaining guards verbatim.
do $$
declare definition text; revised text;
begin
  select pg_get_functiondef('public.enqueue_company_matching_search_v1(uuid,uuid,uuid)'::regprocedure) into definition;
  revised := replace(definition, 'and run.status = ''queued''', E'and run.status = ''queued''\n    and run.trigger_reason <> ''talent_first_requested''' );
  if revised = definition then raise exception 'company_search_queue_guard_not_found'; end if;
  execute revised;
end $$;

create or replace function public.guard_talent_first_matching_selection_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_run public.company_first_search_runs;
begin
  if new.decision not in ('candidate_first','both') then return new; end if;
  if public.role_matching_slot_type_v1(new.opportunity_id,clock_timestamp()) <> 'paid' then
    raise exception 'talent_first_paid_slot_required';
  end if;
  if new.run_id is not null then
    select * into v_run from public.company_first_search_runs where id=new.run_id;
    if v_run.id is null or v_run.trigger_reason='company_requested' then
      raise exception 'talent_first_role_run_schedule_required';
    end if;
    if v_run.trigger_reason='talent_first_requested' then
      if v_run.role_id is distinct from new.opportunity_id or new.decision='both' then
        raise exception 'talent_first_requested_role_required';
      end if;
    elsif extract(isodow from clock_timestamp() at time zone 'Asia/Seoul') not in (1,3,5)
       or extract(isodow from v_run.scheduled_slot at time zone 'Asia/Seoul') not in (1,3,5)
       or (v_run.scheduled_slot at time zone 'Asia/Seoul')::date
          <> (clock_timestamp() at time zone 'Asia/Seoul')::date then
      raise exception 'talent_first_role_run_schedule_required';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_talent_first_matching_selection_v1() from public,anon,authenticated;
commit;
