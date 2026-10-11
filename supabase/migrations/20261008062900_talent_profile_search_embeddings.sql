begin;
-- Reconstructible numeric search cache for the role-scoring-list retriever.
-- It carries no preference, assessment, recommendation or conversation fact.
-- Exact cosine is computed on a bounded eligible SQL pool in the worker; no
-- global ANN index is introduced by this change.
create table public.talent_profile_search_embeddings (
  talent_id uuid primary key references public.talent_users(user_id) on delete cascade,
  content_fingerprint text not null,
  embedding_model text not null,
  embedding real[] not null check (array_ndims(embedding)=1 and cardinality(embedding)=1536),
  updated_at timestamptz not null default now()
);
alter table public.talent_profile_search_embeddings enable row level security;
revoke all on public.talent_profile_search_embeddings from public,anon,authenticated;
grant select,insert,update,delete on public.talent_profile_search_embeddings to service_role;
comment on table public.talent_profile_search_embeddings is
  'Worker-only, reconstructible canonical Profile embeddings; not fit or durable user facts.';
commit;
