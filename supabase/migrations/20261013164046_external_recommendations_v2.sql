set local lock_timeout = '5s';
-- Acquire the existing-table locks together or fail immediately. This avoids
-- holding one table while a live matching transaction waits in the opposite order.
lock table public.company_roles in access exclusive mode;
lock table public.talent_setting, public.talent_external_fit, public.talent_opportunity_recommendation
  in access exclusive mode nowait;
lock table public.talent_users in share row exclusive mode nowait;
-- Additive experiment: legacy fit.meta and existing recommendation consumers remain intact.
-- Existing Harper pgvector lives in public; do not relocate the shared extension.
create extension if not exists vector with schema public;
alter table public.company_roles
  add column if not exists title_embedding public.vector(1536),
  add column if not exists title_embedding_text text,
  add column if not exists opportunity_quality_score real check (opportunity_quality_score between 0 and 100),
  add column if not exists opportunity_quality_assessment text,
  add column if not exists opportunity_quality_version text;
create index if not exists company_roles_title_embedding_hnsw
  on public.company_roles using hnsw (title_embedding public.vector_cosine_ops)
  where title_embedding is not null;
alter table public.talent_setting add column if not exists external_search_default jsonb;
alter table public.talent_external_fit add column if not exists evaluations jsonb not null default '{}'::jsonb;

create or replace function public.invalidate_external_role_derived_data()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    new.title_embedding := null;
    new.title_embedding_text := null;
  end if;
  if new.name is distinct from old.name or new.description is distinct from old.description
     or new.company_workspace_id is distinct from old.company_workspace_id then
    new.opportunity_quality_score := null;
    new.opportunity_quality_assessment := null;
    new.opportunity_quality_version := null;
  end if;
  return new;
end $$;
revoke all on function public.invalidate_external_role_derived_data() from public, anon, authenticated;
drop trigger if exists invalidate_external_role_derived_data on public.company_roles;
create trigger invalidate_external_role_derived_data before update on public.company_roles
  for each row execute function public.invalidate_external_role_derived_data();

-- A run is a durable execution/exposure record, not transient model reasoning.
-- day_key is present only for the once-per-day Career visit job.
create table if not exists public.external_recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  experiment text not null,
  variant text not null check (variant in ('control','v2')),
  surface text not null check (surface in ('web','worker','daily')),
  provider text,
  status text not null default 'running' check (status in ('running','selected','completed','failed','skipped')),
  discovery_run_id uuid,
  day_key date,
  time_zone text,
  locale text,
  attempts int not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  plan jsonb,
  metrics jsonb not null default '{}'::jsonb,
  role_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  unique(talent_id, day_key)
);
alter table public.external_recommendation_runs enable row level security;
revoke all on public.external_recommendation_runs from anon, authenticated;
grant all on public.external_recommendation_runs to service_role;
create index if not exists external_recommendation_runs_talent_created
  on public.external_recommendation_runs(talent_id,created_at desc);

