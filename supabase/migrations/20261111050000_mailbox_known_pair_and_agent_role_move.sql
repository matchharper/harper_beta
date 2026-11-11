begin;

-- PR-9: one company↔candidate message path (agent_contact_messages).
--
-- Deploy order: apply this migration BEFORE web deploy A. Web A's mailbox SQL
-- calls company_knows_candidate_for_role_v1 in every send and receive check
-- (agentContacts/store.ts openCorrespondenceSql), so without it all mailbox
-- traffic, introductions included, fails. The current web does not use
-- anything here, so applying it first is safe.
--
-- Plain agent correspondence for a candidate and Role is allowed once the
-- company has already seen this candidate for this Role. Introduction-only
-- effects (sharing materials, publishing in the Role inbox, meetings) keep the
-- candidate's active consent check in their callers. Hard boundaries (deleted
-- account, blocked company, test isolation, ended Role) stay in the web's
-- assertAgentContactPair. A declined or closed pair stays known: the
-- candidate's Harper decides whether to bother the candidate at all.
--
-- The evidence is the same the legacy relayable-connection reader used
-- (companyTalentRequests/server.ts fetchRelayableCompanyTalentConnections),
-- read for the candidate and Role rather than for one recommendation row:
-- company-visible pipeline tags, company-visible stage history, the legacy
-- introduction delivered to the company, a company Intro request (any status),
-- legacy company requests and candidate relays (Ops-only excluded), and
-- existing mailbox messages. No table changes; nothing is written.
create or replace function public.company_knows_candidate_for_role_v1(p_recommendation_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
   select 1 from public.talent_opportunity_recommendation rec
   join public.company_roles role on role.role_id=rec.role_id
   where rec.id=p_recommendation_id and (
     exists(select 1 from public.talent_opportunity_tag tag
       where tag.talent_id=rec.talent_id and tag.opportunity_id=rec.role_id
         and (tag.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼') or tag.tag like '내부단계:%'))
     or exists(select 1 from public.talent_progress progress
       where progress.talent_id=rec.talent_id and progress.role_id=rec.role_id
         and (progress.kind='intro_to_company'
           or (progress.kind='org_stage_change' and (progress.metadata->>'stage' in ('pending_connection','connected','final_offer')
             or progress.metadata->>'stage' like 'custom:%'))))
     or exists(select 1 from public.company_intro_candidates intro
       where intro.talent_id=rec.talent_id and intro.role_id=rec.role_id
         and intro.company_workspace_id=role.company_workspace_id and intro.requested_at is not null)
     or exists(select 1 from public.company_talent_requests request
       where request.talent_id=rec.talent_id and request.role_id=rec.role_id
         and request.company_workspace_id=role.company_workspace_id and not coalesce(request.ops_only,false))
     or exists(select 1 from public.company_talent_relays relay
       join public.talent_opportunity_recommendation relay_rec on relay_rec.id=relay.recommendation_id
       left join public.company_talent_requests relay_request on relay_request.id=relay.company_talent_request_id
       where relay_rec.talent_id=rec.talent_id and relay_rec.role_id=rec.role_id
         and not coalesce(relay_request.ops_only,false))
     or exists(select 1 from public.agent_contact_messages message
       where message.talent_id=rec.talent_id and message.role_id=rec.role_id
         and message.company_workspace_id=role.company_workspace_id)
   ))
$$;
revoke all on function public.company_knows_candidate_for_role_v1(uuid) from public,anon,authenticated;
grant execute on function public.company_knows_candidate_for_role_v1(uuid) to service_role;

-- The function runs in every mailbox send and receive check. Production already
-- has indexes that serve its lookups by candidate and Role
-- (talent_opportunity_tag_role_unique_lower_idx on talent_id, opportunity_id;
-- talent_progress_talent_role_created_at_idx and
-- talent_progress_kind_talent_role_created_at_idx on talent_id, role_id), checked
-- in the production catalog on 2026-11-11, so this migration adds no index.

-- The web Role-move "ask the candidate" question moves to the mailbox.
-- p_method='ask_candidate_agent' records the company's request after the same
-- checks, but sends nothing: the web then sends the question to the candidate's
-- Harper through agent_contact_messages, using the recorded message as its
-- source. Unlike 'ask_candidate' it records no approvedRoleMove: the
-- candidate's agreement moves nothing (owner decision for PR-9 review 2). The
-- company's Harper tells the team and a team member confirms the move, which
-- is recorded as the company's own move. It also refuses with request_pending
-- while an earlier role-move question to this candidate is unanswered: a legacy
-- request (the existing check) or a mailbox question (source.messageId = the
-- recorded request message) with no candidate message after it in its open
-- conversation. A request whose question never reached the mailbox does not
-- block; the same requestId retries that send. The existing
-- 'ask_candidate' and 'direct' methods are unchanged, so a web version deployed
-- before this migration keeps working. Edit the live definition in place, like
-- 20261103125705, so no other part of the function changes.
do $$
declare
  definition text;
  edits text[][] := array[
    array[
      'if p_method not in (''direct'',''ask_candidate'') then raise exception ''Invalid move method''; end if;',
      'if p_method not in (''direct'',''ask_candidate'',''ask_candidate_agent'') then raise exception ''Invalid move method''; end if;'
    ],
    array[
      'case when p_method=''ask_candidate'' then format(''Ask the candidate',
      'case when p_method=''ask_candidate_agent'' then format(''Ask the candidate about moving from %s to %s. If they agree, tell the team; a team member confirms the move.'',v_source.name,v_target.name)
    when p_method=''ask_candidate'' then format(''Ask the candidate'
    ],
    array[
      '  if p_method=''ask_candidate'' and exists (',
      $edit$  if p_method='ask_candidate_agent' and exists (
    select 1 from public.company_messages asked
    join public.agent_contact_messages question
      on question.company_workspace_id=asked.company_workspace_id and question.talent_id=p_talent_id
        and question.direction='to_talent' and question.source->>'kind'='company'
        and question.source->>'messageId'=asked.id::text
    join public.agent_contact_messages root on root.id=question.root_id and root.cancelled_at is null
    where asked.company_workspace_id=p_workspace_id and asked.metadata->>'talentId'=p_talent_id::text
      and asked.metadata->>'roleMoveRequestKey' is not null and asked.metadata->'roleMoveResult'->>'status'='requested'
      -- A candidate message after the question answers it.
      and not exists (select 1 from public.agent_contact_messages reply where reply.root_id=question.root_id
        and reply.direction='to_company' and reply.created_at>=question.created_at)
  ) then return jsonb_build_object('status','request_pending'); end if;
  if p_method in ('ask_candidate','ask_candidate_agent') and exists ($edit$
    ],
    array[
      '  elsif v_result is null then
    v_result := public.move_company_candidate_to_role_v1(',
      '  elsif p_method=''ask_candidate_agent'' then
    v_result := jsonb_build_object(''status'',''requested'',''requestId'',p_request_id,''targetRoleId'',p_target_role_id,
      ''sourceMessageId'',v_message_id,''recommendationId'',v_recommendation_id);
  elsif v_result is null then
    v_result := public.move_company_candidate_to_role_v1('
    ]
  ];
  i int;
begin
  definition := pg_get_functiondef('public.move_org_candidate_role_web_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,text,boolean,text,text,text)'::regprocedure);
  -- Already applied (a re-run): leave it as it is.
  if position('ask_candidate_agent' in definition) > 0 then return; end if;
  for i in 1..array_length(edits,1) loop
    if (length(definition)-length(replace(definition,edits[i][1],'')))/length(edits[i][1]) <> 1 then
      raise exception 'role_move_contract_changed: edit % does not match the live definition exactly once', i;
    end if;
    definition := replace(definition,edits[i][1],edits[i][2]);
  end loop;
  execute definition;
end $$;
revoke all on function public.move_org_candidate_role_web_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,text,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.move_org_candidate_role_web_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,text,boolean,text,text,text) to service_role;

commit;
