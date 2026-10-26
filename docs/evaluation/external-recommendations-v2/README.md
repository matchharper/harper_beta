# External recommendation V2 comparison

## 2026-10-26 최종 선정 변경 (로컬·미배포)

사용자 요청으로 V2 최종 선정은 요약이 있는 상위25개를 입력하고 Luna reasoning high를 사용한다. 구조 재시도도 같은 설정이며 추론·출력 여유를 위해 토큰 상한은32,768이다. 검색 계획·중립 요약은 기존 low, 공유 함수를 이용하는 V1 daily cache 선정은 기존20개/low를 유지한다. 가중치는 변경하지 않았다. 웹·Worker 측정 버전은 `weighted-country-employment-rerank25-high-2026-10-26-v1`로 함께 변경해 기존 측정과 구분한다.

[실제 저장 점수의 6개 가중치 비교](../external-v2-weight-replay/README.md)는 새로운 LLM 호출 없이 복원 가능한125개 실행을 재정렬했다. 이는 high 선정 모델의 실제 품질 검증이 아니다. 관련 engine 테스트19개 통과, 배포·운영 데이터 쓰기 없음.

## 2026-10-15 현재 연봉 검색 계약

Opportunity quality score 생성/필드/가중치는 제거했다. 현재 planner는 annual KRW salary target을 반환하며 초기 SQL만 연봉 만족도를 사용한다. Fit 가중합에는 보너스가 없다. Control/V2 모두 공유 salary cache를 채우고 예측 급여는 LLM 입력에서 제외한다. 현재 검색 version은 `external-search-v2-salary-v1`; 옛 default는 다시 계획한다. DB boolean/칼럼 제거와 salary RPC/공통 utility는 적용했지만 코드와 예측값 persistence는 배포 승인을 기다린다.

[연봉 순위 평가](../external-role-salary-retrieval/README.md)와 [추정 task](../company-role-salary-estimation/README.md)가 정본이다. 아래 v1–v4의 quality 관련 설명/명칭은 당시 frozen 평가 기록이며 현재 runtime 기능이 아니다. 기존 fixture/gold/results는 변경하지 않는다.

## 목적과 평가 단위

기존 external 검색·평가·선택을 대조군으로 유지하고, 후보자별 고정 50:50 V2의 비용·시간·추천 결과를 비교한다. Behavior Context 자체의 cohort가 아니며 모든 worker production V2 orchestration은 기존 Profile + 전체 Brief + 동일 Behavior version 계약을 유지한다.

오프라인 단위는 동일 후보자 × 최대 10개 역할 × 제공자 × 반복이다. 온라인 단위는 추천 실행과 실제 저장된 추천 노출이다. 역할 수가 달라질 수 있으므로 실행당 비용과 추천 1개당 비용을 함께 본다.

## Frozen input / gold / provenance

`cases-v1.json`, `gold-v1.json`, `manifest-v1.json`은 개인정보 없는 synthetic v1이다. 기존 external-fit-playground v2의 8가지 비교 상황을 production V2 회사/JD projection으로 변환했다. 가장 큰 동일 후보자 묶음은 동일 근거의 합성 회사 변형으로 10개를 채웠다. 원래 dataset/gold는 수정하지 않았다. Gold는 모델 실행 전 작성된 Codex rubric이며 독립 human label이나 실제 관심확률 정답이 아니다. 내용/정답 변경 시 v2를 만들고, 모델·provider·prompt 변경만으로 fixture를 덮어쓰지 않는다.

`control-rerank-prompts.v1.json`은 시작 시 worker rerank prompt를 보존한 참고 snapshot이다. 실행은 해당 runtime의 실제 코드가 정본이다.

## Prompt와 canonical runner

