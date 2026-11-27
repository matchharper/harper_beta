-- An application form the candidate saw and left unanswered reaches them by email once.
-- 11/19-25: 279 of 557 application forms were never answered, and in 130 of those the
-- candidate never came back. The unseen-reply email (20261124120000) covers only a reply
-- the candidate never saw, so a form they saw and left got nothing.
--
-- The scan wakes the original Career agent once for a conversation whose chat the
-- candidate viewed and then left with open application forms (kind form, linked to a
-- role or opportunity, as read_open_career_forms reads them). A form counts when:
--   * a chat reply that the candidate's visible chat displayed places the form (its
--     [[form:id]] line), and the chat was displayed again after this revision was saved
--     (the placed form always shows its newest revision);
--   * it is the open revision, created in the last p_window_seconds;
--   * the candidate has written nothing in that conversation since it: no chat message,
--     email reply or call. Answering another form, or another action in Career, leaves
--     it waiting (review 11/27: answering one form of three left the other two unmailed);
--   * the candidate last viewed that chat, and closed every Harper page
--     (career_pages_closed_v1), at least p_grace_seconds ago;
--   * the unseen-reply email does not cover this departure: Harper's newest reply after the
--     candidate's latest message is not one it takes (admit_career_unseen_replies_v2: the newest
--     'invocation:' reply, unseen, at least p_reply_min_work_seconds after a message they saw,
--     within p_reply_window_seconds), and no unseen-reply run started since the candidate left
--     is still running or has emailed. One that ended without an email leaves the forms to this
--     one. Another unseen message (a quick second message of the same reply, a background run's
--     message) does not hold this one;
--   * Harper is not working in that chat: no turn there is running, other than one parked for the
--     candidate's answer or browser control (its reply could be one the unseen-reply email takes).
--   So for one departure one of the two emails starts, not both. A reply Harper writes after this
--   one started (a background result) is new and may still go by the unseen-reply email.
-- One run lists every such form of the conversation. A form revision is listed in one
-- run only, and a conversation gets at most one such run a day, so a form cannot be
-- mailed again and again. The agent decides on and writes the email. Reopening Harper
-- cancels the run, and run start and email send re-check
-- career_unanswered_forms_current_v1.

-- Execution boundaries (run start, email send) re-read this before acting. False once a
-- listed form was answered, revised or closed, the candidate wrote again (a chat message,
-- email reply or call), or Harper is open.
create or replace function public.career_unanswered_forms_current_v1(p_user uuid, p_conversation uuid, p_forms jsonb)
returns boolean language sql stable security invoker set search_path='' as $$
  with listed as (
    select (item->>'formId')::bigint as form_id, (item->>'revision')::integer as revision
    from jsonb_array_elements(case when jsonb_typeof(p_forms)='array' then p_forms else '[]'::jsonb end) item
  ), revisions as (
    select f.id, f.created_at, listed.form_id, listed.revision
    from listed
    join public.talent_messages f
      on f.user_id=p_user and f.conversation_id=p_conversation and f.message_type='career_form'
      and f.payload->>'formId'=listed.form_id::text and f.payload->>'revision'=listed.revision::text
  )
  select exists (select 1 from listed)
    and (select count(*) from revisions)=(select count(*) from listed)
    and not exists (select 1 from revisions
      where public.read_career_form_status(p_user, p_conversation, revisions.form_id, revisions.revision)<>'open')
    and not exists (select 1 from public.talent_messages m
      where m.conversation_id=p_conversation and m.user_id=p_user and m.role='user'
        and m.message_type in ('chat', 'mail', 'call_transcript')
        and m.id>(select min(revisions.id) from revisions))
    and public.career_pages_closed_v1(p_user, (select min(revisions.created_at) from revisions))
$$;

-- Whether a chat reply places the form, as parseCareerInlineUi reads it: a line of its own holding [[form:id]] or
-- [[forms:[...]]] with the id among positive integers. A line indented four spaces, a tab or a quote stays text.
-- A marker inside a fenced code block would count here; Harper does not write one there.
create or replace function public.career_reply_shows_form_v1(p_content text, p_form_id bigint)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(p_content, '') ~ ('(?n)^ {0,3}\[\[(form:[ \t]*'||p_form_id||'[ \t]*|forms:\[[ \t]*([1-9][0-9]*[ \t]*,[ \t]*)*'
    ||p_form_id||'([ \t]*,[ \t]*[1-9][0-9]*)*[ \t]*\])\]\][ \t\r]*$')
$$;

