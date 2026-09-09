begin;

-- Final context storage contract: one current text document per role.
-- If the old workspace-scoped table still exists, the preceding corrective
-- migration has already merged its useful text into the role-scoped table.
do $$
begin
  if to_regclass('public.company_behavior_contexts') is not null
     and not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'company_behavior_contexts'
         and column_name = 'role_id'
     ) then
    drop table public.company_behavior_contexts;
  end if;
end;
$$;

create table if not exists public.company_behavior_contexts (
  role_id uuid primary key
    references public.company_roles(role_id) on delete cascade,
  text_context text not null default ''
);

do $$
begin
  if to_regclass('public.company_role_behavior_contexts') is not null then
    insert into public.company_behavior_contexts (role_id, text_context)
    select role_id, text_context
    from public.company_role_behavior_contexts
    on conflict (role_id) do update
      set text_context = excluded.text_context;

    drop table public.company_role_behavior_contexts;
  end if;
end;
$$;

-- Remove every field from earlier versioned/context-diff drafts if this
-- migration is applied to an intermediate schema.
alter table public.company_behavior_contexts
  drop column if exists company_workspace_id,
  drop column if exists context_version,
  drop column if exists context_hash,
  drop column if exists source_fingerprint,
  drop column if exists source_snapshot,
  drop column if exists changed_domains,
  drop column if exists builder_version,
  drop column if exists last_checked_at,
  drop column if exists last_changed_at,
  drop column if exists created_at,
  drop column if exists updated_at;

alter table public.company_behavior_contexts enable row level security;
grant all on table public.company_behavior_contexts to service_role;

comment on table public.company_behavior_contexts is
  'One current verbalized company behavior context text document per internal role.';

commit;
