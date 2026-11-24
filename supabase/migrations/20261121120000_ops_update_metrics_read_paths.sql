-- 업데이트 지표가 읽는 범위를 줄인다(20261121090000의 후속). 집계 결과는 바뀌지 않는다.
--
-- 2026-11-21 운영 측정: 업데이트 지표는 추천이 채용 글인지 보려고 추천마다 company_roles 행을 열어 1.3만 번
-- 무작위로 읽었다. 채용 글 Role은 19개다. 가입자별 LLM 비용·시간은 기간 안의 llm_logs 11.6만 페이지(약 1GB)를
-- 다 읽었는데, 가입자 행은 그중 4만 페이지에 있다.
--
-- 운영 적용: 아래 인덱스를 먼저 CREATE INDEX CONCURRENTLY로 만들고 indisvalid를 확인한다. 식 인덱스라 planner가
-- 선택도를 알도록 llm_logs를 ANALYZE한 뒤 이 migration을 적용한다. 제약이 아니라 읽기 경로다.
-- 운영은 2026-11-21에 이 순서로 적용했다(이력 version 20261121115150 ops_update_metrics_read_paths). 다시 적용하지 않는다.
-- 두 인덱스를 읽는 쿼리는 웹 코드(src/lib/ops/updateMetrics.sql.ts)에 있어 배포 뒤에 쓰인다.

-- 채용 글 Role(업데이트 지표의 hiring_post_roles CTE와 같은 조건).
CREATE INDEX IF NOT EXISTS company_roles_hiring_post_idx
  ON public.company_roles (role_id)
  WHERE jsonb_typeof(information -> 'hiringPost') = 'object';

-- 업데이트 지표의 가입자별 LLM 비용·시간. 키는 그 쿼리가 쓰는 사용자 키 식 그대로다.
CREATE INDEX IF NOT EXISTS llm_logs_user_key_created_idx
  ON public.llm_logs ((coalesce(user_id::text, meta ->> 'userId')), created_at)
  WHERE coalesce(user_id::text, meta ->> 'userId') IS NOT NULL;
