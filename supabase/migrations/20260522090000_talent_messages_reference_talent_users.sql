alter table public.talent_messages
  drop constraint if exists talent_messages_user_id_fkey;

alter table public.talent_messages
  add constraint talent_messages_user_id_fkey
  foreign key (user_id)
  references public.talent_users(user_id)
  on delete cascade;
