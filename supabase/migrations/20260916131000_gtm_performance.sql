-- Read-only product aggregation. No candidate email, browser ID, or user ID leaves this function.
create function public.gtm_url_decode(p_value text) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
declare token text; bytes bytea:=''::bytea;
begin
 for token in select (regexp_matches(replace(p_value,'+',' '),'(%[0-9A-Fa-f]{2}|.)','g'))[1] loop
  bytes:=bytes||case when token ~ '^%[0-9A-Fa-f]{2}$' then decode(substr(token,2),'hex') else convert_to(token,'UTF8') end;
 end loop;
 return convert_from(bytes,'UTF8');
exception when character_not_in_repertoire or untranslatable_character then return null;
end $$;

create function public.gtm_parse_utm(p_type text) returns jsonb
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

create function public.gtm_performance(p_options jsonb default '{}') returns jsonb
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
