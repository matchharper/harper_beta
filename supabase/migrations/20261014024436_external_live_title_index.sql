-- Full vectors are retained. ANN only needs titles with a live external role.
-- Existing live titles are initialized in short operator transactions before
-- building the partial index; this migration never holds role writes for a bulk update.
set local lock_timeout='5s';
set local statement_timeout='15s';
lock table public.company_roles in share row exclusive mode;
lock table public.external_role_title_embeddings in access exclusive mode nowait;
alter table public.external_role_title_embeddings
 add column live_role_count integer check(live_role_count>=0);

create function public.maintain_external_live_title_count() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_title text; new_title text; item record;
begin
 if tg_op<>'INSERT' then
  if old.source_type='external' and coalesce(old.is_expired,false)=false
   and old.status not in ('ended','expired','closed','inactive','archived')
   and coalesce(old.source_provider,'')<>'user_submitted' then old_title:=old.name; end if;
 end if;
 if tg_op<>'DELETE' then
  if new.source_type='external' and coalesce(new.is_expired,false)=false
   and new.status not in ('ended','expired','closed','inactive','archived')
   and coalesce(new.source_provider,'')<>'user_submitted' then new_title:=new.name; end if;
 end if;
 if old_title is not distinct from new_title then return null; end if;
 -- Serialize affected title rows in a stable order. Recount in a subsequent
 -- command so a concurrent lifecycle change that waited here sees current facts.
 for item in select distinct title from (values(old_title),(new_title)) v(title)
   where nullif(btrim(title),'') is not null order by title
 loop
  insert into public.external_role_title_embeddings(title) values(item.title) on conflict(title_key) do nothing;
  perform 1 from public.external_role_title_embeddings where title_key=md5(item.title) and title=item.title for update;
 end loop;
 update public.external_role_title_embeddings e set live_role_count=(
  select count(*)::int from public.company_roles r where r.source_type='external'
   and md5(r.name)=e.title_key and r.name=e.title and coalesce(r.is_expired,false)=false
   and r.status not in ('ended','expired','closed','inactive','archived') and coalesce(r.source_provider,'')<>'user_submitted'
 ) where e.title in (old_title,new_title) and e.title_key in (md5(old_title),md5(new_title));
 return null;
end $$;
revoke all on function public.maintain_external_live_title_count() from public,anon,authenticated;
create trigger maintain_external_live_title_count
 after insert or delete or update of name,source_type,source_provider,status,is_expired on public.company_roles
 for each row execute function public.maintain_external_live_title_count();

create or replace function public.search_external_roles_v2(p_sql text)
returns setof jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform set_config('statement_timeout','30000',true);
 perform set_config('ivfflat.probes','12',true);
 perform set_config('ivfflat.iterative_scan','relaxed_order',true);
 perform set_config('ivfflat.max_probes','48',true);
 return query execute 'select to_jsonb(result) from (' || p_sql || ') result';
end $$;
revoke all on function public.search_external_roles_v2(text) from public,anon,authenticated;
grant execute on function public.search_external_roles_v2(text) to service_role;
-- build_external_title_index.py --live --apply initializes live counts, then
-- creates the halfvec(1536), lists=128 partial index CONCURRENTLY.
