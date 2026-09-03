-- Public a16z and Greylock portfolio sites replaced their Consider boards.
-- Keep their identity rows in the same one-VC-source-per-workspace contract.
begin;

alter table public.jobposting_company_identity
  drop constraint if exists jobposting_company_identity_provider_check;

alter table public.jobposting_company_identity
  add constraint jobposting_company_identity_provider_check
  check (
    provider in (
      'wanted', 'linkedin', 'jobkorea', 'saramin',
      'greenhouse', 'lever', 'ashby', 'workday', 'other',
      'consider', 'getro', 'portfolio_site'
    )
  );

drop index if exists public.jobposting_company_identity_vc_workspace_uidx;

create unique index jobposting_company_identity_vc_workspace_uidx
  on public.jobposting_company_identity (company_workspace_id)
  where provider in ('consider', 'getro', 'portfolio_site');

create or replace function public.vc_identity_is_operational(
  target_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobposting_company_identity identity_row
    where identity_row.company_workspace_id = target_workspace_id
      and identity_row.provider in ('consider', 'getro', 'portfolio_site')
      and coalesce(
        (identity_row.evidence->'vc_jobs'->>'enabled')::boolean,
        false
      )
      and identity_row.evidence->'vc_jobs'->>'status' in (
        'primary',
        'switching',
        'degraded',
        'fallback_pending'
      )
  );
$$;

revoke all on function public.vc_identity_is_operational(uuid) from public;
grant execute on function public.vc_identity_is_operational(uuid) to service_role;

commit;
