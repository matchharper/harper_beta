-- An unseen Career reply is emailed only after the candidate closed Harper, and
-- only for work that took a while. Switching to another tab or app, or moving to
-- another Harper screen, must never send it: those leave the page open, so they
-- do not count as leaving.
--
-- Each loaded Career page reports that it is open (and keeps reporting while it
-- stays open) and reports once when the tab or browser closes it. A page that
-- stops reporting without a close report (a phone app sent to the background, a
-- crash) stays open here, so the reply is not emailed. Missing a close is the
-- safe side: the reply stays in the chat.

create table if not exists public.career_page_presence (
  page_id uuid primary key,
  user_id uuid not null,
  opened_at timestamptz not null default now(),
  alive_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists career_page_presence_user_alive_idx on public.career_page_presence (user_id, alive_at desc);
alter table public.career_page_presence enable row level security;
revoke all on table public.career_page_presence from public, anon, authenticated;
grant select, insert, update, delete on table public.career_page_presence to service_role;

-- p_closed=false: the page is open (first load, heartbeat, or restored from the back/forward cache).
-- p_closed=true: the tab or browser closed the page.
create or replace function public.mark_career_page_presence_v1(p_user uuid, p_page uuid, p_closed boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare pending record; kept uuid;
begin
  insert into public.career_page_presence(page_id, user_id, alive_at, closed_at)
    values (p_page, p_user, now(), case when p_closed then now() end)
    on conflict (page_id) do update
      set alive_at = case when p_closed then public.career_page_presence.alive_at else now() end,
          closed_at = case when p_closed then now() end
      where public.career_page_presence.user_id = excluded.user_id
    returning page_id into kept;
  if kept is null then return false; end if;
  if not p_closed then
    -- Harper is open again, so an email about an unseen reply is no longer needed.
    for pending in select id from public.opportunity_discovery_run
      where talent_id=p_user and trigger='career_reply_unseen' and status='handed_off'
    loop
      perform public.cancel_career_background_run(pending.id, 'The candidate has Career open');
    end loop;
  end if;
  return true;
end $$;

-- True when the candidate closed Harper after p_since and has no page still open.
-- A page still open within the last day (including one that stopped reporting
-- without closing) keeps it false.
create or replace function public.career_pages_closed_v1(p_user uuid, p_since timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists (select 1 from public.career_page_presence p
      where p.user_id=p_user and p.closed_at is not null and p.closed_at >= p_since)
    and not exists (select 1 from public.career_page_presence p
      where p.user_id=p_user and p.closed_at is null and p.alive_at >= p_since - interval '1 day')
$$;

-- Execution boundaries (run start, email send) re-read this before acting.
create or replace function public.career_unseen_reply_current_v1(p_user uuid, p_conversation uuid, p_reply bigint, p_source bigint)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists (select 1 from public.career_conversation_seen s
      where s.conversation_id=p_conversation and s.user_id=p_user and s.message_id<p_reply)
    and not exists (select 1 from public.talent_messages m
      where m.conversation_id=p_conversation and m.user_id=p_user and m.role='user' and m.id>p_source)
    and public.career_pages_closed_v1(p_user,
      (select m.created_at from public.talent_messages m where m.id=p_source and m.user_id=p_user))
$$;

-- p_min_work_seconds: the reply came at least this long after the candidate's message.
create or replace function public.admit_career_unseen_replies_v2(
  p_grace_seconds integer, p_window_seconds integer, p_min_work_seconds integer, p_limit integer default 20)
returns setof public.opportunity_discovery_run language plpgsql security invoker set search_path='' as $$
declare candidate record; run public.opportunity_discovery_run; run_id uuid;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('career_reply_unseen_scan', 0)) then return; end if;
  for candidate in
    with recent as (
      select distinct on (u.conversation_id) u.conversation_id, u.user_id, u.id as source_id, u.message_type,
        u.created_at as source_at
      from public.talent_messages u
      where u.role='user' and u.conversation_id is not null
        and u.created_at > now() - make_interval(secs => p_window_seconds)
      order by u.conversation_id, u.id desc
    )
    select recent.conversation_id, recent.user_id, recent.source_id, reply.id as reply_id, reply.created_at as reply_at
    from recent
    join public.career_conversation_seen seen
      on seen.conversation_id=recent.conversation_id and seen.user_id=recent.user_id
    cross join lateral (
      select m.id, m.created_at from public.talent_messages m
      where m.conversation_id=recent.conversation_id and m.user_id=recent.user_id
        and m.role='assistant' and m.message_type='chat' and m.id>recent.source_id
        and m.payload->>'careerTextReplyId' like 'invocation:%'
      order by m.id desc limit 1
    ) reply
    where recent.message_type is distinct from 'mail'
      and seen.message_id>=recent.source_id and seen.message_id<reply.id
      and reply.created_at <= now() - make_interval(secs => p_grace_seconds)
      and reply.created_at >= recent.source_at + make_interval(secs => p_min_work_seconds)
      and public.career_pages_closed_v1(recent.user_id, recent.source_at)
      and not public.is_talent_test_account(recent.user_id)
      and not exists (select 1 from public.talent_users t where t.user_id=recent.user_id and t.deleted_at is not null)
      and not exists (select 1 from public.opportunity_discovery_run d
        where d.talent_id=recent.user_id and d.dedupe_key='career-reply-unseen:'||reply.id)
    order by reply.id
    limit p_limit
  loop
    run_id := gen_random_uuid();
    insert into public.opportunity_discovery_run(id, talent_id, conversation_id, trigger, run_mode, status, dedupe_key,
      target_recommendation_count, trigger_payload)
    values (run_id, candidate.user_id, candidate.conversation_id, 'career_reply_unseen', 'immediate', 'handed_off',
      'career-reply-unseen:'||candidate.reply_id, 0,
      jsonb_build_object('runContract', 'career_agent_v1',
        -- A notification about one reply is not a discovery run; keep the periodic cadence unchanged.
        'cadencePolicy', jsonb_build_object('affectsBaseCadence', false),
        'unseenReply', jsonb_build_object('messageId', candidate.reply_id, 'sourceMessageId', candidate.source_id,
          'completedAt', candidate.reply_at),
        'agentInvocation', jsonb_build_object('replyId', 'background:'||run_id,
          'sourceMessageCursor', candidate.source_id, 'acceptedAt', now())))
    returning * into run;
    return next run;
  end loop;
end $$;

-- The web deployed before this migration calls v1; it now applies the same rule with a 3-minute minimum.
create or replace function public.admit_career_unseen_replies_v1(p_grace_seconds integer, p_window_seconds integer, p_limit integer default 20)
returns setof public.opportunity_discovery_run language sql security invoker set search_path='' as $$
  select * from public.admit_career_unseen_replies_v2(p_grace_seconds, p_window_seconds, 180, p_limit)
$$;

revoke all on function public.mark_career_page_presence_v1(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.career_pages_closed_v1(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.admit_career_unseen_replies_v2(integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.mark_career_page_presence_v1(uuid, uuid, boolean) to service_role;
grant execute on function public.career_pages_closed_v1(uuid, timestamptz) to service_role;
grant execute on function public.admit_career_unseen_replies_v2(integer, integer, integer, integer) to service_role;
