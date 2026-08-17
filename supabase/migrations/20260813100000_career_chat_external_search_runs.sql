begin;

-- Minimal lease/progress fields for worker-owned opportunity runs.
--
-- lease_token fences writes from a worker that no longer owns the run.
-- lease_heartbeat_at distinguishes a dead worker from a live worker.
-- last_progress_at distinguishes a live-but-stuck worker from real progress.
alter table public.opportunity_discovery_run
  add column if not exists lease_token uuid,
  add column if not exists lease_heartbeat_at timestamptz,
  add column if not exists last_progress_at timestamptz;

alter table public.opportunity_discovery_run
  drop constraint if exists opportunity_discovery_run_target_count_check;

alter table public.opportunity_discovery_run
  add constraint opportunity_discovery_run_target_count_check
  check (target_recommendation_count >= 1);

-- The namespace is shared with worker enqueue/claim producers. A per-talent
-- transaction lock makes the read/expire/insert decision atomic without a new
-- relation table.
create or replace function public.enqueue_career_job_posting_discovery_run(
  p_talent_id uuid,
  p_conversation_id uuid,
  p_dedupe_key text,
  p_fingerprint text,
  p_target_recommendation_count integer,
  p_trigger_payload jsonb,
  p_settings_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_stale_before timestamptz := now() - interval '2 hours';
  v_existing public.opportunity_discovery_run%rowtype;
  v_blocker public.opportunity_discovery_run%rowtype;
  v_replaced public.opportunity_discovery_run%rowtype;
  v_inserted public.opportunity_discovery_run%rowtype;
  v_blocker_payload jsonb;
  v_is_stale boolean;
  v_message_id bigint;
begin
  if p_talent_id is null then
    raise exception using errcode = '22023', message = 'career_search_talent_required';
  end if;
  if p_conversation_id is null then
    raise exception using errcode = '22023', message = 'career_search_conversation_required';
  end if;
  if coalesce(btrim(p_dedupe_key), '') = '' then
    raise exception using errcode = '22023', message = 'career_search_dedupe_key_required';
  end if;
  if coalesce(btrim(p_fingerprint), '') = '' then
    raise exception using errcode = '22023', message = 'career_search_fingerprint_required';
  end if;
  if p_target_recommendation_count is null
     or p_target_recommendation_count < 1 then
    raise exception using errcode = '22023', message = 'career_search_target_out_of_range';
  end if;
  if jsonb_typeof(p_trigger_payload) is distinct from 'object'
     or jsonb_typeof(p_trigger_payload->'request') is distinct from 'object'
     or jsonb_typeof(coalesce(p_settings_snapshot, '{}'::jsonb)) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'career_search_json_payload_invalid';
  end if;
  if coalesce(p_trigger_payload->>'runContract', '') <> 'career_chat_external_search_v1'
     or coalesce(p_trigger_payload->>'actionScope', '') <> 'external_only'
     or coalesce(p_trigger_payload->>'source', '') <> 'recommend_job_postings'
     or coalesce(p_trigger_payload->>'locksConversationInput', '') <> 'false'
     or coalesce(p_trigger_payload#>>'{request,sourceKind}', '') <> 'user_message'
     or coalesce(p_trigger_payload#>>'{request,invocationKind}', '') <> 'direct_user_request'
     or coalesce(p_trigger_payload#>>'{request,sourceId}', '') = ''
     or coalesce(p_trigger_payload#>>'{request,messageId}', '') = ''
     or coalesce(p_trigger_payload#>>'{request,text}', '') = ''
     or coalesce(p_trigger_payload#>>'{request,fingerprint}', '') <> p_fingerprint
     or coalesce(p_trigger_payload#>>'{request,maxResults}', '') <> p_target_recommendation_count::text then
    raise exception using errcode = '22023', message = 'career_search_payload_invalid';
  end if;
  if (p_trigger_payload#>>'{request,messageId}') !~ '^[0-9]+$'
     or (p_trigger_payload#>>'{request,sourceId}') <>
        (p_trigger_payload#>>'{request,messageId}') then
    raise exception using errcode = '22023', message = 'career_search_message_id_invalid';
  end if;
  v_message_id := (p_trigger_payload#>>'{request,messageId}')::bigint;
  if p_dedupe_key <> 'career_recommend_job_postings:' || p_talent_id::text ||
      ':user_message:' || v_message_id::text then
    raise exception using errcode = '22023', message = 'career_search_dedupe_key_invalid';
  end if;

  perform 1
  from public.talent_users
  where user_id = p_talent_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'career_search_talent_not_found';
  end if;

  perform 1
  from public.talent_conversations
  where id = p_conversation_id
    and user_id = p_talent_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'career_search_conversation_not_found';
  end if;

  perform 1
  from public.talent_messages
  where id = v_message_id
    and conversation_id = p_conversation_id
    and user_id = p_talent_id
    and role = 'user';
  if not found then
    raise exception using errcode = 'P0002', message = 'career_search_message_not_found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('opportunity_discovery_run:' || p_talent_id::text, 0)
  );

  perform 1
  from public.talent_setting
  where user_id = p_talent_id
    and get_external_recommendation = false;
  if found then
    return jsonb_build_object(
      'outcome', 'external_recommendations_disabled',
      'status_run', null
    );
  end if;

  select * into v_existing
  from public.opportunity_discovery_run
  where dedupe_key = p_dedupe_key
    and talent_id = p_talent_id
  order by created_at asc, id asc
  limit 1
  for update;

  if found then
    if v_existing.status in ('queued', 'running') then
      v_is_stale := case
        when v_existing.status = 'queued' then v_existing.created_at < v_stale_before
        when v_existing.lease_heartbeat_at is not null then
          v_existing.lease_heartbeat_at < v_stale_before
          or coalesce(
            v_existing.last_progress_at,
            v_existing.started_at,
            v_existing.updated_at,
            v_existing.created_at
          ) < v_stale_before
        else greatest(
          coalesce(v_existing.updated_at, '-infinity'::timestamptz),
          coalesce(v_existing.started_at, '-infinity'::timestamptz),
          v_existing.created_at
        ) < v_stale_before
      end;

      if v_is_stale then
        update public.opportunity_discovery_run
        set
          status = 'failed',
          completed_at = v_now,
          updated_at = v_now,
          lease_token = null,
          error_message = 'Opportunity search stopped after its progress lease expired.',
          coverage = coalesce(coverage, '{}'::jsonb) || jsonb_build_object(
            'failureKind', 'stale_timeout',
            'terminationReason', case
              when v_existing.status = 'queued' then 'not_claimed'
              when v_existing.lease_heartbeat_at is not null
                   and v_existing.lease_heartbeat_at < v_stale_before then 'no_heartbeat'
              else 'no_progress'
            end,
            'previousStatus', v_existing.status,
            'recoveredAt', v_now
          )
        where id = v_existing.id
          and status = v_existing.status
        returning * into v_existing;
      end if;
    end if;
    return jsonb_build_object(
      'outcome', 'deduplicated',
      'status_run', to_jsonb(v_existing)
    );
  end if;

  loop
    v_blocker := null;
    select * into v_blocker
    from public.opportunity_discovery_run run
    where run.talent_id = p_talent_id
      and run.status in ('queued', 'running')
    order by
      case when run.status = 'running' then 0 else 1 end,
      case
        when run.trigger = 'conversation_completed' then 0
        when run.trigger_payload->>'runContract' = 'career_chat_external_search_v1' then 1
        when run.trigger in (
          'immediate_opportunity_requested',
          'all_batch_feedback_submitted',
          'preference_became_more_active'
        ) then 2
        when run.trigger = 'periodic_refresh_due' then 3
        else 4
      end,
      run.created_at asc,
      run.id asc
    limit 1
    for update;

    exit when not found;
    v_is_stale := case
      when v_blocker.status = 'queued' then v_blocker.created_at < v_stale_before
      when v_blocker.lease_heartbeat_at is not null then
        v_blocker.lease_heartbeat_at < v_stale_before
        or coalesce(
          v_blocker.last_progress_at,
          v_blocker.started_at,
          v_blocker.updated_at,
          v_blocker.created_at
        ) < v_stale_before
      else greatest(
        coalesce(v_blocker.updated_at, '-infinity'::timestamptz),
        coalesce(v_blocker.started_at, '-infinity'::timestamptz),
        v_blocker.created_at
      ) < v_stale_before
    end;

    if v_is_stale then
      if v_replaced.id is null then
        v_replaced := v_blocker;
      end if;
      update public.opportunity_discovery_run
      set
        status = 'failed',
        completed_at = v_now,
        updated_at = v_now,
        lease_token = null,
        error_message = 'Opportunity search stopped after its progress lease expired.',
        coverage = coalesce(coverage, '{}'::jsonb) || jsonb_build_object(
          'failureKind', 'stale_timeout',
          'terminationReason', case
            when v_blocker.status = 'queued' then 'not_claimed'
            when v_blocker.lease_heartbeat_at is not null
                 and v_blocker.lease_heartbeat_at < v_stale_before then 'no_heartbeat'
            else 'no_progress'
          end,
          'previousStatus', v_blocker.status,
          'recoveredAt', v_now
        )
      where id = v_blocker.id
        and status = v_blocker.status;
    else
      v_blocker_payload := coalesce(v_blocker.trigger_payload, '{}'::jsonb);
      return jsonb_build_object(
        'outcome', case
          when v_blocker_payload#>>'{request,fingerprint}' = p_fingerprint
            then 'active_same_request'
          else 'active_different_request'
        end,
        'status_run', to_jsonb(v_blocker),
        'blocking_run', to_jsonb(v_blocker)
      );
    end if;
  end loop;

  insert into public.opportunity_discovery_run (
    conversation_id,
    dedupe_key,
    run_mode,
    settings_snapshot,
    status,
    talent_id,
    target_recommendation_count,
    trigger,
    trigger_payload
  ) values (
    p_conversation_id,
    p_dedupe_key,
    'immediate',
    coalesce(p_settings_snapshot, '{}'::jsonb),
    'queued',
    p_talent_id,
    p_target_recommendation_count,
    'immediate_opportunity_requested',
    p_trigger_payload
  )
  returning * into v_inserted;

  return jsonb_build_object(
    'outcome', case when v_replaced.id is null then 'queued' else 'stale_replaced' end,
    'status_run', to_jsonb(v_inserted),
    'replaced_run', case
      when v_replaced.id is null then null
      else to_jsonb(v_replaced)
    end
  );
end;
$$;

revoke all on function public.enqueue_career_job_posting_discovery_run(
  uuid, uuid, text, text, integer, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.enqueue_career_job_posting_discovery_run(
  uuid, uuid, text, text, integer, jsonb, jsonb
) to service_role;

-- The following migration performs an explicit duplicate-running preflight and
-- then adds the per-talent running-row unique safety net. Keeping it separate
-- makes a failed production preflight stop cleanly before the feature is enabled.

commit;
