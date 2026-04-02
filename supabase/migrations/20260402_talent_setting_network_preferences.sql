alter table public.talent_setting
  add column if not exists engagement_types text[] not null default '{}'::text[],
  add column if not exists preferred_locations text[] not null default '{}'::text[],
  add column if not exists career_move_intent text null;

create unique index if not exists talent_insights_talent_id_uidx
  on public.talent_insights (talent_id)
  where talent_id is not null;
