alter table public.talent_messages
  add column if not exists payload jsonb;

alter table public.talent_conversations
  add column if not exists career_coaching_activity_message_id bigint
  references public.talent_messages(id) on delete set null;

create index if not exists talent_messages_coaching_activity_lookup_idx
  on public.talent_messages (conversation_id, id desc)
  where message_type = 'career_coaching_activity';

drop index if exists public.talent_messages_one_open_coaching_activity_idx;
create unique index talent_messages_one_open_coaching_activity_idx
  on public.talent_messages (conversation_id)
  where message_type = 'career_coaching_activity'
    and payload ->> 'status' in ('suggested', 'active');

drop function if exists public.mutate_talent_career_coaching_activity(
  uuid, uuid, text, bigint, integer, text, text, text, text
);

create or replace function public.mutate_talent_career_coaching_activity(
  p_user_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_activity_message_id bigint default null,
  p_expected_revision integer default null,
  p_topic text default null,
  p_suggested_minutes integer default null,
  p_planned_minutes integer default null,
  p_agenda jsonb default null,
  p_channel text default null,
  p_idempotency_key text default null
)
returns public.talent_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_channel text := lower(trim(coalesce(p_channel, '')));
  v_topic text := nullif(left(trim(coalesce(p_topic, '')), 160), '');
  v_now timestamptz := now();
  v_row public.talent_messages%rowtype;
  v_open_row public.talent_messages%rowtype;
  v_status text;
  v_revision integer;
  v_next_topic text;
  v_next_suggested_minutes integer;
  v_next_planned_minutes integer;
  v_next_agenda jsonb;
  v_next_channel text;
