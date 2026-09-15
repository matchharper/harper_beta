-- A Slack message normally belongs to one internal conversation, but a
-- conversation-scope transition must not make the whole reply fail. Preserve
-- retry idempotency within one conversation while allowing the same Slack
-- identity to be represented in another conversation when necessary.
create unique index if not exists company_messages_slack_conversation_message_uidx
  on public.company_messages (
    conversation_id,
    slack_thread_id,
    slack_message_ts
  )
  where message_type = 'slack'
    and slack_thread_id is not null
    and nullif(slack_message_ts, '') is not null;

-- Keep Slack proposal activation idempotent under the replacement index. The
-- function belongs to the deployed baseline, so patch only its conflict target
-- while preserving the rest of its current implementation.
do $$
declare
  v_function text;
begin
  select pg_get_functiondef(
    to_regprocedure(
      'public.activate_slack_company_agent_update_proposal_v1(uuid,text,text)'
    )
  )
  into v_function;

  if v_function is null then
    raise exception 'activate_slack_company_agent_update_proposal_v1 not found';
  end if;

  if position(
    'on conflict (conversation_id, slack_thread_id, slack_message_ts)'
    in v_function
  ) = 0 then
    v_function := replace(
      v_function,
      'on conflict (slack_thread_id, slack_message_ts)',
      'on conflict (conversation_id, slack_thread_id, slack_message_ts)'
    );
  end if;

  if position(
    'on conflict (conversation_id, slack_thread_id, slack_message_ts)'
    in v_function
  ) = 0 then
    raise exception 'Slack proposal activation conflict target was not updated';
  end if;

  execute v_function;
end;
$$;

drop index if exists public.company_messages_slack_message_uidx;
