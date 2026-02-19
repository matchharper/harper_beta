-- 1. 문자열 검색 최적화 도구 설치
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. 위치(location) 컬럼에 대한 검색 사전(Index) 생성
-- 데이터가 많을 경우 서비스 중단 없이 생성하기 위해 CONCURRENTLY 옵션 사용을 권장합니다.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candid_location_trgm
ON public.candid USING gin (location public.gin_trgm_ops);

-- 3. (이미 있다면 건너뛰기) 회사명 및 직무 색인 확인
-- 기존 schema.sql에 포함되어 있으나, 혹시 없다면 생성합니다.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_company_db_name_trgm
ON public.company_db USING gin (name public.gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exp_user_role_trgm
ON public.experience_user USING gin (role public.gin_trgm_ops);

-- 1. 주요 검색 컬럼의 통계 수집 정밀도를 10배로 상향 (기본 100 -> 1000)
ALTER TABLE public.candid ALTER COLUMN location SET STATISTICS 1000;
ALTER TABLE public.company_db ALTER COLUMN name SET STATISTICS 1000;
ALTER TABLE public.experience_user ALTER COLUMN role SET STATISTICS 1000;

-- 2. 변경된 설정값을 바탕으로 즉시 데이터 재분석 실행
-- 이 작업은 테이블을 실제로 읽어 통계를 내는 작업으로, 몇 초~몇 분 정도 소요될 수 있습니다.
ANALYZE public.candid;
ANALYZE public.company_db;
ANALYZE public.experience_user;