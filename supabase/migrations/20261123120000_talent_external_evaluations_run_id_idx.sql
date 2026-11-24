-- external_recommendation_runs 행을 지울 때 ON DELETE SET NULL이 run_id로
-- talent_external_evaluations를 찾는다. 인덱스가 없으면 실행 기록 하나마다 테이블 전체를 읽는다.
-- 운영 DB에는 2026-11-23에 create index concurrently로 먼저 만들었다.
create index if not exists talent_external_evaluations_run_id_idx
  on public.talent_external_evaluations (run_id);
