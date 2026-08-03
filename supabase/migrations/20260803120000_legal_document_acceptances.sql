create table if not exists public.legal_document_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_slug text not null check (document_slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  document_version text not null check (char_length(document_version) between 1 and 40),
  document_locale text not null check (document_locale in ('ko', 'en')),
  acceptance_type text not null check (acceptance_type in ('acknowledgement', 'consent')),
  context_key text not null default '' check (char_length(context_key) <= 200),
  document_title text not null check (char_length(document_title) between 1 and 300),
  document_effective_date date,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  source text not null check (char_length(source) between 1 and 80),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  unique (
    user_id,
    document_slug,
    document_version,
    document_locale,
    acceptance_type,
    context_key
  )
);

comment on table public.legal_document_acceptances is
  'Versioned acknowledgements and consents for legal documents. The referenced document body is preserved under public/docs/legal and verified by document_sha256.';
comment on column public.legal_document_acceptances.acceptance_type is
  'acknowledgement means the user confirmed reviewing a notice; consent means an affirmative legal consent.';
comment on column public.legal_document_acceptances.context_key is
  'Stable discriminator for contextual documents, such as a company id for company-specific profile sharing.';

create index if not exists legal_document_acceptances_user_recorded_idx
  on public.legal_document_acceptances (user_id, accepted_at desc);
create index if not exists legal_document_acceptances_document_idx
  on public.legal_document_acceptances (document_slug, document_version, accepted_at desc);

alter table public.legal_document_acceptances enable row level security;

revoke all on table public.legal_document_acceptances from anon, authenticated;

