-- Preserve test-only matching isolation while exercising actual profile spending.
create or replace function public.workspace_open_candidate_v1(p_workspace uuid,p_role uuid,p_talent uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_information jsonb; v_test_only boolean; v_period uuid; v_opened boolean; v_paid boolean; v_now timestamptz; v_key text:=p_role::text||':'||p_talent::text;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  v_now:=clock_timestamp();
  if not exists(select 1 from public.company_roles where role_id=p_role and company_workspace_id=p_workspace)
    or not exists(select 1 from public.talent_users where user_id=p_talent and deleted_at is null) then
    raise exception 'billing_role_mismatch';
  end if;
  if not exists(select 1 from public.company_intro_candidates where company_workspace_id=p_workspace and role_id=p_role and talent_id=p_talent)
    and not exists(select 1 from public.talent_opportunity_recommendation where role_id=p_role and talent_id=p_talent) then
    raise exception 'billing_candidate_not_found';
  end if;
  select information into v_information from public.company_roles where role_id=p_role;
  v_test_only:=coalesce(lower(btrim(v_information->>'testOnly')), '') in ('true','1','yes','on');
  if not public.company_intro_role_allows_talent_v1(v_information,p_talent) then
    raise exception 'billing_candidate_not_found';
  end if;
  v_paid:=public.role_matching_slot_type_v1(p_role,v_now)='paid';
  v_opened:=exists(select 1 from public.talent_opportunity_fit where opportunity_id=p_role and talent_id=p_talent and is_opened)
    or exists(select 1 from public.company_workspace_credit_events where company_workspace_id=p_workspace
      and role_id=p_role and talent_id=p_talent and action_code in ('candidate_view','intro_request','connect'))
    or exists(select 1 from public.company_intro_candidates where company_workspace_id=p_workspace and role_id=p_role and talent_id=p_talent and requested_at is not null);
  if not v_opened then
    if not v_paid then
      v_period:=public.workspace_billing_free_period_v1(p_workspace,v_now);
      update public.company_workspace_credit_periods set remaining=remaining-1 where id=v_period and remaining>0;
      if not found then raise exception 'workspace_views_exhausted'; end if;
    end if;
    insert into public.company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,role_id,talent_id,actor_id,delta,completed_at)
      values(p_workspace,v_period,'candidate_view',v_key,p_role,p_talent,p_actor,case when v_period is null then 0 else -1 end,v_now);
  end if;
  -- Test-only Roles must never enter matching fits. Their existing usage
  -- receipt is the durable opening fact read by workspace_candidate_access_v1.
  if not v_test_only then
    insert into public.talent_opportunity_fit(talent_id,opportunity_id,is_opened)
      values(p_talent,p_role,true) on conflict(talent_id,opportunity_id) do update set is_opened=true;
  end if;
  return public.workspace_candidate_access_v1(p_workspace)||jsonb_build_object('alreadyOpened',v_opened,'charged',not v_opened and not v_paid);
end; $$;
revoke all on function public.workspace_candidate_access_v1(uuid) from public,anon,authenticated;
revoke all on function public.workspace_open_candidate_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.workspace_candidate_access_v1(uuid) to service_role;
grant execute on function public.workspace_open_candidate_v1(uuid,uuid,uuid,uuid) to service_role;

notify pgrst, 'reload schema';
