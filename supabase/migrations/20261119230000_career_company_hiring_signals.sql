-- Hiring signals: dated public sources saying a company is, or is not, hiring
-- people like a Career user (a team being built, an office or market entry,
-- funding with hiring plans, a freeze, layoffs). Each source is one
-- company_datas row labelled 'hiring signal' on the company's workspace, so
-- every Career user reads the same record with its sources. The record's
-- content starts with the source's date (docs/career-agent-harness-ko.md 4.3, 4.4).
--
-- A check that finds nothing is also a fact: the last check of each company is
-- kept here, and a company is looked at again only when that check is old. A
-- check claims the existing per-company provider lease
-- (career_claim_company_summary_v1) under its own key, so the overview and the
-- signals of one company can be prepared at the same time.
set local lock_timeout = '5s';

create table public.career_company_signal_checks (
  company_workspace_id uuid primary key
    references public.company_workspace(company_workspace_id) on delete cascade,
  checked_at timestamptz not null
);
alter table public.career_company_signal_checks enable row level security;
revoke all on public.career_company_signal_checks from public, anon, authenticated;
grant select, insert, update, delete on public.career_company_signal_checks to service_role;

-- A signal's date: the leading YYYY-MM-DD of its content, else its source's
-- publication date in the prompt time zone.
create function public.career_company_signal_date_v1(d public.company_datas) returns date
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(
    case when pg_input_is_valid(substring(d.content from '^\s*(\d{4}-\d{2}-\d{2})'), 'date')
      then substring(d.content from '^\s*(\d{4}-\d{2}-\d{2})')::date end,
    (select (min(o.published_at) at time zone 'Asia/Seoul')::date
       from jsonb_array_elements(d.source_refs) r
       join career_public_observations o
         on o.id = case when pg_input_is_valid(r->>'id', 'uuid') then (r->>'id')::uuid end
      where o.deleted_at is null))
$$;

-- Per requested workspace (or a sibling of the same directory company): the
-- workspace holding the company's research, its name and links, when its
-- signals were last checked, how many signals are on record, and the latest
-- p_limit of them with their date, text without the leading date, and source.
create function public.career_company_signals_v1(p_workspaces uuid[], p_limit integer)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(career_company_home_json_v1(home.id) || jsonb_build_object(
      'requestedId', given.id::text,
      'checkedAt', (select c.checked_at from career_company_signal_checks c where c.company_workspace_id = home.id),
      'total', (select count(*) from company_datas d where d.company_workspace_id = home.id and d.label = 'hiring signal'),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
            'dataRef', jsonb_build_object('kind', 'company_datum', 'id', s.id::text, 'revision', s.revision::text),
            'date', s.signal_date,
            'content', regexp_replace(s.content, '^\s*\d{4}-\d{2}-\d{2}\s*[—–:-]?\s*', ''),
            'url', s.url)
          order by s.signal_date desc nulls last, s.checked_at desc, s.id)
        from (
          select d.id, d.revision, d.content, d.checked_at, career_company_signal_date_v1(d) signal_date,
            (select o.source_url from jsonb_array_elements(d.source_refs) r
               join career_public_observations o
                 on o.id = case when pg_input_is_valid(r->>'id', 'uuid') then (r->>'id')::uuid end
              limit 1) url
          from company_datas d
          where d.company_workspace_id = home.id and d.label = 'hiring signal'
          order by career_company_signal_date_v1(d) desc nulls last, d.checked_at desc, d.id
          limit greatest(coalesce(p_limit, 0), 0)
        ) s), '[]'::jsonb)
    ) order by given.ord), '[]'::jsonb)
  from unnest(p_workspaces) with ordinality given(id, ord)
  cross join lateral (select career_company_home_v1(given.id) id) home
  where home.id is not null
$$;

-- Releases the lease of a signal check. A completed check (found or not) is
-- recorded only by the lease holder; a lost lease records nothing.
create function public.career_finish_company_signals_v1(p_key text, p_owner uuid, p_workspace uuid, p_checked boolean)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare home uuid;
begin
  delete from career_company_summary_leases where company_key = p_key and owner = p_owner
    and expires_at > clock_timestamp();
  if not found then return false; end if;
  home := career_company_home_v1(p_workspace);
  if p_checked and home is not null then
    insert into career_company_signal_checks(company_workspace_id, checked_at) values (home, clock_timestamp())
    on conflict (company_workspace_id) do update set checked_at = excluded.checked_at;
  end if;
  return true;
end $$;

revoke all on function public.career_company_signal_date_v1(public.company_datas),
  public.career_company_signals_v1(uuid[], integer),
  public.career_finish_company_signals_v1(text, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.career_company_signal_date_v1(public.company_datas),
  public.career_company_signals_v1(uuid[], integer),
  public.career_finish_company_signals_v1(text, uuid, uuid, boolean) to service_role;