- Runtime: `src/lib/externalRecommendationsV2/engine.ts`. Worker는 인증된 내부 endpoint로 같은 코드를 사용하고, worker의 orchestration/liveness/최종 배달은 기존 경로를 유지한다.
- 질문: `fitQuestions.v1.json`은 playground v4의 보존본이고, `fitQuestions.v2.json`은 이를 복사해 공통 0–100 단위와 의미 기반 필수조건/조건부 허용 기준을 추가했다. 현재 `fitQuestions.v3.json`은 v2를 보존한 채 복사하여 강한 충돌과 일반 직무/연차 차이를 구분한다. Provider-native predicate/noul은 ×100, score [0,4]는 ×25로 변환한다. raw는 원래 단위로 보존한다. 평가 버전은 `external-fit-questions-v6-strong-constraints`이며 이전 충돌 판단 기준의 캐시는 재사용하지 않는다. 기존 결과는 삭제하지 않는다. Rerank에는 점수를 소수점 첫째 자리까지 버림하여 전달하고 각 metric 의미를 설명한다.
- Scorer의 공통 근거는 Profile + 전체 Brief + 같은 Behavior Context + 명시적 이번 요청(있는 경우)이다. 회사 기본 정보·funding·investors·leadership와 원문 JD는 기존 formatter를 재사용한다. 회사 점수 `company_score`는 V2 입력/랭킹에 없다.
- `scripts/evalExternalRecommendationsV2.ts`는 실제 `buildScoringInput`과 `callDecisions`를 import한다. DB 읽기/쓰기, 추천, 연락, usage DB 쓰기를 하지 않는다. `--dry-run`은 외부 호출도 하지 않는다.

```sh
node --env-file=.env.local --import tsx scripts/evalExternalRecommendationsV2.ts --provider=both --dry-run
node --env-file=.env.local --import tsx scripts/evalExternalRecommendationsV2.ts --provider=both --repeats=1
node --env-file=.env.local --import tsx scripts/evalExternalRecommendationsV2.ts --provider=both --stages
```

모든 run은 새 owner-only `runs/<timestamp>/`에 입력·prompt/소스 hash·Git revision/dirty 상태·모델 설정·각 응답/usage·실패를 보존한다. API key는 기록하지 않는다. 운영 표본을 추가하는 경우 read-only capture, `private/` 또는 `runs/`만 사용하고 파일 0600/폴더 0700을 지킨다.

## 모델과 실행 계약

- OpenAI Decisions: `/v1/decisions`, `gpt-6-luna`. 일반 Responses의 reasoning parameter를 보내지 않는다.
- Jev: OpenRouter `/api/alpha/decisions`, `typesafe/jev-1.13`, data_collection deny, fallback false.
- Scoring은 역할당 6개 질문, 최대 10역할/호출, runtime 동시 6호출, 시도당30초 timeout, 일시 오류에 같은 제공자로1회 재시도, early stopping 없음. 유효/불완전한 출력의 원본을 역할별 저장하고 불완전한 metric은 재사용하지 않는다. 한 배치 실패로 다른 배치를 중단하지 않는다.
- Provider 선택은 `EXTERNAL_FIT_V2_PROVIDER=openai|jev`; worker 내부 API에서도 지정 가능하다. 동일 provider/model/prompt + candidate context fingerprint + role evidence hash + 30일 이내 결과만 재사용한다. 전환 시 점수를 섞거나 자동 fallback하지 않는다.
- Planner, 중립 요약, rerank는 `gpt-6-luna`, reasoning low. 요약은 worker top100/10개 batch, web 누락 최대10/한 호출. 이미 있는 언어 summary는 재사용한다.

## Metrics와 release gate

구조 gate: 10개 역할×6축 coverage, identifier 검증, 부분 실패 격리, 모든 pair 저장, 기본 SQL 재사용, 캐시 무효화, 잘못된 권한 차단, expired/blocked/testOnly/중복 추천 제외, 날짜당 한 실행, 웹 summary 한 호출. Canonical local tests: `src/lib/externalRecommendationsV2/*.test.ts`와 worker adapter tests. 실제 migration은 embedded Postgres + pgvector에서 실행한다.

품질 gate: 기존 8개 ordinal checks + raw distribution 검토, 명시적 필수조건 충돌, 회사 품질의 unknown/weak 구분, 같은 근거 batch 안정성, rerank 문구의 구체성·간결성·근거. 합성 소수 표본 통과만으로 운영 우월성이나 확률 calibration을 주장하지 않는다.

