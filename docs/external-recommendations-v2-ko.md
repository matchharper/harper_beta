# External 추천 V2 — 구현 및 적용 안내

문서 기준: 2026-10-15. DB 구조와 제목 embedding은 운영에 적용했다. 애플리케이션과 worker 코드는 아직 배포하지 않았다. 실제 검증 결과·한계는 평가 registry에 기록한다.

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
4. 증분 처리는 beta의 `scripts/backfillExternalRoleTitleEmbeddings.ts`와 hourly job이 같은 사전 RPC를 사용한다. CLI 기본은 preview, `--apply --max-rows=N`은 최대N개의 **고유 제목**을 처리한다.
5. Web의 credential/INTERNAL_WORKER_API_SECRET/CRON_SECRET/provider 설정을 확인하고 명시적 배포 요청 후 Git-triggered web 배포를 한다. Queue topic/5분 dispatcher/시간당 embedding job이 포함된다. 공유 API 준비 후 worker를 기존6개 인스턴스 rolling 절차로 배포한다.
6. [평가 registry](evaluation/external-recommendations-v2/README.md)와 read-only A/B report로 확인한다. cold/warm cache와 provider를 나누어 비교한다. SQL plan·fit 캐시·summary 공유 때문에 장기 warm 효과가 생긴다.

경로 변경은 여러 단계의 시간을 포함하므로 end-to-end 운영 p50/p95와 사용자 행동이 최종 근거다. 작은 synthetic 모델 호출 비용/속도는 운영 200/500개 전체 비용·품질의 증거가 아니다.

기존 planner prompt는 `legacyPlanner.v1.json`에 복사해 보존하고 V2 변경을 그 위에 적용한다. 웹 채팅의 비동기 bulk 요청도 실행 장소와 관계없이 웹 예산(평가200개·요약 한 번)을 따른다.

실데이터 반복 실행·500개 평가·DB 작업 결과는 [운영 표본 검증 기록](evaluation/external-recommendations-v2/results-production-pilot-2026-10-14.md)에 있다. 로컬 검증과 실제 합성 API 호출 결과는 [2026-10-14 검증 기록](evaluation/external-recommendations-v2/results-2026-10-14.md)에 있다. DB 적용·backfill 이후 실제 인증·queue를 포함한 배포 후 smoke check와 온라인 측정은 별도로 필요하다.

2026-10-14 점수/국가 비율 변경의 실제 API·검색 검증은 [국가·점수 계약 검증 기록](evaluation/external-recommendations-v2/results-country-score-contract-2026-10-14.md)에 기록한다.

Worker 탐색 가설의 연결 누락·복원과 실제 planner→rerank→최종 안내 검증은 [worker 탐색 가설 검증 기록](evaluation/external-recommendations-v2/results-worker-hypothesis-2026-10-14.md)에 기록한다.

강한 충돌과 일반 fit 차이의 실제 제공자별 점수는 [필수조건 경계 검증](evaluation/external-recommendations-v2/results-strong-constraints-2026-10-14.md)에 기록한다.
