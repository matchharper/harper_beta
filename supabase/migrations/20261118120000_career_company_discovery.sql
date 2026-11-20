-- Career company discovery.
--
-- 1. company_workspace becomes the one company hub. Directory companies whose
--    LinkedIn company page is known are imported once, without duplicating a
--    workspace that already has that page, that directory row, or that exact
--    public name. Existing workspaces without a directory link get one by page.
-- 2. career_company_facts_v1 projects team, leader, hiring and access facts for a
--    candidate at read time from existing data; nothing is stored.
-- 3. career_company_search is a rebuildable retrieval index (one row per
--    workspace) for finding companies by what they do or by similarity.
-- 4. talent_matching_candidates keeps every option evaluated for a matching
--    with a stable number, when and by which route it was first seen, and its
--    latest score. Numbers let later requests refer to an option; first-seen
--    facts let a search report what was new.
-- Harper-connected (internal) workspaces are outside all of this.
set local lock_timeout = '5s';

create or replace function public.career_linkedin_company_key_v1(p_url text) returns text
language sql immutable strict security invoker set search_path = public, pg_temp as $$
  select nullif(lower(regexp_replace(regexp_replace(
    split_part(split_part(btrim(p_url), '?', 1), '#', 1),
    '^(https?://)?([a-z0-9-]+\.)?linkedin\.com/', '', 'i'), '/+$', '')), '')
  where p_url ~* 'linkedin\.com/company/[^/?#]+'
$$;

-- 1a. Link existing public workspaces to their directory row by LinkedIn page.
with keyed as (
  select c.id, public.career_linkedin_company_key_v1(c.linkedin_url) li,
    row_number() over (partition by public.career_linkedin_company_key_v1(c.linkedin_url)
      order by (c.description is not null)::int + (c.website_url is not null)::int + (c.logo is not null)::int desc, c.id) rn
  from public.company_db c where c.linkedin_url ~* 'linkedin\.com/company/'
)
update public.company_workspace w set company_db_id = k.id
from keyed k
where k.rn = 1 and w.company_db_id is null and not coalesce(w.is_internal, false)
  and public.career_linkedin_company_key_v1(w.linkedin_url) = k.li
  and not exists (select 1 from public.company_workspace o where o.company_db_id = k.id);

-- 1b. Import directory companies that no workspace represents yet.
with keyed as (
  select c.*, public.career_linkedin_company_key_v1(c.linkedin_url) li,
    row_number() over (partition by public.career_linkedin_company_key_v1(c.linkedin_url)
      order by (c.description is not null)::int + (c.website_url is not null)::int + (c.logo is not null)::int desc, c.id) rn
  from public.company_db c where c.linkedin_url ~* 'linkedin\.com/company/' and nullif(btrim(c.name), '') is not null
), taken as (
  select public.career_linkedin_company_key_v1(linkedin_url) li from public.company_workspace where linkedin_url is not null
)
insert into public.company_workspace (company_name, homepage_url, linkedin_url, logo_url, company_description, company_db_id,
  is_internal, is_scrape_original, has_career_page)
select btrim(k.name), nullif(btrim(k.website_url), ''), k.linkedin_url, nullif(btrim(k.logo), ''),
  coalesce(nullif(btrim(k.description), ''), nullif(btrim(k.short_description), '')), k.id, false, false, false
from keyed k
where k.rn = 1 and k.li is not null
  and not exists (select 1 from taken t where t.li = k.li)
  and not exists (select 1 from public.company_workspace w where w.company_db_id = k.id)
  -- An exact public name already in use would make name lookups ambiguous.
  and not exists (select 1 from public.company_workspace w
    where not coalesce(w.is_internal, false) and lower(btrim(w.company_name)) = lower(btrim(k.name)));