온라인 비교: `scripts/reportExternalRecommendationsAb.ts` (SELECT만). 표면(worker/web/daily)·cohort·scoring provider를 분리하여 실행/성공/실패/0개 비율, p50/p95 시간, 캐시 hit/새 평가 수, LLM 호출, 확인된 비용, 미확인 비용, 추천 클릭/저장/지원/피드백을 비교한다. 최소 1주일 및 각 군의 충분한 노출·행동 표본이 생긴 뒤 후보자 단위 신뢰구간을 보고 확장 여부를 판단한다. 추천 수가 줄어서 싸진 경우를 개선으로 보지 않는다. 초기값은 측정 후 새 실험 버전에서 조정한다.

## 실행·운영 문서와 한계

[`docs/external-recommendations-v2-ko.md`](../../external-recommendations-v2-ko.md)에 검색 결합·점수·일일 작업·설정·적용 순서를 기록한다. 아직 배포되지 않은 코드다. 운영 DB migration과 제목 embedding backfill은 이번 사용자 승인으로 실행했다. 애플리케이션/worker 배포와 온라인 노출 측정은 남아 있다.

정량 fit은 완전히 calibrated probability가 아니다. 새 품질 점수는 근거 기반 임시 index이며 채용 가능성/인간 가치 점수가 아니다. 온라인 A/B는 후보자 수와 노출 편차, 기본 쿼리·요약 cache의 warm/cold 차이, provider 변경과 업무 부하의 영향을 받는다. provider 응답이 유실된 호출의 과금은 알 수 없으므로 0으로 확정하지 않는다. Worker 전체 비용에는 internal/orchestration/배달 비용이 포함되므로 external 단계 비용과 구분한다.

## 현재 검증 결과와 로컬 재현

[2026-10-14 검증 기록](results-2026-10-14.md)에 첫 실패, 입력 수정, 재실행 결과와 미검증 범위를 기록했다. `--stages`는 실제 planner/제목 embedding/웹 summary 한 번/rerank를 합성 입력으로 실행한다. DB를 사용하지 않고 stage별 원문·응답 metadata는 owner-only run 파일에 보존한다.

```sh
OPENAI_API_KEY=local-test-only NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-test-only node --import tsx --test src/lib/externalRecommendationsV2/*.test.ts
cd ../harper_worker
python3 -m unittest tests.test_external_recommendations_v2
```

## Production pilot (read-only)

`review-rubric-live-v1.json`을 모델 실행 전에 고정했다. `scripts/evalExternalRecommendationsLive.ts --count=3`는 경험·활성 Brief·Behavior가 있는 external 추천 가능 후보자를 실행 seed와 UUID hash로 임의 추출한다. GET-only Supabase reader와 worker의 `llm_evals/external_recommendations_v2/read_only_capture.py`(canonical `connect_read_only`)를 통해 캡처한다. 실제 engine의 dryRun을 사용하며 추천/기본 쿼리/fit/summary/usage DB 쓰기와 연락은 하지 않는다. 두 제공자는 첫 실행에서 고정한 동일 context·plan·역할 근거를 사용한다. 첫 실행 검색/캡처 시간이 포함되므로 제공자 간 전체 시간의 직접 비교는 하지 않고 stage별 시간을 본다.

`--frozen=<private frozen-cases.json>`으로 입력을 바꾸지 않고 새 run을 만든다. `--worker`는 500역할/100요약 runtime 예산을 적용한다. 실데이터·원문 출력·원본 ID는 ignored `runs/` 0600/0700에만 둔다. committed rubric은 비식별이며 개별 실제 후보자의 fit 정답을 주장하지 않는다. 변경된 표본은 새 frozen capture version으로 보존한다.

