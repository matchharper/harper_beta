begin;

create table public.talent_integrations (
  talent_id uuid not null
    references public.talent_users(user_id)
    on delete cascade,
  provider text not null,
  composio_connected_account_id text not null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (talent_id, provider),
  unique (composio_connected_account_id)
);

comment on table public.talent_integrations is
  'Server-only pointers to vendor-managed talent integrations. OAuth credentials are not stored here.';
comment on column public.talent_integrations.composio_connected_account_id is
  'Composio connected account ID. This is a non-secret pointer, not an OAuth credential.';

alter table public.talent_integrations enable row level security;

revoke all on table public.talent_integrations
  from public, anon, authenticated;

grant all on table public.talent_integrations
  to service_role;

commit;
