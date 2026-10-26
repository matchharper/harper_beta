-- Candidate mail is the fallback when a Role has no usable Slack destination.
-- Preserve the stored opt-in, recipient permissions, and all delivery receipts.
-- No backfill or requeue: this changes eligibility for new and pending deliveries.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.company_role_candidate_email_enabled_v1(p_role_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.company_roles role
    join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
    where role.role_id = p_role_id and role.source_type = 'internal'
      and (internal_role.email_notifications_enabled or not exists (
        select 1 from public.company_slack_channels channel
        join public.company_slack_integrations integration
          on integration.company_workspace_id = channel.company_workspace_id
          and integration.slack_team_id = channel.slack_team_id
        where channel.company_workspace_id = role.company_workspace_id and channel.is_enabled
          and integration.status = 'active' and integration.bot_token_ciphertext is not null
          and not exists (
            select 1 from public.company_role_notification_channels opt_out
            where opt_out.role_id = role.role_id and opt_out.channel_id = channel.id
          )
      ))
  );
$$;
revoke all on function public.company_role_candidate_email_enabled_v1(uuid) from public, anon, authenticated;
grant execute on function public.company_role_candidate_email_enabled_v1(uuid) to service_role;

create or replace function public.company_first_outbox_is_deliverable_v1(p_outbox_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_first_slack_outbox outbox
    where outbox.id=p_outbox_id and cardinality(outbox.candidate_ids)>0
      and outbox.delivery_kind in ('company_first','accepted_connection')
      and (
        (outbox.delivery_channel='slack' and exists (
          select 1 from public.company_slack_channels channel
          join public.company_slack_integrations integration on integration.company_workspace_id=outbox.company_workspace_id
            and integration.status='active' and integration.bot_token_ciphertext is not null
          where channel.id=outbox.channel_id and channel.company_workspace_id=outbox.company_workspace_id and channel.is_enabled))
        or outbox.delivery_channel='email'
      )
      and not exists (
        select 1 from unnest(outbox.candidate_ids) candidate(id)
        left join public.company_intro_candidates intro on intro.id=candidate.id and intro.company_workspace_id=outbox.company_workspace_id
        left join public.company_roles role on role.role_id=intro.role_id
        left join public.company_internal_roles internal_role on internal_role.role_id=intro.role_id
        left join public.company_workspace workspace on workspace.company_workspace_id=outbox.company_workspace_id
        left join public.talent_users talent on talent.user_id=intro.talent_id
        left join public.talent_setting setting on setting.user_id=intro.talent_id
        left join public.talent_opportunity_recommendation rec on rec.id=intro.recommendation_id
        where intro.id is null or talent.user_id is null or talent.deleted_at is not null
          or setting.user_id is null or setting.is_onboarding_done is not true or setting.get_internal_recommendation is false
          or setting.profile_visibility is null
          or (outbox.delivery_kind='company_first' and setting.profile_visibility<>'open_to_matches')
          or (outbox.delivery_kind='accepted_connection' and setting.profile_visibility not in ('open_to_matches','exceptional_only'))
          or exists (select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
            where lower(btrim(blocked.name)) in (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
          or role.role_id is null or role.source_type<>'internal' or role.status<>'active' or coalesce(role.is_expired,false)
          or (role.expires_at is not null and role.expires_at<=now())
          or coalesce(lower(btrim(role.information->>'testOnly')),'') in ('true','1','yes','on')
          or public.role_matching_slot_type_v1(role.role_id,now())='unavailable'
          or (outbox.delivery_channel='slack' and exists (select 1 from public.company_role_notification_channels opt_out
            where opt_out.role_id=intro.role_id and opt_out.channel_id=outbox.channel_id))
          or (outbox.delivery_channel='email' and not public.company_role_candidate_email_enabled_v1(intro.role_id))
          or (outbox.delivery_kind='company_first' and (intro.status<>'ready' or internal_role.is_company_first_search is not true))
          or (outbox.delivery_kind='accepted_connection' and (
            intro.status<>'closed' or intro.close_reason is distinct from 'route_replaced'
            or intro.presentation->>'deliveryKind' is distinct from 'accepted_connection'
            or internal_role.is_harper_tailored_role is distinct from false
            or rec.id is null or rec.feedback is distinct from 'like' or rec.saved_stage is distinct from 'connected'
            or rec.opportunity_type='intro_request'
            or public.current_talent_recommendation_id_v1(rec.id)<>rec.id
            or rec.talent_id<>intro.talent_id or rec.role_id<>intro.role_id
            or exists (select 1 from public.talent_opportunity_recommendation newer
              where newer.talent_id=rec.talent_id and newer.role_id=rec.role_id
                and (newer.created_at,newer.id)>(rec.created_at,rec.id))
            or not exists (select 1 from public.talent_opportunity_tag tag
              where tag.talent_id=intro.talent_id and tag.opportunity_id=intro.role_id and tag.tag='내부:연결대기')
            or exists (select 1 from public.talent_opportunity_tag tag
              where tag.talent_id=intro.talent_id and tag.opportunity_id=intro.role_id
                and (tag.tag in ('내부:연결됨','내부:최종오퍼','내부:프로세스중단','내부:거절','내부:아카이브') or tag.tag like '내부단계:%'))
          ))
      )
  );
$$;

create or replace function public.prepare_company_candidate_digest_send_v1(
  p_id uuid, p_owner uuid, p_delivery jsonb, p_links jsonb, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.company_email_outbox; uid uuid; workspace uuid; eligible boolean;
begin
  select recipient_id into uid from public.company_email_outbox where id = p_id;
  perform 1 from public.company_users where user_id = uid for update;
  select * into j from public.company_email_outbox where id = p_id for update;
  if j.topic is distinct from 'candidate_digest' then raise exception 'candidate_digest_required'; end if;
  if j.lease_owner is distinct from p_owner or j.lease_until <= p_now or j.status <> 'processing' then return null; end if;
  workspace := (j.snapshot->>'workspaceId')::uuid;
  -- Every role in a recipient's mail must still be accessible and eligible for email.
  -- The web sender must build a separate role/candidate subset per recipient.
  select jsonb_array_length(j.snapshot->'roleIds') > 0 and not exists (
    select 1 from jsonb_array_elements_text(j.snapshot->'roleIds') role_id(id)
    where not exists (
      select 1 from public.company_roles role
      join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
        and public.company_role_candidate_email_enabled_v1(role.role_id)
      cross join lateral public.company_role_email_recipients_v1(role.role_id) recipient
      where role.role_id = role_id.id::uuid and role.company_workspace_id = workspace
        and recipient.user_id = uid and recipient.email = lower(btrim(p_delivery->>'to'))
    )
  ) into eligible;
  if not eligible then
    update public.company_email_outbox set status = case when attempted_at is null then 'cancelled' else 'delivery_unknown' end,
      lease_owner = null, lease_until = null, last_error = 'Eligibility or facts changed before delivery'
    where id = p_id returning * into j;
    return to_jsonb(j);
  end if;
  if j.attempted_at is not null and j.attempted_at < p_now - interval '23 hours' then
    update public.company_email_outbox set status = 'delivery_unknown', lease_owner = null, lease_until = null
    where id = p_id returning * into j;
    return to_jsonb(j);
  end if;
  if j.delivery is not null then
    if j.delivery <> p_delivery then raise exception 'frozen_delivery_changed'; end if;
  else
    if nullif(p_delivery->>'subject', '') is null or nullif(p_delivery->>'text', '') is null
      or nullif(p_delivery->>'html', '') is null
      or p_delivery->>'idempotencyKey' is distinct from 'company-notice/' || p_id::text then
      raise exception 'invalid_email_delivery';
    end if;
    insert into public.company_email_action_links
      (token_hash, email_outbox_id, company_workspace_id, company_user_id, intro_candidate_id, action, expires_at)
    select link->>'tokenHash', p_id, workspace, uid, (link->>'introCandidateId')::uuid, link->>'action', p_now + interval '7 days'
    from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) link;
    if exists (
      select 1 from public.company_email_action_links link
      left join public.company_intro_candidates intro on intro.id = link.intro_candidate_id
        and intro.company_workspace_id = workspace
      where link.email_outbox_id = p_id and (intro.id is null or not exists (
        select 1 from jsonb_array_elements_text(j.snapshot->'roleIds') role_id(id)
        where role_id.id::uuid = intro.role_id
      ))
    ) then raise exception 'candidate_digest_link_outside_authorized_roles'; end if;
  end if;
  update public.company_email_outbox set delivery = coalesce(delivery, p_delivery), status = 'sending',
    attempted_at = coalesce(attempted_at, p_now)
  where id = p_id returning * into j;
  return to_jsonb(j);
end $$;

create or replace function public.company_connection_email_snapshot_v1(p_user_id uuid default null)
returns setof jsonb language sql stable security definer set search_path = '' as $snapshot$
with eligible_roles as (
 select r.role_id, r.company_workspace_id, r.name, i.team_id,
   exists(select 1 from public.company_slack_integrations s where s.company_workspace_id=r.company_workspace_id
      and s.status='active' and s.bot_token_ciphertext is not null) as installed,
   exists(select 1 from public.company_slack_channels c join public.company_slack_integrations s
      on s.company_workspace_id=c.company_workspace_id and s.slack_team_id=c.slack_team_id
      where c.company_workspace_id=r.company_workspace_id and c.is_enabled
      and s.status='active' and s.bot_token_ciphertext is not null
      and not exists(select 1 from public.company_role_notification_channels x where x.role_id=r.role_id and x.channel_id=c.id))
   or (public.company_role_candidate_email_enabled_v1(r.role_id) and exists(select 1 from public.company_role_email_recipients_v1(r.role_id))) as connected,
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

create or replace function public.enqueue_company_scheduled_matching_v1(
  p_workspace uuid,p_role uuid,p_slot timestamptz,p_actor uuid,p_conversation uuid,p_activation_run uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare key text; prior record; role_row record; kind text; local_slot timestamp; weekday text; job record;
begin
  if p_slot is null or (p_activation_run is null and p_slot<>date_trunc('hour',p_slot)) then raise exception 'invalid_scheduled_slot'; end if;
  if p_activation_run is not null and not public.company_matching_activation_is_valid_v1(p_activation_run,p_workspace,p_role)
    then raise exception 'invalid_role_activation'; end if;
  if p_activation_run is not null then
    select scheduled_slot into p_slot from public.company_first_search_runs where id=p_activation_run;
  end if;
  key:=case when p_activation_run is null then public.company_scheduled_matching_key_v1(p_workspace,p_role,p_slot)
    else 'role-activation-matching:'||p_activation_run::text end;
  perform pg_advisory_xact_lock(hashtextextended('company_matching_enqueue:'||p_workspace::text,0));
  select id into prior from public.company_agent_web_action_jobs where idempotency_key=key;
  if found then return jsonb_build_object('status','already_queued','jobId',prior.id); end if;
  select id,status into prior from public.company_first_search_runs
    where company_workspace_id=p_workspace and role_id=p_role and scheduled_slot=p_slot
      and trigger_reason='scheduled' and p_activation_run is null order by created_at limit 1;
  if found then return jsonb_build_object('status','existing_legacy_run','runId',prior.id,'runStatus',prior.status); end if;
  if not exists(select 1 from public.company_user_workspace where company_workspace_id=p_workspace
      and company_user_id=p_actor and authority in ('owner','admin'))
    or not public.company_memory_scope_allowed_v1(p_workspace,p_actor,'role',null,p_role)
    then raise exception 'scheduled_actor_forbidden' using errcode='42501'; end if;
  select r.*,i.request,i.is_company_first_search,i.intro_search_date,i.intro_search_time,
    i.email_notifications_enabled into role_row
    from public.company_roles r join public.company_internal_roles i using(role_id)
    where r.role_id=p_role and r.company_workspace_id=p_workspace;
  if not found or role_row.source_type<>'internal' or role_row.status<>'active' or coalesce(role_row.is_expired,false)
    or role_row.expires_at<=now() or nullif(btrim(role_row.request),'') is null
    or lower(coalesce(role_row.information->>'testOnly','false')) in ('true','1','yes','on')
    then raise exception 'scheduled_role_unavailable'; end if;
  local_slot:=p_slot at time zone 'Asia/Seoul'; weekday:=to_char(local_slot,'Dy');
  kind:=public.role_matching_slot_type_v1(p_role,now());
  if kind not in ('free','paid') then raise exception 'scheduled_role_unavailable'; end if;
  if p_activation_run is null and (local_slot::date<>(now() at time zone 'Asia/Seoul')::date or p_slot>now()
    or not ((kind='paid' and weekday in ('Mon','Wed','Fri') and extract(hour from local_slot)=9)
      or (kind in ('free','paid') and role_row.is_company_first_search
        and weekday=any(coalesce(role_row.intro_search_date,array['Mon','Wed','Fri']))
        and extract(hour from local_slot)=coalesce(role_row.intro_search_time,9)
        and ((exists(select 1 from public.company_slack_channels c where c.company_workspace_id=p_workspace and c.is_enabled
          and not exists(select 1 from public.company_role_notification_channels o where o.channel_id=c.id and o.role_id=p_role)))
          or (public.company_role_candidate_email_enabled_v1(p_role) and exists(select 1 from public.company_role_email_recipients_v1(p_role))))))
   ) then raise exception 'scheduled_slot_not_due'; end if;
  select * into job from public.enqueue_company_agent_web_action_v1(p_workspace,p_conversation,p_role,p_actor,
    'scheduled_matching_review',jsonb_build_object('roleId',p_role,'scheduledSlot',p_slot,'activationRunId',p_activation_run),key);
  return jsonb_build_object('status','queued','jobId',job.job_id,'created',job.created);
end $$;

create or replace function public.company_scheduled_accepted_inventory_v1(p_workspace uuid,p_role uuid,p_activation_run uuid default null)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('acceptedUnintroduced',(select count(*) from public.talent_opportunity_recommendation rec
      where rec.role_id=p_role and public.accepted_role_pair_is_available_v1(rec.id)),
    'readyCompanyWide',(select count(distinct talent_id) from public.company_intro_candidates
      where company_workspace_id=p_workspace and status='ready'),
    'pendingForRole',(select count(*) from (select distinct on(talent_id) tag
      from public.talent_opportunity_tag where opportunity_id=p_role
      order by talent_id,updated_at desc,created_at desc,id desc) latest where tag='내부:연결대기'),
    'newRegistrations',case when exists(select 1 from public.company_first_search_runs where role_id=p_role
      and status='succeeded' and source_cutoff is not null) then (select count(*) from public.talent_users where deleted_at is null
      and created_at>(select max(source_cutoff) from public.company_first_search_runs
        where role_id=p_role and status='succeeded')) else null end,
    'newRegistrationsDenominator','All non-deleted accounts after the last completed Role cutoff; not role-retrieved or compatible unassessed people',
    'currentRoutes',to_jsonb(array_remove(array[
      case when public.role_matching_slot_type_v1(p_role,now())='paid'
        and (to_char(now() at time zone 'Asia/Seoul','Dy') in ('Mon','Wed','Fri')
          or public.company_matching_activation_is_valid_v1(p_activation_run,p_workspace,p_role)) then 'candidate_first' end,
      case when public.role_matching_slot_type_v1(p_role,now()) in ('free','paid')
        and ((i.is_company_first_search and to_char(now() at time zone 'Asia/Seoul','Dy')=any(coalesce(i.intro_search_date,array['Mon','Wed','Fri'])))
          or public.company_matching_activation_is_valid_v1(p_activation_run,p_workspace,p_role))
        and ((exists(select 1 from public.company_slack_channels c where c.company_workspace_id=p_workspace and c.is_enabled
          and not exists(select 1 from public.company_role_notification_channels o where o.channel_id=c.id and o.role_id=p_role)))
          or (public.company_role_candidate_email_enabled_v1(p_role) and exists(select 1 from public.company_role_email_recipients_v1(p_role))))
        then 'company_first' end],null)))
  from public.company_roles r join public.company_internal_roles i using(role_id)
  where r.role_id=p_role and r.company_workspace_id=p_workspace
$$;

revoke all on function public.company_first_outbox_is_deliverable_v1(uuid),
  public.prepare_company_candidate_digest_send_v1(uuid,uuid,jsonb,jsonb,timestamptz),
  public.company_connection_email_snapshot_v1(uuid),
  public.enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid,uuid),
  public.company_scheduled_accepted_inventory_v1(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.company_first_outbox_is_deliverable_v1(uuid),
  public.prepare_company_candidate_digest_send_v1(uuid,uuid,jsonb,jsonb,timestamptz),
  public.company_connection_email_snapshot_v1(uuid),
  public.enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid,uuid),
  public.company_scheduled_accepted_inventory_v1(uuid,uuid,uuid) to service_role;
commit;