`production-pilot-v2`는 첫 run의 모델 실행 전 context/plan/candidate trace에서 복원한 owner-only frozen 입력이다. v1 runner의 메모리 참조가 첫 제공자가 생성한 요약을 다음 제공자 입력에도 재사용한 점을 발견해, 캡처 시 deep copy하도록 수정했다. v1 출력은 보존했으며 v2 입력은 `private/production-pilot-v2/`에 별도 보존한다. `scripts/evalExternalRecommendationsRerank.ts --run=<private completed run>`은 해당 run의 점수·요약을 고정하고 실제 최종 선택 함수만 새 prompt로 재실행한다. 최종 runtime은 rerank에 회사/JD 원문을 전달하지 않는다. 이전 원문 포함 실험은 과거 run으로 보존하며 최종 입력 계약의 검증으로 간주하지 않는다. 원문/요약의 필수조건 누락, 명시적 제외, 현재 거주지를 제약으로 오해하는지 검토하며 추가 DB 접근은 하지 않는다.

## Retrieval / bulk 재현

2026-10-16 정리: 아래 제목 사전 bulk 절차는 과거 결과 재현의 설명이다. 사전 전용 Worker 스크립트는 제거했으며 현재 검색은 `company_roles.title_embedding`을 사용한다. 누락 복구는 Worker `scripts/generate_missing_role_title_embeddings.py`가 담당한다. 과거 frozen 입력·결과·마이그레이션은 보존한다. 사용자 승인으로 웹 배포 없이 운영 사전과 함수 4개를 migration `20261016110600`으로 삭제했다. 기존 Ops 사전 선택지는 코드 정리 배포 전까지 실패한다.

`scripts/evalExternalRecommendationsRetrieval.ts --frozen=<private frozen-cases.json>`은 동일 제목 vector와 계획을 운영 read-only 연결에서 EXPLAIN ANALYZE로 재생한다. statement timeout30초, private SQL/plan/오류 receipts와 source hash를 남긴다. `scripts/evalExternalRecommendationsLive.ts --sample=<private sample.json>`은 같은 임의 추출 후보자를 최신 전체 사전으로 다시 검색해 새 capture version을 만든다. 기존 frozen dataset이나 gold를 덮어쓰지 않는다.

대량 제목 저장의 정본은 worker `scripts/backfill_external_title_embeddings.py`, CONCURRENTLY 인덱스 생성은 `scripts/build_external_title_index.py --live --apply`이다. 전체316,958개 원본 vector는 full precision을 유지한다. 활성 제목89,292개의 half precision IVFFlat128 lists/12 probes, 최대48 probes를 사용한다. 역할 lifecycle trigger가 활성 제목 수를 유지한다. 같은 검색 제목마다1000이웃을 가져와 국가별 가용 역할 중 web400/worker1000개까지 FTS를 결합하며 미임베딩 역할은 별도 FTS로 포함한다. 초기 전체 제목 인덱스는 `--retire-full-index --apply`로 제거했다. 작은 환경에서는 먼저 backfill을 완료하고 index를 학습해야 한다. 생성 중 기본 API 지연을 함께 관찰한다. 운영 배포와는 별도 작업이다.

실데이터 반복 평가, 500개 worker 평가, 최종 DB 상태와 한계는 [운영 표본 검증 기록](results-production-pilot-2026-10-14.md)에 정리했다. 배포·온라인 A/B 검증 완료를 뜻하지 않는다.


## 2026-10-14 국가 비율·점수 단위 변경 검증 계약

합성 cases/gold v1은 그대로 보존하고 새 prompt run을 만든다. 기존 8개 ordinal 비교에 더해 동일 hard-conflict의 constraintPass≤50, quality-strong의 constraintPass>50을 기록한다. 기본 점수에 constraintPass≤50이면 `0.2 × (constraintPass/50)^2`를 곱하는 비선형 감점을 적용한다. 모든 fit 결과는 저장한다.

검색 계획 버전 `external-search-v2-country-weights-v1`은 countries의 ISO alpha-2/양수 weight/remoteOnly를 검증한다. 예전 default는 다음 planner에 문맥으로 제공하지만 즉시 재사용하지 않는다. 단위 테스트는 default reuse/explore/replace와 예전 버전 갱신, 실제 Postgres의 KR80%/US20% 200·500개, 국가 정확 일치·국가별 remoteOnly·부족분 재배분을 검증한다. ANN 조회는 공유하고 DB 왕복은 한 번이다. 가장 가까운 제목 1000개/검색 제목 내에서 국가별 pool을 구성하므로 특정 국가의 전체 검색 재현율을 보장하지 않는다. 국가코드 null은 검색에서 제외된다.

