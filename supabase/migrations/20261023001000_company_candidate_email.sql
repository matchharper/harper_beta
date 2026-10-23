-- Company candidate email: email is one more destination beside Slack channels.
-- Additive and backward compatible: email is off for every existing role, existing
-- outbox rows stay 'slack', and the Slack-connection mail keeps its own rules.
begin;

-- 1. Per-role email switch (off by default, like a role that never chose email).
alter table public.company_internal_roles
  add column if not exists email_notifications_enabled boolean not null default false;

-- 2. Who receives a role's candidate mail: role assignees plus workspace owners who
-- can still decide on candidates and pass the existing company-mail checks
-- (verified login email = profile email, not banned, proactive mail not stopped).
create or replace function public.company_role_email_recipients_v1(p_role_id uuid)
returns table(user_id uuid, email text, name text, locale text, authority text, is_assignee boolean)
language sql stable security definer set search_path = '' as $$
  with target as (
    select role.role_id, role.company_workspace_id
    from public.company_roles role where role.role_id = p_role_id
  ), people as (
    select assignee.company_user_id as user_id, true as is_assignee
    from public.company_role_assignees assignee join target on target.role_id = assignee.role_id
    union all
    select member.company_user_id, false
    from public.company_user_workspace member join target on target.company_workspace_id = member.company_workspace_id
    where member.authority = 'owner'
  ), distinct_people as (
    select people.user_id, bool_or(people.is_assignee) as is_assignee from people group by people.user_id
  )
  select profile.user_id, lower(btrim(account.email)), profile.name,
         case when profile.locale = 'en' then 'en' else 'ko' end, member.authority, person.is_assignee
  from distinct_people person
  cross join target
  join public.company_users profile on profile.user_id = person.user_id
  join auth.users account on account.id = profile.user_id
  join public.company_user_workspace member
    on member.company_user_id = profile.user_id and member.company_workspace_id = target.company_workspace_id
  where member.authority in ('owner', 'admin')
    and account.email_confirmed_at is not null and account.deleted_at is null
    and (account.banned_until is null or account.banned_until <= now())
    and nullif(btrim(account.email), '') is not null
    and lower(btrim(profile.email)) = lower(btrim(account.email))
    and coalesce(profile.email_preferences->>'all_proactive', '') <> 'false'
    and coalesce(profile.email_preferences->>'candidate_digest', '') <> 'false'
  order by person.is_assignee desc, profile.user_id
$$;
revoke all on function public.company_role_email_recipients_v1(uuid) from public, anon, authenticated;
grant execute on function public.company_role_email_recipients_v1(uuid) to service_role;

-- 3. The role-matching outbox carries email rows: no Slack channel, one row per
-- (run, kind, chunk) like a channel.
alter table public.company_first_slack_outbox
  add column if not exists delivery_channel text not null default 'slack';
alter table public.company_first_slack_outbox alter column channel_id drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_first_slack_outbox_delivery_channel_check') then
    alter table public.company_first_slack_outbox add constraint company_first_slack_outbox_delivery_channel_check
      check ((delivery_channel = 'slack' and channel_id is not null) or (delivery_channel = 'email' and channel_id is null));
  end if;
end $$;
create unique index if not exists company_first_slack_outbox_run_email_chunk_idx
  on public.company_first_slack_outbox (run_id, delivery_kind, chunk_index)
  where delivery_channel = 'email';

-- 4. Pre-send candidate check: email rows check the role's email switch instead of
-- the Slack channel and installation. Candidate checks are unchanged.
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
          or (outbox.delivery_channel='email' and internal_role.email_notifications_enabled is not true)
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
revoke all on function public.company_first_outbox_is_deliverable_v1(uuid) from public,anon,authenticated;
grant execute on function public.company_first_outbox_is_deliverable_v1(uuid) to service_role;

-- 5. Company mail table: 'candidate_digest' rows are counted per (recipient, run),
-- while 'slack_connection' keeps (recipient, topic, ordinal).
alter table public.company_email_outbox
  add column if not exists company_first_run_id uuid references public.company_first_search_runs(id) on delete cascade;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_email_outbox_candidate_digest_run_check') then
    alter table public.company_email_outbox add constraint company_email_outbox_candidate_digest_run_check
      check (topic <> 'candidate_digest' or company_first_run_id is not null);
  end if;
end $$;
create unique index if not exists company_email_outbox_recipient_topic_ordinal_idx
  on public.company_email_outbox (recipient_id, topic, ordinal) where topic <> 'candidate_digest';
-- No "if exists": a different constraint name must fail here, not later on the second digest.
alter table public.company_email_outbox drop constraint company_email_outbox_recipient_id_topic_ordinal_key;
create unique index if not exists company_email_outbox_candidate_digest_run_idx
  on public.company_email_outbox (recipient_id, company_first_run_id) where topic = 'candidate_digest';

-- 6. Per-recipient button links. Only the token hash is stored, like reply aliases
-- and meeting links. Service role only.
create table if not exists public.company_email_action_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email_outbox_id uuid not null references public.company_email_outbox(id) on delete cascade,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  company_user_id uuid not null references public.company_users(user_id) on delete cascade,
  intro_candidate_id uuid not null references public.company_intro_candidates(id) on delete cascade,
  action text not null check (action in ('request_intro', 'pass', 'accept_connection', 'reject_connection')),
  expires_at timestamptz not null,
  used_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
  unique (email_outbox_id, intro_candidate_id, action)
);
alter table public.company_email_action_links enable row level security;
revoke all on public.company_email_action_links from public, anon, authenticated;
grant all on public.company_email_action_links to service_role;