-- 2. Facts about companies for one candidate, computed from existing records.
--    Team numbers come from Harper's career records and are as of their latest
--    collection date for that company (asOf).
create or replace function public.career_company_facts_v1(p_workspaces uuid[], p_talent uuid default null, p_titles public.vector default null)
returns table (company_workspace_id uuid, facts jsonb)
language sql stable security invoker set search_path = public, pg_temp as $$
  with ws as (
    select w.company_workspace_id, w.company_db_id, w.career_url
    from company_workspace w
    where w.company_workspace_id = any(p_workspaces) and not coalesce(w.is_internal, false)
  ), talent_schools as (
    select distinct lower(btrim(e.school)) school from talent_educations e
    where p_talent is not null and e.talent_id = p_talent and nullif(btrim(e.school), '') is not null
  ), talent_companies as (
    select distinct e.company_id::bigint id from talent_experiences e
    where p_talent is not null and e.talent_id = p_talent and e.company_id ~ '^[0-9]+$'
  )
  select ws.company_workspace_id, jsonb_strip_nulls(jsonb_build_object(
    'profile', (select jsonb_strip_nulls(jsonb_build_object('size', c.employee_count_range, 'founded', c.founded_year, 'location', c.location))
                from company_db c where c.id = ws.company_db_id),
    'team', case when team.staff > 0 or team.left_12m > 0 then jsonb_build_object(
      'asOf', snap.d, 'staff', team.staff, 'joined12m', team.joined_12m, 'left12m', team.left_12m,
      'cameFrom', prior.v) end,
    'leaders', leaders.v,
    'hiring', jsonb_build_object('openRoles', hiring.open_roles, 'latestPosting', hiring.latest,
      'relatedTitles', hiring.titles, 'careersUrl', ws.career_url),
    'reach', case when p_talent is not null and (reach.same_school > 0 or reach.same_company > 0)
      then jsonb_build_object('sameSchool', reach.same_school, 'sameCompany', reach.same_company) end
  ))
  from ws
  left join lateral (select max(e.created_at)::date d from experience_user e where e.company_id = ws.company_db_id) snap on true
  left join lateral (
    select count(distinct e.candid_id) filter (where e.end_date is null) staff,
      count(distinct e.candid_id) filter (where e.start_date >= snap.d - 365) joined_12m,
      count(distinct e.candid_id) filter (where e.end_date >= snap.d - 365) left_12m
    from experience_user e where e.company_id = ws.company_db_id
  ) team on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('company', x.name, 'n', x.n) order by x.n desc) v from (
      select c.name, count(distinct j.candid_id) n
      from (select e.candid_id, e.start_date from experience_user e
            where e.company_id = ws.company_db_id and e.end_date is null
            order by e.start_date desc nulls last limit 150) j
      join lateral (select p.company_id from experience_user p
                    where p.candid_id = j.candid_id and p.start_date < j.start_date and p.company_id <> ws.company_db_id
                    order by p.start_date desc limit 1) p on true
      join company_db c on c.id = p.company_id
      group by c.name having count(distinct j.candid_id) >= 2
      order by n desc limit 3) x
  ) prior on true
  left join lateral (
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('title', l.role, 'school', l.school, 'before', l.before))) v from (
      select e.role,
        (select d.school from edu_user d where d.candid_id = e.candid_id order by d.end_date desc nulls last limit 1) school,
        (select c.name from experience_user p join company_db c on c.id = p.company_id
          where p.candid_id = e.candid_id and p.company_id <> ws.company_db_id and p.start_date < e.start_date
          order by p.start_date desc limit 1) before
      from experience_user e
      where e.company_id = ws.company_db_id and e.end_date is null
        and e.role ~* '(founder|\mceo\M|\mcto\M|chief executive|chief technology|창업|대표)'
      order by e.start_date nulls last limit 2) l
  ) leaders on true
  left join lateral (
    select count(*) open_roles, max(coalesce(r.posted_at, r.created_at))::date latest,
      (select jsonb_agg(t.name) from (
         select r2.name from company_roles r2
         where r2.company_workspace_id = ws.company_workspace_id and r2.source_type = 'external'
           and coalesce(r2.source_provider, '') <> 'user_submitted' and not coalesce(r2.is_expired, false)
           and (r2.expires_at is null or r2.expires_at > now())
           and r2.status not in ('expired','closed','inactive','archived','ended')
           and lower(coalesce(r2.information->>'testOnly', 'false')) <> 'true'
         order by case when p_titles is null or r2.title_embedding is null then 1 else r2.title_embedding <=> p_titles end,
           coalesce(r2.posted_at, r2.created_at) desc nulls last
         limit 3) t) titles
    from company_roles r
    where r.company_workspace_id = ws.company_workspace_id and r.source_type = 'external'
      and coalesce(r.source_provider, '') <> 'user_submitted' and not coalesce(r.is_expired, false)
      and (r.expires_at is null or r.expires_at > now())
      and r.status not in ('expired','closed','inactive','archived','ended')
      and lower(coalesce(r.information->>'testOnly', 'false')) <> 'true'
  ) hiring on true
  left join lateral (
    select
      (select count(distinct e.candid_id) from experience_user e join edu_user d on d.candid_id = e.candid_id
        where e.company_id = ws.company_db_id and e.end_date is null and lower(btrim(d.school)) in (select school from talent_schools)) same_school,
      (select count(distinct e.candid_id) from experience_user e join experience_user x on x.candid_id = e.candid_id
        where e.company_id = ws.company_db_id and e.end_date is null and x.company_id in (select id from talent_companies)
          and x.company_id <> ws.company_db_id) same_company
    where p_talent is not null and ws.company_db_id is not null
  ) reach on true
