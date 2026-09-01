begin;

alter table public.company_workspace
  add column if not exists external_roles_enabled boolean not null default true;

comment on column public.company_workspace.external_roles_enabled is
  'Whether this workspace''s external company_roles may appear in talent-facing external role search. External role ingestion is unaffected.';

update public.company_workspace
set external_roles_enabled = false,
    updated_at = now()
where company_workspace_id = 'f2e80aee-fee3-40f5-807f-5f8694c37eee'::uuid;

commit;