-- Reserve one candidate mail per (recipient, run) and lease it. Terminal rows are
-- returned as they are; null means another sender holds the lease.
create or replace function public.claim_company_candidate_digest_email_v1(
  p_user_id uuid, p_run_id uuid, p_owner uuid, p_snapshot jsonb, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare j public.company_email_outbox;
begin
  if p_owner is null or p_run_id is null or nullif(p_snapshot->>'workspaceId', '') is null
    or jsonb_typeof(p_snapshot->'roleIds') is distinct from 'array' then
    raise exception 'candidate_digest_input_required';
  end if;
  perform 1 from public.company_users where user_id = p_user_id for update;
  insert into public.company_email_outbox (recipient_id, topic, ordinal, company_first_run_id, snapshot)
  values (p_user_id, 'candidate_digest', 1, p_run_id, p_snapshot)
  on conflict do nothing;
  select * into j from public.company_email_outbox
  where recipient_id = p_user_id and topic = 'candidate_digest' and company_first_run_id = p_run_id for update;
  if not found then raise exception 'candidate_digest_reservation_missing'; end if;
  if j.status in ('sent', 'cancelled', 'failed', 'delivery_unknown') then return to_jsonb(j); end if;
  if j.lease_until > p_now and j.lease_owner is distinct from p_owner then return null; end if;
  if j.attempted_at is not null and j.attempted_at < p_now - interval '23 hours' then
    update public.company_email_outbox set status = 'delivery_unknown', lease_owner = null, lease_until = null,
      last_error = 'Uncertain delivery: no automatic resend outside safe retry conditions'
    where id = j.id returning * into j;
    return to_jsonb(j);
  end if;
  if j.attempt_count >= 5 then
    update public.company_email_outbox set status = case when attempted_at is null then 'failed' else 'delivery_unknown' end,
      lease_owner = null, lease_until = null
    where id = j.id returning * into j;
    return to_jsonb(j);
  end if;
  update public.company_email_outbox set attempt_count = attempt_count + 1, status = 'processing',
    lease_owner = p_owner, lease_until = p_now + interval '10 minutes'
  where id = j.id returning * into j;
  return to_jsonb(j);
end $$;

-- The opt-out linearization point for candidate mail. Freezes the exact mail and
-- creates its button links in the same transaction; a retry resends the frozen
-- mail, so links never change. NULL means the lease was lost (retry later); a row
-- that is not 'sending' was closed here (cancelled or delivery_unknown).
create or replace function public.prepare_company_candidate_digest_send_v1(
  p_id uuid, p_owner uuid, p_delivery jsonb, p_links jsonb, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare j public.company_email_outbox; uid uuid; workspace uuid; eligible boolean;
begin
  select recipient_id into uid from public.company_email_outbox where id = p_id;
  perform 1 from public.company_users where user_id = uid for update;
  select * into j from public.company_email_outbox where id = p_id for update;
  if j.topic is distinct from 'candidate_digest' then raise exception 'candidate_digest_required'; end if;
  if j.lease_owner is distinct from p_owner or j.lease_until <= p_now or j.status <> 'processing' then return null; end if;
  workspace := (j.snapshot->>'workspaceId')::uuid;
  select exists (
    select 1 from jsonb_array_elements_text(j.snapshot->'roleIds') role_id(id)
    join public.company_roles role on role.role_id = role_id.id::uuid and role.company_workspace_id = workspace
    join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
      and internal_role.email_notifications_enabled
    cross join lateral public.company_role_email_recipients_v1(role.role_id) recipient
    where recipient.user_id = uid and recipient.email = lower(btrim(p_delivery->>'to'))
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
      left join public.company_intro_candidates intro on intro.id = link.intro_candidate_id and intro.company_workspace_id = workspace
      where link.email_outbox_id = p_id and intro.id is null
    ) then raise exception 'candidate_digest_link_outside_workspace'; end if;
  end if;
  update public.company_email_outbox set delivery = coalesce(delivery, p_delivery), status = 'sending',
    attempted_at = coalesce(attempted_at, p_now)
  where id = p_id returning * into j;
  return to_jsonb(j);
end $$;

-- Record a button result once. A second call returns the first result unchanged.
create or replace function public.finish_company_email_action_v1(p_link_id uuid, p_result jsonb, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare link public.company_email_action_links;
begin
  if p_result is null then raise exception 'email_action_result_required'; end if;
  update public.company_email_action_links set used_at = p_now, result = p_result
  where id = p_link_id and used_at is null returning * into link;
  if not found then
    select * into link from public.company_email_action_links where id = p_link_id;
    if not found then raise exception 'email_action_link_not_found'; end if;
  end if;
  return to_jsonb(link);
end $$;

revoke all on function public.claim_company_candidate_digest_email_v1(uuid,uuid,uuid,jsonb,timestamptz),
  public.prepare_company_candidate_digest_send_v1(uuid,uuid,jsonb,jsonb,timestamptz),
  public.finish_company_email_action_v1(uuid,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_company_candidate_digest_email_v1(uuid,uuid,uuid,jsonb,timestamptz),
  public.prepare_company_candidate_digest_send_v1(uuid,uuid,jsonb,jsonb,timestamptz),
  public.finish_company_email_action_v1(uuid,jsonb,timestamptz) to service_role;

-- 7. Slack connection mail: a role that receives candidates by email (switch on and
-- at least one recipient, the worker's rule) no longer counts as needing Slack.
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
      and not exists(select 1 from public.company_role_notification_channels x where x.role_id=r.role_id and x.channel_id=c.id))
   or (i.email_notifications_enabled and exists(select 1 from public.company_role_email_recipients_v1(r.role_id))) as connected,
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

commit;
