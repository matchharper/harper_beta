# External 추천 V2 — 구현 및 적용 안내

## 2026-10-16 공통 HNSW 검색 (로컬 코드, 미배포)

`recommend_job_postings` 즉시 검색, `/ops/debugging/external-search`, opportunity worker V2의 양쪽 cohort와 추가 검색은 공통 `filterFirstSql.ts`를 사용한다. 정기/일일 V2도 같은 엔진을 사용한다. 아래 이전 배포·실험 기록의 제목 사전, 국가별 할당, RRF, 웹 200개 설명은 이 로컬 변경 이전의 동작이다.

- 가용성·고용 형태·국가·원격·게시 기간·차단 회사·기추천·testOnly를 적용하고 `company_roles.title_embedding`에서 HNSW 후보 최대 3,000개를 찾는다. 게시 기간이 null이면 기간 제한을 추가하지 않는다. 명시된 `maxAgeDays`만 필터에 적용한다.
- 국가 코드는 정확히 비교하고 국가별 remoteOnly를 유지한다. 국가별 ANN 결과를 거리순으로 합쳐 전체 N개를 선택하며 후보 수집 단계에는 국가 weight를 적용하지 않는다. 즉시 검색·Worker control의 planner도 countries만 생성하며, 새 내부 검색 API는 locations 입력을 받지 않는다. 도시 문자열로 국가를 추측하지 않는다.
- 후보 N개 안에서 가중 FTS와 연봉 만족도를 계산한다. 점수는 `FTS/(1+FTS) + 0.35*(2*salaryUtility-1) + entryPreferenceScore + recencyScore`이며 동점은 제목 거리·게시일·ID로 정리한다. 급여 미상은 0.5로 중립이다. 신입·경력 선호와 게시일 가중치는 기존 조회의 점수를 재사용하며, ANN 후보 N개를 확정한 뒤에만 계산한다. 제목 embedding이 없거나 현재 제목과 불일치하는 공고는 제외한다.
- 최종 점수를 계산한 후보에서 같은 `company_workspace_id`의 상위 3개만 남긴 뒤 국가 weight 비율로 최종 500/200개를 배분한다. 국가 안에서는 기존 점수순으로 선택하고 최종 표시도 같은 점수순이다. 예를 들어 KR 0.9/US 0.1이면 500개 중 450/50개가 목표이며, KR 후보가 300개뿐이면 US에서 200개를 채운다. 여러 국가의 후보가 부족해도 남은 국가에 가중치 비례로 재배분하고, 소수점은 최대 나머지 방식(동점은 입력 국가 순서)으로 처리한다. 추가 ANN 검색이나 DB 왕복은 없다. 동점은 제목 거리, 게시일(최신 우선·null 마지막), role ID 순으로 정리한다. 회사 이름이 같아도 workspace ID가 다르면 별도로 취급한다. 회사 다양성이 부족하면 결과가 한도보다 적을 수 있으며, 후보를 추가 검색하거나 회사별 한도를 풀지 않는다.
- Ops와 Worker는 최종 500개, `recommend_job_postings` 즉시 검색은 최종 200개를 확정한 뒤 상세 공고와 회사 정보를 붙인다. 후보 HNSW 한도 3,000개는 동일하다. Worker 추가 검색은 같은 후보/정렬 방법으로 기존 추가 검색 한도 50개를 반환한다. 이후 fit/scoring/전달 방식은 유지한다.
- Ops는 후보 N과 급여 가중치를 조절할 수 있고 기본값은 추천과 동일하다. HNSW/하드 필터 시간과 FTS/급여/최종 조회 시간을 별도로 표시한다. `/job-search-sql`의 원래 탭은 유지한다.
- 운영에 이미 있는 `search_external_roles_filter_first` RPC와 halfvec HNSW 인덱스를 사용한다. RPC는 service_role 전용이며 planner/HNSW 설정은 호출 범위에 한정한다. SQL 제한은 50초다. 근사 검색의 scan budget과 좁은 필터 때문에 결과가 500개보다 적을 수 있다. 임베딩 backfill은 재시작하지 않았다.
- Worker control은 새 내부 `/api/internal/external-recommendations/retrieve`를 호출한다. 향후 배포 시 **웹을 먼저 배포하고 endpoint 확인 후 Worker를 배포**해야 한다. 이번 작업에서는 배포·프로세스 재시작을 하지 않는다.