-- Merge a versioned fit without overwriting legacy meta or another provider's result.
create or replace function public.save_external_fit_v2(p_talent_id uuid, p_evaluator text, p_rows jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 10 then
    raise exception 'Expected at most ten evaluations';
  end if;
  insert into public.talent_external_fit(talent_id,role_id,meta,evaluations,created_at)
  select p_talent_id,(x->>'roleId')::uuid,'{}'::jsonb,jsonb_build_object(p_evaluator,x),now()
  from jsonb_array_elements(p_rows) x
  on conflict(talent_id,role_id) do update
  set evaluations = public.talent_external_fit.evaluations || excluded.evaluations;
end $$;
revoke all on function public.save_external_fit_v2(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_external_fit_v2(uuid,text,jsonb) to service_role;

alter table public.talent_opportunity_recommendation
  add column if not exists external_experiment_run_id uuid references public.external_recommendation_runs(id);
create unique index if not exists external_recommendation_run_role_unique
  on public.talent_opportunity_recommendation(external_experiment_run_id,role_id)
  where external_experiment_run_id is not null;

create or replace function public.complete_external_recommendation_run(p_run_id uuid,p_rows jsonb,p_lease_token uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.external_recommendation_runs; result jsonb; ids uuid[];
begin
  select * into strict r from public.external_recommendation_runs where id=p_run_id for update;
  -- Serialize concurrent daily/manual saves for this talent, not just this run.
  perform 1 from public.talent_setting where user_id=r.talent_id for update;
  if r.status='completed' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'role_id',role_id)),'[]'::jsonb) into result
      from public.talent_opportunity_recommendation where external_experiment_run_id=p_run_id;
    return result;
  end if;
  if r.surface='daily' and (r.lease_token is distinct from p_lease_token or r.lease_expires_at<=now()) then raise exception 'Daily search lease lost'; end if;
  if r.surface='daily' and r.day_key is distinct from (now() at time zone r.time_zone)::date then
    update public.external_recommendation_runs set status='skipped',finished_at=now() where id=r.id;
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>20 then raise exception 'Invalid recommendation list'; end if;
  with inserted as (
    insert into public.talent_opportunity_recommendation
      (talent_id,role_id,kind,opportunity_type,rank,score,fit_summary,fit_reasons,tradeoffs,evidence,external_experiment_run_id)
    select r.talent_id,cr.role_id,'recommend_job_postings','external_jd',(x->>'rank')::int,(x->>'score')::real,
      x->>'fit_summary',coalesce(x->'fit_reasons','[]'::jsonb),coalesce(x->'tradeoffs','[]'::jsonb),coalesce(x->'evidence','[]'::jsonb),r.id
    from jsonb_array_elements(p_rows) x
    join public.company_roles cr on cr.role_id=(x->>'role_id')::uuid
    join public.company_workspace cw on cw.company_workspace_id=cr.company_workspace_id
    left join public.company_db cd on cd.id=cw.company_db_id
    join public.talent_setting s on s.user_id=r.talent_id
    join public.talent_users u on u.user_id=r.talent_id and u.deleted_at is null
    where cr.source_type='external' and coalesce(cr.is_expired,false)=false
      and (cr.expires_at is null or cr.expires_at>now()) and cr.status not in ('closed','expired','inactive','archived','ended')
      and coalesce(cr.source_provider,'')<>'user_submitted' and cw.external_roles_enabled=true
      and lower(coalesce(cr.information->>'testOnly','false'))<>'true'
      and s.get_external_recommendation is distinct from false
      and (r.surface<>'daily' or (s.status<>'stopped' and s.is_onboarding_done=true))
      and not exists (select 1 from unnest(s.blocked_companies) b where (nullif(btrim(b),'') is not null and (cw.company_name ilike '%'||btrim(b)||'%' or cd.name ilike '%'||btrim(b)||'%' or b=cw.company_workspace_id::text)))
      and not exists (select 1 from public.talent_opportunity_recommendation t where t.talent_id=r.talent_id and t.opportunity_type='external_jd' and (t.role_id=cr.role_id or exists (select 1 from public.company_roles prev where prev.role_id=t.role_id and prev.company_workspace_id=cr.company_workspace_id and lower(btrim(prev.name))=lower(btrim(cr.name)))))
    returning id,role_id
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'role_id',role_id)),'[]'::jsonb),coalesce(array_agg(role_id),'{}'::uuid[]) into result,ids from inserted;
  update public.external_recommendation_runs set status='completed',finished_at=now(),role_ids=ids where id=r.id;
  return result;
