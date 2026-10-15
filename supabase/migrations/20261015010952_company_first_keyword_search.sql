-- !!! Hot fix: NO LLM-generated retrieval SQL / NO embedding API dependency.
-- Reconstructible title/education FTS only. Existing consent, route, fit and
-- delivery guards remain owned by the matching runtime.
alter table public.talent_users
  add column search_text text not null default '',
  add column search_tsv tsvector generated always as
    (to_tsvector('english'::regconfig, search_text)) stored;

create function public.talent_search_text_v1(p_talent_id uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select concat_ws(', ',
    (select string_agg(item, ', ' order by end_date desc nulls first,
                       start_date desc nulls last, id desc)
     from (
       select e.id, e.end_date, e.start_date,
         concat_ws(' at ', nullif(btrim(e.role), ''), nullif(btrim(e.company_name), '')) item
       from public.talent_experiences e where e.talent_id = p_talent_id
       order by e.end_date desc nulls first, e.start_date desc nulls last, e.id desc
       limit 8
     ) recent where item <> ''),
    (select string_agg(concat_ws(' - ', nullif(btrim(e.school), ''), nullif(btrim(e.field), '')),
                       ', ' order by e.end_date desc nulls first,
                       e.start_date desc nulls last, e.id desc)
     from public.talent_educations e where e.talent_id = p_talent_id
       and (nullif(btrim(e.school), '') is not null or nullif(btrim(e.field), '') is not null))
  );
$$;

-- Source rows are authorized by their existing RLS. This trigger only refreshes
-- the derived document for those rows; it exposes no new caller-controlled write.
create function public.refresh_talent_search_text_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old uuid;
  v_new uuid;
  v_talent uuid;
begin
  if tg_op <> 'INSERT' then v_old := old.talent_id; end if;
  if tg_op <> 'DELETE' then v_new := new.talent_id; end if;
  for v_talent in select distinct id from unnest(array[v_old, v_new]) id
                  where id is not null order by id
  loop
    perform 1 from public.talent_users where user_id = v_talent for update;
    update public.talent_users
      set search_text = public.talent_search_text_v1(v_talent)
      where user_id = v_talent
        and search_text is distinct from public.talent_search_text_v1(v_talent);
  end loop;
  return null;
end;
$$;

revoke all on function public.talent_search_text_v1(uuid) from public, anon, authenticated;
revoke all on function public.refresh_talent_search_text_v1() from public, anon, authenticated;
grant execute on function public.talent_search_text_v1(uuid) to service_role;

create trigger talent_experiences_refresh_search_text
after insert or update of talent_id, role, company_name, start_date, end_date or delete
on public.talent_experiences for each row execute function public.refresh_talent_search_text_v1();

create trigger talent_educations_refresh_search_text
after insert or update of talent_id, school, field, start_date, end_date or delete
on public.talent_educations for each row execute function public.refresh_talent_search_text_v1();

-- !!! Hot fix: initialize existing Talent too; new/edited/deleted source rows
-- stay current synchronously without a worker, model, cron or extra queue.
update public.talent_users t set search_text = public.talent_search_text_v1(t.user_id)
where t.search_text is distinct from public.talent_search_text_v1(t.user_id);

create index talent_users_search_tsv_idx on public.talent_users using gin(search_tsv);
