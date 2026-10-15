-- The company-side LLM can act on fresh, candidate-authored consent while
-- preparing this exact contact's delivery. Its claimed job and actor establish
-- provenance; cancelled contacts and stale consent remain excluded.
-- No schema, enum or qualitative-output constraints are added.
create or replace function public.confirm_internal_candidate_from_contact_v1(
  p_recommendation_id uuid, p_talent_id uuid, p_role_id uuid, p_stage text,
  p_actor_user_id uuid, p_actor_email text, p_text text, p_metadata jsonb,
  p_relay_id uuid
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_recommendation public.talent_opportunity_recommendation%rowtype;
  v_source_at timestamptz;
  v_source_id bigint;
begin
  select * into v_recommendation from public.talent_opportunity_recommendation
  where id = p_recommendation_id and talent_id = p_talent_id and role_id = p_role_id
  for update;
  if not found then return false; end if;
  select message.created_at, message.id into v_source_at, v_source_id
  from public.company_talent_relays relay
  join public.talent_messages message on message.id = relay.source_talent_message_id
  join public.contact_queue delivery on delivery.company_talent_relay_id = relay.id
  where relay.id = p_relay_id and relay.recommendation_id = p_recommendation_id
    and message.user_id = p_talent_id and message.role = 'user'
    and delivery.type = 'company_contact_company_delivery'
    and ((delivery.status = 'sent' and delivery.sent_at is not null)
      or (delivery.status in ('queued', 'processing', 'failed') and exists (
        select 1 from public.company_agent_web_action_jobs job
        where job.idempotency_key = 'candidate-contact:' || relay.id::text
          and job.status = 'processing'
          and job.actor_user_id = p_actor_user_id
          and job.action_context->>'contactPendingDelivery' = 'true'
      )));
  if not found then
    raise exception 'candidate_contact_consent_evidence_not_found';
  end if;
  if v_recommendation.saved_stage = 'closed' and v_source_at < v_recommendation.updated_at then
    raise exception 'candidate_contact_consent_evidence_superseded';
  end if;
  if exists (
    select 1 from public.company_talent_relays newer
    where newer.recommendation_id = p_recommendation_id
      and newer.source_talent_message_id > v_source_id
  ) then
    raise exception 'candidate_contact_consent_evidence_superseded';
  end if;
  return public.confirm_internal_candidate_reengagement_v1(
    p_recommendation_id, p_talent_id, p_role_id, p_stage,
    p_actor_user_id, p_actor_email, p_text,
    p_metadata || jsonb_build_object('consentSource', 'candidate_contact', 'relayId', p_relay_id)
  );
end;
$$;

revoke all on function public.confirm_internal_candidate_from_contact_v1(uuid, uuid, uuid, text, uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_internal_candidate_from_contact_v1(uuid, uuid, uuid, text, uuid, text, text, jsonb, uuid)
  to service_role;

