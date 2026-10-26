-- Role x talent access is an existing progress fact, not fit/evaluation state.
-- No extra state column or metadata is needed. The billing ledger remains the
-- spending receipt; only this progress kind grants persistent opened access.
-- RLS on talent_progress has no client write policy. These RPCs remain server-only.

CREATE OR REPLACE FUNCTION public.enqueue_talent_progress_behavior_context_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  row_value public.talent_progress;
  operation_value text := lower(tg_op);
  fields text[] := '{}';
  role_label_value text := '';
  summary_value text;
begin
  row_value := case when tg_op = 'DELETE' then old else new end;
  -- An access receipt is not candidate behavior and must not enqueue a refresh.
  if row_value.kind='candidate_profile_opened'
    and (tg_op<>'UPDATE' or old.kind='candidate_profile_opened') then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    fields := array['kind', 'text', 'metadata', 'role_id', 'recommendation_id'];
  elsif tg_op = 'DELETE' then
    fields := array['kind', 'text', 'metadata', 'role_id', 'recommendation_id'];
  else
    if old.kind is distinct from new.kind then fields := array_append(fields, 'kind'); end if;
    if old.text is distinct from new.text then fields := array_append(fields, 'text'); end if;
    if old.metadata is distinct from new.metadata then fields := array_append(fields, 'metadata'); end if;
    if old.role_id is distinct from new.role_id then fields := array_append(fields, 'role_id'); end if;
    if old.recommendation_id is distinct from new.recommendation_id then fields := array_append(fields, 'recommendation_id'); end if;
    if cardinality(fields) = 0 then return new; end if;
  end if;

  select concat_ws(' - ',
           nullif(btrim(coalesce(workspace.published_name, workspace.company_name)), ''),
           nullif(btrim(role.name), '')
         )
    into role_label_value
  from public.company_roles role
  left join public.company_workspace workspace
    on workspace.company_workspace_id = role.company_workspace_id
  where role.role_id = row_value.role_id;

  summary_value := case operation_value
    when 'insert' then concat_ws('; ',
      'opportunity progress recorded',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'kind=' || coalesce(row_value.kind, ''),
      'text=' || left(coalesce(row_value.text, ''), 1600),
      'metadata=' || left(coalesce(row_value.metadata::text, '{}'), 1600)
    )
    when 'delete' then concat_ws('; ',
      'opportunity progress removed',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'previous kind=' || coalesce(row_value.kind, ''),
      'previous text=' || left(coalesce(row_value.text, ''), 1600),
      'previous metadata=' || left(coalesce(row_value.metadata::text, '{}'), 1600)
    )
    else concat_ws('; ',
      'opportunity progress changed',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'fields=' || array_to_string(fields, ','),
      case when old.kind is distinct from new.kind
        then 'kind: ' || coalesce(old.kind, '') || ' -> ' || coalesce(new.kind, '') end,
      case when old.text is distinct from new.text
        then 'text: ' || left(coalesce(old.text, ''), 1200) || ' -> ' || left(coalesce(new.text, ''), 1200) end,
      case when old.metadata is distinct from new.metadata
        then 'metadata: ' || left(coalesce(old.metadata::text, '{}'), 1200) || ' -> ' || left(coalesce(new.metadata::text, '{}'), 1200) end
    )
  end;

  perform public.try_enqueue_talent_behavior_context_change(
    row_value.talent_id,
    'progress',
    row_value.id::text,
    operation_value,
    fields,
    case
      when operation_value = 'insert' then coalesce(row_value.created_at, timezone('utc', now()))
      else timezone('utc', now())
    end,
    md5(
      'progress|' || row_value.id::text || '|' || operation_value || '|' ||
      coalesce(row_value.kind, '') || '|' || coalesce(row_value.text, '') || '|' ||
      coalesce(row_value.metadata::text, '') || '|' || coalesce(row_value.role_id::text, '') || '|' ||
      coalesce(row_value.recommendation_id::text, '') || '|txid=' || txid_current()::text
    ),
    summary_value
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$

;

-- Freeze the old sources until their grants have been copied and RPCs replaced.
-- An in-flight opening either commits before this lock or rolls back with its
-- debit if it tries to write the removed column after the migration.
lock table public.company_workspace_credit_events, public.talent_opportunity_fit,
  public.company_intro_candidates, public.talent_progress in share row exclusive mode;

-- Preserve every previously opened pair, including legacy Intro access and
-- test-only pairs that intentionally never had a matching fit row.
insert into public.talent_progress(talent_id,role_id,kind,text)
select opened.talent_id,opened.role_id,'candidate_profile_opened','기존 프로필 열람 권한을 이전했습니다.'
from (
  select f.talent_id,f.opportunity_id as role_id
    from public.talent_opportunity_fit f where f.is_opened
  union
  select e.talent_id,e.role_id from public.company_workspace_credit_events e
    join public.company_roles r on r.role_id=e.role_id and r.company_workspace_id=e.company_workspace_id
    where e.action_code in ('candidate_view','intro_request','connect')
  union
  select i.talent_id,i.role_id from public.company_intro_candidates i
    where i.requested_at is not null
) opened
where not exists(select 1 from public.talent_progress p
  where p.role_id=opened.role_id and p.talent_id=opened.talent_id and p.kind='candidate_profile_opened');

create or replace function public.workspace_candidate_access_v1(p_workspace uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_period uuid; v_workspace public.company_workspace%rowtype; v_remaining int; v_end timestamptz;
begin
  select * into strict v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    v_period:=public.workspace_billing_free_period_v1(p_workspace,clock_timestamp());
    select remaining,ends_at into v_remaining,v_end from public.company_workspace_credit_periods where id=v_period;
  end if;
  return jsonb_build_object(
    'paidRoleIds',coalesce((select jsonb_agg(r.role_id) from public.company_roles r
      where r.company_workspace_id=p_workspace and public.role_matching_slot_type_v1(r.role_id,clock_timestamp())='paid'),'[]'::jsonb),
    'openedPairs',coalesce((select jsonb_agg(distinct p.role_id::text||':'||p.talent_id::text)
      from public.talent_progress p join public.company_roles r on r.role_id=p.role_id
      where r.company_workspace_id=p_workspace and p.kind='candidate_profile_opened'),'[]'::jsonb),
    'remaining',v_remaining,'allowance',case when v_period is not null then 10 else null end,'renewsAt',v_end);
end; $$;

create or replace function public.workspace_open_candidate_v1(p_workspace uuid,p_role uuid,p_talent uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_information jsonb; v_period uuid; v_opened boolean; v_paid boolean; v_now timestamptz; v_key text:=p_role::text||':'||p_talent::text;
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
  if not public.company_intro_role_allows_talent_v1(v_information,p_talent) then
    raise exception 'billing_candidate_not_found';
  end if;
  v_paid:=public.role_matching_slot_type_v1(p_role,v_now)='paid';
  v_opened:=exists(select 1 from public.talent_progress
    where role_id=p_role and talent_id=p_talent and kind='candidate_profile_opened');
  if not v_opened then
    if not v_paid then
      v_period:=public.workspace_billing_free_period_v1(p_workspace,v_now);
      update public.company_workspace_credit_periods set remaining=remaining-1 where id=v_period and remaining>0;
      if not found then raise exception 'workspace_views_exhausted'; end if;
    end if;
    insert into public.company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,role_id,talent_id,actor_id,delta,completed_at)
      values(p_workspace,v_period,'candidate_view',v_key,p_role,p_talent,p_actor,case when v_period is null then 0 else -1 end,v_now);
    insert into public.talent_progress(talent_id,role_id,kind,text)
      values(p_talent,p_role,'candidate_profile_opened','후보자 프로필을 열람했습니다.');
  end if;
  return public.workspace_candidate_access_v1(p_workspace)||jsonb_build_object('alreadyOpened',v_opened,'charged',not v_opened and not v_paid);
end; $$;
CREATE OR REPLACE FUNCTION public.workspace_billing_debit_v1(p_workspace uuid, p_action text, p_key text, p_role uuid, p_talent uuid, p_actor uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_complete boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype; v_event public.company_workspace_credit_events%rowtype; v_now timestamptz; v_period uuid; v_slot uuid; v_delta int:=0; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  v_now:=clock_timestamp();
  select * into v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  if v_workspace.company_workspace_id is null then raise exception 'billing_workspace_not_found'; end if;
  if not exists(select 1 from public.company_roles where role_id=p_role and company_workspace_id=p_workspace) then raise exception 'billing_role_mismatch'; end if;
  select * into v_event from public.company_workspace_credit_events where company_workspace_id=p_workspace and action_code=p_action and business_key=p_key;
  if v_event.id is not null then
    if v_event.role_id<>p_role or v_event.talent_id<>p_talent or v_event.action_payload<>p_payload then raise exception 'billing_action_conflict'; end if;
    return v_event.id;
  end if;
  if p_action not in ('intro_request','connect') then raise exception 'billing_action_invalid'; end if;
  -- Legacy contracts are deliberately opt-in. No retroactive debits.
  if v_workspace.billing_started_at is null then return null; end if;
  if v_workspace.billing_model='standard' then
    -- Role assignment and spending share the same workspace lock. Retries above
    -- retain their original event/period even after a Role moves or pauses.
    perform public.workspace_billing_reconcile_v1(p_workspace);
    v_now:=clock_timestamp();
    select a.id into v_slot from public.company_workspace_slots a
      where a.company_workspace_id=p_workspace and a.assigned_role_id=p_role
        and public.workspace_billing_slot_active_v1(a,v_now) for update;
    -- A shared allowance never grants paid-only connection access.
    if p_action='connect' and public.role_matching_slot_type_v1(p_role,v_now)<>'paid' then raise exception 'workspace_feature_unavailable'; end if;
    if not exists(select 1 from public.company_roles r where r.role_id=p_role
      and r.source_type='internal' and lower(r.status) in ('active','open','top_priority')
      and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now)) then
      raise exception 'workspace_role_slot_required';
    end if;
    if p_action='intro_request' and public.role_matching_slot_type_v1(p_role,v_now)<>'paid'
      and not exists(select 1 from public.talent_progress p
        where p.role_id=p_role and p.talent_id=p_talent and p.kind='candidate_profile_opened') then
      raise exception 'workspace_candidate_view_required';
    end if;
    -- Free Roles have unlimited Intro requests after viewing. Contract Roles
    -- without a subscription slot retain their existing contract access.
    if v_slot is not null then
    -- Paid Intro allowances are separate from the shared profile views.
    select p.id into v_period from public.company_workspace_credit_periods p
      where p.company_workspace_id=p_workspace and p.slot_id=v_slot
        and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now and p.remaining>=1
      order by p.ends_at,p.starts_at,p.id limit 1 for update;
    if v_period is null then raise exception 'workspace_credits_exhausted'; end if;
    update public.company_workspace_credit_periods set remaining=remaining-1 where id=v_period;
    v_delta:=-1;
    end if;
  end if;
  insert into public.company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,role_id,talent_id,actor_id,delta,action_payload,completed_at)
    values(p_workspace,v_period,p_action,p_key,p_role,p_talent,p_actor,v_delta,p_payload,case when p_complete then v_now end) returning id into v_id;
  -- Paid Intro/connection receipts previously preserved access after slot removal.
  -- Keep that grant as the same progress fact, never as a second access source.
  insert into public.talent_progress(talent_id,role_id,kind,text)
    select p_talent,p_role,'candidate_profile_opened','후보자 프로필을 열람했습니다.'
    where not exists(select 1 from public.talent_progress p
      where p.role_id=p_role and p.talent_id=p_talent and p.kind='candidate_profile_opened');
  return v_id;
end; $function$;



-- The existing workspace advisory lock serializes the access check, debit, and
-- progress insert. Any failure rolls back both; a teammate/retry never recharges.
revoke all on function public.workspace_candidate_access_v1(uuid) from public,anon,authenticated;
revoke all on function public.workspace_open_candidate_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.workspace_billing_debit_v1(uuid,text,text,uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.workspace_candidate_access_v1(uuid) to service_role;
grant execute on function public.workspace_open_candidate_v1(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.workspace_billing_debit_v1(uuid,text,text,uuid,uuid,uuid,jsonb,boolean) to service_role;

alter table public.talent_opportunity_fit drop column is_opened;
notify pgrst, 'reload schema';