$$;
revoke all on function public.career_company_facts_v1(uuid[], uuid, public.vector) from public, anon, authenticated;
grant execute on function public.career_company_facts_v1(uuid[], uuid, public.vector) to service_role;

-- 3. Retrieval index for finding companies by what they do or by similarity.
create table if not exists public.career_company_search (
  company_workspace_id uuid primary key references public.company_workspace(company_workspace_id) on delete cascade,
  body text not null,
  body_hash text not null,
  embedding public.vector(1536),
  embedding_model text,
  updated_at timestamptz not null default now()
);
create index if not exists career_company_search_vector on public.career_company_search
  using hnsw (embedding public.vector_cosine_ops);
alter table public.career_company_search enable row level security;
revoke all on table public.career_company_search from public, anon, authenticated;
grant select, insert, update, delete on table public.career_company_search to service_role;

create or replace function public.career_search_companies_v1(p_embedding public.vector, p_limit integer,
  p_exclude uuid[] default '{}', p_places text[] default null, p_min_size integer default null, p_max_size integer default null)
returns table (company_workspace_id uuid, distance double precision)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  return query
  select s.company_workspace_id, (s.embedding <=> p_embedding)::double precision
  from career_company_search s
  join company_workspace w on w.company_workspace_id = s.company_workspace_id
  left join company_db c on c.id = w.company_db_id
  where s.embedding is not null and not coalesce(w.is_internal, false)
    and not (s.company_workspace_id = any(coalesce(p_exclude, '{}')))
    and (p_places is null or exists (select 1 from unnest(p_places) pl where c.location ilike '%' || pl || '%'))
    and (p_min_size is null or coalesce((c.employee_count_range->>'end')::int, 2147483647) >= p_min_size)
    and (p_max_size is null or coalesce((c.employee_count_range->>'start')::int, 0) <= p_max_size)
  order by s.embedding <=> p_embedding
  limit least(greatest(p_limit, 1), 1200);
end $$;
revoke all on function public.career_search_companies_v1(public.vector, integer, uuid[], text[], integer, integer) from public, anon, authenticated;
grant execute on function public.career_search_companies_v1(public.vector, integer, uuid[], text[], integer, integer) to service_role;

-- 4. Every option evaluated for a matching, numbered.
create table if not exists public.talent_matching_candidates (
  matching_id uuid not null references public.talent_matchings(id) on delete cascade,
  number integer not null,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  role_id uuid references public.company_roles(role_id) on delete cascade,
  company_workspace_id uuid references public.company_workspace(company_workspace_id) on delete cascade,
  first_run_id uuid,
  first_seen_at timestamptz not null default now(),
  angles text[] not null default '{}',
  latest_evaluation_id uuid,
  latest_score real,
  updated_at timestamptz not null default now(),
  primary key (matching_id, number),
  check ((role_id is null) <> (company_workspace_id is null))
);
create unique index if not exists talent_matching_candidates_role on public.talent_matching_candidates(matching_id, role_id) where role_id is not null;
create unique index if not exists talent_matching_candidates_company on public.talent_matching_candidates(matching_id, company_workspace_id) where company_workspace_id is not null;
alter table public.talent_matching_candidates enable row level security;
revoke all on table public.talent_matching_candidates from public, anon, authenticated;
grant select, insert, update, delete on table public.talent_matching_candidates to service_role;

