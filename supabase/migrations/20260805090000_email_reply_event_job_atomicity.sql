begin;

create or replace function public.create_email_inbound_event_and_job_v1(
  p_provider text,
  p_provider_email_id text,
  p_provider_event_id text,
  p_message_id text,
  p_from_email text,
  p_to_addresses text[],
  p_cc_addresses text[],
  p_subject text,
  p_received_at timestamptz,
  p_job_kind text,
  p_job_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_job_id uuid;
  v_inserted boolean := false;
begin
  select id into v_event_id
  from public.email_inbound_events
  where provider = p_provider
    and (
      provider_email_id = p_provider_email_id
      or (
        p_provider_event_id is not null
        and provider_event_id = p_provider_event_id
      )
    )
  limit 1
  for update;

  if v_event_id is null then
    begin
      insert into public.email_inbound_events (
        provider, provider_email_id, provider_event_id, message_id,
        from_email, to_addresses, cc_addresses, subject, received_at
      ) values (
        p_provider, p_provider_email_id, nullif(p_provider_event_id, ''),
        nullif(p_message_id, ''), nullif(p_from_email, ''),
        coalesce(p_to_addresses, '{}'::text[]),
        coalesce(p_cc_addresses, '{}'::text[]), nullif(p_subject, ''),
        p_received_at
      )
      returning id into v_event_id;
      v_inserted := true;
    exception when unique_violation then
      select id into v_event_id
      from public.email_inbound_events
      where provider = p_provider
        and (
          provider_email_id = p_provider_email_id
          or (
            p_provider_event_id is not null
            and provider_event_id = p_provider_event_id
          )
        )
      limit 1
      for update;
    end;
  end if;

  if v_event_id is null then
    raise exception using errcode = 'P0001', message = 'email_inbound_event_create_or_adopt_failed';
  end if;

  insert into public.email_reply_jobs (
    inbound_event_id, kind, metadata, status
  ) values (
    v_event_id, p_job_kind, coalesce(p_job_metadata, '{}'::jsonb), 'queued'
  )
  on conflict (inbound_event_id) do update
    set inbound_event_id = excluded.inbound_event_id
  returning id into v_job_id;

  return jsonb_build_object(
    'inboundEventId', v_event_id,
    'inserted', v_inserted,
    'jobId', v_job_id,
    'queued', true
  );
end;
$$;

revoke all on function public.create_email_inbound_event_and_job_v1(
  text, text, text, text, text, text[], text[], text, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_email_inbound_event_and_job_v1(
  text, text, text, text, text, text[], text[], text, timestamptz, text, jsonb
) to service_role;

commit;