국가 배분 추가 검증(로컬): 5개 국가·연속 부족·빈 후보·소수점 배분·200/500/50개 한도 등 12개 배분 사례와 회사별 제한 통합 SQL을 확인했다. 합성 후보 3,000개/5개 국가의 최종 선택 단계만 PGlite에서 3회 비교했을 때 기존 평균 0.96ms, 국가 배분 평균 7.03ms로 약 6.06ms 증가했다. 운영 Supabase 전체 검색 지연 측정은 아니다.

최종 국가 전용 코드의 실제 DB 확인: KR 6.82초, US 5.72초, KR + US(remoteOnly) 6.05초에 각각 상세 공고 500개를 반환했다. 임베딩 생성·DB 왕복을 포함하며 query planner와 후속 fit 평가는 제외한다. DB/OS 캐시는 비우지 않았다. 잘못 포함했던 서울 문자열 조건의 측정은 국가 전용 검색 성능 결과에서 제외한다.

추적 measurement version은 `filter-first-hnsw-2026-10-16-v1`이다. 결과 캐시로 검색을 대체하지 않으며 기존 저장 제목 vector는 재사용할 수 있다. 20초 절대 보장은 없고 Medium 전환 직후 측정에서도 첫 두 회는 20초를 넘었다. 운영 동시 부하와 cold cache는 별도 조건이다.

## 2026-10-16 크롤러 직접 저장 전환 (코드 미배포)

DB 적용 완료(2026-10-16): 운영 migration `20261016091449`
(`crawler_owned_role_title_embeddings`)로 제목 사전 등록·활성 개수 유지 트리거 2개를
제거했다. 해당 트리거가 0개이며 새 제목과 일치하는 벡터를 보존하는 함수가 적용된
것을 확인했다. 진행 중인 작업은 강제 중단하지 않았다. 웹·크롤러 코드는 미배포다.

새 코드에서 제목 임베딩의 저장·검색 원본은 `company_roles.title_embedding`과
`title_embedding_text`다. `data_sc`가 공고를 신규 저장하거나 제목을 포함해 수정할 때
`text-embedding-3-small` 1536차원 벡터를 먼저 생성하고 공고와 함께 저장한다.
상태·위치만 갱신하는 경로는 기존 벡터를 보존하며 과거 누락 행을 일괄 보충하지 않는다.
별도 제목 사전에 등록하는 두 트리거는 `crawler_owned_role_title_embeddings` DB 변경으로
제거하며, 제목 변경 시 함께 공급한 새 벡터는 보존한다.

초기 전환안(상단 공통 HNSW 변경 이전)은 공고 벡터에서 최대 5,000개 역할을 회수한 뒤 같은 제목을
묶는다. 이전 5,000개 고유 제목 한도와는 다르므로 같은 제목의 공고가 많은 경우
제목 다양성이 줄 수 있다. 임베딩이 없는 공고의 FTS 경로와 가용성 검증은 유지한다.
정기 임베딩 cron은 제거하고 수동 복구 API만 공고 행에 직접 저장하도록 바꿨다.
아래 제목 사전·시간당/5분 주기 설명은 전환 이전 운영 기록이다. DB 반영만으로
웹·수집기 코드가 배포되지는 않으며, 기존 웹 검색은 배포 전까지 별도 사전을 읽는다.


문서 기준: 2026-10-16. 기존 DB 구조와 제목 embedding에 이어 beta `d30ff764`와 Worker `d007a57`를 운영 반영했다. 이번 배포에서 제목 embedding을 다시 채우거나 평가를 다시 실행하지 않았다. 실제 검증 결과·한계는 평가 registry에 기록한다.

## 실험과 모델

후보자 UUID와 고정 experiment salt의 SHA-256 첫 byte로 control/V2를 50:50 배정한다. worker와 web이 같은 함수를 구현하며 실행마다 재추첨하지 않는다. 기존 Behavior Context 통합과는 독립적인 external 검색 실험이다. Control/V2 모두 초기 검색에 연봉 만족도를 반영하고 누락 급여를 같은 추정기로 채운다. 기존 cohort 배정과 각 경로의 fit/scoring/rerank는 유지한다.