create or replace function public.admit_career_unanswered_forms_v1(
  p_grace_seconds integer, p_window_seconds integer, p_reply_min_work_seconds integer, p_reply_window_seconds integer,
  p_limit integer default 20)
returns setof public.opportunity_discovery_run language plpgsql security invoker set search_path='' as $$
declare candidate record; run public.opportunity_discovery_run; run_id uuid;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('career_form_unanswered_scan', 0)) then return; end if;
  for candidate in
    select seen.user_id, seen.conversation_id, seen.seen_at, forms.items, forms.newest, left_at.at as left_at,
      coalesce(last_input.id, 0) as source_id
    from public.career_conversation_seen seen
    cross join lateral (
      -- id: the newest message of the candidate, the agent's input cursor; words: their newest chat message,
      -- email reply or call.
      select max(u.id) as id, max(u.id) filter (where u.message_type in ('chat', 'mail', 'call_transcript')) as words
      from public.talent_messages u
      where u.conversation_id=seen.conversation_id and u.user_id=seen.user_id and u.role='user'
    ) last_input
    left join lateral (
      select u.message_type, u.created_at from public.talent_messages u where u.id=last_input.id
    ) latest on true
    -- When the candidate left Harper: the last report of any of their pages.
    cross join lateral (
      select max(coalesce(p.closed_at, p.alive_at)) as at from public.career_page_presence p where p.user_id=seen.user_id
    ) left_at
    cross join lateral (
      select jsonb_agg(jsonb_build_object('formId', waiting.form_id, 'revision', waiting.revision,
          'messageId', waiting.id, 'createdAt', waiting.created_at, 'form', waiting.payload) order by waiting.id) as items,
        (array_agg(waiting.form_id::text||':'||waiting.revision::text order by waiting.id desc))[1] as newest
      from (
        select f.id, f.created_at, f.payload,
          (f.payload->>'formId')::bigint as form_id, (f.payload->>'revision')::integer as revision
        from public.read_open_career_forms(seen.user_id, seen.conversation_id) f
        where coalesce(f.payload->>'kind', 'form')='form'
          and (f.payload->'relatedRefs' @> '[{"type":"role"}]' or f.payload->'relatedRefs' @> '[{"type":"opportunity"}]')
          and f.created_at > now() - make_interval(secs => p_window_seconds)
          and f.created_at <= now() - make_interval(secs => p_grace_seconds)
          and f.id > coalesce(last_input.words, 0)
          -- Shown: a reply that the visible chat displayed places this form, and the chat was displayed after
          -- this revision was saved. A form held for a bundled review is not shown yet. A reply placing the form
          -- comes after its first revision (formId).
          and seen.seen_at >= f.created_at
          and exists (select 1 from public.talent_messages r
            where r.conversation_id=f.conversation_id and r.user_id=f.user_id and r.role='assistant'
              and r.message_type='chat' and r.id>(f.payload->>'formId')::bigint and r.id<=seen.message_id
              and r.payload->>'hidden' is distinct from 'true'
              and public.career_reply_shows_form_v1(r.content, (f.payload->>'formId')::bigint))
          and not exists (select 1 from public.opportunity_discovery_run d
            where d.talent_id=f.user_id and d.trigger='career_form_unanswered'
              and d.trigger_payload->'unansweredForms' @> jsonb_build_array(jsonb_build_object(
                'formId', (f.payload->>'formId')::bigint, 'revision', (f.payload->>'revision')::integer)))
        order by f.id
        -- A safety bound for one email; a conversation normally has a few open application forms.
        limit 20
      ) waiting
    ) forms
    where forms.items is not null
      -- The receipt time is when the candidate last viewed this chat; the forms have waited since then.
      -- A chat last viewed over p_window_seconds ago cannot have shown a form from the window; this only
      -- keeps the scan to recently viewed conversations.
      and seen.seen_at <= now() - make_interval(secs => p_grace_seconds)
      and seen.seen_at > now() - make_interval(secs => p_window_seconds)
      -- Counted from leaving: a chat kept open for hours and closed just now waits p_grace_seconds more.
      and left_at.at <= now() - make_interval(secs => p_grace_seconds)
      -- Harper's newest reply after the candidate's latest input is one the unseen-reply email takes (the rule of
      -- admit_career_unseen_replies_v2, waiting out its grace too) and that email has not started for it yet.
      and not exists (
        select 1 from (
          select r.id, r.created_at from public.talent_messages r
          where r.conversation_id=seen.conversation_id and r.user_id=seen.user_id and r.role='assistant'
            and r.message_type='chat' and r.id>last_input.id
            and r.payload->>'careerTextReplyId' like 'invocation:%'
          order by r.id desc limit 1
        ) newest
        where newest.id>seen.message_id and seen.message_id>=last_input.id
          and latest.message_type is distinct from 'mail'
          and latest.created_at > now() - make_interval(secs => p_reply_window_seconds)
          and newest.created_at >= latest.created_at + make_interval(secs => p_reply_min_work_seconds)
          and not exists (select 1 from public.opportunity_discovery_run d
            where d.talent_id=seen.user_id and d.dedupe_key='career-reply-unseen:'||newest.id))
      -- The unseen-reply email started after the candidate left: it covers this departure while it runs and once it
      -- emailed, also after its reply window (review 11/27: otherwise the forms were emailed 3 hours later for the
      -- same departure). One that ended without an email (4 of 18 so far) leaves the forms to this one.
      and not exists (select 1 from public.opportunity_discovery_run d
        where d.talent_id=seen.user_id and d.conversation_id=seen.conversation_id and d.trigger='career_reply_unseen'
          and d.created_at >= left_at.at
          and (d.status in ('queued', 'running', 'handed_off')
            or exists (select 1 from public.talent_opportunity_delivery e
              where e.discovery_run_id=d.id and e.status in ('queued', 'retry', 'sending', 'sent'))))
      -- Harper is still working in this chat (a turn neither completed nor parked for the candidate's answer or
      -- browser control, as the chat shows it): its reply may be one the unseen-reply email takes, so the forms wait
      -- (review 11/27: an answered form starts a turn, and the other forms were emailed while it ran).
      and not exists (select 1 from public.talent_external_operations i
        where i.user_id=seen.user_id and i.conversation_id=seen.conversation_id and i.kind='career_invocation'
          and i.status<>'completed'
          and coalesce(i.request->>'cleanup', 'false')<>'true' and not i.request ? 'cleanup_browser_session'
          and coalesce(i.result#>>'{activity,waitingForReply}', 'false')<>'true')
      and public.career_pages_closed_v1(seen.user_id, seen.seen_at)
      and not public.is_talent_test_account(seen.user_id)
      and not exists (select 1 from public.talent_users t where t.user_id=seen.user_id and t.deleted_at is not null)
      -- At most one such email a day per conversation, whatever happened to the earlier run.
      and not exists (select 1 from public.opportunity_discovery_run d
        where d.talent_id=seen.user_id and d.conversation_id=seen.conversation_id
          and d.trigger='career_form_unanswered' and d.created_at > now() - interval '1 day')
    order by seen.seen_at
    limit p_limit
  loop
    run_id := gen_random_uuid();
    insert into public.opportunity_discovery_run(id, talent_id, conversation_id, trigger, run_mode, status, dedupe_key,
      target_recommendation_count, trigger_payload)
    values (run_id, candidate.user_id, candidate.conversation_id, 'career_form_unanswered', 'immediate', 'handed_off',
      'career-form-unanswered:'||candidate.newest, 0,
      jsonb_build_object('runContract', 'career_agent_v1',
        -- A notice about waiting forms is not a discovery run; keep the periodic cadence unchanged.
        'cadencePolicy', jsonb_build_object('affectsBaseCadence', false),
        'unansweredForms', candidate.items, 'chatSeenAt', candidate.seen_at, 'leftAt', candidate.left_at,
        'agentInvocation', jsonb_build_object('replyId', 'background:'||run_id,
          'sourceMessageCursor', candidate.source_id, 'acceptedAt', now())))
    returning * into run;
    return next run;
  end loop;
end $$;

-- Same as 20261124120000, and opening Harper also cancels a pending unanswered-form email.
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
    -- Harper is open again, so an email about an unseen reply or an unanswered form is no longer needed.
    for pending in select id from public.opportunity_discovery_run
      where talent_id=p_user and trigger in ('career_reply_unseen', 'career_form_unanswered') and status='handed_off'
    loop
      perform public.cancel_career_background_run(pending.id, 'The candidate has Career open');
    end loop;
  end if;
  return true;
end $$;

revoke all on function public.career_unanswered_forms_current_v1(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.career_reply_shows_form_v1(text, bigint) from public, anon, authenticated;
revoke all on function public.admit_career_unanswered_forms_v1(integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.mark_career_page_presence_v1(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.career_unanswered_forms_current_v1(uuid, uuid, jsonb) to service_role;
grant execute on function public.career_reply_shows_form_v1(text, bigint) to service_role;
grant execute on function public.admit_career_unanswered_forms_v1(integer, integer, integer, integer, integer) to service_role;
grant execute on function public.mark_career_page_presence_v1(uuid, uuid, boolean) to service_role;
