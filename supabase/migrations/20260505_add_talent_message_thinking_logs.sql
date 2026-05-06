alter table public.talent_messages
  add column if not exists thinking_logs jsonb not null default '[]'::jsonb;

alter table public.talent_messages
  drop constraint if exists talent_messages_thinking_logs_is_array;

alter table public.talent_messages
  add constraint talent_messages_thinking_logs_is_array
  check (jsonb_typeof(thinking_logs) = 'array');