`EXTERNAL_RECOMMENDATION_EXPERIMENT=off`를 web과 worker에 함께 지정하면 기존 추천 경로로 돌아가고 일일 추천은 시작하지 않는다. 기본은 실험 활성화다. `EXTERNAL_FIT_V2_PROVIDER=openai|jev`로 scorer를 바꾼다. Worker는 자신의 설정을 공유 endpoint에 전달할 수 있다. 웹 기본값은 openai이며 작업이 시작될 때 일일 작업의 provider를 고정한다. 제공자별 캐시는 분리하고 자동 fallback하지 않는다.

| 단계 | V2 모델/한도 |
|---|---|
| 검색 계획 및 기본 검색 갱신 | gpt-6-luna, low |
| 제목 임베딩 | text-embedding-3-small, 1536차원 |
| 평가 | OpenAI `/v1/decisions`의 gpt-6-luna 또는 OpenRouter typesafe/jev-1.13, 10역할/호출, 최대 동시6 |
| 회사·역할 중립 요약 | gpt-6-luna, low, 10역할/호출 |
| 최종 재정렬과 추천 메모 | gpt-6-luna, low, 상위20개 중 요청한 수 선택 |

## 검색과 기본 SQL

기존 Search Plan과 SQL compiler를 확장했다. LLM은 `reuse`/`explore`/`replace`, Search Plan, 원화 연간 기본급 `targetSalaryKrw`을 반환한다. 임의 SQL을 직접 실행하지 않는다. 저장된 기본값의 plan과 SQL template은 다음 planner 입력에 함께 들어간다. 실제 실행 SQL은 현재의 차단·마감·기추천 조건과 실행 한도에 맞춰 다시 컴파일한다. 제목 vector도 기본값에 저장해 재사용하며 거대한 vector를 planner에 다시 넣지 않는다. 기본값은 revision을 비교하여 동시 검색이 덮어쓰지 않도록 저장한다.

직접 요청은 일회성 탐색일 수 있으므로 자동으로 기본 검색이 되지 않는다. 일일 검색은 Profile/전체 Brief/Behavior version이 같은 기본값이 있으면 planner를 생략한다. 기준이 달라졌으면 갱신 판단을 다시 받는다.

정기 worker는 기존 worker planner의 탐색 가설을 유지한다. Profile + 전체 Brief + 같은 Behavior version에 최근 검색 최대4건의 목적·범위·추천 개수와 이번 연락 목적을 더해, 같은 방향을 유지할지 근거 있는 인접 역할을 탐색할지 판단한다. 추천0개나 무응답을 거절로 해석하지 않고 명시적 조건을 가설로 덮어쓰지 않는다. 일회성 가설은 `explore`이며 기본 검색을 바꾸지 않는다. 기본 계획을 `reuse`하더라도 worker는 이번에 이 방향이 유용한 이유를 새로 작성한다. 별도 판단 모델 호출을 추가하는 대신 기존 공유 planner 호출에서 함께 출력한다.

이번 판단은 `current_search_purpose`로 rerank와 기존 최종 안내 작성기에 전달된다. 안내 작성기는 유용할 때 인접 방향을 살펴본 이유를 자연스럽게 설명할 수 있으나, 사용자가 선호를 바꿨다고 단정하지 않는다. 실제 실행 계획과 판단·추천 개수가 기존 discovery run에 남아 다음 검색 이력이 된다. 실행별 설명은 재사용한 기본 계획의 설명을 덮어쓰지 않는다. 웹 `recommend_job_postings`의 즉시/비동기 실행과 일일 추천에는 이 자율 탐색 prompt·최근 worker 검색 이력을 넣지 않는다. 같은 Behavior Context가 있더라도 웹은 현재 사용자의 검색 요청을 우선한다.

검색 계획은 `countries: [{countryCode, weight, remoteOnly}]`를 출력한다. 표준 ISO 국가코드로 company_roles.country_code를 정확히 비교한다(KR은 한국; KO 아님). 국가 미지정/null 공고는 제외되고 remote가 국가 필터를 우회하지 않는다. 글로벌 remoteOnly/includeRemote와 국가별 remoteOnly도 함께 적용한다. 예를 들어 KR0.8/US0.2이면 200개에서160/40개, 500개에서400/100개를 먼저 할당한다. 소수 배정은 최대 나머지 방식으로 맞추며 부족하면 목록 안의 다른 국가에서만 채운다. 국가 비율은 scoring 후보 목록에만 적용하며 최종20개/추천5개의 국가 비율을 강제하지 않는다. ANN 이웃은 한 번 공유하고 국가별 pool과 배분은 같은 SQL 한 번에서 처리한다. 근사 제목 pool 내 국가별 역할이 부족하면 비율을 보장하지 않는다.

