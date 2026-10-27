begin;

-- Browser clients must not bypass the owner/billing checks or ordered cleanup.
revoke delete on public.company_workspace from public, anon, authenticated;

-- The narrow service-only function needs DELETE on billing ledgers, which
-- deliberately do not grant direct DELETE to the API service role.
create function public.delete_company_workspace_v1(
  p_workspace uuid,
  p_actor uuid,
  p_confirmation_name text,
  p_stripe_customer text,
  p_billing_checkout jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  w public.company_workspace%rowtype;
  v_authority text;
begin
  -- Share the billing lock so checkout/slot changes cannot pass the checks
  -- and then commit into a deleted workspace.
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:' || p_workspace::text, 0));
  select * into w from public.company_workspace
    where company_workspace_id = p_workspace for update;
  if not found then raise exception 'workspace_delete_not_found'; end if;

  select authority into v_authority from public.company_user_workspace
    where company_workspace_id = p_workspace and company_user_id = p_actor for update;
  if v_authority is distinct from 'owner' then raise exception 'workspace_delete_owner_required'; end if;
  if p_confirmation_name is null or btrim(p_confirmation_name) = '' or
      btrim(p_confirmation_name) <> btrim(w.company_name) then
    raise exception 'workspace_delete_name_mismatch';
  end if;
  -- Stripe was checked by the authenticated route. Reject if its input snapshot
  -- changed while that request was in flight; a retry will verify it again.
  if w.stripe_customer_id is distinct from p_stripe_customer or
      w.billing_checkout is distinct from p_billing_checkout then
    raise exception 'workspace_delete_billing_changed';
  end if;
  if exists (select 1 from public.company_workspace_slots
    where company_workspace_id = p_workspace and stripe_subscription_id is not null
      and status not in ('canceled', 'incomplete_expired')) then
    raise exception 'workspace_delete_subscription_active';
  end if;
  if exists (select 1 from public.company_workspace_slots
    where company_workspace_id = p_workspace and billing_change is not null) then
    raise exception 'workspace_delete_billing_pending';
  end if;

  -- Lock the indirect delivery parents too. New queued deliveries must not
  -- slip in after cleanup and survive through their ON DELETE SET NULL edges.
  perform 1 from public.company_roles where company_workspace_id = p_workspace for update;
  perform 1 from public.talent_opportunity_recommendation r
    join public.company_roles role on role.role_id = r.role_id
    where role.company_workspace_id = p_workspace for update of r;
  perform 1 from public.company_talent_requests where company_workspace_id = p_workspace for update;
  perform 1 from public.company_talent_relays relay
    where relay.company_talent_request_id in (select id from public.company_talent_requests where company_workspace_id = p_workspace) or
      relay.recommendation_id in (select r.id from public.talent_opportunity_recommendation r
        join public.company_roles role on role.role_id = r.role_id where role.company_workspace_id = p_workspace)
    for update;

  -- Remove dependents with RESTRICT/NO ACTION edges before their parents.
  -- Other workspace-owned rows use the existing ON DELETE CASCADE relations.
  delete from public.company_first_slack_outbox where company_workspace_id = p_workspace;
  delete from public.company_role_hiring_brief_history where company_workspace_id = p_workspace;
  delete from public.company_intro_candidates where company_workspace_id = p_workspace;
  delete from public.meeting_schedules where company_workspace_id = p_workspace;
  -- These deliveries also have SET NULL references: do not leave queued work
  -- that could still send after its workspace context has disappeared.
  delete from public.contact_queue where
    role_id in (select role_id from public.company_roles where company_workspace_id = p_workspace) or
    recommendation_id in (select r.id from public.talent_opportunity_recommendation r
      join public.company_roles role on role.role_id = r.role_id where role.company_workspace_id = p_workspace) or
    company_talent_request_id in (select id from public.company_talent_requests where company_workspace_id = p_workspace) or
    company_talent_relay_id in (select relay.id from public.company_talent_relays relay
      join public.talent_opportunity_recommendation r on r.id = relay.recommendation_id
      join public.company_roles role on role.role_id = r.role_id where role.company_workspace_id = p_workspace);
  delete from public.company_talent_relays where
    company_talent_request_id in (select id from public.company_talent_requests where company_workspace_id = p_workspace) or
    recommendation_id in (select r.id from public.talent_opportunity_recommendation r
      join public.company_roles role on role.role_id = r.role_id where role.company_workspace_id = p_workspace);
  delete from public.company_talent_requests where company_workspace_id = p_workspace;
  delete from public.company_conversations where company_workspace_id = p_workspace;
  delete from public.company_workspace_credit_events where company_workspace_id = p_workspace;
  delete from public.company_workspace_credit_periods where company_workspace_id = p_workspace;
  delete from public.company_workspace_slots where company_workspace_id = p_workspace;
  delete from public.company_roles where company_workspace_id = p_workspace;
  delete from public.company_roles_archive where company_workspace_id = p_workspace;
  delete from public.company_snapshot where workspace_id = p_workspace;
  delete from public.company_workspace where company_workspace_id = p_workspace;
end;
$$;

revoke all on function public.delete_company_workspace_v1(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.delete_company_workspace_v1(uuid,uuid,text,text,jsonb) to service_role;

commit;
