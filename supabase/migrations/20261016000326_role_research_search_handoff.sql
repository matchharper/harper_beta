-- Persist the irreducible admission receipt on the existing job. A queue retry
-- after the search has finished must not enqueue another search for this request.
create or replace function public.enqueue_company_research_search_v1(p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_job public.company_agent_web_action_jobs%rowtype;
  v_result jsonb;
begin
  select * into v_job from public.company_agent_web_action_jobs where id = p_job_id for update;
  if not found or v_job.action_name <> 'role_search_kickoff' or v_job.role_id is null then
    raise exception 'research_job_not_found';
  end if;
  if v_job.action_context ? 'matchingSearchResult' then
    return v_job.action_context->'matchingSearchResult';
  end if;
  if v_job.status <> 'processing' then raise exception 'research_job_not_processing'; end if;
  if not exists (
    select 1 from public.company_messages m
    where m.company_workspace_id = v_job.company_workspace_id and m.role_id = v_job.role_id
      and m.role = 'assistant' and m.metadata->>'webActionJobId' = p_job_id::text
      and m.metadata->'companyMessageBatch' is not null
  ) or exists (
    select 1 from public.company_messages m
    where m.company_workspace_id = v_job.company_workspace_id and m.role_id = v_job.role_id
      and m.role = 'assistant' and m.metadata->>'webActionJobId' = p_job_id::text
      and m.metadata->'companyMessageBatch' is not null
      and nullif(m.metadata->'companyMessageReceipt'->>'slackMessageTs', '') is null
  ) then raise exception 'research_explanation_not_delivered'; end if;
  -- Existing admission owns membership, Role/test-only eligibility and search policy.
  v_result := public.enqueue_company_matching_search_v1(
    v_job.company_workspace_id, v_job.actor_user_id, v_job.role_id);
  update public.company_agent_web_action_jobs
    set action_context = coalesce(action_context, '{}'::jsonb) || jsonb_build_object('matchingSearchResult', v_result),
        updated_at = now()
    where id = p_job_id;
  return v_result;
end $$;
revoke all on function public.enqueue_company_research_search_v1(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_company_research_search_v1(uuid) to service_role;
