alter table public.service_answer_examples
  add column if not exists audience text;

-- All rows that predate this migration belong to the Career corpus.
update public.service_answer_examples
set audience = 'career'
where audience is null;

do $$
begin
  if exists (
    select 1
    from public.service_answer_examples
    where audience not in ('company', 'career')
  ) then
    raise exception 'service_answer_examples contains an unsupported audience';
  end if;
end;
$$;

alter table public.service_answer_examples
  drop constraint if exists service_answer_examples_audience_check;

alter table public.service_answer_examples
  add constraint service_answer_examples_audience_check
  check (audience in ('company', 'career'));

alter table public.service_answer_examples
  alter column audience set not null;

drop index if exists public.service_answer_examples_user_hash_idx;

create index if not exists service_answer_examples_audience_user_hash_idx
  on public.service_answer_examples (audience, user_example_hash);

create index if not exists service_answer_examples_audience_enabled_updated_at_idx
  on public.service_answer_examples (audience, enabled, updated_at desc);

drop function if exists public.match_service_answer_examples(vector, integer, double precision);
drop function if exists public.match_service_answer_examples(vector, integer, double precision, text);
drop function if exists public.match_service_answer_examples(vector, text, integer, double precision, text);

create function public.match_service_answer_examples(
  query_embedding vector(1536),
  audience_filter text,
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
    audience_filter in ('company', 'career')
    and e.audience = audience_filter
    and e.enabled = true
    and e.embedding_model = embedding_model_filter
    and 1 - (e.embedding <=> query_embedding) >= min_score
  order by e.embedding <=> query_embedding, e.updated_at desc
  limit greatest(1, least(match_count, 10));
$$;

revoke all on function public.match_service_answer_examples(vector, text, integer, double precision, text)
  from public, anon, authenticated;

grant execute on function public.match_service_answer_examples(vector, text, integer, double precision, text)
  to service_role;
