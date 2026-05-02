create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.service_help_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_path text not null,
  chunk_index integer not null,
  chunk_text text not null,
  ui_target text null,
  source_doc_title text null,
  embedding vector(1536) not null,
  embedding_model text not null default 'text-embedding-3-small',
  metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (doc_path, chunk_index)
);

create index if not exists service_help_chunks_embedding_hnsw_idx
  on public.service_help_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists service_help_chunks_doc_path_idx
  on public.service_help_chunks (doc_path);

create or replace function public.set_service_help_chunks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_help_chunks_set_updated_at
  on public.service_help_chunks;

create trigger service_help_chunks_set_updated_at
before update on public.service_help_chunks
for each row execute function public.set_service_help_chunks_updated_at();

alter table public.service_help_chunks enable row level security;

-- Authenticated users may read the in-app help corpus.
create policy "Authenticated users can read service help"
  on public.service_help_chunks for select
  to authenticated using (true);

-- Intentionally NO insert/update/delete policies for the `authenticated` role.
-- The corpus is authored by developers via `scripts/index-help-chunks.ts`,
-- which uses the service-role key (bypasses RLS). End users should never write.

-- RPC for cosine-similarity nearest-neighbor lookup. Used by
-- `src/lib/serviceHelpRag.ts` because supabase-js cannot natively order
-- by raw vector operators through PostgREST.
create or replace function public.match_service_help_chunks(
  query_embedding vector(1536),
  match_count integer default 5
)
returns table (
  chunk_text text,
  ui_target text,
  source_doc_title text,
  score double precision
)
language sql
stable
as $$
  select
    c.chunk_text,
    c.ui_target,
    c.source_doc_title,
    1 - (c.embedding <=> query_embedding) as score
  from public.service_help_chunks c
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

grant execute on function public.match_service_help_chunks(vector, integer)
  to authenticated, service_role;

