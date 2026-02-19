# 상세 진행 계획 (Detailed Action Plan)

이 문서는 `overview.md`의 목표를 달성하기 위한 구체적인 실행 단계와 명령어를 포함합니다.

## 1단계: 로컬 실험 환경 구축 (Environment Setup - Docker Compose)

Docker Compose를 사용하여 PostgreSQL 환경을 구축하고, 컨테이너 실행 시 자동으로 데이터를 적재하도록 설정합니다. 이는 재현성을 높이고 설정 오류를 최소화합니다.

### 1.1. 구성 파일 작성
*   **`docker-compose.yml`**: PostgreSQL 16 컨테이너 정의, 포트 포워딩(5432), 데이터 볼륨 마운트.
*   **`scripts/load_data.sql`**: `COPY` 명령을 사용하여 CSV 데이터를 테이블에 고속으로 적재하는 SQL 스크립트.

### 1.2. 실행 및 초기화
```bash
# 컨테이너 실행 (백그라운드)
docker compose up -d

# 초기화 완료 대기 및 로그 확인 (데이터 적재 과정 모니터링)
# 로그에서 "database system is ready to accept connections" 및 COPY 완료 메시지 확인 필요
docker compose logs -f
```

### 1.3. Python 환경 설정 (벤치마킹용)
벤치마크 및 테스트 스크립트 실행을 위한 Python 환경을 준비합니다.
```bash
pip install psycopg2-binary pandas sqlalchemy
```

---

## 2단계: 기준 성능 측정 (Baseline Measurement)

현재 쿼리의 성능을 정확히 측정하고 실행 계획(Query Plan)을 분석합니다.

### 2.1. 벤치마킹 스크립트 작성 (`scripts/benchmark.py`)
단순 실행 시간뿐만 아니라 `EXPLAIN (ANALYZE, BUFFERS)` 결과를 파일로 저장하는 스크립트를 작성합니다.
*   **기능:** `sample_query.sql` 실행, 소요 시간 기록, 실행 계획을 `logs/` 디렉토리에 저장.

### 2.2. 측정 실행
```bash
mkdir -p logs
python3 scripts/benchmark.py
```

---

## 3단계: 쿼리 최적화 및 실험 (Optimization Iterations)

분석된 Query Plan을 바탕으로 최적화를 진행합니다. 각 변경 사항마다 벤치마크를 수행합니다.

### 3.1. 인덱스 점검 및 수정
`schema.sql`에 정의된 GIN 인덱스가 실제로 사용되는지 확인합니다.
*   **실험 1:** `pg_trgm` 확장 기능 활성화 확인 및 인덱스 재생성.
    ```sql
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    -- 필요 시 인덱스 재생성 쿼리 실행
    ```

### 3.2. 쿼리 리팩토링 (Query Refactoring)
`sample_query.sql`의 구조적 문제를 해결합니다.

*   **실험 2: OR 조건 제거 (Union 활용)**
    *   `location` 필터와 `edu_user` 서브쿼리의 `OR` 연산이 인덱스 스캔을 방해하는지 확인하고 `UNION`으로 분리하여 테스트합니다.
*   **실험 3: JOIN 최적화**
    *   `EXISTS` 절을 `JOIN`으로 변경하거나, 반대로 `JOIN`을 `EXISTS`로 변경하여 실행 계획 비교.
*   **실험 4: Full Text Search (FTS) 최적화**
    *   `ts_rank` 정렬이 성능에 미치는 영향 분석 및 대안 모색.

### 3.3. 최종 검증
최적화된 쿼리를 `optimized_query.sql`로 저장하고 목표 시간(1분 미만) 달성 여부를 확인합니다.

```bash
# 최적화된 쿼리로 벤치마크 재실행
python3 scripts/benchmark.py --query optimized_query.sql
```