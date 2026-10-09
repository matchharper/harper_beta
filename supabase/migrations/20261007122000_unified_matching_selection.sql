begin;
alter table public.talent_opportunity_matching_review
  alter column run_id drop not null,
  add column if not exists source_discovery_run_id uuid references public.opportunity_discovery_run(id) on delete set null,
  add column if not exists selection_fingerprint text,
  add column if not exists not_before timestamptz not null default now(),
  add column if not exists recommendation_id uuid references public.talent_opportunity_recommendation(id) on delete set null,
  add column if not exists closed_at timestamptz,
  add column if not exists close_reason text,
  add column if not exists introduction text,
  add column if not exists presentation_fingerprint text,
  add column if not exists priority_request_id uuid references public.talent_progress(id) on delete set null;
create unique index if not exists matching_review_discovery_pair_idx
  on public.talent_opportunity_matching_review(source_discovery_run_id,talent_id,opportunity_id)
  where source_discovery_run_id is not null;
create index if not exists matching_review_pending_talent_idx
  on public.talent_opportunity_matching_review(talent_id,not_before,reviewed_at)
  where decision in ('candidate_first','both') and recommendation_id is null and closed_at is null;
create index if not exists matching_review_selection_fingerprint_idx
  on public.talent_opportunity_matching_review(selection_fingerprint)
  where selection_fingerprint is not null;

create or replace function public.talent_internal_role_is_candidate_visible_v1(p_fit public.talent_opportunity_fit)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
  select case
    when p_fit.id is null then false
    when nullif(btrim(coalesce(p_fit.human_label,'')),'') is not null
      and lower(btrim(p_fit.human_label))<>'fit' then false
    when p_fit.fit_contract_version='talent_role_fit_v2' then
      p_fit.expires_at>now() and exists (
        select 1 from public.talent_opportunity_matching_review selected
        where selected.talent_id=p_fit.talent_id and selected.opportunity_id=p_fit.opportunity_id
          and selected.decision in ('candidate_first','both') and selected.closed_at is null
          and selected.input_fingerprint=p_fit.input_fingerprint
      )
    when lower(btrim(coalesce(p_fit.candidate_fit,'')))='unfit' then false
    when nullif(btrim(coalesce(p_fit.human_label,'')),'') is not null
      then lower(btrim(p_fit.human_label))='fit'
    else lower(btrim(coalesce(p_fit.label,'')))='fit' or coalesce(p_fit.recommend,false)
      or (lower(btrim(coalesce(p_fit.role_fit,'')))='fit'
          and lower(btrim(coalesce(p_fit.company_fit,'')))='fit')
  end;
$$;

-- A priority-review request is not a company proposal and cannot make its own
-- candidate unavailable to the company reranker.
create or replace function public.company_first_pair_is_available_v1(p_talent_id uuid,p_role_id uuid)
returns boolean language sql stable security invoker set search_path = public,pg_temp as $$
  select not exists (
    select 1 from public.company_intro_candidates where talent_id=p_talent_id and role_id=p_role_id
  ) and not exists (
    select 1 from public.talent_opportunity_recommendation
    where talent_id=p_talent_id and role_id=p_role_id and feedback='like'
  ) and not exists (
    select 1 from public.talent_opportunity_tag where talent_id=p_talent_id and opportunity_id=p_role_id
      and (tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼') or tag like '내부단계:%')
  );
$$;

-- Only a durable recommendation closes a pending candidate-side selection.
create or replace function public.fulfill_candidate_matching_selection_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.talent_opportunity_matching_review
  set recommendation_id=new.id
  where talent_id=new.talent_id and opportunity_id=new.role_id
    and decision in ('candidate_first','both') and closed_at is null and recommendation_id is null;
  return new;
end $$;
revoke all on function public.fulfill_candidate_matching_selection_v1() from public,anon,authenticated;
create trigger fulfill_candidate_matching_selection
  after insert on public.talent_opportunity_recommendation
  for each row execute function public.fulfill_candidate_matching_selection_v1();
commit;
