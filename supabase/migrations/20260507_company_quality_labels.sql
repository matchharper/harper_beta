create table if not exists public.company_workspace_quality_label (
  company_workspace_id uuid primary key references public.company_workspace(company_workspace_id) on delete cascade,
  llm_quality_label smallint,
  llm_quality_label_reason text,
  llm_quality_labeled_at timestamp with time zone,
  human_quality_label smallint,
  human_quality_labeled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.company_workspace_quality_label enable row level security;

do $$
begin
  alter table public.company_workspace_quality_label
    add constraint company_workspace_quality_label_llm_check
    check (llm_quality_label is null or llm_quality_label in (0, 1, 2));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.company_workspace_quality_label
    add constraint company_workspace_quality_label_human_check
    check (human_quality_label is null or human_quality_label in (0, 1, 2));
exception
  when duplicate_object then null;
end $$;

create index if not exists company_workspace_quality_label_effective_idx
  on public.company_workspace_quality_label (human_quality_label, llm_quality_label);
