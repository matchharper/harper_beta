-- Train only after backfill. On a populated production DB, first run the
-- dedicated build_external_title_index.py operator with --apply, which creates
-- this index CONCURRENTLY; the migration then records the same final schema.
-- Full precision vectors remain at rest; only the ANN index uses half precision.
set local lock_timeout='5s';
set local statement_timeout='60s';
set local maintenance_work_mem='128MB';
set local max_parallel_maintenance_workers=0;
do $$ begin
  if exists(select 1 from public.external_role_title_embeddings where embedding is not null offset 9999 limit 1) then
    create index if not exists external_role_title_embeddings_ivfflat
      on public.external_role_title_embeddings using ivfflat((embedding::public.halfvec(1536)) public.halfvec_cosine_ops)
      with(lists=320) where embedding is not null;
  end if;
end $$;
create or replace function public.search_external_roles_v2(p_sql text)
returns setof jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform set_config('statement_timeout','30000',true);
  perform set_config('ivfflat.probes','20',true);
  perform set_config('ivfflat.iterative_scan','relaxed_order',true);
  perform set_config('ivfflat.max_probes','80',true);
  return query execute 'select to_jsonb(result) from (' || p_sql || ') result';
end $$;
revoke all on function public.search_external_roles_v2(text) from public,anon,authenticated;
grant execute on function public.search_external_roles_v2(text) to service_role;
analyze public.external_role_title_embeddings;
