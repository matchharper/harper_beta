-- Keep extensible identifiers and legacy metadata as text instead of
-- duplicating application vocabularies in database CHECK constraints.
-- Workflow, authorization, privacy, lifecycle, and cross-field integrity
-- constraints intentionally remain unchanged.
begin;

alter table public.run_variants
  drop constraint if exists run_variants_variant_check;

alter table public.official_jobs
  drop constraint if exists official_jobs_employment_type_check;

alter table public.official_job_events
  drop constraint if exists official_job_events_event_type_check;

alter table public.company_talent_requests
  drop constraint if exists company_talent_requests_response_disposition_check;

alter table public.jobposting_company_identity
  drop constraint if exists jobposting_company_identity_provider_check;

alter table public.opportunity_source_registry
  drop constraint if exists opportunity_source_registry_access_mode_check;

alter table public.opportunity_source_document
  drop constraint if exists opportunity_source_document_status_check,
  drop constraint if exists opportunity_source_document_type_check;

comment on column public.run_variants.variant is
  'Search variant identifier sourced from active ensemble configuration; not a database enum.';
comment on column public.official_jobs.employment_type is
  'Employment type text supplied or normalized by the owning application.';
comment on column public.official_job_events.event_type is
  'Application-defined analytics event identifier.';
comment on column public.company_talent_requests.response_disposition is
  'Legacy response metadata retained for compatibility; not a database enum.';
comment on column public.jobposting_company_identity.provider is
  'External job-source provider identifier; new providers do not require a schema migration.';
comment on column public.opportunity_source_registry.allowed_access_mode is
  'Source access-mode identifier interpreted by an active reader, when present.';
comment on column public.opportunity_source_document.status is
  'Source-document status identifier interpreted by an active reader, when present.';
comment on column public.opportunity_source_document.source_type is
  'Source-document type identifier interpreted by an active reader, when present.';

commit;