end $$;
revoke all on function public.complete_external_recommendation_run(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.complete_external_recommendation_run(uuid,jsonb,uuid) to service_role;

-- A queue retry must claim the same daily execution; it cannot create another daily exposure.
create or replace function public.claim_daily_external_run(p_run_id uuid,p_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.external_recommendation_runs;
begin
  update public.external_recommendation_runs set lease_token=p_token,lease_expires_at=now()+interval '15 minutes',attempts=attempts+1
    where id=p_run_id and surface='daily' and status='running' and attempts<3
      and (lease_expires_at is null or lease_expires_at<=now())
    returning * into r;
  if not found then return null; end if;
  return to_jsonb(r);
end $$;
revoke all on function public.claim_daily_external_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_daily_external_run(uuid,uuid) to service_role;

create index if not exists company_roles_missing_title_embedding
  on public.company_roles(role_id) where title_embedding is null;
create or replace function public.pending_role_title_embeddings(p_limit int default 512)
returns table(role_id uuid,name text) language sql security invoker set search_path = '' as $$
  select cr.role_id,cr.name from public.company_roles cr
  where cr.title_embedding is null and nullif(btrim(cr.name),'') is not null
  order by cr.role_id limit least(1000,greatest(1,p_limit));
$$;
create or replace function public.save_role_title_embeddings(p_rows jsonb)
returns int language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>64 then raise exception 'Invalid embedding batch'; end if;
  update public.company_roles cr set title_embedding=(x->>'embedding')::public.vector(1536),title_embedding_text=x->>'title'
    from jsonb_array_elements(p_rows) x where cr.role_id=(x->>'roleId')::uuid and cr.name=x->>'title';
  get diagnostics n=row_count;
  return n;
end $$;
revoke all on function public.pending_role_title_embeddings(int) from public,anon,authenticated;
revoke all on function public.save_role_title_embeddings(jsonb) from public,anon,authenticated;
grant execute on function public.pending_role_title_embeddings(int) to service_role;
grant execute on function public.save_role_title_embeddings(jsonb) to service_role;

-- Only server-authored SQL reaches this service-only executor. HNSW's default
-- candidate budget (40) is too small for the requested 1,000-title neighbor pool.
create or replace function public.search_external_roles_v2(p_sql text)
returns setof jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform set_config('statement_timeout','30000',true);
  perform set_config('hnsw.ef_search','1000',true);
  perform set_config('hnsw.iterative_scan','relaxed_order',true);
  return query execute 'select to_jsonb(result) from (' || p_sql || ') result';
end $$;
revoke all on function public.search_external_roles_v2(text) from public,anon,authenticated;
grant execute on function public.search_external_roles_v2(text) to service_role;

create or replace function public.save_external_role_summaries_v2(p_locale text,p_rows jsonb,p_quality_version text)
returns table(role_id uuid,summary jsonb,opportunity_quality_score real,opportunity_quality_assessment text)
language plpgsql security invoker set search_path = '' as $$
begin
  if p_locale not in ('ko','en') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>10 then raise exception 'Invalid summary batch'; end if;
  update public.company_roles cr set summary=jsonb_set(coalesce(cr.summary,'{}'::jsonb),array[p_locale],x->'payload',true),
    opportunity_quality_score=(x->>'opportunityQualityScore')::real,opportunity_quality_assessment=x->>'qualityAssessment',opportunity_quality_version=p_quality_version
    from jsonb_array_elements(p_rows) x
    where cr.role_id=(x->>'roleId')::uuid and cr.name=x->>'roleName'
      and coalesce(cr.description,'')=x->>'description' and cr.company_workspace_id=(x->>'companyWorkspaceId')::uuid
      and nullif(btrim(cr.summary->p_locale->>'content'),'') is null;
  -- Return the winning locale (including a concurrent writer's), never overwrite an existing summary.
  return query select cr.role_id,cr.summary,cr.opportunity_quality_score,cr.opportunity_quality_assessment
    from public.company_roles cr join jsonb_array_elements(p_rows) x on cr.role_id=(x->>'roleId')::uuid
    where cr.name=x->>'roleName' and coalesce(cr.description,'')=x->>'description'
      and cr.company_workspace_id=(x->>'companyWorkspaceId')::uuid;
end $$;
revoke all on function public.save_external_role_summaries_v2(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_external_role_summaries_v2(text,jsonb,text) to service_role;

-- Preserve ingestion guards while permitting derived-only summaries and quality.
CREATE OR REPLACE FUNCTION public.guard_linkedin_role_write_for_vc_primary()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fallback_workspace text;
begin
  if new.source_provider is null
     or new.source_provider not in (
       'linkedin',
       'linkedin_jobs',
       'linkedin_jobs_scraping'
     ) then
    return new;
  end if;

  -- Derived geography, summary and quality correction is not a competing source write.
  -- Source identity, location text, liveness and timestamps must be unchanged.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['country_code', 'work_mode', 'summary', 'opportunity_quality_score', 'opportunity_quality_assessment', 'opportunity_quality_version'])
         = (to_jsonb(old) - array['country_code', 'work_mode', 'summary', 'opportunity_quality_score', 'opportunity_quality_assessment', 'opportunity_quality_version']) then
    return new;
  end if;

  -- A transition to ended that changes only liveness metadata is a
  -- deactivation, not a competing LinkedIn ingestion write. Let it proceed
  -- without taking the workspace advisory lock and without suppressing it for
  -- an operational VC identity. Reactivation and content/source changes still
  -- follow the serialized guard path below.
  if tg_op = 'UPDATE'
     and lower(btrim(coalesce(new.status, ''))) = 'ended'
     and (
       to_jsonb(new) - array[
         'status',
         'is_expired',
         'expired_at',
         'updated_at'
       ]
     ) = (
       to_jsonb(old) - array[
         'status',
         'is_expired',
         'expired_at',
         'updated_at'
       ]
     ) then
    return new;
  end if;

  perform public.lock_company_role_ingest(new.company_workspace_id);

  fallback_workspace := current_setting(
    'harper.allow_linkedin_vc_fallback_workspace',
    true
  );
  if fallback_workspace = new.company_workspace_id::text then
    return new;
  end if;

  if public.vc_identity_is_operational(new.company_workspace_id) then
    return null;
  end if;

  return new;
end;
$function$
;
