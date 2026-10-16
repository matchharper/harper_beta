-- Durable delivery facts: exact frozen mail, provider receipt, and recipient-wide retry identity.
-- Fresh table is service-only; no conversation judgment is persisted here.
alter table public.company_users add column if not exists email_preferences jsonb not null default '{}'::jsonb;
create table public.company_email_outbox (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.company_users(user_id),
 topic text not null,
 ordinal integer not null,
 status text not null default 'queued',
 snapshot jsonb not null,
 draft jsonb,
 delivery jsonb,
 attempt_count integer not null default 0,
 lease_owner uuid,
 lease_until timestamptz,
 available_at timestamptz not null default now(),
 attempted_at timestamptz,
 sent_at timestamptz,
 provider_id text,
 last_error text,
 created_at timestamptz not null default now(),
 unique(recipient_id, topic, ordinal)
);
alter table public.company_email_outbox enable row level security;
revoke all on public.company_email_outbox from public, anon, authenticated;
grant all on public.company_email_outbox to service_role;
create index company_email_outbox_due on public.company_email_outbox(available_at) where status in ('queued','processing','sending');

-- Read-only source also used verbatim by the local forecast. No credentials or candidate identities returned.
create or replace function public.company_connection_email_snapshot_v1(p_user_id uuid default null)
returns setof jsonb language sql stable security definer set search_path = public as $snapshot$
with eligible_roles as (
 select r.role_id, r.company_workspace_id, r.name, i.team_id,
   exists(select 1 from public.company_slack_integrations s where s.company_workspace_id=r.company_workspace_id
      and s.status='active' and s.bot_token_ciphertext is not null) as installed,
   exists(select 1 from public.company_slack_channels c join public.company_slack_integrations s
      on s.company_workspace_id=c.company_workspace_id and s.slack_team_id=c.slack_team_id
      where c.company_workspace_id=r.company_workspace_id and c.is_enabled
      and s.status='active' and s.bot_token_ciphertext is not null
      and not exists(select 1 from public.company_role_notification_channels x where x.role_id=r.role_id and x.channel_id=c.id)) as connected,
   (select count(*) from (select distinct on(t.talent_id) t.tag from public.talent_opportunity_tag t
      where t.opportunity_id=r.role_id order by t.talent_id,t.updated_at desc,t.created_at desc,t.id desc) t
      where t.tag='내부:연결대기') as pending,
   (select count(distinct c.talent_id) from public.company_intro_candidates c where c.role_id=r.role_id and c.status='ready') as ready,
   (select count(distinct c.talent_id) from public.company_intro_candidates c where c.role_id=r.role_id and c.status='ready'
      and exists(select 1 from public.company_first_slack_outbox o where c.id=any(o.candidate_ids)
        and o.sent_at is not null and o.slack_message_ts is not null)) as presented
 from public.company_roles r join public.company_internal_roles i on i.role_id=r.role_id
 join public.company_workspace w on w.company_workspace_id=r.company_workspace_id
 where w.is_internal and r.source_type='internal' and lower(trim(r.status))='active'
 and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>now())
 and coalesce(lower(trim(r.information->>'testOnly')),'') not in ('true','1','yes','on')
), workspaces as (
 select m.company_user_id, w.company_workspace_id,
 jsonb_build_object('id',w.company_workspace_id,'name',w.company_name,
  'internal',true,'membership',m.authority,
  'roles',jsonb_agg(jsonb_build_object('id',r.role_id,'name',r.name,'active',true,'testOnly',false,
    'canDeliverToSlack',false,'setupNeeded',case when not r.installed then 'Slack 앱 연결, 알림 채널 등록 및 역할 연결'
      else '이 역할의 알림을 받을 활성 Slack 채널 등록 및 연결' end,
    'pendingConnectionCount',r.pending,'readyCandidateCount',r.ready,'previouslyPresentedReadyCount',r.presented) order by r.role_id)) as workspace
 from public.company_user_workspace m join public.company_workspace w on w.company_workspace_id=m.company_workspace_id
 join eligible_roles r on r.company_workspace_id=m.company_workspace_id and not r.connected
 where m.authority in ('owner','admin') and (p_user_id is null or m.company_user_id=p_user_id)
 and (m.authority='owner' or m.access_scope='organization' or exists(
   select 1 from public.company_workspace_team_members tm join public.company_workspace_teams team on team.id=tm.team_id
   where tm.membership_id=m.id and tm.team_id=r.team_id and team.deleted_at is null))
 group by m.company_user_id,m.authority,w.company_workspace_id,w.company_name,w.published_name
)
select jsonb_build_object('id',u.user_id,'name',u.name,'email',lower(trim(a.email)),
 'locale',case when u.locale='en' then 'en' else 'ko' end,'verifiedEmail',true,
 'suppressed',coalesce((to_jsonb(u)->'email_preferences'->>'all_proactive')='false',false)
   or coalesce((to_jsonb(u)->'email_preferences'->>'slack_connection')='false',false),
 'workspaces',jsonb_agg(w.workspace order by w.company_workspace_id))