새 검색 version은 `external-search-v2-salary-v1`이다. 연봉 목표/새 version이 없는 옛 default는 planner에 문맥으로 주되 즉시 재사용하지 않고 replace/explore로 새 계획을 받는다. 같은 제목 vector는 계속 재사용한다. 새 fit version은 `external-fit-questions-v6-strong-constraints`로, 이전 혼합 단위 및 더 넓은 충돌 기준의 점수는 새 평가와 섞지 않는다. 후보자별 A/B 배정 salt는 바꾸지 않는다.

검색 직무는 1~5개로 정리하며, 후보자가 선호하는 검색 국가의 언어와 영어 제목을 함께 생성한다(번역 포함 최대24개 문자열). 예를 들어 한국 AI 직무는 `AI Engineer, AI 엔지니어`를 포함한다. 모든 제목을 쉼표와 공백으로 합친 텍스트 하나로 임베딩 한 개를 생성하고, 활성 제목 사전에서 ANN 검색을 한 번 수행해 가까운 제목 최대5,000개를 가져온다. 기존 최대5회×1,000개의 검색 범위를 한 번에 확보하기 위한 값이다. 공고의 동일 제목끼리 사전 embedding을 공유하는 구조는 유지한다. 가용성·국가 등의 조건을 만족하는 역할 중 국가별 의미 유사도 상위 web1200/worker3000개(경계의 동일 거리 포함) 안에서 FTS를 계산하고 RRF(k=60, 제목80%/FTS20%)로 정렬한다. 아직 embedding이 없는 제목의 역할은 별도 FTS 경로로 포함한다. 전체 공고를 매번 FTS 정렬하는 방식은 실제 전체 데이터에서30초를 초과하여 사용하지 않는다. 보정되지 않은 cosine 절대 cutoff로 후보를 없애지 않는다. 고용 형태·국가/근무 방식·명시한 기간 등의 hard filter와 가용성·차단·기추천·testOnly 경계는 유지한다. Worker는 최대500, web/daily는 최대200개를 평가 대상으로 삼는다.

원본은1536차원 full precision으로 저장하고 ANN index만 half precision IVFFlat을 사용한다. 현재 활성 제목89,292개에128 lists, 조회12 probes와 최대48 probes의 iterative scan을 사용한다. 원본 전체316,958개 제목의 embedding은 유지한다. 새 제목/이름 변경은 사전에 추가되어 같은 제목의 vector를 재사용한다. 역할 생성·이름/상태/만료 여부 변경·삭제 trigger가 활성 제목 수를 갱신하며, 검색 시 실제 역할의 가용성을 다시 검증한다. 만료 공고까지 포함한 전체 제목 인덱스는 제거했다. ANN은 근사 검색이므로 특히 좁은 지역의 검색 재현율은 별도 측정이 필요하다.

기존 `company_score`/`test_score`는 V2 SQL, 평가 입력, 보너스, rerank 어디에도 쓰지 않는다. 같은 이름의 다른 회사는 company workspace ID로 구분하여 회사 정보가 합쳐지지 않는다.

### 로컬 검색 개선 (2026-10-15, 미배포)

`recommend_job_postings`의 V2와 기존/full-JD 경로 모두 현지어 제목과 단일 결합 임베딩을 사용한다. 기존 저장 계획은 버전이 달라 다시 생성하며 이전의 여러 제목 벡터를 재사용하지 않는다.

동일한 제목 거리와 키워드 점수에는 같은 순위를 부여한다. UUID는 최종 표시 동점만 정리하며 관련도 차이를 만들지 않는다. 국가별 후보 한도 경계에서도 제목 거리가 같은 역할은 함께 남겨, ID 때문에 연봉 비교 전에 탈락하지 않게 한다. 국가 기준·배분, 제목/키워드 80:20, 연봉 가중치 0.35는 유지한다.