국가 비율을 추가한 운영 검색 실험은 기존 private frozen input을 복사한 새 version과 provenance를 만들어 read-only로 실행한다. 기존 캡처를 덮어쓰지 않으며 검색 결과가 실제 추천된 것으로 보고하지 않는다.

`cases-v2.json`/`gold-v2.json`/`manifest-v2.json`은 v1의 합성 회사·역할 근거를 바탕으로 국내 출근 허용/해외는 한국 원격만 허용의 한국어 Brief를 추가한 3역할 별도 버전이다. v1을 덮어쓰지 않는다. `--dataset=v2 --provider=both --stages`로 실제 점수 경계 3개, ordinal 2개 및 국가별 planner 조건·최종 선택을 확인한다. `scripts/evalExternalRecommendationsRetrieval.ts --rows`는 같은 read-only 경로에서 실제 결과와 국가별 개수를 private run에 기록한다.

최신 점수 단위·국가 비율·조건부 해외 근무의 변경/실패/보강/재검증은 [국가·점수 계약 검증 기록](results-country-score-contract-2026-10-14.md)을 따른다.

## Worker 탐색 가설 복원 — frozen v3

변경 이유·자동 검증·실제 모델 출력·실패와 한계는 [worker 탐색 가설 검증 기록](results-worker-hypothesis-2026-10-14.md)을 따른다.

`cases-v3.json`/`gold-v3.json`/`manifest-v3.json`은 합성 ML 경력·운영 업무 거절 근거·최근 탐색2건을 가진 worker와 같은 근거에 명시적 웹 요청을 추가한 대응 사례다. 평가 단위는 계획→선택→worker 전달이며 v1/v2는 보존한다. `scripts/evalExternalRecommendationsV2.ts --dataset=v3 --provider=openai --stages --stage-batch=0`은 worker, batch1은 web을 검증한다. 두 제공자 fit 계약은 기존 frozen v1/v2와 공통 단위 테스트로 검증한다. 모델/low 설정은 runtime 그대로이며 fit provider만 명시한다. Stage 결과의 `workerCards`와 실제 plan은 worker 소유 `llm_evals/external_recommendations_v2/delivery_replay.py --stage-run=<run directory>`가 기존 최종 prompt/projection/LLM/normalizer를 통해 메일 초안으로 재생한다. DB 조회·쓰기·메일 발송 없이 생성된 원문은 registry의 ignored runs/에0700/0600으로 저장한다. 가설의 불확실성·근거 보존, 무응답을 거절로 오해하지 않음, 실제 자격/명시적 조건 우선, 웹 자율 전환 없음과 선택 ID 보존을 원문으로 검토한다. 작은 합성 사례이며 운영 품질·가설의 사용자 반응 검증은 아니다.

## 강한 필수조건 충돌 — frozen v4

실제 제공자별 경계 점수와 검증 범위는 [강한 필수조건 검증 기록](results-strong-constraints-2026-10-14.md)에 기록한다.

`cases-v4.json`/`gold-v4.json`/`manifest-v4.json`은 합성 후보자1명×역할10개의 경계 challenge다. 일반적인 인접 직무·2년 연차 차이·새 기술 스택·미공개 보상은 constraintPass>50, 명시적 원격/일정/최저보상 위반과 예외적으로 큰 임원 책임 격차·필수 면허 부재는 ≤50을 기대한다. 낮은 직무 적합도를 자동으로 hard conflict로 취급하지 않는지 확인한다. 기존 v1/v2/v3 입력·gold는 유지한다. 입력/라벨은 실제 모델 호출 전에 동결한 Codex rubric이며 독립 human labels가 아니다.

