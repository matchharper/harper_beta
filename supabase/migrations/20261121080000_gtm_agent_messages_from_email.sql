-- #5 replies: a reply in one of our threads from another address than the one our mail went to (name@gmail.com for a
-- mail to name@company.com, a colleague it was forwarded to). counterpart_email stays the address we wrote to, so
-- the history, the opt-out list and Ashley's answer stay on it; from_email keeps the address the reply came from, and
-- Ashley reads both and judges whether it is the same person (a person answers when it is not, or she cannot tell).
-- Her answer only ever goes to the address we wrote to (ashleyAgent.ts outgoing). Null for every other message.
-- Safe to run again.
alter table public.gtm_agent_messages add column if not exists from_email text;

do $$
begin
  alter table public.gtm_agent_messages add constraint gtm_agent_messages_from_email_check
    check (from_email is null or (from_email = lower(from_email) and from_email like '%@%'));
exception when duplicate_object then null;
end $$;

comment on column public.gtm_agent_messages.from_email is
  'An inbound reply''s sender when it is not counterpart_email (the address our mail went to); Ashley judges whether it is the same person.';