제목들을 하나씩 공고에 연결하는 대신, 근접 제목과 임베딩 대기 제목의 key를 각각 묶어 기존 제목 인덱스로 후보 ID를 조회한다. 제목 원문 일치와 모든 기존 가용성·차단·기추천·testOnly 조건은 다시 확인한다. 역할별 키워드·급여 계산과 최종 순위는 한 번 계산한 중간 결과를 재사용한다. 최종 목록을 확정한 뒤 상세 공고·회사 데이터를 붙인다. 추가 DB 왕복이나 새 DB 구조 없이 한 SQL 내부에서 처리한다. 광범위한 키워드 전체 조회를 강제하는 실험은 timeout이 늘어 채택하지 않았다.

Ops 사용자별 공고 검색만 같은 사용자·Profile/Brief/Behavior·저장 기본 계획일 때 완료된 검색 계획과 제목 vector를 최대 5분, 프로세스당 64건 재사용한다. 실패/중단된 계획과 공고 결과는 캐시하지 않는다. 사용자를 다시 선택해 실행해도 현재 차단·기추천·공고 가용성은 매번 DB에서 검사한다. 일반 Worker planner와 누락 Role 연봉의 동기 추정 단계는 그대로 유지한다.

### 오류 격리 보완 (2026-10-15, 로컬·미배포)

기존 추천 캐시의 단일 점수와 V2 평가 항목을 구분해 재정렬에 전달한다. 필수 평가값이 불완전한 역할은 이번 추천에서만 제외하며 0점이나 부적합으로 저장하지 않는다. 평가·요약의 일부 배치가 실패해도 정상 결과로 진행하고, 평가 캐시·요약 캐시 쓰기의 DB 시간 초과는 해당 배치만 제외한다. 권한 오류와 최종 추천 저장 실패는 계속 실패로 처리한다. 평가 또는 필요한 요약이 전부 실패하면 적합한 공고가 없는 것으로 기록하지 않는다. 일부 제외 내역은 실행 metrics와 로그로 확인한다.

검색은 가까운 제목 조회와 해당 제목의 공고 조회를 두 번의 제한된 읽기로 분리한다. 차단·마감·기추천·testOnly 등 실제 추천 자격은 공고 조회에서 다시 확인한다. 이 변경의 운영 부하 개선 여부는 배포 후 별도로 확인해야 한다. 재시도 후 최종 저장에 성공하면 완료된 실행의 이전 오류를 정리하고, 일일 실행이 최종 실패하면 종료 시각도 기록한다. 기존 운영 기록을 일괄 변경하거나 재실행하지 않는다.

## 연봉과 최초 후보 목록

Planner의 `targetSalaryKrw`는 희망 연봉이 아니라 실제 경력·책임·성과·전문성과 탐색 시장에서 추정한 시장 연봉이다. 공고 연봉 추정의 책임 수준·채용시장 판단 기준을 후보자에게 적용하며, 연차·직함만으로 금액을 정하지 않는다. 사용자가 보상 무관이라고 하거나 최저 연봉을 철회해도 경력 근거로 양수의 연간 기본급을 원화로 추정한다. 현재 보상은 참고 근거이고 희망 연봉을 그대로 복사하지 않는다. 전문 경력을 판단할 근거가 전혀 없을 때만 null이다. 명시적인 보상 조건은 후속 적합도 판단에서 별도로 존중한다. 추론을 Brief/Memory 사실로 저장하지 않고 연봉을 hard filter로 사용하지 않는다. 환율은 ECB 2026-10-14 snapshot이다.

급여 구간의 각 값에 `min(1,(급여/목표)^2)`를 적용한 평균으로 만족도를 계산한다. 목표 이상 급여는 효용이 포화된다. 제목/키워드 검색 순위에 `0.65 + 0.7 × 만족도`를 곱한다. 통화·기간·숫자 급여가 없어 비교할 수 없으면 만족도 0.5로 기존 순위를 유지한다. 하한만 있고 목표 미만이면 상한을 모르므로 중립으로 남긴다. 하한이 목표 이상이면 충분한 것으로 반영한다. 상한만 있고 목표 미만이면 부족한 것으로 낮추되, 목표 이상이면 하한을 모르므로 중립으로 남긴다. 월급은 연간으로 환산하고, 시급을 임의 근무시간으로 연봉화하지 않는다.

