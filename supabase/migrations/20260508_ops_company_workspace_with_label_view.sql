-- 리뷰 모드 (humanLabelMissingFirst / llmQualityLabelFirst) 의 버킷 조건이
-- Node 측에서 cwql 행 IDs 를 미리 조회한 뒤 .in() / .not().in() 으로 PostgREST 에
-- 전달하면서 URL 길이가 ~16KB Cloudflare 한도를 초과해 500 으로 깨지는 문제를
-- 해결하기 위한 결합 뷰. cwql 의 라벨 두 컬럼을 cw 와 함께 노출하여 PostgREST
-- 에서 직접 필터할 수 있게 한다 (URL 에 UUID 리스트가 박히지 않음).
create or replace view public.ops_company_workspace_with_label as
select
  cw.*,
  cwql.llm_quality_label as cwql_llm_quality_label,
  cwql.human_quality_label as cwql_human_quality_label
from public.company_workspace cw
left join public.company_workspace_quality_label cwql
  on cwql.company_workspace_id = cw.company_workspace_id;

grant select on public.ops_company_workspace_with_label to authenticated, service_role;
