create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.service_answer_examples (
  id uuid primary key default gen_random_uuid(),
  user_example_text text not null,
  answer_example_text text not null,
  tags text[] not null default '{}'::text[],
  enabled boolean not null default true,
  notes text null,
  embedding vector(1536) not null,
  embedding_model text not null default 'text-embedding-3-small',
  user_example_hash text not null,
  created_by text null,
  updated_by text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop index if exists public.service_answer_examples_enabled_priority_idx;

alter table public.service_answer_examples
  drop column if exists intent_key,
  drop column if exists priority;

create index if not exists service_answer_examples_embedding_hnsw_idx
  on public.service_answer_examples using hnsw (embedding vector_cosine_ops);

create index if not exists service_answer_examples_enabled_updated_at_idx
  on public.service_answer_examples (enabled, updated_at desc);

create index if not exists service_answer_examples_user_hash_idx
  on public.service_answer_examples (user_example_hash);

create or replace function public.set_service_answer_examples_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_answer_examples_set_updated_at
  on public.service_answer_examples;

create trigger service_answer_examples_set_updated_at
before update on public.service_answer_examples
for each row execute function public.set_service_answer_examples_updated_at();

alter table public.service_answer_examples enable row level security;

-- Answer examples are maintained through internal Ops APIs using the
-- service-role key. End users should not read or write the corpus directly.

drop function if exists public.match_service_answer_examples(vector, integer, double precision);

create or replace function public.match_service_answer_examples(
  query_embedding vector(1536),
  match_count integer default 3,
  min_score double precision default 0.35,
  embedding_model_filter text default 'text-embedding-3-small'
)
returns table (
  id uuid,
  user_example_text text,
  answer_example_text text,
  tags text[],
  score double precision
)
language sql
stable
as $$
  select
    e.id,
    e.user_example_text,
    e.answer_example_text,
    e.tags,
    1 - (e.embedding <=> query_embedding) as score
  from public.service_answer_examples e
  where
    e.enabled = true
    and e.embedding_model = embedding_model_filter
    and 1 - (e.embedding <=> query_embedding) >= min_score
  order by e.embedding <=> query_embedding, e.updated_at desc
  limit greatest(1, least(match_count, 10));
$$;

grant execute on function public.match_service_answer_examples(vector, integer, double precision, text)
  to service_role;