숫자/텍스트 급여가 모두 없고 summary가 있는 외부 역할 64,144개를 읽기 전용으로 캡처해 10개씩 같은 회사 인접 순서로 Decisions 추정한다. 공개 급여는 덮어쓰지 않는다. 최초 검색 결과에서 여전히 비어 있는 역할은 같은 함수로 채우며 다음 SQL 검색부터 활용된다. 실제 급여처럼 설명하는 오래된 reader를 먼저 배포한 뒤, 예측 min/max를 원화 `salary_*`에 저장하고 `salary_is_predicted=true`로 표시한다. `salary_range`는 만들지 않는다. 공고 내용 변경이나 실제 급여 수집은 오래된 추정값을 무효화한다.

예측값은 역할 카드, 원문 role projection, fit/중립 요약/rerank, Worker 최종 안내, Ops fit 테스트에서 제외한다. 원래 JD와 공개 급여 사실은 보존한다. 요청 실패/구조 오류는 해당 역할만 미상으로 남겨 검색을 계속한다. 마감·차단·기추천·testOnly 경계는 연봉 신호와 독립적으로 유지한다.

[실제 데이터 순위 평가](evaluation/external-role-salary-retrieval/reports/2026-10-15.md)와 [추정 평가/실행 계약](evaluation/company-role-salary-estimation/README.md)에 비용·추정 한계·raw private 경로를 기록한다. 배포 전에는 추정 결과를 private run으로 준비하고 실제 salary 쓰기는 하지 않는다.

## 점수와 저장

playground v4의 후보자 관심, 회사 관심, 상호 적합도, 직무 적합도, 필수조건, 근거 충분성 6축을 그대로 사용한다. 모든 수치 metric은 0..100으로 통일한다. Provider-native Score 0..4는 ×25, Predicate/Noul 0..1은 ×100 변환하며 raw 응답은 원래 단위로 보존한다. 조기 중단 없이 캐시가 없는 모든 pair를 처리한다. 평가 호출당30초 제한이며 일시적 네트워크 오류·408/429/5xx만 같은 제공자로 한 번 재시도한다. 원본 응답이 없는 시도의 과금은 미확인으로 기록한다. 미선정·낮은 점수도 저장하고, 불완전한 출력 역시 원본과 오류를 보관하되 유효한 fit으로 재사용하지 않는다.

기존 `talent_external_fit.meta`는 control용으로 보존한다. `evaluations`에 provider/model/prompt별 결과, 원본 답, 후보자 입력 hash, 회사·역할 근거 hash, 평가 시점을 저장한다. TTL은30일이며 입력이 바뀌면 즉시 무효다. 기존 cache 청소가 새 평가를 삭제하지 않도록 보호했다.

기회 품질 점수의 생성·저장·가중치는 제거했다. Fit 순위는 기존 4축 가중합과 강한 충돌 penalty만 사용한다. 중립 요약은 회사·역할 사실만 생성하고 기존 locale/source 비교·동시 작성 보호를 유지한다.

기회 품질 점수의 생성·저장·가중치는 제거했다. Fit 순위는 기존 4축 가중합과 강한 충돌 penalty만 사용한다. 중립 요약은 회사·역할 사실만 생성하고 기존 locale/source 비교·동시 작성 보호를 유지한다.

Worker 사전 상위100개에서 해당 언어 summary가 없는 것만10개씩 생성한다. Web은 상위 후보 중 누락 최대10개만 한 번에 생성한다. 이미 있는 summary는 그대로 쓰며 다른 언어를 지우지 않는다. 생성 중 원문이 바뀌었으면 저장하지 않는다. 실제 요약이 있는 상위20개가 rerank에 들어간다. 5개 metric과 종합점수는 전달 직전 소수점 첫째 자리까지 버림하고, rerank 기본 prompt에 각 값의 의미·0~100 단위·필수조건 경계·감점 여부를 설명한다. 저장 정밀도는 유지한다. 최종 선택에는 기존 언어 요약·간단한 회사/역할 정보·fit 점수만 전달하며 회사/JD 원문은 넣지 않는다. 원문은 scoring과 신규 요약 생성에만 사용한다. 신규 요약에는 필수 경력·업무 시간·출근 조건을 보존하도록 했지만 기존 요약은 재생성하지 않는다. Profile·Behavior 뒤에 전체 최신 Brief와 현재 요청을 두어 우선순위를 분명히 한다. 명시적으로 제외한 기회를 주의 문구만 붙여 추천하지 않도록 selection 계약을 명확히 했다.

