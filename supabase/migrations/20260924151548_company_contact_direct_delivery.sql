-- One contact capability, independent of message topic. No intent classifier,
-- follow-up table, or conversational state machine is introduced.
create or replace function public.company_talent_pair_is_contactable_v1(
  p_workspace_id uuid, p_role_id uuid, p_talent_id uuid, p_recommendation_id uuid
) returns boolean
language sql stable security invoker set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_roles role
    join public.talent_opportunity_recommendation rec
      on rec.role_id = role.role_id and rec.talent_id = p_talent_id and rec.id = p_recommendation_id
    join public.talent_users talent on talent.user_id = rec.talent_id
    left join lateral (
      select btrim(t.tag) as tag from public.talent_opportunity_tag t
      where t.opportunity_id = role.role_id and t.talent_id = rec.talent_id
        and (btrim(t.tag) in ('내부:수락','내부:아카이브','내부:최종오퍼','내부:보류','내부:연결대기','내부:프로세스중단','내부:거절','내부:추천','내부:연결됨') or btrim(t.tag) like '내부단계:%')
      order by t.updated_at desc nulls last, t.created_at desc nulls last, t.id desc limit 1
    ) latest on true
    where role.role_id = p_role_id and role.company_workspace_id = p_workspace_id
      and coalesce(role.status, 'active') not in ('ended','deleted')
      and not coalesce(role.is_expired, false) and talent.deleted_at is null
      and nullif(btrim(talent.email), '') is not null
      and (not coalesce((role.information ->> 'testOnly')::boolean, false)
           or coalesce(role.information -> 'testTalentIds' ? p_talent_id::text, false))
      and (
        exists (
          select 1 from public.company_intro_candidates intro
          where intro.company_workspace_id = p_workspace_id and intro.role_id = p_role_id
            and intro.talent_id = p_talent_id and intro.recommendation_id = rec.id
            and intro.status = 'awaiting_talent' and intro.candidate_sent_at is not null
        )
        or (
          latest.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼','내부:프로세스중단')
          or latest.tag like '내부단계:%'
          -- Acceptance/closure alone is not a company-sharing grant. Preserve
          -- correspondence only with an actual prior handoff or delivery.
          or (rec.feedback = 'like' and coalesce(latest.tag, '') <> '내부:거절' and (
            exists (
              select 1 from public.company_talent_requests request
              join public.contact_queue delivery on delivery.company_talent_request_id = request.id
              where request.company_workspace_id = p_workspace_id
                and request.role_id = p_role_id and request.talent_id = p_talent_id
                and request.recommendation_id = rec.id
                and delivery.type = 'company_request_candidate_delivery'
                and delivery.status = 'sent' and delivery.sent_at is not null
            )
            or (rec.saved_stage = 'closed' and exists (
              select 1 from public.talent_progress progress
              where progress.recommendation_id = rec.id and progress.talent_id = p_talent_id
                and progress.role_id = p_role_id and progress.kind = 'org_stage_change'
                and (progress.metadata ->> 'stage' in ('pending_connection','connected','final_offer','process_stopped')
                  or progress.metadata ->> 'stage' like 'custom:%')
            ))
          ))
        )
      )
      and not exists (
        select 1 from public.company_intro_candidates intro
        where intro.recommendation_id = rec.id and intro.status in ('ready','closed','declined')
      )
  );
$$;