-- Records one search's evaluated options in its matching. Existing options keep
-- their number; new ones get the next numbers in the given order.
create or replace function public.career_record_matching_candidates_v1(p_matching uuid, p_talent uuid, p_run uuid, p_items jsonb)
returns table (number integer, role_id uuid, company_workspace_id uuid, first_run_id uuid, latest_score real)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare item jsonb; next_number integer; v_role uuid; v_company uuid;
begin
  perform 1 from talent_matchings m where m.id = p_matching and m.talent_id = p_talent for update;
  if not found then raise exception 'Matching unavailable'; end if;
  select coalesce(max(c.number), 0) + 1 into next_number from talent_matching_candidates c where c.matching_id = p_matching;
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_role := nullif(item->>'roleId', '')::uuid;
    v_company := case when v_role is null then nullif(item->>'companyWorkspaceId', '')::uuid end;
    if v_role is null and v_company is null then continue; end if;
    update talent_matching_candidates c set
      latest_evaluation_id = coalesce(nullif(item->>'evaluationId', '')::uuid, c.latest_evaluation_id),
      latest_score = coalesce((item->>'score')::real, c.latest_score),
      angles = (select array(select distinct x from unnest(c.angles || coalesce(array(select jsonb_array_elements_text(item->'angles')), '{}')) x)),
      updated_at = now()
    where c.matching_id = p_matching
      and ((v_role is not null and c.role_id = v_role) or (v_company is not null and c.company_workspace_id = v_company));
    if not found then
      insert into talent_matching_candidates (matching_id, number, talent_id, role_id, company_workspace_id, first_run_id,
        angles, latest_evaluation_id, latest_score)
      values (p_matching, next_number, p_talent, v_role, v_company, p_run,
        coalesce(array(select jsonb_array_elements_text(item->'angles')), '{}'),
        nullif(item->>'evaluationId', '')::uuid, (item->>'score')::real);
      next_number := next_number + 1;
    end if;
  end loop;
  return query select c.number, c.role_id, c.company_workspace_id, c.first_run_id, c.latest_score
    from talent_matching_candidates c where c.matching_id = p_matching;
end $$;
revoke all on function public.career_record_matching_candidates_v1(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.career_record_matching_candidates_v1(uuid, uuid, uuid, jsonb) to service_role;

-- Companies that share people with the given companies: many people who worked
-- at a seed company also worked here. Pairs with fewer than 3 people are left out.
create or replace function public.career_company_coflow_v1(p_workspaces uuid[], p_limit integer default 30)
returns table (company_workspace_id uuid, shared integer)
language sql stable security invoker set search_path = public, pg_temp as $$
  with seeds as (
    select w.company_db_id from company_workspace w
    where w.company_workspace_id = any(p_workspaces) and w.company_db_id is not null
  ), people as (
    select distinct e.candid_id from experience_user e join seeds s on s.company_db_id = e.company_id
    limit 3000
  ), moves as (
    select e.company_id, count(distinct e.candid_id) n from experience_user e join people p on p.candid_id = e.candid_id
    where e.company_id not in (select company_db_id from seeds)
    group by e.company_id having count(distinct e.candid_id) >= 3
  )
  -- Shared people relative to company size, so large employers that everyone
  -- passes through do not crowd out companies that are actually alike.
  select w.company_workspace_id, m.n::integer
  from moves m join company_workspace w on w.company_db_id = m.company_id and not coalesce(w.is_internal, false)
  left join company_db c on c.id = m.company_id
  where not (w.company_workspace_id = any(p_workspaces))
  order by m.n / sqrt(greatest(coalesce((c.employee_count_range->>'start')::numeric, 50), 1)) desc
  limit least(greatest(p_limit, 1), 200)
$$;
revoke all on function public.career_company_coflow_v1(uuid[], integer) from public, anon, authenticated;
grant execute on function public.career_company_coflow_v1(uuid[], integer) to service_role;

-- Load pgvector in the migration session so its parameters are known.
select public.vector_dims('[1,0]'::public.vector);

-- Role retrieval as one JSON array. The API returns at most 1000 rows per
-- response, so a Career search of up to 1200 postings uses this form; the
-- settings match search_external_roles_filter_first.
create or replace function public.career_search_external_roles_rows_v1(p_sql text)
returns jsonb
language plpgsql security invoker
set search_path to ''
set enable_sort to 'off'
set jit to 'off'
set "hnsw.ef_search" to '100'
set "hnsw.iterative_scan" to 'strict_order'
set "hnsw.max_scan_tuples" to '100000'
set "hnsw.scan_mem_multiplier" to '4'
set statement_timeout to '50s'
as $$
declare rows jsonb;
begin
  execute 'select coalesce(jsonb_agg(to_jsonb(result)), ''[]''::jsonb) from (' || p_sql || ') result' into rows;
  return rows;
end $$;
revoke all on function public.career_search_external_roles_rows_v1(text) from public, anon, authenticated;
grant execute on function public.career_search_external_roles_rows_v1(text) to service_role;
