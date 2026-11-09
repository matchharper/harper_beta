# 경력 기반 시장 연봉 추정 확인 — 2026-10-15

사용자 요청에 따라 `targetSalaryKrw`를 희망 보상이 아닌 **경력·역량의 시장 연봉 추정값**으로 변경했다. 공고 연봉 추정 프롬프트의 실제 책임 수준, 희소 전문성, 채용시장 판단 기준을 후보자 검색 프롬프트에 적용했다. 기존 v4의 “보상 무관이면 null” 기준은 보존하고 새 v5 gold를 호출 전에 고정했다.

| 사례 | 검색 시장 | 새 시장 연봉 추정값 (연간 기본급, KRW) | 확인 |
| --- | --- | ---: | --- |
| user-1 | 한국 | 100,000,000 | 경력 근거가 있는 양수 반환 |
| user-2 | 일본 | 72,000,000 | 약 853만 JPY에 해당하는 원화 값; JPY 숫자 그대로 반환하지 않음 |
| user-3 | 호주 | 131,000,000 | 보상 무관이어도 null 대신 경력 기반 추정; 약 14만 AUD 상당 |

3/3 계약 확인. user-3은 데이터 엔지니어링·프로덕션 파이프라인·고객 업무 수행 경력이 있어 추정 근거가 존재한다. 원문 경력은 private fixture에만 보존했다. 금액은 모델 추정이며 실제 연봉·오퍼 정확도를 검증한 결과는 아니다. 3개 기존 사례를 재사용한 개발 확인이고 독립 holdout이 아니다.

Production `getSearchPlan` + `v2CompletionRequest` + Responses adapter 재사용. `gpt-6-luna`, low, store=false, 최대 8000 tokens, 90초 timeout, 재시도 없음. 총 3회 호출, 기록된 추정 비용 **$0.00298748**. SQL/후속 적합도/추천/발송은 실행하지 않았다. DB, Search Default, Brief/Memory, 공고 연봉 쓰기 없음.

입력: manifest-v5-users-market-value.json의 frozen v4 hash. 원문 request/response/plan/receipt와 runtime hashes: `runs/users-2026-10-15T02-52-02-897Z/`. 현재 변경은 로컬이며 미배포. 기존 저장 plan의 salary-v1 버전은 다시 계획하도록 무효화했고, reuse 시 새 추정값과 그 값으로 컴파일된 SQL을 함께 저장한다. 관련 12개 테스트와 타입 검사 통과; 추가된 구버전 재계산 사례도 통과했다.
