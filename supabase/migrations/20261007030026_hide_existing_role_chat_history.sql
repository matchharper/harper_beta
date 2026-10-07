-- Preserve role conversations and their linked work records while hiding the
-- messages that predate this change becoming live.
alter table public.company_conversations
  add column hidden_through_message_id bigint;

alter table public.company_conversations
  add constraint company_conversations_hidden_through_message_id_check
  check (hidden_through_message_id is null or hidden_through_message_id > 0);

comment on column public.company_conversations.hidden_through_message_id is
  'Role chat hides messages with id at or below this value from the company web UI. Stored history remains available to internal processes.';

update public.company_conversations as conversation
set hidden_through_message_id = (
  select max(message.id)
  from public.company_messages as message
  where message.conversation_id = conversation.id
)
where conversation.company_workspace_id = 'f8f3e4af-0cc5-4709-965a-df49f434753c'::uuid
  and conversation.role_id in (
    '0b13092d-270c-4f6d-91ff-b523741a1884'::uuid,
    '26d82bd5-595d-4fe9-ac7e-ff089ed9a28d'::uuid,
    '714380d5-14cc-4d90-8b79-6bcf5c14a590'::uuid,
    'cb506d7b-5e7f-444a-b282-1f508fd3c4ae'::uuid
  );
