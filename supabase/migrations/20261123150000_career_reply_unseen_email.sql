-- A Career reply the candidate has not seen can reach them by email.
-- The browser records the newest message a visible Career chat displayed. A
-- reply that stays past that cursor, with no newer candidate message, wakes the
-- original Career agent once; it decides whether to email. Seeing the reply
-- cancels that wake, which also stops its turn and any queued email.

create table if not exists public.career_conversation_seen (
  conversation_id uuid primary key references public.talent_conversations(id) on delete cascade,
  user_id uuid not null,
  message_id bigint not null,
  seen_at timestamptz not null default now()
);
alter table public.career_conversation_seen enable row level security;
revoke all on table public.career_conversation_seen from public, anon, authenticated;
grant select, insert, update, delete on table public.career_conversation_seen to service_role;

create or replace function public.mark_career_messages_seen_v1(p_user uuid, p_conversation uuid, p_message_id bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare seen bigint; pending record;
begin
  perform 1 from public.talent_messages where id=p_message_id and user_id=p_user and conversation_id=p_conversation;
  if not found then return null; end if;
  insert into public.career_conversation_seen(conversation_id, user_id, message_id)
    values (p_conversation, p_user, p_message_id)
    on conflict (conversation_id) do update
      set message_id=greatest(public.career_conversation_seen.message_id, excluded.message_id), seen_at=now()
      where public.career_conversation_seen.user_id=excluded.user_id
    returning message_id into seen;
  if seen is null then return null; end if;
  for pending in select id from public.opportunity_discovery_run
    where talent_id=p_user and conversation_id=p_conversation and trigger='career_reply_unseen' and status='handed_off'
      and (trigger_payload#>>'{unseenReply,messageId}')::bigint<=seen
  loop
    perform public.cancel_career_background_run(pending.id, 'The candidate saw the reply in Career');
  end loop;
  return seen;
end $$;

-- Execution boundaries (run start, email send) re-read this before acting.
create or replace function public.career_unseen_reply_current_v1(p_user uuid, p_conversation uuid, p_reply bigint, p_source bigint)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists (select 1 from public.career_conversation_seen s
      where s.conversation_id=p_conversation and s.user_id=p_user and s.message_id<p_reply)
    and not exists (select 1 from public.talent_messages m
      where m.conversation_id=p_conversation and m.user_id=p_user and m.role='user' and m.id>p_source)
$$;

-- Only conversations whose browser recorded the candidate's own latest message
-- qualify, so history before this release and clients without the receipt never
-- look unseen. Email-origin inputs are answered by email already.
create or replace function public.admit_career_unseen_replies_v1(p_grace_seconds integer, p_window_seconds integer, p_limit integer default 20)
returns setof public.opportunity_discovery_run language plpgsql security invoker set search_path='' as $$
declare candidate record; run public.opportunity_discovery_run; run_id uuid;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('career_reply_unseen_scan', 0)) then return; end if;
  for candidate in
    with recent as (
      select distinct on (u.conversation_id) u.conversation_id, u.user_id, u.id as source_id, u.message_type
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

revoke all on function public.mark_career_messages_seen_v1(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.career_unseen_reply_current_v1(uuid, uuid, bigint, bigint) from public, anon, authenticated;
revoke all on function public.admit_career_unseen_replies_v1(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.mark_career_messages_seen_v1(uuid, uuid, bigint) to service_role;
grant execute on function public.career_unseen_reply_current_v1(uuid, uuid, bigint, bigint) to service_role;
grant execute on function public.admit_career_unseen_replies_v1(integer, integer, integer) to service_role;
