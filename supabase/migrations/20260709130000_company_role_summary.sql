alter table public.company_roles
  add column if not exists summary jsonb not null default '{}'::jsonb;

comment on column public.company_roles.summary is
  'Language-keyed cached role summary payloads for recommendation cards. Shape: {"ko":{"version":"v1","content":"...","generatedAt":"..."}}.';
