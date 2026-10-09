begin;
create or replace view public.talent_role_fit_with_selection_v1 with(security_invoker=true) as
  select fit.*, public.talent_internal_role_is_candidate_visible_v1(fit) as candidate_visible
  from public.talent_opportunity_fit fit;
revoke all on public.talent_role_fit_with_selection_v1 from public,anon,authenticated;
grant select on public.talent_role_fit_with_selection_v1 to service_role;

drop index if exists public.talent_progress_candidate_requested_connection_uidx;
create unique index talent_progress_candidate_requested_connection_uidx
  on public.talent_progress(talent_id,role_id)
  where kind='candidate_requested_connection' and metadata->>'withdrawnAt' is null;

-- Asking Harper to review is not acceptance and must not close an existing
-- company proposal. The exact requested pair is handled outside periodic cadence.
create or replace function public.route_candidate_priority_request_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.kind<>'candidate_requested_connection' then return new; end if;
  if not exists(select 1 from public.talent_setting where user_id=new.talent_id and is_onboarding_done=true)
    then raise exception 'onboarding_required' using errcode='22023'; end if;
  if not exists(select 1 from public.company_roles where role_id=new.role_id and source_type='internal'
      and status in ('active','paused') and not coalesce(is_expired,false)
      and (expires_at is null or expires_at>now())
      and coalesce(lower(information->>'testOnly'),'') not in ('true','1','yes','on'))
    then raise exception 'internal_role_unavailable' using errcode='22023'; end if;
  new.open_to_talent:=true; new.open_to_company:=false;
  return new;
end $$;

create or replace function public.queue_candidate_priority_review_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.kind<>'candidate_requested_connection' or new.metadata->>'withdrawnAt' is not null then return null; end if;
  if exists(select 1 from public.talent_opportunity_recommendation where talent_id=new.talent_id and role_id=new.role_id) then return null; end if;
  insert into public.opportunity_discovery_run(talent_id,trigger,run_mode,target_recommendation_count,trigger_payload,dedupe_key)
    values(new.talent_id,'priority_review_requested','refresh',3,
      jsonb_build_object('roleId',new.role_id,'priorityRequestId',new.id),
      'priority-review:'||new.id::text) on conflict do nothing;
  return null;
end $$;
revoke all on function public.queue_candidate_priority_review_v1() from public,anon,authenticated;
create trigger queue_candidate_priority_review after insert on public.talent_progress
  for each row when(new.kind='candidate_requested_connection') execute function public.queue_candidate_priority_review_v1();

create or replace function public.withdraw_candidate_priority_review_v1(p_talent_id uuid,p_role_id uuid,p_source jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer; v_request_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id::text,0));
  with withdrawn as (
    update public.talent_progress set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('withdrawnAt',now(),'withdrawalSource',p_source)
      where talent_id=p_talent_id and role_id=p_role_id and kind='candidate_requested_connection' and metadata->>'withdrawnAt' is null
      returning id
  ) select count(*)::integer,array_agg(id) into v_count,v_request_ids from withdrawn;
  -- Stop only unpublished candidate proposals created by these exact requests.
  -- Independently selected opportunities and already delivered records stay intact.
  update public.talent_opportunity_matching_review
    set closed_at=now(),close_reason='priority_request_withdrawn'
    where talent_id=p_talent_id and opportunity_id=p_role_id
      and priority_request_id=any(v_request_ids) and recommendation_id is null and closed_at is null
      and decision='candidate_first';
  return jsonb_build_object('withdrawn',v_count>0,'withdrawnAt',now());
end $$;
revoke all on function public.withdraw_candidate_priority_review_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.withdraw_candidate_priority_review_v1(uuid,uuid,jsonb) to service_role;
create or replace function public.guard_candidate_first_against_company_intro_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  select role.company_workspace_id
  into v_workspace_id
  from public.company_roles role
  where role.role_id = new.role_id
    and lower(btrim(coalesce(role.source_type, ''))) = 'internal';

  if v_workspace_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'company_talent_route:' || v_workspace_id::text || ':' || new.talent_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.company_intro_candidates intro
    where intro.company_workspace_id = v_workspace_id
      and intro.role_id = new.role_id
      and intro.talent_id = new.talent_id
      and (intro.status='connecting' or (intro.status='ready' and not exists (
        select 1 from public.talent_opportunity_matching_review selected
        join public.talent_opportunity_fit fit on fit.talent_id=selected.talent_id and fit.opportunity_id=selected.opportunity_id
        where selected.talent_id=new.talent_id and selected.opportunity_id=new.role_id
          and selected.decision in ('candidate_first','both') and selected.closed_at is null
          and selected.input_fingerprint=fit.input_fingerprint and fit.expires_at>now()
      )))
  ) then
    raise exception using
      errcode = '23505',
      message = 'active company-first route already exists for this Role and Talent';
  end if;

  if exists (
    select 1
    from public.company_intro_candidates intro
    where intro.company_workspace_id = v_workspace_id
      and intro.role_id = new.role_id
      and intro.talent_id = new.talent_id
      and intro.status = 'awaiting_talent'
      and not (
        intro.role_id = new.role_id
        and intro.recommendation_id is null
        and intro.requested_at is not null
        and cardinality(intro.intro_recipient_emails) > 0
        and new.opportunity_type = 'intro_request'
        and new.discovery_run_id = intro.delivery_run_id
      )
  ) then
    raise exception using
      errcode = '23505',
      message = 'another company-first route already exists for this Role and Talent';
  end if;

  return new;
end;
$$;

commit;