Rerank 출력은 identifier와 `recommendationNote` 하나다. 최대2–3문장으로 이 사용자에게 중요한 구체적 이유·업무상 장점·유의미한 한계·판단을 바꿀 불확실성 중 필요한 내용을 쓴다. 당연한 위치/직무 일치, 뜬구름 잡는 칭찬, 무의미한 모든 unknown 나열은 피하도록 prompt에 명시했다. `tradeoffs`에 한 항목으로 저장하고, V2 UI는 이를 ‘주의 요소’가 아닌 일반 추천 메모로 표시한다. fitReasons/preferenceFit은 V2 모델 출력에서 제거했다.

## 하루 한 번 Career 방문 추천

온보딩이 끝나고 external 추천이 켜져 있으며 stopped가 아닌 후보자가 접속하면, 후보자×현지 날짜당 실행 하나를 만든다. 초기 onboarding 추천이 이미 실행 중이면 겹쳐 시작하지 않는다. 삭제·차단·마감·설정 변경은 최종 저장 직전에도 다시 확인한다.

- V2는 유효한 캐시의 mutualFit≥25, constraintPass>50, candidateInterest≥25와 해당 언어 요약을 갖춘 서로 다른 회사5개가 있으면 바로 rerank한다. control은 기존 scale의 score≥70과 요약이 있는5개를 사용한다. 이 수치는 초기 실험 기준이다.
- 충분하지 않거나 최종 모델이 캐시 후보를 모두 제외하면 해당 cohort의 웹 추천 흐름을 큐에서 한 번 실행한다. V2는 유효한 기본 SQL plan/vector가 있으면 planner를 생략한다.
- 최대5개를 추천하며 적합한 후보가 부족하면 수를 채우려고 만들지 않는다. 채팅·이메일을 생성하지 않고 추천만 저장한다.
- 작업 중 composer 위 작은 action색 ‘Searching…’ 상태를 보여준다. 완료된 일일/일반 추천은 해당 날짜에만 할 일 → Harper 제안의 첫 카드에 최대3개 회사 로고로 묶어 표시한다.
- Queue 실행은15분 lease, 최대3회 시도, DB idempotency로 보호한다. 발행 실패·중단된 실행은5분 dispatcher가 복구한다. 다음 날짜로 넘어간 실행은 새 추천을 추가하지 않고 skipped로 정리한다.

## 적용 순서 / 운영 작업

운영 DB 적용과 embedding backfill은 사용자가 승인한 데이터 작업이다. 배포 승인은 별개이며 이번 작업에서는 웹/worker를 배포하지 않았다. 새 UI 번역3키의 한·영6행은 번역 저장소에 동기화했다.

