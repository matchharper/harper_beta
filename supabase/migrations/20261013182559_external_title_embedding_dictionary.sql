set local lock_timeout = '5s';
-- Durable fact: one embedding per exact title, reused by every role bearing it.
-- The retrieval join checks both hash and original text; a collision never reuses another title's vector.
create table public.external_role_title_embeddings (
  title_key text generated always as (md5(title)) stored primary key,
  title text not null,
  embedding public.vector(1536),
  model text not null default 'text-embedding-3-small' check(model='text-embedding-3-small'),
  embedded_at timestamptz
);
alter table public.external_role_title_embeddings enable row level security;
revoke all on public.external_role_title_embeddings from anon,authenticated;
grant all on public.external_role_title_embeddings to service_role;
create index external_role_title_embeddings_pending on public.external_role_title_embeddings(title_key) where embedding is null;
create index external_role_title_embeddings_hnsw on public.external_role_title_embeddings using hnsw(embedding public.vector_cosine_ops) where embedding is not null;
create index company_roles_title_key_idx on public.company_roles((md5(name))) where source_type='external';

insert into public.external_role_title_embeddings(title,embedding,embedded_at)
select distinct on (name) name,title_embedding,case when title_embedding is not null then now() end
from public.company_roles where nullif(btrim(name),'') is not null
order by name,title_embedding is null,role_id
on conflict(title_key) do nothing;

create function public.enqueue_external_role_title_embedding() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if nullif(btrim(new.name),'') is not null then
    insert into public.external_role_title_embeddings(title) values(new.name) on conflict(title_key) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.enqueue_external_role_title_embedding() from public,anon,authenticated;
-- Ordinary authenticated role writes must not require rights to the derived cache.
-- The trigger has a fixed search_path and only copies the role's title.
alter function public.enqueue_external_role_title_embedding() security definer;
create trigger enqueue_external_role_title_embedding after insert or update of name on public.company_roles
for each row execute function public.enqueue_external_role_title_embedding();

create function public.pending_external_title_embeddings(p_limit int default 512)
returns table(title_key text,title text) language sql security invoker set search_path='' as $$
 select e.title_key,e.title from public.external_role_title_embeddings e where e.embedding is null
 order by e.title_key limit least(1000,greatest(1,p_limit));
$$;
create function public.save_external_title_embeddings(p_rows jsonb)
returns int language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>64 then raise exception 'Invalid title embedding batch'; end if;
 update public.external_role_title_embeddings e
 set embedding=(x->>'embedding')::public.vector(1536),embedded_at=now()
 from jsonb_array_elements(p_rows) x
 where e.title_key=x->>'titleKey' and e.title=x->>'title' and e.embedding is null;
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.pending_external_title_embeddings(int) from public,anon,authenticated;
revoke all on function public.save_external_title_embeddings(jsonb) from public,anon,authenticated;
grant execute on function public.pending_external_title_embeddings(int) to service_role;
grant execute on function public.save_external_title_embeddings(jsonb) to service_role;
-- Old additive columns remain for rollback compatibility; new writes use the dictionary only.
drop index public.company_roles_title_embedding_hnsw;
drop index public.company_roles_missing_title_embedding;
analyze public.external_role_title_embeddings;