-- Recheck the relationship at dispatch as well as at creation. The existing
-- scheduler and delivery worker already call this function.
create or replace function public.company_talent_request_target_is_active_v1(p_request_id uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp
as $$
  select coalesce((select public.company_talent_pair_is_contactable_v1(
    request.company_workspace_id, request.role_id, request.talent_id, request.recommendation_id
  ) from public.company_talent_requests request where request.id = p_request_id), false);
$$;

create or replace function public.send_company_talent_contact_v1(
  p_request_id uuid, p_workspace_id uuid, p_role_id uuid, p_talent_id uuid,
  p_recommendation_id uuid, p_source_company_message_id bigint,
  p_subject text, p_body text, p_request_context text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_delivery public.contact_queue%rowtype;
  v_now timestamptz := transaction_timestamp();
begin
  if nullif(btrim(p_subject),'') is null or nullif(btrim(p_body),'') is null
     or nullif(btrim(p_request_context),'') is null then
    raise exception 'company_talent_contact_copy_required';
  end if;
  if length(p_subject) > 180 or length(p_body) > 5000 or length(p_request_context) > 800 then
    raise exception 'company_talent_contact_copy_too_long';
  end if;
  if not exists (
    select 1 from public.company_messages m where m.id = p_source_company_message_id
      and m.company_workspace_id = p_workspace_id and m.role = 'user'
  ) then raise exception 'company_talent_contact_source_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'company-contact:' || p_workspace_id::text || ':' || p_role_id::text || ':' || p_talent_id::text, 0));
  select * into v_request from public.company_talent_requests r
    where r.company_workspace_id = p_workspace_id and r.role_id = p_role_id
      and r.talent_id = p_talent_id and r.source_company_message_id = p_source_company_message_id
    order by r.created_at desc, r.id desc limit 1 for update;
  if found then
    select * into v_delivery from public.contact_queue q
      where q.company_talent_request_id = v_request.id and q.type = 'company_request_candidate_delivery'
      order by q.created_at desc, q.id desc limit 1;
    return jsonb_build_object('requestId',v_request.id,'status',coalesce(v_delivery.status,v_request.workflow_status),
      'scheduledAt',v_delivery.scheduled_at,'idempotent',true);
  end if;
  if not public.company_talent_pair_is_contactable_v1(p_workspace_id,p_role_id,p_talent_id,p_recommendation_id) then
    raise exception 'company_talent_request_target_not_active';
  end if;
  -- An unresolved draft/queued delivery must be inspected, not silently
  -- approved or overwritten by a new request. The existing unique index also
  -- protects against concurrent writers that do not take this advisory lock.
  if exists (select 1 from public.company_talent_requests r
      where r.company_workspace_id = p_workspace_id and r.role_id = p_role_id and r.talent_id = p_talent_id
        and r.workflow_status in ('draft','queued','failed') and r.expires_at > v_now
        and r.talent_source_message_id is null and r.document_id is null
        and r.in_reply_to_company_talent_relay_id is null) then
    raise exception 'company_talent_request_already_active';
  end if;
  insert into public.company_talent_requests (
    id, company_workspace_id, role_id, talent_id, recommendation_id, source_company_message_id,
    contact_kind, delivery_subject, delivery_body, request_context, draft_revision,
    expects_document, intent, workflow_status, approved_at, expires_at
  ) values (
    p_request_id,p_workspace_id,p_role_id,p_talent_id,p_recommendation_id,p_source_company_message_id,
    'contact',btrim(p_subject),btrim(p_body),btrim(p_request_context),1,false,'ordinary','queued',v_now,'infinity'
  ) returning * into v_request;
  insert into public.contact_queue (
    user_id,type,status,payload,scheduled_at,role_id,recommendation_id,company_talent_request_id
  ) values (
    p_talent_id,'company_request_candidate_delivery','queued',
    jsonb_build_object('requestId',v_request.id,'deliveryMode','immediate','delivery',
      jsonb_build_object('subject',v_request.delivery_subject,'chatText',v_request.delivery_body,'draftRevision',1)),
    v_now,p_role_id,p_recommendation_id,v_request.id
  );
  return jsonb_build_object('requestId',v_request.id,'status','queued','scheduledAt',v_now,'idempotent',false);
end;
$$;

revoke all on function public.company_talent_pair_is_contactable_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.company_talent_request_target_is_active_v1(uuid) from public,anon,authenticated;
revoke all on function public.send_company_talent_contact_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.company_talent_pair_is_contactable_v1(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.company_talent_request_target_is_active_v1(uuid) to service_role;
grant execute on function public.send_company_talent_contact_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) to service_role;

-- Actual delivered correspondence can be replied to before intro acceptance.
-- Existing source/document consent checks and idempotency remain unchanged.
create or replace function public.create_company_talent_relay_v2(
  p_recommendation_id uuid,
  p_talent_id uuid,
  p_source_message_id bigint,
  p_relay_content text,
  p_document_id uuid default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_content text := btrim(coalesce(p_relay_content, ''));
  v_delivery_status text;
  v_first_response boolean := false;
  v_relay public.company_talent_relays%rowtype;
  v_request public.company_talent_requests%rowtype;
  v_role_id uuid;
  v_workspace_id uuid;
begin
  if v_content = '' and p_document_id is null then
    raise exception using errcode = '22023', message = 'company_talent_relay_content_required';
  end if;
  if length(v_content) > 5000 then
    raise exception using errcode = '22001', message = 'company_talent_relay_content_too_long';
  end if;

  select recommendation.role_id, role.company_workspace_id
  into v_role_id, v_workspace_id
  from public.talent_opportunity_recommendation recommendation
  join public.company_roles role on role.role_id = recommendation.role_id
  where recommendation.id = p_recommendation_id
    and recommendation.talent_id = p_talent_id
    and (recommendation.feedback = 'like' or (
      public.company_talent_pair_is_contactable_v1(role.company_workspace_id, role.role_id, p_talent_id, recommendation.id)
      and exists (
        select 1 from public.company_talent_requests request
        join public.contact_queue delivery on delivery.company_talent_request_id = request.id
        where request.recommendation_id = recommendation.id and request.talent_id = p_talent_id
          and delivery.type = 'company_request_candidate_delivery'
          and delivery.status = 'sent' and delivery.sent_at is not null
      )
    ));
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_connection_not_found';
  end if;

  if exists (
    select 1
    from public.company_roles role
    where role.role_id = v_role_id
      and coalesce((role.information ->> 'testOnly')::boolean, false)
      and not coalesce(role.information -> 'testTalentIds' ? p_talent_id::text, false)
  ) then
    raise exception using errcode = 'P0001', message = 'test_only_company_contact_not_relayable';
  end if;

  -- A mutual relationship is established by one of three durable facts:
  -- a company contact that reached the talent, a company-first intro accepted
  -- into connecting/connected, or a company-visible pipeline stage after the
  -- normal Harper recommendation handoff.
  if not (
    exists (
      select 1
      from public.company_talent_requests request
      join public.contact_queue delivery
        on delivery.company_talent_request_id = request.id
       and delivery.type = 'company_request_candidate_delivery'
       and delivery.status = 'sent'
       and delivery.sent_at is not null
      where request.recommendation_id = p_recommendation_id
        and request.talent_id = p_talent_id
    )
    or exists (
      select 1
      from public.company_intro_candidates intro
      where intro.recommendation_id = p_recommendation_id
        and intro.talent_id = p_talent_id
        and intro.status in ('connecting', 'connected')
    )
    or exists (
      select 1
      from public.talent_opportunity_tag tag
      where tag.talent_id = p_talent_id
        and tag.opportunity_id = v_role_id
        and (
          tag.tag in ('내부:연결대기', '내부:연결됨', '내부:최종오퍼')
          or tag.tag like '내부단계:%'
        )
    )
    or exists (
      select 1
      from public.talent_progress progress
      where progress.recommendation_id = p_recommendation_id
        and progress.talent_id = p_talent_id
        and progress.role_id = v_role_id
        and progress.kind = 'org_stage_change'
        and (
          progress.metadata ->> 'stage' in (
            'pending_connection', 'connected', 'final_offer'
          )
          or progress.metadata ->> 'stage' like 'custom:%'
        )
    )
  ) then
    raise exception using errcode = 'P0001', message = 'company_talent_connection_not_established';
  end if;

  if not exists (
    select 1
    from public.talent_messages message
    where message.id = p_source_message_id
      and message.user_id = p_talent_id
      and message.role = 'user'
      and (p_document_id is not null or message.message_type <> 'resume_upload_note')
  ) then
    raise exception using errcode = 'P0002', message = 'candidate_message_evidence_not_found';
  end if;

  if p_document_id is not null and not exists (
    select 1
    from public.talent_documents document
    where document.id = p_document_id
      and document.talent_id = p_talent_id
      and document.kind = 'resume'
      and document.is_public = true
      and document.is_deleted = false
  ) then
    raise exception using errcode = 'P0002', message = 'candidate_relay_document_not_found';
  end if;

  if p_request_id is not null then
    select * into v_request
    from public.company_talent_requests request
    where request.id = p_request_id
      and request.recommendation_id = p_recommendation_id
      and request.talent_id = p_talent_id
      and request.role_id = v_role_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'company_talent_contact_not_found';
    end if;
    if not exists (
      select 1 from public.contact_queue delivery
      where delivery.company_talent_request_id = p_request_id
        and delivery.type = 'company_request_candidate_delivery'
        and delivery.status = 'sent' and delivery.sent_at is not null
    ) then
      raise exception 'company_talent_contact_not_delivered';
    end if;
    v_first_response := v_request.talent_source_message_id is null
      and v_request.document_id is null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_recommendation_id::text || ':' || p_source_message_id::text, 0)
  );
  select * into v_relay
  from public.company_talent_relays relay
  where relay.recommendation_id = p_recommendation_id
    and relay.source_talent_message_id = p_source_message_id
  order by relay.created_at, relay.id
  limit 1
  for update;
  if found then
    select delivery.status into v_delivery_status
    from public.contact_queue delivery
    where delivery.company_talent_relay_id = v_relay.id
      and delivery.type = 'company_contact_company_delivery';
    return jsonb_build_object(
      'id', v_relay.id,
      'connectionId', 'recommendation:' || v_relay.recommendation_id::text,
      'recommendationId', v_relay.recommendation_id,
      'requestId', v_relay.company_talent_request_id,
      'status', coalesce(v_delivery_status, 'queued'),
      'idempotent', true,
      'contentMismatch', coalesce(v_relay.relay_content, '') <> v_content
        or v_relay.document_id is distinct from p_document_id
    );
  end if;

  insert into public.company_talent_relays (
    company_talent_request_id,
    recommendation_id,
    source_talent_message_id,
    relay_content,
    document_id
  ) values (
    p_request_id,
    p_recommendation_id,
    p_source_message_id,
    nullif(v_content, ''),
    p_document_id
  ) returning * into v_relay;

  if p_request_id is not null then
    if v_first_response then
      update public.company_talent_requests
      set talent_source_message_id = p_source_message_id,
          document_id = coalesce(document_id, p_document_id),
          workflow_status = case
            when workflow_status in ('awaiting_talent', 'closed', 'review_required')
              then 'relay_queued'
            else workflow_status
          end,
          expires_at = 'infinity'::timestamptz
      where id = p_request_id;
    else
      update public.company_talent_requests
      set updated_at = transaction_timestamp()
      where id = p_request_id;
    end if;
  end if;

  insert into public.contact_queue (
    user_id,
    type,
    status,
    payload,
    scheduled_at,
    role_id,
    recommendation_id,
    company_talent_request_id,
    company_talent_relay_id
  ) values (
    p_talent_id,
    'company_contact_company_delivery',
    'queued',
    jsonb_strip_nulls(jsonb_build_object(
      'connectionId', 'recommendation:' || p_recommendation_id::text,
      'recommendationId', p_recommendation_id,
      'requestId', p_request_id,
      'relayId', v_relay.id
    )),
    now(),
    v_role_id,
    p_recommendation_id,
    null,
    v_relay.id
  )
  on conflict (company_talent_relay_id, type)
    where company_talent_relay_id is not null
      and type = 'company_contact_company_delivery'
    do nothing;

  return jsonb_build_object(
    'id', v_relay.id,
    'connectionId', 'recommendation:' || v_relay.recommendation_id::text,
    'recommendationId', v_relay.recommendation_id,
    'requestId', v_relay.company_talent_request_id,
    'status', 'queued',
    'idempotent', false,
    'firstResponse', v_first_response
  );
end;
$$;

create or replace function public.read_company_talent_connections_v1(
  p_talent_id uuid, p_query text default null, p_limit integer default 20
)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(connection)), '[]'::jsonb) from (
    select 'recommendation:' || recommendation.id::text as "connectionId",
      recommendation.id as "recommendationId", role.role_id as "roleId",
      role.name as "roleName", workspace.company_name as "companyName",
      contact.delivery_body as "latestCompanyContact",
      recommendation.saved_stage as "positionState",
      latest_relay.relay_content as "latestCandidateContact",
      latest_relay.delivery_status as "deliveryStatus"
    from public.talent_opportunity_recommendation recommendation
    join public.company_roles role on role.role_id = recommendation.role_id
    join public.company_workspace workspace on workspace.company_workspace_id = role.company_workspace_id
    left join lateral (
      select request.id, request.delivery_body, request.created_at
      from public.company_talent_requests request
      where request.recommendation_id = recommendation.id and exists (
        select 1 from public.contact_queue delivery
        where delivery.company_talent_request_id = request.id
          and delivery.type = 'company_request_candidate_delivery'
          and delivery.status = 'sent' and delivery.sent_at is not null
      ) order by request.created_at desc limit 1
    ) contact on true
    left join lateral (
      select relay.relay_content, delivery.status as delivery_status
      from public.company_talent_relays relay
      left join public.contact_queue delivery on delivery.company_talent_relay_id = relay.id
        and delivery.type = 'company_contact_company_delivery'
      where relay.recommendation_id = recommendation.id
      order by relay.created_at desc limit 1
    ) latest_relay on true
    where recommendation.talent_id = p_talent_id
      and (recommendation.feedback = 'like' or (
        contact.id is not null
        and public.company_talent_pair_is_contactable_v1(role.company_workspace_id, role.role_id, p_talent_id, recommendation.id)
      ))
      and (not coalesce((role.information ->> 'testOnly')::boolean, false)
        or coalesce(role.information -> 'testTalentIds' ? p_talent_id::text, false))
      and (contact.id is not null or exists (
        select 1 from public.company_intro_candidates intro
        where intro.recommendation_id = recommendation.id
          and intro.talent_id = p_talent_id and intro.status in ('connecting', 'connected')
      ) or exists (
        select 1 from public.talent_opportunity_tag tag
        where tag.talent_id = p_talent_id and tag.opportunity_id = role.role_id
          and (tag.tag in ('내부:연결대기', '내부:연결됨', '내부:최종오퍼') or tag.tag like '내부단계:%')
      ) or exists (
        select 1 from public.talent_progress progress
        where progress.recommendation_id = recommendation.id and progress.talent_id = p_talent_id
          and progress.role_id = role.role_id and progress.kind = 'org_stage_change'
          and (progress.metadata ->> 'stage' in ('pending_connection', 'connected', 'final_offer')
            or progress.metadata ->> 'stage' like 'custom:%')
      ))
      and not exists (
        select 1 from regexp_split_to_table(lower(btrim(coalesce(p_query, ''))), '\s+') term
        where term <> '' and strpos(lower(workspace.company_name || ' ' || role.name), term) = 0
      )
    order by coalesce(contact.created_at, recommendation.updated_at) desc, recommendation.id
    limit least(30, greatest(1, coalesce(p_limit, 20)))
  ) connection;
$$;

revoke all on function public.create_company_talent_relay_v2(uuid,uuid,bigint,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_company_talent_relay_v2(uuid,uuid,bigint,text,uuid,uuid) to service_role;
revoke all on function public.read_company_talent_connections_v1(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.read_company_talent_connections_v1(uuid,text,integer) to service_role;
