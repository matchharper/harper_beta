-- Company-side Slack history is summarized and retrieved per Slack thread.

alter table public.company_conversation_summaries
  add column if not exists slack_thread_id uuid
    references public.company_slack_threads(id) on delete cascade;

comment on column public.company_conversation_summaries.slack_thread_id is
  'Slack thread scope for a rolling company-side conversation summary. New scoped web-chat summaries use null; legacy unscoped rows may also be null and are ignored by application reads.';

create index if not exists company_conversation_summaries_thread_recent_idx
  on public.company_conversation_summaries (
    conversation_id,
    slack_thread_id,
    source_end_message_id desc
  );

create unique index if not exists company_conversation_summaries_thread_end_unique
  on public.company_conversation_summaries (
    conversation_id,
    slack_thread_id,
    source_end_message_id
  )
  where slack_thread_id is not null;

create or replace function public.list_company_agent_slack_threads_v1(
  p_conversation_id uuid,
  p_max_message_id bigint,
  p_before_last_message_id bigint default null,
  p_limit integer default 5
)
returns table (
  slack_thread_id uuid,
  channel_name text,
  thread_started_at timestamptz,
  last_message_at timestamptz,
  last_message_id bigint,
  message_count bigint,
  first_messages jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with thread_stats as (
    select
      message.slack_thread_id,
      min(message.created_at) as first_message_at,
      max(message.created_at) as last_message_at,
      max(message.id) as last_message_id,
      count(*)::bigint as message_count
    from public.company_messages as message
    where message.conversation_id = p_conversation_id
      and message.message_type = 'slack'
      and message.slack_thread_id is not null
      and message.id <= p_max_message_id
    group by message.slack_thread_id
    having p_before_last_message_id is null
      or max(message.id) < p_before_last_message_id
    order by max(message.id) desc
    limit least(greatest(coalesce(p_limit, 5), 1), 11)
  )
  select
    stats.slack_thread_id,
    channel.slack_channel_name as channel_name,
    case
      when thread.slack_thread_ts ~ '^[0-9]+([.][0-9]+)?$'
        then to_timestamp(thread.slack_thread_ts::double precision)
      else stats.first_message_at
    end as thread_started_at,
    stats.last_message_at,
    stats.last_message_id,
    stats.message_count,
    coalesce(preview.first_messages, '[]'::jsonb) as first_messages
  from thread_stats as stats
  join public.company_slack_threads as thread
    on thread.id = stats.slack_thread_id
  left join public.company_slack_channels as channel
    on channel.id = thread.channel_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', first_message.id,
        'role', first_message.role,
        'content', left(first_message.content, 2000),
        'createdAt', first_message.created_at,
        'metadata', jsonb_strip_nulls(
          jsonb_build_object(
            'slackUserName', first_message.metadata -> 'slackUserName'
          )
        ),
        'slackUserId', first_message.slack_user_id
      )
      order by first_message.id
    ) as first_messages
    from (
      select
        message.id,
        message.role,
        message.content,
        message.created_at,
        message.metadata,
        message.slack_user_id
      from public.company_messages as message
      where message.conversation_id = p_conversation_id
        and message.message_type = 'slack'
        and message.slack_thread_id = stats.slack_thread_id
        and message.id <= p_max_message_id
      order by message.id asc
      limit 3
    ) as first_message
  ) as preview on true
  order by stats.last_message_id desc;
$$;

comment on function public.list_company_agent_slack_threads_v1(
  uuid,
  bigint,
  bigint,
  integer
) is
  'Lists stored company-side Slack threads with KST-format-ready timestamps, message counts, and the first three messages for LLM history selection.';

revoke all on function public.list_company_agent_slack_threads_v1(
  uuid,
  bigint,
  bigint,
  integer
) from public, anon, authenticated;

grant execute on function public.list_company_agent_slack_threads_v1(
  uuid,
  bigint,
  bigint,
  integer
) to service_role;
