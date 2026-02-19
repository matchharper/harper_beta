# Hybrid Search Core Verification Report

## 1. 개요
본 보고서는 `new_plan.md`에서 제안된 하이브리드 검색(Semantic + Keyword) 아키텍처를 기존의 정규화된 데이터베이스 스키마에 이식하고 그 타당성을 검증한 결과를 담고 있습니다.

## 2. 검증 내용 및 결과

### A. 인프라 및 스키마 통합 (Success)
- **pgvector 도입:** `postgres:16`에서 `pgvector/pgvector:pg16` 이미지로 교체하여 벡터 연산 기능을 확보하였습니다.
- **기존 스키마 보존:** `candid` 테이블에 `embedding` 컬럼을 추가하는 방식으로, 기존의 정규화된 구조를 파괴하지 않고 기능을 확장하였습니다.
- **HNSW 인덱스:** 1536차원 벡터에 대해 HNSW 인덱스를 생성하였으며, 실행 계획 분석 결과 정상적으로 인덱스 스캔(Index Scan)이 이루어짐을 확인했습니다.

### B. 데이터 집계 전략 (Success)
- **Profile Text 생성:** `experience_user`, `edu_user`, `publications` 등 분산된 데이터를 하나의 맥락 있는 텍스트로 합치는 SQL 전략을 수립하였습니다. (참조: `scripts/aggregate_profile_text.sql`)
- 이 전략을 통해 인물에 대한 통합적인 의미 정보를 임베딩 모델에 전달할 수 있습니다.

### C. 하이브리드 검색 성능 (Success)
- **실행 속도:** Mockup 데이터 16,000건 기준, 하이브리드 쿼리 실행 시간이 **약 24ms ~ 50ms** 수준으로 측정되었습니다. (목표치 1s 미만 달성)
- **스코어링 로직:** 벡터 유사도(60%)와 키워드 랭크(40%)를 결합한 하이브리드 스코어링이 SQL 레벨에서 안정적으로 작동합니다.

## 3. 기술적 타당성 결론
`new_plan.md`의 핵심 아이디어인 하이브리드 검색은 현재의 DB 구조 위에서도 충분히 구현 가능하며, 성능 면에서 매우 우수합니다. 따라서 다음 단계인 **"실제 OpenAI API 연동 및 전체 데이터 임베딩"** 단계로 진행하는 것을 강력히 권장합니다.

## 4. 향후 작업 로드맵 (Full Implementation Phase)
1.  **Data Sync Worker 구축:** 데이터 변경 시 자동으로 `profile_text`를 갱신하고 임베딩을 요청하는 백그라운드 워커 구현.
2.  **API 개발:** FastAPI를 사용하여 검색 엔드포인트 구현.
3.  **프롬프트 연동:** 기존에 최적화한 `prompt1`, `prompt2`와 하이브리드 쿼리 템플릿을 통합.
