-- Reason tags and the source message on every company decision path (S2).
--
-- Every channel now decides through one server function (decideOrgCandidates).
-- A decision keeps the company's reason as free text (reason_text) and tags
-- (reason_tags), and the chat/Slack message it came from (source_message_id).
--
-- Stage changes, stops and saves: record_company_progress_decision_v1
-- (20261105100000) wrote reason_tags as '{}' and no source message. The app now
-- puts both on the progress row (metadata.reasonTags, metadata.sourceMessageId)
-- and this version carries them into the decision. When the caller gave a key
-- for the decision (metadata.decisionKey), it becomes the decision's
-- idempotency key, so a retried request finds the decision it already made.
-- Everything else is unchanged.
--
-- Pass: pass_company_intro_v3 is pass_company_intro_v2 plus p_reason_tags.
-- v2 stays as it is for its callers (role start, the web before this deploy).
--
-- Which tags are allowed is checked by the app (allowedReasonTags); for now
-- they are the Role's criteria keys. Tags are company-side only.

create or replace function public.record_company_progress_decision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_channel text := nullif(new.metadata->>'decisionChannel', '');
  v_actor uuid := new.company_user_id;
  v_action text;
  v_detail jsonb := '{}'::jsonb;
  v_reason text;
  v_tags text[] := '{}';
  v_message bigint;
  v_decision_key text := nullif(btrim(coalesce(new.metadata->>'decisionKey', '')), '');
  v_key text := 'progress:' || new.id::text;
begin
  if new.role_id is null or new.talent_id is null or v_channel = 'system' then
    return new;
  end if;

  if new.metadata->>'sourceMessageId' ~ '^[0-9]{1,18}$' then
    v_message := (new.metadata->>'sourceMessageId')::bigint;
  end if;

  if new.kind = 'org_stage_change' then
    -- A rewrite of the same row (retried intro transition) is the same decision.
    if tg_op = 'UPDATE' or v_actor is null then
      return new;
    end if;
    v_action := case when new.metadata->>'stage' = 'process_stopped' then 'stop' else 'stage_change' end;
    v_detail := jsonb_strip_nulls(jsonb_build_object(
      'stage', new.metadata->'stage',
      'previousStage', new.metadata->'previousStage',
      'tag', new.metadata->'tag',
      'introRequested', new.metadata->'introRequested',
      'notifyCandidateOnClosure', new.metadata->'notifyCandidateOnClosure',
      'progressId', new.id
    ));
    v_reason := coalesce(
      nullif(btrim(new.metadata->>'stopNote'), ''),
      nullif(btrim(new.metadata->>'acceptReason'), '')
    );
    if jsonb_typeof(new.metadata->'reasonTags') = 'array' then
      select coalesce(array_agg(tag order by first_at), '{}') into v_tags
      from (
        select left(btrim(value), 200) as tag, min(ordinality) as first_at
        from jsonb_array_elements_text(new.metadata->'reasonTags') with ordinality
        where btrim(value) <> ''
        group by left(btrim(value), 200)
        order by min(ordinality)
        limit 20
      ) tags;
    end if;
    if v_decision_key is not null then
      v_key := 'decision:' || v_decision_key;
    end if;
  elsif new.kind = 'org_candidate_profile_first_view' then
    if tg_op = 'UPDATE' or v_actor is null then
      return new;
    end if;
    v_action := 'view';
    v_detail := jsonb_build_object('progressId', new.id);
    v_channel := coalesce(v_channel, nullif(new.metadata->>'source', ''), 'web');
  elsif new.kind = 'org_candidate_saved' then
    v_actor := coalesce(v_actor, case when new.metadata->>'actorUserId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then (new.metadata->>'actorUserId')::uuid end);
    if tg_op = 'UPDATE' and (old.metadata->'saved') is not distinct from (new.metadata->'saved') then
      return new;
    end if;
    v_action := case when new.metadata->>'saved' = 'true' then 'save' else 'unsave' end;
    v_detail := jsonb_strip_nulls(jsonb_build_object('stage', new.metadata->'stage', 'progressId', new.id));
    v_channel := coalesce(v_channel, 'web');
    v_key := case when v_decision_key is not null then 'decision:' || v_decision_key
      else v_key || ':' || v_action || ':' || extract(epoch from new.created_at)::text end;
  else
    return new;
  end if;

  select role.company_workspace_id into v_workspace
  from public.company_roles role where role.role_id = new.role_id;
  if v_workspace is null then
    return new;
  end if;
  if v_channel is null or v_channel not in ('web', 'todo', 'chat', 'slack', 'email', 'role_start') then
    v_channel := 'unknown';
  end if;

  perform public.record_company_decision_v1(
    v_workspace, new.role_id, 'member_candidate', new.talent_id, v_action,
    v_channel, v_actor, v_key, null, v_reason, v_tags, v_detail, v_message
  );
  return new;
end;
$$;

revoke all on function public.record_company_progress_decision_v1()
  from public, anon, authenticated, service_role;

create or replace function public.pass_company_intro_v3(
  p_intro_candidate_id uuid,
  p_company_workspace_id uuid,
  p_company_user_id uuid,
  p_channel text,
  p_reason_text text default null,
  p_source_message_id bigint default null,
  p_reason_tags text[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_intro record;
  v_tags text[];
begin
  select coalesce(array_agg(tag order by first_at), '{}') into v_tags
  from (
    select left(btrim(value), 200) as tag, min(ordinality) as first_at
    from unnest(coalesce(p_reason_tags, '{}')) with ordinality as input(value, ordinality)
    where btrim(coalesce(value, '')) <> ''
    group by left(btrim(value), 200)
    order by min(ordinality)
    limit 20
  ) tags;

  v_result := public.pass_company_intro_v1(
    p_intro_candidate_id, p_company_workspace_id, p_company_user_id
  );
  if v_result->>'status' = 'passed' then
    select intro.role_id, intro.talent_id, intro.revision into strict v_intro
    from public.company_intro_candidates intro
    where intro.id = p_intro_candidate_id;
    v_result := v_result || jsonb_build_object(
      'decisionId',
      public.record_company_decision_v1(
        p_company_workspace_id, v_intro.role_id, 'member_candidate',
        v_intro.talent_id, 'pass', p_channel, p_company_user_id,
        'company_intro:' || p_intro_candidate_id::text || ':pass:r' || v_intro.revision::text,
        p_intro_candidate_id, p_reason_text, v_tags, '{}'::jsonb,
        p_source_message_id
      )
    );
  end if;
  return v_result;
end;
$$;

revoke all on function public.pass_company_intro_v3(uuid, uuid, uuid, text, text, bigint, text[])
  from public, anon, authenticated;
grant execute on function public.pass_company_intro_v3(uuid, uuid, uuid, text, text, bigint, text[])
  to service_role;