정본 실행은 `node --env-file=.env.local --import tsx scripts/evalExternalRecommendationsV2.ts --dataset=v4 --provider=both`다. 기존 실제 입력 formatter/두 Decisions adapter/공통 점수 정규화를 사용한다. OpenAI gpt-6-luna와 Jev1.13 설정은 위와 같고 새 prompt는 `fitQuestions.v3.json`, cache version은 `external-fit-questions-v6-strong-constraints`다. 역할별6축 coverage, 경계10개와 capability ordinal2개를 각 제공자에서 확인하고 원문 점수를 검토한다. 기존 조건부 해외 근무 frozen v2도 회귀 실행한다. DB 읽기/쓰기·추천·발송 없이 합성 입력만 전송하고 원문/소스 hash/usage는 ignored owner-only runs에 남긴다. 작은 경계 표본이며 실제 추천률·확률 보정·전체 seniority 사례를 보장하지 않는다.


## 2026-10-18 공통 텍스트 입력·지침 중복 제거 (로컬 변경)

V1은 Worker `opp/matching/text.py:external_scoring_input`을 실제 provider 전송 경계에서 사용한다. V2는 같은 Worker formatter 계약의 TypeScript 구현 `workerInputText.ts`를 사용하며 Python과 출력 일치 테스트를 둔다. 각 경로가 기존에 제공하던 사실은 보존한다. V1/V2의 기존 회사·공고 projection 자체가 동일하다는 뜻은 아니다. V2는 회사별로 정보를 한 번 적고 공고들을 묶으며, formatter에서 회사/JD 원문을 자르지 않는다.

`fitQuestions.v4.json`은 v3의 모든 공통 지침을 shared input으로 한 번 이동한다. `commonInstructions + 각 instructions`가 v3 원문과 완전히 같고 criteria/type도 같은지 검증한다. 6축×역할별 질문 계약은 유지한다. 기준 버전은 유지하지만 role source hash는 실제 새 scoring 근거 전체를 반영하므로, 배포 후 기존 V2 fit cache는 새 hash로 재평가될 수 있다. 배포는 수행하지 않았다.

3개 공고의 전체 입력은 [v2-input.txt](reports/2026-10-18-scoring-input/v2-input.txt), 전체 API payload는 [v2-request.json](reports/2026-10-18-scoring-input/v2-request.json), V1은 [v1-input.txt](reports/2026-10-18-scoring-input/v1-input.txt)와 [v1-system.txt](reports/2026-10-18-scoring-input/v1-system.txt)에 있다. frozen synthetic cases-v2의 batch0만 사용하며 운영 개인정보는 없다. fixture hash와 구/신 입력은 analysis-input.json에 보존한다.

재현: beta에서 `WORKER_PYTHON=../myenv/bin/python node --import tsx scripts/inspectExternalScoringInput.ts`를 실행한 뒤, tiktoken이 설치된 Python으로 Worker `scripts/count_external_scoring_input.py`에 생성된 analysis-input.json 경로를 넘긴다. 정본 입력 생성기는 각 runtime builder를 호출하며 API/DB에 접근하지 않는다. o200k_base 로컬 추정은 V1 2,842→2,900(+2.04%), V2 11,387→7,927(-30.39%)다. 항목별 토큰/비중은 token-breakdown.json에 있다. 텍스트화 자체가 항상 토큰 절감을 보장하지 않으며, 짧은 합성 입력의 비중을 운영 평균으로 일반화하지 않는다. API 내부 질문 변환/overhead는 로컬 계산에 포함되지 않는다.

실제 OpenAI 검증은 기존 canonical runner `scripts/evalExternalRecommendationsV2.ts --dataset=v2 --provider=openai`와 `--dataset=v4 --provider=openai`로 실행했다. 모델은 runtime gpt-6-luna, 입력과 gold는 기존 frozen 버전 그대로다. 3역할 run `2026-10-17T22-26-37-802Z`는 유효3/3, ordinal2/2, 조건경계3/3, API input9,566/output0이었다. 10역할 run `2026-10-17T22-26-37-803Z`는 유효10/10, ordinal2/2, 조건경계10/10, API input30,675/output0이었다. 원문 출력·manifest·usage는 ignored owner-only runs/에 보존한다. 3역할 API total9,566과 로컬7,927은 서로 다른 측정이며 항목별 실제 과금량은 API가 제공하지 않는다. Jev는 요청 계약만 검증했고 실제 모델 호출은 하지 않았다. 작은 합성 경계 검증이며 운영 추천 품질 보장은 아니다.