begin
  if not exists (
    select 1
    from public.talent_conversations conversation
    where conversation.id = p_conversation_id
      and conversation.user_id = p_user_id
  ) then
    raise exception 'career coaching conversation unavailable' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_conversation_id::text, 0)
  );

  if v_action not in ('suggest', 'start', 'update', 'end') then
    raise exception 'invalid career coaching action' using errcode = '22023';
  end if;

  if v_channel <> '' and v_channel not in ('chat', 'call') then
    raise exception 'invalid career coaching channel' using errcode = '22023';
  end if;

  if p_suggested_minutes is not null
    and p_suggested_minutes not between 5 and 120 then
    raise exception 'suggested minutes must be between 5 and 120' using errcode = '22023';
  end if;

  if p_planned_minutes is not null
    and p_planned_minutes not between 5 and 120 then
    raise exception 'planned minutes must be between 5 and 120' using errcode = '22023';
  end if;

  if p_agenda is not null and (
    jsonb_typeof(p_agenda) <> 'array'
    or jsonb_array_length(p_agenda) not between 1 and 8
    or exists (
      select 1
      from jsonb_array_elements(p_agenda) item
      where jsonb_typeof(item) <> 'string'
        or nullif(trim(item #>> '{}'), '') is null
        or length(trim(item #>> '{}')) > 240
    )
  ) then
    raise exception 'agenda must contain 1 to 8 short text items' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is not null then
    select message.*
    into v_row
    from public.talent_messages message
    where message.user_id = p_user_id
      and message.conversation_id = p_conversation_id
      and message.message_type = 'career_coaching_activity'
      and message.payload ->> 'idempotencyKey' = left(trim(p_idempotency_key), 160)
    order by message.id desc
    limit 1;

    if found then
      return v_row;
    end if;
  end if;

  select message.*
  into v_open_row
  from public.talent_messages message
  where message.user_id = p_user_id
    and message.conversation_id = p_conversation_id
    and message.message_type = 'career_coaching_activity'
    and message.payload ->> 'status' in ('suggested', 'active')
  order by message.id desc
  limit 1
  for update;

  if v_action = 'suggest' then
    if found then
      raise exception 'an open career coaching activity already exists' using errcode = '23505';
    end if;
    if v_topic is null or p_suggested_minutes is null then
      raise exception 'career coaching suggestion requires topic and suggested minutes' using errcode = '22023';
    end if;

    insert into public.talent_messages (
      conversation_id, user_id, role, content, message_type, payload
    ) values (
      p_conversation_id, p_user_id, 'assistant', '',
      'career_coaching_activity',
      jsonb_build_object(
        'kind', 'career_coaching_activity',
        'activityId', pg_catalog.gen_random_uuid(),
        'status', 'suggested',
        'topic', v_topic,
        'suggestedMinutes', p_suggested_minutes,
        'plannedMinutes', null,
        'agenda', '[]'::jsonb,
        'channel', null,
        'revision', 1,
        'createdAt', v_now,
        'updatedAt', v_now,
        'startedAt', null,
        'endedAt', null,
        'idempotencyKey', nullif(left(trim(coalesce(p_idempotency_key, '')), 160), '')
      )
    ) returning * into v_row;

    update public.talent_conversations
    set career_coaching_activity_message_id = v_row.id
    where id = p_conversation_id and user_id = p_user_id;
    return v_row;
  end if;

  if v_action = 'start' and p_activity_message_id is null then
    if found then
      raise exception 'starting an existing suggestion requires its message id' using errcode = '22023';
    end if;
    if v_topic is null
      or p_planned_minutes is null
      or p_agenda is null
      or v_channel = '' then
      raise exception 'direct career coaching start requires topic, duration, agenda, and channel' using errcode = '22023';
    end if;

    insert into public.talent_messages (
      conversation_id, user_id, role, content, message_type, payload
    ) values (
      p_conversation_id, p_user_id, 'assistant', '',
      'career_coaching_activity',
      jsonb_build_object(
        'kind', 'career_coaching_activity',
        'activityId', pg_catalog.gen_random_uuid(),
        'status', 'active',
        'topic', v_topic,
        'suggestedMinutes', null,
        'plannedMinutes', p_planned_minutes,
        'agenda', p_agenda,
        'channel', v_channel,
        'revision', 1,
        'createdAt', v_now,
        'updatedAt', v_now,
        'startedAt', v_now,
        'endedAt', null,
        'idempotencyKey', nullif(left(trim(coalesce(p_idempotency_key, '')), 160), '')
      )
    ) returning * into v_row;

    update public.talent_conversations
    set career_coaching_activity_message_id = v_row.id
    where id = p_conversation_id and user_id = p_user_id;
    return v_row;
  end if;

  if p_activity_message_id is null then
    raise exception 'career coaching activity message id is required' using errcode = '22023';
  end if;

  select message.*
  into v_row
  from public.talent_messages message
  where message.id = p_activity_message_id
    and message.user_id = p_user_id
    and message.conversation_id = p_conversation_id
    and message.message_type = 'career_coaching_activity'
  for update;

  if not found then
    raise exception 'career coaching activity unavailable' using errcode = 'P0002';
  end if;

  v_status := v_row.payload ->> 'status';
  v_revision := coalesce((v_row.payload ->> 'revision')::integer, 1);

  if p_expected_revision is null or p_expected_revision <> v_revision then
    raise exception 'career coaching activity revision conflict' using errcode = '40001';
  end if;

  if v_action = 'start' then
    if v_status = 'active'
      and v_row.payload ->> 'channel' = 'call'
      and v_channel = 'call' then
      -- Recover a call whose activity started but whose client stream ended
      -- before the open-call UI action arrived. The exact revision still has
      -- to match, and no state is rewritten.
      return v_row;
    end if;
    if v_status <> 'suggested' then
      raise exception 'only a suggested career coaching activity can be started' using errcode = '22023';
    end if;
    v_next_topic := coalesce(v_topic, v_row.payload ->> 'topic');
    v_next_planned_minutes := coalesce(
      p_planned_minutes,
      (v_row.payload ->> 'suggestedMinutes')::integer
    );
    v_next_agenda := p_agenda;
    v_next_channel := nullif(v_channel, '');
    if v_next_topic is null
      or v_next_planned_minutes is null
      or v_next_agenda is null
      or v_next_channel is null then
      raise exception 'career coaching start requires topic, duration, agenda, and channel' using errcode = '22023';
    end if;

    update public.talent_messages message
    set payload = message.payload || jsonb_build_object(
      'status', 'active',
      'topic', v_next_topic,
      'plannedMinutes', v_next_planned_minutes,
      'agenda', v_next_agenda,
      'channel', v_next_channel,
      'revision', v_revision + 1,
      'updatedAt', v_now,
      'startedAt', v_now,
      'endedAt', null,
      'idempotencyKey', nullif(left(trim(coalesce(p_idempotency_key, '')), 160), '')
    )
    where message.id = v_row.id
    returning message.* into v_row;

    update public.talent_conversations
    set career_coaching_activity_message_id = v_row.id
    where id = p_conversation_id and user_id = p_user_id;
    return v_row;
  end if;

  if v_action = 'update' then
    if v_status not in ('suggested', 'active') then
      raise exception 'ended career coaching activity cannot be updated' using errcode = '22023';
    end if;
    if v_status = 'suggested' and (
      p_planned_minutes is not null
      or p_agenda is not null
      or v_channel <> ''
    ) then
      raise exception 'suggested career coaching activity can only update topic or suggested minutes' using errcode = '22023';
    end if;
    if v_status = 'active' and p_suggested_minutes is not null then
      raise exception 'active career coaching activity cannot update suggested minutes' using errcode = '22023';
    end if;

    v_next_topic := coalesce(v_topic, v_row.payload ->> 'topic');
    v_next_suggested_minutes := coalesce(
      p_suggested_minutes,
      nullif(v_row.payload ->> 'suggestedMinutes', '')::integer
    );
    v_next_planned_minutes := coalesce(
      p_planned_minutes,
      nullif(v_row.payload ->> 'plannedMinutes', '')::integer
    );
    v_next_agenda := coalesce(p_agenda, v_row.payload -> 'agenda');
    v_next_channel := coalesce(nullif(v_channel, ''), v_row.payload ->> 'channel');

    if v_next_topic is null
      or (v_status = 'suggested' and v_next_suggested_minutes is null)
      or (v_status = 'active' and (
        v_next_planned_minutes is null
        or v_next_channel is null
        or coalesce(jsonb_array_length(v_next_agenda), 0) < 1
      )) then
      raise exception 'career coaching update would produce an invalid activity' using errcode = '22023';
    end if;

    update public.talent_messages message
    set payload = message.payload || jsonb_build_object(
      'topic', v_next_topic,
      'suggestedMinutes', v_next_suggested_minutes,
      'plannedMinutes', v_next_planned_minutes,
      'agenda', v_next_agenda,
      'channel', v_next_channel,
      'revision', v_revision + 1,
      'updatedAt', v_now,
      'idempotencyKey', nullif(left(trim(coalesce(p_idempotency_key, '')), 160), '')
    )
    where message.id = v_row.id
    returning message.* into v_row;

    update public.talent_conversations
    set career_coaching_activity_message_id = v_row.id
    where id = p_conversation_id and user_id = p_user_id;
    return v_row;
  end if;

  if v_action = 'end' then
    if v_status = 'ended' then
      update public.talent_conversations
      set career_coaching_activity_message_id = null
      where id = p_conversation_id
        and user_id = p_user_id
        and career_coaching_activity_message_id = v_row.id;
      return v_row;
    end if;
    if v_status not in ('suggested', 'active') then
      raise exception 'invalid career coaching activity status' using errcode = '22023';
    end if;

    update public.talent_messages message
    set payload = message.payload || jsonb_build_object(
      'status', 'ended',
      'revision', v_revision + 1,
      'updatedAt', v_now,
      'endedAt', v_now,
      'idempotencyKey', nullif(left(trim(coalesce(p_idempotency_key, '')), 160), '')
    )
    where message.id = v_row.id
    returning message.* into v_row;

    update public.talent_conversations
    set career_coaching_activity_message_id = null
    where id = p_conversation_id
      and user_id = p_user_id
      and career_coaching_activity_message_id = v_row.id;
    return v_row;
  end if;

  raise exception 'unsupported career coaching activity transition' using errcode = '22023';
end;
$$;

revoke all on function public.mutate_talent_career_coaching_activity(
  uuid, uuid, text, bigint, integer, text, integer, integer, jsonb, text, text
) from public;
grant execute on function public.mutate_talent_career_coaching_activity(
  uuid, uuid, text, bigint, integer, text, integer, integer, jsonb, text, text
) to service_role;

create or replace function public.expire_talent_career_coaching_activity(
  p_user_id uuid,
  p_conversation_id uuid,
  p_activity_message_id bigint
)
returns public.talent_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_row public.talent_messages%rowtype;
  v_status text;
  v_minutes integer;
  v_last_activity_at timestamptz;
  v_revision integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_conversation_id::text, 0)
  );

  if not exists (
    select 1
    from public.talent_conversations conversation
    where conversation.id = p_conversation_id
      and conversation.user_id = p_user_id
      and conversation.career_coaching_activity_message_id = p_activity_message_id
  ) then
    return null;
  end if;

  select message.*
  into v_row
  from public.talent_messages message
  where message.id = p_activity_message_id
    and message.user_id = p_user_id
    and message.conversation_id = p_conversation_id
    and message.message_type = 'career_coaching_activity'
  for update;

  if not found then
    update public.talent_conversations
    set career_coaching_activity_message_id = null
    where id = p_conversation_id
      and user_id = p_user_id
      and career_coaching_activity_message_id = p_activity_message_id;
    return null;
  end if;

  v_status := v_row.payload ->> 'status';
  v_revision := coalesce((v_row.payload ->> 'revision')::integer, 1);

  if v_status = 'suggested' then
    v_minutes := nullif(v_row.payload ->> 'suggestedMinutes', '')::integer;
    v_last_activity_at := (v_row.payload ->> 'updatedAt')::timestamptz;
  elsif v_status = 'active' then
    v_minutes := nullif(v_row.payload ->> 'plannedMinutes', '')::integer;
    select coalesce(
      max(message.created_at),
      (v_row.payload ->> 'startedAt')::timestamptz
    )
    into v_last_activity_at
    from public.talent_messages message
    where message.user_id = p_user_id
      and message.conversation_id = p_conversation_id
      and message.message_type in ('chat', 'call_transcript')
      and message.created_at >= (v_row.payload ->> 'startedAt')::timestamptz;
  else
    update public.talent_conversations
    set career_coaching_activity_message_id = null
    where id = p_conversation_id
      and user_id = p_user_id
      and career_coaching_activity_message_id = p_activity_message_id;
    return null;
  end if;

  if v_minutes is null
    or v_last_activity_at is null
    or v_now <= v_last_activity_at + pg_catalog.make_interval(mins => v_minutes * 3) then
    return null;
  end if;

  update public.talent_messages message
  set payload = message.payload || jsonb_build_object(
    'status', 'ended',
    'revision', v_revision + 1,
    'updatedAt', v_now,
    'endedAt', v_now,
    'idempotencyKey', 'expiry:' || v_revision::text
  )
  where message.id = v_row.id
  returning message.* into v_row;

  update public.talent_conversations
  set career_coaching_activity_message_id = null
  where id = p_conversation_id
    and user_id = p_user_id
    and career_coaching_activity_message_id = v_row.id;

  return v_row;
end;
$$;

revoke all on function public.expire_talent_career_coaching_activity(
  uuid, uuid, bigint
) from public;
grant execute on function public.expire_talent_career_coaching_activity(
  uuid, uuid, bigint
) to service_role;

create or replace function public.rollback_talent_career_coaching_call_start(
  p_user_id uuid,
  p_conversation_id uuid,
  p_activity_message_id bigint,
  p_expected_revision integer
)
returns public.talent_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_row public.talent_messages%rowtype;
  v_revision integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_conversation_id::text, 0)
  );

  select message.*
  into v_row
  from public.talent_messages message
  where message.id = p_activity_message_id
    and message.user_id = p_user_id
    and message.conversation_id = p_conversation_id
    and message.message_type = 'career_coaching_activity'
  for update;

  if not found then
    raise exception 'career coaching activity unavailable' using errcode = 'P0002';
  end if;

  v_revision := coalesce((v_row.payload ->> 'revision')::integer, 1);
  if v_row.payload ->> 'status' = 'suggested'
    and v_row.payload ->> 'idempotencyKey' = 'call-start-rollback:' || p_expected_revision::text then
    return v_row;
  end if;
  if v_revision <> p_expected_revision
    or v_row.payload ->> 'status' <> 'active'
    or v_row.payload ->> 'channel' <> 'call' then
    raise exception 'career coaching activity revision conflict' using errcode = '40001';
  end if;

  update public.talent_messages message
  set payload = message.payload || jsonb_build_object(
    'status', 'suggested',
    'suggestedMinutes', (message.payload ->> 'plannedMinutes')::integer,
    'plannedMinutes', null,
    'agenda', '[]'::jsonb,
    'channel', null,
    'revision', v_revision + 1,
    'updatedAt', v_now,
    'startedAt', null,
    'endedAt', null,
    'idempotencyKey', 'call-start-rollback:' || p_expected_revision::text
  )
  where message.id = v_row.id
  returning message.* into v_row;

  update public.talent_conversations
  set career_coaching_activity_message_id = v_row.id
  where id = p_conversation_id and user_id = p_user_id;
  return v_row;
end;
$$;

revoke all on function public.rollback_talent_career_coaching_call_start(
  uuid, uuid, bigint, integer
) from public;
grant execute on function public.rollback_talent_career_coaching_call_start(
  uuid, uuid, bigint, integer
) to service_role;

drop trigger if exists talent_messages_coaching_activity_live_sync
  on public.talent_messages;
create trigger talent_messages_coaching_activity_live_sync
after update of payload on public.talent_messages
for each row
when (
  new.message_type = 'career_coaching_activity'
  and new.payload is distinct from old.payload
)
execute function public.broadcast_talent_career_live_sync();
