-- Persist the current cross-campaign outreach priority without turning it into
-- an automatic scoring engine. The score is Agent/team judgment backed by the
-- latest research_result evidence and is intentionally nullable until reviewed.
alter table public.gtm_creators
  add column if not exists outreach_score smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.gtm_creators'::regclass
      and conname = 'gtm_creators_outreach_score_check'
  ) then
    alter table public.gtm_creators
      add constraint gtm_creators_outreach_score_check
      check (outreach_score between 1 and 5);
  end if;
end
$$;

comment on column public.gtm_creators.outreach_score is
  'Current overall outreach priority from 1 (low) to 5 (high), judged from activity, audience/topic fit, content and engagement quality, contact readiness, and material risks. Null means not yet reviewed; rationale and evidence belong in research_result activities.';

-- PostgreSQL expands `creator.*` when a view is created. Preserve the deployed
-- read models and add the new column through stable wrappers so downstream
-- views keep their existing column order.
do $$
begin
  if to_regclass('public.gtm_creator_directory_sheet_base_v1') is null then
    alter view public.gtm_creator_directory_sheet_v1
      rename to gtm_creator_directory_sheet_base_v1;
  end if;
  if to_regclass('public.gtm_creator_overview_base_v1') is null then
    alter view public.gtm_creator_overview
      rename to gtm_creator_overview_base_v1;
  end if;
end
$$;

create or replace view public.gtm_creator_overview
with (security_invoker = true) as
select
  base.*,
  creator.outreach_score
from public.gtm_creator_overview_base_v1 base
join public.gtm_creators creator on creator.id = base.id;

create or replace view public.gtm_creator_directory_sheet_v1
with (security_invoker = true) as
select
  base.*,
  creator.outreach_score
from public.gtm_creator_directory_sheet_base_v1 base
join public.gtm_creators creator on creator.id = base.id;

revoke all on
  public.gtm_creator_overview_base_v1,
  public.gtm_creator_directory_sheet_base_v1,
  public.gtm_creator_overview,
  public.gtm_creator_directory_sheet_v1
from public, anon, authenticated;

comment on view public.gtm_creator_overview is
  'Default creator operating read, including the current evidence-backed 1-5 outreach priority.';
comment on view public.gtm_creator_directory_sheet_v1 is
  'Editable creator directory read model, including the current evidence-backed 1-5 outreach priority.';
comment on view public.gtm_creator_overview_base_v1 is
  'Internal stable base retained so dependent operating views preserve their deployed column order.';
comment on view public.gtm_creator_directory_sheet_base_v1 is
  'Internal stable base retained so dependent Sheet views preserve their deployed column order.';

notify pgrst, 'reload schema';
