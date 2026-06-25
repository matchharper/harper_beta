alter table public.talent_progress
  add column if not exists kind text not null default 'manual_note',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists talent_progress_kind_recommendation_created_at_idx
  on public.talent_progress (kind, recommendation_id, created_at desc);

create index if not exists talent_progress_kind_talent_role_created_at_idx
  on public.talent_progress (kind, talent_id, role_id, created_at desc);
