-- Web chat persists each tool-step message before continuing the same turn.
-- Keep retries of the same message unique, including legacy sequence-less rows.
-- Terminal replies and Slack delivery retain their existing once-per-phase key.
begin;

create unique index company_messages_agent_turn_message_uidx
  on public.company_messages (
    (metadata->'agentTurn'->>'runId'),
    (metadata->'agentTurn'->>'phase'),
    (case
      when message_type = 'chat' and metadata->'agentTurn'->>'phase' = 'progress'
        then coalesce(metadata->'agentTurn'->>'sequence', '0')
      else '0'
    end)
  )
  where role = 'assistant'
    and metadata->'agentTurn'->>'runId' is not null
    and metadata->'agentTurn'->>'phase' is not null;

drop index public.company_messages_agent_turn_phase_uidx;

commit;
