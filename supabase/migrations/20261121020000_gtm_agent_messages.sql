-- 후보자 소싱 에이전트 (#5) reply conversations (design 2장 "메일 대화 저장"): one row per mail in a reply thread.
-- gtm_mails keeps the mails we start (first, follow-up, company); every inbound reply, every Ashley reply and every
-- reply a person on the team writes from Ashley's Gmail (SENT label) is a row here. A counterpart's history is their
-- gtm_mails rows + these rows, by address, time order (agent/conversation.server.ts). Shape: agent/conversation.ts
-- ConversationMessage, snake_case.
--
--   author / direction   counterpart + inbound (their mail), ashley + outbound (sent through Resend), human + outbound
--                        (read from the mailbox's SENT; a root mail with one is human-owned: Ashley sends nothing more)
--   gmail_message_id     the Gmail id for mails read from Gmail: each is stored once (the reply sync reads a message
--                        again after a failed tick or a backfill)
--   rfc_message_id       the Message-ID as the mail carries it ("<…>", case kept for In-Reply-To / References of a
--                        reply); unique too, so one mail is one row whichever mailbox it was read in
--   root_mail_id         the gtm_mails row the thread hangs on
--   decision             Ashley's decide on an inbound mail (null until decided); hand_to_human is also written when
--                        the row is stored (a reply from another address than the mail's recipient)
--   signals              InterestSignal[] Ashley read from an inbound candidate mail (company mails read them)
--   answers_message_id   on an Ashley reply: the inbound mail it answers. Unique: one inbound mail → at most one
--                        Ashley reply, held by the database whatever the code does. answered_by_message_id on the
--                        inbound row points back (set in the same transaction).
--   send_status          on an Ashley reply: queued → sent | failed | held (stopped by the pre-send check)
--
-- No column of another table is dropped here (gtm_agent_people.reply_text etc. go after the deploy, design 2장).

create table if not exists public.gtm_agent_messages (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.gtm_agent_people(id) on delete set null,
  counterpart_kind text not null check (counterpart_kind in ('candidate', 'company')),
  -- Lower-cased address of the other side.
  counterpart_email text not null check (counterpart_email = lower(counterpart_email) and counterpart_email like '%@%'),
  author text not null check (author in ('counterpart', 'ashley', 'human')),
  direction text not null check (direction in ('inbound', 'outbound')),
  gmail_message_id text,
  gmail_thread_id text,
  rfc_message_id text,
  in_reply_to text,
  references_header text,
  subject text not null default '',
  -- The full plain text as received or sent, and the new text without the quoted earlier mails.
  body_text text not null default '',
  new_text text not null default '',
  root_mail_id uuid references public.gtm_mails(id) on delete set null,
  decision text check (decision in ('reply', 'no_reply', 'stop', 'hand_to_human')),
  decision_reason text,
  decided_at timestamptz,
  signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array'),
  answers_message_id uuid references public.gtm_agent_messages(id) on delete set null,
  answered_by_message_id uuid references public.gtm_agent_messages(id) on delete set null,
  send_status text check (send_status in ('queued', 'sent', 'failed', 'held')),
  provider_message_id text,
  error text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((author = 'counterpart') = (direction = 'inbound')),
  check (decision is null or direction = 'inbound'),
  check (answers_message_id is null or author = 'ashley'),
  check (answered_by_message_id is null or direction = 'inbound')
);

-- One row per Gmail message, and per mail (Message-ID compared without <> and case): the same mail read in two team
-- mailboxes has two Gmail ids but one Message-ID, and must not get two Ashley replies. A later mail of the thread
-- finds a stored one by a Message-ID it names through the second index too.
create unique index if not exists gtm_agent_messages_gmail_message_key on public.gtm_agent_messages (gmail_message_id)
  where gmail_message_id is not null;
create unique index if not exists gtm_agent_messages_rfc_key on public.gtm_agent_messages (lower(btrim(rfc_message_id, '<> ')))
  where rfc_message_id is not null;
-- One inbound mail → at most one Ashley reply, and one reply answers one inbound mail.
create unique index if not exists gtm_agent_messages_answers_key on public.gtm_agent_messages (answers_message_id)
  where answers_message_id is not null;
create unique index if not exists gtm_agent_messages_answered_by_key on public.gtm_agent_messages (answered_by_message_id)
  where answered_by_message_id is not null;
-- History by address, a thread by its root mail, the undecided inbound queue.
create index if not exists gtm_agent_messages_counterpart_idx on public.gtm_agent_messages (lower(counterpart_email), occurred_at);
create index if not exists gtm_agent_messages_root_idx on public.gtm_agent_messages (root_mail_id, occurred_at);
create index if not exists gtm_agent_messages_undecided_idx on public.gtm_agent_messages ((decision is null), direction, occurred_at);
-- A later mail of the thread finds it by its Gmail thread.
create index if not exists gtm_agent_messages_thread_idx on public.gtm_agent_messages (gmail_thread_id)
  where gmail_thread_id is not null;

alter table public.gtm_agent_messages enable row level security;
revoke all on public.gtm_agent_messages from public, anon, authenticated;
grant all on public.gtm_agent_messages to service_role;

-- The reply sync reads each mailbox's last 14 days once more (INBOX from, SENT to the addresses agent mails went to)
-- to store the replies that came before this table (they were kept only as gtm_agent_people.reply_text) and any
-- answer a person already wrote from the mailbox. Set after that read; null = not done yet.
alter table public.gtm_agent_mailboxes add column if not exists conversation_backfilled_at timestamptz;
