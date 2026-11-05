-- One company Harper run for decisions made in quick succession (G1b, D12).
--
-- Each Pass or intro request (web, Slack, email) woke company Harper with its
-- own run, so five quick clicks were five model runs; most ended silently.
-- Now such events join one run: the first opens a run that collects for a
-- short window (batchUntil), later ones in the same conversation are added to
-- its action_context.decisions while it is still queued, and the run starts
-- when the window ends. A repeated delivery of the same event (same key) is
-- recognised inside the batch, as before by its job key.
--
-- action_context of a batched run: {decisions: [...each event's context...],
-- batchKeys: [...each event's key...], batchUntil}.

create or replace function public.enqueue_company_agent_web_action_batched_v1(
  p_company_workspace_id uuid,
  p_conversation_id uuid,
  p_role_id uuid,
  p_actor_user_id uuid,
  p_action_name text,
  p_action_context jsonb,
  p_idempotency_key text,
  p_window_seconds integer
)
returns table(job_id uuid, created boolean, batch_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_job_id uuid;
  v_until timestamptz;
  v_created boolean;
begin
  if p_window_seconds is null or p_window_seconds not between 1 and 120 then
    raise exception using errcode = '22023', message = 'company_agent_batch_window_invalid';
  end if;
  if jsonb_typeof(coalesce(p_action_context, '{}'::jsonb)) <> 'object' or v_key = '' then
    raise exception using errcode = '22023', message = 'invalid_company_agent_web_action';
  end if;
  -- One batch decision at a time per conversation and event kind.
  perform pg_advisory_xact_lock(hashtextextended(
    'company_agent_web_action_batch:' || coalesce(p_conversation_id::text, '') || ':' || btrim(p_action_name), 0));

  -- The same event again: the run it already joined (or its own earlier run).
  select job.id, (job.action_context ->> 'batchUntil')::timestamptz into v_job_id, v_until
  from public.company_agent_web_action_jobs job
  where job.company_workspace_id = p_company_workspace_id
    and job.conversation_id = p_conversation_id
    and job.action_name = btrim(p_action_name)
    and (job.idempotency_key = v_key or coalesce(job.action_context -> 'batchKeys', '[]'::jsonb) ? v_key)
  order by job.created_at desc
  limit 1;
  if v_job_id is not null then
    return query select v_job_id, false, v_until;
    return;
  end if;

  -- A run still collecting: add this event to it.
  select job.id, (job.action_context ->> 'batchUntil')::timestamptz into v_job_id, v_until
  from public.company_agent_web_action_jobs job
  where job.company_workspace_id = p_company_workspace_id
    and job.conversation_id = p_conversation_id
    and job.action_name = btrim(p_action_name)
    and job.status = 'queued'
    and job.action_context ? 'batchUntil'
    and (job.action_context ->> 'batchUntil')::timestamptz > now()
  order by job.created_at desc
  limit 1
  for update;
  if v_job_id is not null then
    update public.company_agent_web_action_jobs job
    set action_context = jsonb_set(jsonb_set(job.action_context,
          '{decisions}', coalesce(job.action_context -> 'decisions', '[]'::jsonb) || jsonb_build_array(p_action_context)),
          '{batchKeys}', coalesce(job.action_context -> 'batchKeys', '[]'::jsonb) || to_jsonb(v_key)),
        updated_at = now()
    where job.id = v_job_id;
    return query select v_job_id, false, v_until;
    return;
  end if;

  v_until := now() + make_interval(secs => p_window_seconds);
  select enqueued.job_id, enqueued.created into v_job_id, v_created
  from public.enqueue_company_agent_web_action_v1(
    p_company_workspace_id, p_conversation_id, p_role_id, p_actor_user_id, p_action_name,
    jsonb_build_object('decisions', jsonb_build_array(p_action_context),
      'batchKeys', jsonb_build_array(v_key), 'batchUntil', v_until),
    v_key) enqueued;
  return query select v_job_id, v_created, v_until;
end;
$$;

revoke all on function public.enqueue_company_agent_web_action_batched_v1(uuid, uuid, uuid, uuid, text, jsonb, text, integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_company_agent_web_action_batched_v1(uuid, uuid, uuid, uuid, text, jsonb, text, integer)
  to service_role;