from public.company_users u join auth.users a on a.id=u.user_id join workspaces w on w.company_user_id=u.user_id
where a.email_confirmed_at is not null and a.deleted_at is null and (a.banned_until is null or a.banned_until<=now())
 and lower(trim(u.email))=lower(trim(a.email)) and nullif(trim(a.email),'') is not null
group by u.user_id,a.email order by u.user_id
$snapshot$;
revoke all on function public.company_connection_email_snapshot_v1(uuid) from public,anon,authenticated;
grant execute on function public.company_connection_email_snapshot_v1(uuid) to service_role;

create or replace function public.claim_company_connection_email_v1(p_user_id uuid,p_owner uuid,p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; j public.company_email_outbox; n integer; last_sent timestamptz; local_time timestamp:=p_now at time zone 'Asia/Seoul';
begin
 perform 1 from public.company_users where user_id=p_user_id for update;
 select * into s from public.company_connection_email_snapshot_v1(p_user_id);
 if s is null or (s->>'suppressed')::boolean then
   update public.company_email_outbox set status='cancelled',lease_owner=null,lease_until=null
    where recipient_id=p_user_id and topic='slack_connection' and attempted_at is null and status in ('queued','processing');
   update public.company_email_outbox set status='delivery_unknown',lease_owner=null,lease_until=null,last_error='Recipient no longer eligible after uncertain attempt'
    where recipient_id=p_user_id and topic='slack_connection' and attempted_at is not null and status in ('queued','processing','sending') and (lease_until is null or lease_until<=p_now);
   return null;
 end if;
 select * into j from public.company_email_outbox where recipient_id=p_user_id and topic='slack_connection'
   and status not in ('sent','cancelled') order by ordinal limit 1 for update;
 if found then
   if j.status in ('delivery_unknown','failed') or j.available_at>p_now or j.lease_until>p_now then return null; end if;
   if j.attempt_count>=5 then
     update public.company_email_outbox set status=case when attempted_at is null then 'failed' else 'delivery_unknown' end,lease_owner=null,lease_until=null where id=j.id; return null;
   end if;
   if j.attempted_at is not null and (j.attempted_at < p_now-interval '23 hours' or j.snapshot<>s) then
     update public.company_email_outbox set status='delivery_unknown',lease_owner=null,lease_until=null,
      last_error='Uncertain delivery: no automatic resend outside safe retry conditions' where id=j.id;
     return null;
   end if;
 else
   if extract(isodow from local_time) not in (1,3,5) or local_time::time < time '10:00' or local_time::time >= time '18:00' then return null; end if;
   select count(*),max(sent_at) into n,last_sent from public.company_email_outbox
    where recipient_id=p_user_id and topic='slack_connection' and status='sent';
   if n>=3 or (last_sent is not null and last_sent>p_now-case when n=1 then interval '48 hours' else interval '72 hours' end) then return null; end if;
   -- A cancelled, unattempted reservation may be reused; it has never left Harper.
   select * into j from public.company_email_outbox where recipient_id=p_user_id and topic='slack_connection' and ordinal=n+1 for update;
   if not found then
     insert into public.company_email_outbox(recipient_id,topic,ordinal,snapshot) values(p_user_id,'slack_connection',n+1,s) returning * into j;
   end if;
 end if;
 if extract(isodow from local_time) not in (1,3,5) or local_time::time < time '10:00' or local_time::time >= time '18:00' then return null; end if;
 update public.company_email_outbox set attempt_count=attempt_count+1,status='processing',lease_owner=p_owner,lease_until=p_now+interval '10 minutes',
   snapshot=case when attempted_at is null then s else snapshot end,
   draft=case when attempted_at is null and snapshot<>s then null else draft end,
   delivery=case when attempted_at is null and snapshot<>s then null else delivery end
   where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

-- This is the linearization point with opt-out. Existing sending mail cannot be recalled.
create or replace function public.prepare_company_email_send_v1(p_id uuid,p_owner uuid,p_delivery jsonb,p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.company_email_outbox; s jsonb; uid uuid;
begin
 select recipient_id into uid from public.company_email_outbox where id=p_id;
 perform 1 from public.company_users where user_id=uid for update;
 select * into j from public.company_email_outbox where id=p_id for update;
 if j.lease_owner is distinct from p_owner or j.lease_until<=p_now or j.status<>'processing' then return null; end if;
 select * into s from public.company_connection_email_snapshot_v1(uid);
 if s is null or (s->>'suppressed')::boolean or s<>j.snapshot then
   update public.company_email_outbox set status=case when attempted_at is null then 'cancelled' else 'delivery_unknown' end,
     lease_owner=null,lease_until=null,last_error='Eligibility or facts changed before delivery' where id=p_id;
   return null;
 end if;
 if j.attempted_at is not null and j.attempted_at<p_now-interval '23 hours' then
   update public.company_email_outbox set status='delivery_unknown',lease_owner=null,lease_until=null where id=p_id; return null;
 end if;
 if j.delivery is not null and j.attempted_at is not null and j.delivery<>p_delivery then raise exception 'frozen_delivery_changed'; end if;
 if p_delivery->>'to' is distinct from s->>'email' or nullif(p_delivery->>'subject','') is null
   or nullif(p_delivery->>'text','') is null or p_delivery->>'idempotencyKey' is distinct from 'company-notice/'||p_id::text then
   raise exception 'invalid_email_delivery';
 end if;
 update public.company_email_outbox set delivery=p_delivery,status='sending',attempted_at=coalesce(attempted_at,p_now) where id=p_id returning * into j;
 return to_jsonb(j);
end $$;
create or replace function public.finish_company_email_send_v1(p_id uuid,p_owner uuid,p_provider_id text,p_now timestamptz default now())
returns void language plpgsql security definer set search_path=public as $$
begin
 if nullif(trim(p_provider_id),'') is null then raise exception 'provider_receipt_required'; end if;
 update public.company_email_outbox set status='sent',provider_id=p_provider_id,sent_at=coalesce(sent_at,p_now),lease_owner=null,lease_until=null,last_error=null
 where id=p_id and lease_owner=p_owner and status='sending';
 if not found then raise exception 'email_delivery_lease_lost'; end if;
end $$;

create or replace function public.set_company_email_preference_v1(p_user_id uuid,p_topic text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if nullif(trim(p_topic),'') is null or p_enabled is null then raise exception 'email_preference_input_required'; end if;
 update public.company_users set email_preferences=jsonb_set(email_preferences,array[p_topic],to_jsonb(p_enabled),true)
 where user_id=p_user_id returning email_preferences into result;
 if not found then raise exception 'company_user_not_found'; end if;
 if not p_enabled then
   update public.company_email_outbox set status='cancelled',lease_owner=null,lease_until=null,last_error='Recipient opted out'
   where recipient_id=p_user_id and (p_topic='all_proactive' or topic=p_topic)
     and attempted_at is null and status in ('queued','processing');
 end if;
 return result;
end $$;
revoke all on function public.claim_company_connection_email_v1(uuid,uuid,timestamptz),public.prepare_company_email_send_v1(uuid,uuid,jsonb,timestamptz),public.finish_company_email_send_v1(uuid,uuid,text,timestamptz),public.set_company_email_preference_v1(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_company_connection_email_v1(uuid,uuid,timestamptz),public.prepare_company_email_send_v1(uuid,uuid,jsonb,timestamptz),public.finish_company_email_send_v1(uuid,uuid,text,timestamptz),public.set_company_email_preference_v1(uuid,text,boolean) to service_role;