1. 기본 V2 migration, 제목 사전 migration, bulk 준비 migration이 적용되었다. 기존 vector extension은 `public`이다. 실제 migration history와 최종 커버리지는 검증 기록에 보존한다.
2. 대량 backfill의 정본은 worker `scripts/backfill_external_title_embeddings.py`다. 기본은 대상 수 미리 보기이고, `--apply --max-titles=N --batch-size=2048`로 실행한다. 같은 제목을 한 번만 생성하고 binary COPY로 사전에 저장한다. 재실행은 미완료 제목부터 진행한다. 회사 역할/추천/메시지는 수정하지 않는다.
3. `20261014024436_external_live_title_index.sql`까지 적용한 뒤 worker `scripts/build_external_title_index.py --live --apply`로 기존 활성 제목 수를 짧은 transaction으로 초기화하고 partial index를 CONCURRENTLY 만든다. 전용 session,128MB memory, 병렬 build worker0개를 사용한다. 유효성을 확인한 뒤 `--retire-full-index --apply`로 이전 전체 인덱스를 CONCURRENTLY 제거하고 retirement migration을 기록한다. 빈 사전에 IVFFlat을 미리 학습하지 않는다. 초기 full-vector HNSW build에서 운영 조회 지연을 발견해 해당 build만 취소했고, 이후 정상 조회를 확인했다. 최종 live index는350MB다.
4. 증분 처리는 beta의 `scripts/backfillExternalRoleTitleEmbeddings.ts`와 scheduled job이 같은 처리 함수를 사용한다. CLI 기본은 preview, `--apply --max-rows=N`은 최대N개의 **고유 제목**을 처리한다.
   - 2026-10-16 로컬 보완(미배포): 5분 주기, 실행당 최대10,000개/240초 범위에서 미완료 제목을 key 순서로 여러 페이지 처리한다. 기존 등록·이름 변경 trigger가 사전에 넣은 NULL embedding이 영속 대기 목록이다. 새 테이블이나 수집기별 구현은 추가하지 않는다.
   - API 일시 오류와 DB 저장 오류는 최대3회 시도한다. 저장 재시도는 이미 생성한 벡터를 재사용한다. API가 입력을 400/413으로 거부하면 해당 묶음을 나눠 문제가 있는 제목만 미완료로 남긴다. 처리 실패는 다음 실행의 재시도 대상이며, 처리 후 미완료 건수·오류를 로그와 응답에 남긴다(미완료/오류는 HTTP503).
   - 같은 제목은 기존 벡터를 재사용하고 저장 시 key·원문·NULL 조건을 확인한다. 동시 실행의 중복 저장은 막지만 중복 API 호출 비용까지 막는 lease는 없다. 실행 중 cursor 이전에 들어온 제목은 다음 실행에서 처리한다. 외부 API 장애 중에는 빈 값이 남을 수 있고, 정상 복구 후 재시도한다. 등록 즉시 임베딩 완성을 보장하는 구조는 아니다.
   - 2026-10-16 08:29 KST 운영 보완: 미완료405개 제목을7.5초에 생성·저장했고 직후 전체/활성 제목 미완료0건을 확인했다. 예전 `company_roles.title_embedding`의 NULL은 V2 누락 판정 기준이 아니며 `external_role_title_embeddings`에서 확인한다. 기존 트리거와 시간당 실행은 이미 운영에 있었고 5분 주기 변경은 아직 배포하지 않았다.
5. Web의 credential/INTERNAL_WORKER_API_SECRET/CRON_SECRET/provider 설정을 확인하고 명시적 배포 요청 후 Git-triggered web 배포를 한다. Queue topic/5분 dispatcher/5분 embedding job이 포함된다. 공유 API 준비 후 worker를 기존6개 인스턴스 rolling 절차로 배포한다.
6. [평가 registry](evaluation/external-recommendations-v2/README.md)와 read-only A/B report로 확인한다. cold/warm cache와 provider를 나누어 비교한다. SQL plan·fit 캐시·summary 공유 때문에 장기 warm 효과가 생긴다.

경로 변경은 여러 단계의 시간을 포함하므로 end-to-end 운영 p50/p95와 사용자 행동이 최종 근거다. 작은 synthetic 모델 호출 비용/속도는 운영 200/500개 전체 비용·품질의 증거가 아니다.

V2 planner prompt는 `prompts.ts`에 직접 정의하며, 국가 조건은 `countries`로 표현하고 `locations` 필드는 출력·반환하지 않는다. `legacyPlanner.v1.json`은 과거 prompt 보존본이다. 웹 채팅의 비동기 bulk 요청도 실행 장소와 관계없이 웹 예산(평가200개·요약 한 번)을 따른다.

실데이터 반복 실행·500개 평가·DB 작업 결과는 [운영 표본 검증 기록](evaluation/external-recommendations-v2/results-production-pilot-2026-10-14.md)에 있다. 로컬 검증과 실제 합성 API 호출 결과는 [2026-10-14 검증 기록](evaluation/external-recommendations-v2/results-2026-10-14.md)에 있다. DB 적용·backfill 이후 실제 인증·queue를 포함한 배포 후 smoke check와 온라인 측정은 별도로 필요하다.

2026-10-14 점수/국가 비율 변경의 실제 API·검색 검증은 [국가·점수 계약 검증 기록](evaluation/external-recommendations-v2/results-country-score-contract-2026-10-14.md)에 기록한다.

Worker 탐색 가설의 연결 누락·복원과 실제 planner→rerank→최종 안내 검증은 [worker 탐색 가설 검증 기록](evaluation/external-recommendations-v2/results-worker-hypothesis-2026-10-14.md)에 기록한다.

강한 충돌과 일반 fit 차이의 실제 제공자별 점수는 [필수조건 경계 검증](evaluation/external-recommendations-v2/results-strong-constraints-2026-10-14.md)에 기록한다.