관련 단위 검증: beta scoringInput/contract/engine 29개, Worker provider boundary/cache 63개 통과. V1은 전송 직전 텍스트와 기존 사실 보존을 검증했으며 이번 변경으로 실제 V1 모델 비교 평가를 새로 수행하지 않았다.


## 2026-10-18 6축 rubric 공유 입력 (후속 로컬 변경)

공식 Decisions create 명세(https://developers.openai.com/api/reference/resources/decisions/methods/create)는 input message의 developer/user 역할과 score levels/choice choices의 optional description을 지원한다. 현재 OpenAI 요청은 developer 메시지 한 개에 공통 지침과 6축 전체 지침·기준을 한 번씩 넣고, user 메시지 한 개에 기존 후보자·회사·공고 원문을 넣는다. 질문에는 role_id·rubric 참조·응답 해석 연결, name/type과 필요한 label/value만 남긴다. Jev는 기존 state.evidence에 전체 rubric을 한 번 넣고 필수 criteria 구조에는 해당 rubric 항목 참조를 둔다. 모든 원래 instructions/criteria가 공유 입력에 정확히 한 번 존재하며 질문마다 복제되지 않는지 테스트한다. 기준 원문·gold·점수 후처리·캐시 평가 버전은 변경하지 않는다. V1은 이번 후속 변경 대상이 아니다.

첫 시도에서는 OpenAI string input에 rubric과 근거를 함께 넣었고, 10역할 사례의 extreme-responsibility-gap을 constraintPass97로 잘못 통과시켰다(22-32-56-019Z, 2회 동일). 참/거짓 연결만 명시한 후에도95로 실패했다(22-33-14-566Z). 이 실패 run들을 삭제하지 않았다. 사례별 예외나 평가 기준을 추가하지 않고 rubric을 developer 역할, 근거를 user 역할로 구분한 후 통과했다. 마지막으로 질문별 공통 연결 설명까지 공유 지침으로 옮긴 최종 코드의 결과만 아래에 기록한다. 초기 단순 string 입력 방식은 채택하지 않는다.

최종 canonical runner는 기존 `scripts/evalExternalRecommendationsV2.ts`이며 v2/v4는 `--provider=both --repeats=2`, v1은 `--provider=openai`로 실행했다. frozen cases/gold 변경 없음, 실제 API 호출만 있고 DB/추천/연락 없음. 최종 runs는 v2 `2026-10-17T22-34-12-411Z`, v4 `2026-10-17T22-34-06-857Z`, v1 `2026-10-17T22-34-13-262Z`다. OpenAI/Jev 각각 v2 조건경계3/3·순위2/2와 v4 조건경계10/10·순위2/2를 두 반복 모두 통과했다. OpenAI v1은 유효13/13·순위8/8·조건경계2/2다. 원문 점수 검토에서도 회사 quality strong/weak/unknown을 구별하고 일반 기술·연차 차이는 roleFit을 낮추되 constraintPass로 차단하지 않으며, 원격·일정·최저보상·필수자격 충돌은 차단했다. 동일 근거 변형의 evidence가 sufficient/partial로 갈리는 변동은 남아 있다. 작은 frozen 합성 표본이며 운영 정확도·확률 calibration을 보장하지 않는다. 관련 단위 테스트30개 통과.

실제 OpenAI usage 비교(같은 frozen 입력, 이전 일반 공통 지침만 중복 제거한 버전 대비): 3역할9,566→6,369토큰(-33.42%), 10역할30,675→15,795토큰(-48.51%). 최종 두 반복의 각 usage는 같았다. output_tokens는0. 캐시 할인 추정이 아니라 API가 반환한 input_tokens 비교다. 입력 메시지·질문의 내부 표현 때문에 로컬 추정과 총량은 다르다.

새 전체 요청·텍스트·항목별 토큰·검증 요약은 [후속 report](reports/2026-10-18-scoring-input-shared-rubrics/v2-request.json)에 있다. 기존 report는 비교 기준으로 보존한다. 입력 재현 스크립트는 기존 `scripts/inspectExternalScoringInput.ts`이며 API를 호출하지 않고 이전 report를 baseline으로 읽는다. 모듈 초기화에는 dummy OPENAI_API_KEY와 로컬 Supabase URL/anon key를 설정한다. 새 o200k_base 추정3역할은7,927→4,539(-42.74%); 공통 지침228, 6축 rubric1,772, 후보자306, 회사+공고314/325/333, 질문 구조·연결1,205, 추가 공통 연결문·구분자56이다. 질문 부분은6,405→1,205(-81.19%). 원문·token-breakdown.json·validation-summary.json은 모두 합성 데이터이며, API raw outputs/manifest는 ignored owner-only runs/에만 둔다. 배포하지 않았다.

## 2026-10-19 실제 10공고 입력 축약 smoke

Canonical runner: `scripts/evalExternalCompactRequest.ts` (`node --env-file=.env.local --import tsx scripts/evalExternalCompactRequest.ts`). 이전에 읽기 전용으로 재구성한 실제 후보자 1명·공고 10개의 고정 요청을 입력으로 사용한다. 기존 요청과 빈 값/HTML 정리 + 짧은 role alias + 질문 중복 설명 제거 요청을 각각 gpt-6-luna Decisions에 1회 전송하며 자동 재시도하지 않는다. 전체 평가 기준과 60개 typed 출력 계약은 보존한다. 실행 전 request SHA256과 구조 기대값을 manifest에 동결한다. 모든 입력·원문 응답·원본 ID·과거 저장 결과·manifest는 ignored owner-only `runs/*-compact-real/`에만 보존한다. DB 읽기/쓰기·usage 저장·추천·연락은 수행하지 않는다.

구조 gate는 공고10개×6축 반환, 중복/알 수 없는 이름0개, 실제 production parser 통과10개다. 동일 시점 기존 요청 대비 점수·constraintPass50 경계·mutualFit60 경계 변화를 확인한다. 독립적인 적합도 정답은 없으며 과거 저장 결과도 gold가 아니다. 단일 후보자/각1회 표본이고 기존 요청 자체도 과거 wire capture가 아니므로 품질 동등성이나 배포 승인으로 해석하지 않는다. 개인정보 없는 구조 gold는 이 절의 기대값이며 기존 frozen fixture/gold를 변경하지 않는다.

실행 `2026-10-19T08-06-30-440Z-compact-real`: 기존/축약 모두 응답60개·유효10역할·중복/unknown/누락0. 실제 API 입력41,741→35,690(-14.50%), 출력0. 단일 호출 시간3,782/832ms는 속도 우월성 근거가 아니다. 필수조건 통과 점수가92→23으로 바뀐 pair가1개 있어 constraintPass50 경계 일치9/10이며, mutualFit60 경계는 모두 미달로10/10 일치했다. 구조 smoke는 통과했으나 품질 동등성은 확인하지 못했다. 어느 변환의 효과인지 또는 모델 자체 변동인지 분리하지 않은 2개 요청 비교이며 배포하지 않았다.

후속 분리 실행: `scripts/evalExternalCompactRequest.ts --restore-questions`는 동일 snapshot의 `request-after.json`만 1회 전송한다. 빈 항목/HTML 정리는 유지하고 질문60개를 기존 원문으로 복원하며 연결된 본문 role UUID도 함께 복원한다. 실행 전 축약본과 비교해 evidence 차이가 role 식별자뿐이고 questions가 기존 요청과 동일함을 검증한다. 새 run에 보존하며 기존 응답은 재실행하거나 덮어쓰지 않는다. 구조 gate·privacy·품질 한계는 위 계약과 같다.

질문 원복 run `2026-10-19T08-10-32-090Z-compact-real`: 60응답/10유효 역할, 누락·중복·unknown0. 실제 입력37,962토큰(최초41,741 대비9.05% 감소, 축약35,690 대비2,272 증가). 동일 JD 3개 constraintPass는71/52/63으로 모두 통과해 직전23/14/92의 경계 불일치는 해소됐다. 다만 단일 실행이며 모든 점수의 안정성/품질 동등성을 입증하지 않는다. 결과는 private run에만 보존, 배포/DB 저장 없음.
