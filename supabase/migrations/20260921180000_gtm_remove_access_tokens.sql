-- Remove the parallel GTM token system. The web and Agents now use the same
-- workspace contract with either a verified @matchharper.com Supabase session
-- or a trusted Supabase project connection (SQL editor/MCP/plugin/service role).
-- Business validation, optimistic row versions, idempotency, and audit records
-- remain in the existing GTM functions.

create type gtm_view.actor_identity as (
  id uuid,
  name text,
  can_write boolean
);

create function gtm_view.current_actor() returns gtm_view.actor_identity
language plpgsql stable security definer set search_path='' as $$
declare
  result gtm_view.actor_identity;
  actor_email text;
  actor_uid uuid := auth.uid();
  request_role text := nullif(current_setting('request.jwt.claim.role',true),'');
begin
  if actor_uid is not null then
    select lower(btrim(email)) into actor_email
    from auth.users
    where id=actor_uid and email_confirmed_at is not null and deleted_at is null
      and lower(split_part(email,'@',2))='matchharper.com';
    if actor_email is null then
      raise exception 'Internal GTM access required' using errcode='42501';
    end if;
    result.id:=actor_uid;
    result.name:=actor_email;
  elsif request_role='service_role' then
    result.id:='00000000-0000-4000-8000-000000000002'::uuid;
    result.name:='supabase-service-role';
  elsif request_role is not null then
    raise exception 'Internal GTM access required' using errcode='42501';
  elsif session_user in ('postgres','supabase_admin') then
    result.id:='00000000-0000-4000-8000-000000000001'::uuid;
    result.name:='supabase-plugin';
  else
    raise exception 'Internal GTM access required' using errcode='42501';
  end if;
  result.can_write:=true;
  return result;
end $$;

