alter table public.company_workspace_quality_label
  add column if not exists llm_quality_label_v2 smallint;

create index if not exists company_workspace_quality_label_llm_v2_idx
  on public.company_workspace_quality_label (llm_quality_label_v2);

create or replace view public.ops_company_workspace_with_label as
select
  cw.*,
  cwql.human_quality_label as cwql_human_quality_label,
  cwql.llm_quality_label as cwql_llm_quality_label,
  cwql.llm_quality_label_v2 as cwql_llm_quality_label_v2
from public.company_workspace cw
left join public.company_workspace_quality_label cwql
  on cwql.company_workspace_id = cw.company_workspace_id;
