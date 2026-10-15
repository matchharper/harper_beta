-- When a confirmation does not directly follow the proposal message, resolve
-- returns needs_repreview and Harper shows the pending change again as a normal
-- Slack reply carrying updateProposalRef. Finalization rejected every reply with
-- that key, so the re-shown change never got a Slack timestamp, the job failed
-- after its retries, and each later confirmation asked for another re-show.
-- Accept the key only for this thread's pending, unexpired Slack proposal whose
-- exact preview the reply shows. The function exists only in the live database;
-- preserve its body, owner, privileges and search path apart from this guard.
do $migration$
declare
  signature constant text :=
    'public.finalize_slack_company_agent_reply_v1(uuid,text,text)';
  rejected_proposal_ref constant text := $guard$
     or v_assistant.metadata ? 'updateProposalRef'
$guard$;
  reshown_proposal_ref constant text := $guard$
     or (
       v_assistant.metadata ? 'updateProposalRef'
       and not exists (
         select 1
         from public.company_agent_update_proposals proposal
         where proposal.id::text = v_assistant.metadata #>> '{updateProposalRef,proposalId}'
           and proposal.workspace_id = v_workspace_id
           and proposal.source = 'slack'
           and proposal.slack_thread_id = v_thread.id
           and proposal.status = 'pending'
           and proposal.expires_at > v_now
           and position(nullif(proposal.preview, '') in v_assistant.content) > 0
       )
     )
$guard$;
  definition text;
begin
  definition := pg_get_functiondef(signature::regprocedure);
  if position(reshown_proposal_ref in definition) > 0 then
    return;
  end if;
  if (length(definition) - length(replace(definition, rejected_proposal_ref, '')))
     / length(rejected_proposal_ref) <> 1 then
    raise exception 'Unexpected updateProposalRef guard in %', signature;
  end if;
  execute replace(definition, rejected_proposal_ref, reshown_proposal_ref);
end $migration$;