CREATE OR REPLACE FUNCTION gtm_view.api(p_action text, p_entity text DEFAULT NULL::text, p_id uuid DEFAULT NULL::uuid, p_expected_version bigint DEFAULT NULL::bigint, p_data jsonb DEFAULT '{}'::jsonb, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare credential gtm_view.actor_identity; allowed text[]:=array['gtm_creators','gtm_accounts','gtm_campaigns','gtm_formats',
 'gtm_outreach_templates','gtm_plans','gtm_collaborations','gtm_contents','gtm_activities','gtm_metric_snapshots','gtm_costs'];
before_row jsonb; after_row jsonb; result jsonb; related jsonb; key text; columns_sql text; values_sql text; update_sql text;
item jsonb; items jsonb; operation jsonb; arr jsonb; field text; link jsonb; target_id uuid; request_hash text; previous_request jsonb;
 limit_rows integer; offset_rows integer; readtable text;
begin
 credential := gtm_view.current_actor();
 
 if octet_length(coalesce(p_data,'{}')::text)>262144 then raise exception 'Request too large'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'p_data must be an object'; end if;
 if p_action is null then raise exception 'p_action is required'; end if;
 perform set_config('gtm.actor',credential.name,true);
 if p_action='batch' then
  if jsonb_typeof(p_data->'operations') is distinct from 'array' or jsonb_array_length(p_data->'operations') not between 1 and 50 then raise exception 'Batch needs 1 to 50 operations'; end if;
  result:='[]';
  for operation in select value from jsonb_array_elements(p_data->'operations') loop
   if operation->>'action'='batch' then raise exception 'Nested batches are not supported'; end if;
   result:=result||jsonb_build_array(gtm_view.api(operation->>'action',operation->>'entity',
    (operation->>'id')::uuid,(operation->>'expected_version')::bigint,coalesce(operation->'data','{}'),(operation->>'request_id')::uuid));
  end loop;
  return jsonb_build_object('results',result);
 end if;
 if p_action='today' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from public.gtm_today order by due_at nulls last limit 500)t;
  return jsonb_build_object('rows',result,'as_of',now());
 end if;
 if p_action in ('performance','overview') then
  return public.gtm_performance(p_data);
 end if;
 if p_entity is null or not(p_entity=any(allowed)) then raise exception 'Unknown GTM entity'; end if;
 if p_action in ('list','get') then
  readtable:=case
   when p_entity='gtm_plans' then 'gtm_plan_summary'
   when p_entity='gtm_creators' then 'gtm_creator_overview'
   when p_entity='gtm_formats' then 'gtm_format_overview'
   when p_entity='gtm_outreach_templates' then 'gtm_outreach_template_overview'
   else p_entity
  end;
  if p_action='get' then
   execute format('select to_jsonb(t) from public.%I t where id=$1',readtable) into result using p_id;
   related:=jsonb_build_object('activities',coalesce((select jsonb_agg(to_jsonb(a))from
    (select id,ref,kind,body,source_ref,occurred_at,payload,outreach_template_id from public.gtm_activities
     where entity=p_entity and entity_id=p_id and kind not like 'system.%' order by occurred_at desc limit 20)a),'[]'),
    'open_actions',coalesce((select jsonb_agg(to_jsonb(t))from public.gtm_today t where entity=p_entity and entity_id=p_id),'[]'));
   if p_entity='gtm_creators' then
    related:=related||jsonb_build_object('accounts',coalesce((select jsonb_agg(to_jsonb(a) order by a.platform,a.handle)from public.gtm_account_overview a where creator_id=p_id and archived_at is null),'[]'),
     'collaborations',coalesce((select jsonb_agg(to_jsonb(c))from(select id,ref,title,status,plan_id,owner_id,due_at from public.gtm_collaborations where creator_id=p_id order by created_at desc limit 20)c),'[]'));
   elsif p_entity='gtm_formats' then
    related:=related||jsonb_build_object('contents',coalesce((select jsonb_agg(to_jsonb(c))from
     (select id,ref,title,creator_id,campaign_id,production_status,publish_status,published_at,post_url
      from public.gtm_contents where format_id=p_id order by created_at desc limit 30)c),'[]'));
   elsif p_entity='gtm_outreach_templates' then
    related:=related||jsonb_build_object('messages',coalesce((select jsonb_agg(to_jsonb(a))from
     (select id,ref,kind,body,entity,entity_id,provider,connection_ref,thread_id,occurred_at,source_ref
      from public.gtm_activities where outreach_template_id=p_id
      order by occurred_at desc limit 50)a),'[]'));
   elsif p_entity='gtm_collaborations' then
    related:=related||jsonb_build_object('contents',coalesce((select jsonb_agg(to_jsonb(c))from(select id,ref,title,publish_status,production_status,post_url,due_at,action_items from public.gtm_contents where collaboration_id=p_id)c),'[]'),
     'costs',coalesce((select jsonb_agg(to_jsonb(c))from public.gtm_costs c where collaboration_id=p_id),'[]'));
   elsif p_entity='gtm_contents' then
    related:=related||jsonb_build_object('metrics',coalesce((select jsonb_agg(to_jsonb(m))from(select * from public.gtm_metric_snapshots where content_id=p_id order by as_of desc limit 30)m),'[]'),
     'platform_versions',coalesce((select jsonb_agg(to_jsonb(c))from(select id,ref,title,account_id,brief_ref,brief_version,post_url from public.gtm_contents where content_group_id=(result->>'content_group_id')::uuid)c),'[]'));
   end if;
   return jsonb_build_object('record',result,'related',related,'as_of',now());
  end if;
  limit_rows:=least(greatest(coalesce((p_data->>'limit')::integer,50),1),500);
  offset_rows:=greatest(coalesce((p_data->>'offset')::integer,0),0);
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from (select * from public.%I t where
   ($1 or archived_at is null) and to_jsonb(t) @> $2 and ($3='''' or to_jsonb(t)::text ilike ''%%''||$3||''%%'')
   order by ref limit $4 offset $5)r',readtable)
  into result using coalesce((p_data->>'include_archived')::boolean,false),coalesce(p_data->'filters','{}'),coalesce(p_data->>'search',''),limit_rows,offset_rows;
  return jsonb_build_object('rows',result,'offset',offset_rows,'next_offset',case when jsonb_array_length(result)=limit_rows then offset_rows+limit_rows end,'as_of',now());
 end if;
 if not credential.can_write then raise exception 'GTM access is read only' using errcode='42501'; end if;
 if p_action not in ('save','archive','patch_item','issue_link') then raise exception 'Unknown GTM action'; end if;
 if p_request_id is null then raise exception 'Mutation request_id is required'; end if;
 -- One short transaction serializes cross-row budget/payment/link checks. LLM work stays outside this lock.
 perform pg_advisory_xact_lock(hashtextextended('gtm_mutation_v1',0));
 request_hash:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'entity',p_entity,'id',p_id,'version',p_expected_version,'data',p_data)::text,'UTF8')),'hex');
 select payload into previous_request from public.gtm_activities where request_id=p_request_id;
 if found then
  if previous_request->>'input_hash'<>request_hash or previous_request->>'credential_id'<>credential.id::text then raise exception 'Idempotency key reused with different input'; end if;
  return previous_request->'result';
 end if;
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_entity) into before_row using p_id;
  if before_row is null then raise exception 'Record not found'; end if;
  if p_expected_version is null or (before_row->>'row_version')::bigint<>p_expected_version then
   raise exception 'Row version conflict. Reload before applying your change.' using errcode='40001'; end if;
 end if;
 if p_action<>'save' and before_row is null then raise exception 'This action requires an existing record'; end if;
 if p_action='archive' then
  p_data:=jsonb_build_object('archived_at',now());
 elsif p_action='patch_item' then
  field:=p_data->>'field';
  if not(field=any(array['contacts','action_items','payments','allocations','asset_refs'])) or not(before_row?field) then raise exception 'Unknown item field'; end if;
  items:=case when p_data?'items' then p_data->'items' else jsonb_build_array(p_data->'item') end;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 100 then raise exception 'Supply 1 to 100 child items'; end if;
  arr:=before_row->field;
  for item in select value from jsonb_array_elements(items) loop
   if jsonb_typeof(item) is distinct from 'object' or nullif(item->>'id','') is null then raise exception 'Item object with immutable ID is required'; end if;
   if field='payments' and exists(select 1 from jsonb_array_elements(arr)a where a->>'id'=item->>'id' and a<>a||item) then
    raise exception 'Payments are immutable; record a refund or separate correction evidence'; end if;
   select coalesce(jsonb_agg(case when a->>'id'=item->>'id' then a||item else a end),'[]') into arr from jsonb_array_elements(arr)a;
   if not exists(select 1 from jsonb_array_elements(arr)a where a->>'id'=item->>'id') then arr:=arr||jsonb_build_array(item); end if;
  end loop;
  p_data:=jsonb_build_object(field,arr);
 elsif p_action='issue_link' then
  if p_entity<>'gtm_contents' or nullif(before_row->>'campaign_id','') is null or nullif(before_row->>'plan_id','') is null then raise exception 'A content plan and campaign are required'; end if;
  if coalesce(p_data->>'source','') !~ '^[a-z0-9][a-z0-9_-]{0,79}$' or coalesce(p_data->>'medium','') !~ '^[a-z0-9][a-z0-9_-]{0,59}$' then raise exception 'Use valid source and medium identifiers'; end if;
  if coalesce(p_data->>'destination_url','') !~ '^https://[^[:space:]]+$' or p_data->>'destination_url' like '%#%' or p_data->>'destination_url' like '%utm_%' or p_data->>'destination_url' ~ '[?&](source|tm_source)=' then
   raise exception 'Use an HTTPS destination without existing attribution parameters or fragment'; end if;
  field:=coalesce(p_data->>'scope','content');
  target_id:=case field when 'content' then p_id when 'account' then nullif(before_row->>'account_id','')::uuid when 'plan' then (before_row->>'plan_id')::uuid end;
  if target_id is null then raise exception 'Invalid attribution scope/target'; end if;
  link:=jsonb_build_object('id','gtm_'||replace(gen_random_uuid()::text,'-',''),'destination_url',p_data->>'destination_url',
   'utm_source',p_data->>'source','utm_medium',p_data->>'medium','utm_campaign',replace(before_row->>'campaign_id','-',''),
   'scope',field,'target_id',target_id,'plan_id',before_row->>'plan_id','campaign_id',before_row->>'campaign_id',
   'format_id',before_row->>'format_id','placement',p_data->>'placement','created_at',now());
  link:=link||jsonb_build_object('url',(p_data->>'destination_url')||case when position('?' in p_data->>'destination_url')>0 then '&' else '?' end||
   'utm_source='||(link->>'utm_source')||'&utm_medium='||(link->>'utm_medium')||'&utm_campaign='||(link->>'utm_campaign')||'&utm_content='||(link->>'id'));
  p_data:=jsonb_build_object('tracking_links',(before_row->'tracking_links')||jsonb_build_array(link));
 else
  if p_data ?| array['tracking_links','contacts','action_items','payments','allocations','asset_refs'] then
   raise exception 'Use patch_item for child items and issue_link for immutable links'; end if;
 end if;
 if p_entity='gtm_activities' and before_row is not null then raise exception 'Activities are append only; add a correction referencing the prior record'; end if;
 for key in select jsonb_object_keys(p_data) loop
  if key=any(array['id','ref','created_at','updated_at','created_by','updated_by','row_version']) or not exists(
   select 1 from information_schema.columns where table_schema='public' and table_name=p_entity and column_name=key) then
   raise exception 'Unknown or read-only field: %',key; end if;
 end loop;
 if p_data='{}'::jsonb then raise exception 'A change is required'; end if;
 select string_agg(format('%I',k),','),string_agg(format('x.%I',k),','),string_agg(format('%I=x.%I',k,k),',')
 into columns_sql,values_sql,update_sql from jsonb_object_keys(p_data)k;
 if before_row is null then
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1)x returning to_jsonb(%I.*)',p_entity,columns_sql,values_sql,p_entity,p_entity)
  into after_row using p_data;
 else
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1)x where t.id=$2 returning to_jsonb(t)',p_entity,update_sql,p_entity)
  into after_row using p_data,p_id;
 end if;
 perform public.gtm_validate_record(p_entity,after_row,before_row);
 -- New promises consume available budget. Actual incurred costs/payments must remain recordable
 -- after a budget reduction, so the ledger never hides an already-existing expense.
 if p_entity='gtm_costs' and (coalesce((after_row->>'agreed_amount')::numeric,0)>coalesce((before_row->>'agreed_amount')::numeric,0)
  or (coalesce((after_row->>'agreed_amount')::numeric,0)>0 and
   (after_row->>'plan_id' is distinct from before_row->>'plan_id' or after_row->'allocations' is distinct from before_row->'allocations'))) then
  perform public.gtm_check_budgets((after_row->>'id')::uuid);
 end if;
 result:=jsonb_build_object('record',after_row,'link',link,'request_id',p_request_id);
 insert into public.gtm_activities(entity,entity_id,kind,body,payload,request_id)
 values(p_entity,(after_row->>'id')::uuid,'system.mutation','Recorded change',
 jsonb_build_object('input_hash',request_hash,'credential_id',credential.id,'before',before_row,'result',result),p_request_id);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION gtm_view.compensation_estimate(p_strategy_id uuid, p_creator_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  credential gtm_view.actor_identity;
  strategy public.gtm_compensation_strategies;
  result jsonb;
begin
  credential := gtm_view.current_actor();
  
  if cardinality(p_creator_ids) not between 1 and 100 then
    raise exception 'Supply 1 to 100 creators';
  end if;
  select * into strategy from public.gtm_compensation_strategies
  where id = p_strategy_id and archived_at is null;
  

  with creator_estimates as (
    select
      creator.id,
      creator.ref,
      creator.name,
      evidence.content_count,
      evidence.estimated_views,
      public.gtm_compensation_amount(
        jsonb_build_object(
          'pricing_model', strategy.pricing_model,
          'base_fee', strategy.base_fee,
          'views_per_unit', strategy.views_per_unit,
          'amount_per_unit', strategy.amount_per_unit
        ),
        evidence.estimated_views
      ) as estimated_cost
    from public.gtm_creators creator
    left join lateral (
      select count(*)::integer as content_count,
        round(percentile_cont(0.5) within group (order by recent.value))::numeric
          as estimated_views
      from (
        select latest.value
        from public.gtm_contents content
        join lateral (
          select metric.value
          from public.gtm_metric_snapshots metric
          where metric.content_id = content.id and metric.metric = 'views'
            and metric.value is not null and metric.archived_at is null
          order by metric.as_of desc, metric.created_at desc limit 1
        ) latest on true
        where content.creator_id = creator.id
          and content.published_at is not null and content.archived_at is null
        order by content.published_at desc limit 10
      ) recent
    ) evidence on true
    where creator.id = any(p_creator_ids) and creator.archived_at is null
  )
  select jsonb_build_object(
    'strategy', jsonb_build_object(
      'id', strategy.id, 'ref', strategy.ref, 'name', strategy.name,
      'version', strategy.version, 'pricing_model', strategy.pricing_model,
      'base_fee', strategy.base_fee,
      'measurement_window_days', strategy.measurement_window_days,
      'views_per_unit', strategy.views_per_unit,
      'amount_per_unit', strategy.amount_per_unit, 'currency', strategy.currency,
      'calculation_method', case when strategy.pricing_model = 'fixed'
        then 'fixed' else 'proportional' end
    ),
    'creators', coalesce(jsonb_agg(jsonb_build_object(
      'creator_id', estimate.id, 'creator_ref', estimate.ref,
      'creator_name', estimate.name,
      'estimated_views', estimate.estimated_views,
      'evidence_content_count', estimate.content_count,
      'estimated_cost', case
        when strategy.pricing_model = 'fixed' or estimate.content_count > 0
          then estimate.estimated_cost
        else null
      end,
      'evidence_status', case
        when strategy.pricing_model = 'fixed' then 'fixed_price_no_view_history_required'
        when estimate.content_count > 0 then 'estimated_from_recent_content'
        else 'missing_view_history'
      end
    ) order by estimate.estimated_cost desc nulls last), '[]'::jsonb),
    'known_estimated_total', sum(estimate.estimated_cost) filter (
      where strategy.pricing_model = 'fixed' or estimate.content_count > 0
    ),
    'missing_estimate_count', count(*) filter (
      where strategy.pricing_model <> 'fixed' and estimate.content_count = 0
    ),
    'currency', strategy.currency,
    'as_of', now()
  ) into result from creator_estimates estimate;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION gtm_view.compensation_strategy_save(p_id uuid DEFAULT NULL::uuid, p_expected_version bigint DEFAULT NULL::bigint, p_data jsonb DEFAULT '{}'::jsonb, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  credential gtm_view.actor_identity;
  prior jsonb;
  record_row public.gtm_compensation_strategies;
  result jsonb;
  request_hash text;
  key text;
begin
  credential := gtm_view.current_actor();
  if not credential.can_write then raise exception 'GTM access is read only' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'Mutation request_id is required'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'p_data must be an object';
  end if;
  for key in select jsonb_object_keys(p_data) loop
    if not key = any(array[
      'name', 'status', 'pricing_model', 'currency', 'base_fee',
      'measurement_window_days', 'views_per_unit', 'amount_per_unit', 'notes',
      'version', 'archived_at'
    ]) then raise exception 'Unknown or read-only field: %', key; end if;
  end loop;

  request_hash := encode(sha256(convert_to(jsonb_build_object(
    'id', p_id, 'version', p_expected_version, 'data', p_data
  )::text, 'UTF8')), 'hex');
  select payload into prior from public.gtm_activities where request_id = p_request_id;
  if found then
    if prior ->> 'input_hash' <> request_hash
      or prior ->> 'credential_id' <> credential.id::text then
      raise exception 'Idempotency key reused with different input';
    end if;
    return prior -> 'result';
  end if;

  perform set_config('gtm.actor', credential.name, true);
  if p_id is null then
    insert into public.gtm_compensation_strategies (
      name, status, pricing_model, currency, base_fee,
      measurement_window_days, views_per_unit, amount_per_unit, notes, version
    ) values (
      p_data ->> 'name', coalesce(p_data ->> 'status', 'draft'),
      coalesce(p_data ->> 'pricing_model', 'fixed'),
      coalesce(p_data ->> 'currency', 'KRW'),
      coalesce((p_data ->> 'base_fee')::numeric, 0),
      coalesce((p_data ->> 'measurement_window_days')::integer, 0),
      nullif(p_data ->> 'views_per_unit', '')::numeric,
      nullif(p_data ->> 'amount_per_unit', '')::numeric,
      p_data ->> 'notes', coalesce((p_data ->> 'version')::integer, 1)
    ) returning * into record_row;
  else
    select * into record_row from public.gtm_compensation_strategies
    where id = p_id for update;
    
    if p_expected_version is null or record_row.row_version <> p_expected_version then
      raise exception 'Row version conflict. Reload before applying your change.'
        using errcode = '40001';
    end if;
    update public.gtm_compensation_strategies strategy set
      name = case when p_data ? 'name' then p_data ->> 'name' else strategy.name end,
      status = case when p_data ? 'status' then p_data ->> 'status' else strategy.status end,
      pricing_model = case when p_data ? 'pricing_model' then p_data ->> 'pricing_model' else strategy.pricing_model end,
      currency = case when p_data ? 'currency' then p_data ->> 'currency' else strategy.currency end,
      base_fee = case when p_data ? 'base_fee' then (p_data ->> 'base_fee')::numeric else strategy.base_fee end,
      measurement_window_days = case when p_data ? 'measurement_window_days' then (p_data ->> 'measurement_window_days')::integer else strategy.measurement_window_days end,
      views_per_unit = case when p_data ? 'views_per_unit' then nullif(p_data ->> 'views_per_unit', '')::numeric else strategy.views_per_unit end,
      amount_per_unit = case when p_data ? 'amount_per_unit' then nullif(p_data ->> 'amount_per_unit', '')::numeric else strategy.amount_per_unit end,
      notes = case when p_data ? 'notes' then p_data ->> 'notes' else strategy.notes end,
      version = case when p_data ? 'version' then (p_data ->> 'version')::integer else strategy.version end,
      archived_at = case when p_data ? 'archived_at' then nullif(p_data ->> 'archived_at', '')::timestamptz else strategy.archived_at end
    where strategy.id = p_id returning * into record_row;
  end if;

  result := jsonb_build_object('record', to_jsonb(record_row), 'request_id', p_request_id);
  insert into public.gtm_activities (
    entity, entity_id, kind, body, payload, request_id
  ) values (
    'gtm_compensation_strategies', record_row.id, 'system.mutation',
    'Recorded compensation strategy change',
    jsonb_build_object('input_hash', request_hash, 'credential_id', credential.id, 'result', result),
    p_request_id
  );
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION gtm_view.outreach_apply_compensation_strategy(p_strategy_id uuid, p_dispatch_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  credential gtm_view.actor_identity;
  strategy public.gtm_compensation_strategies;
  dispatch public.gtm_outreach_dispatches;
  v_estimated_views numeric;
  v_estimated_cost numeric;
  snapshot jsonb;
  result jsonb := '[]'::jsonb;
begin
  credential := gtm_view.current_actor();
  if not credential.can_write then raise exception 'GTM access is read only' using errcode='42501'; end if;
  if cardinality(p_dispatch_ids) not between 1 and 100 then
    raise exception 'Supply 1 to 100 dispatches';
  end if;
  select * into strategy from public.gtm_compensation_strategies
  where id = p_strategy_id and status = 'active' and archived_at is null;
  
  snapshot := jsonb_build_object(
    'strategy_id', strategy.id, 'strategy_ref', strategy.ref,
    'name', strategy.name, 'version', strategy.version,
    'pricing_model', strategy.pricing_model, 'currency', strategy.currency,
    'base_fee', strategy.base_fee,
    'measurement_window_days', strategy.measurement_window_days,
    'views_per_unit', strategy.views_per_unit,
    'amount_per_unit', strategy.amount_per_unit,
    'calculation_method', case when strategy.pricing_model = 'fixed'
      then 'fixed' else 'proportional' end,
    'frozen_at', now()
  );
  perform set_config('gtm.actor', credential.name, true);
  for dispatch in
    select * from public.gtm_outreach_dispatches candidate
    where candidate.id = any(p_dispatch_ids) and candidate.archived_at is null
    order by candidate.ref for update
  loop
    if dispatch.status not in ('ready_for_review', 'needs_revision') then
      raise exception 'Only unapproved outreach can change pricing strategy';
    end if;
    select round(percentile_cont(0.5) within group (order by recent.value))::numeric
      into v_estimated_views
    from (
      select latest.value
      from public.gtm_contents content
      join lateral (
        select metric.value from public.gtm_metric_snapshots metric
        where metric.content_id = content.id and metric.metric = 'views'
          and metric.value is not null and metric.archived_at is null
        order by metric.as_of desc, metric.created_at desc limit 1
      ) latest on true
      where content.creator_id = dispatch.creator_id
        and content.published_at is not null and content.archived_at is null
      order by content.published_at desc limit 10
    ) recent;
    v_estimated_cost := case
      when strategy.pricing_model = 'fixed'
        then public.gtm_compensation_amount(snapshot, null)
      when v_estimated_views is null then null
      else public.gtm_compensation_amount(snapshot, v_estimated_views)
    end;
    update public.gtm_outreach_dispatches target set
      compensation_strategy_id = strategy.id,
      compensation_snapshot = snapshot,
      estimated_views = v_estimated_views,
      estimated_cost = v_estimated_cost
    where target.id = dispatch.id;
    if dispatch.collaboration_id is not null then
      update public.gtm_collaborations collaboration
      set compensation_strategy_id = strategy.id
      where collaboration.id = dispatch.collaboration_id;

      -- Carry the newly agreed default into draft content. Published content
      -- keeps the snapshot under which it was actually commissioned.
      update public.gtm_contents content
      set compensation_strategy_id = strategy.id
      where content.collaboration_id = dispatch.collaboration_id
        and content.archived_at is null
        and content.published_at is null
        and content.compensation_cost_id is null;
    end if;
    result := result || jsonb_build_array(jsonb_build_object(
      'dispatch_id', dispatch.id, 'dispatch_ref', dispatch.ref,
      'creator_id', dispatch.creator_id,
      'estimated_views', v_estimated_views, 'estimated_cost', v_estimated_cost,
      'currency', strategy.currency,
      'evidence_status', case
        when strategy.pricing_model = 'fixed' then 'fixed_price_no_view_history_required'
        when v_estimated_views is null then 'missing_view_history'
        else 'estimated_from_recent_content'
      end
    ));
  end loop;
  if jsonb_array_length(result) <> cardinality(p_dispatch_ids) then
    raise exception 'One or more outreach dispatches were not found';
  end if;
  return jsonb_build_object('rows', result, 'strategy', snapshot, 'as_of', now());
end;
$function$;

CREATE OR REPLACE FUNCTION gtm_view.outreach_prepare(p_creator_id uuid, p_outreach_template_id uuid, p_recipient_email text, p_sender_email text, p_subject text, p_body text, p_selection_reason text, p_request_id uuid, p_collaboration_id uuid DEFAULT NULL::uuid, p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_personalization_evidence text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  credential gtm_view.actor_identity;
  creator public.gtm_creators;
  template public.gtm_outreach_templates;
  collaboration public.gtm_collaborations;
  existing public.gtm_outreach_dispatches;
  dispatch public.gtm_outreach_dispatches;
  draft public.gtm_activities;
  input_hash text;
begin
  credential := gtm_view.current_actor();
  
  if not credential.can_write then
    raise exception 'GTM access is read only' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Preparation request_id is required';
  end if;

  input_hash := encode(sha256(convert_to(jsonb_build_object(
    'creator_id', p_creator_id,
    'collaboration_id', p_collaboration_id,
    'outreach_template_id', p_outreach_template_id,
    'recipient_email', lower(btrim(coalesce(p_recipient_email, ''))),
    'sender_email', lower(btrim(coalesce(p_sender_email, ''))),
    'subject', p_subject,
    'body', p_body,
    'selection_reason', p_selection_reason,
    'personalization_evidence', p_personalization_evidence,
    'scheduled_at', p_scheduled_at
  )::text, 'UTF8')), 'hex');

  select * into existing
  from public.gtm_outreach_dispatches
  where prepare_request_id = p_request_id;
  if found then
    if existing.prepare_input_hash <> input_hash
      or existing.created_by is distinct from credential.name then
      raise exception 'Idempotency key reused with different outreach input';
    end if;
    select * into dispatch
    from public.gtm_outreach_dispatches
    where id = existing.id;
    return to_jsonb(dispatch);
  end if;

  select * into creator
  from public.gtm_creators
  where id = p_creator_id and archived_at is null;
  
  if creator.do_not_contact then
    raise exception 'Creator is marked do_not_contact';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(creator.contacts) contact
    where lower(coalesce(contact ->> 'channel', '')) = 'email'
      and lower(coalesce(contact ->> 'address', '')) =
        lower(btrim(coalesce(p_recipient_email, '')))
      and lower(coalesce(contact ->> 'status', '')) not in (
        'invalid', 'bounced', 'revoked'
      )
  ) then
    raise exception 'Recipient must be a current email contact on the creator';
  end if;

  select * into template
  from public.gtm_outreach_templates
  where id = p_outreach_template_id and archived_at is null;
  
  if template.status <> 'active' or lower(template.channel) <> 'email' then
    raise exception 'Outreach template must be an active email template';
  end if;

  if p_collaboration_id is not null then
    select * into collaboration
    from public.gtm_collaborations
    where id = p_collaboration_id and archived_at is null;
    if not found or collaboration.creator_id <> p_creator_id then
      raise exception 'Collaboration must belong to the selected creator';
    end if;
  end if;
  if nullif(btrim(coalesce(p_subject, '')), '') is null
    or nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'Final subject and body are required';
  end if;
  if nullif(btrim(coalesce(p_selection_reason, '')), '') is null then
    raise exception 'Template selection reason is required';
  end if;
  if coalesce(p_sender_email, '') !~*
    '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid sender email is required';
  end if;
  if lower(btrim(p_sender_email)) !~ '^[^[:space:]@]+@matchharper\.com$' then
    raise exception 'Sender must be a matchharper.com mailbox';
  end if;

  perform set_config('gtm.actor', credential.name, true);
  insert into public.gtm_outreach_dispatches (
    creator_id,
    collaboration_id,
    outreach_template_id,
    template_version,
    recipient_email,
    sender_email,
    subject,
    body,
    selection_reason,
    personalization_evidence,
    scheduled_at,
    prepare_request_id,
    prepare_input_hash,
    rfc_message_id
  ) values (
    p_creator_id,
    p_collaboration_id,
    p_outreach_template_id,
    coalesce(
      nullif(btrim(template.template_version), ''),
      'row-version-' || template.row_version::text
    ),
    lower(btrim(p_recipient_email)),
    lower(btrim(p_sender_email)),
    btrim(p_subject),
    p_body,
    btrim(p_selection_reason),
    nullif(btrim(coalesce(p_personalization_evidence, '')), ''),
    p_scheduled_at,
    p_request_id,
    input_hash,
    '<gtm-' || replace(gen_random_uuid()::text, '-', '') || '@matchharper.com>'
  ) returning * into dispatch;

  insert into public.gtm_activities (
    entity,
    entity_id,
    kind,
    body,
    payload,
    provider,
    connection_ref,
    request_id,
    outreach_template_id
  ) values (
    case when p_collaboration_id is null
      then 'gtm_creators' else 'gtm_collaborations' end,
    coalesce(p_collaboration_id, p_creator_id),
    'message_draft',
    dispatch.body,
    jsonb_build_object(
      'dispatch_id', dispatch.id,
      'subject', dispatch.subject,
      'recipient', dispatch.recipient_email,
      'sender', dispatch.sender_email,
      'template_version', dispatch.template_version,
      'selection_reason', dispatch.selection_reason,
      'personalization_evidence', dispatch.personalization_evidence,
      'status', 'ready_for_review'
    ),
    'gmail',
    dispatch.sender_email,
    p_request_id,
    dispatch.outreach_template_id
  ) returning * into draft;

  update public.gtm_outreach_dispatches
  set draft_activity_id = draft.id
  where id = dispatch.id
  returning * into dispatch;

  return to_jsonb(dispatch);
end;
$function$;

CREATE OR REPLACE FUNCTION gtm_view.outreach_review(p_dispatch_id uuid, p_expected_version bigint, p_action text, p_request_id uuid, p_subject text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_review_note text DEFAULT NULL::text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  credential gtm_view.actor_identity;
  dispatch public.gtm_outreach_dispatches;
  creator public.gtm_creators;
  template public.gtm_outreach_templates;
  prior public.gtm_activities;
  event_kind text;
  reviewer text;
  input_hash text;
begin
  credential := gtm_view.current_actor();
  
  if not credential.can_write then
    raise exception 'GTM access is read only' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Review request_id is required';
  end if;
  if p_action not in ('approve', 'request_revision', 'revise', 'skip') then
    raise exception 'Unknown outreach review action';
  end if;

  input_hash := encode(sha256(convert_to(jsonb_build_object(
    'dispatch_id', p_dispatch_id,
    'expected_version', p_expected_version,
    'action', p_action,
    'subject', p_subject,
    'body', p_body,
    'scheduled_at', p_scheduled_at,
    'review_note', p_review_note,
    'actor_email', lower(btrim(coalesce(p_actor_email, '')))
  )::text, 'UTF8')), 'hex');

  select * into prior
  from public.gtm_activities
  where request_id = p_request_id;
  if found then
    if prior.payload ->> 'input_hash' <> input_hash
      or prior.payload ->> 'credential_id' <> credential.id::text then
      raise exception 'Idempotency key reused with different review input';
    end if;
    select * into dispatch
    from public.gtm_outreach_dispatches
    where id = p_dispatch_id;
    return to_jsonb(dispatch);
  end if;

  select * into dispatch
  from public.gtm_outreach_dispatches
  where id = p_dispatch_id and archived_at is null
  for update;
  
  if p_expected_version is null or dispatch.row_version <> p_expected_version then
    raise exception 'Row version conflict. Reload before applying your change.'
      using errcode = '40001';
  end if;
  if dispatch.status in ('sending', 'sent', 'replied', 'skipped') then
    raise exception 'This outreach is already being sent or has been sent';
  end if;


  if dispatch.attempt_count>0 and (
    (p_subject is not null and btrim(p_subject)<>dispatch.subject) or
    (p_body is not null and p_body<>dispatch.body)) then
    raise exception 'An attempted email cannot change its content; compose a new draft' using errcode='22023';
  end if;
  -- The scoped credential is the authenticated reviewer identity. The Google
  -- account reported by Apps Script is useful context but is client input and
  -- therefore cannot be the audit authority.
  reviewer := credential.name;

  perform set_config('gtm.actor', reviewer, true);
  if p_action = 'approve' then
    select * into creator
    from public.gtm_creators
    where id = dispatch.creator_id and archived_at is null;
    if not found or creator.do_not_contact then
      raise exception 'Creator is unavailable or marked do_not_contact';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(creator.contacts) contact
      where lower(coalesce(contact ->> 'channel', '')) = 'email'
        and lower(coalesce(contact ->> 'address', '')) =
          lower(dispatch.recipient_email)
        and lower(coalesce(contact ->> 'status', '')) not in (
          'invalid', 'bounced', 'revoked'
        )
    ) then
      raise exception 'Recipient is no longer a current creator email contact';
    end if;
    if dispatch.outreach_template_id is not null then
    select * into template
    from public.gtm_outreach_templates
    where id = dispatch.outreach_template_id and archived_at is null;
    if not found or template.status <> 'active'
      or lower(template.channel) <> 'email' then
      raise exception 'Outreach template is no longer active for email';
    end if;
    end if;

    update public.gtm_outreach_dispatches
    set subject = coalesce(nullif(btrim(p_subject), ''), subject),
        body = coalesce(nullif(p_body, ''), body),
        review_note = p_review_note,
        status = 'approved',
        approved_by = reviewer,
        approved_at = now(),
        scheduled_at = coalesce(p_scheduled_at, scheduled_at, now()),
        next_attempt_at = coalesce(p_scheduled_at, scheduled_at, now()),
        failed_at = null,
        last_error = null
    where id = dispatch.id
    returning * into dispatch;
    event_kind := 'message_approved';
  elsif p_action = 'request_revision' then
    update public.gtm_outreach_dispatches
    set subject = coalesce(nullif(btrim(p_subject), ''), subject),
        body = coalesce(nullif(p_body, ''), body),
        review_note = p_review_note,
        status = 'needs_revision',
        approved_by = null,
        approved_at = null,
        next_attempt_at = null
    where id = dispatch.id
    returning * into dispatch;
    event_kind := 'message_revision_requested';
  elsif p_action = 'revise' then
    if nullif(btrim(coalesce(p_subject, '')), '') is null
      and nullif(coalesce(p_body, ''), '') is null then
      raise exception 'A revised subject or body is required';
    end if;
    update public.gtm_outreach_dispatches
    set subject = coalesce(nullif(btrim(p_subject), ''), subject),
        body = coalesce(nullif(p_body, ''), body),
        review_note = p_review_note,
        status = 'ready_for_review',
        approved_by = null,
        approved_at = null,
        next_attempt_at = null,
        failed_at = null,
        last_error = null
    where id = dispatch.id
    returning * into dispatch;
    event_kind := 'message_draft';
  else
    update public.gtm_outreach_dispatches
    set review_note = p_review_note,
        status = 'skipped',
        approved_by = null,
        approved_at = null,
        next_attempt_at = null
    where id = dispatch.id
    returning * into dispatch;
    event_kind := 'message_skipped';
  end if;

  insert into public.gtm_activities (
    entity,
    entity_id,
    kind,
    body,
    payload,
    occurred_at,
    provider,
    connection_ref,
    request_id,
    outreach_template_id
  ) values (
    case when dispatch.collaboration_id is null
      then 'gtm_creators' else 'gtm_collaborations' end,
    coalesce(dispatch.collaboration_id, dispatch.creator_id),
    event_kind,
    dispatch.body,
    jsonb_build_object(
      'dispatch_id', dispatch.id,
      'subject', dispatch.subject,
      'recipient', dispatch.recipient_email,
      'sender', dispatch.sender_email,
      'scheduled_at', dispatch.scheduled_at,
      'review_note', dispatch.review_note,
      'reviewer', reviewer,
      'claimed_actor_email', nullif(lower(btrim(coalesce(p_actor_email, ''))), ''),
      'input_hash', input_hash,
      'credential_id', credential.id
    ),
    now(),
    'gmail',
    dispatch.sender_email,
    p_request_id,
    dispatch.outreach_template_id
  );

  return to_jsonb(dispatch);
end;
$function$;

CREATE OR REPLACE FUNCTION gtm_view.recommend_compensation_strategy(p_strategy_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  credential gtm_view.actor_identity;
  selected public.gtm_compensation_strategies;
begin
  credential := gtm_view.current_actor();
  
  if nullif(btrim(coalesce(p_reason, '')), '') is null
    or length(p_reason) > 500 then
    raise exception 'Recommendation reason must contain 1 to 500 characters';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('gtm-recommended-compensation-strategy', 0)
  );
  select * into selected
  from public.gtm_compensation_strategies
  where id = p_strategy_id
    and status = 'active'
    and archived_at is null
  for update;
  

  update public.gtm_compensation_strategies
  set is_recommended = false,
      recommendation_reason = null,
      recommended_at = null
  where is_recommended
    and id <> selected.id;

  update public.gtm_compensation_strategies
  set is_recommended = true,
      recommendation_reason = btrim(p_reason),
      recommended_at = now()
  where id = selected.id
  returning * into selected;

  return jsonb_build_object('record', to_jsonb(selected), 'as_of', now());
end;
$function$;

CREATE OR REPLACE FUNCTION gtm_view.sheet_workspace(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare credential gtm_view.actor_identity; s gtm_view.sheets; source gtm_view.sources; d jsonb;
 result jsonb; item jsonb; field jsonb; sort_sql text:=''; limit_rows integer; offset_rows integer; key text; writer_result jsonb;
begin
 credential := gtm_view.current_actor();
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>262144 then raise exception 'Invalid request' using errcode='22023'; end if;
 if p_action='catalog' then
   return jsonb_build_object('can_write',credential.can_write,
     'sheets',coalesce((select jsonb_agg(to_jsonb(v) order by position,name) from gtm_view.sheets v),'[]'),
     'sources',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'label',v.label,'entity',v.entity::text,
       'writable',coalesce(v.writer in ('record','pricing'),false),'review',coalesce(v.writer='review',false),'performance',v.performance_group is not null or v.enrichment_group is not null,'fields',gtm_view.fields(v.id),'relations',gtm_view.relations(v.id)) order by v.label)
       from gtm_view.sources v),'[]'));
 end if;
 if p_action='reference_options' then
   select * into source from gtm_view.sources where id=p_data->>'source' and relation is not null;
   
   execute format('select jsonb_build_object(''options'',coalesce(jsonb_agg(jsonb_build_object(''id'',r->>''id'',''label'',concat_ws('' · '',r->>''ref'',coalesce(r->>''name'',r->>''title'',r->>''handle'',r->>''id'')))) ,''[]'')) from (select to_jsonb(t)r from %s t where to_jsonb(t)->>''archived_at'' is null and ($1='''' or position(lower($1) in lower(to_jsonb(t)::text))>0) order by t.ref limit 100)x',source.relation)
     into result using coalesce(p_data->>'search','');
   return result;
 end if;
 if p_action in ('query','save_record','review_outreach') then
   select * into s from gtm_view.sheets where id=(p_data->>'sheet_id')::uuid;
   
   d:=coalesce(p_data->'definition',s.definition);
   perform gtm_view.validate_definition(d);
   if d->>'source'<>s.definition->>'source' then raise exception 'Sheet source cannot change' using errcode='22023'; end if;
   select * into strict source from gtm_view.sources where id=d->>'source';
 end if;
 if p_action='query' then
   limit_rows:=least(greatest(coalesce((p_data->>'limit')::integer,100),1),200);
   offset_rows:=greatest(coalesce((p_data->>'offset')::integer,0),0);
   for item in select value from jsonb_array_elements(d->'sorting') loop
     select f into field from jsonb_array_elements(gtm_view.all_fields(source.id))f where f->>'key'=item->>'key';
     sort_sql:=sort_sql||case when sort_sql='' then '' else ',' end||
       case when field->>'type'='text' then format('lower(r->>%L)',item->>'key') else format('nullif(r->%L,''null''::jsonb)',item->>'key') end||
       case when coalesce((item->>'desc')::boolean,false) then ' desc nulls last' else ' asc nulls last' end;
   end loop;
   sort_sql:=case when sort_sql='' then '' else sort_sql||',' end||'(r->''ref'') asc nulls last,(r->>''id'') asc';
   execute format('with filtered as materialized (
     select r from gtm_view.source_rows($1,$2,$3)r where gtm_view.matches(r,$4)
     and ($5='''' or position(lower($5) in lower((select string_agg(coalesce(r->>(c->>''key''),''''),'' '') from jsonb_array_elements($2)c)))>0)
   ), page as (select r from filtered order by %s limit $6 offset $7)
   select jsonb_build_object(''rows'',coalesce((select jsonb_agg(r) from page),''[]''),''total'',(select count(*) from filtered),''limit'',$6,''offset'',$7,''as_of'',now())',sort_sql)
   into result using source.id,d->'columns',coalesce(p_data->'period','{}'),d->'filters',coalesce(p_data->>'search',''),limit_rows,offset_rows;
   return result;
 end if;
 if not credential.can_write then raise exception 'GTM access is read only' using errcode='42501'; end if;
 if p_action='save_sheet' then
   d:=p_data->'definition'; perform gtm_view.validate_definition(d);
   if p_data->>'id' is null then
     insert into gtm_view.sheets(name,position,definition,updated_by)
       values(btrim(p_data->>'name'),coalesce((select max(position)+1 from gtm_view.sheets),0),d,credential.name) returning * into s;
   else
     select * into s from gtm_view.sheets where id=(p_data->>'id')::uuid for update;
     
     if s.row_version is distinct from (p_data->>'expected_version')::bigint then raise exception '다른 팀원이 시트 구성을 변경했습니다. 최신 구성을 불러온 뒤 다시 저장하세요.' using errcode='40001'; end if;
     if s.definition->>'source'<>d->>'source' then raise exception 'Sheet source cannot change' using errcode='22023'; end if;
     update gtm_view.sheets set name=btrim(p_data->>'name'),definition=d,row_version=row_version+1,updated_by=credential.name,updated_at=now()
       where id=s.id returning * into s;
   end if;
   return to_jsonb(s);
 elsif p_action='delete_sheet' then
   delete from gtm_view.sheets where id=(p_data->>'id')::uuid and row_version=(p_data->>'expected_version')::bigint returning * into s;
   
   return jsonb_build_object('deleted',s.id);
 elsif p_action='save_record' then
   if source.writer is null or source.writer='review' then raise exception 'This source is read only' using errcode='42501'; end if;
   if jsonb_typeof(p_data->'values') is distinct from 'object' then raise exception 'values must be an object' using errcode='22023'; end if;
   for key in select jsonb_object_keys(p_data->'values') loop
     if not exists(select 1 from jsonb_array_elements(gtm_view.fields(source.id))f where f->>'key'=key and (f->>'writable')::boolean) then
       raise exception 'Read-only field: %',key using errcode='42501'; end if;
   end loop;
   if p_data->>'record_id' is not null then
     execute format('select to_jsonb(b) from %s b where b.id=$1',source.relation) into writer_result using (p_data->>'record_id')::uuid;
     if writer_result is null then raise exception 'Record not in source' using errcode='P0002'; end if;
   end if;
   if source.writer='pricing' then
     return gtm_view.compensation_strategy_save((p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,p_data->'values',(p_data->>'request_id')::uuid);
   end if;
   return gtm_view.api('save',replace(source.entity::text,'public.',''),(p_data->>'record_id')::uuid,
     (p_data->>'expected_version')::bigint,p_data->'values',(p_data->>'request_id')::uuid);
 elsif p_action='review_outreach' then
   if source.writer is distinct from 'review' then raise exception 'Not an outreach review source' using errcode='22023'; end if;
   if p_data->>'decision'=any(array['approve','revise','request_revision']) and
      (jsonb_typeof(p_data->'subject') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string'
       or coalesce(btrim(p_data->>'subject'),'')='' or coalesce(btrim(p_data->>'body'),'')='') then
     raise exception '제목과 본문을 입력하세요.' using errcode='22023'; end if;
   return gtm_view.outreach_review((p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,
     p_data->>'decision',(p_data->>'request_id')::uuid,p_data->>'subject',p_data->>'body',
     nullif(p_data->>'scheduled_at','')::timestamptz,p_data->>'review_note',credential.name);
 end if;
 raise exception 'Unknown workspace action' using errcode='22023';
end $function$;

CREATE OR REPLACE FUNCTION gtm_view.record_workspace(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare credential gtm_view.actor_identity; s gtm_view.sources; target gtm_view.sources;
 record_data jsonb; view_data jsonb; result jsonb; field jsonb; key text; entity_name text; relation_key text;
 limit_rows integer; offset_rows integer; child jsonb; rows_data jsonb; total_rows bigint;
begin
 credential := gtm_view.current_actor();
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>262144 then raise exception 'Invalid request' using errcode='22023'; end if;
 if p_action='catalog' then
  result:=gtm_view.sheet_workspace(p_action,p_data);
  return jsonb_set(result,'{sources}',(select jsonb_agg(value||jsonb_build_object('navigation',registered.navigation,'cell_navigation',registered.cell_navigation,'record_fields',gtm_view.record_fields(registered.id))) from jsonb_array_elements(result->'sources') join gtm_view.sources registered on registered.id=value->>'id'));
 end if;
 if p_action='reference_options' then
  result:=gtm_view.sheet_workspace(p_action,p_data);
  if nullif(p_data->>'selected_id','') is not null and not exists(select 1 from jsonb_array_elements(result->'options')o where o->>'id'=p_data->>'selected_id') then
   select * into s from gtm_view.sources where id=p_data->>'source' and entity is not null;
   if s.entity is not null then
    execute format('select to_jsonb(t) from %s t where id=$1',s.entity) into record_data using (p_data->>'selected_id')::uuid;
    if record_data is not null then result:=jsonb_set(result,'{options}',jsonb_build_array(jsonb_build_object('id',record_data->>'id','label',concat_ws(' · ',record_data->>'ref',coalesce(record_data->>'name',record_data->>'title',record_data->>'handle',record_data->>'description'))))||(result->'options')); end if;
   end if;
  end if;
  return result;
 end if;
 if p_action=any(array['query','save_sheet','delete_sheet']) then
  return gtm_view.sheet_workspace(p_action,p_data);
 end if;
 if p_action<>all(array['get_record','related_records','activity_history','save_record','patch_items','issue_link','log_activity','archive_record','restore_record','prepare_outreach','review_outreach']) then
  raise exception 'Unknown workspace action' using errcode='22023'; end if;
 if p_data->>'source' is not null then select * into s from gtm_view.sources where id=p_data->>'source';
 else select sources.* into s from gtm_view.sources sources join gtm_view.sheets sh on sh.definition->>'source'=sources.id where sh.id=(p_data->>'sheet_id')::uuid;
 end if;
 if s.entity is null then raise exception 'Choose a registered record source' using errcode='22023'; end if;
 entity_name:=replace(s.entity::text,'public.','');
 if p_data->>'record_id' is not null then
  execute format('select to_jsonb(t) from %s t where id=$1',s.entity) into record_data using (p_data->>'record_id')::uuid;
  if record_data is null then raise exception 'Record not found' using errcode='P0002'; end if;
 elsif p_action<>'save_record' then raise exception 'Record ID is required' using errcode='22023';
 end if;
 if p_action='get_record' then
  execute format('select to_jsonb(t) from %s t where id=$1',s.relation) into view_data using (p_data->>'record_id')::uuid;
  return jsonb_build_object('record',coalesce(view_data,'{}')||record_data,'fields',gtm_view.record_fields(s.id),
   'collections',case when s.writer='record' then gtm_view.collections(s.entity) else '[]'::jsonb end,
   'relations',gtm_view.child_relations(s.id,record_data),'capabilities',jsonb_build_object(
    'write',credential.can_write and s.writer in ('record','pricing') and record_data->>'archived_at' is null,
    'archive',credential.can_write and s.writer='record' and record_data->>'archived_at' is null,
    'restore',credential.can_write and s.writer='record' and record_data->>'archived_at' is not null,
    'activity',credential.can_write and s.writer='record',
    'issue_link',credential.can_write and s.entity='public.gtm_contents'::regclass and record_data->>'archived_at' is null,
    'prepare_outreach',credential.can_write and s.entity='public.gtm_creators'::regclass and record_data->>'archived_at' is null));
 end if;
 limit_rows:=least(greatest(coalesce((p_data->>'limit')::integer,30),1),100);
 offset_rows:=greatest(coalesce((p_data->>'offset')::integer,0),0);
 if p_action='related_records' then
  select value into child from jsonb_array_elements(gtm_view.child_relations(s.id,record_data)) where value->>'source'=p_data->>'target_source' and value->>'key'=p_data->>'key';
  if child is null then raise exception 'Unknown record relation' using errcode='22023'; end if;
  select * into strict target from gtm_view.sources where id=child->>'source';
  execute format('select count(*) from %s t where %I=$1 and to_jsonb(t)->>''archived_at'' is null',target.entity,child->>'key') into total_rows using (p_data->>'record_id')::uuid;
  execute format('select coalesce(jsonb_agg(r),''[]'') from (select to_jsonb(t) r from %s t where %I=$1 and to_jsonb(t)->>''archived_at'' is null order by ref desc limit $2 offset $3)x',target.relation,child->>'key') into rows_data using (p_data->>'record_id')::uuid,limit_rows,offset_rows;
  return jsonb_build_object('rows',rows_data,'total',total_rows,'offset',offset_rows,'limit',limit_rows);
 elsif p_action='activity_history' then
  select count(*) into total_rows from public.gtm_activities where entity=entity_name and entity_id=(p_data->>'record_id')::uuid and archived_at is null and kind not like 'system.%';
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows_data from (select id,ref,kind,body,source_ref,occurred_at,created_by,payload from public.gtm_activities where entity=entity_name and entity_id=(p_data->>'record_id')::uuid and archived_at is null and kind not like 'system.%' order by occurred_at desc,id limit limit_rows offset offset_rows)t;
  return jsonb_build_object('rows',rows_data,'total',total_rows,'offset',offset_rows,'limit',limit_rows);
 end if;
 if not credential.can_write then raise exception 'GTM access is read only' using errcode='42501'; end if;
 if p_action='review_outreach' then
  if s.writer is distinct from 'review' then raise exception 'Not an outreach review source' using errcode='22023'; end if;
  if p_data->>'decision'=any(array['approve','revise','request_revision']) and
     (jsonb_typeof(p_data->'subject') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string'
      or coalesce(btrim(p_data->>'subject'),'')='' or coalesce(btrim(p_data->>'body'),'')='') then raise exception '제목과 본문을 입력하세요.' using errcode='22023'; end if;
  return gtm_view.outreach_review((p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,p_data->>'decision',(p_data->>'request_id')::uuid,p_data->>'subject',p_data->>'body',nullif(p_data->>'scheduled_at','')::timestamptz,p_data->>'review_note',credential.name);
 end if;
 if s.writer is null or s.writer='review' then raise exception 'This source is read only' using errcode='42501'; end if;
 if p_action='save_record' then
  if jsonb_typeof(p_data->'values') is distinct from 'object' then raise exception 'values must be an object' using errcode='22023'; end if;
  for key in select jsonb_object_keys(p_data->'values') loop
   if not exists(select 1 from jsonb_array_elements(gtm_view.record_fields(s.id))f where f->>'key'=key and (f->>'writable')::boolean) then raise exception 'Read-only field: %',key using errcode='42501'; end if;
  end loop;
  if s.writer='pricing' then return gtm_view.compensation_strategy_save((p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,p_data->'values',(p_data->>'request_id')::uuid); end if;
  return gtm_view.api('save',entity_name,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,p_data->'values',(p_data->>'request_id')::uuid);
 end if;
 if s.writer<>'record' then raise exception 'Action is unavailable for this source' using errcode='42501'; end if;
 if p_action='patch_items' then
  if not exists(select 1 from jsonb_array_elements(gtm_view.collections(s.entity))c where c->>'key'=p_data->>'field') then raise exception 'Unknown child collection' using errcode='22023'; end if;
  return gtm_view.api('patch_item',entity_name,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,jsonb_build_object('field',p_data->>'field','items',p_data->'items'),(p_data->>'request_id')::uuid);
 elsif p_action='issue_link' then
  return gtm_view.api('issue_link',entity_name,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,p_data->'values',(p_data->>'request_id')::uuid);
 elsif p_action='archive_record' then
  return gtm_view.api('archive',entity_name,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,'{}',(p_data->>'request_id')::uuid);
 elsif p_action='restore_record' then
  return gtm_view.api('save',entity_name,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,'{"archived_at":null}',(p_data->>'request_id')::uuid);
 elsif p_action='log_activity' then
  if nullif(btrim(p_data->>'body'),'') is null then raise exception '기록 내용을 입력하세요.' using errcode='22023'; end if;
  if coalesce(p_data->>'kind','note')<>all(array['note','performance_review','review_adopted']) then raise exception 'Unsupported activity kind' using errcode='22023'; end if;
  if p_data->>'kind'='review_adopted' and nullif(btrim(p_data->>'direction'),'') is null then raise exception '채택한 방향을 입력하세요.' using errcode='22023'; end if;
  return gtm_view.api('save','gtm_activities',null,null,jsonb_build_object('entity',entity_name,'entity_id',p_data->>'record_id','kind',coalesce(p_data->>'kind','note'),'body',p_data->>'body','source_ref',p_data->>'source_ref','payload',jsonb_strip_nulls(jsonb_build_object('direction',nullif(p_data->>'direction','')))),(p_data->>'request_id')::uuid);
 elsif p_action='prepare_outreach' then
  if s.entity<>'public.gtm_creators'::regclass then raise exception 'Choose a creator' using errcode='22023'; end if;
  return gtm_view.outreach_prepare((p_data->>'record_id')::uuid,(p_data->>'template_id')::uuid,p_data->>'recipient_email','harper@matchharper.com',p_data->>'subject',p_data->>'body',p_data->>'selection_reason',(p_data->>'request_id')::uuid,null,null,p_data->>'personalization_evidence');
 end if;
 raise exception 'Unknown record operation' using errcode='22023';
end $function$;

CREATE OR REPLACE FUNCTION gtm_view.prepare_email(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare credential gtm_view.actor_identity; creator public.gtm_creators;
 dispatch public.gtm_outreach_dispatches; reply public.gtm_activities;
 request_id uuid := (p_data->>'request_id')::uuid; input_hash text;
 creator_id uuid := (p_data->>'record_id')::uuid; recipient text := lower(btrim(p_data->>'recipient_email'));
 collaboration_id uuid; reply_header text; references_header text; activity_id uuid;
begin
 credential := gtm_view.current_actor();
 if not credential.can_write then raise exception 'GTM access is read only' using errcode='42501'; end if;
 if request_id is null then raise exception 'request_id is required' using errcode='22023'; end if;
 input_hash:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 -- Serializing the same request makes concurrent retries return the same draft.
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select * into dispatch from public.gtm_outreach_dispatches where prepare_request_id=request_id;
 if found then
  if dispatch.prepare_input_hash<>input_hash or dispatch.created_by is distinct from credential.name then raise exception 'Idempotency key reused with different email input' using errcode='22023'; end if;
  return to_jsonb(dispatch);
 end if;
 select * into creator from public.gtm_creators where id=creator_id and archived_at is null;
 if not found or creator.do_not_contact then raise exception 'Creator is unavailable or marked do_not_contact' using errcode='42501'; end if;
 if not exists(select 1 from jsonb_array_elements(creator.contacts)c where lower(c->>'channel')='email' and lower(c->>'address')=recipient and lower(coalesce(c->>'status','')) not in ('invalid','bounced','revoked')) then
  raise exception 'Recipient must be a current email contact on the creator' using errcode='22023';
 end if;
 if nullif(btrim(p_data->>'subject'),'') is null or nullif(btrim(p_data->>'body'),'') is null then raise exception 'Subject and body are required' using errcode='22023'; end if;
 if length(p_data->>'subject')>998 or p_data->>'subject' ~ E'[\r\n]' or octet_length(p_data->>'body')>150000 then raise exception 'Email is too large or contains invalid headers' using errcode='22023'; end if;
 if nullif(p_data->>'reply_to_activity_id','') is not null then
  select a.* into reply from public.gtm_activities a
  where a.id=(p_data->>'reply_to_activity_id')::uuid and a.archived_at is null
    and a.kind in ('message_sent','message_received')
    and ((a.entity='gtm_creators' and a.entity_id=creator.id) or
      (a.entity='gtm_collaborations' and exists(select 1 from public.gtm_collaborations c where c.id=a.entity_id and c.creator_id=creator.id)));
  
  if reply.entity='gtm_collaborations' then collaboration_id:=reply.entity_id; end if;
  if reply.kind='message_received' then
   reply_header:=reply.payload->>'rfc_message_id';
   if recipient is distinct from lower(reply.payload->>'from') then raise exception 'Reply recipient differs from the selected message' using errcode='22023'; end if;
  else
   select coalesce(d.provider_rfc_message_id,case when d.provider='gmail' then d.rfc_message_id end) into reply_header
    from public.gtm_outreach_dispatches d where d.id=(reply.payload->>'dispatch_id')::uuid;
   if recipient is distinct from lower(reply.payload->>'recipient') then raise exception 'Reply recipient differs from the selected message' using errcode='22023'; end if;
  end if;
  if reply_header is null or reply_header !~ '^<[^<>[:space:]]+@[^<>[:space:]]+>$' then raise exception 'Message-ID is unavailable; refresh the conversation or compose a new email' using errcode='22023'; end if;
  references_header:=concat_ws(' ',nullif(reply.payload->>'references',''),reply_header);
 end if;
 perform set_config('gtm.actor',credential.name,true);
 insert into public.gtm_outreach_dispatches(creator_id,collaboration_id,outreach_template_id,template_version,
  recipient_email,sender_email,subject,body,selection_reason,prepare_request_id,prepare_input_hash,rfc_message_id,
  reply_to_activity_id,in_reply_to,email_references)
 values(creator.id,collaboration_id,null,'manual',recipient,'harper@matchharper.com',btrim(p_data->>'subject'),p_data->>'body',
  '팀원 직접 작성',request_id,input_hash,'<gtm-'||replace(gen_random_uuid()::text,'-','')||'@matchharper.com>',reply.id,reply_header,references_header)
 returning * into dispatch;
 insert into public.gtm_activities(entity,entity_id,kind,body,payload,request_id)
 values(case when collaboration_id is null then 'gtm_creators' else 'gtm_collaborations' end,coalesce(collaboration_id,creator.id),'message_draft',dispatch.body,
  jsonb_build_object('dispatch_id',dispatch.id,'subject',dispatch.subject,'recipient',recipient,'sender',dispatch.sender_email,'reply_to_activity_id',reply.id),request_id)
 returning id into activity_id;
 update public.gtm_outreach_dispatches set draft_activity_id=activity_id where id=dispatch.id returning * into dispatch;
 return to_jsonb(dispatch);
end $function$;

-- Keep manually composed emails eligible for delivery and preserve the
-- provider idempotency window when this migration reaches an environment
-- whose worker function predates creator mail composition.
create or replace function public.gtm_outreach_worker_claim(
  p_dispatch_id uuid default null,
  p_limit integer default 10
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_limit < 1 or p_limit > 50 then
    raise exception 'p_limit must be between 1 and 50';
  end if;
  perform set_config('gtm.actor','resend-outreach-worker',true);

  update public.gtm_outreach_dispatches
  set status='failed',next_attempt_at=null,sending_started_at=null,failed_at=now(),
      last_error='Delivery needs reconciliation: retry window expired'
  where status in ('approved','sending')
    and first_attempt_at < now()-interval '23 hours'
    and provider_message_id is null and archived_at is null
    and (p_dispatch_id is null or id=p_dispatch_id);

  update public.gtm_outreach_dispatches dispatch
  set status='failed',failed_at=now(),next_attempt_at=null,sending_started_at=null,
      last_error='Send blocked: creator, recipient contact, or template is no longer eligible'
  where dispatch.archived_at is null
    and (p_dispatch_id is null or dispatch.id=p_dispatch_id)
    and ((dispatch.status='approved' and coalesce(dispatch.next_attempt_at,dispatch.scheduled_at,now())<=now())
      or (dispatch.status='sending' and dispatch.sending_started_at<now()-interval '10 minutes'))
    and (not exists(
      select 1 from public.gtm_creators creator
      where creator.id=dispatch.creator_id and creator.archived_at is null and not creator.do_not_contact
        and exists(select 1 from jsonb_array_elements(creator.contacts) contact
          where lower(coalesce(contact->>'channel',''))='email'
            and lower(coalesce(contact->>'address',''))=lower(dispatch.recipient_email)
            and lower(coalesce(contact->>'status','')) not in ('invalid','bounced','revoked')))
      or (dispatch.outreach_template_id is not null and not exists(
        select 1 from public.gtm_outreach_templates template
        where template.id=dispatch.outreach_template_id and template.archived_at is null
          and template.status='active' and lower(template.channel)='email')));

  with candidates as (
    select dispatch.id
    from public.gtm_outreach_dispatches dispatch
    where dispatch.archived_at is null
      and (p_dispatch_id is null or dispatch.id=p_dispatch_id)
      and ((dispatch.status='approved' and coalesce(dispatch.next_attempt_at,dispatch.scheduled_at,now())<=now())
        or (dispatch.status='sending' and dispatch.sending_started_at<now()-interval '10 minutes'))
    order by coalesce(dispatch.next_attempt_at,dispatch.scheduled_at),dispatch.ref
    for update skip locked limit p_limit
  ), claimed as (
    update public.gtm_outreach_dispatches dispatch
    set status='sending',sending_started_at=now(),
        first_attempt_at=coalesce(dispatch.first_attempt_at,now()),
        attempt_count=dispatch.attempt_count+1,last_error=null
    from candidates where dispatch.id=candidates.id returning dispatch.*
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
  return result;
end $$;

create or replace function public.gtm_outreach_worker_mark_sent(
  p_dispatch_id uuid,
  p_provider_message_id text,
  p_provider_thread_id text,
  p_sent_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  resend boolean := p_provider_message_id ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or p_provider_thread_id ~ '^<[^>]+>$';
begin
  return public.gtm_outreach_worker_record_delivery(
    p_dispatch_id,
    case when resend then 'resend' else 'gmail' end,
    p_provider_message_id,
    case when resend and p_provider_thread_id ~ '^<[^>]+>$' then p_provider_thread_id end,
    case when not resend then p_provider_thread_id end,
    p_sent_at
  );
end $$;


create function public.gtm_workspace(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform gtm_view.current_actor();
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>262144 then
    raise exception 'Invalid request' using errcode='22023';
  end if;
  if p_action='prepare_email' then
    return gtm_view.prepare_email(p_data);
  elsif p_action='creator_conversation' then
    return gtm_view.creator_conversation(p_data);
  elsif p_action='compensation_estimate' then
    return gtm_view.compensation_estimate((p_data->>'strategy_id')::uuid,
      array(select jsonb_array_elements_text(p_data->'creator_ids'))::uuid[]);
  elsif p_action='recommend_compensation_strategy' then
    return gtm_view.recommend_compensation_strategy((p_data->>'strategy_id')::uuid,p_data->>'reason');
  elsif p_action='apply_compensation_strategy' then
    return gtm_view.outreach_apply_compensation_strategy((p_data->>'strategy_id')::uuid,
      array(select jsonb_array_elements_text(p_data->'dispatch_ids'))::uuid[]);
  else
    return gtm_view.record_workspace(p_action,p_data);
  end if;
end $$;

revoke all on all functions in schema gtm_view from public,anon,authenticated,service_role;
revoke all on function public.gtm_workspace(text,jsonb) from public,anon;
grant execute on function public.gtm_workspace(text,jsonb) to authenticated,service_role;

-- Remove every token-bearing public/internal entry point and the hashed-key store.
drop function public.gtm_workspace(text,jsonb,text);
drop function gtm_view.prepare_email(jsonb,text);
drop function gtm_view.record_workspace(text,jsonb,text);
drop function gtm_view.sheet_workspace(text,jsonb,text);
drop function public.gtm_api(text,text,text,uuid,bigint,jsonb,uuid);
drop function public.gtm_compensation_estimate(text,uuid,uuid[]);
drop function public.gtm_compensation_strategy_save(text,uuid,bigint,jsonb,uuid);
drop function public.gtm_outreach_apply_compensation_strategy(text,uuid,uuid[]);
drop function public.gtm_outreach_prepare(text,uuid,uuid,text,text,text,text,text,uuid,uuid,timestamptz,text);
drop function public.gtm_outreach_review(text,uuid,bigint,text,uuid,text,text,timestamptz,text,text);
drop function public.gtm_recommend_compensation_strategy(text,uuid,text);
drop function public.gtm_sheet_view(text,text,uuid,integer,integer);
drop function gtm_view.credential(text);
drop table public.gtm_access_tokens;

comment on function public.gtm_workspace(text,jsonb) is
  'Authenticated GTM workspace for internal team sessions and trusted Supabase project connections. No separate GTM token.';
notify pgrst,'reload schema';
