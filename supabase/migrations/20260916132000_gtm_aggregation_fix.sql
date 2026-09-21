create or replace function public.gtm_api(
 p_token text,p_action text,p_entity text default null,p_id uuid default null,
 p_expected_version bigint default null,p_data jsonb default '{}',p_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare credential public.gtm_access_tokens; allowed text[]:=array['gtm_creators','gtm_accounts','gtm_campaigns','gtm_formats',
 'gtm_plans','gtm_collaborations','gtm_contents','gtm_activities','gtm_metric_snapshots','gtm_costs'];
before_row jsonb; after_row jsonb; result jsonb; related jsonb; key text; columns_sql text; values_sql text; update_sql text;
item jsonb; items jsonb; operation jsonb; arr jsonb; field text; link jsonb; target_id uuid; request_hash text; previous_request jsonb;
 limit_rows integer; offset_rows integer; readtable text;
begin
 select * into credential from public.gtm_access_tokens where token_hash=encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex')
  and revoked_at is null and expires_at>now();
 if not found then raise exception 'Invalid or expired GTM access token' using errcode='28000'; end if;
 if octet_length(coalesce(p_data,'{}')::text)>262144 then raise exception 'Request too large'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'p_data must be an object'; end if;
 if p_action is null then raise exception 'p_action is required'; end if;
 perform set_config('gtm.actor',credential.name,true);
 update public.gtm_access_tokens set last_used_at=now() where id in (
  select id from public.gtm_access_tokens where id=credential.id and (last_used_at is null or last_used_at<now()-interval '5 minutes')
  for update skip locked);
 if p_action='batch' then
  if jsonb_typeof(p_data->'operations') is distinct from 'array' or jsonb_array_length(p_data->'operations') not between 1 and 50 then raise exception 'Batch needs 1 to 50 operations'; end if;
  result:='[]';
  for operation in select value from jsonb_array_elements(p_data->'operations') loop
   if operation->>'action'='batch' then raise exception 'Nested batches are not supported'; end if;
   result:=result||jsonb_build_array(public.gtm_api(p_token,operation->>'action',operation->>'entity',
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
  readtable:=case when p_entity='gtm_plans' then 'gtm_plan_summary' else p_entity end;
  if p_action='get' then
   execute format('select to_jsonb(t) from public.%I t where id=$1',readtable) into result using p_id;
   related:=jsonb_build_object('activities',coalesce((select jsonb_agg(to_jsonb(a))from
    (select id,ref,kind,body,source_ref,occurred_at,payload from public.gtm_activities
     where entity=p_entity and entity_id=p_id and kind not like 'system.%' order by occurred_at desc limit 20)a),'[]'),
    'open_actions',coalesce((select jsonb_agg(to_jsonb(t))from public.gtm_today t where entity=p_entity and entity_id=p_id),'[]'));
   if p_entity='gtm_creators' then
    related:=related||jsonb_build_object('accounts',coalesce((select jsonb_agg(to_jsonb(a))from public.gtm_accounts a where creator_id=p_id and archived_at is null),'[]'),
     'collaborations',coalesce((select jsonb_agg(to_jsonb(c))from(select id,ref,title,status,plan_id,owner_id,due_at from public.gtm_collaborations where creator_id=p_id order by created_at desc limit 20)c),'[]'));
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
 if not credential.can_write then raise exception 'GTM token is read only' using errcode='42501'; end if;
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
end $$;
-- Read-only product aggregation. No candidate email, browser ID, or user ID leaves this function.
create or replace function public.gtm_url_decode(p_value text) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
declare token text; bytes bytea:=''::bytea;
begin
 for token in select (regexp_matches(replace(p_value,'+',' '),'(%[0-9A-Fa-f]{2}|.)','g'))[1] loop
  bytes:=bytes||case when token ~ '^%[0-9A-Fa-f]{2}$' then decode(substr(token,2),'hex') else convert_to(token,'UTF8') end;
 end loop;
 return convert_from(bytes,'UTF8');
exception when character_not_in_repertoire or untranslatable_character then return null;
end $$;

create or replace function public.gtm_parse_utm(p_type text) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare pair text; k text; v text; result jsonb:='{}';
begin
 if p_type is null or left(p_type,4)<>'utm:' then return result; end if;
 foreach pair in array string_to_array(substr(p_type,5),'&') loop
  k:=public.gtm_url_decode(split_part(pair,'=',1));
  v:=public.gtm_url_decode(substr(pair,position('=' in pair)+1));
  if k=any(array['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) and not(result?k) and position('=' in pair)>0 then
   result:=result||jsonb_build_object(k,v);
  end if;
 end loop;
 return result;
end $$;

create or replace function public.gtm_performance(p_options jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare start_time timestamptz:=coalesce((p_options->>'start_at')::timestamptz,now()-interval '30 days');
 end_time timestamptz:=least(coalesce((p_options->>'end_at')::timestamptz,now()),now());
 selected_plan uuid:=nullif(p_options->>'plan_id','')::uuid;
 selected_content uuid:=nullif(p_options->>'content_id','')::uuid;
 result jsonb;
begin
 if start_time>=end_time or end_time-start_time>interval '93 days' then raise exception 'Use a positive performance window of at most 93 days'; end if;
 with excluded_users as materialized (
  select u.user_id,lower(u.email)email from public.talent_users u
  where lower(email) like '%@matchharper.com' or lower(email)=any(array['hongbeom.heo@gmail.com','reason.jinny@gmail.com','rnfxlqcjf@naver.com','khj605123@gmail.com'])
   or exists(select 1 from public.logs l where l.user_id=u.user_id and l.type='analytics_excluded_test_fixture_talent')
 ), landing as materialized (
  select id,created_at,local_id,type from public.landing_logs
  where created_at>=start_time-interval '7 days' and created_at<end_time and local_id is not null
 ), identity_logs as materialized (
  select local_id,created_at,lower(substring(type from '^login_email:([^:]+)'))email from landing where type like 'login_email:%'
 ), excluded_local as materialized (
  select distinct i.local_id from identity_logs i join excluded_users u on u.email=i.email
  union select distinct q.payload->>'landingLocalId' from public.contact_queue q join excluded_users u on u.user_id=q.user_id
   where q.type='career_signup_no_profile_submit' and q.created_at>=start_time-interval '7 days' and q.created_at<end_time
 ), eligible_users as materialized (
  select u.user_id,lower(u.email)email,u.created_at from public.talent_users u
  where u.deleted_at is null and not exists(select 1 from excluded_users x where x.user_id=u.user_id)
 ), signup_events as materialized (
  select user_id,min(created_at)signed_at from public.logs where type='career_signup_completed' group by user_id
 ), first_signups as materialized (
  select u.user_id,u.email,coalesce(s.signed_at,u.created_at)signed_at,
   case when s.signed_at is null then 'profile_created_fallback' else 'signup_log' end signup_basis
  from eligible_users u left join signup_events s on s.user_id=u.user_id
  where coalesce(s.signed_at,u.created_at)>=start_time and coalesce(s.signed_at,u.created_at)<end_time
 ), server_identities as materialized (
  select distinct s.user_id,nullif(q.payload->>'landingLocalId','')local_id,'signup_server_record'::text basis
  from first_signups s join public.contact_queue q on q.user_id=s.user_id and q.type='career_signup_no_profile_submit'
  where q.created_at<end_time and nullif(q.payload->>'landingLocalId','') is not null
 ), legacy_identities as materialized (
  select local_id,min(email)email from identity_logs group by local_id having count(distinct email)=1
 ), identities as materialized (
  select * from server_identities
  union all
  select s.user_id,i.local_id,'legacy_login_email' from first_signups s join legacy_identities i on i.email=s.email
  where not exists(select 1 from server_identities x where x.user_id=s.user_id)
 ), touches as materialized (
  select l.id,l.created_at,l.local_id,public.gtm_parse_utm(l.type)params from landing l
  where l.type like 'utm:%' and not exists(select 1 from excluded_local x where x.local_id=l.local_id)
 ), acquisition_touches as materialized (
  select distinct on(s.user_id) s.user_id,t.params,t.created_at,i.basis
  from first_signups s join identities i on i.user_id=s.user_id join touches t on t.local_id=i.local_id
  where t.created_at<=s.signed_at and t.created_at>=s.signed_at-interval '7 days'
   and nullif(t.params->>'utm_source','') is not null
  order by s.user_id,t.created_at desc,t.id desc
 ), signup_completions as materialized (
  select s.user_id,min(e.created_at)completed_at from first_signups s join public.talent_activity_events e on e.talent_id=s.user_id
  where e.event_type='onboarding_completed' and e.created_at>=s.signed_at
   and e.created_at<s.signed_at+interval '7 days' and e.created_at<end_time group by s.user_id
 ), acquisition as materialized (
  select s.*,touch.params,touch.created_at touch_at,touch.basis identity_basis,
   completion.completed_at,s.signed_at+interval '7 days'<=end_time matured
  from first_signups s left join acquisition_touches touch on touch.user_id=s.user_id
   left join signup_completions completion on completion.user_id=s.user_id
 ), links as materialized (
  select c.id content_id,c.plan_id,l.link,c.published_at
  from public.gtm_contents c cross join lateral jsonb_array_elements(c.tracking_links)l(link)
 ), content_visits as (
  select k.content_id,count(distinct t.local_id)visitors from links k join touches t on t.params->>'utm_content'=k.link->>'id'
  where k.link->>'scope'='content' and t.created_at>=start_time and t.params->>'utm_source'=k.link->>'utm_source'
   and t.params->>'utm_campaign'=k.link->>'utm_campaign'
  group by k.content_id
 ), content_conversions as (
  select k.content_id,count(*)signups,count(*)filter(where a.completed_at is not null)completed_7d,
   count(*)filter(where a.matured)matured_signups,
   count(*)filter(where a.identity_basis='legacy_login_email')legacy_identity_signups,
   count(*)filter(where a.signup_basis='profile_created_fallback')fallback_signups
  from acquisition a join links k on a.params->>'utm_content'=k.link->>'id'
  where k.link->>'scope'='content' and a.params->>'utm_source'=k.link->>'utm_source'
   and a.params->>'utm_campaign'=k.link->>'utm_campaign'
  group by k.content_id
 ), content_costs as (
  select (a->>'content_id')::uuid content_id,sum(c.incurred_amount*c.fx_rate*(a->>'share')::numeric)incurred,
   count(*)filter(where c.incurred_amount is null)missing_cost_items,
   count(distinct c.base_currency)currency_count,min(c.base_currency)currency
  from public.gtm_costs c cross join lateral jsonb_array_elements(c.allocations)a
  where c.archived_at is null and a?'content_id' group by a->>'content_id'
 ), content_results as (
  select c.id,c.ref,c.title,c.creator_id,c.collaboration_id,c.plan_id,c.campaign_id,c.format_id,c.account_id,
   c.published_at,c.post_url,c.publish_status,c.distribution_type,
   case when tracked.present then coalesce(v.visitors,0) end landing_visitors,
   case when tracked.present then coalesce(x.signups,0) end signups,
   case when tracked.present then coalesce(x.completed_7d,0) end onboarding_completed_7d,
   case when tracked.present then coalesce(x.matured_signups,0) end matured_signups,
   coalesce(x.legacy_identity_signups,0)legacy_identity_signups,coalesce(x.fallback_signups,0)fallback_signups,
   costs.incurred allocated_lifetime_cost,costs.currency,
   case when costs.missing_cost_items=0 and costs.currency_count=1 and c.published_at>=start_time
     and c.published_at<end_time and x.completed_7d>0 then costs.incurred/x.completed_7d end provisional_cost_per_completion,
   case when jsonb_array_length(c.tracking_links)=0 then 'untracked' when c.published_at is null then 'not_published'
    when c.published_at+interval '21 days'>end_time then 'observing' else 'observed_window' end measurement_status
  from public.gtm_contents c cross join lateral (
   select exists(select 1 from jsonb_array_elements(c.tracking_links)l where l->>'scope'='content')present
  )tracked left join content_visits v on v.content_id=c.id left join content_conversions x on x.content_id=c.id
   left join content_costs costs on costs.content_id=c.id
  where c.archived_at is null and (selected_plan is null or c.plan_id=selected_plan) and (selected_content is null or c.id=selected_content)
 ), shared_results as (
  select k.link->>'scope' scope,k.link->>'target_id' target_id,k.link->>'plan_id' plan_id,
   count(*)signups,count(*)filter(where a.completed_at is not null)onboarding_completed_7d
  from acquisition a join links k on a.params->>'utm_content'=k.link->>'id'
  where k.link->>'scope'<>'content' and a.params->>'utm_source'=k.link->>'utm_source'
   and a.params->>'utm_campaign'=k.link->>'utm_campaign'
   and (selected_plan is null or k.link->>'plan_id'=selected_plan::text)
  group by k.link->>'scope',k.link->>'target_id',k.link->>'plan_id'
 ), product_completions as materialized (
  select e.talent_id,min(e.created_at)created_at from public.talent_activity_events e join eligible_users u on u.user_id=e.talent_id
  where e.event_type='onboarding_completed' group by e.talent_id
  having min(e.created_at)>=start_time and min(e.created_at)<end_time
 ), visits as materialized (
  select * from landing l where created_at>=start_time and (type ~ '^new_(visit|session)(:|$)')
   and not exists(select 1 from excluded_local x where x.local_id=l.local_id)
 ), daily as (
  select d.day::date as day,
   (select count(distinct local_id) from visits v where (v.created_at at time zone 'Asia/Seoul')::date=d.day::date)landing_visitors,
   (select count(*) from first_signups s where (s.signed_at at time zone 'Asia/Seoul')::date=d.day::date)signups,
   (select count(distinct talent_id) from product_completions e where (e.created_at at time zone 'Asia/Seoul')::date=d.day::date)onboarding_completion_events
  from generate_series((start_time at time zone 'Asia/Seoul')::date,((end_time-interval '1 microsecond') at time zone 'Asia/Seoul')::date,interval '1 day')d(day)
 )
 select jsonb_build_object(
  'start_at',start_time,'end_at',end_time,'generated_at',now(),'timezone','Asia/Seoul',
  'definition_version','gtm_observed_utm_v1','attribution','last_observed_explicit_utm_before_signup_7d',
  'product_overall',jsonb_build_object('landing_visitors',(select count(distinct local_id)from visits),
   'signups',(select count(*)from first_signups),'onboarding_completion_events',(select count(distinct talent_id)from product_completions),
   'signup_cohort_completed_7d',(select count(*)from acquisition where completed_at is not null),
   'signup_cohort_matured',(select count(*)from acquisition where matured),
   'signup_time_fallback',(select count(*)from first_signups where signup_basis='profile_created_fallback')),
  'actions',jsonb_build_object('outreach_sent',(select count(*)from public.gtm_activities where kind='message_sent' and occurred_at>=start_time and occurred_at<end_time),
   'research_results',(select count(*)from public.gtm_activities where kind='research_result' and occurred_at>=start_time and occurred_at<end_time),
   'published',(select count(*)from public.gtm_contents where published_at>=start_time and published_at<end_time)),
  'daily',coalesce((select jsonb_agg(to_jsonb(d)order by day)from daily d),'[]'),
  'contents',coalesce((select jsonb_agg(to_jsonb(c)order by ref)from content_results c),'[]'),
  'shared_attribution',coalesce((select jsonb_agg(to_jsonb(s))from shared_results s),'[]'),
  'limitations',jsonb_build_array('Visitors are browser IDs, not cross-device unique people.',
   'Existing UTM logging can suppress repeated identical UTM visits; attribution uses observed explicit UTM only.',
   'Source-only visits and unlinked identities cannot establish complete last-non-direct attribution.',
   'Content costs are lifetime allocations; CPA is provisional and is omitted when its cost window cannot be matched.',
   'Platform impressions and views require separate API or creator-submitted snapshots.')) into result;
 return result;
end $$;

revoke all on function public.gtm_url_decode(text),public.gtm_parse_utm(text),public.gtm_performance(jsonb) from public,anon,authenticated;
grant execute on function public.gtm_performance(jsonb) to service_role;
notify pgrst,'reload schema';
