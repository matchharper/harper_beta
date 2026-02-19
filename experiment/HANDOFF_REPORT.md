# [최종 보고 및 인수인계] 후보자 검색 시스템 최적화 및 하이브리드 검색 도입 연구

## 1. 프로젝트 개요 및 배경
본 프로젝트는 `harper_beta` 시스템의 핵심 기능인 후보자 검색의 **성능(Latency)**과 **품질(Relevance)**을 개선하기 위해 진행되었습니다. 모든 실험은 실제 서비스 환경에 영향을 주지 않도록 **로컬 독립 환경(Docker/PostgreSQL 16)**에서 수행되었으며, 검증된 결과는 향후 시스템 업그레이드를 위한 기술적 제안으로 제공됩니다.

## 2. 주요 연구 및 실험 결과

### A. SQL 쿼리 실행 계획 최적화
*   **핵심 발견:** 대규모 데이터셋(약 14만 건) 검색 시, 다중 키워드 `ILIKE` 연산이 인덱스를 타지 못하고 Full Table Scan을 유발함을 확인했습니다.
*   **개선 방안:**
    *   `pg_trgm` 기반의 **GIN Trigram 인덱스** 도입 (location, company_db.name, experience_user.role 대상).
    *   `JOIN` 후 `DISTINCT`를 사용하는 기존 방식에서 `EXISTS` 서브쿼리를 이용한 **Semi-Join** 방식으로 리팩토링.
*   **실험 수치 (로컬):** 
    *   기존 SQL: 약 342ms → 최적화 SQL: 약 249ms (**약 27% 성능 향상**).
    *   운영 데이터 적용 시 인덱스 스캔 효율이 극대화될 것으로 기대됩니다.

### B. LLM SQL 생성 파이프라인 고도화
*   **개선 내용:** LLM이 최적화된 SQL 패턴을 생성하도록 `src/lib/prompt.ts` 및 관련 프롬프트 파일(prompt1, prompt2)을 재설계했습니다.
*   **주요 변경점:** `ILIKE ANY (ARRAY[...])` 및 `EXISTS` 구문 사용을 강제하여, 복잡한 검색 조건에서도 인덱스 활용도를 100% 보장하도록 가이드라인을 설정했습니다.
*   **검증 결과:** 8종의 대표 검색 시나리오(경력직, 특정 지역, 특정 기업 출신 등)에서 의도한 최적화 쿼리가 생성됨을 확인했습니다.

### C. 하이브리드 검색(Semantic + Keyword) 아키텍처 설계 (제안)
*   **기술 스택:** `pgvector` 확장 모듈 + `text-embedding-3-small` (1536 dims).
*   **구현 모델:** 
    *   **Vector Search:** 후보자의 주요 경력, 기술 스택, 자기소개를 결합한 `profile_text`를 벡터화하여 의미론적 유사도 측정.
    *   **Keyword Search:** FTS(Full Text Search) 또는 GIN 인덱스를 이용한 정확한 키워드 매칭.
    *   **Scoring:** `(Vector_Score * 0.6) + (Keyword_Score * 0.4)` 가중치 결합 알고리즘 적용.
*   **성능 예상:** 로컬 소규모 데이터(1.6만 건) 기반 프로토타입 테스트 결과, HNSW 인덱스(`m=16`, `ef_construction=64`)를 적용할 경우 약 11만 건의 운영 데이터셋에서도 **1초 미만**의 응답 속도 확보가 가능할 것으로 **예상**됩니다. 다만, 실제 운영 환경에서의 인덱스 빌드 시간 및 메모리 점유율에 대한 추가 검증이 필요합니다.

## 3. 발견된 주요 기술적 사실 (Technical Facts)
1.  **인덱스 효율성:** PostgreSQL 16 환경에서 GIN 인덱스는 `ILIKE` 연산자가 `%keyword%` 형태일 때도 `pg_trgm`의 도움으로 매우 빠른 검색 속도를 제공합니다.
2.  **Semi-Join의 우월성:** 1:N 관계(후보자:경력) 검색에서 `EXISTS`는 데이터 뻥튀기(Fan-out)를 원천 차단하여 메모리 사용량을 절감합니다.
3.  **의미론적 보완 가능성:** 키워드 검색에서 누락되기 쉬운 "비슷한 직무(예: Java Developer ↔ Backend Engineer)" 문제를 벡터 검색이 보완할 수 있음을 실험적으로 확인하였으며, 이는 검색 품질 향상으로 이어질 것으로 기대됩니다.

## 4. 주요 리소스 가이드 (experiment/ 디렉토리 구조)
본 프로젝트의 실험 과정과 결과물은 아래와 같이 정리되어 있습니다.

### A. 실험 아카이브 (`archive/`)
*   `01_query_optimization/`: GIN 인덱스 도입 전후의 실행 계획 분석 및 벤치마크 결과.
*   `02_prompt_optimization/`: 효율적인 SQL 생성을 위한 LLM 프롬프트 엔지니어링 기록.
*   `03_hybrid_architecture/`: `profile_text` 구성 로직 및 하이브리드 검색 가중치 산정 근거.
*   `04_harper_integration/`: 실제 `harper_beta` 소스 코드와의 결합 시나리오 분석.

### B. 데이터베이스 자원 (`database/`)
*   `schema.sql`: 실험에 사용된 로컬 DB의 기본 스키마 정의.
*   `schema_update.sql`: GIN 인덱스 생성 및 하이브리드 검색용 컬럼 추가 구문.
*   `hybrid_search_setup.sql`: `pgvector` 활성화 및 벡터 검색 관련 함수 설정.
*   `optimized_query.sql`: 최적화된 SQL 패턴(EXISTS, ILIKE ANY)의 대표 예시.

### C. 실행 스크립트 (`scripts/`)
*   `benchmark.py`: 최적화 전/후 SQL의 성능을 정량적으로 비교 측정하는 도구.
*   `update_embeddings.py`: OpenAI API를 호출하여 후보자 프로필을 벡터화(Embedding)하는 배치 스크립트.
*   `aggregate_profile_text_v2.sql`: 여러 테이블에 흩어진 경력 정보를 하나의 검색용 텍스트로 병합하는 로직.
*   `verify_hybrid_search.py`: 하이브리드 검색 알고리즘의 작동 여부를 검증하는 테스트 코드.

### D. 기타 자료
*   `logs/`: 실험 중 기록된 주요 SQL 실행 계획(Execution Plan) 결과물.
*   `HANDOFF_REPORT.md`: 본 최종 보고서.

## 5. 권장 적용 절차 (Cautionary Recommendations)
> **주의:** 본 실험 결과는 로컬 환경의 통계 정보를 바탕으로 합니다. 실제 운영 환경 적용 시 아래 절차를 준수할 것을 권장합니다.

1.  **단계적 인덱스 생성:** 운영 DB 부하 최소화를 위해 `CREATE INDEX CONCURRENTLY` 옵션을 반드시 사용하십시오.
2.  **통계 갱신:** 인덱스 생성 후 `ANALYZE` 명령을 통해 PostgreSQL Optimizer가 최신 통계 정보를 반영하도록 해야 합니다.
3.  **임베딩 파이프라인:** 약 14만 건의 기존 데이터를 임베딩하는 데 발생하는 API 비용 및 시간을 사전에 산정하십시오. (배치 처리 스크립트: `experiment/scripts/update_embeddings.py`   참고)                         
4.  **HNSW 모니터링:** 벡터 인덱스 빌드 중에는 CPU 사용량이 급증할 수 있으므로 트래픽이 낮은 시간대에 작업을 수행하십시오.